import { clamp, roundTo, type CohortTickOutcome } from "@music-rpg/shared";

/**
 * What a day of reception leaves behind in a cohort's relationship with an
 * artist.
 *
 * Everything else the simulator produces is about a record. This is about the
 * artist, and it is what makes the *next* release land differently: fans who
 * stayed, warmth that accumulated, and an expectation that has now been set.
 *
 * Only `fans`, `affinity` and `priorExposure` feed back into the simulation in
 * M5. `expectation` and `engagementTendency` are recorded now because they are
 * facts the tick knows and later milestones will read — an artist who
 * disappoints a cohort that expected something should pay for it, and that is
 * only possible if the expectation was written down when it formed.
 */

/** Warmth accumulated per engaged listener, relative to cohort size. */
export const AFFINITY_ENGAGEMENT_GAIN = 3;
/** Warmth accumulated per new fan. Staying is worth far more than listening. */
export const AFFINITY_CONVERSION_GAIN = 12;
/** Affinity, expectation and tendency all live on the same 0–1000 scale. */
export const AUDIENCE_SCALE = 1000;
/** How fast an expectation moves toward what was most recently delivered. */
export const EXPECTATION_BLEND = 0.4;
/** How fast observed engagement updates the cohort's expected behaviour. */
export const ENGAGEMENT_TENDENCY_BLEND = 0.3;

export type AudienceStateInput = {
  cohortSize: number;
  outcome: CohortTickOutcome;
  current: {
    fans: number;
    affinity: number;
    expectation: number;
    engagementTendency: number;
    priorExposure: number;
  };
};

export type AudienceStateOutcome = {
  fans: number;
  affinity: number;
  expectation: number;
  engagementTendency: number;
  priorExposure: number;
};

export function nextAudienceState(input: AudienceStateInput): AudienceStateOutcome {
  const { outcome, current } = input;
  const size = Math.max(1, input.cohortSize);

  // Fans are added, never recomputed from listeners: this number is the
  // accumulated history of everyone who stayed.
  const fans = Math.max(0, current.fans + outcome.fanConversions);

  const gained =
    AUDIENCE_SCALE *
    ((outcome.evaluation.fit * outcome.engagedListeners * AFFINITY_ENGAGEMENT_GAIN) / size +
      (outcome.fanConversions * AFFINITY_CONVERSION_GAIN) / size);

  // Not rounded: warmth accumulates in fractions, and rounding each day to
  // zero would mean a cohort of ninety-four thousand could never warm at all.
  const affinity = roundTo(clamp(current.affinity + gained, 0, AUDIENCE_SCALE), 4);

  // An expectation is only set by people who actually heard something.
  const expectation =
    outcome.engagedListeners > 0
      ? Math.round(
          clamp(
            current.expectation * (1 - EXPECTATION_BLEND) +
              outcome.evaluation.fit * AUDIENCE_SCALE * EXPECTATION_BLEND,
            0,
            AUDIENCE_SCALE,
          ),
        )
      : current.expectation;

  const engagementTendency =
    outcome.listeners > 0
      ? Math.round(
          clamp(
            current.engagementTendency * (1 - ENGAGEMENT_TENDENCY_BLEND) +
              (outcome.engagedListeners / outcome.listeners) *
                AUDIENCE_SCALE *
                ENGAGEMENT_TENDENCY_BLEND,
            0,
            AUDIENCE_SCALE,
          ),
        )
      : current.engagementTendency;

  return {
    fans,
    affinity,
    expectation,
    engagementTendency,
    // Unique people here who have now encountered this artist at all.
    priorExposure: Math.max(0, current.priorExposure + outcome.exposures),
  };
}
