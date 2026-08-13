import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  calendarItems,
  characters,
  creativeSessions,
  gameEvents,
  npcConversations,
  npcMessages,
  opportunities,
  tracks,
  transactions,
  type CalendarItemRow,
  type CharacterRow,
  type CreativeSessionRow,
  type Database,
  type NpcMessageRow,
  type OpportunityRow,
  type TransactionRow,
} from "@music-rpg/database";
import { gameEventLabels } from "@music-rpg/events";
import type { OfferTable, PlayerBattle, PlayerOffer } from "@music-rpg/shared";
import type { CareerRow } from "@music-rpg/database";
import { getOffersForCharacter, getOfferTable } from "./opportunity-view";
import { getBattleAwaitingAngle } from "./battle-view";

/**
 * Career HQ read models.
 *
 * Home has to answer three questions — where am I, what is happening, what
 * should I care about right now — and every answer comes from state. Nothing
 * here writes, and nothing here invents a number or a next step.
 */

/** The single most important thing the player could do next. */
export type RightNow = {
  kind:
    | "FIRST_MESSAGE"
    | "PRODUCER_CHOICE"
    | "SESSION_READY"
    | "SESSION_IN_PROGRESS"
    | "TRACK_COMPLETE"
    /** Somebody wrote about an offer and the player has not read it. */
    | "OFFER_MESSAGE"
    /** Nothing unread, but something is waiting on an answer. */
    | "OFFER_WAITING"
    /**
     * A night they agreed to that still needs an angle.
     *
     * Not an offer — that decision has been made. This is the consequence of
     * having made it, and it is the one prompt on Home the world will actually
     * hold time for.
     */
    | "BATTLE_ANGLE"
    /** Out, and the world is deciding. */
    | "AWAITING_RECEPTION"
    | "NOTHING";
  title: string;
  detail: string;
  href: string;
  cta: string;
};

export type StoryCard = {
  id: string;
  eyebrow: string;
  title: string;
  detail: string;
  href?: string;
  occurredAt: Date;
  state: "OPEN" | "DONE";
};

export type CareerPulse = {
  spentMinor: number;
  sessionsBooked: number;
  sessionsCompleted: number;
  tracksCreated: number;
};

export type CareerHome = {
  rightNow: RightNow;
  story: StoryCard[];
  pulse: CareerPulse;
  unreadMessages: number;
  nextCalendarItem: CalendarItemRow | null;
  activeSession: CreativeSessionRow | null;
  opportunity: OpportunityRow | null;
  /**
   * Everything currently being asked of this career.
   *
   * Empty when the world is not asking for anything, and Home renders *nothing*
   * in that case — not an empty section, not a placeholder, not "no offers".
   * A career with nothing waiting has a shorter Home, not an emptier one, and
   * rendering a container for something that was never offered tells the player
   * the world has a slot they have failed to fill.
   */
  onTheTable: OfferTable;
};

async function countOf(query: Promise<{ value: number }[]>): Promise<number> {
  return (await query)[0]?.value ?? 0;
}

