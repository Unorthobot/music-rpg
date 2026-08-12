import { and, desc, eq, inArray } from "drizzle-orm";
import {
  characters,
  npcConversations,
  npcMessages,
  opportunities,
  type CareerRow,
  type CharacterRow,
  type OpportunityRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  playerReplyMessage,
  sessionInviteMessage,
  sessionInviteReplyMessage,
  showcaseOfferMessage,
  showcaseReplyMessage,
  type OfferMoment,
} from "@music-rpg/simulation";
import { ids, ok, type Result, type ShowcaseBilling } from "@music-rpg/shared";
import { contextNow, type CommandContext } from "../context";
import type { DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

/**
 * Telling the player what the world decided.
 *
 * A separate step from the deciding, and the separation is the whole design.
 * The director creates an opportunity; this reads offers that have been
 * persisted and writes the message the source character would send about them.
 * Three properties follow, and all three are requirements rather than
 * conveniences:
 *
 * 1. **A failed message never costs an offer.** This runs outside the director's
 *    transaction, so a conversation row that will not write leaves the offer
 *    exactly as real as it was. Home still surfaces it, the offer detail still
 *    opens, and the player can still take the night. The world does not lose a
 *    promoter's Friday because a message failed.
 * 2. **It is retryable without inventing anything.** Every message is keyed
 *    `opportunity:{id}:{moment}` and written with `onConflictDoNothing`, so
 *    re-running produces the same messages from the same persisted facts. The
 *    next day advance retries whatever did not land.
 * 3. **It creates no opportunity and decides nothing.** It reads rows and writes
 *    prose about them. But it is still a *write*, which is why it belongs to the
 *    day advance and to explicit player actions — never to a render path. A
 *    screen may not conjure a message any more than it may conjure an offer.
 *
 * Copy is deterministic fixtures from `@music-rpg/simulation`. No model is
 * involved and none is needed: what matters is that the fiction arrives from
 * somebody who exists in the world.
 */

/** What has become true about an offer, and therefore what is worth saying. */
function momentOf(row: OpportunityRow): OfferMoment | null {
  switch (row.status) {
    case "AVAILABLE":
      return "OFFER";
    case "ACCEPTED":
    case "RESOLVED":
      return "ACCEPTED";
    case "DECLINED":
      return "DECLINED";
    case "EXPIRED":
      return "EXPIRED";
    case "WITHDRAWN":
      return "WITHDRAWN";
    default:
      return null;
  }
}

/** Identity for one thing said about one offer. */
export function offerMessageKey(opportunityId: string, moment: OfferMoment): string {
  return `opportunity:${opportunityId}:${moment}`;
}

/** The player's own answer in the thread, kept apart from the reply to it. */
function playerMessageKey(opportunityId: string, moment: OfferMoment): string {
  return `opportunity:${opportunityId}:${moment}:player`;
}

type OfferPayload = {
  billing?: ShowcaseBilling;
  offerLine?: string;
  afterReleaseTitle?: string;
};

/** What the source character says about this offer, at this moment. */
function lineFor(
  row: OpportunityRow,
  character: CharacterRow,
  moment: OfferMoment,
): string | null {
  const payload = row.payload as OfferPayload;

  if (row.type === "SHOWCASE_SLOT") {
    if (moment === "OFFER") {
      // Their own words do the inviting; the fixture only adds which end of the
      // bill, because "SUPPORT" is a database value and not something anybody says.
      return showcaseOfferMessage({
        offerLine: payload.offerLine ?? "I've got a night coming up.",
        billing: payload.billing ?? "SUPPORT",
      });
    }
    return showcaseReplyMessage({ promoterSlug: character.slug, moment });
  }

  if (row.type === "SESSION_INVITE") {
    if (moment === "OFFER") {
      return sessionInviteMessage({
        producerSlug: character.slug,
        afterReleaseTitle: payload.afterReleaseTitle ?? null,
      });
    }
    return sessionInviteReplyMessage({ producerSlug: character.slug, moment });
  }

  /*
   * The authored introduction writes its own messages at first contact and has
   * done since M2. Speaking about it here would put a second voice on a thread
   * that already reads correctly.
   */
  return null;
}

export type CommunicateResult = {
  /** Offers that gained a message on this run. */
  spokenAbout: string[];
  /** Offers already spoken about at their current moment. Nothing to do. */
  alreadySaid: number;
};

/**
 * Say whatever has not been said yet.
 *
 * Sweeps every offer whose current moment has no message and writes one. Safe to
 * call repeatedly, safe to call after a partial failure, and safe to call when
 * there is nothing to say.
 */
export async function communicateOpportunities(
  ctx: CommandContext,
  input: { careerId: string; userId: string; opportunityIds?: string[] },
): Promise<Result<CommunicateResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const rows = await ctx.db
    .select()
    .from(opportunities)
    .where(
      input.opportunityIds?.length
        ? and(
            eq(opportunities.careerId, career.id),
            inArray(opportunities.id, input.opportunityIds),
          )
        : eq(opportunities.careerId, career.id),
    )
    .orderBy(desc(opportunities.generatedAtGameTime));

  const spokenAbout: string[] = [];
  let alreadySaid = 0;

  for (const row of rows) {
    const moment = momentOf(row);
    if (!moment || !row.sourceEntityId) continue;

    const said = await speak(ctx, { career, row, moment });
    if (said === "WROTE") spokenAbout.push(row.id);
    if (said === "ALREADY") alreadySaid += 1;
  }

  return ok({ spokenAbout, alreadySaid });
}

