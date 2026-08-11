import { and, asc, desc, eq } from "drizzle-orm";
import {
  characters,
  crewMembers,
  relationshipMoments,
  relationships,
  type RelationshipMomentRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  detectMoment,
  isValidResponse,
  momentDetail,
  momentOptions,
  momentTitle,
  responseInteraction,
} from "@music-rpg/simulation";
import {
  RELATIONSHIP_DIMENSIONS,
  RELATIONSHIP_ENGINE_VERSION,
  err,
  ids,
  ok,
  type MomentResponse,
  type MomentView,
  type RelationshipState,
  type Result,
} from "@music-rpg/shared";
import { contextNow, track as trackAnalytics, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

/**
 * Moments: surfacing them, and answering them.
 *
 * Two commands with a hard line between them. Surfacing writes a question and
 * changes nothing else — no dimension moves when a moment appears, because a
 * moment is an invitation rather than a consequence. Answering is where the
 * consequence lives, and it goes through the same canonical event and the same
 * fold as everything else, so the response is priced by the derivation rather
 * than by this file.
 *
 * A surfaced moment is persisted immediately. It is never recomputed on read,
 * which is what stops a refresh from rerolling whether it exists.
 */

function stateOf(row: Record<string, unknown>): RelationshipState {
  return Object.fromEntries(
    RELATIONSHIP_DIMENSIONS.map((dimension) => [dimension, Number(row[dimension] ?? 0)]),
  ) as RelationshipState;
}

export type SurfaceMomentsResult = {
  surfaced: RelationshipMomentRow[];
  /** Already-open moments, left exactly as they were. */
  existing: RelationshipMomentRow[];
};

/**
 * Look at every relationship and write down anything that now has something to
 * say.
 *
 * Idempotent by the partial unique index: a person with an unresolved moment
 * gets no second one, so running this on every page load is safe and produces
 * the same screen every time.
 */
export async function surfaceRelationshipMoments(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<SurfaceMomentsResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const [relationshipRows, openRows, crewRows] = await Promise.all([
    ctx.db.select().from(relationships).where(eq(relationships.careerId, career.id)),
    ctx.db
      .select()
      .from(relationshipMoments)
      .where(
        and(eq(relationshipMoments.careerId, career.id), eq(relationshipMoments.status, "OPEN")),
      ),
    ctx.db
      .select()
      .from(crewMembers)
      .where(and(eq(crewMembers.careerId, career.id), eq(crewMembers.status, "ACTIVE"))),
  ]);

  const surfaced: RelationshipMomentRow[] = [];
  const now = contextNow(ctx);

  for (const relationship of relationshipRows) {
    // One unresolved thing per person. Anything else is noise.
    if (openRows.some((moment) => moment.subjectId === relationship.subjectId)) continue;

    const detection = detectMoment(stateOf(relationship), {
      isCrew: crewRows.some((member) => member.subjectId === relationship.subjectId),
    });
    if (!detection) continue;

    const row = await ctx.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(relationshipMoments)
        .values({
          id: ids.generic(),
          careerId: career.id,
          worldId: career.worldId,
          subjectType: relationship.subjectType,
          subjectId: relationship.subjectId,
          kind: detection.kind,
          status: "OPEN",
          // The state as it stood. Kept, not recomputed.
          triggerState: stateOf(relationship),
          triggerReason: detection.reason,
          triggeredAtSequence: relationship.derivedThroughSequence,
          engineVersion: RELATIONSHIP_ENGINE_VERSION,
          surfacedAtGameTime: career.currentGameDate,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();

      const moment = inserted[0];
      if (!moment) return null;

      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.RelationshipMomentSurfaced,
        actorType: "SYSTEM",
        targetType: relationship.subjectType,
        targetId: relationship.subjectId,
        visibility: "PRIVATE",
        importance: 50,
        occurredAt: career.currentGameDate,
        idempotencyKey: `moment:${moment.id}:surfaced`,
        payload: {
          kind: detection.kind,
          reason: detection.reason,
          // Why it appeared, preserved for the inspector.
          state: stateOf(relationship),
        },
      });

      return moment;
    });

    if (row) surfaced.push(row);
  }

  return ok({ surfaced, existing: openRows });
}

/** Open moments, ready to show. Nothing here decides anything. */
export async function getOpenMoments(
  ctx: CommandContext,
  careerId: string,
): Promise<MomentView[]> {
  const rows = await ctx.db
    .select()
    .from(relationshipMoments)
    .where(and(eq(relationshipMoments.careerId, careerId), eq(relationshipMoments.status, "OPEN")))
    .orderBy(asc(relationshipMoments.surfacedAtGameTime));

  if (rows.length === 0) return [];

  const characterRows = await ctx.db.select().from(characters);

  return rows.flatMap((moment) => {
    const character = characterRows.find((row) => row.id === moment.subjectId);
    if (!character) return [];

    return [
      {
        id: moment.id,
        kind: moment.kind,
        subjectId: moment.subjectId,
        name: character.name,
        title: momentTitle(moment.kind, character.name),
        detail: momentDetail(moment.kind),
        options: momentOptions(moment.kind),
      },
    ];
  });
}

export type RespondResult = {
  moment: RelationshipMomentRow;
  /** What answering this way was, as the derivation will read it. */
  interaction: string;
};

/**
 * Answer a moment.
 *
 * This is where the consequence lives. The response is recorded as a canonical
 * event and the relationship fold prices it — nothing here writes trust or
 * tension, which keeps derivation the single writer and makes the answer
 * explainable in exactly the same way a rejected proposal is.
 */
export async function respondToMoment(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    momentId: string;
    response: MomentResponse;
  },
): Promise<Result<RespondResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const rows = await ctx.db
    .select()
    .from(relationshipMoments)
    .where(eq(relationshipMoments.id, input.momentId))
    .limit(1);

  const moment = rows[0];
  if (!moment || moment.careerId !== career.id) {
    return err(DomainErrors.invalidInput("That moment doesn't exist."));
  }
  if (moment.status !== "OPEN") {
    return err(DomainErrors.invalidCareerState("You've already answered that."));
  }
  if (!isValidResponse(moment.kind, input.response)) {
    return err(DomainErrors.invalidInput("That isn't one of your options."));
  }

  const interaction = responseInteraction(input.response);
  const now = contextNow(ctx);

  const resolved = await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(relationshipMoments)
      .set({
        status: "RESOLVED",
        response: input.response,
        resolvedAtGameTime: career.currentGameDate,
        updatedAt: now,
      })
      .where(eq(relationshipMoments.id, moment.id))
      .returning();

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.RelationshipMomentAnswered,
      actorType: "USER",
      actorId: input.userId,
      targetType: moment.subjectType,
      targetId: moment.subjectId,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: career.currentGameDate,
      idempotencyKey: `moment:${moment.id}:answered`,
      payload: {
        kind: moment.kind,
        response: input.response,
        // The interaction the fold will price. Named, not inferred.
        interaction,
      },
    });

    return updated[0]!;
  });

  await trackAnalytics(ctx, {
    name: "relationship_moment_answered",
    userId: input.userId,
    careerId: career.id,
    properties: { kind: moment.kind, response: input.response },
  });

  return ok({ moment: resolved, interaction });
}

/** Every moment a career has had, newest first. For the inspector. */
export async function getMomentHistory(
  ctx: CommandContext,
  careerId: string,
): Promise<RelationshipMomentRow[]> {
  return ctx.db
    .select()
    .from(relationshipMoments)
    .where(eq(relationshipMoments.careerId, careerId))
    .orderBy(desc(relationshipMoments.surfacedAtGameTime));
}
