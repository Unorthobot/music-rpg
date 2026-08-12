import {
  BATTLE_JUDGE_ENGINE_VERSION,
  BATTLE_JUDGE_QUESTIONS,
  TECHNICAL_JUDGE_TERMS,
  roundTo,
  type BattlePerformanceFacts,
  type JudgeContribution,
  type JudgeDecision,
} from "@music-rpg/shared";
import { TECHNICAL_WEIGHTS } from "../constants";

/**
 * The Technical judge.
 *
 * > **Was this well made?**
 *
 * Reads writing, flow, structure, originality and rebuttal. It is not given
 * `delivery`, it is not given `crowdWork`, and — the important one — **it is not
 * given the declared strategy**. Its input type physically cannot carry one.
 *
 * That last exclusion is deliberate and is what makes this judge independent
 * rather than a scorekeeper. The brief requires that `OUTWRITE` be rewarded
 * technically and that `WIN_THE_CROWD` be marked down for trading structure for
 * a reaction, and both of those happen here without the judge knowing anything
 * about angles: an `OUTWRITE` round genuinely *contains* denser writing and a
 * `WIN_THE_CROWD` round genuinely *contains* less structure, because strategy
 * changed the performance before anybody judged it. A judge that changed its
 * mandate depending on what the artist announced would be marking its own
 * homework.
 *
 * Its weights are therefore fixed, and its answer to "why did you prefer that
 * one" is always the same shape: because these named parts of the craft were
 * stronger, by this much.
 */

export type TechnicalJudgeInput = {
  challenger: BattlePerformanceFacts;
  opponent: BattlePerformanceFacts;
  challengerArtistId: string;
  opponentArtistId: string;
};

const NOTES: Record<(typeof TECHNICAL_JUDGE_TERMS)[number], string> = {
  writing: "What was actually said, and how it was put together.",
  flow: "Cadence and control. Whether it sat where it was meant to sit.",
  structure: "How the round was built — setup, escalation, where it landed.",
  originality: "Whether anybody has heard this before.",
  rebuttal: "How much of what the other one brought was actually answered.",
};

export function judgeTechnical(input: TechnicalJudgeInput): JudgeDecision {
  const contributions: JudgeContribution[] = TECHNICAL_JUDGE_TERMS.map((term) => {
    const weight = TECHNICAL_WEIGHTS[term];
    const challengerInput = input.challenger[term];
    const opponentInput = input.opponent[term];

    return {
      term,
      challengerInput: roundTo(challengerInput, 4),
      opponentInput: roundTo(opponentInput, 4),
      weight,
      challengerContribution: roundTo(challengerInput * weight, 4),
      opponentContribution: roundTo(opponentInput * weight, 4),
      note: NOTES[term],
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
    judge: "TECHNICAL",
    panelRole: "REQUIRED",
    question: BATTLE_JUDGE_QUESTIONS.TECHNICAL,
    /*
     * Ties break to the challenger, and that is a stated rule rather than an
     * accident of comparison: somebody who called it out and was not beaten was
     * not beaten. It is reachable only when two performances are identical to
     * four decimal places, which the seeded composure shift makes vanishingly
     * unlikely between two different artists.
     */
    verdict: challengerTotal >= opponentTotal ? "CHALLENGER" : "OPPONENT",
    challengerTotal,
    opponentTotal,
    margin: roundTo(Math.abs(challengerTotal - opponentTotal), 4),
    contributions,
    /*
     * Named, because "that was irrelevant to me" is a real answer to "why did the
     * audience disagree with you" — and the honest one here. This judge does not
     * care how the room felt.
     */
    irrelevant: ["delivery", "crowdWork", "strategy", "sceneStanding", "cohortTaste"],
    engineVersion: BATTLE_JUDGE_ENGINE_VERSION,
  };
}
