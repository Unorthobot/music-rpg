import {
  RANKING_CEILING,
  RANKING_FLOOR,
  clamp,
  roundTo,
  type DirectorFacts,
  type EligibilityCheck,
  type EligibilityResult,
  type EligibilityRule,
  type PersonFacts,
  type RankingContribution,
  type RankingResult,
} from "@music-rpg/shared";
import {
  CHALLENGE_BASE,
  CHALLENGE_FULL_INTEREST_MARGIN,
  CHALLENGE_INTEREST_FLOOR,
  CHALLENGE_RIVALRY_WEIGHT,
  CROWDING_WEIGHT,
  MOMENTUM_WEIGHT,
  ROOM_FLOOR_FACTOR,
  ROOM_FULL_CAPACITY,
  SCENE_FIT_WEIGHT,
  TIMELINESS_WEIGHT,
  TIMELY_WINDOW_DAYS,
} from "../opportunities/constants";
import { sceneStanding } from "../opportunities/standing";

/**
 * A rival wanting to battle you, as an opportunity.
 *
 * **The director is not rewritten and must not be.** M7 closed by saying that a
 * new opportunity type is an extension — a candidate assembled from world state,
 * put through the same two gates, ordered by the same cap — and this is exactly
 * that. Eligibility and ranking stay rigorously apart, every rule is named, and
 * nothing here introduces a giant universal score.
 *
 * The director still does not know what dramatic means and does not learn it
 * here. It asks only whether a challenge could plausibly exist, and then how much
 * a plausible one is worth surfacing against everything else that could happen.
 *
 * ## The one thing this type must not do
 *
 * A battle is a career path, not a progression gate. Nothing in this file may
 * make a challenge *more* likely because the player has been refusing them, and
 * nothing may make any other opportunity type less likely because a battle is
 * live. An artist who never battles must remain a legitimate artist, and the
 * director's job is to keep offering plausible things — not to escalate until
 * somebody says yes.
 */

function check(
  rule: EligibilityRule,
  passed: boolean,
  reason: string,
  observed: EligibilityCheck["observed"],
): EligibilityCheck {
  return { rule, passed, reason, observed };
}

function resultOf(checks: EligibilityCheck[]): EligibilityResult {
  const failed = checks.filter((entry) => !entry.passed).map((entry) => entry.rule);
  return { eligible: failed.length === 0, checks, failed };
}

export type ChallengeEligibilityInput = {
  facts: DirectorFacts;
  rival: PersonFacts;
  identityKey: string;
  /** The night on offer, in game time. */
  nightGameTime: Date;
  /** Whether a battle with this rival is already live or already happened. */
  hasOutstandingBattle: boolean;
  priorBattleCount: number;
};

/**
 * Could this challenge plausibly exist at all?
 *
 * Binary, about the world, and every rule evaluated even after one fails. The
 * conditions are the ones a rival would actually apply: is there anything of
 * yours to have an opinion about, does this scene know you enough to be worth
 * their time, are they free of an argument they are already having with you, and
 * is the night free.
 */
export function battleChallengeEligibility(
  input: ChallengeEligibilityInput,
): EligibilityResult {
  const { facts, rival } = input;
  const profile = rival.battler;

  if (!profile) {
    return resultOf([
      check("SOURCE_IS_ACTIVE", false, `${rival.name} isn't challenging anybody.`, {
        role: rival.role,
      }),
    ]);
  }

  const standing = sceneStanding(profile.sceneSlug, facts.cohorts);
  const playable = facts.releases.filter((release) => release.daysSimulated > 0);

  /* Anything already booked across the night on offer. */
  const nightEnd = new Date(input.nightGameTime.getTime() + 5 * 60 * 60 * 1000);
  const clash = facts.commitments.find((commitment) => {
    const start = commitment.startGameTime.getTime();
    const end = (commitment.endGameTime ?? commitment.startGameTime).getTime();
    return start < nightEnd.getTime() && end > input.nightGameTime.getTime();
  });

  return resultOf([
    check("SOURCE_IS_ACTIVE", rival.active, `${rival.name} isn't around at the moment.`, {
      active: rival.active,
    }),
    /*
     * There has to be something to react to. A challenge is a response to
     * somebody existing in a scene, and an artist nobody has heard anything from
     * is not being called out by anybody — which is why this is the same rule the
     * showcase type uses rather than a battle-specific one.
     */
    check(
      "HAS_SOMETHING_TO_PLAY",
      playable.length > 0,
      "Nobody's heard anything of yours to have an opinion about.",
      { releasesOut: playable.length },
    ),
    /*
     * Their bar, on the same 0-100 scene-standing scale a promoter's is. Nobody
     * with a reputation calls out somebody nobody has heard of — not out of
     * modesty, but because there is nothing in it for them.
     */
    check(
      "SCENE_KNOWS_YOU",
      standing.value >= profile.standard,
      `${rival.name} doesn't rate you as worth their time in ${profile.sceneSlug} yet.`,
      {
        scene: profile.sceneSlug,
        sceneStanding: standing.value,
        standard: profile.standard,
        motive: profile.motive,
      },
    ),
    /*
     * One argument at a time. Somebody who has already called you out is not
     * calling you out again while it is unsettled, and a battle that has been
     * fought is a different fact from one that is waiting.
     */
    check(
      "NO_BATTLE_OUTSTANDING",
      !input.hasOutstandingBattle,
      `You and ${rival.name} already have something unsettled.`,
      { outstanding: input.hasOutstandingBattle, priorBattles: input.priorBattleCount },
    ),
    check(
      "NIGHT_IS_FREE",
      clash === undefined,
      clash ? `You're already booked that night — ${clash.title}.` : "That night is free.",
      {
        night: input.nightGameTime.toISOString(),
        clashesWith: clash?.title ?? null,
      },
    ),
    check(
      "NOT_ALREADY_OFFERED",
      !facts.usedIdentityKeys.includes(input.identityKey),
      `${rival.name} has already put that night to you.`,
      { identityKey: input.identityKey },
    ),
    check(
      "SOURCE_NOT_ALREADY_WAITING",
      !facts.liveOpportunities.some((live) => live.sourceEntityId === rival.characterId),
      `${rival.name} is still waiting on an answer.`,
      { sourceEntityId: rival.characterId },
    ),
  ]);
}

