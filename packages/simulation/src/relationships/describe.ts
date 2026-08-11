import {
  RELATIONSHIP_KIND_LABELS,
  type RelationshipDimension,
  type RelationshipKind,
  type RelationshipNote,
  type RelationshipState,
  type RelationshipSummary,
} from "@music-rpg/shared";
import { RELATIONSHIP_BANDS } from "./constants";

/**
 * Turning a relationship into the thing a player actually reads.
 *
 * The same boundary reception holds: the simulation may know tension is 61; the
 * screen says "Growing tension." A number invites optimisation, and a player
 * optimising a producer is no longer having a relationship with one.
 *
 * Deterministic classification, not prose. Same state, same words, always.
 */

/** Which band a value falls in. Ascending; the last floor met wins. */
export function band(value: number): string {
  let label = RELATIONSHIP_BANDS[0]![1];
  for (const [floor, name] of RELATIONSHIP_BANDS) {
    if (value >= floor) label = name;
  }
  return label;
}

/**
 * How each dimension reads at each strength.
 *
 * Tension is phrased as a live thing rather than a fault — "some tension" is a
 * description of a working relationship, not a warning. Familiarity and loyalty
 * are phrased so that being low is a statement about time rather than about
 * whether the collaboration went well, because after one session that is the
 * honest reading.
 */
const PHRASES: Record<RelationshipDimension, Record<string, string | null>> = {
  familiarity: {
    none: null,
    low: "Barely know each other",
    some: "Getting to know each other",
    good: "Familiar",
    strong: "Long history",
    exceptional: "Been through everything together",
  },
  respect: {
    none: null,
    low: "Some respect",
    some: "Growing respect",
    good: "Good respect",
    strong: "Strong respect",
    exceptional: "Deep respect",
  },
  trust: {
    none: null,
    low: "Early trust",
    some: "Growing trust",
    good: "Solid trust",
    strong: "Strong trust",
    exceptional: "Complete trust",
  },
  loyalty: {
    none: null,
    low: "Nothing owed either way",
    some: "Some loyalty",
    good: "Loyal",
    strong: "Would turn things down for you",
    exceptional: "Unshakeable",
  },
  creativeChemistry: {
    none: null,
    low: "Finding a rhythm",
    some: "Some chemistry",
    good: "Good chemistry",
    strong: "High creative chemistry",
    exceptional: "Exceptional chemistry",
  },
  tension: {
    none: null,
    low: "A little friction",
    some: "Some tension",
    good: "Growing tension",
    strong: "Real tension",
    exceptional: "Something has to give",
  },
  rivalry: {
    none: null,
    low: "Aware of each other",
    some: "Measuring themselves against you",
    good: "Competitive",
    strong: "Serious rivalry",
    exceptional: "Out to beat you",
  },
};

/**
 * Which dimensions a role actually reports, most telling first.
 *
 * This is the role-specific projection sitting on the shared framework: a
 * producer is described by the work, a rival by the competition. Neither needs
 * a model of its own.
 */
const REPORTED: Record<RelationshipKind, RelationshipDimension[]> = {
  CREATIVE_PARTNER: ["creativeChemistry", "respect", "tension", "trust", "familiarity", "loyalty"],
  BANDMATE: ["trust", "loyalty", "tension", "creativeChemistry", "respect", "familiarity"],
  RIVAL: ["rivalry", "respect", "tension", "familiarity"],
  CONTACT: ["familiarity", "trust", "respect"],
};

/** How many things are worth saying at once. More than this is a dashboard. */
const MAX_NOTES = 4;

export function describeRelationship(
  kind: RelationshipKind,
  state: RelationshipState,
): RelationshipSummary {
  const notes: RelationshipNote[] = [];

  for (const dimension of REPORTED[kind]) {
    const label = PHRASES[dimension][band(state[dimension])];
    if (label) notes.push({ dimension, label });
  }

  /*
   * Strongest first, but keeping the role's own ordering as the tie-break, so
   * a producer's line opens on the work rather than on how long you have known
   * each other.
   */
  const ordering = REPORTED[kind];
  const ranked = notes
    .sort(
      (a, b) =>
        state[b.dimension] - state[a.dimension] ||
        ordering.indexOf(a.dimension) - ordering.indexOf(b.dimension),
    )
    .slice(0, MAX_NOTES);

  return {
    kind,
    kindLabel: RELATIONSHIP_KIND_LABELS[kind],
    notes: ranked,
    line: ranked.length === 0 ? "You haven't worked together." : `${ranked.map((note) => note.label).join(". ")}.`,
  };
}
