import type { CohortEvaluation, ReceptionCohortState } from "@music-rpg/shared";
import { seededJitter } from "../random";
import {
  AFFINITY_CONVERSION_WEIGHT,
  CONVERSION_FIT_EXPONENT,
  ENGAGED_CONVERSION_BASE,
  REPEAT_CONVERSION_WEIGHT,
  RESPONSE_JITTER,
} from "./constants";

/**
 * Fan conversion.
 *
 * A fan is not a listener who happened to be counted. It is persistent
 * affinity toward the artist — it outlives the record that created it, and it
 * is the thing that makes the next release land differently.
 *
 * So conversion is rare by construction: only engaged listeners are eligible,
 * fit is raised to a power above one so that a merely tolerable record
 * converts almost nobody, and each cohort's resistance divides the result.
 * `fans += listeners` would destroy the only distinction this system has.
 */

export type ConversionInput = {
  cohort: ReceptionCohortState;
  evaluation: CohortEvaluation;
  /** Today's arrivals — only people it landed on today are eligible. */
  newEngagedListeners: number;
  newRepeatListeners: number;
  dayIndex: number;
  seed: string;
};

export function calculateConversion(input: ConversionInput): number {
  const { cohort, evaluation, newEngagedListeners, newRepeatListeners, dayIndex, seed } = input;

  if (newEngagedListeners === 0) return 0;

  // Somebody who came back is worth more here than somebody who engaged once.
  const eligible =
    newEngagedListeners * ENGAGED_CONVERSION_BASE +
    newRepeatListeners * REPEAT_CONVERSION_WEIGHT;

  const strength =
    evaluation.fit ** CONVERSION_FIT_EXPONENT *
    evaluation.credibilityBoost *
    (1 + evaluation.affinity * AFFINITY_CONVERSION_WEIGHT);

  const converted = Math.round(
    (eligible * strength) / cohort.behaviour.conversionResistance *
      seededJitter(RESPONSE_JITTER, seed, cohort.slug, dayIndex, "convert"),
  );

  // Nobody becomes a fan without engaging first.
  return Math.min(newEngagedListeners, Math.max(0, converted));
}
