/**
 * Live performance vocabulary.
 *
 * A night is a bounded encounter between an artist and a room somebody else
 * owns, on a date agreed in advance, whose consequences are limited by how many
 * people were actually in it.
 *
 * **A naming note, because two things in this codebase are called a
 * performance.** M8's `BattlePerformance` is a battle *round* — writing, flow,
 * rebuttal, crowd work — and is unrelated to anything here. Its
 * `PerformanceFactDerivation` is that round's decomposition. This file is about
 * a booked night at somebody's venue, and shares no type with it.
 *
 * **There is no quality score.** Deliberately, and structurally: there is no
 * `quality`, `score`, `rating` or `success` here, and no field that could become
 * one. A night records three named observable facts, each bounded by the one
 * above it, and nothing sums them. A night that went badly is a night with a low
 * `wonOver` rather than a night with a bad grade.
 */

/**
 * The three facts a night records. In order, because the order is the bound:
 * you cannot win over people who were not there, and people who were not won
 * over do not tell anybody.
 */
export const PERFORMANCE_FACTS = [
  /** People who were in the room. Never more than the room holds. */
  "attendance",
  /** Of those, how many left caring more than when they arrived. */
  "wonOver",
  /** Of those, how many told somebody who was not there. */
  "wordLeftTheRoom",
] as const;
export type PerformanceFact = (typeof PERFORMANCE_FACTS)[number];

export type PerformanceFacts = Record<PerformanceFact, number>;

export const PERFORMANCE_FACT_LABELS: Record<PerformanceFact, string> = {
  attendance: "In the room",
  wonOver: "Won over",
  wordLeftTheRoom: "Word left the room",
};

/**
 * What each fact is bounded by, named rather than implied.
 *
 * The database keeps these as CHECK constraints. They are repeated here so a
 * caller can say *why* a number stopped where it did without re-deriving the
 * rule, and so the resolver and the schema cannot drift apart silently.
 */
export const PERFORMANCE_FACT_BOUNDS: Record<PerformanceFact, string> = {
  attendance: "the room's capacity",
  wonOver: "attendance",
  wordLeftTheRoom: "wonOver",
};

/**
 * The closed list of inputs a night may be derived from.
 *
 * Every one of them is something the world already recorded before the night
 * happened. Nothing here is invented at resolution time, and nothing outside
 * this list is allowed to influence a fact.
 */
export const PERFORMANCE_TERMS = [
  /** The promoter's room. The ceiling on everything. */
  "room",
  /** How well this scene knows the name, through M7's own `sceneStanding`. */
  "sceneStanding",
  /** Whether anything is actually moving around this artist right now. */
  "momentum",
  /** Carrying the night, or opening it. */
  "billing",
  /** The one skill that has always meant this and never had a consumer. */
  "performanceSkill",
  /** Reproducible texture from the seed. Never noise, never `Math.random`. */
  "nerves",
] as const;
export type PerformanceTerm = (typeof PERFORMANCE_TERMS)[number];

/**
 * One named input's contribution to one fact.
 *
 * The same shape ranking and judging already use: the input as it stood, the
 * weight it carried, what that produced, and one line saying why it is worth
 * what it is worth. A number that cannot explain itself is not evidence.
 */
export type PerformanceContribution = {
  term: PerformanceTerm;
  /** The recorded input, on the term's own scale. */
  input: number;
  weight: number;
  /** What the term contributed, after weighting. */
  contribution: number;
  note: string;
};

/**
 * How one fact was arrived at.
 *
 * The versioned half of a night. The three facts are real columns whose bounds
 * the database keeps; *this* is what a newer formula will change, which is why
 * it is stored beside them rather than instead of them. An old night stays
 * explicable under a new engine.
 */
export type PerformanceDerivation = {
  fact: PerformanceFact;
  /** Where it ended up, after bounding. */
  value: number;
  /** What it was bounded by, and at what number. */
  bound: number;
  boundLabel: string;
  /** Whether the bound actually bit, rather than merely being available. */
  bounded: boolean;
  contributions: PerformanceContribution[];
  note: string;
};

/**
 * The lifetime of a night, which is one state.
 *
 * **A row exists only for a night that happened, and it is written resolved.**
 * There is deliberately no `SCHEDULED` — the calendar already owns what was
 * agreed to — and deliberately no `PERFORMED`. An earlier draft had one, on the
 * argument that what happened and what it cost are separable facts. They are,
 * but both are written inside a single transaction, so no reader could ever
 * observe a row between them: splitting the write would have produced two
 * writes, not two states, and an enum value nothing can ever see is a claim the
 * schema cannot keep.
 *
 * The separation that *is* real lives in the event log, where
 * `performance.performed` records that the night occurred and
 * `performance.resolved` records what the scene saw. Those are two distinct
 * facts with different visibilities and different audiences.
 */
export const PERFORMANCE_STATUSES = ["RESOLVED"] as const;
export type PerformanceStatus = (typeof PERFORMANCE_STATUSES)[number];

/** The engine that produced a night's facts. Stored on the row, with the seed. */
export const PERFORMANCE_SIMULATOR_VERSION = "m8.5.performance.v1";
