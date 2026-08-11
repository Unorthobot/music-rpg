import {
  roundTo,
  type DirectorFacts,
  type EligibilityCheck,
  type EligibilityResult,
  type EligibilityRule,
  type PersonFacts,
} from "@music-rpg/shared";
import {
  INVITE_MIN_CHEMISTRY,
  INVITE_MIN_RESPECT,
  NIGHT_LENGTH_HOURS,
  SHOWCASE_MIN_MOMENTUM,
} from "./constants";
import { sceneStanding } from "./standing";

/**
 * Can this situation plausibly exist at all?
 *
 * Binary, and about the world rather than the career's prospects. Nothing here
 * scores anything, nothing here compares two candidates, and nothing that fails
 * here can be rescued later — a high score never overrides a failed condition,
 * because "you have nothing to play" and "something more relevant came up" are
 * different answers and a player deserves to be told which one they are getting.
 *
 * **Every rule is evaluated, even after one has failed.** Short-circuiting would
 * reduce "why not?" to whichever condition happened to be checked first, when the
 * honest answer is frequently that three separate things are not true yet.
 *
 * Each check keeps the value it was applied to. That is what makes this an
 * argument rather than an assertion: a threshold can be disagreed with later,
 * under a newer director, using the numbers the old one actually saw.
 */

const HOUR = 60 * 60 * 1000;

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

/** Anything already booked across the offered night. */
function clashingCommitment(
  facts: DirectorFacts,
  nightStart: Date,
): { title: string; startGameTime: string } | null {
  const nightEnd = new Date(nightStart.getTime() + NIGHT_LENGTH_HOURS * HOUR);

  for (const commitment of facts.commitments) {
    const start = commitment.startGameTime.getTime();
    const end = (commitment.endGameTime ?? commitment.startGameTime).getTime();
    // Touching endpoints are not a clash; overlap is.
    if (start < nightEnd.getTime() && end > nightStart.getTime()) {
      return {
        title: commitment.title,
        startGameTime: commitment.startGameTime.toISOString(),
      };
    }
  }

  return null;
}

/**
 * Whether this exact offer has ever been made.
 *
 * Across every status, not only the live ones. Declining Naledi's Friday is an
 * answer about that Friday, and she does not ring back about it.
 */
function alreadyOffered(facts: DirectorFacts, identityKey: string): boolean {
  return facts.usedIdentityKeys.includes(identityKey);
}

/** Whether this person is already waiting on an answer from the player. */
function alreadyWaiting(facts: DirectorFacts, sourceEntityId: string): boolean {
  return facts.liveOpportunities.some((live) => live.sourceEntityId === sourceEntityId);
}

/* --- A promoter with a slot ----------------------------------------------- */

export type ShowcaseEligibilityInput = {
  facts: DirectorFacts;
  promoter: PersonFacts;
  identityKey: string;
  /** The night on offer, in game time. */
  nightGameTime: Date;
};

