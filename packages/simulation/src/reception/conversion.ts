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
  engagedListeners: number;
  repeatListeners: number;
  dayIndex: number;
  seed: string;
};

export function calculateConversion(input: ConversionInput): number {
  const { cohort, evaluation, engagedListeners, repeatListeners, dayIndex, seed } = input;

  if (engagedListeners === 0) return 0;

  // Somebody who came back is worth more here than somebody who engaged once.
  const eligible =
    engagedListeners * ENGAGED_CONVERSION_BASE + repeatListeners * REPEAT_CONVERSION_WEIGHT;

  const strength =
    evaluation.fit ** CONVERSION_FIT_EXPONENT *
    evaluation.credibilityBoost *
    (1 + evaluation.affinity * AFFINITY_CONVERSION_WEIGHT);

  const converted = Math.round(
    (eligible * strength) / cohort.behaviour.conversionResistance *
      seededJitter(RESPONSE_JITTER, seed, cohort.slug, dayIndex, "convert"),
  );

  // Nobody becomes a fan without engaging first.
  return Math.min(engagedListeners, Math.max(0, converted));
}
