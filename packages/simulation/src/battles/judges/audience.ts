import {
  BATTLE_JUDGE_ENGINE_VERSION,
  BATTLE_JUDGE_QUESTIONS,
  clamp,
  roundTo,
  type BattlePerformanceFacts,
  type BattleCohortFacts,
  type BattleStrategy,
  type JudgeContribution,
  type JudgeDecision,
} from "@music-rpg/shared";
import {
  AUDIENCE_QUALITY_MAPPING,
  AUDIENCE_WEIGHTS,
  LEGIBILITY_IMMEDIACY_SCALE,
  ROOM_POPULATION_DAMPING,
  STRATEGY_LEGIBILITY,
} from "../constants";

/**
 * The Audience judge.
 *
 * > **Did this work, for *this* crowd, in *this* room?**
 *
 * The judge most likely to have been ruined by convenience, and the reason it is
 * not is that **it has no population model of its own**. It reads M5's
 * `audience_cohorts` — the same three populations, with the same recorded
 * preferences, tolerances and scene concentrations that every release in the game
 * has been meeting since reception existed — and asks them what they made of a
 * battle round. Building a second crowd for battles would have made the world
 * disagree with itself about who lives in Braamfontein.
 *
 * ## How a battle round becomes something a cohort can have an opinion about
 *
 * `audience_cohorts.preferences.qualities` already weighs three axes — focus,
 * distinctiveness and immediacy — and the cohorts differ enormously on them:
 * scene heads weight immediacy at 0.13 and casual listeners at 0.62. So the seven
 * performance facts are translated onto those three axes (`AUDIENCE_QUALITY_MAPPING`)
 * and then each cohort applies **its own** recorded weights.
 *
 * That single mechanism is what makes this judge genuinely context-sensitive
 * rather than a third quality score: the *same* performance facts, judged in
 * Alexandra and in Braamfontein, get different answers, because the rooms contain
 * different proportions of people who want different things. Nothing about the
 * performance changed. The room did.
 *
 * ## Who is in the room
 *
 * The cohort mix is `audience_cohorts.scene_affinity` — where each population is
 * concentrated — scaled by cohort size, so a room in Soweto is mostly casual
 * listeners and a room in Maboneng is disproportionately tastemakers. All of it
 * is world content that was seeded long before battles existed.
 */

export type AudienceJudgeInput = {
  challenger: { facts: BattlePerformanceFacts; strategy: BattleStrategy };
  opponent: { facts: BattlePerformanceFacts; strategy: BattleStrategy };
  /** Where it is being held. Decides who is actually in the room. */
  sceneSlug: string;
  /** M5's populations, read. Never re-derived and never replaced. */
  cohorts: BattleCohortFacts[];
  /** How the scene knows each artist. M7's `sceneStanding`, reused as-is. */
  challengerStanding: number;
  opponentStanding: number;
};

/** One cohort's share of this particular room. */
type RoomSeat = {
  slug: string;
  name: string;
  /** Share of the room, 0–1. Sums to 1 across the cohorts present. */
  share: number;
  qualities: { focus: number; distinctiveness: number; immediacy: number };
};

/**
 * Who is actually here.
 *
 * Concentration, damped population, and attention — in that order of importance.
 *
 * The first version of this weighted cohorts by `sceneAffinity × size` and
 * produced the same room in every scene: casual listeners came out at 88-98%
 * everywhere, because 94,000 of them against 420 tastemakers swamps any
 * difference in concentration. That is the right answer about a *city* and the
 * wrong one about a *room*. Ninety people in a yard in Alexandra are not a
 * random sample of Johannesburg; they are the part of that scene that turns out
 * for a competitive event.
 *
 * So population is damped by `ROOM_POPULATION_DAMPING` and multiplied by each
 * cohort's own `attention`. Every input is still M5's, and nothing here decides
 * anything about who these people are — only how many of them came.
 */
export function roomComposition(
  sceneSlug: string,
  cohorts: BattleCohortFacts[],
): RoomSeat[] {
  const raw = cohorts.map((cohort) => ({
    slug: cohort.slug,
    name: cohort.name,
    weight:
      (cohort.sceneAffinity[sceneSlug] ?? 0) *
      Math.pow(Math.max(0, cohort.size), ROOM_POPULATION_DAMPING) *
      cohort.attention,
    // M5's recorded weights, taken as they are.
    qualities: cohort.qualities,
  }));

  const total = raw.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    // A scene no cohort is concentrated in is an empty room, not a crash.
    return raw.map((entry) => ({ ...entry, share: 0 }));
  }

  return raw.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    share: roundTo(entry.weight / total, 6),
    qualities: entry.qualities,
  }));
}

/** A battle round, on the three axes M5's cohorts already have opinions about. */
function qualityAxes(facts: BattlePerformanceFacts): {
  focus: number;
  distinctiveness: number;
  immediacy: number;
} {
  const axis = (mapping: Record<string, number>) =>
    Object.entries(mapping).reduce(
      (total, [fact, share]) =>
        total + (facts[fact as keyof BattlePerformanceFacts] ?? 0) * share,
      0,
    );

  return {
    focus: axis(AUDIENCE_QUALITY_MAPPING.focus),
    distinctiveness: axis(AUDIENCE_QUALITY_MAPPING.distinctiveness),
    immediacy: axis(AUDIENCE_QUALITY_MAPPING.immediacy),
  };
}

