import { eq } from "drizzle-orm";
import {
  calendarItems,
  characters,
  creativeSessionParticipants,
  creativeSessions,
  type CalendarItemRow,
  type CareerRow,
  type CharacterRow,
  type CreativeSessionRow,
  type DbClient,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { ids } from "@music-rpg/shared";
import type { ProducerProfile } from "@music-rpg/simulation";
import { applyMoneyMovement } from "./money";

/**
 * Booking a studio session — the one implementation of it.
 *
 * This was `selectProducer`'s middle, extracted rather than copied, because M7
 * gives a career a second way into the room: a producer who rated the last record
 * asks for another. Two ways in must not mean two notions of what a session is.
 * A parallel implementation would drift within a milestone — one path seating the
 * player's artist and the other forgetting to, one charging through the ledger
 * and the other adjusting a balance — and the divergence would surface as a
 * session that exists but cannot be resumed.
 *
 * What a booking is, in full: the fee charged through the ledger, the session
 * row, everybody who is in the room seated on it, the calendar entry, and the
 * events that explain how it came to exist. Callers add whatever is specific to
 * *why* it was booked — an introduction resolves an authored offer, an
 * invitation accepts a generated one — and nothing about the room itself.
 *
 * Runs inside the caller's transaction, deliberately. A player must never be
 * charged for a session that does not exist, and that guarantee is only worth
 * anything if the charge and the room are the same commit.
 */

export type BookSessionInput = {
  career: CareerRow;
  producer: CharacterRow;
  profile: ProducerProfile;
  costMinor: number;
  /** In game time. When the session sits on the calendar. */
  scheduledGameTime: Date;
  /** Wall-clock, for the ledger. */
  now: Date;
  /**
   * What this booking *is*, for the money movement.
   *
   * One key per reason rather than one per producer: the introduction is
   * `career:{id}:producer_session:{producer}` and has been since M3, and an
   * invitation is keyed to the offer it came from. Sharing a key would make the
   * second session with the same producer a silent no-op that returned the first
   * one's transaction.
   */
  idempotencyKey: string;
  /** What the calendar entry is called. */
  title: string;
};

export type BookedSession = {
  session: CreativeSessionRow;
  calendarItem: CalendarItemRow;
  transactionId: string;
  /** True when the ledger recognised this booking and did not charge again. */
  alreadyCharged: boolean;
};

export type BookSessionFailure = {
  failed: "INSUFFICIENT_FUNDS" | "SESSION" | "CALENDAR";
};

export async function bookProducerSession(
  tx: DbClient,
  input: BookSessionInput,
): Promise<BookedSession | BookSessionFailure> {
  const { career, producer, profile } = input;

  const money = await applyMoneyMovement(tx, {
    careerId: career.id,
    category: "STUDIO_COST",
    amountMinor: input.costMinor,
    direction: "DEBIT",
    description: `Studio session with ${producer.name}`,
    relatedEntityType: "CHARACTER",
    relatedEntityId: producer.id,
    idempotencyKey: input.idempotencyKey,
    occurredAt: input.now,
  });

  if (!money.ok) return { failed: "INSUFFICIENT_FUNDS" };

  const insertedSession = await tx
    .insert(creativeSessions)
    .values({
      id: ids.generic(),
      careerId: career.id,
      worldId: career.worldId,
      purpose: "TRACK",
      status: "SCHEDULED",
      costMinor: input.costMinor,
      transactionId: money.transactionId,
      scheduledGameTime: input.scheduledGameTime,
    })
    .returning();

  const session = insertedSession[0];
  if (!session) return { failed: "SESSION" };

  /*
   * Who is in the room. A group career seats the Group and the player's own
   * artist, so the work is attributable to both — the rule M3 set, and the
   * reason this is shared code rather than a snippet worth retyping.
   */
  const participants: {
    entityType: "ARTIST" | "GROUP" | "CHARACTER";
    entityId: string;
    role: "PRIMARY_ARTIST" | "GROUP" | "PRODUCER";
  }[] = [{ entityType: "CHARACTER", entityId: producer.id, role: "PRODUCER" }];

  if (career.controlledEntityType === "GROUP" && career.controlledEntityId) {
    participants.push({ entityType: "GROUP", entityId: career.controlledEntityId, role: "GROUP" });
  }
  if (career.playerArtistId) {
    participants.push({
      entityType: "ARTIST",
      entityId: career.playerArtistId,
      role: "PRIMARY_ARTIST",
    });
  }

  for (const participant of participants) {
    await tx
      .insert(creativeSessionParticipants)
      .values({ id: ids.generic(), sessionId: session.id, ...participant })
      .onConflictDoNothing();
  }

  const insertedItem = await tx
    .insert(calendarItems)
    .values({
      id: ids.generic(),
      careerId: career.id,
      type: "STUDIO",
      title: input.title,
      description: profile.soundLine,
      startGameTime: input.scheduledGameTime,
      endGameTime: new Date(input.scheduledGameTime.getTime() + 4 * 60 * 60 * 1000),
      relatedEntityType: "CREATIVE_SESSION",
      relatedEntityId: session.id,
      status: "SCHEDULED",
    })
    .returning();

  const calendarItem = insertedItem[0];
  if (!calendarItem) return { failed: "CALENDAR" };

  await recordEvent(tx, {
    worldId: career.worldId,
    careerId: career.id,
    eventType: GameEventType.TransactionRecorded,
    actorType: "CAREER",
    actorId: career.id,
    targetType: "TRANSACTION",
    targetId: money.transactionId,
    visibility: "PRIVATE",
    importance: 40,
    occurredAt: career.currentGameDate,
    idempotencyKey: `transaction:${money.transactionId}:recorded`,
    payload: {
      category: "STUDIO_COST",
      amountMinor: input.costMinor,
      balanceAfterMinor: money.balanceAfterMinor,
      description: `Studio session with ${producer.name}`,
    },
  });

  await recordEvent(tx, {
    worldId: career.worldId,
    careerId: career.id,
    eventType: GameEventType.CreativeSessionCreated,
    actorType: "CAREER",
    actorId: career.id,
    targetType: "CREATIVE_SESSION",
    targetId: session.id,
    visibility: "PRIVATE",
    importance: 60,
    occurredAt: career.currentGameDate,
    idempotencyKey: `session:${session.id}:created`,
    payload: { producerId: producer.id, purpose: "TRACK", costMinor: input.costMinor },
  });

  await recordEvent(tx, {
    worldId: career.worldId,
    careerId: career.id,
    eventType: GameEventType.CalendarItemCreated,
    actorType: "CAREER",
    actorId: career.id,
    targetType: "CALENDAR_ITEM",
    targetId: calendarItem.id,
    visibility: "PRIVATE",
    importance: 35,
    occurredAt: career.currentGameDate,
    idempotencyKey: `calendar:${calendarItem.id}:created`,
    payload: { type: "STUDIO", startGameTime: input.scheduledGameTime.toISOString() },
  });

  return {
    session,
    calendarItem,
    transactionId: money.transactionId,
    alreadyCharged: money.alreadyApplied,
  };
}

/** A producer's structured profile, or null for somebody who is not one. */
export function producerProfileOfCharacter(character: CharacterRow): ProducerProfile | null {
  const preferences = character.preferences as { producer?: ProducerProfile } | null;
  return preferences?.producer ?? null;
}

/** One producer in this world, by id. Null when they are not a producer. */
export async function loadProducer(
  db: DbClient,
  worldId: string,
  producerId: string,
): Promise<CharacterRow | null> {
  const rows = await db.select().from(characters).where(eq(characters.id, producerId)).limit(1);

  const producer = rows[0];
  if (!producer || producer.worldId !== worldId || producer.role !== "PRODUCER") return null;

  return producer;
}
