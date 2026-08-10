import { and, eq } from "drizzle-orm";
import {
  calendarItems,
  characters,
  creativeSessionParticipants,
  creativeSessions,
  npcConversations,
  npcMessages,
  opportunities,
  type CalendarItemRow,
  type CharacterRow,
  type CreativeSessionRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, formatMoney, ids, ok, type Result } from "@music-rpg/shared";
import type { ProducerProfile } from "@music-rpg/simulation";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { DAYS } from "../internal/clock";
import { applyMoneyMovement } from "../internal/money";

export type SelectProducerResult = {
  producer: CharacterRow;
  session: CreativeSessionRow;
  calendarItem: CalendarItemRow;
  transactionId: string;
  costMinor: number;
  /** True when this call did the work; false when it replayed an earlier one. */
  created: boolean;
};

export function producerProfileOf(character: CharacterRow): ProducerProfile | null {
  const preferences = character.preferences as { producer?: ProducerProfile } | null;
  return preferences?.producer ?? null;
}

/**
 * SelectProducer — the first real decision with a price on it.
 *
 * Everything this command does happens in one transaction: the session fee is
 * charged through the ledger, the studio session is created, the producer and
 * the player are seated in it, the calendar gets the booking, and the
 * opportunity is resolved. If any part fails, none of it happened — the player
 * is never charged for a session that doesn't exist.
 *
 * Idempotent twice over: the money movement carries a key so a retry cannot
 * charge again, and an already-resolved opportunity returns the existing
 * session instead of booking a second one.
 *
 * The producer is *not* added to Crew. This is one collaboration, not a
 * recruitment; crew is a different relationship and arrives later.
 */