export async function getCareerHome(db: Database, career: CareerRow): Promise<CareerHome> {
  const [conversationRows, opportunityRows, sessionRows, calendarRows, spendRows, trackRows] =
    await Promise.all([
      db
        .select({ conversation: npcConversations, character: characters })
        .from(npcConversations)
        .innerJoin(characters, eq(characters.id, npcConversations.characterId))
        .where(eq(npcConversations.careerId, career.id)),
      /*
       * Scoped to the producer introduction on purpose. "Right now" turns an
       * available opportunity into a link to the producer-selection screen, so
       * once the director can produce a showcase invitation, the newest
       * opportunity of *any* type would point a promoter's night at the wrong
       * page. Home's producer prompt is about the producer prompt.
       */
      db
        .select()
        .from(opportunities)
        .where(
          and(
            eq(opportunities.careerId, career.id),
            eq(opportunities.type, "PRODUCER_INTRO"),
          ),
        )
        .orderBy(desc(opportunities.createdAt)),
      db
        .select()
        .from(creativeSessions)
        .where(eq(creativeSessions.careerId, career.id))
        .orderBy(desc(creativeSessions.createdAt)),
      db
        .select()
        .from(calendarItems)
        .where(eq(calendarItems.careerId, career.id))
        .orderBy(asc(calendarItems.startGameTime)),
      db
        .select({ value: sql<number>`coalesce(sum(amount_minor), 0)::int` })
        .from(transactions)
        .where(and(eq(transactions.careerId, career.id), eq(transactions.direction, "DEBIT"))),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(gameEvents)
        .where(and(eq(gameEvents.careerId, career.id), eq(gameEvents.eventType, "track.saved_to_catalogue"))),
    ]);

  const conversationIds = conversationRows.map((row) => row.conversation.id);
  const unreadMessages = conversationIds.length
    ? await countOf(
        db
          .select({ value: sql<number>`count(*)::int` })
          .from(npcMessages)
          .where(and(isNull(npcMessages.readAt), ne(npcMessages.senderType, "PLAYER"))),
      )
    : 0;

  const opportunity = opportunityRows[0] ?? null;
  const activeSession =
    sessionRows.find((session) => !["COMPLETED", "CANCELLED"].includes(session.status)) ?? null;
  const completedSessions = sessionRows.filter((session) => session.status === "COMPLETED");
  const nextCalendarItem =
    calendarRows.find((item) => item.status === "SCHEDULED" || item.status === "ACTIVE") ?? null;
  const tracksCreated = trackRows[0]?.value ?? 0;
  const releasedTracks = await countOf(
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(tracks)
      .where(and(eq(tracks.careerId, career.id), isNotNull(tracks.releasedAt))),
  );

  /*
   * The live set, through the player-facing projection rather than from the
   * rows. Home has no more access to the director's reasoning than any other
   * screen — it is simply the screen that shows the most of what a player is
   * allowed to know.
   */
  const onTheTable = await getOfferTable(db, career);

  const rightNow = resolveRightNow({
    hasConversation: conversationRows.length > 0,
    unreadMessages,
    opportunity,
    activeSession,
    tracksCreated,
    releasedTracks,
    conversationId: conversationRows[0]?.conversation.id ?? null,
    producerName: conversationRows[0]?.character.name ?? "someone",
    onTheTable,
    unreadOfferMessage: await findUnreadOfferMessage(db, onTheTable),
    /*
     * A night the career agreed to that still needs an answer. Read through the
     * player projection like everything else here — Home has no more access to a
     * battle's internals than any other screen.
     */
    battleAwaitingAngle: await getBattleAwaitingAngle(db, career),
  });

  return {
    rightNow,
    story: await buildStory(db, career),
    pulse: {
      spentMinor: spendRows[0]?.value ?? 0,
      sessionsBooked: sessionRows.length,
      sessionsCompleted: completedSessions.length,
      tracksCreated,
    },
    unreadMessages,
    nextCalendarItem,
    activeSession,
    opportunity,
    onTheTable,
  };
}

/**
 * An offer somebody has written about and the player has not read.
 *
 * "Right now" points at the message rather than the offer in that case, because
 * the fiction is that a person got in touch — and reading what they said is the
 * step before deciding. Once it has been read, the offer itself becomes the
 * pressing thing.
 */
