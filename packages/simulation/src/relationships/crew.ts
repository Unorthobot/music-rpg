import {
  CREW_ARRANGEMENT_LABELS,
  clamp,
  roundTo,
  type CrewArrangement,
  type CrewDecision,
  type CrewEligibility,
  type RelationshipState,
} from "@music-rpg/shared";

/**
 * Being asked to join, and deciding whether to.
 *
 * The whole point of crew is that it is a second, explicit thing. Working
 * together produces a relationship on its own; nobody becomes crew without
 * being asked, agreeing, and terms being written down. So there are two gates
 * here and they answer different questions: *can this even be asked* is about
 * the history, and *what do they say* is about them.
 *
 * The second gate is where a character stops being a resource. LEX has
 * standards of 88 and an agreeableness of 28, and his stated goal is to find
 * one artist worth the time — so he is hard to get and, if the work has been
 * good, unusually willing. Somebody warmer and less exacting would answer the
 * same relationship differently, which is what makes asking them a decision
 * rather than a formality.
 */

/* --- Can they be asked ---------------------------------------------------- */

/** Enough of a working relationship that asking is not absurd. */
export const CREW_MIN_TRUST = 25;
export const CREW_MIN_RESPECT = 25;

export function crewEligibility(
  state: RelationshipState | null,
  context: { alreadyCrew: boolean; previouslyDeclined: boolean },
): CrewEligibility {
  if (context.alreadyCrew) {
    return { eligible: false, reason: "They're already with you." };
  }
  if (!state) {
    return { eligible: false, reason: "You haven't worked together." };
  }
  if (context.previouslyDeclined) {
    return { eligible: false, reason: "They've already turned this down once." };
  }
  if (state.trust < CREW_MIN_TRUST) {
    return { eligible: false, reason: "They don't know you well enough to commit to anything." };
  }
  if (state.respect < CREW_MIN_RESPECT) {
    return { eligible: false, reason: "They don't rate the work enough yet." };
  }
  return { eligible: true, reason: null };
}

/* --- What do they say ----------------------------------------------------- */

/** What the standing relationship is worth to the question. */
const TRUST_WEIGHT = 0.4;
const RESPECT_WEIGHT = 0.35;
const CHEMISTRY_WEIGHT = 0.25;
/** Tension does not veto — it makes them hesitate, not refuse outright. */
const TENSION_DRAG = 0.18;
/** Loyalty they already feel toward you counts double at the moment of asking. */
const LOYALTY_WEIGHT = 0.5;

/** Somebody exacting wants more before they attach their name to yours. */
const STANDARDS_RESISTANCE = 0.22;
/** Somebody agreeable says yes more easily. */
const AGREEABLENESS_EASE = 0.12;

/**
 * What each arrangement says about how seriously you are taking them.
 *
 * A share is an offer of a stake and reads as commitment. Asking somebody to
 * work on the strength of the work alone is asking for a lot, and only lands
 * with someone who already believes in it.
 */
const ARRANGEMENT_APPEAL: Record<CrewArrangement, number> = {
  SESSION_RATE: 0,
  REVENUE_SHARE: 7,
  FAVOUR: -9,
};

/** Their stated goal is met by this. Narrow on purpose — not an agent. */
export const GOAL_ALIGNMENT_BONUS = 10;

export const CREW_ACCEPT_THRESHOLD = 34;

export type CrewDecisionInput = {
  state: RelationshipState;
  arrangement: CrewArrangement;
  /** From the character row. Missing values fall back to the middle. */
  personality: Record<string, number>;
  /** Their `currentGoal`, verbatim. */
  goal: string | null;
  /** Whether the work so far actually serves that goal. */
  goalServed: boolean;
  name: string;
};

export function crewDecision(input: CrewDecisionInput): CrewDecision {
  const { state, personality } = input;

  const standing =
    state.trust * TRUST_WEIGHT +
    state.respect * RESPECT_WEIGHT +
    state.creativeChemistry * CHEMISTRY_WEIGHT +
    state.loyalty * LOYALTY_WEIGHT -
    state.tension * TENSION_DRAG;

  const standards = personality.standards ?? personality.ego ?? 50;
  const agreeableness = personality.warmth ?? 50;

  const disposition =
    (agreeableness - 50) * AGREEABLENESS_EASE - (standards - 50) * STANDARDS_RESISTANCE;

  const appeal = ARRANGEMENT_APPEAL[input.arrangement];
  const goal = input.goal && input.goalServed ? GOAL_ALIGNMENT_BONUS : 0;

  const score = standing + disposition + appeal + goal;
  const accepted = score >= CREW_ACCEPT_THRESHOLD;

  return {
    accepted,
    line: accepted ? acceptLine(input) : declineLine(input, score),
    factors: {
      standing: roundTo(standing, 3),
      disposition: roundTo(disposition, 3),
      arrangement: appeal,
      goal,
      score: roundTo(score, 3),
      threshold: CREW_ACCEPT_THRESHOLD,
    },
  };
}

function acceptLine(input: CrewDecisionInput): string {
  if (input.goal && input.goalServed) {
    return "Alright. I've been waiting for a reason to commit to something.";
  }
  if (input.arrangement === "REVENUE_SHARE") {
    return "A stake in it, then. That changes how I'd work.";
  }
  return "Fine. Don't waste it.";
}

function declineLine(input: CrewDecisionInput, score: number): string {
  if (input.arrangement === "FAVOUR") {
    return "On goodwill? Ask me again when there's something in it for both of us.";
  }
  if (score < CREW_ACCEPT_THRESHOLD * 0.6) {
    return "We've made one thing. That's not a team.";
  }
  return "Not yet. Let's see what the next one looks like.";
}

/** For the inspector: the offer in the player's own words. */
export function describeArrangement(arrangement: CrewArrangement): string {
  return CREW_ARRANGEMENT_LABELS[arrangement];
}

/** Clamp helper shared by the crew rules, so a score is never nonsense. */
export function crewScore(value: number): number {
  return clamp(value, -100, 200);
}
