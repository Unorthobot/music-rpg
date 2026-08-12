import type { RelationshipDimension } from "./relationships";

/**
 * Battles.
 *
 * Two artists meet, are judged, and the result means something — where the
 * meaning comes from what each of them actually did, and can be explained
 * afterwards without anybody having decided who should win.
 *
 * ## The line this file exists to keep pinned
 *
 * > A battle is decided by what each artist did, judged three different ways by
 * > judges who are allowed to disagree — and never by a single number that
 * > already knew the answer.
 *
 * There is no `battleScore` type in this file and there must never be one. Each
 * judge produces its own totals from its own inputs, those totals are that
 * judge's and are meaningless beside another judge's, and the canonical result
 * is the *panel's agreement* rather than a sum. A 2-1 is a real 2-1.
 *
 * ## Three vocabularies, kept apart
 *
 * The milestone's central distinction, and the thing most likely to be ruined by
 * convenience:
 *
 * - **Strategy** is what you set out to do. Declared before preparation.
 * - **Performance** is what you actually did. Canonical facts, seven of them.
 * - **Judgement** is how a particular perspective read the performance against
 *   its own mandate.
 *
 * Collapsing any two of those would make the Strategic judge decorative, because
 * executing a weak plan well and abandoning a good one would become the same
 * fact.
 */

/** Which engine derived a performance. Formulas change; recorded facts must not. */
export const BATTLE_SIMULATOR_VERSION = "battles-v1";

/** Which panel produced a verdict. Kept separately: judges version faster. */
export const BATTLE_JUDGE_ENGINE_VERSION = "battle-judges-v1";

/* --- Sides and lifetime ---------------------------------------------------- */

/**
 * Roles rather than "the player and the other one".
 *
 * A challenge the player eventually issues themselves is the same battle with
 * the sides swapped, so nothing downstream may assume the career is the
 * opponent.
 */
export const BATTLE_SIDES = ["CHALLENGER", "OPPONENT"] as const;
export type BattleSide = (typeof BATTLE_SIDES)[number];

export function otherSide(side: BattleSide): BattleSide {
  return side === "CHALLENGER" ? "OPPONENT" : "CHALLENGER";
}

/**
 * The battle's own lifetime, which is not the challenge's.
 *
 * The opportunity is the invitation — *do you want to fight?* — and it has M7's
 * statuses. This is the competitive event, and it has these. Overloading one for
 * the other would make "the offer lapsed" and "nobody turned up" the same row.
 *
 * - `CHALLENGED` — it has been put to the player and is unanswered.
 * - `ACCEPTED`   — they said yes. Nothing has been prepared or declared.
 * - `DECLINED`   — they said no. **Terminal, and emphatically not a loss.**
 * - `SCHEDULED`  — a strategy is declared and the night is on the calendar.
 * - `PERFORMED`  — both performances exist as facts. Nothing is judged.
 * - `JUDGED`     — the panel has ruled. Consequences have not been applied.
 * - `RESOLVED`   — the consequences landed. Terminal.
 */
export const BATTLE_STATUSES = [
  "CHALLENGED",
  "ACCEPTED",
  "DECLINED",
  "SCHEDULED",
  "PERFORMED",
  "JUDGED",
  "RESOLVED",
] as const;
export type BattleStatus = (typeof BATTLE_STATUSES)[number];

/** A battle in one of these will never change again. */
export const TERMINAL_BATTLE_STATUSES: BattleStatus[] = ["DECLINED", "RESOLVED"];

/** Statuses in which the battle is a live commitment the player still owes. */
export const LIVE_BATTLE_STATUSES: BattleStatus[] = [
  "CHALLENGED",
  "ACCEPTED",
  "SCHEDULED",
  "PERFORMED",
  "JUDGED",
];

/* --- Strategy -------------------------------------------------------------- */

/**
 * The angle. A closed vocabulary, declared before preparation and never after.
 *
 * Strategy must change *what is rewarded* rather than adding points. Each of
 * these makes a different subset of the performance consequential, and each is
 * therefore capable of being executed well or badly on its own terms — which is
 * the only thing that makes a Strategic judge more than a second Technical one.
 *
 * Three rather than the brief's two. `OUTWRITE` and `WIN_THE_CROWD` are the
 * milestone's named pair and the spine of the golden proof; `TAKE_THEM_APART`
 * exists because `rebuttal` is in the brief's own list of technical dimensions
 * and, with only the other two, no declared objective ever makes it the point.
 * A fact nothing can ever aim at is a fact that should not be modelled.
 */
