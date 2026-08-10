import {
  PSYCHOLOGY_KEYS,
  SKILL_KEYS,
  SOUND_DIMENSIONS,
  clampAxis,
  clampStat,
  gameConfig,
  type ArchetypeKey,
  type GroupRole,
  type PsychologyValues,
  type SkillValues,
  type SoundProfileValues,
  type TraitKey,
} from "@music-rpg/shared";
import {
  memberPersonalities,
  memberRoleByKey,
  memberTendencies,
  visualIdentities,
} from "../content/members";
import { describeSound } from "../describe";
import { selectArchetype } from "./archetype";

/**
 * Deterministic inference for a player-authored bandmate.
 *
 * Four choices in, a whole person out — same rules as the player's own
 * discovery: no randomness, no model, and the numbers stay hidden from the
 * player, who only ever sees what they chose plus qualitative descriptions.
 *
 * Authored members are held to the same starting band as the player's artist:
 * writing a bandmate must never be a way to start with a better musician than
 * you could be.
 */
export const MEMBER_INFERENCE_VERSION = 1;

export type MemberAuthoringChoices = {
  role: GroupRole;
  tendencyId: string;
  personalityId: string;
  visualId?: string | null;
};

export type InferredMember = {
  version: number;
  role: GroupRole;
  sound: SoundProfileValues;
  soundSummary: string;
  skills: SkillValues;
  psychology: PsychologyValues;
  archetype: ArchetypeKey;
  traits: TraitKey[];
  visual: { id: string; label: string; palette: string[] } | null;
  provenance: Record<string, unknown>;
};

const SKILL_BASELINE = 22;
const PSYCHOLOGY_BASELINE = 50;
const SOUND_SATURATION = 1.6;

const ROLE_EVIDENCE: Record<GroupRole, Partial<Record<ArchetypeKey, number>>> = {
  LEAD_MC: { THE_PERFORMER: 1.5, THE_PURIST: 0.5 },
  MC: { THE_STORYTELLER: 1.5 },
  SINGER: { THE_HITMAKER: 1.5 },
  PRODUCER: { THE_ARCHITECT: 2 },
  DJ: { THE_CHAMELEON: 1.5, THE_PERFORMER: 0.5 },
  MULTI_ROLE: { THE_CHAMELEON: 1 },
};

const PERSONALITY_EVIDENCE: Record<string, Partial<Record<ArchetypeKey, number>>> = {
  driven: { THE_HITMAKER: 1 },
  steady: { THE_PURIST: 1 },
  volatile: { THE_DISRUPTOR: 1.5 },
  easy: { THE_CHAMELEON: 1 },
  competitive: { THE_DISRUPTOR: 1 },
};

function saturate(sum: number): number {
  return clampAxis(sum / (1 + Math.abs(sum) / SOUND_SATURATION));
}

/** Validates authoring input against seeded content. */
export function isMemberChoiceValid(choices: MemberAuthoringChoices): boolean {
  return (
    Boolean(memberRoleByKey[choices.role]) &&
    memberTendencies.some((tendency) => tendency.id === choices.tendencyId) &&
    memberPersonalities.some((personality) => personality.id === choices.personalityId)
  );
}

export function inferMemberIdentity(choices: MemberAuthoringChoices): InferredMember {
  const roleProfile = memberRoleByKey[choices.role] ?? memberRoleByKey.MULTI_ROLE;
  const tendency =
    memberTendencies.find((candidate) => candidate.id === choices.tendencyId) ?? memberTendencies[0]!;
  const personality =
    memberPersonalities.find((candidate) => candidate.id === choices.personalityId) ??
    memberPersonalities[0]!;
  const visual = visualIdentities.find((candidate) => candidate.id === choices.visualId) ?? null;

  const sound = Object.fromEntries(
    SOUND_DIMENSIONS.map((axis) => [axis, saturate(tendency.soundBias[axis] ?? 0)]),
  ) as SoundProfileValues;

  const skills = Object.fromEntries(
    SKILL_KEYS.map((key) => [
      key,
      clampStat(
        Math.min(
          gameConfig.artist.maxStartingSkill,
          Math.max(
            gameConfig.artist.minStartingSkill,
            SKILL_BASELINE + (roleProfile.skillBias[key] ?? 0),
          ),
        ),
      ),
    ]),
  ) as SkillValues;

  const psychology = Object.fromEntries(
    PSYCHOLOGY_KEYS.map((key) => [
      key,
      clampStat(Math.min(92, Math.max(10, PSYCHOLOGY_BASELINE + (personality.psychologyBias[key] ?? 0)))),
    ]),
  ) as PsychologyValues;

  // Role and temperament are weak evidence next to how someone actually
  // sounds, so they nudge the archetype rather than deciding it.
  const archetype = selectArchetype(sound, {
    ...ROLE_EVIDENCE[choices.role],
    ...PERSONALITY_EVIDENCE[personality.id],
  });

  const traits = [...new Set([...(tendency.traits ?? []), ...(personality.traits ?? [])])].slice(0, 2);

  return {
    version: MEMBER_INFERENCE_VERSION,
    role: choices.role,
    sound,
    soundSummary: describeSound(sound),
    skills,
    psychology,
    archetype,
    traits,
    visual: visual ? { id: visual.id, label: visual.label, palette: visual.palette } : null,
    provenance: {
      version: MEMBER_INFERENCE_VERSION,
      role: choices.role,
      tendency: tendency.id,
      personality: personality.id,
      visual: visual?.id ?? null,
      authored: true,
    },
  };
}

/** One-line description shown on an authored member's card. */
export function describeAuthoredMember(member: InferredMember): string {
  const tendency = memberTendencies.find(
    (candidate) => candidate.id === member.provenance.tendency,
  );
  return tendency ? `${tendency.label}. ${tendency.detail}` : member.soundSummary;
}
