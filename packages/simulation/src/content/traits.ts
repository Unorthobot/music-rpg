import type { TraitKey } from "@music-rpg/shared";

/**
 * Trait catalogue.
 *
 * Traits are inferred, never handed out wholesale: a new artist starts with at
 * most three, drawn from what their Sound Discovery answers actually implied.
 */
export type TraitDefinition = {
  key: TraitKey;
  name: string;
  description: string;
  /** Grouping for the reveal screen and later trait UI. */
  category: "CRAFT" | "TEMPERAMENT" | "PRESENCE";
};

export const traitCatalogue: TraitDefinition[] = [
  {
    key: "PERFECTIONIST",
    name: "Perfectionist",
    description: "Nothing leaves the room early. Quality rises; output slows.",
    category: "TEMPERAMENT",
  },
  {
    key: "BATTLE_BORN",
    name: "Battle Born",
    description: "Sharper under direct pressure. Confrontation is a creative input.",
    category: "PRESENCE",
  },
  {
    key: "CHAMELEON",
    name: "Chameleon",
    description: "Adapts to unfamiliar rooms and registers without losing identity.",
    category: "CRAFT",
  },
  {
    key: "HEADSTRONG",
    name: "Headstrong",
    description: "Holds the vision against advice — for better and for worse.",
    category: "TEMPERAMENT",
  },
  {
    key: "HITMAKER",
    name: "Hitmaker",
    description: "Instinct for the part people repeat without deciding to.",
    category: "CRAFT",
  },
  {
    key: "CRATE_DIGGER",
    name: "Crate Digger",
    description: "Finds the source. Depth of reference feeds the work.",
    category: "CRAFT",
  },
  {
    key: "SHOWMAN",
    name: "Showman",
    description: "Owns a room physically. Live rooms convert to belief faster.",
    category: "PRESENCE",
  },
  {
    key: "WORKHORSE",
    name: "Workhorse",
    description: "Shows up regardless. Volume compounds over an act.",
    category: "TEMPERAMENT",
  },
  {
    key: "VISIONARY",
    name: "Visionary",
    description: "Sees the finished thing before it exists, and works backwards.",
    category: "PRESENCE",
  },
];

export const traitByKey: Record<TraitKey, TraitDefinition> = Object.fromEntries(
  traitCatalogue.map((trait) => [trait.key, trait]),
) as Record<TraitKey, TraitDefinition>;