async function findUnreadOfferMessage(
  db: Database,
  table: OfferTable,
): Promise<{ conversationId: string; who: string; offer: PlayerOffer } | null> {
  if (table.offers.length === 0) return null;

  const conversationIds = table.offers
    .map((offer) => offer.source.conversationId)
    .filter((id): id is string => id !== null);

  if (conversationIds.length === 0) return null;

  const unread = await db
    .select({ conversationId: npcMessages.conversationId, payload: npcMessages.payload })
    .from(npcMessages)
    .where(
      and(
        inArray(npcMessages.conversationId, conversationIds),
        isNull(npcMessages.readAt),
        ne(npcMessages.senderType, "PLAYER"),
      ),
    )
    .orderBy(desc(npcMessages.createdAt));

  for (const message of unread) {
    const offerId = (message.payload as { opportunityId?: string }).opportunityId;
    const offer = table.offers.find((entry) => entry.id === offerId);
    if (offer && offer.source.conversationId) {
      return {
        conversationId: offer.source.conversationId,
        who: offer.source.name,
        offer,
      };
    }
  }

  return null;
}

function resolveRightNow(input: {
  hasConversation: boolean;
  unreadMessages: number;
  opportunity: OpportunityRow | null;
  activeSession: CreativeSessionRow | null;
  tracksCreated: number;
  releasedTracks: number;
  conversationId: string | null;
  producerName: string;
  onTheTable: OfferTable;
  unreadOfferMessage: { conversationId: string; who: string; offer: PlayerOffer } | null;
  battleAwaitingAngle: PlayerBattle | null;
}): RightNow {
  // Order matters: this is a priority list, not a set of cards.

  /*
   * Above everything, because it is the one thing on this list the world is
   * genuinely waiting on. Until it is answered, letting a day pass will be
   * refused — so a player who was not told would press the button, be turned
   * away, and have no idea why.
   *
   * Consequence-of-commitment language, and deliberately not encouragement. It
   * names a night they already agreed to and the decision it still needs; it
   * does not suggest battling, does not warn about missing anything, and does
   * not appear at all for a career that turned the challenge down.
   */
  if (input.battleAwaitingAngle) {
    return {
      kind: "BATTLE_ANGLE",
      title: `You're on with ${input.battleAwaitingAngle.rival.name}.`,
      detail: "You still need to decide how you're going in.",
      href: input.battleAwaitingAngle.href,
      cta: "Decide how you're going in",
    };
  }

  if (input.activeSession && input.activeSession.status !== "SCHEDULED") {
    return {
      kind: "SESSION_IN_PROGRESS",
      title: "You're mid-session.",
      detail: "The room is still open. Pick up where you left off.",
      href: `/studio/session/${input.activeSession.id}`,
      cta: "Back to the studio",
    };
  }

  if (input.activeSession) {
    return {
      kind: "SESSION_READY",
      title: "Your first studio session is ready.",
      detail: "Booked and paid for. Nothing happens until you walk in.",
      href: `/studio/session/${input.activeSession.id}`,
      cta: "Enter the studio",
    };
  }

  if (input.opportunity && input.opportunity.status === "AVAILABLE") {
    if (input.unreadMessages > 0 && input.conversationId) {
      return {
        kind: "FIRST_MESSAGE",
        title: "Thabo sent you a message.",
        detail: "Somebody in the scene noticed you were trying.",
        href: `/messages/${input.conversationId}`,
        cta: "Read it",
      };
    }
    return {
      kind: "PRODUCER_CHOICE",
      title: "Three producers are looking for artists.",
      detail: "Pick the one you'd actually want in the room.",
      href: "/opportunities/producers",
      cta: "See who's available",
    };
  }

  /*
   * Somebody got in touch and the player has not read it.
   *
   * Above the release and beneath an active session, which is the honest
   * ordering: a room you are already standing in outranks a message, and a
   * message from a person outranks a number that will still be there tomorrow.
   * The unread one comes first because the fiction is that somebody wrote to
   * you — the offer is what the message is *about*.
   */
  if (input.unreadOfferMessage) {
    const { who, offer, conversationId } = input.unreadOfferMessage;

    return {
      kind: "OFFER_MESSAGE",
      title: `${who} sent you a message.`,
      detail:
        offer.night?.sceneName != null
          ? `Somebody in ${offer.night.sceneName} wants you on a bill.`
          : `${who} wants to make something with you again.`,
      href: `/messages/${conversationId}`,
      cta: "Read it",
    };
  }

  /*
   * Read, and still waiting on an answer. The one with the least time left
   * leads, because a support slot with three days on it must not be missable —
   * and "soonest to answer" is a fact about the offer rather than a ranking the
   * player is being shown.
   */
  const answerable = input.onTheTable.offers
    .filter((offer) => offer.answerBy !== null)
    .sort((first, second) => first.answerBy!.getTime() - second.answerBy!.getTime());

  const pressing = answerable[0] ?? input.onTheTable.offers[0];

  if (pressing) {
    return {
      kind: "OFFER_WAITING",
      title: `${pressing.source.name} is waiting on an answer.`,
      detail: [pressing.headline, pressing.answerByLabel].filter(Boolean).join(" · "),
      href: pressing.href,
      cta: "Look at it",
    };
  }

  /*
   * Once something is out, the honest next step is waiting on it. "Nobody has
   * heard it yet" was true for the whole of M4 and became a contradiction the
   * moment reception existed — it would sit directly beneath a card reporting
   * how many people have heard it.
   */
  if (input.releasedTracks > 0) {
    return {
      kind: "AWAITING_RECEPTION",
      title: "Your record is out in the world.",
      detail: "What happens next isn't yours to decide. Let the days do their work.",
      href: "/catalogue",
      cta: "See your catalogue",
    };
  }

  if (input.tracksCreated > 0) {
    return {
      kind: "TRACK_COMPLETE",
      title: "Your first track is in your catalogue.",
      detail: "It exists, it's yours, and nobody has heard it yet.",
      href: "/studio",
      cta: "Open the studio",
    };
  }

  return {
    kind: "NOTHING",
    title: "Nothing's waiting on you.",
    detail: "The Underground doesn't come to you. Go and make something happen.",
    href: "/studio",
    cta: "Open the studio",
  };
}

