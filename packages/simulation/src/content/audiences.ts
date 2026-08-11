import type { AudienceCohortBehaviour, AudienceCohortPreferences } from "@music-rpg/shared";

/**
 * The people in a world who listen to music.
 *
 * These are populations, not classes the player chooses. A cohort exists in
 * Johannesburg whether or not anyone has ever reached it, and every career
 * releasing into the city is addressing the same people — which is why this is
 * world content rather than career state.
 *
 * Three cohorts that hear the same record differently is the minimum that makes
 * the simulation say anything: one number for "the audience" could only ever
 * produce a score.
 */
export type AudienceCohortSeed = {
  slug: string;
  name: string;
  description: string;
  /** Addressable population. The ceiling on what one release can reach here. */
  size: number;
  preferences: AudienceCohortPreferences;
  behaviour: AudienceCohortBehaviour;
  /** Where in the world they are concentrated, by scene slug. */
  sceneAffinity: Record<string, number>;
};

/**
 * Sound preferences are expressed on the same axes as Sound DNA, so a cohort's
 * taste and an artist's identity are directly comparable. Axes left out are
 * ones the cohort has no opinion about.
 */
export const audienceCohortSeeds: AudienceCohortSeed[] = [
  {
    slug: "SCENE_HEADS",
    name: "Scene heads",
    description:
      "The people who were at the show before anyone else was. They know who produced what, they can hear when something is borrowed, and they take a record personally.",
    size: 3_800,
    preferences: {
      sound: {
        rawPolished: -0.45,
        accessibleExperimental: 0.4,
        darkBright: -0.25,
        intimateAnthemic: -0.2,
      },
      tolerance: 0.85,
      // What is it, and did you mean it. Immediacy is nearly irrelevant to them.
      qualities: { focus: 0.35, distinctiveness: 0.52, immediacy: 0.13 },
    },
    behaviour: {
      baseDiscoveryRate: 0.0062,
      attention: 0.46,
      engagementBias: 0.44,
      conversionResistance: 3.2,
      shareTendency: 0.22,
      shareAmplification: 2.4,
      repeatTendency: 0.18,
      // Being told to care does little; having been vouched for does a lot.
      reachSensitivity: 0.5,
      anticipationSensitivity: 0.35,
      credibilitySensitivity: 1,
      famePressure: 0.6,
      respectPressure: 1,
      heatPressure: 0.7,
    },
    sceneAffinity: {
      braamfontein: 0.34,
      newtown: 0.24,
      maboneng: 0.16,
      soweto: 0.15,
      alexandra: 0.11,
    },
  },
  {
    slug: "CASUAL_LISTENERS",
    name: "Casual listeners",
    description:
      "Everybody else. They are not looking for anything, they are not against you, and they will decide inside eight seconds.",
    size: 94_000,
    preferences: {
      sound: {
        rawPolished: 0.3,
        accessibleExperimental: -0.5,
        melodicRhythmic: -0.25,
        intimateAnthemic: 0.35,
      },
      // Broad taste, narrow patience — the demand shows up in the weights below.
      tolerance: 1.15,
      qualities: { focus: 0.24, distinctiveness: 0.14, immediacy: 0.62 },
    },
    behaviour: {
      // Vanishingly small as a rate, large as a number: this is most of the city.
      baseDiscoveryRate: 0.00016,
      attention: 0.3,
      engagementBias: 0.22,
      conversionResistance: 6.5,
      shareTendency: 0.08,
      shareAmplification: 1.6,
      repeatTendency: 0.1,
      // Reach is the only thing that moves them. Credibility means little here.
      reachSensitivity: 1,
      anticipationSensitivity: 0.7,
      credibilitySensitivity: 0.15,
      famePressure: 1,
      respectPressure: 0.15,
      heatPressure: 0.6,
    },
    sceneAffinity: {
      braamfontein: 0.22,
      maboneng: 0.18,
      soweto: 0.3,
      alexandra: 0.22,
      newtown: 0.08,
    },
  },
  {
    slug: "TASTEMAKERS",
    name: "Tastemakers",
    description:
      "Selectors, writers, the two or three people whose opinion arrives somewhere before they do. Few of them, and each one is worth a room.",
    size: 420,
    preferences: {
      sound: {
        accessibleExperimental: 0.5,
        classicFuturistic: 0.35,
        rawPolished: -0.2,
        minimalDense: -0.15,
      },
      tolerance: 1.05,
      // Is it new, and is it finished enough to be worth putting my name on.
      qualities: { focus: 0.3, distinctiveness: 0.58, immediacy: 0.12 },
    },
    behaviour: {
      baseDiscoveryRate: 0.012,
      attention: 0.58,
      engagementBias: 0.4,
      conversionResistance: 4.2,
      shareTendency: 0.55,
      // The reason a record can start with nine people and not stay there.
      shareAmplification: 6.5,
      repeatTendency: 0.14,
      reachSensitivity: 0.6,
      anticipationSensitivity: 0.9,
      credibilitySensitivity: 0.85,
      famePressure: 0.5,
      respectPressure: 0.85,
      heatPressure: 1,
    },
    sceneAffinity: {
      maboneng: 0.38,
      braamfontein: 0.26,
      newtown: 0.2,
      soweto: 0.1,
      alexandra: 0.06,
    },
  },
];
