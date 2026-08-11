import { and, asc, desc, eq } from "drizzle-orm";
import {
  characters,
  creativeDecisions,
  creativeSessionParticipants,
  creativeSessions,
  gameEvents,
  relationships,
  type CharacterRow,
  type CreativeDecisionRow,
  type Database,
  type GameEventRow,
  type RelationshipRow,
} from "@music-rpg/database";
import { GameEventType } from "@music-rpg/events";
import type { RelationshipDimension } from "@music-rpg/shared";

/**
 * Relationships, raw.
 *
 * The inspector's half. Everything is here: the dimension values as stored, the
 * per-interaction deltas that produced them, the watermark, the engine version
 * and the decisions underneath. `queries/relationship-view.ts` is the other
 * side of the line and returns none of it.
 */

export type RelationshipWithSubject = {
  relationship: RelationshipRow;
  character: CharacterRow | null;
};

export async function getCareerRelationships(
  db: Database,
  careerId: string,
): Promise<RelationshipWithSubject[]> {
  const rows = await db
    .select()
    .from(relationships)
    .where(eq(relationships.careerId, careerId))
    .orderBy(desc(relationships.interactionCount));

  if (rows.length === 0) return [];

  const characterRows = await db.select().from(characters);

  return rows.map((relationship) => ({
    relationship,
    character:
      relationship.subjectType === "CHARACTER"
        ? (characterRows.find((row) => row.id === relationship.subjectId) ?? null)
        : null,
  }));
}

/** One recorded shift, with the interactions that caused it. */
export type RelationshipChange = {
  event: GameEventRow;
  interactions: { kind: string; delta: Partial<Record<RelationshipDimension, number>> }[];
  state: Record<RelationshipDimension, number>;
};

export async function getRelationshipHistory(
  db: Database,
  careerId: string,
  subjectId: string,
): Promise<RelationshipChange[]> {
  const rows = await db
    .select()
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.careerId, careerId),
        eq(gameEvents.eventType, GameEventType.RelationshipChanged),
        eq(gameEvents.targetId, subjectId),
      ),
    )
    .orderBy(asc(gameEvents.sequence));

  return rows.map((event) => {
    const payload = event.payload as {
      interactions?: RelationshipChange["interactions"];
      state?: RelationshipChange["state"];
    };
    return {
      event,
      interactions: payload.interactions ?? [],
      state: payload.state ?? ({} as RelationshipChange["state"]),
    };
  });
}

/**
 * The decisions a relationship was folded out of.
 *
 * Only the sessions this person was actually in — which is the join that makes
 * "why does LEX have tension with KXMO" answerable rather than merely
 * assertable.
 */
export async function getRelationshipDecisions(
  db: Database,
  careerId: string,
  subjectId: string,
): Promise<{ decision: CreativeDecisionRow; sessionId: string }[]> {
  const sessionRows = await db
    .select()
    .from(creativeSessions)
    .where(eq(creativeSessions.careerId, careerId));

  if (sessionRows.length === 0) return [];

  const participants = await db
    .select()
    .from(creativeSessionParticipants)
    .where(eq(creativeSessionParticipants.entityId, subjectId));

  const sessionIds = new Set(
    participants
      .filter((row) => sessionRows.some((session) => session.id === row.sessionId))
      .map((row) => row.sessionId),
  );

  if (sessionIds.size === 0) return [];

  const decisions = await db
    .select()
    .from(creativeDecisions)
    .orderBy(asc(creativeDecisions.sequence));

  return decisions
    .filter((decision) => sessionIds.has(decision.sessionId))
    .map((decision) => ({ decision, sessionId: decision.sessionId }));
}
