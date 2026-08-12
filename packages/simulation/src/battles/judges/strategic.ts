import {
  BATTLE_JUDGE_ENGINE_VERSION,
  BATTLE_JUDGE_QUESTIONS,
  clamp,
  roundTo,
  type BattlePerformanceFact,
  type BattlePerformanceFacts,
  type BattleStrategy,
  type JudgeContribution,
  type JudgeDecision,
} from "@music-rpg/shared";
import { COMMITMENT_FULL_CONTRAST, STRATEGIC_WEIGHTS, STRATEGY_EMPHASIS } from "../constants";

/**
 * The Strategic judge.
 *
 * > **Did they do what they set out to do?**
 *
 * The only judge that reads the declared angle, and the only one that reads
 * *both* performances relationally. It is not asking whether the round was good.
 * Executing a weak plan well is a real thing and this judge rewards it; so is
 * announcing a good plan and then not carrying it out, and this judge punishes
 * that however strong the round was in the abstract.
 *
 * That is the whole reason a technically superior performance can lose here, and
 * why the panel is capable of a genuine 2-1 rather than three readings of the
 * same opinion.
 *
 * ## The four things it weighs
 *
 * - **intentMatch** — did the performance actually lean the way they said it
 *   would? Measured against *this artist's own baseline*, so a naturally
 *   crowd-pleasing artist gets no credit for declaring `WIN_THE_CROWD` and then
 *   doing what they always do.
 * - **commitment** — did they hold the angle, or hedge? A round that moved
 *   nothing away from its baseline committed to nothing.
 * - **opponentAnswered** — did the angle deal with what the other one actually
 *   brought? Choosing to outwrite somebody whose whole round was the room is a
 *   plan that answered nothing, and this is where that costs.
 * - **costOfChoice** — what the angle gave up, and whether the trade was worth
 *   making. Giving up more than the angle gained is a badly chosen plan.
 */

export type StrategicJudgeInput = {
  challenger: {
    facts: BattlePerformanceFacts;
    baseline: BattlePerformanceFacts;
    strategy: BattleStrategy;
  };
  opponent: {
    facts: BattlePerformanceFacts;
    baseline: BattlePerformanceFacts;
    strategy: BattleStrategy;
  };
};

type Sided = StrategicJudgeInput["challenger"];

/** The facts an angle is *supposed* to raise, and the ones it trades away. */
function signature(strategy: BattleStrategy): {
  raises: BattlePerformanceFact[];
  trades: BattlePerformanceFact[];
} {
  const emphasis = STRATEGY_EMPHASIS[strategy];
  const raises: BattlePerformanceFact[] = [];
  const trades: BattlePerformanceFact[] = [];

  for (const [fact, shift] of Object.entries(emphasis)) {
    if ((shift ?? 0) > 0) raises.push(fact as BattlePerformanceFact);
    else if ((shift ?? 0) < 0) trades.push(fact as BattlePerformanceFact);
  }

  return { raises, trades };
}

/**
 * How far the round actually leaned, against what this artist would have done
 * anyway.
 *
 * The baseline comparison is what stops this from being a second quality score.
 * A high-`crowdWork` artist declaring `WIN_THE_CROWD` has not executed anything
 * unless the round went *further* than their ordinary self.
 */
function intentMatch(side: Sided): number {
  const { raises } = signature(side.strategy);
  if (raises.length === 0) return 50;

  const lean =
    raises.reduce(
      (total, fact) => total + (side.facts[fact] - side.baseline[fact]),
      0,
    ) / raises.length;

  // Zero lean is a plan that did not happen; full contrast is one carried out.
  return clamp(50 + (lean / COMMITMENT_FULL_CONTRAST) * 50, 0, 100);
}

/** Whether they held the angle or hedged it. Contrast between raised and traded. */
function commitment(side: Sided): number {
  const { raises, trades } = signature(side.strategy);
  if (raises.length === 0 || trades.length === 0) return 50;

  const raised =
    raises.reduce((total, fact) => total + (side.facts[fact] - side.baseline[fact]), 0) /
    raises.length;
  const traded =
    trades.reduce((total, fact) => total + (side.baseline[fact] - side.facts[fact]), 0) /
    trades.length;

  /*
   * Both halves must be present. Somebody whose emphasised facts went up while
   * nothing went down did not commit to an angle, they simply had a good night —
   * which is the Technical judge's business, not this one's.
   */
  return clamp(((raised + traded) / (2 * COMMITMENT_FULL_CONTRAST)) * 100, 0, 100);
}

