import {
  BATTLE_INTERACTION_KINDS,
  EMPTY_RELATIONSHIP,
  RELATIONSHIP_DIMENSIONS,
  clamp,
  roundTo,
  type InteractionKind,
  type RelationshipInteraction,
  type RelationshipKind,
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
  LOYALTY_AVOIDED_THEM,
  LOYALTY_JOINED_CREW,
  LOYALTY_LEFT_CREW,
  LOYALTY_PER_FINISHED_RECORD,
  LOYALTY_PER_RECHOSEN,
  REFUSAL_UNRESOLVED_FACTOR,
  RESPECT_DECLINED_CREW,
  RESPECT_STOOD_GROUND,
  RESPECT_TALKED_IT_THROUGH,
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
  TENSION_AVOIDED_THEM,
  TENSION_DECLINED_CREW,
  TENSION_IDEAS_REFUSED,
  TENSION_LEFT_CREW,
  TENSION_STOOD_GROUND,
  TENSION_TALKED_IT_THROUGH,
  TENSION_REFUSED_WHILE_PUSHING_BACK,
  TENSION_REVISION_ASKED,
  TENSION_SETTLED_BY_RECEPTION,
  TENSION_SETTLED_BY_RELEASE,
  TENSION_WORK_ABANDONED,
  TRUST_CHOSEN,
  TRUST_DIRECTION_GIVEN,
  TRUST_IDEAS_REFUSED,
  TRUST_IDEA_TAKEN,
  TRUST_AVOIDED_THEM,
  TRUST_JOINED_CREW,
  TRUST_STOOD_GROUND,
  TRUST_TALKED_IT_THROUGH,
  TRUST_WORK_ABANDONED,
  TRUST_WORK_KEPT,
  TRUST_WORK_MASTERED,
  TRUST_WORK_RELEASED,
  FAMILIARITY_CHALLENGE,
  RESPECT_BATTLE_LOST,
  RESPECT_BATTLE_WON,
  RESPECT_CHALLENGE_ACCEPTED,
  RESPECT_CLOSE_CONTEST,
  RESPECT_CRAFT_ACKNOWLEDGED,
  RIVALRY_BATTLE_LOST,
  RIVALRY_BATTLE_WON,
  RIVALRY_CHALLENGE_ACCEPTED,
  RIVALRY_CHALLENGE_ISSUED,
  RIVALRY_CLOSE_CONTEST,
  RIVALRY_DECISIVE_CONTEST,
  TENSION_CHALLENGE_DECLINED,
  TENSION_DECISIVE_CONTEST,
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

    /*
     * Answers to a moment. The moment itself moved nothing — it was an
     * invitation — so all of its weight lands here, on what was actually done
     * about it.
     */
    case "TALKED_IT_THROUGH":
      return {
        ...base,
        tension: TENSION_TALKED_IT_THROUGH,
        trust: TRUST_TALKED_IT_THROUGH,
        respect: RESPECT_TALKED_IT_THROUGH,
      };

    case "STOOD_GROUND":
      return {
        ...base,
        respect: RESPECT_STOOD_GROUND,
        tension: TENSION_STOOD_GROUND,
        trust: TRUST_STOOD_GROUND,
      };

    case "AVOIDED_THEM":
      return {
        ...base,
        trust: TRUST_AVOIDED_THEM,
        tension: TENSION_AVOIDED_THEM,
        loyalty: LOYALTY_AVOIDED_THEM,
      };

    /*
     * --- Competition. M8's, and the first things that move rivalry. ---------
     *
     * Semantic, like everything else here. There is no formula of the shape
     * `rivalry = margin × multiplier` anywhere: a battle produced named things
     * that happened, and these price them one at a time.
     */

    /** Somebody decided you were worth measuring themselves against. */
    case "CHALLENGE_ISSUED":
      return {
        familiarity: FAMILIARITY_CHALLENGE,
        rivalry: RIVALRY_CHALLENGE_ISSUED,
      };

    case "CHALLENGE_ACCEPTED":
      return {
        familiarity: FAMILIARITY_CHALLENGE,
        rivalry: RIVALRY_CHALLENGE_ACCEPTED,
        respect: RESPECT_CHALLENGE_ACCEPTED,
      };

    /*
     * Refusing.
     *
     * Tension, because it is unresolved between the two of you now, and
     * familiarity, because it happened. **No respect term, in either
     * direction.** Declining is not losing and it is not cowardice; an artist
     * who does not battle is an artist who does not battle, and a model that
     * quietly docked them for it would have decided that on the player's behalf.
     */
    case "CHALLENGE_DECLINED":
      return {
        familiarity: FAMILIARITY_CHALLENGE,
        tension: TENSION_CHALLENGE_DECLINED,
      };

    case "BATTLE_WON":
      return {
        ...base,
        rivalry: RIVALRY_BATTLE_WON,
        respect: RESPECT_BATTLE_WON,
      };

    /* Losing still moves rivalry — there is unfinished business either way. */
    case "BATTLE_LOST":
      return {
        ...base,
        rivalry: RIVALRY_BATTLE_LOST,
        respect: RESPECT_BATTLE_LOST,
      };

    case "CLOSE_CONTEST":
      return {
        rivalry: RIVALRY_CLOSE_CONTEST,
        respect: RESPECT_CLOSE_CONTEST,
      };

    case "DECISIVE_CONTEST":
      return {
        rivalry: RIVALRY_DECISIVE_CONTEST,
        tension: TENSION_DECISIVE_CONTEST,
      };

    /* The Technical judge went their way whatever the panel decided overall. */
    case "CRAFT_ACKNOWLEDGED":
      return { respect: RESPECT_CRAFT_ACKNOWLEDGED };

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

/* --- What the relationship is *for* ---------------------------------------- */

const COMPETITIVE_KINDS = new Set<string>(BATTLE_INTERACTION_KINDS);

/**
 * Interactions that only happen because two people made something together.
 *
 * Crew and moment answers are deliberately absent: joining a crew or talking
 * something through can happen with a rival as easily as with a collaborator,
 * and neither is evidence of having been in a room making a record.
 */
const COLLABORATIVE_KINDS = new Set<InteractionKind>([
  "CHOSEN",
  "DIRECTION_GIVEN",
  "IDEAS_REFUSED",
  "IDEA_TAKEN",
  "IDEAS_COMBINED",
  "REVISION_ASKED",
  "WORK_MASTERED",
  "WORK_KEPT",
  "WORK_RELEASED",
  "WORK_RECEIVED",
  "WORK_ABANDONED",
]);

/**
 * What this relationship currently *is*, given everything that has passed
 * between two people.
 *
 * M6 declared `RIVAL` and never assigned it: the fold hardcoded
 * `CREATIVE_PARTNER` for everybody, so anything set elsewhere was overwritten on
 * the next day advance and rivalry could never become durable. This is the
 * correction, and it completes M6's own vocabulary rather than introducing a
 * second owner of it.
 *
 * ## Kind is the dominant *current* relation, never a verdict on the history
 *
 * The important property, and the reason this is a projection over history rather
 * than a latch. Two artists who battle and then make a record together are both
 * things, and nothing here erases either:
 *
 * - The **dimensions** accumulate independently and permanently. A battle raises
 *   `rivalry`; a session raises `creativeChemistry`; neither subtracts the other,
 *   and `interaction_count` and the event log keep both histories whatever this
 *   function returns.
 * - The **kind** is only a label for which of those is currently dominant, and it
 *   is free to change back. A rival who becomes a frequent collaborator reads as
 *   a creative partner again, with the rivalry still on the row and still true.
 *
 * So this can never destroy evidence. It answers "what are these two to each
 * other right now", and the row underneath it answers "what have they been".
 */
export function relationshipKindFor(input: {
  /** Every interaction kind that has ever passed between them. */
  history: InteractionKind[];
  /** The state after folding. Read only to break a tie between two truths. */
  state: RelationshipState;
  /** What the relationship was already recorded as, where it was recorded. */
  current?: RelationshipKind | null;
}): RelationshipKind {
  /*
   * History means "has this ever happened", and the accumulated state is part of
   * the answer. The fold only ever sees interactions *since its watermark*, so
   * asking the row is what stops a career whose battle was last week from
   * forgetting it was ever competitive. Both dimensions have exactly one source
   * each — only battles move `rivalry`, only sessions move `creativeChemistry` —
   * which is what makes reading them back a fact rather than a guess.
   */
  const competitive =
    input.history.some((kind) => COMPETITIVE_KINDS.has(kind)) || input.state.rivalry > 0;
  const collaborative =
    input.history.some((kind) => COLLABORATIVE_KINDS.has(kind)) ||
    input.state.creativeChemistry > 0;

  /*
   * Bandmates are the group's business and are assigned where a line-up is
   * decided, not derived from interactions. Left exactly as it was found.
   */
  if (input.current === "BANDMATE") return "BANDMATE";

  // No competition: M6's behaviour, unchanged. This is the overwhelming majority.
  if (!competitive) return collaborative || input.history.length > 0 ? "CREATIVE_PARTNER" : "CONTACT";

  // Competition and nothing else. Straightforwardly a rival.
  if (!collaborative) return "RIVAL";

  /*
   * Both, which is the interesting case and the one a label cannot do justice to.
   * Whichever is currently larger wins the *name*; both remain on the row, and a
   * later record together flips it back without anything being lost.
   */
  return input.state.rivalry > input.state.creativeChemistry ? "RIVAL" : "CREATIVE_PARTNER";
}
