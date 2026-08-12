import type { BattlePerformanceFact, BattleStrategy } from "@music-rpg/shared";

/**
 * Named coefficients for battles.
 *
 * Every number the battle engine uses lives here with a line saying what it
 * means, for the reason M5's and M7's constants do: a magic number buried inside
 * a function is a decision nobody can argue with later. Anything changed after
 * seeing a test output is a calibration, and calibrations are reported.
 */

/* --- Turning craft into a performance -------------------------------------- */

/**
 * What each performance fact is *made of*, in skills and temperament.
 *
 * Shares within a fact sum to 1, so a fact is always on the same 0-100 scale as
 * the skills behind it and no fact can be inflated by adding another input to
 * it. `psych` entries read psychology rather than skills — how somebody holds up
 * in a room is temperament, not craft, and `rebuttal` in particular is battle
 * reading plus the ability to change plan mid-verse.
 */
export const FACT_COMPOSITION: Record<
  BattlePerformanceFact,
  { skills?: Partial<Record<string, number>>; psych?: Partial<Record<string, number>> }
> = {
  writing: { skills: { lyricism: 0.65, storytelling: 0.35 } },
  flow: { skills: { flow: 0.8, performance: 0.2 } },
  structure: { skills: { storytelling: 0.45, lyricism: 0.3, battleIQ: 0.25 } },
  originality: { skills: { experimentation: 0.55, lyricism: 0.25, versatility: 0.2 } },
  /* Reading what they did, and being able to change plan because of it. */
  rebuttal: { skills: { battleIQ: 0.7 }, psych: { adaptability: 0.3 } },
  delivery: { skills: { performance: 0.75 }, psych: { confidence: 0.25 } },
  crowdWork: { skills: { performance: 0.5 }, psych: { confidence: 0.3, adaptability: 0.2 } },
};

/**
 * What each declared angle actually does to the performance.
 *
 * **This is the milestone's central mechanic and the thing most likely to be
 * quietly ruined.** Strategy does not add points to a score — it changes what
 * the artist actually did, in facts, before any judge sees anything. An
 * `OUTWRITE` performance genuinely contains denser writing and less crowd work,
 * and the reason the Technical judge rates it higher is that the facts it reads
 * are higher, not that it has been told about the strategy.
 *
 * Every angle gives something up. The negatives are not a balancing tax, they
 * are what choosing means: you cannot spend a round on construction and on the
 * room at the same time.
 *
 * Values are in fact-points, applied before bounding.
 */
export const STRATEGY_EMPHASIS: Record<
  BattleStrategy,
  Partial<Record<BattlePerformanceFact, number>>
> = {
  /* Density over reaction. Say something they cannot answer. */
  OUTWRITE: {
    writing: 12,
    originality: 9,
    structure: 6,
    crowdWork: -11,
    delivery: -5,
  },
  /* Impact over density. Read the room and take it with you. */
  WIN_THE_CROWD: {
    crowdWork: 13,
    delivery: 9,
    flow: 5,
    writing: -8,
    structure: -9,
  },
  /* Make it about them. Answer everything they brought. */
  TAKE_THEM_APART: {
    rebuttal: 15,
    writing: 5,
    originality: -8,
    structure: -4,
  },
};

/**
 * What each angle actually *asks of you*.
 *
 * Added after inspecting the Strategic judge, which was found to be barely
 * discriminating: its dominant term compared 76.2 against 77.4 because
 * `STRATEGY_EMPHASIS` is a constant, so every artist declaring the same angle
 * moved the same distance from their own baseline. The judge was measuring the
 * table above rather than anything the artist did — which is precisely the
 * "three differently named wrappers around one score" failure the milestone must
 * not have.
 *
 * An angle is an *attempt*, and attempts depend on whether you can do the thing.
 * Declaring `TAKE_THEM_APART` with a battle IQ of 48 is a harder plan to carry
 * out than the same declaration at 82, and the difference should be visible in
 * what the round actually contained.
 *
 * Shares within an angle sum to 1, so aptitude is on the same 0-100 scale as the
 * abilities behind it.
 */
export const STRATEGY_APTITUDE: Record<
  BattleStrategy,
  { skills?: Partial<Record<string, number>>; psych?: Partial<Record<string, number>> }
> = {
  /* Can you actually write denser, or only say that you will? */
  OUTWRITE: { skills: { lyricism: 0.55, experimentation: 0.25, storytelling: 0.2 } },
  /* Can you actually take a room? */
  WIN_THE_CROWD: {
    skills: { performance: 0.55 },
    psych: { confidence: 0.25, adaptability: 0.2 },
  },
  /* Can you actually answer somebody in real time? */
  TAKE_THEM_APART: { skills: { battleIQ: 0.7 }, psych: { adaptability: 0.3 } },
};

