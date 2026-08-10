import { and, asc, eq } from "drizzle-orm";
import {
  characters,
  npcConversations,
  npcMessages,
  opportunities,
  type CharacterRow,
  type OpportunityRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, ids, ok, type Result } from "@music-rpg/shared";
import { contextNow, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

export type FirstContactResult = {
  character: CharacterRow;
  conversationId: string;
  opportunity: OpportunityRow;
  created: boolean;
};

/**
 * Thabo gets in touch.
 *
 * The first thing that happens to a career is a person, not a notification.
 * This creates the conversation, the message, and the opportunity the message
 * is about — in one transaction, exactly once, no matter how many times Home is
 * loaded. The unique index on `(career_id, type)` is the enforcement; this
 * command reads it first so a repeat call returns the original.
 *
 * Message copy is a deterministic fixture. No model is involved, and none is
 * needed: what matters is that the fiction arrives as a message from somebody
 * who exists in the world.
 */
export async function createFirstContact(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<FirstContactResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  // Nothing reaches out to a career that hasn't started.
  if (career.status !== "ACTIVE") {
    return err(DomainErrors.invalidCareerState("This career hasn't started yet."));
  }

  const connectorRows = await ctx.db
    .select()
    .from(characters)
    .where(and(eq(characters.worldId, career.worldId), eq(characters.slug, "thabo")))
    .limit(1);

  const thabo = connectorRows[0];
  if (!thabo) {
    return err(DomainErrors.invalidInput("The scene has nobody to introduce you yet."));
  }

  const existingOpportunity = await ctx.db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.careerId, career.id), eq(opportunities.type, "PRODUCER_INTRO")))
    .limit(1);

  if (existingOpportunity[0]) {
    const conversationRows = await ctx.db
      .select()
      .from(npcConversations)
      .where(
        and(
          eq(npcConversations.careerId, career.id),
          eq(npcConversations.characterId, thabo.id),
        ),
      )
      .limit(1);

    return ok({
      character: thabo,
      conversationId: conversationRows[0]?.id ?? "",
      opportunity: existingOpportunity[0],
      created: false,
    });
  }

  const producerRows = await ctx.db
    .select()
    .from(characters)
    .where(and(eq(characters.worldId, career.worldId), eq(characters.role, "PRODUCER")))
    .orderBy(asc(characters.name));

  if (producerRows.length === 0) {
    return err(DomainErrors.invalidInput("There are no producers in this world yet."));
  }

  const now = contextNow(ctx);
  const gameTime = career.currentGameDate;

  const created = await ctx.db.transaction(async (tx) => {
    const conversationId = ids.generic();

    await tx
      .insert(npcConversations)
      .values({
        id: conversationId,
        careerId: career.id,
        characterId: thabo.id,
        lastMessageAt: now,
      })
      .onConflictDoNothing({
        target: [npcConversations.careerId, npcConversations.characterId],
      });

    const conversationRows = await tx
      .select()
      .from(npcConversations)
      .where(
        and(
          eq(npcConversations.careerId, career.id),
          eq(npcConversations.characterId, thabo.id),
        ),
      )
      .limit(1);

    const conversation = conversationRows[0];
    if (!conversation) return null;

    const contactEvent = await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.CharacterFirstContactCreated,
      actorType: "SYSTEM",
      actorId: thabo.id,
      targetType: "CAREER",
      targetId: career.id,
      visibility: "PRIVATE",
      importance: 60,
      occurredAt: gameTime,
      idempotencyKey: `career:${career.id}:first_contact:${thabo.slug}`,
      payload: { characterName: thabo.name, characterSlug: thabo.slug },
    });

    const opportunityId = ids.generic();

    const insertedOpportunity = await tx
      .insert(opportunities)
      .values({
        id: opportunityId,
        careerId: career.id,
        type: "PRODUCER_INTRO",
        sourceEntityType: "CHARACTER",
        sourceEntityId: thabo.id,
        status: "AVAILABLE",
        availableAt: now,
        payload: {
          producerIds: producerRows.map((producer) => producer.id),
          introducedBy: thabo.name,
        },
      })
      .onConflictDoNothing({ target: [opportunities.careerId, opportunities.type] })
      .returning();

    const opportunity = insertedOpportunity[0];
    if (!opportunity) return null;

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.OpportunityCreated,
      actorType: "SYSTEM",
      actorId: thabo.id,
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: gameTime,
      idempotencyKey: `opportunity:${opportunity.id}:created`,
      payload: { type: "PRODUCER_INTRO", producerCount: producerRows.length },
    });

    // Two messages: the greeting, then the offer. Fixtures, not generation.
    const messages = [
      "Heard you're trying to make something. I've been watching who's actually showing up.",
      `I know three producers looking for artists right now. All of them are worth your time for different reasons. Have a look — and don't take the cheapest one just because it's the cheapest.`,
    ];

    for (const [index, content] of messages.entries()) {
      const messageId = ids.generic();

      await tx.insert(npcMessages).values({
        id: messageId,
        conversationId: conversation.id,
        senderType: "CHARACTER",
        content,
        sourceEventId: index === 0 ? contactEvent.id : null,
        payload: index === 1 ? { opportunityId: opportunity.id } : {},
        createdAt: new Date(now.getTime() + index),
      });

      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.NpcMessageSent,
        actorType: "SYSTEM",
        actorId: thabo.id,
        targetType: "NPC_MESSAGE",
        targetId: messageId,
        visibility: "PRIVATE",
        importance: 30,
        occurredAt: gameTime,
        idempotencyKey: `message:${messageId}:sent`,
        payload: { characterName: thabo.name, preview: content.slice(0, 80) },
      });
    }

    await tx
      .update(npcConversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(npcConversations.id, conversation.id));

    return { conversationId: conversation.id, opportunity };
  });

  if (!created) {
    // Lost a race with a concurrent first render; return what exists now.
    const rows = await ctx.db
      .select()
      .from(opportunities)
      .where(and(eq(opportunities.careerId, career.id), eq(opportunities.type, "PRODUCER_INTRO")))
      .limit(1);

    const opportunity = rows[0];
    if (!opportunity) return err(DomainErrors.invalidInput("Couldn't reach the scene right now."));

    return ok({ character: thabo, conversationId: "", opportunity, created: false });
  }

  return ok({
    character: thabo,
    conversationId: created.conversationId,
    opportunity: created.opportunity,
    created: true,
  });
}