export const BATTLE_STRATEGIES = ["OUTWRITE", "WIN_THE_CROWD", "TAKE_THEM_APART"] as const;
export type BattleStrategy = (typeof BATTLE_STRATEGIES)[number];

export const BATTLE_STRATEGY_LABELS: Record<BattleStrategy, string> = {
  OUTWRITE: "Outwrite them",
  WIN_THE_CROWD: "Win the crowd",
  TAKE_THEM_APART: "Take them apart",
};

/** What choosing each angle actually means, in the player's language. */
export const BATTLE_STRATEGY_INTENT: Record<BattleStrategy, string> = {
  OUTWRITE: "Say something they cannot answer. Density over reaction.",
  WIN_THE_CROWD: "Read the room and take it with you. Impact over density.",
  TAKE_THEM_APART: "Make it about them. Answer everything they brought.",
};

/* --- What a performance actually is ---------------------------------------- */

/**
 * The seven facts a battle performance consists of.
 *
 * Structural, deterministic, and emphatically not lyrics: M8 generates no bars
 * and the judges never read prose. Each is 0-100 and none of them is a total —
 * there is deliberately no eighth entry here that sums the others, because the
 * moment one exists every judge quietly starts reading it.
 *
 * Not every judge reads every fact, and that asymmetry is the source of their
 * independence rather than an oversight.
 */
export const BATTLE_PERFORMANCE_FACTS = [
  /** What was said. Density, construction, the writing itself. */
  "writing",
  /** How it sat on the beat. Cadence, pocket, control. */
  "flow",
  /** How it was built. Setup, escalation, where it lands. */
  "structure",
  /** Whether anybody has heard this before. */
  "originality",
  /** How much of what they brought was actually answered. */
  "rebuttal",
  /** How it was carried in the room. Presence, timing, conviction. */
  "delivery",
  /** Whether the room was taken with them. */
  "crowdWork",
] as const;
export type BattlePerformanceFact = (typeof BATTLE_PERFORMANCE_FACTS)[number];

export type BattlePerformanceFacts = Record<BattlePerformanceFact, number>;

export const BATTLE_PERFORMANCE_FACT_LABELS: Record<BattlePerformanceFact, string> = {
  writing: "Writing",
  flow: "Flow",
  structure: "Structure",
  originality: "Originality",
  rebuttal: "Rebuttal",
  delivery: "Delivery",
  crowdWork: "Crowd work",
};

/** Facts are bounded so nothing can run away, and so a judge cannot be gamed. */
export const PERFORMANCE_FACT_FLOOR = 0;
export const PERFORMANCE_FACT_CEILING = 100;

/**
 * How one fact was arrived at.
 *
 * The versioned half of a performance. The fact itself is a real column and its
 * bound is kept by the database; *this* is what a newer engine will change, and
 * keeping it means an old battle stays explicable under a new one.
 */
export type PerformanceFactDerivation = {
  fact: BattlePerformanceFact;
  /** The craft this fact is grounded in, before anything modified it. */
  base: number;
  /** What the declared angle did to it, and why. */
  strategyShift: number;
  /** What preparation bought. Bounded, and never enough on its own. */
  preparationShift: number;
  /** Temperament under pressure. Seeded, reproducible, never `Math.random`. */
  composureShift: number;
  /** Where it ended up, after bounding. */
  value: number;
  /** One line: which skills and which choices produced this. */
  note: string;
};

/**
 * Everything about what one artist did on the night.
 *
 * `strategy` sits beside `facts` rather than inside them on purpose. What you
 * tried to do and what you actually did are different, and the Strategic judge
 * exists because they can come apart.
 */
export type BattlePerformance = {
  side: BattleSide;
  artistId: string;
  strategy: BattleStrategy;
  facts: BattlePerformanceFacts;
  derivation: PerformanceFactDerivation[];
  preparation: BattlePreparation;
  simulatorVersion: string;
};

