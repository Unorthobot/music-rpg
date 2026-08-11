/**
 * Relationships.
 *
 * What the people around you make of what you are doing. One framework for
 * everybody — a producer, a bandmate, a rival — because these dimensions are
 * person-to-person and mean the same thing about anyone. What differs by role
 * is which of them move and what they unlock, not what they are.
 *
 * Group membership keeps its own four (influence, satisfaction, commitment,
 * solo ambition) on top of this, because those describe standing with the band
 * *as an institution* rather than sentiment toward a person: somebody can be
 * personally loyal and still uncommitted, and that gap is what a line-up
 * falling apart is made of.
 *
 * ## The scale
 *
 * Every dimension is 0–100, stored as a real. The player never sees a number —
 * they see a state — but the fractions are kept for the same reason career
 * pressure keeps them: a single session moves some of these by less than a
 * point, and rounding that away each time would mean nothing ever accumulates.
 */

/** Which derivation produced a relationship. Persisted; history keeps its own. */
export const RELATIONSHIP_ENGINE_VERSION = "relationships-v1";

export const RELATIONSHIP_DIMENSIONS = [
  /** How much history is there at all. Longitudinal — one session cannot buy it. */
  "familiarity",
  /** Do they rate what you actually make. */
  "respect",
  /** Do they believe you will follow through. */
  "trust",
  /** Would they choose you over a better offer. Longitudinal, like familiarity. */
  "loyalty",
  /** Does the work get better when you are both in the room. */
  "creativeChemistry",
  /** What is unresolved between you. Not a penalty, and not the inverse of trust. */
  "tension",
  /** Are they measuring themselves against you. */
  "rivalry",
] as const;
export type RelationshipDimension = (typeof RELATIONSHIP_DIMENSIONS)[number];

export type RelationshipState = Record<RelationshipDimension, number>;

export const EMPTY_RELATIONSHIP: RelationshipState = {
  familiarity: 0,
  respect: 0,
  trust: 0,
  loyalty: 0,
  creativeChemistry: 0,
  tension: 0,
  rivalry: 0,
};

/** Who the relationship is with. Characters now; artists and groups later. */
export const RELATIONSHIP_SUBJECTS = ["CHARACTER", "ARTIST", "GROUP"] as const;
export type RelationshipSubjectType = (typeof RELATIONSHIP_SUBJECTS)[number];

/**
 * What the relationship is *for*.
 *
 * The role-specific projection on top of the shared framework: a producer you
 * make records with and a rival you are measured against move different
 * dimensions, and neither needs a separate model to do it.
 */
export const RELATIONSHIP_KINDS = ["CREATIVE_PARTNER", "CONTACT", "BANDMATE", "RIVAL"] as const;
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number];

export const RELATIONSHIP_KIND_LABELS: Record<RelationshipKind, string> = {
  CREATIVE_PARTNER: "Creative partner",
  CONTACT: "Contact",
  BANDMATE: "Bandmate",
  RIVAL: "Rival",
};

/* --- The history a relationship is derived from --------------------------- */

/**
 * One thing that happened between two people.
 *
 * Extracted from canonical rows — creative decisions, releases, reception — and
 * never invented. If an interaction is not backed by something already written
 * down, the relationship it produces is fiction.
 */
export const INTERACTION_KINDS = [
  /** They were chosen, over other people who were available. */
  "CHOSEN",
  /** A direction was given for them to respond to. */
  "DIRECTION_GIVEN",
  /** Their whole set of ideas was refused. */
  "IDEAS_REFUSED",
  /** One of their ideas was taken. */
  "IDEA_TAKEN",
  /** Two of their ideas were folded together. */
  "IDEAS_COMBINED",
  /** The work was sent back for another pass. */
  "REVISION_ASKED",
  /** It was finished properly rather than left. */
  "WORK_MASTERED",
  /** It was kept — it went into the catalogue. */
  "WORK_KEPT",
  /** It went out into the world. */
  "WORK_RELEASED",
  /** The world responded to what they made together. */
  "WORK_RECEIVED",
  /** Started and walked away from. */
  "WORK_ABANDONED",
  /** Asked to be part of the crew, and said yes. */
  "JOINED_CREW",
  /** Asked, and said no. */
  "DECLINED_CREW",
  /** Was in the crew, and left. */
  "LEFT_CREW",
  /* --- Responses to a moment. The player answered; this is what they did. --- */
  /** Heard them out. */
  "TALKED_IT_THROUGH",
  /** Heard them, and did not move. */
  "STOOD_GROUND",
  /** Did not answer. */
  "AVOIDED_THEM",
] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export type RelationshipInteraction = {
  kind: InteractionKind;
  /** Monotonic position in the career's canonical history. */
  sequence: number;
  occurredAt: Date;
  /** Which pass of the room this was. Zero is their opening read. */
  round?: number;
  /** How they felt at the time, where it was recorded. */
  stance?: string | null;
  /** For WORK_RECEIVED: how the record actually landed, 0–1. */
  receptionStrength?: number;
};

