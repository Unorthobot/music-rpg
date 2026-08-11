import type {
  CareerAct,
  CohortEvaluation,
  ReceptionCohortState,
  ReleaseFormat,
} from "@music-rpg/shared";
import { seededJitter } from "../random";
import {
  ACT_REACH,
  DISCOVERY_DECAY_PER_DAY,
  EXPOSURE_JITTER,
  FAN_REACH_WEIGHT,
  FIT_DISCOVERY_WEIGHT,
  FORMAT_REACH,
  MOMENTUM_REACH_WEIGHT,
} from "./constants";

/**
 * Exposure — an opportunity to encounter the record.
 *
 * Not listening. Someone can be exposed to a record and never press play, and
 * conflating the two would make every downstream number meaningless.
 *
 * Exposure here is *unique reach*: each person is exposed to a given release
 * once, which is what makes "a cohort's population cannot be exceeded" an
 * enforceable rule. Somebody coming back a second time is repeat listening,
 * counted separately.
 */

export type ExposureInput = {
  cohort: ReceptionCohortState;
  evaluation: CohortEvaluation;
  dayIndex: number;
  seed: string;
  format: ReleaseFormat;
  careerAct: CareerAct;
  /** Release-level velocity carried in from the previous tick. */
  momentum: number;
};

export type ExposureOutcome = {
  /** People here who have not yet encountered this record. */
  addressablePopulation: number;
  exposures: number;
  /** The part of `exposures` that arrived because somebody passed it on. */
  wordOfMouthExposures: number;
};

export function calculateExposure(input: ExposureInput): ExposureOutcome {
  const { cohort, evaluation, dayIndex, seed, momentum } = input;

  const addressablePopulation = Math.max(0, cohort.size - cohort.exposures);
  if (addressablePopulation === 0) {
    return { addressablePopulation: 0, exposures: 0, wordOfMouthExposures: 0 };
  }

  // Being findable at all: how much of an event this is, and how known the
  // artist is. Falls away sharply after release day.
  const discovery =
    addressablePopulation *
    cohort.behaviour.baseDiscoveryRate *
    FORMAT_REACH[input.format] *
    ACT_REACH[input.careerAct] *
    DISCOVERY_DECAY_PER_DAY ** Math.max(0, dayIndex - 1);

  // The audience you already have does part of the work for you.
  const fanCarry = cohort.fans * FAN_REACH_WEIGHT;

  // Attention around the record pulls in people who were not looking for it.
  const momentumCarry = addressablePopulation * (momentum / 100) * MOMENTUM_REACH_WEIGHT;

  // People predisposed to like it find it a little more readily.
  const affinityForDiscovery = 1 + (evaluation.fit - 0.5) * FIT_DISCOVERY_WEIGHT;

  const organic =
    (discovery + fanCarry + momentumCarry) *
    evaluation.reachBoost *
    evaluation.anticipationBoost *
    affinityForDiscovery *
    seededJitter(EXPOSURE_JITTER, seed, cohort.slug, dayIndex, "exposure");

  // Word of mouth is exposure that was earned rather than found, so it is not
  // subject to the modifiers or the decay — somebody actually passed it on.
  const carried = Math.max(0, Math.round(cohort.incomingWordOfMouth));
  const exposures = Math.min(
    addressablePopulation,
    Math.max(0, Math.round(organic)) + carried,
  );

  return {
    addressablePopulation,
    exposures,
    wordOfMouthExposures: Math.min(carried, exposures),
  };
}
