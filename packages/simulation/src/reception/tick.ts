import {
  RECEPTION_SIMULATOR_VERSION,
  type CohortTickOutcome,
  type ReceptionTickInput,
  type ReceptionTickResult,
  type ReceptionTotals,
} from "@music-rpg/shared";
import { calculateConversion } from "./conversion";
import { calculateEngagement } from "./engagement";
import { evaluateCohort } from "./evaluate";
import { calculateExposure } from "./exposure";
import { calculateMetricPressure, nextMomentum } from "./metrics";
import { calculateWordOfMouth, routeWordOfMouth } from "./word-of-mouth";

/**
 * One day of reception.
 *
 * Pure: state in, facts out, nothing persisted and nothing read from a
 * database. The command that calls this owns the transaction; this owns the
 * arithmetic, which is what keeps the model testable without a world.
 *
 * The order is the causal chain, and it only runs forwards:
 *
 *     evaluate → expose → listen → engage → convert → pass on → momentum → pressure
 *
 * Each cohort answers independently, because they are different people. The
 * only thing that crosses between them is word of mouth, and it crosses on the
 * *next* tick rather than this one — you cannot be told about a record before
 * the person telling you has heard it.
 */
export function calculateReceptionTick(input: ReceptionTickInput): ReceptionTickResult {
  const cohorts: CohortTickOutcome[] = input.cohorts.map((cohort) => {
    const evaluation = evaluateCohort({
      cohort,
      track: input.track,
      artistSound: input.artistSound,
      modifiers: input.audienceModifiers,
      dayIndex: input.dayIndex,
    });

    const { addressablePopulation, exposures, wordOfMouthExposures } = calculateExposure({
      cohort,
      evaluation,
      dayIndex: input.dayIndex,
      seed: input.seed,
      format: input.format,
      careerAct: input.careerAct,
      momentum: input.momentum,
    });

    const { listeners, engagedListeners, repeatListeners } = calculateEngagement({
      cohort,
      evaluation,
      exposures,
      dayIndex: input.dayIndex,
      seed: input.seed,
    });

    const fanConversions = calculateConversion({
      cohort,
      evaluation,
      engagedListeners,
      repeatListeners,
      dayIndex: input.dayIndex,
      seed: input.seed,
    });

    const { shares, wordOfMouth } = calculateWordOfMouth({
      cohort,
      evaluation,
      engagedListeners,
      dayIndex: input.dayIndex,
      seed: input.seed,
    });

    return {
      cohortSlug: cohort.slug,
      evaluation,
      addressablePopulation,
      exposures,
      wordOfMouthExposures,
      listeners,
      engagedListeners,
      repeatListeners,
      fanConversions,
      shares,
      wordOfMouth,
    };
  });

  // Sharing generated here becomes exposure somewhere else tomorrow.
  const routed = routeWordOfMouth(
    Object.fromEntries(cohorts.map((outcome) => [outcome.cohortSlug, outcome.wordOfMouth])),
    cohorts.map((outcome) => outcome.cohortSlug),
  );

  const withRouting = cohorts.map((outcome) => ({
    ...outcome,
    wordOfMouth: routed[outcome.cohortSlug] ?? 0,
  }));

  const totals = withRouting.reduce<ReceptionTotals>(
    (sum, outcome) => ({
      exposures: sum.exposures + outcome.exposures,
      listeners: sum.listeners + outcome.listeners,
      engagedListeners: sum.engagedListeners + outcome.engagedListeners,
      repeatListeners: sum.repeatListeners + outcome.repeatListeners,
      fanConversions: sum.fanConversions + outcome.fanConversions,
      shares: sum.shares + outcome.shares,
      wordOfMouth: sum.wordOfMouth + outcome.wordOfMouth,
    }),
    {
      exposures: 0,
      listeners: 0,
      engagedListeners: 0,
      repeatListeners: 0,
      fanConversions: 0,
      shares: 0,
      wordOfMouth: 0,
    },
  );

  const momentumAfter = nextMomentum({
    momentumBefore: input.momentum,
    listeners: totals.listeners,
    shares: totals.shares,
    fanConversions: totals.fanConversions,
  });

  const pressure = calculateMetricPressure({
    cohorts: withRouting,
    states: input.cohorts,
    momentumBefore: input.momentum,
    momentumAfter,
  });

  return {
    simulatorVersion: RECEPTION_SIMULATOR_VERSION,
    dayIndex: input.dayIndex,
    seed: input.seed,
    audienceModifiers: input.audienceModifiers,
    cohorts: withRouting,
    totals,
    momentumBefore: input.momentum,
    momentumAfter,
    pressure,
  };
}