/* --- What the player is told ---------------------------------------------- */

/** A dimension, in words. The number behind it never leaves the simulation. */
export type RelationshipNote = {
  dimension: RelationshipDimension;
  label: string;
};

export type RelationshipSummary = {
  kind: RelationshipKind;
  kindLabel: string;
  /** The two or three things worth saying, strongest first. */
  notes: RelationshipNote[];
  /** Those notes as one line: "Exceptional chemistry. Growing tension." */
  line: string;
};

/* --- Crew ----------------------------------------------------------------- */

/**
 * Crew is not collaboration.
 *
 * Working with somebody once makes them a collaborator. Being crew is a
 * standing arrangement that had to be asked for, agreed to, and given terms —
 * "we worked together" and "you are part of my team" are different facts, and
 * later systems (availability, compensation, who is expected to show up when
 * this gets bigger) only make sense if the game knows which one it is looking
 * at.
 */
export const CREW_STATUSES = ["INVITED", "ACTIVE", "DECLINED", "LEFT"] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];

/** What was actually offered. Recorded, because terms are part of the deal. */
export const CREW_ARRANGEMENTS = ["SESSION_RATE", "REVENUE_SHARE", "FAVOUR"] as const;
export type CrewArrangement = (typeof CREW_ARRANGEMENTS)[number];

export type CrewTerms = {
  arrangement: CrewArrangement;
  /** The player's own words, where they gave any. */
  note?: string | null;
};

export const CREW_ARRANGEMENT_LABELS: Record<CrewArrangement, string> = {
  SESSION_RATE: "Paid by the session",
  REVENUE_SHARE: "A share of what it makes",
  FAVOUR: "On the strength of the work",
};

/** Whether somebody can be asked at all, and why not. */
export type CrewEligibility = {
  eligible: boolean;
  /** In the player's language. Null when they can be asked. */
  reason: string | null;
};

/** Their answer, and the reasoning behind it. */
export type CrewDecision = {
  accepted: boolean;
  /** Something they would actually say. */
  line: string;
  /** Why, for the inspector. Never shown to the player as a number. */
  factors: Record<string, number>;
};

/* --- Moments -------------------------------------------------------------- */

/**
 * A moment is an invitation, not a consequence.
 *
 * "LEX wants to talk" does not reduce tension. It surfaces because the state
 * between two people crossed a condition that makes a conversation plausible,
 * and then it waits — the player decides how to answer, and *that* becomes the
 * next relationship event. A moment that resolved itself would be a
 * notification about something the game had already decided.
 *
 * Once surfaced a moment is persisted, with the state that produced it. It is
 * not recomputed on read and it cannot be rerolled by refreshing.
 */
export const MOMENT_KINDS = [
  /** They rate you and something is unresolved. Worth having out. */
  "WANTS_TO_TALK",
  /** Unresolved, and they do not rate you enough to bother. */
  "GONE_QUIET",
  /** It is going well and they want to do it again. */
  "WANTS_ANOTHER_SESSION",
] as const;
export type MomentKind = (typeof MOMENT_KINDS)[number];

export const MOMENT_STATUSES = ["OPEN", "RESOLVED", "EXPIRED"] as const;
export type MomentStatus = (typeof MOMENT_STATUSES)[number];

/** How the player may answer. Each is a real act with its own consequence. */
export const MOMENT_RESPONSES = ["TALK", "HOLD_FIRM", "IGNORE", "ACCEPT", "DECLINE"] as const;
export type MomentResponse = (typeof MOMENT_RESPONSES)[number];

export type MomentOption = {
  response: MomentResponse;
  label: string;
  /** What choosing this means, in the player's language. */
  detail: string;
};

export type MomentView = {
  id: string;
  kind: MomentKind;
  /** Whose moment it is. */
  subjectId: string;
  name: string;
  /** "LEX wants to talk." */
  title: string;
  detail: string;
  options: MomentOption[];
};
