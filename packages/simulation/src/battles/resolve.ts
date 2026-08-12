import {
  BATTLE_JUDGE_ENGINE_VERSION,
  REQUIRED_BATTLE_PANEL,
  roundTo,
  type BattleCohortFacts,
  type BattlePerformance,
  type BattleResult,
  type BattleSide,
  type JudgeDecision,
} from "@music-rpg/shared";
import { baselineFacts } from "./perform";
import { judgeAudience } from "./judges/audience";
import { judgeStrategic } from "./judges/strategic";
import { judgeTechnical } from "./judges/technical";
import type { PsychologyValues, SkillValues } from "@music-rpg/shared";

/**
 * Convening the panel, and deriving a result from what it said.
 *
 * The one place the three judges meet, and it is deliberately thin. Everything
 * that *decides* anything happened inside a judge; this counts votes.
 *
 * **There is no aggregate score here and there must never be one.** Each judge's
 * totals are its own and are meaningless beside another's — the Technical judge's
 * 68.4 and the Audience judge's 71.2 are not on the same scale and were not
 * produced from the same facts. Summing them would smuggle in exactly the single
 * number the milestone exists to avoid, and would make a 2-1 into a rounding.
 *
 * A result is therefore a *count of verdicts*, and `decision` — "2-1", "3-0" —
 * is the shape of the panel's agreement rather than a margin.
 */

export type JudgeParticipant = {
  performance: BattlePerformance;
  skills: SkillValues;
  psychology: PsychologyValues;
  /** How the scene this is held in already knows them. M7's `sceneStanding`. */
  sceneStanding: number;
};

export type ConveneInput = {
  challenger: JudgeParticipant;
  opponent: JudgeParticipant;
  sceneSlug: string;
  /** M5's populations. Read by the Audience judge only. */
  cohorts: BattleCohortFacts[];
};

/**
 * Every required judge, in panel order, having decided independently.
 *
 * Each is handed only what its mandate needs, and the asymmetry between those
 * three argument lists is the independence:
 *
 * - Technical gets five performance facts and **no strategy**.
 * - Strategic gets both strategies, both performances and both baselines, and
 *   **no room**.
 * - Audience gets the room, the cohorts and the immediate facts, and **no
 *   intent-execution reasoning**.
 *
 * Nothing is shared between them except the performances themselves, which are
 * canonical facts established before any of them ran.
 */
export function convenePanel(input: ConveneInput): JudgeDecision[] {
  const challengerBaseline = baselineFacts(input.challenger.skills, input.challenger.psychology);
  const opponentBaseline = baselineFacts(input.opponent.skills, input.opponent.psychology);

  const decisions: Record<string, JudgeDecision> = {
    TECHNICAL: judgeTechnical({
      challenger: input.challenger.performance.facts,
      opponent: input.opponent.performance.facts,
      challengerArtistId: input.challenger.performance.artistId,
      opponentArtistId: input.opponent.performance.artistId,
    }),
    STRATEGIC: judgeStrategic({
      challenger: {
        facts: input.challenger.performance.facts,
        baseline: challengerBaseline,
        strategy: input.challenger.performance.strategy,
      },
      opponent: {
        facts: input.opponent.performance.facts,
        baseline: opponentBaseline,
        strategy: input.opponent.performance.strategy,
      },
    }),
    AUDIENCE: judgeAudience({
      challenger: {
        facts: input.challenger.performance.facts,
        strategy: input.challenger.performance.strategy,
      },
      opponent: {
        facts: input.opponent.performance.facts,
        strategy: input.opponent.performance.strategy,
      },
      sceneSlug: input.sceneSlug,
      cohorts: input.cohorts,
      challengerStanding: input.challenger.sceneStanding,
      opponentStanding: input.opponent.sceneStanding,
    }),
  };

  // Panel order is stable, so a replayed battle records its judges identically.
  return REQUIRED_BATTLE_PANEL.map((judge) => decisions[judge]!);
}

/**
 * What the panel decided.
 *
 * Counts the `REQUIRED` verdicts and nothing else. `ADVISORY` judgements may
 * exist against a battle later — a community vote, a promoter's opinion — and
 * this must keep ignoring them, so that adding one cannot retroactively change
 * what an old battle decided.
 */
export function deriveResult(input: {
  judgements: JudgeDecision[];
  challengerArtistId: string;
  opponentArtistId: string;
}): BattleResult {
  const required = input.judgements.filter((entry) => entry.panelRole === "REQUIRED");

  const votes: Record<BattleSide, number> = {
    CHALLENGER: required.filter((entry) => entry.verdict === "CHALLENGER").length,
    OPPONENT: required.filter((entry) => entry.verdict === "OPPONENT").length,
  };

  const winner: BattleSide = votes.CHALLENGER >= votes.OPPONENT ? "CHALLENGER" : "OPPONENT";
  const loser: BattleSide = winner === "CHALLENGER" ? "OPPONENT" : "CHALLENGER";

  return {
    winner,
    loser,
    winnerArtistId:
      winner === "CHALLENGER" ? input.challengerArtistId : input.opponentArtistId,
    loserArtistId: winner === "CHALLENGER" ? input.opponentArtistId : input.challengerArtistId,
    /* The shape of the agreement, not a margin. */
    decision: `${votes[winner]}-${votes[loser]}`,
    judgements: input.judgements,
    split: votes[loser] > 0,
    engineVersion: BATTLE_JUDGE_ENGINE_VERSION,
  };
}

/**
 * How decisive the panel was, 0–1.
 *
 * Derived from the *agreement* rather than from any judge's totals, because that
 * is what a battle's decisiveness actually means: a 2-1 was nearly the other
 * result, and a 3-0 was not. Consumed by the relationship fold, which needs to
 * tell a close contest from a decisive one without inventing a second opinion
 * about how close it was.
 */
export function contestMargin(result: BattleResult): number {
  const required = result.judgements.filter((entry) => entry.panelRole === "REQUIRED");
  if (required.length === 0) return 0;

  const forWinner = required.filter((entry) => entry.verdict === result.winner).length;
  const against = required.length - forWinner;

  return roundTo((forWinner - against) / required.length, 4);
}
