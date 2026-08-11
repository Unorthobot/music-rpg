import type { CohortEvaluation, ReceptionCohortState } from "@music-rpg/shared";
import { seededJitter } from "../random";
import {
  RESPONSE_JITTER,
  SHARE_BASE,
  SHARE_FIT_WEIGHT,
  SHARE_REACH_BASE,
  SHARE_REACH_FIT_WEIGHT,
  WORD_OF_MOUTH_ROUTING,
} from "./constants";

/**
 * Word of mouth.
 *
 * The mechanism by which a record starts small and does not stay there. Some
 * people who engaged pass it on, and what they pass on becomes somebody else's
 * exposure on the next tick — which is why nothing is resolved at publication
 * and why day three can be larger than day one.
 *
 * Tastemakers are the reason this matters. There are very few of them and each
 * share travels several times further, so a record they take up can reach a
 * cohort that would never have found it unaided.
 */

export type ShareInput = {
  cohort: ReceptionCohortState;
  evaluation: CohortEvaluation;
  engagedListeners: number;
  dayIndex: number;
  seed: string;
};

export type ShareOutcome = {
  shares: number;
  /** Exposure these shares will create on the next tick. */
  wordOfMouth: number;
};

export function calculateWordOfMouth(input: ShareInput): ShareOutcome {
  const { cohort, evaluation, engagedListeners, dayIndex, seed } = input;

  if (engagedListeners === 0) return { shares: 0, wordOfMouth: 0 };

  const shares = Math.max(
    0,
    Math.round(
      engagedListeners *
        cohort.behaviour.shareTendency *
        (SHARE_BASE + evaluation.fit * SHARE_FIT_WEIGHT) *
        seededJitter(RESPONSE_JITTER, seed, cohort.slug, dayIndex, "share"),
    ),
  );

  // How far each share actually carries: a strong record is passed on with
  // more conviction than one somebody merely mentioned.
  const wordOfMouth = Math.max(
    0,
    Math.round(
      shares *
        cohort.behaviour.shareAmplification *
        (SHARE_REACH_BASE + evaluation.fit * SHARE_REACH_FIT_WEIGHT),
    ),
  );

  return { shares, wordOfMouth };
}

/**
 * Where the talking lands.
 *
 * Word of mouth generated in one cohort mostly stays there — except for
 * tastemakers, half of whose sharing leaves the room it was heard in. A cohort
 * with no routing entry keeps its own.
 */
export function routeWordOfMouth(
  generated: Record<string, number>,
  cohortSlugs: string[],
): Record<string, number> {
  const routed: Record<string, number> = Object.fromEntries(
    cohortSlugs.map((slug) => [slug, 0]),
  );

  for (const [source, amount] of Object.entries(generated)) {
    if (amount <= 0) continue;

    const routes = WORD_OF_MOUTH_ROUTING[source];
    if (!routes) {
      routed[source] = (routed[source] ?? 0) + amount;
      continue;
    }

    // Only route to cohorts this world actually has, and keep the remainder
    // rather than quietly losing it.
    const reachable = Object.entries(routes).filter(([target]) => cohortSlugs.includes(target));
    const total = reachable.reduce((sum, [, weight]) => sum + weight, 0);
    if (total <= 0) {
      routed[source] = (routed[source] ?? 0) + amount;
      continue;
    }

    for (const [target, weight] of reachable) {
      routed[target] = (routed[target] ?? 0) + Math.round((amount * weight) / total);
    }
  }

  return routed;
}