/**
 * Narrative threads, derived from the canonical log.
 *
 * The story is not authored separately from what happened — it is what
 * happened, read back in the player's language.
 */
const STORY_EVENTS: Record<string, { eyebrow: string; state: "OPEN" | "DONE" }> = {
  "career.entered_underground": { eyebrow: "Act I", state: "DONE" },
  "character.first_contact_created": { eyebrow: "The scene", state: "DONE" },
  "opportunity.created": { eyebrow: "Opportunity", state: "OPEN" },
  "producer.selected": { eyebrow: "Collaboration", state: "DONE" },
  "creative_session.created": { eyebrow: "Studio", state: "OPEN" },
  "creative_session.completed": { eyebrow: "Studio", state: "DONE" },
  "track.saved_to_catalogue": { eyebrow: "Catalogue", state: "DONE" },
  /*
   * A night that happened, remembered permanently and neutrally.
   *
   * `battle.resolved` only — the challenge, the angle, the scouting and the
   * preparation are steps, and a career's story is made of things that happened
   * rather than of steps taken toward them. Refusals are remembered where
   * refusals live, in the same register as a declined booking, and nothing here
   * counts battles fought, won or turned down.
   */
  "battle.resolved": { eyebrow: "The scene", state: "DONE" },
};

async function buildStory(db: Database, career: CareerRow): Promise<StoryCard[]> {
  const rows = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.careerId, career.id))
    .orderBy(desc(gameEvents.sequence))
    .limit(60);

  const cards: StoryCard[] = [];

  for (const event of rows) {
    const config = STORY_EVENTS[event.eventType];
    if (!config) continue;

    const payload = event.payload as Record<string, string | number>;

    cards.push({
      id: event.id,
      eyebrow: config.eyebrow,
      title: gameEventLabels[event.eventType as keyof typeof gameEventLabels] ?? event.eventType,
      detail: describeStoryEvent(event.eventType, payload),
      occurredAt: event.occurredAt,
      state: config.state,
    });
  }

  return cards.slice(0, 6);
}

