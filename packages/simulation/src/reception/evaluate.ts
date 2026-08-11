import {
  SOUND_DIMENSIONS,
  clamp,
  roundTo,
  type AudienceModifiers,
  type CohortEvaluation,
  type ReceptionCohortState,
  type SoundProfileValues,
  type TrackCharacteristics,
} from "@music-rpg/shared";
import {
  ANTICIPATION_BOOST_SCALE,
  ANTICIPATION_DECAY_PER_DAY,
  CREDIBILITY_BOOST_SCALE,
  FIT_WEIGHTS,
  REACH_BOOST_SCALE,
  SOUND_FIT_RANGE,
} from "./constants";

/**
 * Cohort evaluation — the step everything else reads from.
 *
 * There is deliberately no universal quality score here. Each cohort judges the
 * same record against what it personally listens for, so a sparse experimental
 * record can be a strong fit for scene heads and a weak one for casual
 * listeners at the same moment. That divergence is the point; a single number
 * could not express it.
 */

/**
 * How close a sound sits to the region a cohort leans toward.
 *
 * Axes the cohort has no opinion about are skipped rather than counted as
 * agreement — indifference is not fit.
 */
function regionFit(
  sound: SoundProfileValues,
  region: Partial<SoundProfileValues>,
  tolerance: number,
): number {
  const axes = SOUND_DIMENSIONS.filter((axis) => region[axis] !== undefined);
  if (axes.length === 0) return 0.5;

  const squared = axes.reduce((total, axis) => {
    const delta = (sound[axis] ?? 0) - (region[axis] ?? 0);
    return total + delta * delta;
  }, 0);

  const distance = Math.sqrt(squared / axes.length);
  return clamp(1 - distance / (tolerance * SOUND_FIT_RANGE), 0, 1);
}

/** The work itself, weighed the way this particular cohort weighs it. */
function qualityFit(track: TrackCharacteristics, weights: { focus: number; distinctiveness: number; immediacy: number }): number {
  const score =
    (track.focus * weights.focus +
      track.distinctiveness * weights.distinctiveness +
      track.immediacy * weights.immediacy) /
    100;
  return clamp(score, 0, 1);
}

/**
 * How the stored M4 modifiers land on this cohort.
 *
 * The modifiers are read exactly as the release recorded them. Which of them
 * matters is the cohort's business: casual listeners answer reach and barely
 * notice credibility, scene heads are the reverse.
 */
function modifierBoosts(
  modifiers: AudienceModifiers,
  cohort: ReceptionCohortState,
  dayIndex: number,
): Pick<CohortEvaluation, "reachBoost" | "anticipationBoost" | "credibilityBoost"> {
  const { behaviour } = cohort;
  // Anticipation is spent on arrival — day three does not benefit from a tease.
  const anticipationRemaining = ANTICIPATION_DECAY_PER_DAY ** Math.max(0, dayIndex - 1);

  return {
    reachBoost: 1 + (modifiers.reach / 100) * behaviour.reachSensitivity * REACH_BOOST_SCALE,
    anticipationBoost:
      1 +
      (modifiers.anticipation / 100) *
        behaviour.anticipationSensitivity *
        ANTICIPATION_BOOST_SCALE *
        anticipationRemaining,
    credibilityBoost:
      1 + (modifiers.credibility / 100) * behaviour.credibilitySensitivity * CREDIBILITY_BOOST_SCALE,
  };
}

export type EvaluateInput = {
  cohort: ReceptionCohortState;
  track: TrackCharacteristics;
  artistSound: SoundProfileValues;
  modifiers: AudienceModifiers;
  dayIndex: number;
};

export function evaluateCohort(input: EvaluateInput): CohortEvaluation {
  const { cohort, track, artistSound, modifiers, dayIndex } = input;
  const { preferences } = cohort;

  const soundFit = regionFit(track.sound, preferences.sound, preferences.tolerance);
  const quality = qualityFit(track, preferences.qualities);
  const artistFit = regionFit(artistSound, preferences.sound, preferences.tolerance);
  const affinity = clamp(cohort.affinity / 1000, 0, 1);

  const fit = clamp(
    soundFit * FIT_WEIGHTS.trackSound +
      quality * FIT_WEIGHTS.trackQuality +
      artistFit * FIT_WEIGHTS.artistSound +
      affinity * FIT_WEIGHTS.standingAffinity,
    0,
    1,
  );

  const boosts = modifierBoosts(modifiers, cohort, dayIndex);

  return {
    cohortSlug: cohort.slug,
    fit: roundTo(fit, 4),
    soundFit: roundTo(soundFit, 4),
    qualityFit: roundTo(quality, 4),
    artistFit: roundTo(artistFit, 4),
    affinity: roundTo(affinity, 4),
    reachBoost: roundTo(boosts.reachBoost, 4),
    anticipationBoost: roundTo(boosts.anticipationBoost, 4),
    credibilityBoost: roundTo(boosts.credibilityBoost, 4),
  };
}
