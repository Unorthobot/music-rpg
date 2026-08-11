import type {
  MomentKind,
  MomentOption,
  MomentResponse,
  RelationshipState,
} from "@music-rpg/shared";

/**
 * When a relationship has something to say.
 *
 * Conditions, not probabilities. A moment surfaces because the state between
 * two people crossed something meaningful, and the same state always surfaces
 * the same moment — which is what makes it explainable rather than a die roll
 * dressed as drama.
 *
 * The conditions are compound on purpose. `tension > 25 → conflict` would be a
 * threshold; what is actually interesting is *tension alongside what else*.
 * High tension with high respect is a conversation worth having. The same
 * tension without the respect is somebody who has stopped picking up. Those are
 * different moments about different relationships, and only the pair of
 * dimensions together can tell them apart.
 */

/* --- Conditions ----------------------------------------------------------- */

/** They rate the work enough to bother having it out with you. */
export const TALK_MIN_RESPECT = 40;
export const TALK_MIN_TENSION = 24;
/** And you have enough history that a conversation is plausible at all. */
export const TALK_MIN_FAMILIARITY = 12;

/** Unresolved, and not enough regard to be worth resolving. */
export const QUIET_MIN_TENSION = 24;
export const QUIET_MAX_RESPECT = 24;

/** It works, and nothing is in the way. */
export const SESSION_MIN_TRUST = 40;
export const SESSION_MIN_CHEMISTRY = 30;
export const SESSION_MAX_TENSION = 15;

export type MomentDetection = {
  kind: MomentKind;
  /** Which condition fired, for the inspector. */
  reason: string;
};

/**
 * What this relationship currently has to say, if anything.
 *
 * Checked worst-first: somebody who has gone quiet is a more urgent fact about
 * a relationship than somebody who wants another session, and only one moment
 * is open with a person at a time.
 */
export function detectMoment(
  state: RelationshipState,
  context: { isCrew: boolean },
): MomentDetection | null {
  if (state.tension >= QUIET_MIN_TENSION && state.respect < QUIET_MAX_RESPECT) {
    return {
      kind: "GONE_QUIET",
      reason: `tension ${state.tension.toFixed(1)} with respect only ${state.respect.toFixed(1)}`,
    };
  }

  if (
    state.respect >= TALK_MIN_RESPECT &&
    state.tension >= TALK_MIN_TENSION &&
    state.familiarity >= TALK_MIN_FAMILIARITY
  ) {
    return {
      kind: "WANTS_TO_TALK",
      reason: `respect ${state.respect.toFixed(1)} and tension ${state.tension.toFixed(1)}, familiar enough to raise it`,
    };
  }

  if (
    state.trust >= SESSION_MIN_TRUST &&
    state.creativeChemistry >= SESSION_MIN_CHEMISTRY &&
    state.tension < SESSION_MAX_TENSION
  ) {
    return {
      kind: "WANTS_ANOTHER_SESSION",
      reason: `trust ${state.trust.toFixed(1)} and chemistry ${state.creativeChemistry.toFixed(1)} with little in the way`,
      // Crew or not, wanting to work again is the same impulse; context is kept
      // for the conditions that will need it.
    };
  }

  void context;
  return null;
}

/* --- What it says, and what can be said back ------------------------------ */

const COPY: Record<
  MomentKind,
  { title: (name: string) => string; detail: string; options: MomentOption[] }
> = {
  WANTS_TO_TALK: {
    title: (name) => `${name} wants to talk.`,
    detail:
      "Something from the last sessions hasn't been said out loud. They rate you enough to want it said.",
    options: [
      {
        response: "TALK",
        label: "Hear them out",
        detail: "Let them say it, and take it seriously.",
      },
      {
        response: "HOLD_FIRM",
        label: "Stand your ground",
        detail: "Listen, and don't move. They may respect that. It won't clear the air.",
      },
      {
        response: "IGNORE",
        label: "Leave it",
        detail: "Some things go away on their own. Most don't.",
      },
    ],
  },
  GONE_QUIET: {
    title: (name) => `${name} has gone quiet.`,
    detail: "Messages take longer to come back. Nothing was said, which is its own answer.",
    options: [
      {
        response: "TALK",
        label: "Reach out",
        detail: "Ask directly. It might not be welcome.",
      },
      {
        response: "IGNORE",
        label: "Let it be",
        detail: "Not everybody stays.",
      },
    ],
  },
  WANTS_ANOTHER_SESSION: {
    title: (name) => `${name} wants to get back in the room.`,
    detail: "The last one worked. They've got something they want to try.",
    options: [
      { response: "ACCEPT", label: "Set it up", detail: "Make the time." },
      {
        response: "DECLINE",
        label: "Not right now",
        detail: "You've got other things. They'll understand, up to a point.",
      },
    ],
  },
};

export function momentTitle(kind: MomentKind, name: string): string {
  return COPY[kind].title(name);
}

export function momentDetail(kind: MomentKind): string {
  return COPY[kind].detail;
}

export function momentOptions(kind: MomentKind): MomentOption[] {
  return COPY[kind].options;
}

/**
 * What answering this way actually was.
 *
 * The response is the consequence — the moment itself never was. Each maps onto
 * a named interaction the derivation already knows how to price, so answering a
 * moment moves a relationship through exactly the same fold as everything else.
 */
export function responseInteraction(
  response: MomentResponse,
): "TALKED_IT_THROUGH" | "STOOD_GROUND" | "AVOIDED_THEM" {
  switch (response) {
    case "TALK":
    case "ACCEPT":
      return "TALKED_IT_THROUGH";
    case "HOLD_FIRM":
      return "STOOD_GROUND";
    case "IGNORE":
    case "DECLINE":
      return "AVOIDED_THEM";
  }
}

/** Whether a response is one this moment actually offered. */
export function isValidResponse(kind: MomentKind, response: MomentResponse): boolean {
  return COPY[kind].options.some((option) => option.response === response);
}