export type ChallengeRankingInput = {
  facts: DirectorFacts;
  rival: PersonFacts;
  liveCount: number;
};

/**
 * Of the things that could happen, how much is *this* worth surfacing?
 *
 * The same named-contribution shape every other opportunity type uses, with one
 * term this type genuinely needs and the others do not: what is already between
 * these two people competitively.
 *
 * `rivalry` is read from M6's recorded dimension rather than from any battle
 * history re-counted here — one source of truth, and by M8 the fold is what
 * moves it. Somebody who has measured themselves against you before has more
 * reason to do it again, which is a fact about the relationship rather than a
 * pressure to make the player fight.
 */
export function rankBattleChallenge(input: ChallengeRankingInput): RankingResult {
  const profile = input.rival.battler!;
  const standing = sceneStanding(profile.sceneSlug, input.facts.cohorts);
  const bestMomentum = input.facts.releases.reduce(
    (highest, release) => Math.max(highest, release.momentum),
    0,
  );
  const rivalry = input.rival.relationship?.rivalry ?? 0;

  const contribution = (
    term: RankingContribution["term"],
    value: number,
    weight: number,
    note: string,
  ): RankingContribution => ({
    term,
    input: roundTo(value, 4),
    weight,
    contribution: roundTo(value * weight, 4),
    note,
  });

  const timeliness = clamp(
    100 * Math.min(1, TIMELY_WINDOW_DAYS / Math.max(1, profile.answerByDays)),
    0,
    100,
  );

  /*
   * The room, folded into the base exactly as a showcase folds a venue's
   * capacity in. A battle in a 220-capacity rooftop is a bigger thing to be told
   * about than one in a 90-capacity yard, and giving the room its own term would
   * have let a venue's size outrank what is actually happening to somebody.
   */
  const roomFactor =
    ROOM_FLOOR_FACTOR +
    (1 - ROOM_FLOOR_FACTOR) * clamp(profile.capacity / ROOM_FULL_CAPACITY, 0, 1);

  /*
   * How much they actually want it.
   *
   * The counterpart of a showcase's billing factor. Clearing a rival's bar makes
   * a challenge *possible* — that is eligibility's business — but only clearing
   * it comfortably makes it a thing worth a player's scarce attention. Somebody
   * who barely rates you is proposing something speculative, and the director
   * should weigh it as such rather than as equal to paid work.
   */
  const interestFactor =
    CHALLENGE_INTEREST_FLOOR +
    (1 - CHALLENGE_INTEREST_FLOOR) *
      clamp((standing.value - profile.standard) / CHALLENGE_FULL_INTEREST_MARGIN, 0, 1);

  const contributions = [
    contribution(
      "base",
      CHALLENGE_BASE * roomFactor * interestFactor,
      1,
      `${profile.venueName}, holding ${profile.capacity}. ${
        interestFactor < 0.6
          ? "They have only just decided you are worth it."
          : "They want this one."
      }`,
    ),
    contribution(
      "sceneFit",
      standing.value,
      SCENE_FIT_WEIGHT,
      `How well ${profile.sceneSlug} knows you — the room this would be held in front of.`,
    ),
    contribution(
      "relationship",
      rivalry,
      CHALLENGE_RIVALRY_WEIGHT,
      "What is already between you competitively. M6's rivalry, read — never re-counted.",
    ),
    contribution(
      "momentum",
      bestMomentum,
      MOMENTUM_WEIGHT,
      "Whether there is anything of yours moving for them to be reacting to.",
    ),
    contribution(
      "timeliness",
      timeliness,
      TIMELINESS_WEIGHT,
      `${profile.answerByDays} days to answer.`,
    ),
    contribution(
      "crowding",
      input.liveCount,
      CROWDING_WEIGHT,
      "Every offer already waiting makes another one worth less.",
    ),
  ];

  return {
    score: roundTo(
      clamp(
        contributions.reduce((sum, entry) => sum + entry.contribution, 0),
        RANKING_FLOOR,
        RANKING_CEILING,
      ),
      4,
    ),
    contributions,
    /*
     * Fame is not here, deliberately and importantly. How widely known somebody
     * is has nothing to do with whether a rival in their scene wants to settle
     * something with them, and letting it count would have made battles a thing
     * that happens to successful careers rather than to competitive ones.
     */
    irrelevant: ["fame", "moneyBalance", "trust", "creativeChemistry"],
  };
}