function describeStoryEvent(type: string, payload: Record<string, string | number>): string {
  switch (type) {
    case "career.entered_underground":
      return "You started with nothing but a sound and five thousand rand.";
    case "character.first_contact_created":
      return `${payload.characterName ?? "Someone"} got in touch.`;
    case "opportunity.created":
      return "Producers are looking for artists.";
    case "producer.selected":
      return `You chose ${payload.producerName ?? "a producer"} for your first session.`;
    case "creative_session.created":
      return "A session is on the calendar.";
    case "creative_session.completed":
      return "The session finished.";
    case "track.saved_to_catalogue":
      return `"${payload.title ?? "Untitled"}" is in your catalogue.`;
    /*
     * That it happened, and where. Never who took it and never the decision:
     * the payload carries both, and Career is a list of things that happened
     * rather than the place a result is delivered. The battle's own screen gives
     * the outcome three perspectives and a reason, which is the only honest way
     * to give it at all.
     */
    case "battle.resolved":
      return "You stood in a room with somebody, and three people decided it.";
    default:
      return "";
  }
}

/* --- Messages ------------------------------------------------------------ */

export type ConversationSummary = {
  conversation: { id: string; lastMessageAt: Date | null };
  character: CharacterRow;
  lastMessage: NpcMessageRow | null;
  unread: number;
  /**
   * An offer from this person that is still the player's to answer.
   *
   * What drives the "offer waiting" marker in the list. It disappears once the
   * offer has been answered because the marker is about *the offer's* state, not
   * about whether the message has been read — a thread you have read but not
   * replied to is still somebody waiting on you.
   */
  offerWaiting: PlayerOffer | null;
};

export async function getNPCConversations(
  db: Database,
  career: CareerRow,
): Promise<ConversationSummary[]> {
  const careerId = career.id;

  const rows = await db
    .select({ conversation: npcConversations, character: characters })
    .from(npcConversations)
    .innerJoin(characters, eq(characters.id, npcConversations.characterId))
    .where(eq(npcConversations.careerId, careerId))
    .orderBy(desc(npcConversations.lastMessageAt));

  // The same projection every other surface reads. The list does not get its own
  // idea of what is on offer.
  const live = await getOfferTable(db, career);
  const summaries: ConversationSummary[] = [];

  for (const row of rows) {
    const messages = await db
      .select()
      .from(npcMessages)
      .where(eq(npcMessages.conversationId, row.conversation.id))
      .orderBy(desc(npcMessages.createdAt))
      .limit(1);

    const unread = await countOf(
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(npcMessages)
        .where(
          and(
            eq(npcMessages.conversationId, row.conversation.id),
            isNull(npcMessages.readAt),
            ne(npcMessages.senderType, "PLAYER"),
          ),
        ),
    );

    summaries.push({
      conversation: {
        id: row.conversation.id,
        lastMessageAt: row.conversation.lastMessageAt,
      },
      character: row.character,
      lastMessage: messages[0] ?? null,
      unread,
      offerWaiting:
        live.offers.find((offer) => offer.source.characterId === row.character.id) ?? null,
    });
  }

  return summaries;
}

export type ConversationView = {
  character: CharacterRow;
  messages: NpcMessageRow[];
  /** The authored producer introduction, when this thread is Thabo's. */
  opportunity: OpportunityRow | null;
  /**
   * Every offer this person has made, whatever became of it.
   *
   * The thread renders these as cards from the shared projection rather than
   * restating the terms in prose, which is what keeps the date in Messages and
   * the date on the offer screen the same date rather than two formattings of
   * two readings.
   */
  offers: PlayerOffer[];
};