/**
 * One message, from one person, about one offer.
 *
 * Isolated per offer on purpose: a promoter whose message cannot be written must
 * not stop the other two from arriving, and the whole point of this step is that
 * a communication failure is survivable.
 */
async function speak(
  ctx: CommandContext,
  input: { career: CareerRow; row: OpportunityRow; moment: OfferMoment },
): Promise<"WROTE" | "ALREADY" | "NOTHING"> {
  const { career, row, moment } = input;

  const characterRows = await ctx.db
    .select()
    .from(characters)
    .where(eq(characters.id, row.sourceEntityId!))
    .limit(1);

  const character = characterRows[0];
  if (!character) return "NOTHING";

  const line = lineFor(row, character, moment);
  if (!line) return "NOTHING";

  const key = offerMessageKey(row.id, moment);

  const existing = await ctx.db
    .select({ id: npcMessages.id })
    .from(npcMessages)
    .where(eq(npcMessages.idempotencyKey, key))
    .limit(1);

  if (existing[0]) return "ALREADY";

  const now = contextNow(ctx);

  return ctx.db.transaction(async (tx) => {
    /*
     * The conversation, per career and character. Every promoter and producer
     * gets their own thread — the schema has always allowed this and until now
     * only Thabo has ever been in the list.
     */
    await tx
      .insert(npcConversations)
      .values({
        id: ids.generic(),
        careerId: career.id,
        characterId: character.id,
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
          eq(npcConversations.characterId, character.id),
        ),
      )
      .limit(1);

    const conversation = conversationRows[0];
    if (!conversation) return "NOTHING" as const;

    /*
     * A decision the player made is recorded as the player's own line, before
     * the answer to it. Without this the thread reads as a promoter replying to
     * nothing — the fiction only closes if the player is visibly in it.
     */
    if (moment === "ACCEPTED" || moment === "DECLINED") {
      await tx
        .insert(npcMessages)
        .values({
          id: ids.generic(),
          conversationId: conversation.id,
          senderType: "PLAYER",
          content: playerReplyMessage(moment),
          idempotencyKey: playerMessageKey(row.id, moment),
          payload: { opportunityId: row.id },
          // Read the moment it is written: the player said it.
          readAt: now,
          createdAt: now,
        })
        .onConflictDoNothing({ target: npcMessages.idempotencyKey });
    }

    const messageId = ids.generic();

    const inserted = await tx
      .insert(npcMessages)
      .values({
        id: messageId,
        conversationId: conversation.id,
        senderType: "CHARACTER",
        content: line,
        idempotencyKey: key,
        /*
         * The offer this is about, so the thread can render the same projection
         * every other surface renders rather than restating the terms in prose.
         */
        payload: { opportunityId: row.id, moment },
        createdAt: new Date(now.getTime() + 1),
      })
      .onConflictDoNothing({ target: npcMessages.idempotencyKey })
      .returning();

    // Somebody else won the race. Their message is as good as this one.
    if (!inserted[0]) return "ALREADY" as const;

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.NpcMessageSent,
      actorType: "SYSTEM",
      actorId: character.id,
      targetType: "NPC_MESSAGE",
      targetId: messageId,
      visibility: "PRIVATE",
      importance: 30,
      occurredAt: career.currentGameDate,
      idempotencyKey: `message:${messageId}:sent`,
      payload: {
        characterName: character.name,
        preview: line.slice(0, 80),
        opportunityId: row.id,
        moment,
      },
    });

    await tx
      .update(npcConversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(npcConversations.id, conversation.id));

    return "WROTE" as const;
  });
}
