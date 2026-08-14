/**
 * What a night is worth, in one file.
 *
 * **No coefficient in M5, M6, M7 or M8 may be added to or changed by this
 * milestone, and none of theirs is imported here.** A live performance is a
 * different encounter from a record meeting a cohort, a relationship folding a
 * session, a director weighing an offer or a panel judging a round, and
 * borrowing a number from any of those would quietly make one of them mean two
 * things.
 *
 * The nearest miss is `SUPPORT_BILLING_FACTOR`, which M7 already has and this
 * file deliberately does not reuse — see `SUPPORT_ROOM_SHARE` below.
 */

/* --- Who turned up --------------------------------------------------------- */

/**
 * The share of a room that turns up for a name nobody in the scene knows.
 *
 * Not zero, and that is the point: a promoter's night has its own audience.
 * People are in the room because it is that room on that night, which is
 * exactly what makes a support slot worth playing and what a career is
 * borrowing when it takes one.
 */
export const ROOM_BASE_FILL = 0.35;

/**
 * What being known in the scene is worth, as additional share of the room.
 *
 * Read from `sceneStanding()` — M7's own function over M5's own cohort rows —
 * on a 0–100 scale, so a career the scene fully knows adds this much fill on
 * top of the base.
 */
export const STANDING_FILL_SHARE = 0.6;

/**
 * What a moving record is worth, as additional share of the room.
 *
 * Smallest of the three, and momentum decays, which is what makes a night
 * booked off the back of a hot record different from one played six weeks
 * after everybody stopped talking about it.
 */
export const MOMENTUM_FILL_SHARE = 0.25;

/*
 * These three sum to 1.2 at their maximum, deliberately more than a full room.
 *
 * Demand is allowed to exceed the room, because that is what selling out means:
 * a promoter books a venue and a career that has outgrown it fills the venue
 * rather than the demand. If the terms summed to exactly 1 the ceiling would
 * only ever bind on a favourable roll, and "the room was full" would be a fact
 * about the seed rather than about the artist.
 */

/** The momentum at which `MOMENTUM_FILL_SHARE` is fully earned. */
export const MOMENTUM_FULL = 1;

/**
 * How much of the room a support slot actually reaches.
 *
 * **Deliberately not `SUPPORT_BILLING_FACTOR`.** M7's constant prices *being
 * told about* an offer — how much a support booking is worth surfacing to the
 * player relative to a headline one. This prices *what the night was*: most of
 * the people in the room came for somebody else, and were not there for you.
 * The two happen to be adjacent numbers and answer unrelated questions; sharing
 * one would mean a change to how offers are ranked silently changed how many
 * people were in a room two months ago.
 */
export const SUPPORT_ROOM_SHARE = 0.45;

/* --- Who cared ------------------------------------------------------------- */

/**
 * The share of a room won over by an artist with no stagecraft at all.
 *
 * A floor rather than zero: some people in any room will take to somebody, and
 * a career whose `performance` skill is 0 has still turned up and played.
 */
export const BASE_WIN_RATE = 0.08;

/**
 * What stagecraft is worth, as additional share of the room won over.
 *
 * `artist_skills.performance` is 0–100 and has meant exactly this since M1
 * without ever having a consumer. A room is where it should matter, and this is
 * the largest single term in the milestone because that is the claim.
 */
export const PERFORMANCE_SKILL_WIN_SHARE = 0.42;

/**
 * What arriving already known is worth to the room.
 *
 * Small. A crowd that knows you is warmer, but a night is judged on the night —
 * standing gets people through the door far more than it wins them over once
 * they are inside, which is why this is a third of its fill counterpart.
 */
export const STANDING_WIN_SHARE = 0.15;

/* --- Who talked ------------------------------------------------------------ */

/**
 * The share of the won-over who tell somebody who was not there.
 *
 * A bounded fraction of `won_over` and never of attendance, because the people
 * who leave talking are the people who were taken with it. This is the third
 * bound in the chain and the reason a night cannot manufacture reach.
 */
export const BASE_TALK_RATE = 0.18;

/** What stagecraft adds to how many leave talking about it. */
export const PERFORMANCE_SKILL_TALK_SHARE = 0.25;

/* --- Texture --------------------------------------------------------------- */

/**
 * The night itself, as a reproducible ± around 1.
 *
 * M5's idiom: texture derived from the seed, never noise. Same seed, same
 * night, forever. Small enough that it colours a night without ever deciding
 * one — a room is not a coin toss.
 */
export const NIGHT_JITTER_SPREAD = 0.08;

/* --- What a night does to standing ----------------------------------------- */

/**
 * The room size at which a night's standing movement is fully earned.
 *
 * **Attendance, never capacity.** A headline slot played to a half-empty room
 * moves a career like a half-empty room, and eighty people in a basement move
 * it less than three hundred in Soweto. This is the denominator that makes that
 * true rather than aspirational.
 */
export const STANDING_ROOM_FULL = 300;

/**
 * Fame moves least: one night is not a broadcast.
 *
 * These are pressure units in M5's fractional accrual, whose integer floor is
 * what the player ever sees. A single small night moves nothing visible, and
 * that is correct — a career becomes known by playing rooms repeatedly.
 */
export const FAME_PER_FULL_ROOM = 0.6;

/** Respect is what a room that was won over gives you. Weighted by `won_over`. */
export const RESPECT_PER_FULL_ROOM = 1.4;

/**
 * Heat is what a night should produce.
 *
 * Velocity: it spikes and it decays, and playing to a live room is exactly the
 * kind of thing that should do that. The largest of the three, and the only one
 * a single night moves visibly.
 */
export const HEAT_PER_FULL_ROOM = 2.2;

/**
 * What word leaving the room adds to Heat, on top of the room itself.
 *
 * People telling people who were not there is the mechanism by which a night
 * outruns its own attendance — and the only one. It is bounded by `won_over`,
 * which is bounded by `attendance`, so this can never exceed a room's worth.
 */
export const HEAT_WORD_SHARE = 0.8;

/* --- What a night does to the audience ------------------------------------- */

/**
 * What being in the room does to a cohort's warmth, per attendee.
 *
 * Being in the room is a stronger encounter than hearing a track, and there are
 * three orders of magnitude fewer people in it — so this is large per head and
 * negligible in total, which is exactly the shape a night should have against a
 * cohort of ninety-four thousand.
 */
export const ROOM_AFFINITY_PER_ATTENDEE = 0.0025;

/** Being won over counts for more than merely being present. */
export const ROOM_AFFINITY_WON_OVER_MULTIPLIER = 3;

/**
 * The most of the won-over who become fans.
 *
 * A room can make a handful of fans. It cannot make a thousand — and because
 * `won_over <= attendance <= capacity`, it structurally cannot make more fans
 * than the room holds however this is tuned.
 */
export const ROOM_FAN_SHARE = 0.12;