/**
 * The floor on what an angle buys somebody unsuited to it.
 *
 * Aptitude scales the *gain* an angle produces, never the cost — attempting
 * something you are not built for still spends what the angle spends, and simply
 * buys less of it. That asymmetry is what makes choosing an angle a real
 * decision about fit rather than a lever every artist can pull equally hard.
 */
export const STRATEGY_APTITUDE_FLOOR = 0.4;

/**
 * How much of a fact's own value one full course of preparation can add.
 *
 * Proportional to what is already there rather than to the headroom above it,
 * deliberately. Preparation sharpens what an artist can actually do; it does not
 * invent ability they do not have, and a model that filled headroom would have
 * rewarded being bad at something. This is what makes a prepared weak performance
 * still lose to a strong unprepared one — which the golden proof asserts.
 */
export const PREPARATION_LIFT_PER_SESSION = 0.045;

/** Beyond this, more preparation is not more performance. */
export const MAX_PREPARATION_SESSIONS = 3;

/**
 * Preparation is disciplined work, so discipline decides how much of it lands.
 *
 * The floor means an undisciplined artist still gains something from rehearsing;
 * the range above it is what discipline is worth.
 */
export const PREPARATION_DISCIPLINE_FLOOR = 0.55;

/** What one preparation session costs, in integer minor units. */
export const PREPARATION_SESSION_COST_MINOR = 45_000;

/** Game days one preparation session occupies. It is time a record could have had. */
export const PREPARATION_SESSION_DAYS = 1;

/**
 * How much a performance varies on the night, at most, in fact-points.
 *
 * Seeded and reproducible — the same battle always produces the same nerves.
 * Scaled down by resilience below, so somebody who has done this a hundred times
 * is more consistent than somebody who has not.
 */
export const COMPOSURE_SPREAD = 6;

/** The most resilience can damp variation. 1 would make a machine. */
export const COMPOSURE_RESILIENCE_DAMPING = 0.75;

/* --- The Technical judge --------------------------------------------------- */

/**
 * What craft is, to the judge whose only question is whether this was well made.
 *
 * Fixed. The Technical judge does not read the declared strategy at all — it is
 * not given the field — and the brief's requirement that `OUTWRITE` be rewarded
 * technically is met by the *facts* being different, not by the judge being told
 * what to think. A judge that changed its mandate depending on what the artist
 * announced would not be an independent perspective, it would be a scorekeeper.
 *
 * Weights sum to 1 so the total stays on a 0-100 scale.
 */
export const TECHNICAL_WEIGHTS = {
  writing: 0.26,
  flow: 0.2,
  structure: 0.2,
  originality: 0.19,
  rebuttal: 0.15,
} as const;

/* --- The Strategic judge --------------------------------------------------- */

/**
 * What executing a plan is worth, to the judge who only asks whether they did
 * what they said they would.
 *
 * `intentMatch` dominates because that is the question. `commitment` is what
 * separates holding an angle from drifting into a safer one. `opponentAnswered`
 * is the only term in the whole engine that reads *both* performances
 * relationally, and it is why a technically stronger artist can lose this judge:
 * a plan that ignored what the other person actually brought was badly chosen and
 * badly carried out, whatever it contained.
 */
export const STRATEGIC_WEIGHTS = {
  intentMatch: 0.4,
  commitment: 0.24,
  opponentAnswered: 0.24,
  costOfChoice: 0.12,
} as const;

/** How far a fact must move from an artist's own baseline to count as committed. */
export const COMMITMENT_FULL_CONTRAST = 18;

/* --- The Audience judge ---------------------------------------------------- */

/**
 * What a room is weighing, to the judge who only asks whether it worked *here*.
 *
 * `cohortTaste` dominates because the whole point of this judge is that it reads
 * M5's existing populations rather than a battle-specific crowd model. The
 * cohorts already differ enormously in what they listen for — scene heads weight
 * immediacy at 0.13 and casual listeners at 0.62 — so a room's composition alone
 * is enough to make this judge disagree with the other two.
 *
 * There was a fourth term here, `immediacy`, weighing whether the round landed on
 * the first pass. It was removed on inspection: `cohortTaste` already carries the
 * immediacy axis *weighted by how much this particular room wants it*, so a
 * standalone copy was the same quality judgement again with the room taken back
 * out. A judge whose entire mandate is "did this work for **this** crowd in
 * **this** room" must not carry a term that reads identically in every room, and
 * its weight has gone to the terms that do vary.
 */
export const AUDIENCE_WEIGHTS = {
  cohortTaste: 0.5,
  legibility: 0.2,
  roomHistory: 0.18,
  sceneStanding: 0.12,
} as const;

