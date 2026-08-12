import { and, desc, eq, inArray } from "drizzle-orm";
import {
  gameEvents,
  type CareerRow,
  type Database,
  type GameEventRow,
} from "@music-rpg/database";
import type { PlayerOffer } from "@music-rpg/shared";
import { getOfferHistory } from "./opportunity-view";

/**
 * Awareness, and nothing else.
 *
 * A notification is a pointer at something that already exists somewhere better:
 * a message to read, an offer to answer, a night now on the calendar. It is
 * never a second copy of that state, and it is never the thing itself — if every
 * notification in this list were lost, the player would have lost nothing but
 * the prompt. The opportunity remains canonical.
 *
 * Which is also why this is derived from the canonical event log rather than
 * stored: there is no notification table to fall out of step, no read-state to
 * reconcile, and no path by which a failed notification could cost somebody
 * their Friday.
 */

export type Notification = {
  id: string;
  /** What happened, in a line. */
  line: string;
  /** Where the player goes. Message, offer, or the consequence. */
  href: string;
  /** In game time. */
  occurredAt: Date;
  /** Something to answer, or something that has already happened. */
  tone: "ASKING" | "DONE";
};

/** Which events are worth surfacing as awareness. */
const NOTIFIED = [
  "opportunity.created",
  "opportunity.accepted",
  "opportunity.expired",
  "opportunity.withdrawn",
] as const;

export async function getNotifications(
  db: Database,
  career: CareerRow,
  limit = 20,
): Promise<Notification[]> {
  const [events, offers] = await Promise.all([
    db
      .select()
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.careerId, career.id),
          inArray(gameEvents.eventType, [...NOTIFIED]),
        ),
      )
      .orderBy(desc(gameEvents.sequence))
      .limit(limit * 2),
    // The same projection every surface reads. A notification never phrases the
    // offer for itself.
    getOfferHistory(db, career),
  ]);

  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  const notifications: Notification[] = [];

  for (const event of events) {
    const offer = event.targetId ? byId.get(event.targetId) : undefined;
    if (!offer) continue;

    const entry = describe(event, offer);
    if (entry) notifications.push(entry);
  }

  return notifications.slice(0, limit);
}

function describe(event: GameEventRow, offer: PlayerOffer): Notification | null {
  const base = { id: event.id, occurredAt: event.occurredAt };

  switch (event.eventType) {
    case "opportunity.created":
      // Point at the message when there is one: somebody got in touch, and the
      // thread is where that happened.
      return {
        ...base,
        line: askingLine(offer),
        href: offer.source.conversationId
          ? `/messages/${offer.source.conversationId}`
          : offer.href,
        tone: "ASKING",
      };

    case "opportunity.accepted":
      return {
        ...base,
        line:
          offer.type === "SESSION_INVITE"
            ? `You booked another session with ${offer.source.name}`
            : `You took ${offer.night?.nightName ?? "the night"}${
                offer.night?.sceneName ? `, ${offer.night.sceneName}` : ""
              }`,
        // The consequence, which is the point of telling them.
        href: offer.sessionId ? `/studio/session/${offer.sessionId}` : "/calendar",
        tone: "DONE",
      };

    case "opportunity.expired":
      return {
        ...base,
        line: `${offer.source.name} stopped waiting`,
        href: offer.source.conversationId
          ? `/messages/${offer.source.conversationId}`
          : offer.href,
        tone: "DONE",
      };

    case "opportunity.withdrawn":
      return {
        ...base,
        line: offer.displacedBy
          ? `${offer.source.name}'s offer fell away — you took ${offer.displacedBy.what}`
          : `${offer.source.name}'s offer is no longer possible`,
        href: offer.href,
        tone: "DONE",
      };

    default:
      return null;
  }
}

/** What somebody is asking for, in the player's language. */
function askingLine(offer: PlayerOffer): string {
  if (offer.type === "SESSION_INVITE") {
    return `${offer.source.name} wants to make another record`;
  }
  if (offer.type === "PRODUCER_INTRO") {
    return `${offer.source.name} knows three producers looking for artists`;
  }
  return offer.night?.sceneName
    ? `${offer.source.name} has a slot on a bill in ${offer.night.sceneName}`
    : `${offer.source.name} has a night for you`;
}
