import type { OpportunityOrigin, OpportunityType } from "./enums";
import type { MomentKind, RelationshipState } from "./relationships";

/**
 * Opportunities — what the world could plausibly offer, and why.
 *
 * The director asks one question: *given what has actually happened in this
 * world and this career, what could credibly happen now?* It does not ask what
 * would make a good story. It does not know what dramatic means and should not
 * learn.
 *
 * Two gates, kept rigorously apart, because they answer different questions and
 * a player deserves to be able to tell them apart:
 *
 * - **Eligibility is binary and about the world.** Could this situation exist at
 *   all? Every rule is named, and a failure is a reason — "you have nothing to
 *   play" is not a low score, it is not an opportunity.
 * - **Ranking is comparative and about the career.** Of the things that *could*
 *   happen, which are worth surfacing now? Ranking never resurrects something
 *   ineligible, and no score overrides a failed condition.
 *
 * Nothing here computes a universal opaque number. A score exists, but it is
 * always the sum of named contributions kept alongside it, in the way M5's
 * metric pressure and M6's crew decision already are.
 */

/** Which director produced a decision. Formulas change; recorded history must not. */
export const OPPORTUNITY_DIRECTOR_VERSION = "director-v1";

/* --- What the director is allowed to read --------------------------------- */

/**
 * The world, as the director sees it.
 *
 * Every field is a fact some other system already owns and recorded. This type
 * is the contract that keeps the director a *consumer*: reception is M5's,
 * relationships and moments are M6's, commitments are the calendar's, and people
 * are the world's. If a decision needs something that is not in here, the honest
 * move is to say so rather than to reconstruct a second version of it.
 */
export type DirectorFacts = {
  careerId: string;
  worldId: string;
  /** Where the career is in game time. Expiry and offered dates are relative to it. */
  currentGameTime: Date;
  standing: CareerStandingFacts;
  releases: ReleaseFacts[];
  cohorts: CohortStandingFacts[];
  scenes: SceneFacts[];
  people: PersonFacts[];
  commitments: CommitmentFacts[];
  liveOpportunities: LiveOpportunityFacts[];
  /**
   * Every identity this career has ever been offered, whatever became of it.
   *
   * Broader than `liveOpportunities` on purpose. An offer that was declined or
   * left to lapse is still an offer that was made: a promoter does not re-offer
   * the Friday you turned down, and the unique index on the identity key would
   * refuse the row anyway. Without this the director would spend a slot on
   * something it cannot write and then claim to have written it.
   */
  usedIdentityKeys: string[];
  /** True while a creative session is open. Read from the session's own status. */
  midSession: boolean;
};

/** Fame, Respect, Heat as the player sees them, plus what the career can spend. */
export type CareerStandingFacts = {
  fame: number;
  respect: number;
  heat: number;
  moneyBalance: number;
  careerAct: string;
};

/** What one record has done. M5's projection, read, never recomputed. */
export type ReleaseFacts = {
  releaseId: string;
  title: string | null;
  releasedGameTime: Date;
  daysSimulated: number;
  uniqueListeners: number;
  engagedListeners: number;
  repeatListeners: number;
  fanConversions: number;
  shares: number;
  /** 0–100. Velocity around the record now. Decays; not prestige. */
  momentum: number;
};

/** What one audience population makes of this artist. M5's `artist_audience`. */
export type CohortStandingFacts = {
  slug: string;
  name: string;
  size: number;
  fans: number;
  /** 0–1000. */
  affinity: number;
  priorExposure: number;
  /** The cohort's own recorded concentration by scene slug. Sums to 1. */
  sceneAffinity: Record<string, number>;
};

export type SceneFacts = { id: string; slug: string; name: string };

/**
 * Somebody in the world who might offer something, and what this career is to
 * them.
 *
 * `relationship` is null for anybody the career has never worked with — which is
 * every promoter, and is a correct state rather than a missing one. M6 derives
 * relationships from shared sessions, so a promoter cannot have an opinion of you
 * yet, and eligibility must not pretend otherwise.
 */
export type PersonFacts = {
  characterId: string;
  slug: string;
  name: string;
  role: string;
  active: boolean;
  relationship: RelationshipState | null;
  interactionCount: number;
  /** Open moments with this person. M6's, read — not re-detected. */
  openMomentKinds: MomentKind[];
  /** Their fee, when they have one. */
  sessionCostMinor: number | null;
  /** Their booking profile, when they are a promoter. */
  promoter: PromoterFacts | null;
};

export type PromoterFacts = {
  sceneSlug: string;
  nightName: string;
  /** The bar for carrying the night. */
  standard: number;
  /** The bar for being on the bill at all. Always lower. */
  supportStandard: number;
  noticeDays: number;
  answerByDays: number;
  capacity: number;
  payoutMinor: number;
  supportPayoutMinor: number;
  offerLine: string;
  termsLine: string;
};