/* --- Preparation ----------------------------------------------------------- */

/**
 * What preparing actually cost, and what it bought.
 *
 * Preparation must spend something scarce — the studio time a record would
 * otherwise have had, and the money that time costs — so entering a battle is a
 * decision about the career rather than only about the battle. It raises the
 * ceiling. It does not guarantee the floor, and the bound below is why: no
 * amount of preparing lifts a fact past what the artist can actually do.
 */
export const MAX_PREPARATION_SESSIONS = 3;

export type BattlePreparation = {
  /** How many sessions went into it. Bounded by `MAX_PREPARATION_SESSIONS`. */
  sessions: number;
  /** What it cost, in integer minor units, through the existing ledger. */
  spendMinor: number;
  /** The game days it occupied. A prepared artist gave up those days. */
  daysCommitted: number;
};

export const NO_PREPARATION: BattlePreparation = {
  sessions: 0,
  spendMinor: 0,
  daysCommitted: 0,
};

/* --- The judges ------------------------------------------------------------ */

/**
 * The panel.
 *
 * Three perspectives that answer three different questions from three different
 * inputs, and are capable of reaching three different answers. Not three
 * differently named wrappers around one score — if a golden run cannot produce a
 * split decision, the judges are not independent and the model has failed.
 *
 * This is a list of the judges M8 has, not an assertion that a panel is three.
 * Judgements are rows, and `BattlePanelRole` is what lets a fourth perspective be
 * recorded later without retroactively changing what an old battle decided.
 */
export const BATTLE_JUDGES = ["TECHNICAL", "STRATEGIC", "AUDIENCE"] as const;
export type BattleJudge = (typeof BATTLE_JUDGES)[number];

/**
 * Whether a judge's vote counts toward the result.
 *
 * `REQUIRED` judges decide. `ADVISORY` ones may observe and be recorded — a
 * community vote, a promoter's opinion — without any battle that has already
 * been decided changing its mind.
 */
export const BATTLE_PANEL_ROLES = ["REQUIRED", "ADVISORY"] as const;
export type BattlePanelRole = (typeof BATTLE_PANEL_ROLES)[number];

/** The judges an M8 result is derived from. Ordered; the order is stable. */
export const REQUIRED_BATTLE_PANEL: BattleJudge[] = ["TECHNICAL", "STRATEGIC", "AUDIENCE"];

/** The question each one is actually answering. */
export const BATTLE_JUDGE_QUESTIONS: Record<BattleJudge, string> = {
  TECHNICAL: "Was this well made?",
  STRATEGIC: "Did they do what they set out to do?",
  AUDIENCE: "Did this work, for this crowd, in this room?",
};

/**
 * Each judge's own closed term vocabulary.
 *
 * Deliberately three separate lists rather than one shared enum. A shared list
 * would let two judges weigh the same named thing, and the first time that
 * happened the panel would start agreeing for reasons that have nothing to do
 * with their mandates. These do not overlap, and that is the independence.
 */
export const TECHNICAL_JUDGE_TERMS = [
  "writing",
  "flow",
  "structure",
  "originality",
  "rebuttal",
] as const;
export type TechnicalJudgeTerm = (typeof TECHNICAL_JUDGE_TERMS)[number];

export const STRATEGIC_JUDGE_TERMS = [
  /** Did the performance actually look like the thing they declared? */
  "intentMatch",
  /** Did they hold the angle, or drift into a safer one? */
  "commitment",
  /** Did the angle answer what the other artist actually brought? */
  "opponentAnswered",
  /** What the angle gave up, and whether it was worth giving up. */
  "costOfChoice",
] as const;
export type StrategicJudgeTerm = (typeof STRATEGIC_JUDGE_TERMS)[number];

export const AUDIENCE_JUDGE_TERMS = [
  /** What the people actually in this room listen for. M5's cohorts, read. */
  "cohortTaste",
  /** Whether this scene knows the artist at all. */
  "sceneStanding",
  /** Whether the angle was legible to *these* people. */
  "legibility",
  /** Whether the room was taken with them. */
  "roomHistory",
] as const;
export type AudienceJudgeTerm = (typeof AUDIENCE_JUDGE_TERMS)[number];

