import { and, asc, eq } from "drizzle-orm";
import {
  calendarItems,
  characters,
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
import { bookProducerSession } from "../internal/book-session";
import { loadOwnedCareer } from "../internal/career";
import { DAYS } from "../internal/clock";

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

  /*
   * Already chosen: hand back the session that exists rather than booking again.
   *
   * Ordered oldest-first, which was academic until M7 and is not any more. A
   * career can now book a second session by accepting a producer's invitation,
   * so an unordered `limit(1)` here would sometimes hand back the wrong room —
   * the introduction resolves to the session the introduction created, and that
   * is always the first one.
   */
  if (opportunity.status === "RESOLVED") {
    const existing = await ctx.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.careerId, career.id))
      .orderBy(asc(creativeSessions.createdAt))
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
    /*
     * The room itself, booked through the one implementation of booking a room.
     * What is left here is only what makes this booking an *introduction* being
     * answered rather than an invitation being accepted.
     */
    const booked = await bookProducerSession(tx, {
      career,
      producer,
      profile,
      costMinor,
      scheduledGameTime: sessionGameTime,
      now,
      // One key per career per producer: a replayed submit is a no-op.
      idempotencyKey: `career:${career.id}:producer_session:${producer.id}`,
      title: `Studio session with ${producer.name}`,
    });

    if ("failed" in booked) return booked;

    const { session, calendarItem } = booked;

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

    /*
     * The ledger, session and calendar events are the booking's own and are
     * written by `bookProducerSession`. What stays here is the one event that is
     * about this being a *choice between three people* rather than a room being
     * booked.
     */
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

    /*
     * Thabo hears about it. The scene is small.
     *
     * Scoped to Thabo by name, which it was not before and had to become: until
     * M7 he was the only person a career had a conversation with, so "the first
     * conversation" and "Thabo" were the same row. Promoters and producers now
     * have threads of their own, and an unscoped lookup would put the
     * connector's line into whichever conversation happened to come back first.
     */
    const conversationRows = await tx
      .select({ conversation: npcConversations })
      .from(npcConversations)
      .innerJoin(characters, eq(characters.id, npcConversations.characterId))
      .where(and(eq(npcConversations.careerId, career.id), eq(characters.slug, "thabo")))
      .limit(1);

    const conversation = conversationRows[0]?.conversation;
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

    return booked;
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
