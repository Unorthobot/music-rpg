/**
 * Every number the relationship derivation uses, named.
 *
 * The rule these encode, and the reason they are not symmetrical:
 *
 * > **Not every disagreement reduces trust, and not every acceptance raises it.**
 *
 * Trust is about *follow-through*, not agreement. Refusing somebody's opening
 * read and then coming back, taking their second pass, working it again and
 * finishing the record is not a betrayal — it is the collaboration working.
 * What damages trust is walking away.
 *
 * Respect is about the work. Pushing for something better and being proved
 * right by the world earns more of it than accepting the first thing offered,
 * which is why refusal has a *positive* respect weight when the record was
 * eventually finished and heard.
 *
 * Tension is orthogonal to both. It rises with friction whether or not the
 * friction was productive, because it is a description of what is unresolved
 * rather than a score for behaviour.
 */

/* --- Familiarity and loyalty: longitudinal by construction ---------------- */

/**
 * One session cannot make two people familiar.
 *
 * These are deliberately small per interaction and small per finished record.
 * Familiarity and loyalty are earned across repeated collaboration — coming
 * back, standing by someone through a record that failed, choosing them again
 * after one that did not — and a single session that reads as "we know each
 * other well" would be the model lying to make a test look better.
 */
export const FAMILIARITY_PER_INTERACTION = 1.1;
export const FAMILIARITY_PER_FINISHED_RECORD = 4;
export const LOYALTY_PER_FINISHED_RECORD = 3.5;
/** Choosing them again, having worked with them before, is the real signal. */
export const LOYALTY_PER_RECHOSEN = 9;

/* --- Trust: did you see it through --------------------------------------- */

export const TRUST_CHOSEN = 6;
export const TRUST_DIRECTION_GIVEN = 3;
/** Taking their read is a small vote of confidence, not a large one. */
export const TRUST_IDEA_TAKEN = 4;
/** Finishing it properly is worth more than agreeing along the way. */
export const TRUST_WORK_MASTERED = 9;
export const TRUST_WORK_KEPT = 5;
export const TRUST_WORK_RELEASED = 8;
/** Refusing a set costs almost nothing on its own — the session continued. */
export const TRUST_IDEAS_REFUSED = -1;
/** Starting something with somebody and leaving is what actually breaks it. */
export const TRUST_WORK_ABANDONED = -22;

/* --- Respect: do they rate what you make ---------------------------------- */

export const RESPECT_DIRECTION_GIVEN = 2;
export const RESPECT_IDEA_TAKEN = 3;
export const RESPECT_IDEAS_COMBINED = 6;
/**
 * Pushing for better, and being right.
 *
 * Refusal and revision earn respect only in a session that was finished —
 * `REFUSAL_UNRESOLVED_FACTOR` strips it back out otherwise, because demanding
 * more and then abandoning it is not the same act.
 */
export const RESPECT_IDEAS_REFUSED = 5;
export const RESPECT_REVISION_ASKED = 4;
export const REFUSAL_UNRESOLVED_FACTOR = -1;
export const RESPECT_WORK_MASTERED = 6;
export const RESPECT_WORK_RELEASED = 5;
/** How well it landed, at full strength, scaled by reception 0–1. */
export const RESPECT_PER_RECEPTION = 18;

/* --- Creative chemistry: is the work better with both of you in the room -- */

export const CHEMISTRY_IDEA_TAKEN = 5;
export const CHEMISTRY_IDEAS_COMBINED = 9;
/** A revision that produced a master is two people converging, not friction. */
export const CHEMISTRY_RESOLVED_REVISION = 7;
export const CHEMISTRY_WORK_MASTERED = 5;
export const CHEMISTRY_PER_RECEPTION = 14;
/**
 * Taking an idea they were behind reads differently from taking one they were
 * lukewarm about. The stance was recorded at the time.
 */
export const CHEMISTRY_STANCE: Record<string, number> = {
  ENTHUSIASTIC: 7,
  INTERESTED: 4,
  COMPROMISING: 1,
  CAUTIOUS: 0,
  PUSHING_BACK: -2,
};

/* --- Tension: what is unresolved ------------------------------------------ */

/**
 * Turning down everything somebody brought you is a real moment, not a note in
 * the margin — you chose them, paid them, and sent the lot back. Priced so that
 * a refused set plus a revision reads as *some tension* rather than as a little
 * friction, because "a little friction" is not what that session was.
 */
export const TENSION_IDEAS_REFUSED = 22;
export const TENSION_REVISION_ASKED = 10;
/** Refusing somebody who was already pushing back lands harder. */
export const TENSION_REFUSED_WHILE_PUSHING_BACK = 7;
export const TENSION_WORK_ABANDONED = 25;
/**
 * Finishing together settles some of it, but never all of it.
 *
 * Deliberately small. At their first values these cancelled roughly half the
 * tension a hard-won session had earned, on the strength of one Underground
 * single doing modestly well — which is the penalty-meter behaviour this
 * dimension exists to avoid. A record going well is not an apology, and the
 * argument you had making it does not stop having happened.
 */
export const TENSION_SETTLED_BY_RELEASE = -2;
export const TENSION_SETTLED_BY_RECEPTION = -3;

/* --- Crew: a standing arrangement, not a session -------------------------- */

/**
 * Saying yes to being crew is the largest single loyalty movement in the model,
 * because it is the one act that is explicitly about commitment rather than
 * about a piece of work. Everything else is earned sideways.
 */
export const LOYALTY_JOINED_CREW = 18;
export const TRUST_JOINED_CREW = 8;
export const FAMILIARITY_JOINED_CREW = 3;

/**
 * Being turned down is not a wound. They said no to a standing arrangement,
 * not to you — it leaves a little tension and nothing else, and asking was
 * still a signal that you rate them.
 */
export const TENSION_DECLINED_CREW = 6;
export const RESPECT_DECLINED_CREW = 1;

/** Walking out of a crew is the one thing that costs loyalty outright. */
export const LOYALTY_LEFT_CREW = -30;
export const TENSION_LEFT_CREW = 20;

/* --- Bounds --------------------------------------------------------------- */

export const RELATIONSHIP_FLOOR = 0;
export const RELATIONSHIP_CEILING = 100;

/**
 * Bands for turning a value into words.
 *
 * Ascending; the last band whose floor is met wins. Deliberately coarse — the
 * player is being told what kind of relationship this is, not its coordinates.
 */
export const RELATIONSHIP_BANDS: [number, string][] = [
  [0, "none"],
  [8, "low"],
  [24, "some"],
  [44, "good"],
  [64, "strong"],
  [82, "exceptional"],
];