export type BattleJudgeTerm = TechnicalJudgeTerm | StrategicJudgeTerm | AudienceJudgeTerm;

/**
 * One named contribution to one judge's reading of one side.
 *
 * The `RankingContribution` shape M7 already uses, because "why did this
 * outrank that" and "why did this judge prefer that performance" are the same
 * question asked of different things, and an inspector should not have to learn
 * two formats.
 */
export type JudgeContribution = {
  term: BattleJudgeTerm;
  /** What this side actually did, on the term's own scale. */
  challengerInput: number;
  opponentInput: number;
  weight: number;
  /** What the term contributed to each side, after weighting. */
  challengerContribution: number;
  opponentContribution: number;
  /** Why this term is worth what it is worth here, in one line. */
  note: string;
};

/**
 * One judge, having decided.
 *
 * The totals are real and they are *this judge's*. They are not comparable with
 * another judge's totals, nothing sums them across the panel, and the battle's
 * result is derived from `verdict` rather than from either number.
 */
export type JudgeDecision = {
  judge: BattleJudge;
  panelRole: BattlePanelRole;
  question: string;
  /** Who this judge gave it to. */
  verdict: BattleSide;
  challengerTotal: number;
  opponentTotal: number;
  /** How close it was, for this judge. A near-tie is a real fact. */
  margin: number;
  contributions: JudgeContribution[];
  /**
   * Facts this judge does not consider.
   *
   * Recorded because "that was irrelevant to me" is a real answer to "why did
   * the audience disagree with the technical judge", and a panel that can only
   * list what mattered cannot give it.
   */
  irrelevant: string[];
  engineVersion: string;
};

/* --- The result ------------------------------------------------------------ */

/**
 * What the panel decided.
 *
 * Derived from the required judges' verdicts and nothing else. There is no
 * aggregate score here, and `decision` is the *shape* of the agreement rather
 * than a margin: "2-1" says something true about a battle that a number cannot.
 */
export type BattleResult = {
  winner: BattleSide;
  loser: BattleSide;
  winnerArtistId: string;
  loserArtistId: string;
  /** "2-1", "3-0". Derived from the votes, never independently decided. */
  decision: string;
  /** Every required judge, in panel order, with what it decided and why. */
  judgements: JudgeDecision[];
  /** True when the panel did not agree. The interesting case. */
  split: boolean;
  engineVersion: string;
};

/**
 * One of M5's populations, as the Audience judge needs to see it.
 *
 * Deliberately a *narrowing* of what `audience_cohorts` already holds rather
 * than a new description of who these people are. Every field is M5's, read: the
 * concentration the world seeded, the size the world seeded, the taste weights
 * the cohort has applied to every record in the game, and the affinity reception
 * accumulated. The battle engine adds nothing to it and may not.
 *
 * `qualities` is the important one. It is the cohort's own weighting of focus,
 * distinctiveness and immediacy — the same three axes `evaluateCohort` has used
 * since M5 — and it is why a room in Alexandra and a room in Braamfontein reach
 * different answers about an identical performance.
 */
export type BattleCohortFacts = {
  slug: string;
  name: string;
  size: number;
  /** Where this population is concentrated, by scene slug. Sums to 1. */
  sceneAffinity: Record<string, number>;
  /** What they listen for. M5's own weights, never this engine's. */
  qualities: { focus: number; distinctiveness: number; immediacy: number };
  /**
   * How closely this population follows anything, 0-1. M5's `behaviour.attention`.
   *
   * Read here as the nearest thing the world already records to "would they turn
   * out for this", because a battle room is self-selected rather than sampled.
   * Not a new fact about these people — the same number reception has used since
   * M5.
   */
  attention: number;
};

/* --- Scouting -------------------------------------------------------------- */

/**
 * What is knowable about somebody, from what the world actually recorded.
 *
 * Scouting reveals; it does not improve. Nothing in this type is an input to a
 * judge, and the report is deliberately produced by a different module from the
 * one that derives performances so that it cannot become a hidden modifier.
 *
 * `unknowns` matters as much as `findings`. A scouting report that quietly
 * omitted what it could not establish would imply the world knows more about a
 * stranger than it does.
 */
