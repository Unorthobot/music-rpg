import { and, asc, desc, eq } from "drizzle-orm";
import {
  calendarItems,
  characters,
  npcConversations,
  opportunities,
  opportunityConflicts,
  scenes,
  type CalendarItemRow,
  type CareerRow,
  type CharacterRow,
  type Database,
  type OpportunityConflictRow,
  type OpportunityRow,
  type SceneRow,
} from "@music-rpg/database";
import {
  BILLING_LABELS,
  OFFER_OUTCOME_LABELS,
  type CompetingOffer,
  type OfferGroup,
  type OfferNight,
  type OfferSource,
  type OfferTable,
  type PlayerOffer,
  type PlayerOfferOutcome,
  type ShowcaseBilling,
} from "@music-rpg/shared";

/**
 * Offers, as the player is allowed to read them.
 *
 * The other half of `queries/opportunities.ts`, and the split is the point. That
 * file is World Control's: it hands back whole rows, whole traces, whole
 * eligibility results, because an inspector that cannot see the reasoning cannot
 * inspect anything. This file is the player's, and it hands back `PlayerOffer` —
 * a closed shape assembled field by field, with no path from a component back to
 * the row it came from.
 *
 * The distinction is structural rather than stylistic. `getCareerOpportunities`
 * returns `OpportunityRow`, so `.ranking.score` is one dot away; nothing here
 * returns a row at all, so the same expression does not typecheck. That is the
 * only version of this boundary that survives contact with a deadline.
 *
 * **Nothing here writes.** Every function is a read over persisted state. Opening
 * a screen must not create an offer, expire one, or cause a message to be
 * written — the world decides on a day advance and these functions reveal what it
 * decided.
 */

const DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ reading */

/** Everything the projection needs, loaded once for a whole page. */
type OfferContext = {
  now: Date;
  people: CharacterRow[];
  sceneRows: SceneRow[];
  conversations: { id: string; characterId: string }[];
  conflicts: OpportunityConflictRow[];
  bookings: CalendarItemRow[];
  /** Every offer in the career, so a displacing offer can be named. */
  all: OpportunityRow[];
};

async function loadContext(db: Database, career: CareerRow): Promise<OfferContext> {
  const [all, people, sceneRows, conversationRows, conflicts, bookings] = await Promise.all([
    db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, career.id))
      .orderBy(desc(opportunities.generatedAtGameTime), desc(opportunities.createdAt)),
    db.select().from(characters).where(eq(characters.worldId, career.worldId)),
    db.select().from(scenes).where(eq(scenes.worldId, career.worldId)),
    db
      .select({ id: npcConversations.id, characterId: npcConversations.characterId })
      .from(npcConversations)
      .where(eq(npcConversations.careerId, career.id)),
    db.select().from(opportunityConflicts).where(eq(opportunityConflicts.careerId, career.id)),
    db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.careerId, career.id))
      .orderBy(asc(calendarItems.startGameTime)),
  ]);

  return {
    now: career.currentGameDate,
    people,
    sceneRows,
    conversations: conversationRows,
    conflicts,
    bookings,
    all,
  };
}

/* --------------------------------------------------------------- projecting */

/**
 * What the offer's payload is allowed to contain.
 *
 * Named explicitly rather than read as `Record<string, unknown>`, so that a
 * future director adding a diagnostic field to the payload cannot have it
 * accidentally forwarded to a screen. Anything not in this type does not reach
 * the projection, whatever the row happens to hold.
 */
type ReadablePayload = {
  promoterName?: string;
  nightName?: string;
  sceneName?: string;
  billing?: ShowcaseBilling;
  capacity?: number;
  payoutMinor?: number;
  offerLine?: string;
  termsLine?: string;
  nightGameTime?: string;
  producerName?: string;
  sessionCostMinor?: number;
  afterReleaseTitle?: string;
  proposedGameTime?: string;
  /** Written when an accepted invitation became a real session. */
  sessionId?: string;
  /** Written when the authored introduction was answered. */
  selectedProducerId?: string;
  /*
   * A challenge. The rival's own words, the room they picked, and how big it is
   * — everything a person deciding whether to stand in it would want, and
   * nothing about what either of them can do.
   */
  rivalName?: string;
  venueName?: string;
  challengeLine?: string;
};

