import {
  ARCHETYPES,
  PSYCHOLOGY_KEYS,
  SKILL_KEYS,
  SOUND_DIMENSIONS,
  clampAxis,
  clampStat,
  gameConfig,
  type ArchetypeKey,
  type DiscoveryQuestion,
  type DiscoveryResponses,
  type PsychologyValues,
  type SkillValues,
  type SoundProfileValues,
  type TraitKey,
} from "@music-rpg/shared";
import { archetypeByKey } from "../content/archetypes";
import { describeSound } from "../describe";
import { selectArchetype } from "./archetype";

/**
 * Deterministic Sound Discovery inference.
 *
 * Given the same answers this always produces the same artist — no randomness,
 * no model call, no network. An AI interpretation layer is expected to *augment*
 * this later (richer philosophy copy, nuanced archetype naming), which is why
 * the output carries provenance and the engine is versioned; the simulation
 * still owns the canonical numbers.
 */

export const INFERENCE_VERSION = 1;

/** Signature trait per archetype, nudged in when the archetype is chosen. */
const ARCHETYPE_SIGNATURE_TRAIT: Record<ArchetypeKey, TraitKey> = {
  THE_ARCHITECT: "PERFECTIONIST",
  THE_PERFORMER: "SHOWMAN",
  THE_STORYTELLER: "CRATE_DIGGER",
  THE_DISRUPTOR: "HEADSTRONG",
  THE_HITMAKER: "HITMAKER",
  THE_PURIST: "WORKHORSE",
  THE_CHAMELEON: "CHAMELEON",
  THE_VISIONARY: "VISIONARY",
};

const SKILL_BASELINE = 18;
const PSYCHOLOGY_BASELINE = 50;
/** Controls how quickly stacked answers saturate a sound axis. */
const SOUND_SATURATION = 1.6;

export type InferredTrait = { key: TraitKey; strength: number; score: number };

export type InferredIdentity = {
  version: number;
  sound: SoundProfileValues;
  soundSummary: string;
  skills: SkillValues;
  psychology: PsychologyValues;
  archetype: ArchetypeKey;
  archetypeScores: Record<ArchetypeKey, number>;
  traits: InferredTrait[];
  /** Verbatim free-text answer, if the player gave one. */
  creativePhilosophy: string | null;
  /** Provenance for `sound_profiles.derived_from` and world-control. */
  provenance: {
    version: number;
    questionVersion: number;
    answered: Record<string, string>;
  };
};

export type InferIdentityInput = {
  questions: DiscoveryQuestion[];
  responses: DiscoveryResponses;
};

/**
 * Compresses an unbounded weight sum into [-1, 1] without hard clipping, so a
 * player who answers consistently lands near a pole but never exactly on it.
 */
function saturate(sum: number): number {
  return clampAxis(sum / (1 + Math.abs(sum) / SOUND_SATURATION));
}

function emptySound(): SoundProfileValues {
  return Object.fromEntries(SOUND_DIMENSIONS.map((axis) => [axis, 0])) as SoundProfileValues;
}

function emptySkills(): SkillValues {
  return Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as SkillValues;
}

function emptyPsychology(): PsychologyValues {
  return Object.fromEntries(PSYCHOLOGY_KEYS.map((key) => [key, 0])) as PsychologyValues;
}

