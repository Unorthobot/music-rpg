import {
  clamp,
  roundTo,
  type CohortTickOutcome,
  type MetricPressure,
  type ReceptionCohortState,
} from "@music-rpg/shared";
import {
  CAREER_METRIC_CEILING,
  FAME_PER_WEIGHTED_EXPOSURE,
  HEAT_PER_MOMENTUM_GAINED,
  HEAT_PER_WEIGHTED_SHARE,
  MOMENTUM_CEILING,
  MOMENTUM_CONVERSION_WEIGHT,
  MOMENTUM_DECAY_PER_DAY,
  MOMENTUM_LISTENER_WEIGHT,
  MOMENTUM_SHARE_WEIGHT,
  RESPECT_PER_WEIGHTED_ENGAGEMENT,
} from "./constants";

/**
 * From reception facts to career consequence.
 *
 * The three metrics answer three different questions, and nothing here lets one
 * stand in for another:
 *
 * - **Fame** — how widely known you are. It answers *breadth*, so it counts
 *   exposure. A record adored by a hundred people barely moves it.
 * - **Respect** — how seriously the relevant communities take you. It counts
 *   engagement weighted by fit and by whose engagement it was, so scene heads
 *   and tastemakers move it far more than casual reach ever will.
 * - **Heat** — how much attention is around you *now*. It answers movement, so
 *   it tracks momentum gained and sharing, and it is the volatile one.
 *
 * **Legacy** appears nowhere in this file. It is a long-horizon measure, and a
 * first single performing well is not a reason to grant any.
 */

export function nextMomentum(input: {
  momentumBefore: number;
  listeners: number;
  shares: number;
  fanConversions: number;
}): number {
  // Momentum is velocity, not prestige: it falls away unless something is
  // still happening.
  const carried = input.momentumBefore * MOMENTUM_DECAY_PER_DAY;
  const generated =
    input.listeners * MOMENTUM_LISTENER_WEIGHT +
    input.shares * MOMENTUM_SHARE_WEIGHT +
    input.fanConversions * MOMENTUM_CONVERSION_WEIGHT;

  return roundTo(clamp(carried + generated, 0, MOMENTUM_CEILING), 3);
}

/**
 * Accrued pressure becomes an integer metric.
 *
 * The player never sees a fraction, but a first single produces fractional
 * movement — so the fraction is kept and the visible metric is the floor of
 * what has accumulated. Every point is therefore traceable to the ticks that
 * earned it, and nothing rounds away to a permanent zero.
 */
export function accrueMetric(accrued: number, pressure: number): { accrued: number; value: number } {
  const total = Math.max(0, roundTo(accrued + Math.max(0, pressure), 5));
  return { accrued: total, value: clamp(Math.floor(total), 0, CAREER_METRIC_CEILING) };
}

export function calculateMetricPressure(input: {
  cohorts: CohortTickOutcome[];
  states: ReceptionCohortState[];
  momentumBefore: number;
  momentumAfter: number;
}): MetricPressure {
  const behaviourFor = (slug: string) =>
    input.states.find((state) => state.slug === slug)?.behaviour;

  let weightedExposure = 0;
  let weightedEngagement = 0;
  let weightedShares = 0;

  for (const outcome of input.cohorts) {
    const behaviour = behaviourFor(outcome.cohortSlug);
    if (!behaviour) continue;

    weightedExposure += outcome.exposures * behaviour.famePressure;
    // Respect is not won by being heard, but by being taken seriously — so the
    // strength of the response is part of the weight.
    weightedEngagement +=
      outcome.engagedListeners * outcome.evaluation.fit * behaviour.respectPressure;
    weightedShares += outcome.shares * behaviour.heatPressure;
  }

  const momentumGained = Math.max(0, input.momentumAfter - input.momentumBefore);

  return {
    fame: roundTo(weightedExposure * FAME_PER_WEIGHTED_EXPOSURE, 5),
    respect: roundTo(weightedEngagement * RESPECT_PER_WEIGHTED_ENGAGEMENT, 5),
    heat: roundTo(
      momentumGained * HEAT_PER_MOMENTUM_GAINED + weightedShares * HEAT_PER_WEIGHTED_SHARE,
      5,
    ),
  };
}
