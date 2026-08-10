import type { SoundProfileValues } from "./enums";

/**
 * The vocabulary of the creative process.
 *
 * These types are shared by the interpretation engine, the commands, the read
 * models and the interface, so a proposal means the same thing everywhere.
 */

export const CREATIVE_SESSION_PURPOSES = [
  "TRACK",
  "BATTLE",
  "FREESTYLE",
  "PROJECT",
  "COLLAB",
] as const;
export type CreativeSessionPurpose = (typeof CREATIVE_SESSION_PURPOSES)[number];

/**
 * Session state machine.
 *
 * SCHEDULED → ACTIVE → AWAITING_DIRECTION → AWAITING_INTERPRETATION →
 * AWAITING_DECISION → CREATING_VERSION → REVIEW → (CREATING_VERSION | MASTERING)
 * → REVIEW → COMPLETED. CANCELLED is reachable from anything unfinished.
 */
export const CREATIVE_SESSION_STATUSES = [
  "SCHEDULED",
  "ACTIVE",
  "AWAITING_DIRECTION",
  "AWAITING_INTERPRETATION",
  "AWAITING_DECISION",
  "CREATING_VERSION",
  "REVIEW",
  "MASTERING",
  "COMPLETED",
  "CANCELLED",
] as const;
export type CreativeSessionStatus = (typeof CREATIVE_SESSION_STATUSES)[number];

/** Legal transitions. Commands consult this; the UI never decides. */
export const SESSION_TRANSITIONS: Record<CreativeSessionStatus, CreativeSessionStatus[]> = {
  SCHEDULED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["AWAITING_DIRECTION", "CANCELLED"],
  AWAITING_DIRECTION: ["AWAITING_INTERPRETATION", "CANCELLED"],
  AWAITING_INTERPRETATION: ["AWAITING_DECISION", "AWAITING_DIRECTION", "CANCELLED"],
  AWAITING_DECISION: ["CREATING_VERSION", "AWAITING_INTERPRETATION", "AWAITING_DIRECTION", "CANCELLED"],
  CREATING_VERSION: ["REVIEW", "AWAITING_DECISION", "CANCELLED"],
  REVIEW: ["CREATING_VERSION", "MASTERING", "AWAITING_DIRECTION", "COMPLETED", "CANCELLED"],
  MASTERING: ["REVIEW", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(
  from: CreativeSessionStatus,
  to: CreativeSessionStatus,
): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

export const SESSION_PARTICIPANT_ROLES = ["PRIMARY_ARTIST", "GROUP", "PRODUCER"] as const;
export type SessionParticipantRole = (typeof SESSION_PARTICIPANT_ROLES)[number];

export const CREATIVE_DECISION_TYPES = [
  "CREATIVE_DIRECTION_SET",
  "PRODUCER_PROPOSAL_ACCEPTED",
  "PRODUCER_PROPOSAL_REJECTED",
  "PRODUCER_PROPOSALS_COMBINED",
  "TRACK_VERSION_REQUESTED",
  "TRACK_VERSION_ACCEPTED",
  "TRACK_VERSION_REJECTED",
  "REVISION_REQUESTED",
  "MASTER_REQUESTED",
  "TRACK_SAVED",
] as const;
export type CreativeDecisionType = (typeof CREATIVE_DECISION_TYPES)[number];

/* --- Creative direction -------------------------------------------------- */

export const INTENTIONS = [
  { id: "introduce", label: "Introduce myself", detail: "Nobody knows who you are yet." },
  { id: "move", label: "Make them move", detail: "The body before the brain." },
  { id: "story", label: "Tell a story", detail: "Something that actually happened." },
  { id: "technical", label: "Show technical ability", detail: "Let them hear the work." },
  { id: "strange", label: "Make something strange", detail: "Wrong on purpose." },
] as const;
export type IntentionId = (typeof INTENTIONS)[number]["id"];

export const MOODS = [
  { id: "tense", label: "Tense" },
  { id: "victorious", label: "Victorious" },
  { id: "introspective", label: "Introspective" },
  { id: "warm", label: "Warm" },
  { id: "aggressive", label: "Aggressive" },
  { id: "melancholic", label: "Melancholic" },
] as const;
export type MoodId = (typeof MOODS)[number]["id"];

export const AUDIENCES = [
  { id: "core", label: "Core fans", detail: "The people already listening." },
  { id: "general", label: "General listeners", detail: "People who've never heard of you." },
  { id: "scene", label: "The scene", detail: "Other artists, and the ones who judge." },
  { id: "none", label: "Just create", detail: "Nobody. Make the thing." },
] as const;
export type AudienceId = (typeof AUDIENCES)[number]["id"];

export type CreativeDirection = {
  intention: IntentionId;
  moods: MoodId[];
  /** 0–100. */
  energy: number;
  /** 0 safe → 100 experimental. */
  risk: number;
  audience: AudienceId;
  /** The player's own words. Optional, and never the primary interaction. */
  note?: string | null;
};

/* --- Producer proposals -------------------------------------------------- */

/** How the producer feels about what they were asked for. */
export const PRODUCER_STANCES = [
  "ENTHUSIASTIC",
  "INTERESTED",
  "CAUTIOUS",
  "PUSHING_BACK",
  "COMPROMISING",
] as const;
export type ProducerStance = (typeof PRODUCER_STANCES)[number];

export type ProducerProposal = {
  id: string;
  title: string;
  /** One line on why they'd do it this way. */
  rationale: string;
  soundDirection: Partial<SoundProfileValues>;
  energy: number;
  risk: number;
  structure: string;
  stance: ProducerStance;
  /** What the producer actually says about this idea. */
  line: string;
};

/* --- Briefs and versions -------------------------------------------------- */

export type MusicBriefShape = {
  purpose: string;
  intention: string;
  mood: string[];
  energy: number;
  risk: number;
  audience: string;
  soundDirection: Partial<SoundProfileValues>;
  subject: string | null;
  structure: string;
  interpretation: {
    producerName: string;
    stance: ProducerStance;
    line: string;
    rationale: string;
  };
};

/** What a development render produces. Structured work, never real audio. */
export type TrackVersionContent = {
  workingTitle: string;
  description: string;
  structure: string[];
  lyricalTheme: string;
  productionNotes: string;
  performanceDirection: string;
  /** Deterministic stand-in for a waveform, for the review screen. */
  waveform: number[];
  developmentPreview: true;
};

export const REVISION_KINDS = [
  { id: "darker", label: "Darker" },
  { id: "brighter", label: "Brighter" },
  { id: "sparser", label: "More sparse" },
  { id: "denser", label: "More dense" },
  { id: "aggressive", label: "More aggressive" },
  { id: "melodic", label: "More melodic" },
  { id: "stranger", label: "Stranger" },
  { id: "safer", label: "Safer" },
] as const;
export type RevisionKindId = (typeof REVISION_KINDS)[number]["id"];

export const TRACK_STATUSES = [
  "IDEA",
  "IN_PROGRESS",
  "COMPLETE",
  "UNRELEASED",
  "SCRAPPED",
] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number];
