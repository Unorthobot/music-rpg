import { and, eq } from "drizzle-orm";
import {
  characters,
  crewMembers,
  relationships,
  releasePerformance,
  releases,
  type CharacterRow,
  type CrewMemberRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { crewDecision, crewEligibility } from "@music-rpg/simulation";
import {
  RELATIONSHIP_DIMENSIONS,
  err,
  ids,
  ok,
  type CrewArrangement,
  type CrewEligibility,
  type RelationshipState,
  type Result,
} from "@music-rpg/shared";
import { contextNow, track as trackAnalytics, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

/**
 * Asking somebody to be part of what you are doing.
 *
 * The explicit act the whole distinction rests on. Nothing in the studio, the
 * release flow or the reception simulation can make somebody crew as a side
 * effect — this command is the only way in, and it can be refused.
 *
 * It writes no relationship state. It records what was asked, what was agreed
 * and what they said, and emits the canonical events; the relationship fold
 * picks those up and moves loyalty and trust from them, so derivation stays the
 * single writer of what two people make of each other.
 */

export type CrewInviteResult = {
  member: CrewMemberRow;
  accepted: boolean;
  /** Something they would actually say. Safe to show the player. */
  line: string;
};

function stateOf(row: Record<string, unknown>): RelationshipState {
  return Object.fromEntries(
    RELATIONSHIP_DIMENSIONS.map((dimension) => [dimension, Number(row[dimension] ?? 0)]),
  ) as RelationshipState;
}

/**
 * Whether their stated goal is served by what has happened so far.
 *
 * Narrow on purpose. LEX wants to find one artist worth the time, so a record
 * that was actually finished and actually reached somebody is evidence; a
 * producer with a different goal would read the same history differently, and
 * that is as far as goals go for now. This is not an autonomous agent deciding
 * what it wants next — it is one recorded ambition being checked against one
 * recorded outcome.
 */
async function goalIsServed(
  ctx: CommandContext,
  careerId: string,
  character: CharacterRow,
): Promise<boolean> {
  if (!character.currentGoal) return false;

  const performance = await ctx.db
    .select()
    .from(releasePerformance)
    .innerJoin(releases, eq(releases.id, releasePerformance.releaseId))
    .where(eq(releases.careerId, careerId));

  // Something was finished, put out, and heard by somebody.
  return performance.some((row) => row.release_performance.engagedListeners > 0);
}

/** Whether this person can be asked at all, and why not. */
export async function getCrewEligibility(
  ctx: CommandContext,
  input: { careerId: string; subjectId: string },
): Promise<CrewEligibility> {
  const [relationshipRows, crewRows] = await Promise.all([
    ctx.db
      .select()
      .from(relationships)
      .where(
        and(
          eq(relationships.careerId, input.careerId),
          eq(relationships.subjectId, input.subjectId),
        ),
      )
      .limit(1),
    ctx.db
      .select()
      .from(crewMembers)
      .where(
        and(eq(crewMembers.careerId, input.careerId), eq(crewMembers.subjectId, input.subjectId)),
      )
      .limit(1),
  ]);

  const existing = crewRows[0];

  return crewEligibility(relationshipRows[0] ? stateOf(relationshipRows[0]) : null, {
    alreadyCrew: existing?.status === "ACTIVE",
    previouslyDeclined: existing?.status === "DECLINED",
  });
}

/**
 * Ask somebody to join.
 *
 * Their answer is deterministic from the relationship, their own personality
 * and whether the work so far serves what they said they wanted. Being turned
 * down is a real outcome and is kept: the row stays, so asking again is not a
 * reroll.
 */
export async function inviteToCrew(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    subjectId: string;
    arrangement: CrewArrangement;
    note?: string | null;
  },
): Promise<Result<CrewInviteResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const eligibility = await getCrewEligibility(ctx, {
    careerId: career.id,
    subjectId: input.subjectId,
  });
  if (!eligibility.eligible) {
    return err(DomainErrors.invalidCareerState(eligibility.reason ?? "You can't ask them that."));
  }

  const [characterRows, relationshipRows] = await Promise.all([
    ctx.db.select().from(characters).where(eq(characters.id, input.subjectId)).limit(1),
    ctx.db
      .select()
      .from(relationships)
      .where(
        and(eq(relationships.careerId, career.id), eq(relationships.subjectId, input.subjectId)),
      )
      .limit(1),
  ]);

  const character = characterRows[0];
  const relationship = relationshipRows[0];
  if (!character || !relationship) {
    return err(DomainErrors.invalidInput("You haven't worked with them."));
  }

  const decision = crewDecision({
    state: stateOf(relationship),
    arrangement: input.arrangement,
    personality: character.personality,
    goal: character.currentGoal,
    goalServed: await goalIsServed(ctx, career.id, character),
    name: character.name,
  });

  const now = contextNow(ctx);
  const gameTime = career.currentGameDate;
  const terms = { arrangement: input.arrangement, note: input.note ?? null };

  const member = await ctx.db.transaction(async (tx) => {
    const values = {
      careerId: career.id,
      worldId: career.worldId,
      subjectType: "CHARACTER" as const,
      subjectId: character.id,
      role: character.role,
      status: decision.accepted ? ("ACTIVE" as const) : ("DECLINED" as const),
      terms,
      decision,
      askedAtGameTime: gameTime,
      ...(decision.accepted ? { joinedAtGameTime: gameTime } : {}),
      updatedAt: now,
    };

    const rows = await tx
      .insert(crewMembers)
      .values({ id: ids.generic(), ...values })
      .onConflictDoUpdate({
        target: [crewMembers.careerId, crewMembers.subjectType, crewMembers.subjectId],
        set: values,
      })
      .returning();

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.CrewInvited,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CHARACTER",
      targetId: character.id,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: gameTime,
      payload: { arrangement: input.arrangement, note: input.note ?? null },
    });

    /*
     * The answer is its own event, and it is what the relationship fold reads.
     * Nothing here writes trust or loyalty directly — derivation stays the only
     * writer of what two people make of each other.
     */
    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: decision.accepted ? GameEventType.CrewJoined : GameEventType.CrewDeclined,
      actorType: "SYSTEM",
      targetType: "CHARACTER",
      targetId: character.id,
      visibility: "PRIVATE",
      importance: decision.accepted ? 70 : 45,
      occurredAt: gameTime,
      payload: {
        arrangement: input.arrangement,
        line: decision.line,
        factors: decision.factors,
      },
    });

    return rows[0]!;
  });

  await trackAnalytics(ctx, {
    name: decision.accepted ? "crew_member_joined" : "crew_invite_declined",
    userId: input.userId,
    careerId: career.id,
    properties: { subjectId: character.id, arrangement: input.arrangement },
  });

  return ok({ member, accepted: decision.accepted, line: decision.line });
}

/** Everyone actually with this career. Declines and departures are excluded. */
export async function getCrew(
  ctx: CommandContext,
  careerId: string,
): Promise<{ member: CrewMemberRow; character: CharacterRow | null }[]> {
  const rows = await ctx.db
    .select()
    .from(crewMembers)
    .where(and(eq(crewMembers.careerId, careerId), eq(crewMembers.status, "ACTIVE")));

  if (rows.length === 0) return [];

  const characterRows = await ctx.db.select().from(characters);

  return rows.map((member) => ({
    member,
    character: characterRows.find((row) => row.id === member.subjectId) ?? null,
  }));
}
