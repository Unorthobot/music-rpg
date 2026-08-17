/**
 * The phase model's numbers, in one place.
 *
 * Every constant here is a statement about what recognition *is*, not a tuning
 * knob aimed at an outcome. They are set against what the simulation actually
 * produces — measured, not guessed — and the scales are documented because a
 * threshold whose units nobody can name is a threshold nobody can argue with.
 *
 * Two of them are deliberately **not** here, and their absence is load-bearing:
 *
 * - The bar for `A_SCENE_THAT_KNOWS_YOU`. That number belongs to a promoter,
 *   the world seeded it, and inventing a second one would put two systems in
 *   charge of what "the scene knows you" means.
 * - The bar for `PEOPLE_WHO_CAME_BACK`. M6 decides when somebody wants back in
 *   the room and `INVITE_MIN_RESPECT` is the director's existing reading of
 *   when they rate the work. Both are read.
 *
 * That leaves three numbers M9 owns, and each is a floor below which a claim
 * would be false rather than a target to reach.
 */

/* --- AUDIENCE_THAT_STAYED ------------------------------------------------- */

/**
 * Fans, across every cohort, at which "some of them stayed" is true.
 *
 * Fans, never listeners — the distinction M5 exists to hold. A fan is a
 * conversion that only happens against genuine fit: M5 gates it on an exponent
 * above one, so a merely tolerable record converts almost nobody however many
 * people hear it. That is what makes this a recognition floor rather than a
 * reach floor.
 *
 * The scale: the observed stalled record — one single, aimed at everybody, 45
 * days of nobody caring — holds four fans and stays there. A record the scene
 * actually took to passes this inside a fortnight.
 */
export const STAYED_MIN_FANS = 40;

/* --- WORK_THAT_LANDED ----------------------------------------------------- */

/**
 * What it takes for one record to have *landed*, as opposed to been released.
 *
 * Three conditions on the same record, and the conjunction is the argument:
 * people listened properly, some of them came back, and some of them stayed.
 * Any one alone is reachable by a record meeting a big enough population;
 * together they describe a record that met an audience that wanted it.
 *
 * A release that reached nobody satisfies none of these, which is precisely why
 * counting *landed* records is not the same as counting releases. Five records
 * put out into silence land zero times.
 */
export const LANDED_MIN_ENGAGED_LISTENERS = 60;
export const LANDED_MIN_REPEAT_LISTENERS = 20;
export const LANDED_MIN_FAN_CONVERSIONS = 10;

/**
 * How many records have to have landed.
 *
 * Two, and this is the model's single most consequential number — it is what
 * separates a career with a body of work from one very good single, and it is
 * the reason the one-dimensional grinder does not come up.
 *
 * The temptation is to read it as a catalogue gate. It is not: the count is
 * over records that *landed*, so a career cannot reach it by releasing more,
 * only by releasing more that worked. And the alternative — one landed record
 * satisfying the family — collapses `WORK_THAT_LANDED` into
 * `AUDIENCE_THAT_STAYED`, since the same conversions produce both, at which
 * point two of the five families are one family wearing two names and a single
 * runaway single carries a career out of the Underground on its own.
 */
export const WORK_MIN_LANDED_RELEASES = 2;