export async function getNPCConversation(
  db: Database,
  career: CareerRow,
  conversationId: string,
): Promise<ConversationView | null> {
  const careerId = career.id;

  const rows = await db
    .select({ conversation: npcConversations, character: characters })
    .from(npcConversations)
    .innerJoin(characters, eq(characters.id, npcConversations.characterId))
    .where(
      and(eq(npcConversations.id, conversationId), eq(npcConversations.careerId, careerId)),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [messages, introRows, offers] = await Promise.all([
    db
      .select()
      .from(npcMessages)
      .where(eq(npcMessages.conversationId, conversationId))
      .orderBy(asc(npcMessages.createdAt)),
    /*
     * Scoped to the authored introduction and to this person. It used to be
     * "the newest opportunity of any type for this career", which was correct
     * while Thabo was the only correspondent and became wrong the moment a
     * promoter could write to you — Naledi's thread would have offered the
     * producer screen.
     */
    db
      .select()
      .from(opportunities)
      .where(
        and(
          eq(opportunities.careerId, careerId),
          eq(opportunities.type, "PRODUCER_INTRO"),
          eq(opportunities.sourceEntityId, row.character.id),
        ),
      )
      .limit(1),
    getOffersForCharacter(db, career, row.character.id),
  ]);

  return {
    character: row.character,
    messages,
    opportunity: introRows[0] ?? null,
    offers,
  };
}

/* --- Calendar ------------------------------------------------------------ */

export type CalendarView = {
  upcoming: CalendarItemRow[];
  past: CalendarItemRow[];
  careerDate: Date;
};

export async function getCareerCalendar(db: Database, career: CareerRow): Promise<CalendarView> {
  const items = await db
    .select()
    .from(calendarItems)
    .where(eq(calendarItems.careerId, career.id))
    .orderBy(asc(calendarItems.startGameTime));

  return {
    upcoming: items.filter((item) => item.status === "SCHEDULED" || item.status === "ACTIVE"),
    past: items.filter((item) => item.status === "COMPLETED" || item.status === "CANCELLED"),
    careerDate: career.currentGameDate,
  };
}

/* --- Producer opportunity ------------------------------------------------- */

export type ProducerOption = {
  character: CharacterRow;
  costMinor: number;
  soundLine: string;
  strength: string;
  workingStyle: string;
  tradeOff: string;
  quote: string | null;
  affordable: boolean;
};

export type ProducerOpportunityView = {
  opportunity: OpportunityRow;
  options: ProducerOption[];
  balanceMinor: number;
  selectedProducerId: string | null;
};

export async function getProducerOpportunity(
  db: Database,
  career: CareerRow,
): Promise<ProducerOpportunityView | null> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.careerId, career.id), eq(opportunities.type, "PRODUCER_INTRO")))
    .limit(1);

  const opportunity = rows[0];
  if (!opportunity) return null;

  const producerRows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.worldId, career.worldId), eq(characters.role, "PRODUCER")))
    .orderBy(asc(characters.name));

  const options: ProducerOption[] = producerRows.map((character) => {
    const profile = (character.preferences as { producer?: Record<string, string | number> })
      ?.producer;
    const costMinor = Number(profile?.sessionCostMinor ?? 0);

    return {
      character,
      costMinor,
      soundLine: String(profile?.soundLine ?? ""),
      strength: String(profile?.strength ?? ""),
      workingStyle: String(profile?.workingStyle ?? ""),
      tradeOff: String(profile?.tradeOff ?? ""),
      quote: character.quote,
      // Debt is not a mechanic: an unaffordable session is not selectable.
      affordable: career.moneyBalance >= costMinor,
    };
  });

  const payload = opportunity.payload as { selectedProducerId?: string };

  return {
    opportunity,
    options,
    balanceMinor: career.moneyBalance,
    selectedProducerId: payload.selectedProducerId ?? null,
  };
}

/** Newest transactions, for the Career screen and World Control. */
export async function getCareerTransactions(
  db: Database,
  careerId: string,
  limit = 20,
): Promise<TransactionRow[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.careerId, careerId))
    .orderBy(desc(transactions.occurredAt))
    .limit(limit);
}