export async function selectProducer(
  ctx: CommandContext,
  input: { careerId: string; userId: string; producerId: string },
): Promise<Result<SelectProducerResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (career.status !== "ACTIVE") {
    return err(DomainErrors.invalidCareerState("This career hasn't started yet."));
  }

  const producerRows = await ctx.db
    .select()
    .from(characters)
    .where(and(eq(characters.id, input.producerId), eq(characters.worldId, career.worldId)))
    .limit(1);

  const producer = producerRows[0];
  if (!producer || producer.role !== "PRODUCER") {
    return err(DomainErrors.invalidInput("That producer isn't available in this world."));
  }

  const profile = producerProfileOf(producer);
  if (!profile) {
    return err(DomainErrors.invalidInput("That producer isn't taking sessions."));
  }

  const opportunityRows = await ctx.db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.careerId, career.id), eq(opportunities.type, "PRODUCER_INTRO")))
    .limit(1);

  const opportunity = opportunityRows[0];
  if (!opportunity) {
    return err(DomainErrors.invalidCareerState("You haven't been introduced to anyone yet."));
  }

  // Already chosen: hand back the session that exists rather than booking again.
  if (opportunity.status === "RESOLVED") {
    const existing = await ctx.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.careerId, career.id))
      .limit(1);

    const session = existing[0];
    if (session) {
      const items = await ctx.db
        .select()
        .from(calendarItems)
        .where(
          and(
            eq(calendarItems.relatedEntityType, "CREATIVE_SESSION"),
            eq(calendarItems.relatedEntityId, session.id),
          ),
        )
        .limit(1);

      return ok({
        producer,
        session,
        calendarItem: items[0]!,
        transactionId: session.transactionId ?? "",
        costMinor: session.costMinor,
        created: false,
      });
    }
  }

  const costMinor = profile.sessionCostMinor;

  // Debt is not a mechanic in Act I: an unaffordable session is refused before
  // anything is written.
  if (career.moneyBalance < costMinor) {
    return err(
      DomainErrors.invalidInput(
        `A session with ${producer.name} costs ${formatMoney(costMinor)}. You have ${formatMoney(
          career.moneyBalance,
        )}.`,
        { field: "producerId" },
      ),
    );
  }

  const now = contextNow(ctx);
  const sessionGameTime = new Date(career.currentGameDate.getTime() + 1 * DAYS);

  const outcome = await ctx.db.transaction(async (tx) => {
    const money = await applyMoneyMovement(tx, {
      careerId: career.id,
      category: "STUDIO_COST",
      amountMinor: costMinor,
      direction: "DEBIT",
      description: `Studio session with ${producer.name}`,
      relatedEntityType: "CHARACTER",
      relatedEntityId: producer.id,
      // One key per career per producer: a replayed submit is a no-op.
      idempotencyKey: `career:${career.id}:producer_session:${producer.id}`,
      occurredAt: now,
    });

    if (!money.ok) return { failed: "INSUFFICIENT_FUNDS" as const };

    const sessionId = ids.generic();

    const insertedSession = await tx
      .insert(creativeSessions)
      .values({
        id: sessionId,
        careerId: career.id,
        worldId: career.worldId,
        purpose: "TRACK",
        status: "SCHEDULED",
        costMinor,
        transactionId: money.transactionId,
        scheduledGameTime: sessionGameTime,
      })
      .returning();

    const session = insertedSession[0];
    if (!session) return { failed: "SESSION" as const };

    // Who is in the room. A group career seats the Group and the player's own
    // artist, so the work is attributable to both.
    const participants: { entityType: "ARTIST" | "GROUP" | "CHARACTER"; entityId: string; role: "PRIMARY_ARTIST" | "GROUP" | "PRODUCER" }[] =
      [{ entityType: "CHARACTER", entityId: producer.id, role: "PRODUCER" }];

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

    const calendarId = ids.generic();
    const insertedItem = await tx
      .insert(calendarItems)
      .values({
        id: calendarId,
        careerId: career.id,
        type: "STUDIO",
        title: `Studio session with ${producer.name}`,
        description: profile.soundLine,
        startGameTime: sessionGameTime,
        endGameTime: new Date(sessionGameTime.getTime() + 4 * 60 * 60 * 1000),
        relatedEntityType: "CREATIVE_SESSION",
        relatedEntityId: session.id,
        status: "SCHEDULED",
      })
      .returning();

    const calendarItem = insertedItem[0];
    if (!calendarItem) return { failed: "CALENDAR" as const };

    await tx
      .update(opportunities)
      .set({
        status: "RESOLVED",
        acceptedAt: now,
        resolvedAt: now,
        updatedAt: now,
        payload: { ...opportunity.payload, selectedProducerId: producer.id },
      })
      .where(eq(opportunities.id, opportunity.id));

    // The events that explain how this session came to exist.
    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.OpportunityAccepted,
      actorType: "USER",
      actorId: input.userId,
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: career.currentGameDate,
      idempotencyKey: `opportunity:${opportunity.id}:accepted`,
      payload: { producerId: producer.id, producerName: producer.name },
    });

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
        amountMinor: costMinor,
        balanceAfterMinor: money.balanceAfterMinor,
        description: `Studio session with ${producer.name}`,
      },
    });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.ProducerSelected,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CHARACTER",
      targetId: producer.id,
      visibility: "LOCAL_PUBLIC",
      importance: 70,
      occurredAt: career.currentGameDate,
      idempotencyKey: `career:${career.id}:producer_selected:${producer.id}`,
      payload: { producerName: producer.name, costMinor, sessionId: session.id },
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
      payload: { producerId: producer.id, purpose: "TRACK", costMinor },
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
      payload: { type: "STUDIO", startGameTime: sessionGameTime.toISOString() },
    });

    // Thabo hears about it. The scene is small.
    const conversationRows = await tx
      .select()
      .from(npcConversations)
      .where(eq(npcConversations.careerId, career.id))
      .limit(1);

    const conversation = conversationRows[0];
    if (conversation) {
      await tx.insert(npcMessages).values({
        id: ids.generic(),
        conversationId: conversation.id,
        senderType: "CHARACTER",
        content: `${producer.name}, then. Session's booked — don't waste it.`,
        payload: { sessionId: session.id },
      });
      await tx
        .update(npcConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(eq(npcConversations.id, conversation.id));
    }

    return {
      session,
      calendarItem,
      transactionId: money.transactionId,
      alreadyCharged: money.alreadyApplied,
    };
  });

  if ("failed" in outcome) {
    if (outcome.failed === "INSUFFICIENT_FUNDS") {
      return err(DomainErrors.invalidInput("You can't afford that session."));
    }
    return err(
      DomainErrors.invalidInput("We couldn't schedule the session. You haven't been charged."),
    );
  }

  await track(ctx, {
    name: "producer_selected",
    userId: input.userId,
    careerId: career.id,
    properties: { producerId: producer.id, producerName: producer.name, costMinor },
  });

  return ok({
    producer,
    session: outcome.session,
    calendarItem: outcome.calendarItem,
    transactionId: outcome.transactionId,
    costMinor,
    created: !outcome.alreadyCharged,
  });
}
