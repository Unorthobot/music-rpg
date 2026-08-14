import {
  PERFORMANCE_FACT_BOUNDS,
  PERFORMANCE_SIMULATOR_VERSION,
  clamp,
  roundTo,
  type PerformanceContribution,
  type PerformanceDerivation,
  type PerformanceFact,
  type PerformanceFacts,
  type ShowcaseBilling,
} from "@music-rpg/shared";
import { seededJitter } from "../random";
import {
  BASE_TALK_RATE,
  BASE_WIN_RATE,
  MOMENTUM_FILL_SHARE,
  MOMENTUM_FULL,
  NIGHT_JITTER_SPREAD,
  PERFORMANCE_SKILL_TALK_SHARE,
  PERFORMANCE_SKILL_WIN_SHARE,
  ROOM_BASE_FILL,
  STANDING_FILL_SHARE,
  STANDING_WIN_SHARE,
  SUPPORT_ROOM_SHARE,
} from "./constants";

/**
 * What happened in the room.
 *
 * Pure. Facts in, three facts out, with the argument that produced each of
 * them. No database, no clock, no network, no `Math.random` — the same inputs
 * and the same seed give the same night forever, which is what lets a night
 * that happened months ago still be explained under an engine that has since
 * changed.
 *
 * **Every input already exists.** The billing, the room and the fee were the
 * promoter's and were recorded when the offer was accepted; the scene standing
 * comes from M7's own `sceneStanding()` over M5's own cohort rows; the momentum
 * is `release_performance.current_momentum`; the skill is
 * `artist_skills.performance`. Nothing here is invented at resolution time, and
 * nothing outside the closed `PERFORMANCE_TERMS` list may influence a fact.
 *
 * **The three facts are a chain, not a vector.** `attendance` is bounded by the
 * room, `wonOver` by `attendance`, `wordLeftTheRoom` by `wonOver`. Each bound is
 * applied here *and* kept by the database, and each derivation records whether
 * the bound actually bit. Nothing sums them and nothing outside them is
 * returned: there is no fourth number that already knew the answer.
 */
export type ResolvePerformanceInput = {
  /** The promoter's room. The ceiling on everything. */
  capacity: number;
  /** Carrying the night, or opening it. */
  billing: ShowcaseBilling;
  /** How well this scene knows the name, 0–100, from `sceneStanding()`. */
  sceneStanding: number;
  /** `current_momentum` on the career's best-moving release. */
  momentum: number;
  /** `artist_skills.performance`, 0–100. */
  performanceSkill: number;
  /** Reproducible texture. Same seed, same night. */
  seed: string;
};

export type ResolvePerformanceResult = {
  facts: PerformanceFacts;
  derivation: PerformanceDerivation[];
  simulatorVersion: string;
  seed: string;
};

function contribution(
  term: PerformanceContribution["term"],
  input: number,
  weight: number,
  note: string,
): PerformanceContribution {
  return {
    term,
    input: roundTo(input, 4),
    weight,
    contribution: roundTo(input * weight, 4),
    note,
  };
}

/**
 * The sum of a fact's named contributions, as a share of whatever bounds it.
 *
 * Terms carrying `weight: 0` contribute nothing here on purpose. `billing` and
 * `nerves` are *multipliers* applied to the other terms rather than quantities
 * added beside them, and they are recorded as zero-weight rows so an inspector
 * can see the number that was applied without it being double-counted into the
 * total. A derivation that hid them would be unable to explain why the same
 * room produced two different nights.
 */
function shareOf(contributions: PerformanceContribution[]): number {
  return contributions.reduce((running, entry) => running + entry.contribution, 0);
}

function derive(
  fact: PerformanceFact,
  contributions: PerformanceContribution[],
  bound: number,
  note: string,
): { entry: PerformanceDerivation; value: number } {
  // The bound's name comes from the shared vocabulary rather than from a string
  // here, so the resolver and the schema's CHECK constraints cannot drift.
  const boundLabel = PERFORMANCE_FACT_BOUNDS[fact];
  const unbounded = Math.round(shareOf(contributions) * bound);
  const value = clamp(unbounded, 0, bound);

  return {
    value,
    entry: {
      fact,
      value,
      bound,
      boundLabel,
      // Said out loud, because "the room was full" and "the room was this size"
      // are different facts and only one of them is about the artist.
      bounded: unbounded >= bound,
      contributions,
      note,
    },
  };
}

