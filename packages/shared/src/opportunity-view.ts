import type { OpportunityType } from "./enums";
import type { ShowcaseBilling } from "./opportunities";

/**
 * An offer, as a player is allowed to see it.
 *
 * The product boundary, expressed as a type. Everything the director knows —
 * why it chose this, what it scored, which rule let it through, what it decided
 * against — is a fact about the machinery, and none of it belongs in front of
 * somebody who has been asked to play a Friday. What crosses this line is what
 * a person asking would actually tell you: who they are, which room, which
 * night, which end of the bill, what it pays, and how long you have.
 *
 * The enforcement is structural rather than a promise. `PlayerOffer` is a closed
 * shape with no index signature and no passthrough of the row it came from, so a
 * component cannot reach `offer.ranking.score` — there is no such path, and a
 * screen that wants one has to change this file, which is the conversation the
 * boundary exists to force.
 *
 * The precedent is M5's reception view and M6's `relationship-view`: the
 * simulation may know tension is 26.64; the screen says "some tension". Same
 * rule, applied to a director that knows considerably more.
 */

/**
 * Where an offer ended up, in the four ways it can end.
 *
 * Kept as four rather than collapsed into "closed" because they are four
 * different things that happened, and the person who offered may well care
 * which. A player who turned a night down did something; a player whose night
 * lapsed did something else; and a night that became impossible because they
 * took another one is not their refusal at all.
 */
export type PlayerOfferOutcome =
  /** Still the player's to answer. */
  | "WAITING"
  /** They said yes and it is on the calendar. */
  | "TAKEN"
  /** They turned it down. */
  | "TURNED_DOWN"
  /** Nobody answered and the date passed. */
  | "LAPSED"
  /** It became impossible because something else was taken that night. */
  | "GONE";

/** What the player is told an outcome means. Never a status name. */
export const OFFER_OUTCOME_LABELS: Record<PlayerOfferOutcome, string> = {
  WAITING: "Waiting on you",
  TAKEN: "Taken",
  TURNED_DOWN: "Turned down",
  LAPSED: "Lapsed",
  GONE: "No longer possible",
};

/**
 * Which end of the bill, in the only terms that matter to somebody deciding.
 *
 * `HEADLINE` and `SUPPORT` are the director's words for the same fact. A player
 * is asked to carry a room or to open a night, which is what the offer actually
 * is — and, not incidentally, the clearest statement the world can make about
 * where a career stands without showing anybody a number.
 */
export const BILLING_LABELS: Record<ShowcaseBilling, string> = {
  HEADLINE: "Carrying the room",
  SUPPORT: "Opening the night",
};

/** The same fact as a verb, for history: "Headlined…", "Opened…". */
export const BILLING_PAST_TENSE: Record<ShowcaseBilling, string> = {
  HEADLINE: "Headlined",
  SUPPORT: "Opened",
};

/** The person asking. A name and a role, never a relationship dimension. */
export type OfferSource = {
  characterId: string;
  name: string;
  /** "Promoter", "Producer" — title case, as a person would be introduced. */
  role: string;
  /** Where they operate. Their origin, not a standing. */
  origin: string | null;
  /** The conversation this offer arrived in, when one exists. */
  conversationId: string | null;
};

/**
 * Another offer that wants the same night.
 *
 * Deliberately not the conflict row. `kind: "CALENDAR_SLOT"` is how the world
 * models it; what the player is told is that Dineo also wants that Friday, which
 * is the same fact in the only language that helps them decide.
 */
export type CompetingOffer = {
  offerId: string;
  /** Who else is asking. */
  who: string;
  /** What they are offering, in a phrase: "Basement sessions · Braamfontein". */
  what: string;
  /** The night both of them want. */
  night: Date;
};

/**
 * The night on offer, when the offer has one.
 *
 * A session invite has a date but no room; a showcase has both. Keeping the
 * place optional rather than inventing "the studio" as a venue is what stops
 * the two from being rendered as the same kind of thing.
 */
