import {
  PSYCHOLOGY_KEYS,
  SKILL_KEYS,
  SOUND_DIMENSIONS,
  type ArchetypeKey,
  type GroupRole,
  type PsychologyValues,
  type SkillValues,
  type SoundProfileValues,
  type TraitKey,
} from "@music-rpg/shared";

/**
 * Development fixtures for the group member picker.
 *
 * These are ordinary world NPCs — the same `artists` rows as everyone else — so
 * that when procedural generation and NPC simulation arrive, nothing about the
 * group flow has to change. Numbers here are hand-authored and hidden from the
 * player; the picker only ever shows qualitative descriptions.
 */
export type CandidateSeed = {
  slug: string;
  stageName: string;
  origin: string;
  role: GroupRole;
  archetype: ArchetypeKey;
  biography: string;
  /** One-line creative tendency shown on the candidate card. */
  tendency: string;
  traits: TraitKey[];
  sound: Partial<SoundProfileValues>;
  skills: Partial<SkillValues>;
  psychology: Partial<PsychologyValues>;
};

export function expandSound(partial: Partial<SoundProfileValues>): SoundProfileValues {
  return Object.fromEntries(
    SOUND_DIMENSIONS.map((axis) => [axis, partial[axis] ?? 0]),
  ) as SoundProfileValues;
}

export function expandSkills(partial: Partial<SkillValues>, baseline = 35): SkillValues {
  return Object.fromEntries(
    SKILL_KEYS.map((key) => [key, partial[key] ?? baseline]),
  ) as SkillValues;
}

export function expandPsychology(partial: Partial<PsychologyValues>, baseline = 50): PsychologyValues {
  return Object.fromEntries(
    PSYCHOLOGY_KEYS.map((key) => [key, partial[key] ?? baseline]),
  ) as PsychologyValues;
}

export const candidateSeeds: CandidateSeed[] = [
  {
    slug: "vela",
    stageName: "VELA",
    origin: "Braamfontein",
    role: "SINGER",
    archetype: "THE_HITMAKER",
    biography:
      "Sang in three church choirs and one covers band before deciding she'd rather write the thing people cover.",
    tendency: "Prefers polished, melodic music.",
    traits: ["HITMAKER", "PERFECTIONIST"],
    sound: { rawPolished: 0.6, melodicRhythmic: -0.5, darkBright: 0.35, intimateAnthemic: 0.3 },
    skills: { melody: 78, performance: 62, versatility: 55, lyricism: 44, production: 30, battleIQ: 22 },
    psychology: { ambition: 78, discipline: 66, confidence: 62, ego: 52, patience: 45 },
  },
  {
    slug: "tsk",
    stageName: "TSK",
    origin: "Newtown",
    role: "PRODUCER",
    archetype: "THE_ARCHITECT",
    biography:
      "Builds beats like buildings and deletes more than he keeps. Owns the only working tape machine in the scene.",
    tendency: "Builds sparse, structural, electronic beats.",
    traits: ["PERFECTIONIST", "CRATE_DIGGER"],
    sound: { minimalDense: -0.55, organicElectronic: 0.5, darkBright: -0.45, classicFuturistic: 0.35 },
    skills: { production: 82, experimentation: 68, melody: 48, flow: 25, lyricism: 28, performance: 30 },
    psychology: { discipline: 80, patience: 74, ego: 40, ambition: 55, riskTolerance: 45 },
  },
  {
    slug: "noma-b",
    stageName: "NOMA B",
    origin: "Soweto",
    role: "MC",
    archetype: "THE_STORYTELLER",
    biography:
      "Writes people, not punchlines. Keeps a notebook of overheard conversations and has never lost an argument about a verse.",
    tendency: "Writes detailed, intimate, classic-leaning songs.",
    traits: ["CRATE_DIGGER", "WORKHORSE"],
    sound: { intimateAnthemic: -0.55, classicFuturistic: -0.5, organicElectronic: -0.4, rawPolished: -0.2 },
    skills: { storytelling: 80, lyricism: 72, flow: 58, battleIQ: 45, melody: 32, production: 26 },
    psychology: { patience: 72, discipline: 68, resilience: 66, ego: 42, competitiveness: 48 },
  },
  {
    slug: "riot",
    stageName: "RIOT",
    origin: "Alexandra",
    role: "LEAD_MC",
    archetype: "THE_DISRUPTOR",
    biography:
      "Came up in cyphers where losing meant walking home. Treats every stage as a room that needs taking.",
    tendency: "Pushes raw, confrontational, high-energy material.",
    traits: ["BATTLE_BORN", "HEADSTRONG"],
    sound: { rawPolished: -0.6, darkBright: -0.35, melodicRhythmic: 0.45, accessibleExperimental: 0.25 },
    skills: { battleIQ: 84, flow: 74, lyricism: 66, performance: 62, melody: 24, production: 20 },
    psychology: { competitiveness: 86, ego: 74, confidence: 78, patience: 28, adaptability: 38 },
  },
  {
    slug: "kea",
    stageName: "KEA",
    origin: "Maboneng",
    role: "DJ",
    archetype: "THE_CHAMELEON",
    biography:
      "Reads a room in four bars. Has played every venue in the city and remembers what emptied each one.",
    tendency: "Adapts fast; lives between genres.",
    traits: ["CHAMELEON", "SHOWMAN"],
    sound: { organicElectronic: 0.45, melodicRhythmic: 0.4, intimateAnthemic: 0.35, rawPolished: 0.2 },
    skills: { versatility: 78, performance: 70, production: 56, melody: 46, experimentation: 52, lyricism: 22 },
    psychology: { adaptability: 82, confidence: 66, ambition: 58, ego: 44, patience: 56 },
  },
  {
    slug: "sifiso",
    stageName: "SIFISO",
    origin: "Braamfontein",
    role: "MULTI_ROLE",
    archetype: "THE_VISIONARY",
    biography:
      "Plays four instruments badly and one perfectly, and keeps describing records that don't exist yet until someone helps him make one.",
    tendency: "Chases futurist, experimental ideas.",
    traits: ["VISIONARY", "WORKHORSE"],
    sound: { classicFuturistic: 0.6, accessibleExperimental: 0.5, minimalDense: 0.3, organicElectronic: 0.3 },
    skills: { experimentation: 76, production: 64, melody: 58, storytelling: 48, versatility: 60, battleIQ: 26 },
    psychology: { ambition: 74, riskTolerance: 76, discipline: 62, confidence: 54, ego: 48 },
  },
];