/**
 * What you were offered, not merely whether you were offered anything.
 *
 * Carrying a night and opening one are different offers from the same promoter
 * for the same room, and which one you get is the clearest single statement the
 * world can make about where a career actually stands. Keeping them as one type
 * with a billing — rather than two types — is what makes "you got the support
 * slot instead" an explainable comparison rather than two unrelated facts.
 */
export const SHOWCASE_BILLINGS = ["HEADLINE", "SUPPORT"] as const;
export type ShowcaseBilling = (typeof SHOWCASE_BILLINGS)[number];

/** Something the career is already committed to. */
export type CommitmentFacts = {
  type: string;
  title: string;
  startGameTime: Date;
  endGameTime: Date | null;
};

export type LiveOpportunityFacts = {
  opportunityId: string;
  identityKey: string | null;
  type: OpportunityType;
  /** Who is waiting on an answer. */
  sourceEntityId: string | null;
  /** The night or session date this one wants, when it wants one. */
  occupiesGameTime: Date | null;
};

/* --- Eligibility ---------------------------------------------------------- */

/**
 * The conditions the director knows how to check.
 *
 * Deliberately a closed vocabulary rather than free text: a failed rule is
 * something World Control has to be able to group, count and explain, and a
 * sentence that varies by call site cannot be reasoned about later.
 */
export const ELIGIBILITY_RULES = [
  /* Shared */
  /**
   * This exact offer has already been made — whether it is still waiting, was
   * turned down, or lapsed. Identity, and therefore idempotency.
   */
  "NOT_ALREADY_OFFERED",
  /**
   * This person already has an offer out to you.
   *
   * Distinct from `NOT_ALREADY_OFFERED`, and the distinction matters. That rule
   * is idempotency: the same offer is never written twice. This one is
   * plausibility: a promoter who is waiting to hear about Friday does not phone
   * back on Saturday with another Friday. Without it, an offer keyed to a rolling
   * date would be regenerated every single day by the same person — which is how
   * "two promoters may both want you" turns into one promoter spamming you.
   */
  "SOURCE_NOT_ALREADY_WAITING",
  /** The person offering it still exists and is active in the world. */
  "SOURCE_IS_ACTIVE",

  /* Showcase */
  /** Something of yours is out that a room could actually hear. */
  "HAS_SOMETHING_TO_PLAY",
  /** The audiences concentrated in this scene know who you are. */
  "SCENE_KNOWS_YOU",
  /** Something of yours is moving right now, rather than having moved once. */
  "RECORD_IS_MOVING",
  /** Nothing is already booked across the night on offer. */
  "NIGHT_IS_FREE",

  /* Session invite */
  /** You have actually made something together. */
  "WORKED_TOGETHER",
  /** They rate the work enough to want more of it. */
  "THEY_RATE_THE_WORK",
  /** There is a reason to go back in: chemistry, or something unresolved. */
  "SOMETHING_LEFT_TO_DO",
  /** You are not already in the middle of a session. */
  "NOT_MID_SESSION",
] as const;
export type EligibilityRule = (typeof ELIGIBILITY_RULES)[number];

/**
 * One condition, checked.
 *
 * `observed` is the part that makes this an argument rather than an assertion:
 * the actual recorded value the rule was applied to, kept so the answer can be
 * disagreed with months later under a newer director.
 */
export type EligibilityCheck = {
  rule: EligibilityRule;
  passed: boolean;
  /** In the player's language, for the rule that failed. */
  reason: string;
  /** What the world actually said. Numbers, counts, dates — never prose. */
  observed: Record<string, number | string | boolean | null>;
};

/**
 * Every condition for one candidate.
 *
 * All rules are evaluated even after one fails. Short-circuiting would make
 * "why not?" a single arbitrary answer when the honest answer is often that
 * three separate things are not true yet.
 */
export type EligibilityResult = {
  eligible: boolean;
  checks: EligibilityCheck[];
  /** The failures, in rule order. Empty when eligible. */
  failed: EligibilityRule[];
};

/* --- Ranking -------------------------------------------------------------- */

/**
 * What ranking is allowed to consider.
 *
 * A closed vocabulary again, and for a stronger reason: this is the list of
 * things the director is permitted to think are relevant. Anything not named
 * here cannot influence what gets surfaced.
 */
export const RANKING_TERMS = [
  /** What being told about this kind of thing at all is worth. */
  "base",
  /** How well this scene in particular knows you. */
  "sceneFit",
  /** How live the career is right now — heat, and a record still moving. */
  "momentum",
  /** What the person offering makes of you. */
  "relationship",
  /** How soon it is, and how long you have to answer. */
  "timeliness",
  /** Negative. How much is already competing for the player's attention. */
  "crowding",
] as const;
export type RankingTerm = (typeof RANKING_TERMS)[number];

/** One named contribution to a score. `contribution` is what actually landed. */
export type RankingContribution = {
  term: RankingTerm;
  /** The input, on its own scale. */
  input: number;
  weight: number;
  /** What this term added, after weighting and bounding. */
  contribution: number;
  /** Why this term is worth what it is worth, in one line. */
  note: string;
};

