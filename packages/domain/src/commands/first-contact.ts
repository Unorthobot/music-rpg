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
import {
  OPPORTUNITY_DIRECTOR_VERSION,
  err,
  ids,
  ok,
  type Result,
} from "@music-rpg/shared";
import { contextNow, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

export type FirstContactResult = {
  character: CharacterRow;
  conversationId: string;
  opportunity: OpportunityRow;
  created: boolean;
};

/** Identity for the one authored offer Thabo makes. Per career, once, forever. */
export function firstContactIdentityKey(careerSlug: string): string {
  return `authored:first_contact:${careerSlug}`;
}

/**
 * Thabo gets in touch.
 *
 * The first thing that happens to a career is a person, not a notification.
 * This creates the conversation, the message, and the opportunity the message
 * is about — in one transaction, exactly once.
 *
 * **An authored opportunity, and it says so.** Hand-written content on a
 * condition, which is a different thing from what the director assembles and
 * fails in a different way: an authored offer arriving at the wrong moment is a
 * trigger bug, not a scoring one. Same table, same lifecycle, same statuses —
 * and the player cannot tell which it was.
 *
 * **Who calls this matters.** Until M7 it was Home, on render, which was
 * idempotent but made a screen the author of a world fact. The trigger is now
 * `completeCareerOnboarding` — a player's decision, which is where new facts
 * are allowed to come from. Repeat calls remain harmless, because idempotency is
 * a property of the command rather than of who happens to call it.
 *
 * Exactly-once is enforced by the identity key rather than by the old unique
 * index on `(career_id, type)`: that index had to go so two promoters could
 * both want you, and this is what replaced it.
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

  const identityKey = firstContactIdentityKey(career.id);

  const existingOpportunity = await ctx.db
    .select()
    .from(opportunities)
    .where(
      and(eq(opportunities.careerId, career.id), eq(opportunities.idempotencyKey, identityKey)),
    )
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
        origin: "AUTHORED",
        sourceEntityType: "CHARACTER",
        sourceEntityId: thabo.id,
        status: "AVAILABLE",
        idempotencyKey: identityKey,
        // In his own terms, and deliberately not an echo of an event label.
        triggerReason: "A new name showed up in the scene, and Thabo keeps track of those.",
        triggerState: { careerAct: career.careerAct, producerCount: producerRows.length },
        directorVersion: OPPORTUNITY_DIRECTOR_VERSION,
        availableAt: now,
        availableAtGameTime: gameTime,
        generatedAtGameTime: gameTime,
        /*
         * No expiry. Thabo's introduction is how a career begins, and a player
         * who leaves for a month must still find a way in — which is a decision
         * about this offer, not a hole in the expiry mechanism.
         */
        expiresAtGameTime: null,
        payload: {
          producerIds: producerRows.map((producer) => producer.id),
          introducedBy: thabo.name,
        },
      })
      .onConflictDoNothing({
        target: [opportunities.careerId, opportunities.idempotencyKey],
      })
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
      payload: {
        type: "PRODUCER_INTRO",
        origin: "AUTHORED",
        producerCount: producerRows.length,
      },
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
    // Lost a race with a concurrent caller; return what exists now.
    const rows = await ctx.db
      .select()
      .from(opportunities)
      .where(
        and(eq(opportunities.careerId, career.id), eq(opportunities.idempotencyKey, identityKey)),
      )
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