export function resolvePerformance(
  input: ResolvePerformanceInput,
): ResolvePerformanceResult {
  const capacity = Math.max(1, Math.floor(input.capacity));
  const standing = clamp(input.sceneStanding, 0, 100) / 100;
  const momentum = clamp(input.momentum / MOMENTUM_FULL, 0, 1);
  const skill = clamp(input.performanceSkill, 0, 100) / 100;

  /*
   * The night itself. One jitter per fact, each keyed on the fact's own name, so
   * a room that filled well did not also, by the same roll, win everybody over.
   */
  const jitterFor = (fact: PerformanceFact) =>
    seededJitter(NIGHT_JITTER_SPREAD, input.seed, "night", fact);

  /*
   * --- 1. Who turned up ----------------------------------------------------
   *
   * A share of the room, bounded by the room. `SUPPORT` reaches a fraction of
   * it, because most of the people in a support room came for the headliner and
   * were not there for you — the same night, the same venue, a different
   * encounter.
   */
  const billingWeight = input.billing === "HEADLINE" ? 1 : SUPPORT_ROOM_SHARE;
  const attendanceJitter = jitterFor("attendance");

  const attendanceContributions = [
    contribution(
      "room",
      ROOM_BASE_FILL,
      billingWeight * attendanceJitter,
      input.billing === "HEADLINE"
        ? `${promoterRoom(capacity)} — people who came for the night itself.`
        : `${promoterRoom(capacity)} — but most of them came for the headliner.`,
    ),
    contribution(
      "sceneStanding",
      standing * STANDING_FILL_SHARE,
      billingWeight * attendanceJitter,
      `How well the scene knows the name, which is what gets people through the door.`,
    ),
    contribution(
      "momentum",
      momentum * MOMENTUM_FILL_SHARE,
      billingWeight * attendanceJitter,
      momentum > 0
        ? `Something of theirs is still moving.`
        : `Nothing of theirs is moving right now.`,
    ),
    contribution(
      "billing",
      billingWeight,
      0,
      input.billing === "HEADLINE"
        ? `Carrying the night: the room is there for them.`
        : `Opening the night: they reach ${Math.round(SUPPORT_ROOM_SHARE * 100)}% of the room.`,
    ),
    contribution(
      "nerves",
      attendanceJitter,
      0,
      `The night itself, from the seed. Reproducible, never noise.`,
    ),
  ];

  const attendance = derive(
    "attendance",
    attendanceContributions,
    capacity,
    `Bounded by the room. A night can never reach more people than were in it.`,
  );

  /*
   * --- 2. Who cared --------------------------------------------------------
   *
   * A share of the people who were actually there. Stagecraft is the largest
   * term in the milestone, because `artist_skills.performance` has meant this
   * since M1 and a room is where it should finally matter.
   */
  const winJitter = jitterFor("wonOver");

  const wonOverContributions = [
    contribution("room", BASE_WIN_RATE, winJitter, `Some of any room takes to somebody.`),
    contribution(
      "performanceSkill",
      skill * PERFORMANCE_SKILL_WIN_SHARE,
      winJitter,
      `Stagecraft. The one skill that has always meant this.`,
    ),
    contribution(
      "sceneStanding",
      standing * STANDING_WIN_SHARE,
      winJitter,
      `A crowd that already knows them is warmer — but a night is judged on the night.`,
    ),
    contribution("nerves", winJitter, 0, `The night itself, from the seed.`),
  ];

  const wonOver = derive(
    "wonOver",
    wonOverContributions,
    attendance.value,
    `Bounded by who was there. You cannot win over people who did not come.`,
  );

  /*
   * --- 3. Who talked -------------------------------------------------------
   *
   * A share of the people who were taken with it, and never of the room. This
   * is the third link in the chain and the reason a night cannot manufacture
   * reach: word is bounded by `wonOver`, which is bounded by `attendance`,
   * which is bounded by the room.
   */
  const talkJitter = jitterFor("wordLeftTheRoom");

  const wordContributions = [
    contribution(
      "room",
      BASE_TALK_RATE,
      talkJitter,
      `Some of the people who were taken with it will mention it.`,
    ),
    contribution(
      "performanceSkill",
      skill * PERFORMANCE_SKILL_TALK_SHARE,
      talkJitter,
      `A night worth describing is a night somebody describes.`,
    ),
    contribution("nerves", talkJitter, 0, `The night itself, from the seed.`),
  ];

  const wordLeftTheRoom = derive(
    "wordLeftTheRoom",
    wordContributions,
    wonOver.value,
    `Bounded by who was won over. People who were not taken with it do not tell anybody.`,
  );

  return {
    facts: {
      attendance: attendance.value,
      wonOver: wonOver.value,
      wordLeftTheRoom: wordLeftTheRoom.value,
    },
    derivation: [attendance.entry, wonOver.entry, wordLeftTheRoom.entry],
    simulatorVersion: PERFORMANCE_SIMULATOR_VERSION,
    seed: input.seed,
  };
}

/** One line describing the room, used in the derivation notes. */
function promoterRoom(capacity: number): string {
  return `A room holding ${capacity}`;
}
