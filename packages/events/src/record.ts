import { and, eq } from "drizzle-orm";
import { gameEvents, type DbClient, type GameEventRow } from "@music-rpg/database";
import { ids } from "@music-rpg/shared";
import type { RecordEventInput } from "./types";

/**
 * Appends to the canonical log.
 *
 * Always called inside the same transaction as the state change it describes:
 * if the write fails, the history and the projection fail together. Nothing in
 * the codebase updates or deletes a `game_events` row.
 */
export async function recordEvent(
  db: DbClient,
  input: RecordEventInput,
): Promise<GameEventRow> {
  const row = {
    id: ids.event(),
    worldId: input.worldId,
    careerId: input.careerId ?? null,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    visibility: input.visibility ?? "PRIVATE",
    importance: input.importance ?? 10,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey ?? null,
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
  };

  const inserted = await db
    .insert(gameEvents)
    .values(row)
    .onConflictDoNothing({ target: gameEvents.idempotencyKey })
    .returning();

  const first = inserted[0];
  if (first) return first;

  // Idempotency key already present: return the original event so callers see
  // the same history they would have created.
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.idempotencyKey, input.idempotencyKey))
      .limit(1);
    const found = existing[0];
    if (found) return found;
  }

  throw new Error(`Failed to record event ${input.eventType}`);
}

/** Reads a career's history, oldest first. Used by world-control. */
export async function listCareerEvents(
  db: DbClient,
  careerId: string,
  limit = 200,
): Promise<GameEventRow[]> {
  return db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.careerId, careerId))
    .orderBy(gameEvents.sequence)
    .limit(limit);
}

export async function findCareerEventByType(
  db: DbClient,
  careerId: string,
  eventType: string,
): Promise<GameEventRow | undefined> {
  const rows = await db
    .select()
    .from(gameEvents)
    .where(and(eq(gameEvents.careerId, careerId), eq(gameEvents.eventType, eventType)))
    .limit(1);
  return rows[0];
}