/** The four endings and the one live state, in the player's vocabulary. */
function outcomeOf(row: OpportunityRow): PlayerOfferOutcome {
  switch (row.status) {
    case "AVAILABLE":
      return "WAITING";
    case "ACCEPTED":
    case "RESOLVED":
      return "TAKEN";
    case "DECLINED":
      return "TURNED_DOWN";
    case "EXPIRED":
      return "LAPSED";
    case "WITHDRAWN":
      return "GONE";
  }
}

/**
 * How long there is, said the way a person would say it.
 *
 * The date itself is fine at a distance and useless up close: "answer by 14
 * January" tells a player nothing about urgency on the 13th. Inside two days it
 * becomes relative, which is the only form that carries the pressure the offer
 * actually has.
 */
function answerByLabel(expiresAt: Date | null, now: Date): string | null {
  if (!expiresAt) return null;

  const days = Math.round((startOfDay(expiresAt) - startOfDay(now)) / DAY);

  if (days <= 0) return "Last day to answer";
  if (days === 1) return "Answer by tomorrow";
  if (days === 2) return "2 days to answer";

  return `Answer by ${formatDay(expiresAt)}`;
}

function startOfDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function formatDay(value: Date): string {
  return value.toLocaleDateString("en-ZA", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** Their part in the world, as a person is introduced. Never a raw enum. */
function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ");
}

/** A phrase naming what somebody is offering: "Rooftop hours · Braamfontein". */
function whatOf(row: OpportunityRow): string {
  const payload = row.payload as ReadablePayload;

  if (row.type === "SESSION_INVITE") return "Another session";
  if (row.type === "PRODUCER_INTRO") return "Three producers";
  if (row.type === "BATTLE_CHALLENGE") {
    return [payload.venueName, payload.sceneName].filter(Boolean).join(" · ") || "A battle";
  }

  return [payload.nightName, payload.sceneName].filter(Boolean).join(" · ") || "A night";
}

/**
 * One offer, assembled field by field.
 *
 * Deliberately written as an explicit construction rather than a spread with
 * deletions. A spread would mean every new column on `opportunities` is
 * player-facing by default and private only if somebody remembers to remove it;
 * this way the default is that nothing crosses.
 */
function projectOffer(row: OpportunityRow, context: OfferContext): PlayerOffer {
  const payload = row.payload as ReadablePayload;
  const character = context.people.find((person) => person.id === row.sourceEntityId) ?? null;
  const scene = context.sceneRows.find((entry) => entry.id === row.sceneId) ?? null;

  const source: OfferSource = {
    characterId: row.sourceEntityId ?? "",
    name: character?.name ?? payload.promoterName ?? payload.producerName ?? "Someone",
    role: character ? roleLabel(character.role) : "",
    origin: character?.origin ?? null,
    conversationId:
      context.conversations.find((entry) => entry.characterId === row.sourceEntityId)?.id ?? null,
  };

  const outcome = outcomeOf(row);

  return {
    id: row.id,
    type: row.type,
    source,
    headline: headlineOf(row),
    /* A challenge arrives in the rival's own words, which is their offer line. */
    offerLine: payload.offerLine ?? payload.challengeLine ?? null,
    termsLine: payload.termsLine ?? null,
    night: nightOf(row, scene),
    feeMinor: feeOf(row),
    feeDirection:
      row.type === "SHOWCASE_SLOT" ? "EARNS" : row.type === "SESSION_INVITE" ? "COSTS" : null,
    outcome,
    outcomeLabel: OFFER_OUTCOME_LABELS[outcome],
    answerBy: outcome === "WAITING" ? row.expiresAtGameTime : null,
    answerByLabel:
      outcome === "WAITING" ? answerByLabel(row.expiresAtGameTime, context.now) : null,
    competingWith: competingWith(row, context),
    displacedBy: displacedBy(row, context),
    calendarItemId: bookingOf(row, context)?.id ?? null,
    sessionId: payload.sessionId ?? null,
    /*
     * One canonical route per offer, with exactly one exception: the authored
     * introduction keeps the producer-selection screen it has had since M2,
     * because choosing between three people is a different interaction from
     * answering one. The player cannot tell that one of these is authored, which
     * is the requirement — only that this particular card goes somewhere else.
     */
    href: row.type === "PRODUCER_INTRO" ? "/opportunities/producers" : `/opportunities/${row.id}`,
    offeredAt: row.generatedAtGameTime ?? row.availableAtGameTime ?? row.createdAt,
  };
}

/** What this is, in a phrase. The type name never appears. */
function headlineOf(row: OpportunityRow): string {
  const payload = row.payload as ReadablePayload;

  if (row.type === "SESSION_INVITE") return "Another session";
  if (row.type === "PRODUCER_INTRO") return "Three producers, looking for artists";
  /*
   * Said as the thing it is, and no louder than the booking beside it. The
   * director already ranks a challenge below paid work early in a career, and an
   * interface that made the battle the exciting card would be contradicting the
   * world's own judgement about what matters to this career right now.
   */
  if (row.type === "BATTLE_CHALLENGE") {
    return payload.rivalName ? `${payload.rivalName} called you out` : "Somebody called you out";
  }

  return payload.billing ? BILLING_LABELS[payload.billing] : "A slot on a bill";
}

function nightOf(row: OpportunityRow, scene: SceneRow | null): OfferNight | null {
  const payload = row.payload as ReadablePayload;
  const stamp = payload.nightGameTime ?? payload.proposedGameTime;
  if (!stamp) return null;

  return {
    at: new Date(stamp),
    /* A battle's night is named by the room, because nobody named the night. */
    nightName: payload.nightName ?? payload.venueName ?? null,
    sceneName: payload.sceneName ?? scene?.name ?? null,
    capacity: payload.capacity ?? null,
  };
}

function feeOf(row: OpportunityRow): number | null {
  const payload = row.payload as ReadablePayload;
  if (row.type === "SHOWCASE_SLOT") return payload.payoutMinor ?? null;
  if (row.type === "SESSION_INVITE") return payload.sessionCostMinor ?? null;
  return null;
}

/** The booking this offer became, found through the calendar's own link. */
function bookingOf(row: OpportunityRow, context: OfferContext): CalendarItemRow | null {
  const payload = row.payload as ReadablePayload;

  const direct = context.bookings.find(
    (item) => item.relatedEntityType === "OPPORTUNITY" && item.relatedEntityId === row.id,
  );
  if (direct) return direct;

  // An accepted invitation books a studio session, and the calendar item points
  // at the session rather than at the offer that produced it.
  if (!payload.sessionId) return null;

  return (
    context.bookings.find(
      (item) =>
        item.relatedEntityType === "CREATIVE_SESSION" && item.relatedEntityId === payload.sessionId,
    ) ?? null
  );
}

/**
 * Live offers wanting the same night.
 *
 * Read from the recorded conflict rather than recomputed, so what the player is
 * warned about and what accepting will actually withdraw are the same fact. The
 * conflict's `kind` does not cross: "CALENDAR_SLOT" is how the world models it,
 * and "both want Friday the 19th" is what a person needs to know.
 */
function competingWith(row: OpportunityRow, context: OfferContext): CompetingOffer[] {
  if (row.status !== "AVAILABLE") return [];

  const otherIds = context.conflicts
    .filter((pair) => pair.opportunityId === row.id || pair.otherOpportunityId === row.id)
    .map((pair) => (pair.opportunityId === row.id ? pair.otherOpportunityId : pair.opportunityId));

  return context.all
    .filter((other) => otherIds.includes(other.id) && other.status === "AVAILABLE")
    .map((other) => {
      const payload = other.payload as ReadablePayload;
      const stamp = payload.nightGameTime ?? payload.proposedGameTime;
      const person = context.people.find((entry) => entry.id === other.sourceEntityId);

      return {
        offerId: other.id,
        who: person?.name ?? payload.promoterName ?? "Someone",
        what: whatOf(other),
        night: stamp ? new Date(stamp) : new Date(0),
      };
    })
    .sort((first, second) => first.offerId.localeCompare(second.offerId));
}

/**
 * What displaced this one, named.
 *
 * A withdrawal the player cannot attribute is indistinguishable from a bug. The
 * row already records which offer made it impossible, so the answer is a lookup
 * rather than an inference.
 */
function displacedBy(
  row: OpportunityRow,
  context: OfferContext,
): { offerId: string; who: string; what: string } | null {
  if (!row.withdrawnForOpportunityId) return null;

  const other = context.all.find((entry) => entry.id === row.withdrawnForOpportunityId);
  if (!other) return null;

  const payload = other.payload as ReadablePayload;
  const person = context.people.find((entry) => entry.id === other.sourceEntityId);

  return {
    offerId: other.id,
    who: person?.name ?? payload.promoterName ?? "Someone",
    what: whatOf(other),
  };
}

/* ----------------------------------------------------------------- querying */

/**
 * Everything currently being asked of this career.
 *
 * Ordered newest-offered first as a stable fallback, then grouped so that two
 * offers wanting one night arrive as a single block. The director's ranking is
 * *not* re-derived here — a projection that recomputed a score would be a second
 * director, and this one is not allowed to decide anything.
 */
export async function getOfferTable(db: Database, career: CareerRow): Promise<OfferTable> {
  const context = await loadContext(db, career);

  const live = context.all.filter((row) => row.status === "AVAILABLE");
  const offers = live.map((row) => projectOffer(row, context));

  /*
   * Things that stopped being possible while their night is still ahead. The
   * player is told what happened where the offer was, rather than finding a card
   * missing — and once the world passes the date they leave on their own,
   * because by then they are history rather than news.
   */
  const recentlyEnded = context.all
    .filter((row) => row.status === "WITHDRAWN" || row.status === "EXPIRED")
    .map((row) => projectOffer(row, context))
    .filter((offer) => offer.night !== null && offer.night.at >= career.currentGameDate);

  return {
    offers,
    groups: groupByNight(offers),
    count: offers.length,
    recentlyEnded,
  };
}

/**
 * The same offers, with a shared night held together.
 *
 * The grouping is the interface requirement from the specification: a clash has
 * to be visible before a destructive choice, and two cards that can be separated
 * by a scroll position are not visibly a clash.
 */
function groupByNight(offers: PlayerOffer[]): OfferGroup[] {
  const groups: OfferGroup[] = [];
  const placed = new Set<string>();

  for (const offer of offers) {
    if (placed.has(offer.id)) continue;

    const competitors = offer.competingWith
      .map((entry) => offers.find((candidate) => candidate.id === entry.offerId))
      .filter((entry): entry is PlayerOffer => entry !== undefined);

    if (competitors.length === 0) {
      placed.add(offer.id);
      groups.push({ sharedNight: null, offers: [offer] });
      continue;
    }

    const together = [offer, ...competitors];
    for (const entry of together) placed.add(entry.id);

    groups.push({ sharedNight: offer.night?.at ?? null, offers: together });
  }

  return groups;
}

/** One offer, whatever became of it. Null when it is not this career's. */
export async function getOffer(
  db: Database,
  career: CareerRow,
  opportunityId: string,
): Promise<PlayerOffer | null> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.careerId, career.id)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return projectOffer(row, await loadContext(db, career));
}