/**
 * Did the plan deal with what the other one actually brought?
 *
 * The relational term. Looks at where the opponent was strongest relative to
 * their own baseline — what they actually came to do — and asks whether this
 * side's angle had an answer for it.
 */
function opponentAnswered(side: Sided, other: Sided): number {
  const { raises } = signature(other.strategy);
  const theirPush =
    raises.length > 0
      ? raises.reduce((total, fact) => total + (other.facts[fact] - other.baseline[fact]), 0) /
        raises.length
      : 0;

  /*
   * `rebuttal` is the direct answer to anything, whatever they did — it is
   * literally the fact that measures having responded. Beyond that, an angle
   * answers an opponent when it contests the same ground they chose.
   */
  const contested = raises.filter((fact) => (STRATEGY_EMPHASIS[side.strategy][fact] ?? 0) > 0);
  const overlap = raises.length > 0 ? contested.length / raises.length : 0;

  const answer = side.facts.rebuttal * 0.6 + overlap * 100 * 0.4;

  /*
   * Only as demanding as the opponent was. Somebody who barely leaned into their
   * own angle did not set a problem that needed answering, and this judge does
   * not invent one.
   */
  const demand = clamp(theirPush / COMMITMENT_FULL_CONTRAST, 0, 1);
  return clamp(answer * demand + 50 * (1 - demand), 0, 100);
}

/** What the angle gave up, weighed against what it bought. */
function costOfChoice(side: Sided): number {
  const { raises, trades } = signature(side.strategy);
  if (trades.length === 0) return 60;

  const gained = raises.reduce(
    (total, fact) => total + Math.max(0, side.facts[fact] - side.baseline[fact]),
    0,
  );
  const given = trades.reduce(
    (total, fact) => total + Math.max(0, side.baseline[fact] - side.facts[fact]),
    0,
  );

  if (gained + given === 0) return 50;
  // A trade that bought more than it cost is a plan worth having chosen.
  return clamp((gained / (gained + given)) * 100, 0, 100);
}

export function judgeStrategic(input: StrategicJudgeInput): JudgeDecision {
  const { challenger, opponent } = input;

  const values = {
    intentMatch: [intentMatch(challenger), intentMatch(opponent)] as const,
    commitment: [commitment(challenger), commitment(opponent)] as const,
    opponentAnswered: [
      opponentAnswered(challenger, opponent),
      opponentAnswered(opponent, challenger),
    ] as const,
    costOfChoice: [costOfChoice(challenger), costOfChoice(opponent)] as const,
  };

  const notes: Record<keyof typeof values, string> = {
    intentMatch: `Did the round lean the way they said it would — ${challenger.strategy} against ${opponent.strategy}, each measured against their own ordinary self.`,
    commitment: "Whether the angle was held or hedged. Nothing given up is nothing chosen.",
    opponentAnswered: "Whether the plan dealt with what the other one actually came to do.",
    costOfChoice: "What the angle traded away, against what it bought.",
  };

  const contributions: JudgeContribution[] = (
    Object.keys(values) as (keyof typeof values)[]
  ).map((term) => {
    const weight = STRATEGIC_WEIGHTS[term];
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
    judge: "STRATEGIC",
    panelRole: "REQUIRED",
    question: BATTLE_JUDGE_QUESTIONS.STRATEGIC,
    verdict: challengerTotal >= opponentTotal ? "CHALLENGER" : "OPPONENT",
    challengerTotal,
    opponentTotal,
    margin: roundTo(Math.abs(challengerTotal - opponentTotal), 4),
    contributions,
    /*
     * This judge has no opinion about whether the round was any good, and saying
     * so is the point: a badly executed brilliant round loses here, and that is
     * not an error.
     */
    irrelevant: ["absoluteCraft", "cohortTaste", "sceneStanding", "capacity"],
    engineVersion: BATTLE_JUDGE_ENGINE_VERSION,
  };
}