/** Scores are bounded so no single term can run away with a decision. */
export const RANKING_FLOOR = 0;
export const RANKING_CEILING = 100;

export type RankingResult = {
  /** Bounded to [RANKING_FLOOR, RANKING_CEILING]. Never the whole story. */
  score: number;
  contributions: RankingContribution[];
  /**
   * Inputs this kind of opportunity does not consider.
   *
   * Recorded because "that fact was irrelevant" is a real answer to "why did
   * this outrank that", and an inspector that can only list what mattered
   * cannot give it.
   */
  irrelevant: string[];
};

/* --- Candidates ----------------------------------------------------------- */

/**
 * A situation the world could offer, before anything has been decided about it.
 *
 * Assembled from world and career state, then put through eligibility and
 * ranking. A candidate is not an opportunity: most of these never become one,
 * and the ones that do not are still worth keeping a record of.
 */
export type OpportunityCandidate = {
  /**
   * Stable identity for this exact offer from this exact source.
   *
   * This is what replaced the unique index on `(career_id, type)`. Keyed on the
   * source and the trigger rather than the kind, so two promoters can
   * independently want you on the same weekend and neither collapses onto the
   * other, while the same promoter offering the same night twice does.
   */
  identityKey: string;
  type: OpportunityType;
  origin: OpportunityOrigin;
  sourceEntityType: "CHARACTER";
  sourceEntityId: string;
  /** Where it is, when it has a place. */
  sceneId: string | null;
  sceneSlug: string | null;
  /** Which condition or reading brought this candidate into consideration. */
  triggerReason: string;
  /** The recorded state it was assembled from. Kept with the row, never re-read. */
  triggerState: Record<string, unknown>;
  /** Terms, dates, names — what the offer actually is. */
  payload: Record<string, unknown>;
  availableAtGameTime: Date;
  /** In game time. An offer nobody answered lapses when the world passes this. */
  expiresAtGameTime: Date | null;
};

/** Why a candidate that could have existed was not written down. */
export const SUPPRESSION_REASONS = [
  /** It failed a condition. It is not an opportunity at all. */
  "INELIGIBLE",
  /**
   * Chosen, and then refused by the identity index on the way in.
   *
   * Should be unreachable — `NOT_ALREADY_OFFERED` exists to catch this before a
   * slot is spent on it — and is recorded rather than swallowed precisely so that
   * a director claiming to have created something it did not becomes visible.
   */
  "ALREADY_RECORDED",
  /**
   * It was eligible and something else was more worth surfacing. The offer is
   * real; the player's attention is the scarce thing.
   */
  "OUTRANKED_BY_CAP",
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/**
 * One candidate, fully reasoned about.
 *
 * Written to the director's run ledger whether or not it became an opportunity,
 * which is what lets World Control answer "why did this one outrank that one"
 * about something that never appeared on a screen.
 */
export type CandidateAssessment = {
  identityKey: string;
  type: OpportunityType;
  origin: OpportunityOrigin;
  sourceEntityId: string;
  sceneSlug: string | null;
  triggerReason: string;
  eligibility: EligibilityResult;
  /** Null when ineligible: ranking is never run on something that cannot exist. */
  ranking: RankingResult | null;
  /** Position among the eligible, best first. Null when ineligible. */
  rank: number | null;
  created: boolean;
  /** Set when `created` is false. */
  suppressedBy: SuppressionReason | null;
  /** The opportunity row this became, when it became one. */
  opportunityId: string | null;
};

/**
 * One run of the director, in full.
 *
 * The `reception_ticks` shape: a per-run ledger keyed so the same game day
 * cannot be directed twice, holding the whole reasoning rather than only its
 * outcome. Formulas will change and this must still explain what the old ones
 * decided.
 */
export type DirectorTrace = {
  directorVersion: string;
  gameTime: string;
  /** How many live offers the cap allowed at the time of the run. */
  liveCap: number;
  liveBefore: number;
  /** Ordered as considered. */
  candidates: CandidateAssessment[];
  expired: { opportunityId: string; type: OpportunityType; expiresAtGameTime: string }[];
  /** The career facts the whole run was reasoned from. */
  inputs: Record<string, unknown>;
};

/* --- Conflict ------------------------------------------------------------- */

/**
 * Two offers that cannot both happen.
 *
 * Detected and represented, not scheduled around. M7 needs to know that two
 * things want the same night so that accepting one can resolve the other
 * honestly; it does not need an economy of slots, and building one here would be
 * the wrong milestone.
 */
export const OPPORTUNITY_CONFLICT_KINDS = [
  /** Both want the same night. */
  "CALENDAR_SLOT",
  /** Both want something the career has exactly one of. */
  "SAME_RESOURCE",
] as const;
export type OpportunityConflictKind = (typeof OPPORTUNITY_CONFLICT_KINDS)[number];

export const OPPORTUNITY_CONFLICT_LABELS: Record<OpportunityConflictKind, string> = {
  CALENDAR_SLOT: "Wants the same night",
  SAME_RESOURCE: "Wants the same thing",
};
