import type {
  GroupRole,
  PsychologyValues,
  SkillValues,
  SoundProfileValues,
  TraitKey,
} from "@music-rpg/shared";

/**
 * Member authoring content.
 *
 * A player creating a bandmate answers four short questions — role, creative
 * tendency, personality, look — and everything else is derived. The point is a
 * person you can picture in twenty seconds, not a second onboarding flow.
 */

export type RoleProfile = {
  role: GroupRole;
  label: string;
  description: string;
  skillBias: Partial<SkillValues>;
};

export const memberRoleProfiles: RoleProfile[] = [
  {
    role: "LEAD_MC",
    label: "Lead MC",
    description: "Carries the verses and the room.",
    skillBias: { lyricism: 26, flow: 24, battleIQ: 20, performance: 16 },
  },
  {
    role: "MC",
    label: "MC",
    description: "Writes and rides the beat alongside you.",
    skillBias: { lyricism: 22, flow: 20, storytelling: 16, battleIQ: 12 },
  },
  {
    role: "SINGER",
    label: "Vocalist",
    description: "Hooks, harmony and the part people remember.",
    skillBias: { melody: 28, performance: 18, versatility: 12 },
  },
  {
    role: "PRODUCER",
    label: "Producer",
    description: "Builds the beds everything else stands on.",
    skillBias: { production: 30, experimentation: 18, melody: 10 },
  },
  {
    role: "DJ",
    label: "DJ",
    description: "Reads rooms, cuts, and holds the live show together.",
    skillBias: { performance: 22, versatility: 22, production: 14 },
  },
  {
    role: "MULTI_ROLE",
    label: "Multi-role",
    description: "Does whatever the song is short of.",
    skillBias: { versatility: 26, flow: 12, melody: 12, production: 12 },
  },
];

export type MemberTendency = {
  id: string;
  label: string;
  detail: string;
  soundBias: Partial<SoundProfileValues>;
  traits?: TraitKey[];
};

export const memberTendencies: MemberTendency[] = [
  {
    id: "raw",
    label: "Raw and unpolished",
    detail: "First take, mistakes left in.",
    soundBias: { rawPolished: -0.7, darkBright: -0.25, organicElectronic: -0.2 },
    traits: ["HEADSTRONG"],
  },
  {
    id: "polished",
    label: "Clean and finished",
    detail: "Nothing leaves the room half-done.",
    soundBias: { rawPolished: 0.7, accessibleExperimental: -0.3, darkBright: 0.2 },
    traits: ["PERFECTIONIST"],
  },
  {
    id: "experimental",
    label: "Strange on purpose",
    detail: "Would rather be wrong than obvious.",
    soundBias: { accessibleExperimental: 0.7, classicFuturistic: 0.4, minimalDense: 0.2 },
    traits: ["VISIONARY"],
  },
  {
    id: "classic",
    label: "Rooted in the classics",
    detail: "Knows where all of this came from.",
    soundBias: { classicFuturistic: -0.7, organicElectronic: -0.5, melodicRhythmic: 0.15 },
    traits: ["CRATE_DIGGER"],
  },
  {
    id: "anthemic",
    label: "Built for big rooms",
    detail: "Writes for the back row.",
    soundBias: { intimateAnthemic: 0.7, darkBright: 0.3, accessibleExperimental: -0.25 },
    traits: ["SHOWMAN"],
  },
  {
    id: "intimate",
    label: "Close and quiet",
    detail: "Says it once, softly, and means it.",
    soundBias: { intimateAnthemic: -0.7, minimalDense: -0.4, rawPolished: -0.15 },
  },
];

export type MemberPersonality = {
  id: string;
  label: string;
  detail: string;
  psychologyBias: Partial<PsychologyValues>;
  traits?: TraitKey[];
};

export const memberPersonalities: MemberPersonality[] = [
  {
    id: "driven",
    label: "Relentlessly driven",
    detail: "First in, last out, always pushing for more.",
    psychologyBias: { ambition: 30, discipline: 20, patience: -10 },
    traits: ["WORKHORSE"],
  },
  {
    id: "steady",
    label: "Steady and loyal",
    detail: "Won't leave when it gets hard.",
    psychologyBias: { resilience: 26, discipline: 16, ego: -12, patience: 14 },
  },
  {
    id: "volatile",
    label: "Brilliant and volatile",
    detail: "Worth it, most of the time.",
    psychologyBias: { riskTolerance: 28, ego: 22, patience: -20, competitiveness: 14 },
    traits: ["HEADSTRONG"],
  },
  {
    id: "easy",
    label: "Easy in any room",
    detail: "Adapts to whoever is in front of them.",
    psychologyBias: { adaptability: 30, confidence: 14, ego: -10 },
    traits: ["CHAMELEON"],
  },
  {
    id: "competitive",
    label: "Quietly competitive",
    detail: "Keeps score even when nobody else is.",
    psychologyBias: { competitiveness: 30, confidence: 16, ego: 10 },
    traits: ["BATTLE_BORN"],
  },
];

export type VisualIdentity = {
  id: string;
  label: string;
  detail: string;
  /** Flavour only — carries no mechanical weight, by design. */
  palette: string[];
};

export const visualIdentities: VisualIdentity[] = [
  { id: "monochrome", label: "Monochrome", detail: "Black, white, nothing extra.", palette: ["#0b0b0c", "#f4f1ec"] },
  { id: "workwear", label: "Workwear", detail: "Function first, worn in.", palette: ["#3f3a33", "#a08a63"] },
  { id: "neon", label: "After hours", detail: "Late, lit, synthetic.", palette: ["#1a0f2e", "#c05cd6"] },
  { id: "vintage", label: "Vintage", detail: "Sourced, faded, specific.", palette: ["#3d2b1f", "#d9a441"] },
  { id: "sport", label: "Sport", detail: "Loud, fast, unbothered.", palette: ["#0d2a4a", "#e2542c"] },
];

export const memberRoleByKey = Object.fromEntries(
  memberRoleProfiles.map((profile) => [profile.role, profile]),
) as Record<GroupRole, RoleProfile>;