export function showcaseEligibility(input: ShowcaseEligibilityInput): EligibilityResult {
  const { facts, promoter } = input;
  const profile = promoter.promoter;
  if (!profile) {
    return resultOf([
      check("SOURCE_IS_ACTIVE", false, `${promoter.name} isn't booking anything.`, {
        role: promoter.role,
      }),
    ]);
  }

  const standing = sceneStanding(profile.sceneSlug, facts.cohorts);
  const playable = facts.releases.filter((release) => release.daysSimulated > 0);
  const bestMomentum = facts.releases.reduce(
    (highest, release) => Math.max(highest, release.momentum),
    0,
  );
  const clash = clashingCommitment(facts, input.nightGameTime);

  return resultOf([
    check(
      "SOURCE_IS_ACTIVE",
      promoter.active,
      `${promoter.name} isn't putting nights on at the moment.`,
      { active: promoter.active },
    ),
    check(
      "HAS_SOMETHING_TO_PLAY",
      playable.length > 0,
      "You've got nothing out that a room could hear.",
      { releasesOut: playable.length },
    ),
    /*
     * The floor is the *support* bar, not the headline one. Failing to be worth
     * the top of the bill is not a failure of eligibility — it is a different
     * offer, decided at assembly. What makes this ineligible is not being worth
     * a place on the bill at all.
     */
    check(
      "SCENE_KNOWS_YOU",
      standing.value >= profile.supportStandard,
      `${profile.sceneSlug} doesn't know you well enough to put you on ${profile.nightName} yet.`,
      {
        scene: profile.sceneSlug,
        sceneStanding: standing.value,
        supportStandard: profile.supportStandard,
        // Kept so the inspector can see which billing the standing bought.
        headlineStandard: profile.standard,
        billing: standing.value >= profile.standard ? "HEADLINE" : "SUPPORT",
      },
    ),
    check(
      "RECORD_IS_MOVING",
      bestMomentum >= SHOWCASE_MIN_MOMENTUM,
      "Nothing of yours is moving right now.",
      { momentum: roundTo(bestMomentum, 3), required: SHOWCASE_MIN_MOMENTUM },
    ),
    check(
      "NIGHT_IS_FREE",
      clash === null,
      clash ? `You're already booked that night — ${clash.title}.` : "That night is free.",
      {
        night: input.nightGameTime.toISOString(),
        clashesWith: clash?.title ?? null,
      },
    ),
    check(
      "NOT_ALREADY_OFFERED",
      !alreadyOffered(facts, input.identityKey),
      `${promoter.name} has already offered you that night.`,
      { identityKey: input.identityKey },
    ),
    check(
      "SOURCE_NOT_ALREADY_WAITING",
      !alreadyWaiting(facts, promoter.characterId),
      `${promoter.name} is still waiting to hear about the last one.`,
      { sourceEntityId: promoter.characterId },
    ),
  ]);
}

/* --- Somebody who wants to make another record ---------------------------- */

export type SessionInviteEligibilityInput = {
  facts: DirectorFacts;
  producer: PersonFacts;
  identityKey: string;
};

export function sessionInviteEligibility(
  input: SessionInviteEligibilityInput,
): EligibilityResult {
  const { facts, producer } = input;
  const state = producer.relationship;

  /*
   * No relationship at all is a legitimate state, not missing data: M6 derives
   * relationships from shared sessions, so somebody you have never worked with
   * correctly has nothing to say about you. It fails one named rule and the rest
   * are still reported against zero, so the answer stays complete.
   */
  const respect = state?.respect ?? 0;
  const chemistry = state?.creativeChemistry ?? 0;
  const wantsMore = producer.openMomentKinds.includes("WANTS_ANOTHER_SESSION");
  const unresolved = producer.openMomentKinds.includes("WANTS_TO_TALK");

  return resultOf([
    check(
      "SOURCE_IS_ACTIVE",
      producer.active,
      `${producer.name} isn't taking sessions.`,
      { active: producer.active },
    ),
    check(
      "WORKED_TOGETHER",
      producer.interactionCount > 0,
      `You and ${producer.name} haven't made anything together.`,
      { interactions: producer.interactionCount },
    ),
    check(
      "THEY_RATE_THE_WORK",
      respect >= INVITE_MIN_RESPECT,
      `${producer.name} doesn't rate the work enough to want more of it.`,
      { respect: roundTo(respect, 3), required: INVITE_MIN_RESPECT },
    ),
    check(
      "SOMETHING_LEFT_TO_DO",
      chemistry >= INVITE_MIN_CHEMISTRY || wantsMore || unresolved,
      `Nothing between you and ${producer.name} is asking for another session.`,
      {
        chemistry: roundTo(chemistry, 3),
        required: INVITE_MIN_CHEMISTRY,
        // M6's moments, read. Never re-detected here.
        openMoment: producer.openMomentKinds[0] ?? null,
      },
    ),
    check(
      "NOT_MID_SESSION",
      !facts.midSession,
      "You're in the middle of a session already.",
      { midSession: facts.midSession },
    ),
    check(
      "NOT_ALREADY_OFFERED",
      !alreadyOffered(facts, input.identityKey),
      `${producer.name} has already asked about that record.`,
      { identityKey: input.identityKey },
    ),
    check(
      "SOURCE_NOT_ALREADY_WAITING",
      !alreadyWaiting(facts, producer.characterId),
      `${producer.name} is still waiting on an answer.`,
      { sourceEntityId: producer.characterId },
    ),
  ]);
}
