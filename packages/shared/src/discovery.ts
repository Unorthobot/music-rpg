import type {
  ArchetypeKey,
  PsychologyValues,
  SkillValues,
  SoundProfileValues,
  TraitKey,
} from "./enums";

/**
 * Sound Discovery is configuration.
 *
 * These types are shared by the database (where questions are seeded), the
 * inference engine (which reads the weights) and the UI (which renders them),
 * so a question can be added or reweighted without touching screen code.
 */

export type DiscoveryOptionWeights = {
  /** Nudges on Sound DNA axes, each roughly in [-0.5, 0.5]. */
  sound?: Partial<SoundProfileValues>;
  /** Points added to starting skills. */
  skills?: Partial<SkillValues>;
  /** Points added to (or subtracted from) the psychology baseline of 50. */
  psychology?: Partial<PsychologyValues>;
  /** Evidence toward an archetype. */
  archetypes?: Partial<Record<ArchetypeKey, number>>;
  /** Evidence toward a starting trait. */
  traits?: Partial<Record<TraitKey, number>>;
};

export type DiscoveryOption = {
  id: string;
  label: string;
  /**
   * Supporting line. Meaning is always carried by text — never by colour or
   * imagery alone (accessibility requirement for the discovery flow).
   */
  detail?: string;
  weights: DiscoveryOptionWeights;
};

export type DiscoveryQuestionKind = "CHOICE" | "FREE_TEXT";
export type DiscoverySubject = "ARTIST" | "GROUP";
export type DiscoveryAudience = "SOLO" | "GROUP" | "BOTH";

export type DiscoveryQuestion = {
  id: string;
  version: number;
  orderIndex: number;
  prompt: string;
  helpText?: string | null;
  kind: DiscoveryQuestionKind;
  appliesTo: DiscoveryAudience;
  options: DiscoveryOption[];
};

/** questionId -> chosen optionId, or raw text for FREE_TEXT questions. */
export type DiscoveryResponses = Record<string, string>;

export function questionsForAudience(
  questions: DiscoveryQuestion[],
  audience: Exclude<DiscoveryAudience, "BOTH">,
): DiscoveryQuestion[] {
  return questions
    .filter((question) => question.appliesTo === "BOTH" || question.appliesTo === audience)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

/** A discovery run is complete once every CHOICE question has an answer. */
export function isDiscoveryComplete(
  questions: DiscoveryQuestion[],
  responses: DiscoveryResponses,
): boolean {
  return questions
    .filter((question) => question.kind === "CHOICE")
    .every((question) => {
      const answer = responses[question.id];
      return typeof answer === "string" && question.options.some((option) => option.id === answer);
    });
}
