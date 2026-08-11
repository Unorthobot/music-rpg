import { clamp, type CohortEvaluation, type ReceptionCohortState } from "@music-rpg/shared";
import { seededJitter } from "../random";
import {
  AFFINITY_ENGAGEMENT_WEIGHT,
  ENGAGE_BASE,
  ENGAGE_CEILING,
  ENGAGE_FIT_WEIGHT,
  LISTEN_BASE,
  LISTEN_CEILING,
  LISTEN_FIT_WEIGHT,
  REPEAT_BASE,
  REPEAT_FIT_WEIGHT,
  RESPONSE_JITTER,
} from "./constants";

/**
 * Listening and engagement.
 *
 * Two separate questions, in order:
 *
 * 1. Of the people who had the chance, who actually played it? Credibility
 *    matters here — being vouched for is what turns an opportunity into a play.
 * 2. Of the people who played it, who did it land on? This is where fit does
 *    most of its work, and where a record that reached the wrong cohort stops.
 *
 * Neither of these makes anybody a fan. That is a third question.
 */

export type EngagementInput = {
  cohort: ReceptionCohortState;
  evaluation: CohortEvaluation;
  exposures: number;
  dayIndex: number;
  seed: string;
};

export type EngagementOutcome = {
  listeners: number;
  engagedListeners: number;
  repeatListeners: number;
};

export function calculateEngagement(input: EngagementInput): EngagementOutcome {
  const { cohort, evaluation, exposures, dayIndex, seed } = input;
  const { behaviour } = cohort;

  const listenRate = clamp(
    behaviour.attention * (LISTEN_BASE + evaluation.fit * LISTEN_FIT_WEIGHT) * evaluation.credibilityBoost,
    0,
    LISTEN_CEILING,
  );

  const listeners = Math.min(
    exposures,
    Math.max(
      0,
      Math.round(
        exposures * listenRate * seededJitter(RESPONSE_JITTER, seed, cohort.slug, dayIndex, "listen"),
      ),
    ),
  );

  const engageRate = clamp(
    behaviour.engagementBias *
      (ENGAGE_BASE + evaluation.fit * ENGAGE_FIT_WEIGHT) *
      (1 + evaluation.affinity * AFFINITY_ENGAGEMENT_WEIGHT),
    0,
    ENGAGE_CEILING,
  );

  const engagedListeners = Math.min(
    listeners,
    Math.max(
      0,
      Math.round(
        listeners * engageRate * seededJitter(RESPONSE_JITTER, seed, cohort.slug, dayIndex, "engage"),
      ),
    ),
  );

  /*
   * Coming back.
   *
   * Counted as unique people who returned at least once, not as return plays —
   * which is what keeps "repeat listeners never exceed listeners" true for the
   * whole life of a record rather than only for its first few days. The pool is
   * everyone here who has already heard it and not yet come back, so this can
   * only happen from the second day onward.
   */
  const returningPool = Math.max(0, cohort.listeners - cohort.repeatListeners);
  const repeatListeners = Math.min(
    returningPool,
    Math.max(
      0,
      Math.round(
        returningPool *
          behaviour.repeatTendency *
          (REPEAT_BASE + evaluation.fit * REPEAT_FIT_WEIGHT) *
          seededJitter(RESPONSE_JITTER, seed, cohort.slug, dayIndex, "repeat"),
      ),
    ),
  );

  return { listeners, engagedListeners, repeatListeners };
}