export type ScoutingFinding = {
  /** What was established. */
  label: string;
  /** The recorded value it was established from. Never prose. */
  observed: Record<string, number | string | boolean | null>;
  /** Which canonical system knew this. */
  source: "WORLD" | "RELATIONSHIP" | "SCENE" | "BATTLE_HISTORY";
};

export type ScoutingReport = {
  subjectArtistId: string;
  findings: ScoutingFinding[];
  /** Named things that could not be known, and why not. */
  unknowns: { label: string; reason: string }[];
  scoutedAtGameTime: string;
};

/* --- What a battle does to the people in it -------------------------------- */

/**
 * The competitive interactions, and exactly which dimensions each may move.
 *
 * M6 established that relationship change is semantic. There is no
 * `rivalry = margin * multiplier` anywhere in this milestone: a battle produces
 * *named things that happened between two people*, and the fold prices those.
 *
 * Two properties of this table are the milestone's position on rivalry:
 *
 * - **Rivalry is not tension.** They move independently and both are real. Two
 *   artists who respect each other enormously and measure themselves against
 *   each other constantly is the most interesting relationship in the game, and
 *   it must be reachable.
 * - **Refusing is not cowardice.** `CHALLENGE_DECLINED` cannot move respect, in
 *   either direction, and the empty entry below is load-bearing rather than an
 *   omission. "I don't battle" is a legitimate artist identity, and a model that
 *   quietly taxed it would have decided otherwise on the player's behalf.
 */
export const BATTLE_INTERACTION_KINDS = [
  /** They put it to you. Somebody has decided you are worth measuring against. */
  "CHALLENGE_ISSUED",
  /** You agreed to be measured. */
  "CHALLENGE_ACCEPTED",
  /** You refused. A decision, not a forfeit and not a loss. */
  "CHALLENGE_DECLINED",
  /** You won it. */
  "BATTLE_WON",
  /** You lost it. */
  "BATTLE_LOST",
  /** Whoever took it, it was close. Unfinished business. */
  "CLOSE_CONTEST",
  /** It was not close. */
  "DECISIVE_CONTEST",
  /** The craft was acknowledged, whatever the panel decided overall. */
  "CRAFT_ACKNOWLEDGED",
] as const;
export type BattleInteractionKind = (typeof BATTLE_INTERACTION_KINDS)[number];

/**
 * Which dimensions each competitive interaction is *permitted* to touch.
 *
 * Declared here, beside the vocabulary, so that a derivation which started
 * moving something it should not is visible as a disagreement between two files
 * rather than only as a surprising number. The empty list on
 * `CHALLENGE_DECLINED`'s respect is the point of the whole table.
 */
export const BATTLE_INTERACTION_DIMENSIONS: Record<
  BattleInteractionKind,
  RelationshipDimension[]
> = {
  CHALLENGE_ISSUED: ["familiarity", "rivalry"],
  CHALLENGE_ACCEPTED: ["familiarity", "rivalry", "respect"],
  /* Familiarity and tension only. Never respect — in either direction. */
  CHALLENGE_DECLINED: ["familiarity", "tension"],
  BATTLE_WON: ["familiarity", "rivalry", "respect"],
  BATTLE_LOST: ["familiarity", "rivalry", "respect"],
  CLOSE_CONTEST: ["rivalry", "respect"],
  DECISIVE_CONTEST: ["rivalry", "tension"],
  CRAFT_ACKNOWLEDGED: ["respect"],
};

/* --- Standing ------------------------------------------------------------- */

/**
 * What a battle does to a career's standing, before M5's accrual sees it.
 *
 * The same `MetricPressure` shape reception produces, deliberately, because it
 * goes through the same accrual and the same two readers. A battle is a *room*,
 * not a release: it should move Respect where it earns it, move Heat because
 * competitive attention is exactly what Heat measures, and barely touch Fame for
 * the same reason a hundred-person room does not make anybody widely known.
 *
 * **Legacy is absent, and there is no field through which it could arrive.**
 */
export type BattleStandingPressure = {
  fame: number;
  respect: number;
  heat: number;
  /** Each figure above, with the facts that produced it. Never a bare number. */
  contributions: {
    metric: "fame" | "respect" | "heat";
    input: number;
    weight: number;
    contribution: number;
    note: string;
  }[];
};
