import type {
  ArchetypeKey,
  PsychologyValues,
  SkillValues,
  SoundProfileValues,
} from "@music-rpg/shared";

/**
 * Archetypes describe identity. They are not classes: nothing in the
 * simulation reads an archetype to gate an action, and an artist's archetype is
 * expected to drift as their catalogue and choices accumulate.
 *
 * Sound axis polarity (used by every bias below):
 *   darkBright            -1 dark        → +1 bright
 *   rawPolished           -1 raw         → +1 polished
 *   minimalDense          -1 minimal     → +1 dense
 *   organicElectronic     -1 organic     → +1 electronic
 *   classicFuturistic     -1 classic     → +1 futuristic
 *   accessibleExperimental-1 accessible  → +1 experimental
 *   melodicRhythmic       -1 melodic     → +1 rhythmic
 *   intimateAnthemic      -1 intimate    → +1 anthemic
 */
export type ArchetypeDefinition = {
  key: ArchetypeKey;
  /** Display name shown on the reveal screen. */
  name: string;
  tagline: string;
  description: string;
  soundBias: Partial<SoundProfileValues>;
  skillBias: Partial<SkillValues>;
  psychologyBias: Partial<PsychologyValues>;
};

export const archetypeCatalogue: ArchetypeDefinition[] = [
  {
    key: "THE_ARCHITECT",
    name: "The Architect",
    tagline: "Structure is the statement.",
    description:
      "Builds songs like rooms. Cares about space, sequence and what gets left out. The kind of artist people study rather than sing along to — at first.",
    soundBias: {
      minimalDense: -0.45,
      accessibleExperimental: 0.4,
      classicFuturistic: 0.3,
      darkBright: -0.3,
    },
    skillBias: { production: 8, experimentation: 8, versatility: 3 },
    psychologyBias: { discipline: 10, patience: 8, ego: -4 },
  },
  {
    key: "THE_PERFORMER",
    name: "The Performer",
    tagline: "The room is the instrument.",
    description:
      "Built for the moment the lights come up. Songs are written backwards from what a crowd will do with them.",
    soundBias: { intimateAnthemic: 0.55, darkBright: 0.25, melodicRhythmic: 0.2 },
    skillBias: { performance: 10, flow: 5, melody: 3 },
    psychologyBias: { confidence: 12, ego: 6, resilience: 4 },
  },
  {
    key: "THE_STORYTELLER",
    name: "The Storyteller",
    tagline: "Every verse is somebody's life.",
    description:
      "Detail over decibels. Writes scenes rather than slogans, and trusts the listener to stay for the ending.",
    soundBias: { intimateAnthemic: -0.5, rawPolished: -0.2, melodicRhythmic: -0.15 },
    skillBias: { storytelling: 11, lyricism: 8, melody: 2 },
    psychologyBias: { patience: 10, discipline: 6, ego: -6 },
  },
  {
    key: "THE_DISRUPTOR",
    name: "The Disruptor",
    tagline: "Comfort is the enemy.",
    description:
      "Arrives to break the format. Thrives on friction, and treats a hostile room as raw material.",
    soundBias: {
      accessibleExperimental: 0.6,
      rawPolished: -0.4,
      darkBright: -0.3,
      minimalDense: 0.2,
    },
    skillBias: { experimentation: 10, battleIQ: 7, production: 3 },
    psychologyBias: { riskTolerance: 14, competitiveness: 8, patience: -6 },
  },
  {
    key: "THE_HITMAKER",
    name: "The Hitmaker",
    tagline: "The hook arrives before the idea.",
    description:
      "Instinct for the part people repeat. Structure, melody and timing tuned to how music actually travels.",
    soundBias: {
      accessibleExperimental: -0.55,
      rawPolished: 0.45,
      darkBright: 0.3,
      intimateAnthemic: 0.35,
    },
    skillBias: { melody: 10, production: 5, versatility: 5 },
    psychologyBias: { ambition: 10, adaptability: 6, patience: -3 },
  },
  {
    key: "THE_PURIST",
    name: "The Purist",
    tagline: "Do it properly or don't.",
    description:
      "Loyal to the craft and its lineage. Slower to release, harder to move, and respected by people who know.",
    soundBias: {
      classicFuturistic: -0.55,
      organicElectronic: -0.45,
      rawPolished: -0.25,
      accessibleExperimental: 0.15,
    },
    skillBias: { lyricism: 9, flow: 7, battleIQ: 4 },
    psychologyBias: { discipline: 12, ego: 5, adaptability: -8 },
  },
  {
    key: "THE_CHAMELEON",
    name: "The Chameleon",
    tagline: "Whatever the song needs.",
    description:
      "Moves between rooms and registers without losing the thread. Hard to categorise, hard to corner.",
    soundBias: { melodicRhythmic: 0.1, rawPolished: 0.15 },
    skillBias: { versatility: 12, melody: 5, flow: 5 },
    psychologyBias: { adaptability: 14, patience: 4, ego: -4 },
  },
  {
    key: "THE_VISIONARY",
    name: "The Visionary",
    tagline: "Building the version that doesn't exist yet.",
    description:
      "Works from a picture of a world nobody else can see. Early records make sense later, usually to everyone at once.",
    soundBias: {
      classicFuturistic: 0.6,
      organicElectronic: 0.45,
      accessibleExperimental: 0.35,
      intimateAnthemic: 0.2,
    },
    skillBias: { experimentation: 9, production: 7, storytelling: 3 },
    psychologyBias: { ambition: 12, riskTolerance: 8, confidence: 5 },
  },
];

export const archetypeByKey: Record<ArchetypeKey, ArchetypeDefinition> = Object.fromEntries(
  archetypeCatalogue.map((archetype) => [archetype.key, archetype]),
) as Record<ArchetypeKey, ArchetypeDefinition>;