export function inferIdentity({ questions, responses }: InferIdentityInput): InferredIdentity {
  const soundSums = emptySound();
  const skillSums = emptySkills();
  const psychologySums = emptyPsychology();
  const archetypeScores = Object.fromEntries(ARCHETYPES.map((key) => [key, 0])) as Record<
    ArchetypeKey,
    number
  >;
  const traitScores = new Map<TraitKey, number>();
  const answered: Record<string, string> = {};

  let creativePhilosophy: string | null = null;
  let questionVersion = 1;

  for (const question of [...questions].sort((a, b) => a.orderIndex - b.orderIndex)) {
    questionVersion = question.version;
    const response = responses[question.id];
    if (typeof response !== "string" || response.length === 0) continue;

    if (question.kind === "FREE_TEXT") {
      const text = response.trim().slice(0, gameConfig.identity.maxFreeTextLength);
      if (text.length > 0) {
        creativePhilosophy = text;
        answered[question.id] = text;
      }
      continue;
    }

    const option = question.options.find((candidate) => candidate.id === response);
    // An answer that no longer matches a seeded option (question reworded, save
    // from an older version) is ignored rather than crashing the reveal.
    if (!option) continue;

    answered[question.id] = option.id;

    for (const axis of SOUND_DIMENSIONS) {
      soundSums[axis] += option.weights.sound?.[axis] ?? 0;
    }
    for (const key of SKILL_KEYS) {
      skillSums[key] += option.weights.skills?.[key] ?? 0;
    }
    for (const key of PSYCHOLOGY_KEYS) {
      psychologySums[key] += option.weights.psychology?.[key] ?? 0;
    }
    for (const [key, value] of Object.entries(option.weights.archetypes ?? {})) {
      const archetype = key as ArchetypeKey;
      if (archetype in archetypeScores) archetypeScores[archetype] += value ?? 0;
    }
    for (const [key, value] of Object.entries(option.weights.traits ?? {})) {
      const trait = key as TraitKey;
      traitScores.set(trait, (traitScores.get(trait) ?? 0) + (value ?? 0));
    }
  }

  const sound = emptySound();
  for (const axis of SOUND_DIMENSIONS) {
    sound[axis] = saturate(soundSums[axis]);
  }

  // Archetype: direct evidence from answers, plus how closely the resulting
  // Sound DNA already resembles each archetype's bias.
  const archetype = selectArchetype(sound, archetypeScores);
  const archetypeDefinition = archetypeByKey[archetype];

  const skills = emptySkills();
  for (const key of SKILL_KEYS) {
    const biased = SKILL_BASELINE + skillSums[key] + (archetypeDefinition.skillBias[key] ?? 0) * 0.5;
    skills[key] = clampStat(
      Math.min(gameConfig.artist.maxStartingSkill, Math.max(gameConfig.artist.minStartingSkill, biased)),
    );
  }

  const psychology = emptyPsychology();
  for (const key of PSYCHOLOGY_KEYS) {
    const biased =
      PSYCHOLOGY_BASELINE + psychologySums[key] + (archetypeDefinition.psychologyBias[key] ?? 0) * 0.4;
    psychology[key] = clampStat(Math.min(92, Math.max(10, biased)));
  }

  // Traits: answer evidence, reinforced by the shape of the resulting artist.
  const derivedSignals: [TraitKey, number][] = [
    ["WORKHORSE", psychology.discipline >= 70 ? 2 : 0],
    ["BATTLE_BORN", psychology.competitiveness >= 70 ? 2 : 0],
    ["CHAMELEON", psychology.adaptability >= 70 ? 2 : 0],
    ["HEADSTRONG", psychology.ego >= 70 ? 1.5 : 0],
    ["PERFECTIONIST", sound.rawPolished >= 0.45 ? 1.5 : 0],
    ["VISIONARY", sound.accessibleExperimental >= 0.45 ? 2 : 0],
    ["CRATE_DIGGER", sound.classicFuturistic <= -0.45 ? 1.5 : 0],
    ["SHOWMAN", sound.intimateAnthemic >= 0.45 ? 1.5 : 0],
    ["HITMAKER", skills.melody >= 45 ? 1 : 0],
    [ARCHETYPE_SIGNATURE_TRAIT[archetype], 1.5],
  ];

  for (const [trait, bonus] of derivedSignals) {
    if (bonus > 0) traitScores.set(trait, (traitScores.get(trait) ?? 0) + bonus);
  }

  const traits: InferredTrait[] = [...traitScores.entries()]
    .filter(([, score]) => score >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, gameConfig.artist.maxStartingTraits)
    .map(([key, score]) => ({ key, score, strength: clampStat(45 + score * 7) }));

  return {
    version: INFERENCE_VERSION,
    sound,
    soundSummary: describeSound(sound),
    skills,
    psychology,
    archetype,
    archetypeScores,
    traits,
    creativePhilosophy,
    provenance: {
      version: INFERENCE_VERSION,
      questionVersion,
      answered,
    },
  };
}