/**
 * Every offer this career has ever had, newest first.
 *
 * History, including the ones that ended. An offer that lapsed is not deleted
 * from existence — the player turned nothing down, and a career that quietly lost
 * three nights should be able to see that it did.
 */
export async function getOfferHistory(
  db: Database,
  career: CareerRow,
): Promise<PlayerOffer[]> {
  const context = await loadContext(db, career);
  return context.all.map((row) => projectOffer(row, context));
}

/**
 * The offers attached to one conversation.
 *
 * What lets a thread show the offer it is about without reconstructing it. The
 * card in Messages and the card on Home are the same projection of the same row,
 * which is the property the cross-surface test exists to protect.
 */
export async function getOffersForCharacter(
  db: Database,
  career: CareerRow,
  characterId: string,
): Promise<PlayerOffer[]> {
  const context = await loadContext(db, career);

  return context.all
    .filter((row) => row.sourceEntityId === characterId)
    .map((row) => projectOffer(row, context));
}

/**
 * The offer behind each calendar entry, keyed by calendar item.
 *
 * Causality has to read backwards — calendar → offer → message → person — and
 * this is the first arrow. Without it a booking is a row with a title on it.
 * Built as one map rather than a lookup per item so the calendar stays a single
 * pass over what it already loaded.
 */
export async function getCalendarOffers(
  db: Database,
  career: CareerRow,
): Promise<Map<string, PlayerOffer>> {
  const context = await loadContext(db, career);
  const byItem = new Map<string, PlayerOffer>();

  for (const row of context.all) {
    const booking = bookingOf(row, context);
    if (booking) byItem.set(booking.id, projectOffer(row, context));
  }

  return byItem;
}

/** Used by the leakage tests: the exact key set a player-facing offer may carry. */
export const PLAYER_OFFER_KEYS = [
  "id",
  "type",
  "source",
  "headline",
  "offerLine",
  "termsLine",
  "night",
  "feeMinor",
  "feeDirection",
  "outcome",
  "outcomeLabel",
  "answerBy",
  "answerByLabel",
  "competingWith",
  "displacedBy",
  "calendarItemId",
  "sessionId",
  "href",
  "offeredAt",
] as const;
