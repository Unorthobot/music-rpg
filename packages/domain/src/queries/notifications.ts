import { and, desc, eq, inArray } from "drizzle-orm";
import {
  gameEvents,
  type CareerRow,
  type Database,
  type GameEventRow,
} from "@music-rpg/database";
import { COME_UP_PLAYER_LINE, type PlayerOffer } from "@music-rpg/shared";
import { getOfferHistory } from "./opportunity-view";
import { getCareerBattleHistory } from "./battle-view";

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

/**
 * Which events are worth surfacing as awareness.
 *
 * `battle.resolved` is the M8 addition and the only battle event here, which is
 * the point. A challenge already arrives as `opportunity.created`, because a
 * challenge *is* an offer somebody made; the angle, the scouting and the
 * preparation are the player's own actions and nobody needs telling about their
 * own decisions.
 *
 * What genuinely needs a notification is the one thing that happened **while
 * they were not looking**: the night came round, and three people decided
 * something. A player must be told rather than discovering it.
 *
 * `career.entered_come_up` is the M9 addition and qualifies on exactly that
 * test — it is written by the day advance, so it happens between screens by
 * construction and can be reached no other way.
 *
 * **It appears once because the event happens once**, not because anything here
 * remembers having shown it. The transition is written under
 * `career:<id>:entered_come_up` inside the same transaction that changes the
 * act, and the act update is gated on the row still reading `UNDERGROUND`, so a
 * second event cannot exist to be listed twice. That is the whole mechanism:
 * this list stays derived, keeps no read-state, and consumes nothing.
 */
const NOTIFIED = [
  "opportunity.created",
  "opportunity.accepted",
  "opportunity.expired",
  "opportunity.withdrawn",
  "battle.resolved",
  "career.entered_come_up",
] as const;

export async function getNotifications(
  db: Database,
  career: CareerRow,
  limit = 20,
): Promise<Notification[]> {
  const [events, offers, battles] = await Promise.all([
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
    getCareerBattleHistory(db, career),
  ]);

  const byId = new Map(offers.map((offer) => [offer.id, offer]));
  const battleById = new Map(battles.map((battle) => [battle.id, battle]));
  const notifications: Notification[] = [];

  for (const event of events) {
    /*
     * The chapter changed. Handled before the offer lookup because it has no
     * target: nobody made this happen and there is nothing to answer — the world
     * changed how it relates to this career, which is exactly the kind of thing
     * a player cannot find out by doing anything.
     *
     * Points at Career, where the chapter and the day it began are. Not at Home,
     * whose day-of treatment is gone by tomorrow, and not at World, which says
     * what the scene saw rather than what happened to you.
     */
    if (event.eventType === "career.entered_come_up") {
      notifications.push({
        id: event.id,
        line: COME_UP_PLAYER_LINE,
        href: "/career",
        occurredAt: event.occurredAt,
        tone: "DONE",
      });
      continue;
    }

    if (event.eventType === "battle.resolved") {
      const battle = event.targetId ? battleById.get(event.targetId) : undefined;
      if (!battle) continue;

      notifications.push({
        id: event.id,
        /*
         * That it happened and who it was with — never who took it. The result
         * belongs to the screen that can give it three perspectives and a
         * reason; a notification that led with the outcome would spoil the one
         * moment this milestone builds toward, and a notification that led with
         * a loss would be a defeat delivered as a push alert.
         */
        line: `Your night with ${battle.rival.name} happened`,
        href: battle.href,
        occurredAt: event.occurredAt,
        tone: "DONE",
      });
      continue;
    }

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
