import {
  EMPTY_RELATIONSHIP,
  RELATIONSHIP_DIMENSIONS,
  clamp,
  roundTo,
  type RelationshipInteraction,
  type RelationshipState,
} from "@music-rpg/shared";
import {
  CHEMISTRY_IDEAS_COMBINED,
  CHEMISTRY_IDEA_TAKEN,
  CHEMISTRY_PER_RECEPTION,
  CHEMISTRY_RESOLVED_REVISION,
  CHEMISTRY_STANCE,
  CHEMISTRY_WORK_MASTERED,
  FAMILIARITY_JOINED_CREW,
  FAMILIARITY_PER_FINISHED_RECORD,
  FAMILIARITY_PER_INTERACTION,
  LOYALTY_JOINED_CREW,
  LOYALTY_LEFT_CREW,
  LOYALTY_PER_FINISHED_RECORD,
  LOYALTY_PER_RECHOSEN,
  REFUSAL_UNRESOLVED_FACTOR,
  RESPECT_DECLINED_CREW,
  RELATIONSHIP_CEILING,
  RELATIONSHIP_FLOOR,
  RESPECT_IDEAS_COMBINED,
  RESPECT_IDEAS_REFUSED,
  RESPECT_IDEA_TAKEN,
  RESPECT_DIRECTION_GIVEN,
  RESPECT_PER_RECEPTION,
  RESPECT_REVISION_ASKED,
  RESPECT_WORK_MASTERED,
  RESPECT_WORK_RELEASED,
  TENSION_DECLINED_CREW,
  TENSION_IDEAS_REFUSED,
  TENSION_LEFT_CREW,
  TENSION_REFUSED_WHILE_PUSHING_BACK,
  TENSION_REVISION_ASKED,
  TENSION_SETTLED_BY_RECEPTION,
  TENSION_SETTLED_BY_RELEASE,
  TENSION_WORK_ABANDONED,
  TRUST_CHOSEN,
  TRUST_DIRECTION_GIVEN,
  TRUST_IDEAS_REFUSED,
  TRUST_IDEA_TAKEN,
  TRUST_JOINED_CREW,
  TRUST_WORK_ABANDONED,
  TRUST_WORK_KEPT,
  TRUST_WORK_MASTERED,
  TRUST_WORK_RELEASED,
} from "./constants";

/**
 * Folding a shared history into what two people make of each other.
 *
 * Pure, deterministic, and additive over interactions in order — which is what
 * lets the same function reconstruct a career that predates the milestone and
 * then, afterwards, consume only what is new. There is no separate "catch up"
 * path to drift out of step with the live one.
 *
 * Every delta is attributable to one recorded interaction. Nothing here awards
 * points for existing, and nothing reads a relationship to decide what it
 * should be.
 */

export type RelationshipDelta = Partial<RelationshipState>;

export type DerivationOutcome = {
  state: RelationshipState;
  /** What each interaction did, in order. This is the explanation. */
  steps: { kind: string; sequence: number; delta: RelationshipDelta }[];
  interactionCount: number;
};

function add(state: RelationshipState, delta: RelationshipDelta): RelationshipState {
  const next = { ...state };
  for (const dimension of RELATIONSHIP_DIMENSIONS) {
    const change = delta[dimension];
    if (change === undefined) continue;
    next[dimension] = clamp(
      next[dimension] + change,
      RELATIONSHIP_FLOOR,
      RELATIONSHIP_CEILING,
    );
  }
  return next;
}

/**
 * What one interaction is worth, given what the session eventually became.
 *
 * The second argument is why refusal is not simply damage: whether the work was
 * finished changes what refusing it meant. Demanding better and delivering is a
 * different act from demanding better and walking away, and only the ending
 * tells you which one happened.
 */
