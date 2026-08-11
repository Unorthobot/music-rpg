import {
  RANKING_CEILING,
  RANKING_FLOOR,
  clamp,
  roundTo,
  type DirectorFacts,
  type PersonFacts,
  type RankingContribution,
  type RankingResult,
  type RankingTerm,
  type ShowcaseBilling,
} from "@music-rpg/shared";
import {
  CROWDING_WEIGHT,
  MOMENTUM_WEIGHT,
  RELATIONSHIP_CHEMISTRY_SHARE,
  RELATIONSHIP_RESPECT_SHARE,
  RELATIONSHIP_TRUST_SHARE,
  RELATIONSHIP_WEIGHT,
  ROOM_FLOOR_FACTOR,
  ROOM_FULL_CAPACITY,
  SCENE_FIT_WEIGHT,
  SESSION_INVITE_BASE,
  SHOWCASE_BASE,
  SUPPORT_BILLING_FACTOR,
  TIMELINESS_WEIGHT,
  TIMELY_WINDOW_DAYS,
} from "./constants";
import { sceneStanding } from "./standing";

/**
 * Of the things that could happen, which are worth surfacing now?
 *
 * Comparative, and about the career rather than the world. Ranking runs only on
 * candidates that already passed eligibility and it can never put one back — it
 * decides ordering and, with the live cap, how much of that ordering the player
 * is actually shown.
 *
 * **No opaque score.** A total exists because things have to be ordered, but it
 * is always the sum of named contributions kept beside it, each with the input it
 * came from and a line saying why that input is worth what it is worth. A number
 * on its own could rank correctly and still be unable to explain itself, which
 * for a director is the same as being wrong.
 *
 * **Irrelevance is an answer.** Each kind of opportunity names the inputs it does
 * *not* consider — a promoter you have never met has no relationship to weigh,
 * and how well a scene knows you has nothing to do with whether your producer
 * wants another session. "That fact did not matter here" is frequently the true
 * reason one thing outranked another, and an inspector that could only list what
 * counted would not be able to give it.
 */

function contribution(
  term: RankingTerm,
  input: number,
  weight: number,
  note: string,
): RankingContribution {
  return {
    term,
    input: roundTo(input, 4),
    weight,
    contribution: roundTo(input * weight, 4),
    note,
  };
}

function totalOf(contributions: RankingContribution[]): number {
  const sum = contributions.reduce((running, entry) => running + entry.contribution, 0);
  // Bounded, so no single term can run away with a decision.
  return roundTo(clamp(sum, RANKING_FLOOR, RANKING_CEILING), 4);
}

/** How urgent answering is: inside a week is urgent, beyond that it decays. */
function timeliness(days: number): number {
  if (days <= 0) return 100;
  return clamp(100 * Math.min(1, TIMELY_WINDOW_DAYS / days), 0, 100);
}

/** What a standing relationship is worth, as one 0–100 number, decomposed above. */
export function relationshipWeight(person: PersonFacts): number {
  const state = person.relationship;
  if (!state) return 0;

  return clamp(
    state.respect * RELATIONSHIP_RESPECT_SHARE +
      state.trust * RELATIONSHIP_TRUST_SHARE +
      state.creativeChemistry * RELATIONSHIP_CHEMISTRY_SHARE,
    0,
    100,
  );
}

/* --- A promoter with a slot ----------------------------------------------- */

export type ShowcaseRankingInput = {
  facts: DirectorFacts;
  promoter: PersonFacts;
  nightGameTime: Date;
  billing: ShowcaseBilling;
  /** How many offers are already waiting on the player. */
  liveCount: number;
};

export function rankShowcase(input: ShowcaseRankingInput): RankingResult {
  const profile = input.promoter.promoter!;
  const standing = sceneStanding(profile.sceneSlug, input.facts.cohorts);
  const bestMomentum = input.facts.releases.reduce(
    (highest, release) => Math.max(highest, release.momentum),
    0,
  );
  const daysToAnswer = profile.answerByDays;

  /*
   * The room and the billing are folded into the base rather than each given a
   * term. Both are properties of the offer rather than of the career, and giving
   * a venue's capacity its own weight would let the size of a stage outrank what
   * is actually happening to somebody.
   */
  const roomFactor =
    ROOM_FLOOR_FACTOR +
    (1 - ROOM_FLOOR_FACTOR) * clamp(profile.capacity / ROOM_FULL_CAPACITY, 0, 1);
  const billingFactor = input.billing === "HEADLINE" ? 1 : SUPPORT_BILLING_FACTOR;

  const contributions = [
    contribution(
      "base",
      SHOWCASE_BASE * roomFactor * billingFactor,
      1,
      input.billing === "HEADLINE"
        ? `Carrying a room holding ${profile.capacity}.`
        : `Opening a room holding ${profile.capacity}.`,
    ),
    contribution(
      "sceneFit",
      standing.value,
      SCENE_FIT_WEIGHT,
      `How well ${profile.sceneSlug} knows you, from cohort affinity weighted by where those people are.`,
    ),
    contribution(
      "momentum",
      bestMomentum,
      MOMENTUM_WEIGHT,
      "Whether anything of yours is still moving.",
    ),
    contribution(
      "timeliness",
      timeliness(daysToAnswer),
      TIMELINESS_WEIGHT,
      `${daysToAnswer} days to answer.`,
    ),
    contribution(
      "crowding",
      input.liveCount,
      CROWDING_WEIGHT,
      "Every offer already waiting makes another one worth less.",
    ),
  ];

  return {
    score: totalOf(contributions),
    contributions,
    irrelevant: [
      // A promoter you have never worked with has no opinion of you to weigh,
      // and M6 is right not to invent one.
      "relationship",
      "fame",
      "moneyBalance",
    ],
  };
}

/* --- Somebody who wants to make another record ---------------------------- */

export type SessionInviteRankingInput = {
  facts: DirectorFacts;
  producer: PersonFacts;
  answerByDays: number;
  liveCount: number;
};

export function rankSessionInvite(input: SessionInviteRankingInput): RankingResult {
  const bestMomentum = input.facts.releases.reduce(
    (highest, release) => Math.max(highest, release.momentum),
    0,
  );

  const contributions = [
    contribution("base", SESSION_INVITE_BASE, 1, "Another record with somebody who knows you."),
    contribution(
      "relationship",
      relationshipWeight(input.producer),
      RELATIONSHIP_WEIGHT,
      "What they make of the work: respect, then trust, then what the room was like.",
    ),
    contribution(
      "momentum",
      bestMomentum,
      MOMENTUM_WEIGHT,
      "Whether there is anything to follow up.",
    ),
    contribution(
      "timeliness",
      timeliness(input.answerByDays),
      TIMELINESS_WEIGHT,
      `${input.answerByDays} days to answer.`,
    ),
    contribution(
      "crowding",
      input.liveCount,
      CROWDING_WEIGHT,
      "Every offer already waiting makes another one worth less.",
    ),
  ];

  return {
    score: totalOf(contributions),
    contributions,
    irrelevant: [
      // Where you stand in a neighbourhood has nothing to do with whether the
      // person you made the record with wants to make another.
      "sceneFit",
      "fame",
      "heat",
    ],
  };
}