/**
 * What the room made of it, weighting every cohort by its own recorded taste and
 * by how much of the room it is.
 */
function cohortTaste(facts: BattlePerformanceFacts, room: RoomSeat[]): number {
  const axes = qualityAxes(facts);

  return clamp(
    room.reduce((total, seat) => {
      const { focus, distinctiveness, immediacy } = seat.qualities;
      const weightSum = focus + distinctiveness + immediacy;
      if (weightSum <= 0) return total;

      // The cohort's own weights, normalised. Never this engine's opinion.
      const value =
        (axes.focus * focus + axes.distinctiveness * distinctiveness + axes.immediacy * immediacy) /
        weightSum;

      return total + value * seat.share;
    }, 0),
    0,
    100,
  );
}

/**
 * Whether the room could tell what they were doing.
 *
 * Not a quality judgement. `WIN_THE_CROWD` is legible to anybody present;
 * `OUTWRITE` frequently is not, which is the brief's own point that density is
 * not the same as impact. How much that matters is the room's business — scene
 * heads reward being made to work for it, casual listeners do not — so the
 * penalty for being hard to read is scaled by how much immediacy the people
 * present actually want.
 */
function legibility(strategy: BattleStrategy, room: RoomSeat[]): number {
  const base = STRATEGY_LEGIBILITY[strategy];

  const immediacyAppetite = room.reduce((total, seat) => {
    const weightSum = seat.qualities.focus + seat.qualities.distinctiveness + seat.qualities.immediacy;
    return weightSum > 0 ? total + (seat.qualities.immediacy / weightSum) * seat.share : total;
  }, 0);

  /*
   * A room that wants immediacy punishes illegibility and rewards clarity; a room
   * that does not barely notices either way, so the term pulls toward neutral.
   */
  const pull = clamp(immediacyAppetite * LEGIBILITY_IMMEDIACY_SCALE, 0, 1);
  return clamp(50 + (base - 50) * pull, 0, 100);
}

export function judgeAudience(input: AudienceJudgeInput): JudgeDecision {
  const room = roomComposition(input.sceneSlug, input.cohorts);

  const values = {
    cohortTaste: [
      cohortTaste(input.challenger.facts, room),
      cohortTaste(input.opponent.facts, room),
    ] as const,
    legibility: [
      legibility(input.challenger.strategy, room),
      legibility(input.opponent.strategy, room),
    ] as const,
    roomHistory: [input.challenger.facts.crowdWork, input.opponent.facts.crowdWork] as const,
    sceneStanding: [input.challengerStanding, input.opponentStanding] as const,
  };

  const roomLine = room
    .filter((seat) => seat.share > 0)
    .map((seat) => `${seat.name} ${Math.round(seat.share * 100)}%`)
    .join(", ");

  const notes: Record<keyof typeof values, string> = {
    cohortTaste: `What the people actually in ${input.sceneSlug} listen for — ${roomLine || "an empty room"} — applying their own recorded weights.`,
    legibility: "Whether this room could tell what they were doing.",
    roomHistory: "Whether the room was taken with them.",
    sceneStanding: `How well ${input.sceneSlug} already knew each of them.`,
  };

  const contributions: JudgeContribution[] = (
    Object.keys(values) as (keyof typeof values)[]
  ).map((term) => {
    const weight = AUDIENCE_WEIGHTS[term];
    const [challengerInput, opponentInput] = values[term];

    return {
      term,
      challengerInput: roundTo(challengerInput, 4),
      opponentInput: roundTo(opponentInput, 4),
      weight,
      challengerContribution: roundTo(challengerInput * weight, 4),
      opponentContribution: roundTo(opponentInput * weight, 4),
      note: notes[term],
    };
  });

  const challengerTotal = roundTo(
    contributions.reduce((sum, entry) => sum + entry.challengerContribution, 0),
    4,
  );
  const opponentTotal = roundTo(
    contributions.reduce((sum, entry) => sum + entry.opponentContribution, 0),
    4,
  );

  return {
    judge: "AUDIENCE",
    panelRole: "REQUIRED",
    question: BATTLE_JUDGE_QUESTIONS.AUDIENCE,
    verdict: challengerTotal >= opponentTotal ? "CHALLENGER" : "OPPONENT",
    challengerTotal,
    opponentTotal,
    margin: roundTo(Math.abs(challengerTotal - opponentTotal), 4),
    contributions,
    /*
     * A room does not mark structure for its own sake and has never heard of
     * rebuttal as a category. Both are the Technical judge's, and saying so is
     * how "why did the audience disagree with the technical judge" gets an
     * answer rather than an assertion.
     */
    irrelevant: ["structureForItsOwnSake", "rebuttalAsCraft", "intentMatch", "commitment"],
    engineVersion: BATTLE_JUDGE_ENGINE_VERSION,
  };
}