export type OfferNight = {
  at: Date;
  /** "Rooftop hours" — what the night is called. */
  nightName: string | null;
  /** "Braamfontein" — the scene it happens in. */
  sceneName: string | null;
  /** How many people are in the room, when it is a room. */
  capacity: number | null;
};

/**
 * What is being asked, and on what terms.
 *
 * Every field here is something the person offering would say out loud. There is
 * no field on this type whose honest rendering would be a number the player is
 * meant to optimise against.
 */
export type PlayerOffer = {
  /**
   * The opportunity's own id.
   *
   * The one identifier that crosses, and it crosses precisely so that every
   * surface resolves to the same row. Home, the thread, the detail screen and the
   * calendar entry all carry this, which is what makes "no screen invents its own
   * version of the offer" checkable rather than aspirational.
   */
  id: string;
  type: OpportunityType;
  source: OfferSource;
  /**
   * What kind of thing this is, in human language.
   *
   * "Opening the night", "Carrying the room", "Another session", "Three
   * producers". Never the type name.
   */
  headline: string;
  /** The person's own line about it. Their words, from their profile. */
  offerLine: string | null;
  /** What the arrangement is: "Thirty minutes, paid on the night." */
  termsLine: string | null;
  night: OfferNight | null;
  /** Formatted at the edge; the minor units are what travels. */
  feeMinor: number | null;
  /**
   * Which way the money goes.
   *
   * A showcase pays the artist; a session costs them. Two offers with a fee on
   * them are not the same offer, and a screen that showed both as "R1,500" would
   * be lying about one of them.
   */
  feeDirection: "EARNS" | "COSTS" | null;
  outcome: PlayerOfferOutcome;
  outcomeLabel: string;
  /** When the answer is due, while there is still an answer to give. */
  answerBy: Date | null;
  /** "3 days to answer", "last day to answer". Never a raw timestamp. */
  answerByLabel: string | null;
  /** Live offers wanting the same night. Empty when nothing clashes. */
  competingWith: CompetingOffer[];
  /** The offer that displaced this one, once one has. */
  displacedBy: { offerId: string; who: string; what: string } | null;
  /** The booking this became, once it is one. */
  calendarItemId: string | null;
  /** The session this became, for an accepted invitation. */
  sessionId: string | null;
  /** Where the player goes to answer it. One canonical route per offer. */
  href: string;
  /** When the world produced it, for ordering and for "2 days ago". */
  offeredAt: Date;
};

/**
 * What the player is looking at, when they are looking at everything at once.
 *
 * Home's "on the table". Ordered by the director's ranking and *not labelled as
 * ordered* — the player sees a sensible sequence and is never shown that it is a
 * sequence, because a visible rank is a score with the numbers filed off.
 *
 * `groups` carries the conflict treatment: offers competing for one night arrive
 * as a single group so they cannot be separated by scroll position, which is the
 * requirement that a clash is visible *before* a destructive choice.
 */
export type OfferTable = {
  /** Every live offer, best-ranked first, ranking never exposed. */
  offers: PlayerOffer[];
  /** The same offers, grouped so a shared night is one block. */
  groups: OfferGroup[];
  /** How many are live. Never "3 of 3" — the cap is not player-facing. */
  count: number;
  /**
   * Offers that ended while their night is still ahead.
   *
   * A card that vanishes between one navigation and the next reads as a bug, and
   * a night the player lost to their own decision is the last thing that should
   * disappear quietly. These are rendered *in place of* where the offer was,
   * saying what happened and what displaced it, and they drop out on their own
   * once the world passes the night — at which point they are history and live in
   * the Career story.
   *
   * Deliberately not "everything that recently ended": something that has already
   * been answered and whose date has passed is not still on the table in any
   * sense a player would recognise.
   */
  recentlyEnded: PlayerOffer[];
};

export type OfferGroup = {
  /** Set when these offers all want the same night. */
  sharedNight: Date | null;
  offers: PlayerOffer[];
};
