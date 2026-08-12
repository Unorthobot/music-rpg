import { and, asc, eq, gt, inArray } from "drizzle-orm";
import {
  careers,
  creativeDecisions,
  creativeSessionParticipants,
  creativeSessions,
  gameEvents,
  relationships,
  releases,
  tracks,
  type CareerRow,
  type RelationshipRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { deriveRelationship, relationshipKindFor } from "@music-rpg/simulation";
import {
  RELATIONSHIP_DIMENSIONS,
  RELATIONSHIP_ENGINE_VERSION,
  clamp,
  ids,
  ok,
  type InteractionKind,
  type RelationshipInteraction,
  type RelationshipState,
  type Result,
} from "@music-rpg/shared";
import { contextNow, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

/**
 * Relationships, folded out of canonical history.
 *
 * One mechanism does both halves of the milestone's third rule. A career that
 * predates M6 has no relationship rows and a watermark of zero, so the first
 * call consumes its entire past. Every later call resumes from the watermark
 * and consumes only what is new. There is no separate migration path to drift
 * out of step with the live one, and no read that re-scans a career's history
 * to answer what somebody thinks of them.
 *
 * The timeline is `game_events.sequence`, because it is the one monotonic
 * ordering the whole simulation already shares. The rich detail a decision
 * carries — which pass it was, how the producer felt at the time — lives on the
 * `creative_decisions` row, and is matched back by counting occurrences of each
 * decision type within a session. Deterministic, and it works for rows written
 * long before this milestone existed.
 */

/** Engaged listeners in one tick that count as a full-strength reaction. */
const RECEPTION_STRENGTH_SCALE = 25;

const DECISION_INTERACTIONS: Record<string, InteractionKind | null> = {
  CREATIVE_DIRECTION_SET: "DIRECTION_GIVEN",
  PRODUCER_PROPOSAL_ACCEPTED: "IDEA_TAKEN",
  PRODUCER_PROPOSAL_REJECTED: "IDEAS_REFUSED",
  PRODUCER_PROPOSALS_COMBINED: "IDEAS_COMBINED",
  REVISION_REQUESTED: "REVISION_ASKED",
  MASTER_REQUESTED: "WORK_MASTERED",
  TRACK_SAVED: "WORK_KEPT",
  // Internal plumbing rather than something that happened between two people.
  TRACK_VERSION_REQUESTED: null,
  TRACK_VERSION_ACCEPTED: null,
  TRACK_VERSION_REJECTED: null,
};

export type SyncRelationshipsResult = {
  relationships: RelationshipRow[];
  /** Interactions consumed by this call. Zero on a second run. */
  consumed: number;
};

type Subject = { type: "CHARACTER"; id: string };

/** Everything needed to attribute an event to a person. */
type Wiring = {
  /** sessionId → the character who was in the room as producer. */
  producerBySession: Map<string, string>;
  /** trackId → sessionId that made it. */
  sessionByTrack: Map<string, string>;
  /** releaseId → trackId. */
  trackByRelease: Map<string, string>;
  /** (sessionId, decisionType) → the rows, in order. */
  decisions: Map<string, { round?: number; stance?: string | null }[]>;
};

async function loadWiring(ctx: CommandContext, career: CareerRow): Promise<Wiring> {
  const sessionRows = await ctx.db
    .select()
    .from(creativeSessions)
    .where(eq(creativeSessions.careerId, career.id));

  const sessionIds = sessionRows.map((session) => session.id);

  const [participants, trackRows, releaseRows, decisionRows] = await Promise.all([
    sessionIds.length
      ? ctx.db
          .select()
          .from(creativeSessionParticipants)
          .where(
            and(
              inArray(creativeSessionParticipants.sessionId, sessionIds),
              eq(creativeSessionParticipants.role, "PRODUCER"),
            ),
          )
      : Promise.resolve([]),
    ctx.db.select().from(tracks).where(eq(tracks.careerId, career.id)),
    ctx.db.select().from(releases).where(eq(releases.careerId, career.id)),
    sessionIds.length
      ? ctx.db
          .select()
          .from(creativeDecisions)
          .where(inArray(creativeDecisions.sessionId, sessionIds))
          .orderBy(asc(creativeDecisions.sequence))
      : Promise.resolve([]),
  ]);

  const decisions = new Map<string, { round?: number; stance?: string | null }[]>();
  for (const row of decisionRows) {
    const key = `${row.sessionId}:${row.decisionType}`;
    const payload = row.payload as { round?: number; stance?: string | null };
    const list = decisions.get(key) ?? [];
    list.push({ round: payload.round, stance: payload.stance ?? null });
    decisions.set(key, list);
  }

  return {
    producerBySession: new Map(
      participants
        .filter((row) => row.entityType === "CHARACTER")
        .map((row) => [row.sessionId, row.entityId]),
    ),
    sessionByTrack: new Map(
      trackRows.filter((row) => row.sessionId).map((row) => [row.id, row.sessionId!]),
    ),
    trackByRelease: new Map(
      releaseRows.filter((row) => row.trackId).map((row) => [row.id, row.trackId!]),
    ),
    decisions,
  };
}

/**
 * Turn the career's new canonical events into things that happened between two
 * people. Anything that cannot be attributed to somebody is skipped rather than
 * guessed at.
 */
function extractInteractions(
  events: { sequence: number; eventType: string; targetId: string | null; payload: Record<string, unknown>; occurredAt: Date }[],
  wiring: Wiring,
): Map<string, RelationshipInteraction[]> {
  const bySubject = new Map<string, RelationshipInteraction[]>();
  const seenSessions = new Set<string>();
  const decisionCursor = new Map<string, number>();

  const push = (subject: Subject, interaction: RelationshipInteraction) => {
    const key = `${subject.type}:${subject.id}`;
    const list = bySubject.get(key) ?? [];
    list.push(interaction);
    bySubject.set(key, list);
  };

  for (const event of events) {
    if (event.eventType === GameEventType.CreativeDecisionRecorded) {
      const payload = event.payload as { decisionType?: string; sessionId?: string };
      const sessionId = payload.sessionId;
      const decisionType = payload.decisionType;
      if (!sessionId || !decisionType) continue;

      const characterId = wiring.producerBySession.get(sessionId);
      if (!characterId) continue;

      // Walking into the room with somebody is itself an interaction, and it
      // happens once, at the first thing that passed between them.
      if (!seenSessions.has(sessionId)) {
        seenSessions.add(sessionId);
        push(
          { type: "CHARACTER", id: characterId },
          { kind: "CHOSEN", sequence: event.sequence - 0.5, occurredAt: event.occurredAt },
        );
      }

      const kind = DECISION_INTERACTIONS[decisionType];
      if (!kind) continue;

      /*
       * Match this event back to its decision row by counting occurrences of
       * the type within the session. Events and rows are written in the same
       * order inside one transaction, so the nth of each corresponds — and it
       * works for history written before relationships existed.
       */
      const key = `${sessionId}:${decisionType}`;
      const index = decisionCursor.get(key) ?? 0;
      decisionCursor.set(key, index + 1);
      const detail = wiring.decisions.get(key)?.[index];

      push(
        { type: "CHARACTER", id: characterId },
        {
          kind,
          sequence: event.sequence,
          occurredAt: event.occurredAt,
          ...(detail?.round !== undefined ? { round: detail.round } : {}),
          ...(detail?.stance !== undefined ? { stance: detail.stance } : {}),
        },
      );
      continue;
    }

    if (event.eventType === GameEventType.ReleasePublished) {
      // The published event targets the track it put out.
      const sessionId = event.targetId ? wiring.sessionByTrack.get(event.targetId) : undefined;
      const characterId = sessionId ? wiring.producerBySession.get(sessionId) : undefined;
      if (!characterId) continue;

      push(
        { type: "CHARACTER", id: characterId },
        { kind: "WORK_RELEASED", sequence: event.sequence, occurredAt: event.occurredAt },
      );
      continue;
    }

    /*
     * Crew answers. Explicitly asked for and explicitly given, which is why
     * they are allowed to move loyalty in a way no run of good sessions can.
     */
    if (
      event.eventType === GameEventType.CrewJoined ||
      event.eventType === GameEventType.CrewDeclined ||
      event.eventType === GameEventType.CrewLeft
    ) {
      if (!event.targetId) continue;
      const kind =
        event.eventType === GameEventType.CrewJoined
          ? "JOINED_CREW"
          : event.eventType === GameEventType.CrewDeclined
            ? "DECLINED_CREW"
            : "LEFT_CREW";

      push(
        { type: "CHARACTER", id: event.targetId },
        { kind, sequence: event.sequence, occurredAt: event.occurredAt },
      );
      continue;
    }

    /*
     * Answering a moment. The surfacing event is deliberately not read here —
     * a moment is an invitation and moves nothing; only the answer does.
     */
    if (event.eventType === GameEventType.RelationshipMomentAnswered) {
      const payload = event.payload as { interaction?: string };
      if (!event.targetId || !payload.interaction) continue;

      push(
        { type: "CHARACTER", id: event.targetId },
        {
          kind: payload.interaction as InteractionKind,
          sequence: event.sequence,
          occurredAt: event.occurredAt,
        },
      );
      continue;
    }

    /*
     * Competition. M8's, and the first things that move rivalry.
     *
     * Three of these target the character directly, because a battle is
     * something that happens between two people rather than to a track.
     */
    if (event.eventType === GameEventType.BattleChallengeIssued) {
      if (!event.targetId) continue;
      push(
        { type: "CHARACTER", id: event.targetId },
        { kind: "CHALLENGE_ISSUED", sequence: event.sequence, occurredAt: event.occurredAt },
      );
      continue;
    }

    if (event.eventType === GameEventType.BattleChallengeAccepted) {
      if (!event.targetId) continue;
      push(
        { type: "CHARACTER", id: event.targetId },
        { kind: "CHALLENGE_ACCEPTED", sequence: event.sequence, occurredAt: event.occurredAt },
      );
      continue;
    }

    /*
     * Refusing. A real, remembered outcome that is not a loss — and the
     * derivation it feeds cannot move respect in either direction.
     */
    if (event.eventType === GameEventType.BattleChallengeDeclined) {
      if (!event.targetId) continue;
      push(
        { type: "CHARACTER", id: event.targetId },
        { kind: "CHALLENGE_DECLINED", sequence: event.sequence, occurredAt: event.occurredAt },
      );
      continue;
    }

    /*
     * What the battle was, semantically.
     *
     * The interactions are *read from the event payload*, where the pure
     * consequence module put them — not re-derived here from a result. One
     * source of truth: the judging established what happened, and this fold
     * prices it without forming a second opinion about how close it was.
     */
    if (event.eventType === GameEventType.BattleConsequencesApplied) {
      if (!event.targetId) continue;
      const payload = event.payload as {
        interactions?: { kind: string; contestMargin?: number }[];
      };

      for (const [index, entry] of (payload.interactions ?? []).entries()) {
        push(
          { type: "CHARACTER", id: event.targetId },
          {
            kind: entry.kind as InteractionKind,
            // Fractional, so several interactions from one event stay ordered.
            sequence: event.sequence + index / 100,
            occurredAt: event.occurredAt,
            ...(entry.contestMargin !== undefined
              ? { contestMargin: entry.contestMargin }
              : {}),
          },
        );
      }
      continue;
    }

    if (event.eventType === GameEventType.ReceptionTickCompleted) {
      const trackId = event.targetId ? wiring.trackByRelease.get(event.targetId) : undefined;
      const sessionId = trackId ? wiring.sessionByTrack.get(trackId) : undefined;
      const characterId = sessionId ? wiring.producerBySession.get(sessionId) : undefined;
      if (!characterId) continue;

      const payload = event.payload as { totals?: { newEngagedListeners?: number } };
      const engaged = Number(payload.totals?.newEngagedListeners ?? 0);
      if (engaged <= 0) continue;

      // Per tick, so the world's opinion arrives incrementally rather than
      // being re-counted whole every time the fold runs.
      push(
        { type: "CHARACTER", id: characterId },
        {
          kind: "WORK_RECEIVED",
          sequence: event.sequence,
          occurredAt: event.occurredAt,
          receptionStrength: clamp(engaged / RECEPTION_STRENGTH_SCALE, 0, 1),
        },
      );
    }
  }

  return bySubject;
}

/**
 * Bring a career's relationships up to date with its history.
 *
 * Idempotent: a second call with nothing new consumes nothing and writes
 * nothing.
 */
export async function syncCareerRelationships(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<SyncRelationshipsResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const [existing, wiring] = await Promise.all([
    ctx.db.select().from(relationships).where(eq(relationships.careerId, career.id)),
    loadWiring(ctx, career),
  ]);

  // Resume from the furthest point any relationship has already reached.
  const watermark = existing.reduce(
    (highest, row) => Math.max(highest, row.derivedThroughSequence),
    0,
  );

  const events = await ctx.db
    .select()
    .from(gameEvents)
    .where(and(eq(gameEvents.careerId, career.id), gt(gameEvents.sequence, watermark)))
    .orderBy(asc(gameEvents.sequence));

  if (events.length === 0) {
    return ok({ relationships: existing, consumed: 0 });
  }

  const interactions = extractInteractions(events, wiring);
  const highestSequence = events[events.length - 1]!.sequence;
  const now = contextNow(ctx);

  if (interactions.size === 0) {
    // Nothing between people happened, but the career has still moved past
    // these events — advance the watermark so they are not re-read forever.
    if (existing.length > 0) {
      await ctx.db
        .update(relationships)
        .set({ derivedThroughSequence: highestSequence, updatedAt: now })
        .where(eq(relationships.careerId, career.id));
    }
    return ok({ relationships: existing, consumed: 0 });
  }

  const written = await ctx.db.transaction(async (tx) => {
    const rows: RelationshipRow[] = [];

    for (const [key, list] of interactions) {
      const [subjectType, subjectId] = key.split(":") as ["CHARACTER", string];
      const current = existing.find(
        (row) => row.subjectType === subjectType && row.subjectId === subjectId,
      );

      const from = current
        ? (Object.fromEntries(
            RELATIONSHIP_DIMENSIONS.map((dimension) => [dimension, current[dimension]]),
          ) as RelationshipState)
        : undefined;

      /*
       * Whether the work was seen through changes what refusing it meant, so
       * the fold needs to know how the story ended before it can price the
       * middle of it. A session that reached a master is resolved.
       */
      const resolved = list.some((interaction) => interaction.kind === "WORK_MASTERED")
        || (current?.trust ?? 0) > 0;

      const outcome = deriveRelationship({
        ...(from ? { from } : {}),
        interactions: list,
        resolved,
        // Working with somebody a second time is the loyalty signal.
        rechosen: (current?.interactionCount ?? 0) > 0,
      });

      /*
       * What this relationship currently *is*.
       *
       * M6 hardcoded `CREATIVE_PARTNER` here, which is why `RIVAL` was declared
       * and never assigned: anything set elsewhere was overwritten on the next
       * day advance, and rivalry could never become durable. The kind is now
       * derived from what has actually passed between the two of them.
       *
       * It is a label for the dominant *current* relation and never a verdict on
       * the history. The dimensions underneath accumulate independently and are
       * untouched by this, so two people who battled and then made a record
       * together keep both facts — and the label is free to change back.
       */
      const kind = relationshipKindFor({
        history: list.map((interaction) => interaction.kind),
        state: outcome.state,
        current: current?.kind ?? null,
      });

      const values = {
        careerId: career.id,
        worldId: career.worldId,
        subjectType,
        subjectId,
        kind,
        ...outcome.state,
        interactionCount: (current?.interactionCount ?? 0) + outcome.interactionCount,
        derivedThroughSequence: highestSequence,
        engineVersion: RELATIONSHIP_ENGINE_VERSION,
        lastInteractionAt: list[list.length - 1]!.occurredAt,
        updatedAt: now,
      };

      const saved = await tx
        .insert(relationships)
        .values({
          id: ids.generic(),
          ...values,
          firstMetAt: current?.firstMetAt ?? list[0]!.occurredAt,
        })
        .onConflictDoUpdate({
          target: [relationships.careerId, relationships.subjectType, relationships.subjectId],
          set: values,
        })
        .returning();

      rows.push(saved[0]!);

      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.RelationshipChanged,
        actorType: "SYSTEM",
        targetType: subjectType,
        targetId: subjectId,
        visibility: "PRIVATE",
        importance: 35,
        occurredAt: list[list.length - 1]!.occurredAt,
        idempotencyKey: `relationship:${career.id}:${subjectId}:${highestSequence}`,
        payload: {
          // What moved, and which interactions moved it. This is the audit
          // trail for a state the player only ever sees as a phrase.
          engineVersion: RELATIONSHIP_ENGINE_VERSION,
          interactions: outcome.steps.map((step) => ({ kind: step.kind, delta: step.delta })),
          state: outcome.state,
          // What they are to each other now, and what they were before it.
          kind,
          kindBefore: current?.kind ?? null,
        },
      });
    }

    // Relationships this career has that saw nothing new still move past these
    // events, so the next call does not re-read them.
    await tx
      .update(relationships)
      .set({ derivedThroughSequence: highestSequence, updatedAt: now })
      .where(eq(relationships.careerId, career.id));

    return rows;
  });

  return ok({
    relationships: written,
    consumed: [...interactions.values()].reduce((total, list) => total + list.length, 0),
  });
}

/** Careers whose relationships have never been folded. Used by the backfill. */
export async function careersNeedingRelationshipDerivation(
  ctx: CommandContext,
): Promise<string[]> {
  const rows = await ctx.db.select({ id: careers.id }).from(careers);
  const derived = await ctx.db
    .select({ careerId: relationships.careerId })
    .from(relationships);
  const seen = new Set(derived.map((row) => row.careerId));
  return rows.map((row) => row.id).filter((id) => !seen.has(id));
}

export { DomainErrors };
