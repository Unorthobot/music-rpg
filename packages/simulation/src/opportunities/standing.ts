import { clamp, roundTo, type CohortStandingFacts } from "@music-rpg/shared";
import {
  AFFINITY_FULL,
  FAN_SATURATION,
  STANDING_FAN_WEIGHT,
  STANDING_WARMTH_WEIGHT,
} from "./constants";

/**
 * How well a scene knows you.
 *
 * The gap M7 found in M5, and the one thing here that is not simply read. M5
 * projects reception per *cohort* — scene heads, casual listeners, tastemakers —
 * because that is what a record meets. A promoter books a *place*, and nothing
 * in the game said how well Braamfontein in particular knows somebody.
 *
 * This closes the gap without opening a second version of reception. Both inputs
 * are M5's own recorded numbers, untouched:
 *
 * - `affinity` and `fans` from `artist_audience` — what a cohort feels about this
 *   artist, accumulated over the career by the simulator.
 * - `scene_affinity` from `audience_cohorts` — where in the world that population
 *   is concentrated, which the world seeded and nothing since has changed.
 *
 * So a scene's standing is a weighted mean of cohort standing, weighted by how
 * much of each cohort is actually there. Scene heads are a third of
 * Braamfontein's weight and a seventh of Soweto's, and that is why a record the
 * scene heads took to buys a rooftop in Braam and nothing at all in Soweto.
 *
 * Nothing is remembered here. This is a fold over recorded state, so it is safe
 * to run anywhere and returns the same answer every time — which is exactly why
 * it may be read on a screen while creating an opportunity may not.
 */

/** One cohort's warmth toward this artist, 0–100. */
export function cohortStanding(cohort: CohortStandingFacts): number {
  const warmth = clamp(cohort.affinity / AFFINITY_FULL, 0, 1);
  const fanShare =
    cohort.size > 0 ? clamp(cohort.fans / (cohort.size * FAN_SATURATION), 0, 1) : 0;

  return roundTo(
    100 * (warmth * STANDING_WARMTH_WEIGHT + fanShare * STANDING_FAN_WEIGHT),
    4,
  );
}

/** What each cohort contributed to a scene's standing, and why. */
export type SceneStandingContributor = {
  cohortSlug: string;
  cohortName: string;
  /** That cohort's own warmth, 0–100. */
  standing: number;
  /** How concentrated that cohort is in this scene, 0–1. */
  sceneWeight: number;
  fans: number;
  affinity: number;
};

export type SceneStanding = {
  sceneSlug: string;
  /** 0–100. 100 means the scene is yours. Underground numbers are single digits. */
  value: number;
  contributors: SceneStandingContributor[];
};

export function sceneStanding(
  sceneSlug: string,
  cohorts: CohortStandingFacts[],
): SceneStanding {
  const contributors: SceneStandingContributor[] = cohorts.map((cohort) => ({
    cohortSlug: cohort.slug,
    cohortName: cohort.name,
    standing: cohortStanding(cohort),
    sceneWeight: cohort.sceneAffinity[sceneSlug] ?? 0,
    fans: cohort.fans,
    affinity: roundTo(cohort.affinity, 4),
  }));

  const totalWeight = contributors.reduce((sum, entry) => sum + entry.sceneWeight, 0);

  /*
   * A weighted mean rather than a sum. Summing would make a scene every cohort
   * is a little bit present in outrank a scene one cohort lives in, which is the
   * opposite of what concentration means.
   */
  const value =
    totalWeight > 0
      ? contributors.reduce((sum, entry) => sum + entry.standing * entry.sceneWeight, 0) /
        totalWeight
      : 0;

  return { sceneSlug, value: roundTo(clamp(value, 0, 100), 4), contributors };
}
