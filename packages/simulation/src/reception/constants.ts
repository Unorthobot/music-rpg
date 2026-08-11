import type { CareerAct, ReleaseFormat } from "@music-rpg/shared";

/**
 * Every number the reception simulator uses, in one place, named.
 *
 * A coefficient buried in a formula is a decision nobody can find again. These
 * are grouped by the question they answer, so "why did more people hear it on
 * day two?" leads to a constant with a name rather than a literal in a loop.
 *
 * Changing anything here changes outcomes for future simulations only —
 * historical runs keep the simulator version that produced them.
 */

/* --- Cohort evaluation: what a cohort makes of the record ----------------- */

/** Distance on the Sound DNA axes at which fit reaches zero, scaled by tolerance. */
export const SOUND_FIT_RANGE = 1.6;

/**
 * How fit is composed.
 *
 * The record itself matters most, but the artist's own Sound DNA carries
 * independently of any single track — which is what lets a cohort be
 * predisposed toward someone before hearing their new work.
 */
export const FIT_WEIGHTS = {
  trackSound: 0.38,
  trackQuality: 0.34,
  artistSound: 0.18,
  standingAffinity: 0.1,
} as const;

/* --- The stored M4 modifiers, as each cohort feels them ------------------- */

/** Modifiers arrive as 0–100; these turn them into multipliers around 1. */
export const REACH_BOOST_SCALE = 1.2;
export const ANTICIPATION_BOOST_SCALE = 0.9;
export const CREDIBILITY_BOOST_SCALE = 0.75;

/** Anticipation is spent on arrival: waiting for something is not a permanent state. */
export const ANTICIPATION_DECAY_PER_DAY = 0.45;

/* --- Exposure: who gets the opportunity to encounter it ------------------- */

/** Unaided discovery falls away fast. Staying alive is word of mouth's job. */
export const DISCOVERY_DECAY_PER_DAY = 0.62;

/** Each existing fan carries the record to roughly this many new people. */
export const FAN_REACH_WEIGHT = 0.55;

/** Share of a cohort's remaining population that current momentum reaches. */
export const MOMENTUM_REACH_WEIGHT = 0.0009;

/** People who would like it find it slightly more readily. Slightly. */
export const FIT_DISCOVERY_WEIGHT = 0.5;

/** Reproducible texture, never noise: ±8%, derived from the seed. */
export const EXPOSURE_JITTER = 0.08;
export const RESPONSE_JITTER = 0.06;

/** How much of an event the format is. A loose track is not a single. */
export const FORMAT_REACH: Record<ReleaseFormat, number> = {
  LOOSE_TRACK: 0.8,
  SINGLE: 1,
  EP: 1.25,
  MIXTAPE: 1.3,
  ALBUM: 1.5,
  COLLABORATIVE: 1.35,
};

/** An established artist is found more easily than an unknown one. */
export const ACT_REACH: Record<CareerAct, number> = {
  UNDERGROUND: 1,
  COME_UP: 1.6,
  INDUSTRY: 2.6,
  LEGACY: 3.2,
};

/* --- Listening and engagement -------------------------------------------- */

/** Of those exposed, how many press play — a floor plus what fit adds. */
export const LISTEN_BASE = 0.6;
export const LISTEN_FIT_WEIGHT = 0.8;
export const LISTEN_CEILING = 0.95;

/** Of those who listened, how many it actually landed on. */
export const ENGAGE_BASE = 0.35;
export const ENGAGE_FIT_WEIGHT = 1.25;
export const ENGAGE_CEILING = 0.92;
export const AFFINITY_ENGAGEMENT_WEIGHT = 0.35;

/** Coming back is a different act from arriving, and rarer. */
export const REPEAT_BASE = 0.4;
export const REPEAT_FIT_WEIGHT = 1;

/* --- Fan conversion: the rare one ---------------------------------------- */

export const ENGAGED_CONVERSION_BASE = 1;
/** Someone who came back a second time is markedly more likely to stay. */
export const REPEAT_CONVERSION_WEIGHT = 0.8;
/** Above one, so conversion falls away sharply when a record is merely tolerable. */
export const CONVERSION_FIT_EXPONENT = 1.8;
export const AFFINITY_CONVERSION_WEIGHT = 0.4;

/* --- Word of mouth -------------------------------------------------------- */

export const SHARE_BASE = 0.45;
export const SHARE_FIT_WEIGHT = 1.1;
export const SHARE_REACH_BASE = 0.7;
export const SHARE_REACH_FIT_WEIGHT = 0.6;

/**
 * Where a share lands.
 *
 * Scene heads mostly talk to each other; casual listeners almost entirely do.
 * Tastemakers are the bridge — half of what they pass on leaves the room they
 * heard it in, which is the mechanism by which a small record travels.
 *
 * A cohort with no entry here keeps its own word of mouth.
 */
export const WORD_OF_MOUTH_ROUTING: Record<string, Record<string, number>> = {
  SCENE_HEADS: { SCENE_HEADS: 0.55, TASTEMAKERS: 0.2, CASUAL_LISTENERS: 0.25 },
  TASTEMAKERS: { TASTEMAKERS: 0.15, SCENE_HEADS: 0.35, CASUAL_LISTENERS: 0.5 },
  CASUAL_LISTENERS: { CASUAL_LISTENERS: 0.85, SCENE_HEADS: 0.1, TASTEMAKERS: 0.05 },
};

/* --- Momentum: how much is moving around the record right now ------------- */

/** Momentum is velocity, not prestige: without new activity it falls away. */
export const MOMENTUM_DECAY_PER_DAY = 0.55;
export const MOMENTUM_LISTENER_WEIGHT = 0.12;
export const MOMENTUM_SHARE_WEIGHT = 0.9;
export const MOMENTUM_CONVERSION_WEIGHT = 1.5;
export const MOMENTUM_CEILING = 100;

/* --- Career metric pressure ----------------------------------------------- */

/**
 * Fame answers breadth, Respect answers who engaged, Heat answers movement.
 *
 * Deliberately small: this is an Underground artist's first single, and a
 * system that hands out points for it has nothing left to say when something
 * actually happens. Pressure accrues as fractions and the career's integer
 * metric is the floor of what has accumulated.
 */
export const FAME_PER_WEIGHTED_EXPOSURE = 0.012;
export const RESPECT_PER_WEIGHTED_ENGAGEMENT = 0.28;
export const HEAT_PER_MOMENTUM_GAINED = 0.06;
export const HEAT_PER_WEIGHTED_SHARE = 0.35;

/** Career metrics are integers in this range. Pressure never pushes past it. */
export const CAREER_METRIC_CEILING = 100;
