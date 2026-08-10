/**
 * Canonical domain enums.
 *
 * These are shared by the database schema, the domain layer and the UI so that
 * a single vocabulary describes the simulation everywhere. Values are stable
 * strings — never persist ordinals.
 */

export const CAREER_ACTS = ["UNDERGROUND", "COME_UP", "INDUSTRY", "LEGACY"] as const;
export type CareerAct = (typeof CAREER_ACTS)[number];

export const CAREER_STATUSES = ["ONBOARDING", "ACTIVE", "PAUSED", "RETIRED"] as const;
export type CareerStatus = (typeof CAREER_STATUSES)[number];

/**
 * A Career controls exactly one entity. The union is intentionally open-ended:
 * later acts introduce labels, collectives and imprints as controlled entities.
 */
export const CONTROLLED_ENTITY_TYPES = ["ARTIST", "GROUP"] as const;
export type ControlledEntityType = (typeof CONTROLLED_ENTITY_TYPES)[number];

export const CAREER_TYPES = ["SOLO", "GROUP"] as const;
export type CareerType = (typeof CAREER_TYPES)[number];

export const ARTIST_TYPES = ["PLAYER", "CORE_NPC", "WORLD_NPC", "PROCEDURAL"] as const;
export type ArtistType = (typeof ARTIST_TYPES)[number];

export const ARTIST_STATUSES = ["ACTIVE", "INACTIVE", "RETIRED"] as const;
export type ArtistStatus = (typeof ARTIST_STATUSES)[number];

export const GROUP_STATUSES = ["FORMING", "ACTIVE", "HIATUS", "DISSOLVED"] as const;
export type GroupStatus = (typeof GROUP_STATUSES)[number];

export const GROUP_ROLES = [
  "LEAD_MC",
  "MC",
  "SINGER",
  "PRODUCER",
  "DJ",
  "MULTI_ROLE",
] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const GROUP_MEMBERSHIP_STATUSES = ["ACTIVE", "INACTIVE", "LEFT", "REMOVED"] as const;
export type GroupMembershipStatus = (typeof GROUP_MEMBERSHIP_STATUSES)[number];

export const WORLD_STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type WorldStatus = (typeof WORLD_STATUSES)[number];

/** Who is allowed to perceive a canonical event. */
export const EVENT_VISIBILITIES = [
  "PRIVATE",
  "CREW",
  "INDUSTRY",
  "LOCAL_PUBLIC",
  "GLOBAL_PUBLIC",
] as const;
export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const EVENT_ACTOR_TYPES = [
  "SYSTEM",
  "USER",
  "CAREER",
  "ARTIST",
  "GROUP",
  "WORLD",
] as const;
export type EventActorType = (typeof EVENT_ACTOR_TYPES)[number];

export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const SUBSCRIPTION_TIERS = ["FREE", "SUPPORTER", "PRO"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

/**
 * Where a user is inside first-run onboarding. Persisted so a player can leave
 * mid-flow on mobile and resume on desktop at the correct step.
 */
export const ONBOARDING_STATES = [
  "NOT_STARTED",
  "CAREER_TYPE",
  "IDENTITY",
  /** Group careers only: the player authors their own founding member. */
  "FOUNDING_ARTIST",
  "SOUND_DISCOVERY",
  "MEMBERS",
  "REVEAL",
  "COMPLETE",
] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];

/**
 * Generation job lifecycle.
 *
 * The state machine is the contract, not the provider: a deterministic
 * development provider walks the same states a hosted audio model will, so the
 * UI and the domain never learn which one they are talking to.
 */
export const GENERATION_JOB_STATUSES = [
  "REQUESTED",
  "QUEUED",
  "GENERATING",
  "EVALUATING",
  "COMPLETE",
  "FAILED",
  "CANCELLED",
] as const;
export type GenerationJobStatus = (typeof GENERATION_JOB_STATUSES)[number];

/** Terminal states: a job in one of these will never change again. */
export const TERMINAL_JOB_STATUSES: GenerationJobStatus[] = ["COMPLETE", "FAILED", "CANCELLED"];

/* --- People ------------------------------------------------------------- */

export const CHARACTER_TIERS = ["CORE", "WORLD", "BACKGROUND"] as const;
export type CharacterTier = (typeof CHARACTER_TIERS)[number];

export const CHARACTER_ROLES = [
  "CONNECTOR",
  "PRODUCER",
  "ENGINEER",
  "MANAGER",
  "PROMOTER",
  "JOURNALIST",
  "EXECUTIVE",
  "ARTIST",
] as const;
export type CharacterRole = (typeof CHARACTER_ROLES)[number];

/* --- Opportunities ------------------------------------------------------ */

export const OPPORTUNITY_TYPES = ["PRODUCER_INTRO"] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const OPPORTUNITY_STATUSES = [
  "AVAILABLE",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "RESOLVED",
] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

/* --- Calendar ----------------------------------------------------------- */

export const CALENDAR_ITEM_TYPES = [
  "STUDIO",
  "PERFORMANCE",
  "RELEASE",
  "MEETING",
  "REHEARSAL",
  "MEDIA",
  "REST",
  "OTHER",
] as const;
export type CalendarItemType = (typeof CALENDAR_ITEM_TYPES)[number];

export const CALENDAR_ITEM_STATUSES = ["SCHEDULED", "ACTIVE", "COMPLETED", "CANCELLED"] as const;
export type CalendarItemStatus = (typeof CALENDAR_ITEM_STATUSES)[number];

/* --- Money -------------------------------------------------------------- */

export const TRANSACTION_CATEGORIES = [
  "STUDIO_COST",
  "SESSION_REFUND",
  "STARTING_CAPITAL",
  "OTHER",
] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

export const ARCHETYPES = [
  "THE_ARCHITECT",
  "THE_PERFORMER",
  "THE_STORYTELLER",
  "THE_DISRUPTOR",
  "THE_HITMAKER",
  "THE_PURIST",
  "THE_CHAMELEON",
  "THE_VISIONARY",
] as const;
export type ArchetypeKey = (typeof ARCHETYPES)[number];

export const TRAITS = [
  "PERFECTIONIST",
  "BATTLE_BORN",
  "CHAMELEON",
  "HEADSTRONG",
  "HITMAKER",
  "CRATE_DIGGER",
  "SHOWMAN",
  "WORKHORSE",
  "VISIONARY",
] as const;
export type TraitKey = (typeof TRAITS)[number];

/** Sound DNA axes. Values are continuous in [-1, 1]. */
export const SOUND_DIMENSIONS = [
  "darkBright",
  "rawPolished",
  "minimalDense",
  "organicElectronic",
  "classicFuturistic",
  "accessibleExperimental",
  "melodicRhythmic",
  "intimateAnthemic",
] as const;
export type SoundDimension = (typeof SOUND_DIMENSIONS)[number];
export type SoundProfileValues = Record<SoundDimension, number>;

/** Skills are 0–100. */
export const SKILL_KEYS = [
  "lyricism",
  "flow",
  "melody",
  "storytelling",
  "performance",
  "production",
  "experimentation",
  "versatility",
  "battleIQ",
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export type SkillValues = Record<SkillKey, number>;

/** Psychology is 0–100 and mostly hidden from the player. */
export const PSYCHOLOGY_KEYS = [
  "confidence",
  "discipline",
  "ambition",
  "resilience",
  "ego",
  "patience",
  "adaptability",
  "riskTolerance",
  "competitiveness",
] as const;
export type PsychologyKey = (typeof PSYCHOLOGY_KEYS)[number];
export type PsychologyValues = Record<PsychologyKey, number>;