/**
 * How much raw population counts toward who is actually in a battle room.
 *
 * Added after inspecting the room model, which was found to produce the same
 * room everywhere: weighting cohorts by `sceneAffinity × size` made casual
 * listeners 88-98% of every scene, and Alexandra and Soweto came out identical to
 * within a tenth of a percent. An Audience judge whose rooms are all the same
 * room cannot be context-sensitive, however carefully it reads them.
 *
 * The flaw was conceptual rather than numeric. `audience_cohorts.size` is *city
 * population* — 94,000 casual listeners against 420 tastemakers — and a battle
 * room is not a sample of a city. It is ninety to two hundred people who chose to
 * turn out for a competitive event in a particular scene, and that self-selects
 * hard toward the invested. Population barely predicts who is in that room;
 * scene investment does.
 *
 * So population still counts, heavily damped, and is multiplied by the cohort's
 * own recorded `attention` — M5's existing measure of how closely a population
 * follows anything, which is the nearest thing the world already holds to
 * "would they come out for this". Nothing new is invented about who these people
 * are.
 *
 * At 0.35 the seeded scenes come apart the way their own descriptions say they
 * should: Braamfontein fills with scene heads, Maboneng with tastemakers, and
 * Alexandra and Soweto stay broad.
 */
export const ROOM_POPULATION_DAMPING = 0.35;

/**
 * Which performance facts stand in for M5's three quality axes.
 *
 * The Audience judge does not get its own vocabulary of taste. It translates a
 * battle performance into the axes `audience_cohorts.preferences.qualities`
 * already weighs — focus, distinctiveness, immediacy — and then asks the cohorts
 * what they make of it, using their own recorded weights. That is what "the
 * audience judge reads M5's cohorts" has to mean if it is to mean anything.
 */
export const AUDIENCE_QUALITY_MAPPING = {
  /** Is it built? A room feels construction as coherence. */
  focus: { structure: 0.6, flow: 0.4 },
  /** Have we heard this? */
  distinctiveness: { originality: 0.7, writing: 0.3 },
  /** Did it land now, in the room, on the first pass? */
  immediacy: { crowdWork: 0.5, delivery: 0.35, flow: 0.15 },
} as const;

/**
 * How legible each angle is to a room, 0-100, before the room's own taste.
 *
 * Not a quality judgement. `WIN_THE_CROWD` is easy for anybody present to
 * recognise as what it is; `OUTWRITE` frequently is not, which is exactly the
 * brief's point that density is not the same as impact. `TAKE_THEM_APART` sits
 * between them because a room can always tell when somebody is being answered.
 */
export const STRATEGY_LEGIBILITY: Record<BattleStrategy, number> = {
  OUTWRITE: 42,
  WIN_THE_CROWD: 88,
  TAKE_THEM_APART: 68,
};

/**
 * How much of legibility a cohort that wants immediacy actually cares about.
 *
 * Scene heads reward being made to work for it; casual listeners do not. Read
 * from each cohort's own `qualities.immediacy`, so this is a scale rather than a
 * second opinion about who those people are.
 */
export const LEGIBILITY_IMMEDIACY_SCALE = 1.4;

/* --- Consequences ---------------------------------------------------------- */

/**
 * What a battle is worth to standing, per point of judged margin.
 *
 * A battle is a *room*, not a release, and these are set so it reads that way.
 * Respect moves most, because being taken seriously by the people who were there
 * is precisely what a battle establishes. Heat moves nearly as much, because
 * competitive attention is exactly what Heat measures. Fame barely moves, for the
 * same reason a hundred-person room does not make anybody widely known — it is
 * scaled by the room's actual capacity and nothing else.
 *
 * **Legacy has no coefficient here and must never acquire one.**
 */
export const RESPECT_PER_WIN = 2.4;
export const RESPECT_PER_LOSS = 0.55;
/** Showing up against somebody better and being close is worth something. */
export const RESPECT_PER_CLOSE_CONTEST = 0.8;
export const HEAT_PER_WIN = 2.1;
export const HEAT_PER_LOSS = 0.9;

/**
 * Fame per person in the room, per win.
 *
 * Deliberately tiny. KGOSI's rooftop holds 220, so winning it accrues roughly a
 * fifth of a Fame point — which is the honest answer to "does one Underground
 * battle make you famous".
 */
export const FAME_PER_HEAD_IN_ROOM = 0.0009;

/** Losing is still exposure. Fewer people repeat your name afterwards. */
export const FAME_LOSS_FACTOR = 0.4;

/**
 * How decisive a panel has to be before a contest stops being close.
 *
 * Measured on the required judges' agreement rather than on any judge's totals:
 * a 2-1 is close because the panel nearly went the other way, and a 3-0 is not.
 */
export const CLOSE_CONTEST_MAX_MARGIN = 0.5;
