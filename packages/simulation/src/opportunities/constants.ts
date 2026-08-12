/**
 * The director's numbers, in one place.
 *
 * Every constant here is a statement about the world rather than a tuning knob
 * aimed at an outcome. They were set against what the simulation actually
 * produces for an Underground career with one single out for three days —
 * measured, not guessed — and the scales are documented because a threshold
 * whose units nobody can name is a threshold nobody can argue with.
 */

/* --- Scene standing ------------------------------------------------------- */

/**
 * How well the audiences concentrated in a scene know you: 0–100, where 100
 * means the scene is yours.
 *
 * This is the one quantity the director derives that M5 does not already
 * project, and it is derived rather than invented: cohort affinity and fan
 * counts are M5's own recorded numbers, and the weighting across scenes is the
 * cohort's own recorded `scene_affinity`. Nothing about reception is recomputed.
 *
 * Underground numbers are single digits, and that is correct. A first single
 * that the scene heads took to earns something like a 5, and a 5 is what buys a
 * rooftop rather than a Sunday in Soweto.
 */

/**
 * Cohort warmth that counts as fully knowing you.
 *
 * Affinity runs 0–1000 and accumulates over a career. A quarter of it is
 * "these people know exactly who you are", which is as far as the Underground
 * needs to reach; the rest is for later acts to earn.
 */
export const AFFINITY_FULL = 250;

/** Share of a cohort who are fans at which extra fans stop saying anything new. */
export const FAN_SATURATION = 0.05;

/** Warmth is most of it. Fans are the harder, slower half of the same story. */
export const STANDING_WARMTH_WEIGHT = 0.7;
export const STANDING_FAN_WEIGHT = 0.3;

/* --- Showcase eligibility ------------------------------------------------- */

/**
 * Something has to still be moving.
 *
 * Momentum is velocity, not prestige — M5 decays it daily — so this is the
 * difference between a promoter hearing about you now and a promoter
 * remembering a record from two months ago.
 */
export const SHOWCASE_MIN_MOMENTUM = 5;

/** A night is a night: anything already booked across it is a clash. */
export const NIGHT_LENGTH_HOURS = 5;

/* --- Session invite eligibility ------------------------------------------- */

/** They have to rate the work enough to want more of it. */
export const INVITE_MIN_RESPECT = 30;

/**
 * A reason to go back in the room.
 *
 * Deliberately lower than M6's `SESSION_MIN_CHEMISTRY`, and not a second opinion
 * about the same question. M6's bar is what it takes for somebody to raise it
 * *unprompted* — a moment, alongside high trust and almost no tension. This is
 * the looser question of whether another session is plausible enough for the
 * world to put in front of the player at all.
 *
 * When M6's bar has been met the moment already exists, and an open
 * `WANTS_ANOTHER_SESSION` satisfies this rule on its own. That is the point: the
 * director reads M6's conclusion where M6 has one, and falls back to the raw
 * dimension only where it does not.
 */
export const INVITE_MIN_CHEMISTRY = 25;

/** How long somebody waits for an answer about another session, in game days. */
export const SESSION_INVITE_ANSWER_DAYS = 7;
/** How far out the session itself would be. */
export const SESSION_INVITE_NOTICE_DAYS = 10;

/* --- Ranking -------------------------------------------------------------- */

/**
 * How many offers may be live at once.
 *
 * A limit, not a queue. The screen is meant to be a set of real choices, and an
 * opportunity nobody will ever get to is noise — so candidates beyond this are
 * left uncreated and the reason is recorded, rather than being written down and
 * then hidden.
 */
export const MAX_LIVE_OPPORTUNITIES = 3;

/**
 * What being told about each kind of thing is worth before anything about this
 * career is considered.
 *
 * Kept deliberately small next to the state-driven terms below. Ranking is
 * supposed to be about the career; a base that dominated would make it about the
 * category.
 */
export const SHOWCASE_BASE = 18;
export const SESSION_INVITE_BASE = 14;

/** A bigger room is more worth being told about. Bounded, and never the reason. */
export const ROOM_FLOOR_FACTOR = 0.6;
export const ROOM_FULL_CAPACITY = 200;

/**
 * What an opening slot is worth against carrying the night.
 *
 * Well under half, because they are not the same offer — but not nothing, which
 * is the point: a support slot at a room that matters is frequently the most
 * relevant thing in front of a career that has just started being noticed.
 */
export const SUPPORT_BILLING_FACTOR = 0.55;

export const SCENE_FIT_WEIGHT = 2.5;
export const MOMENTUM_WEIGHT = 0.5;
export const RELATIONSHIP_WEIGHT = 0.45;
export const TIMELINESS_WEIGHT = 0.12;
/** Negative. Every offer already waiting makes the next one worth less. */
export const CROWDING_WEIGHT = -4;

/** What a standing relationship is worth to a ranking, dimension by dimension. */
export const RELATIONSHIP_RESPECT_SHARE = 0.5;
export const RELATIONSHIP_TRUST_SHARE = 0.3;
export const RELATIONSHIP_CHEMISTRY_SHARE = 0.2;

/** Answering inside a week is urgent; beyond that, urgency decays. */
export const TIMELY_WINDOW_DAYS = 7;

/* --- Battle challenges (M8) ------------------------------------------------ */

/**
 * What being called out is worth being told about at all.
 *
 * Below `SHOWCASE_BASE` deliberately. A paid night in front of a room a promoter
 * built is a bigger thing to put in front of somebody than an argument with one
 * rival, and a director that surfaced challenges above bookings would be
 * insisting on a career the player may not want.
 */
export const CHALLENGE_BASE = 15;

/**
 * What existing rivalry is worth to how much a challenge deserves surfacing.
 *
 * Modest on purpose. Somebody who has measured themselves against you before has
 * more reason to do it again — but this must never become a ratchet where
 * refusing raises the pressure to accept. Rivalry is moved by battles that
 * *happened*, not by ones that were declined, so this term cannot escalate at a
 * player who does not battle.
 */
export const CHALLENGE_RIVALRY_WEIGHT = 0.45;

/**
 * What a challenge is worth when the rival barely rates you, as a fraction.
 *
 * The missing half of the model, found by inspection: a showcase base is scaled
 * by `SUPPORT_BILLING_FACTOR` when the scene does not rate a career enough to
 * headline, and a challenge had no equivalent — so a rival who *just* scraped
 * past their own bar was proposing something the director weighed at double a
 * promoter's support slot.
 *
 * A rival calling out somebody they barely rate is exactly the same kind of
 * speculative, low-stakes proposition a support slot is, and it should be priced
 * the same way. This is that distinction expressed continuously rather than as
 * two billings, because a challenge has no equivalent of being on the bill.
 */
export const CHALLENGE_INTEREST_FLOOR = 0.4;

/**
 * How far above their own bar a career has to be before a rival is fully
 * interested, in points of scene standing.
 *
 * Underground numbers are single digits, so eight points above a standard is a
 * long way — it is the difference between "there is something in this for me"
 * and "everybody is talking about them".
 */
export const CHALLENGE_FULL_INTEREST_MARGIN = 8;