function deltaFor(
  interaction: RelationshipInteraction,
  context: { resolved: boolean; rechosen: boolean },
): RelationshipDelta {
  const base: RelationshipDelta = { familiarity: FAMILIARITY_PER_INTERACTION };

  switch (interaction.kind) {
    case "CHOSEN":
      return {
        ...base,
        trust: TRUST_CHOSEN,
        ...(context.rechosen ? { loyalty: LOYALTY_PER_RECHOSEN } : {}),
      };

    case "DIRECTION_GIVEN":
      return { ...base, trust: TRUST_DIRECTION_GIVEN, respect: RESPECT_DIRECTION_GIVEN };

    /*
     * Refusing the whole set. Costs almost no trust — the session carried on —
     * raises tension sharply, and earns respect only if the work was seen
     * through. Refusing somebody who was already pushing back lands harder.
     */
    case "IDEAS_REFUSED":
      return {
        ...base,
        trust: TRUST_IDEAS_REFUSED,
        tension:
          TENSION_IDEAS_REFUSED +
          (interaction.stance === "PUSHING_BACK" ? TENSION_REFUSED_WHILE_PUSHING_BACK : 0),
        respect: context.resolved
          ? RESPECT_IDEAS_REFUSED
          : RESPECT_IDEAS_REFUSED * REFUSAL_UNRESOLVED_FACTOR,
      };

    case "IDEA_TAKEN":
      return {
        ...base,
        trust: TRUST_IDEA_TAKEN,
        respect: RESPECT_IDEA_TAKEN,
        creativeChemistry:
          CHEMISTRY_IDEA_TAKEN + (CHEMISTRY_STANCE[interaction.stance ?? ""] ?? 0),
      };

    case "IDEAS_COMBINED":
      return {
        ...base,
        trust: TRUST_IDEA_TAKEN,
        respect: RESPECT_IDEAS_COMBINED,
        creativeChemistry: CHEMISTRY_IDEAS_COMBINED,
      };

    /*
     * Sending it back. Tension either way; chemistry and respect only when the
     * pass actually produced something — two people converging rather than one
     * of them being difficult.
     */
    case "REVISION_ASKED":
      return {
        ...base,
        tension: TENSION_REVISION_ASKED,
        respect: context.resolved
          ? RESPECT_REVISION_ASKED
          : RESPECT_REVISION_ASKED * REFUSAL_UNRESOLVED_FACTOR,
        creativeChemistry: context.resolved ? CHEMISTRY_RESOLVED_REVISION : 0,
      };

    case "WORK_MASTERED":
      return {
        ...base,
        trust: TRUST_WORK_MASTERED,
        respect: RESPECT_WORK_MASTERED,
        creativeChemistry: CHEMISTRY_WORK_MASTERED,
        familiarity: FAMILIARITY_PER_INTERACTION + FAMILIARITY_PER_FINISHED_RECORD,
        loyalty: LOYALTY_PER_FINISHED_RECORD,
      };

    case "WORK_KEPT":
      return { ...base, trust: TRUST_WORK_KEPT };

    case "WORK_RELEASED":
      return {
        ...base,
        trust: TRUST_WORK_RELEASED,
        respect: RESPECT_WORK_RELEASED,
        tension: TENSION_SETTLED_BY_RELEASE,
      };

    /* How it landed. The one place the world's opinion enters the room. */
    case "WORK_RECEIVED": {
      const strength = clamp(interaction.receptionStrength ?? 0, 0, 1);
      return {
        ...base,
        respect: RESPECT_PER_RECEPTION * strength,
        creativeChemistry: CHEMISTRY_PER_RECEPTION * strength,
        tension: TENSION_SETTLED_BY_RECEPTION * strength,
      };
    }

    case "WORK_ABANDONED":
      return { ...base, trust: TRUST_WORK_ABANDONED, tension: TENSION_WORK_ABANDONED };

    /*
     * Crew. Explicitly asked for and explicitly agreed to, which is why it is
     * allowed to move loyalty in a way no amount of good sessions can.
     */
    case "JOINED_CREW":
      return {
        familiarity: FAMILIARITY_PER_INTERACTION + FAMILIARITY_JOINED_CREW,
        loyalty: LOYALTY_JOINED_CREW,
        trust: TRUST_JOINED_CREW,
      };

    case "DECLINED_CREW":
      return { ...base, tension: TENSION_DECLINED_CREW, respect: RESPECT_DECLINED_CREW };

    case "LEFT_CREW":
      return { ...base, loyalty: LOYALTY_LEFT_CREW, tension: TENSION_LEFT_CREW };

    default:
      return base;
  }
}

export type DeriveInput = {
  /** Where to start from. Empty for a first derivation. */
  from?: RelationshipState;
  /** In canonical order. Only interactions not already folded in. */
  interactions: RelationshipInteraction[];
  /** Whether the work these interactions belong to was finished. */
  resolved: boolean;
  /** True when this career had already worked with them before. */
  rechosen?: boolean;
};

export function deriveRelationship(input: DeriveInput): DerivationOutcome {
  const ordered = [...input.interactions].sort((a, b) => a.sequence - b.sequence);

  let state = input.from ? { ...input.from } : { ...EMPTY_RELATIONSHIP };
  const steps: DerivationOutcome["steps"] = [];

  for (const interaction of ordered) {
    const delta = deltaFor(interaction, {
      resolved: input.resolved,
      rechosen: input.rechosen ?? false,
    });
    state = add(state, delta);
    steps.push({ kind: interaction.kind, sequence: interaction.sequence, delta });
  }

  for (const dimension of RELATIONSHIP_DIMENSIONS) {
    state[dimension] = roundTo(state[dimension], 4);
  }

  return { state, steps, interactionCount: ordered.length };
}
