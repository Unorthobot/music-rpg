import type { CareerAct, SoundProfileValues } from "./enums";
import type { ReleaseFormat } from "./releases";

/**
 * Reception.
 *
 * The vocabulary shared by the simulator, the commands, the read models and the
 * inspector, so that "engaged listener" means one thing everywhere.
 *
 * The distinctions this file exists to keep apart:
 *
 * - **Exposure** — someone had an opportunity to encounter the record.
 * - **Listener** — someone consumed it.
 * - **Engaged listener** — it landed.
 * - **Fan** — persistent affinity toward the artist, which outlives the record.
 *
 * Each is a strict subset of the one before it, and none of them is the same
 * number.
 */

/** Which simulator produced a result. Persisted; historical runs keep theirs. */
export const RECEPTION_SIMULATOR_VERSION = "reception-v1";

export const AUDIENCE_COHORT_SLUGS = [
  "SCENE_HEADS",
  "CASUAL_LISTENERS",
  "TASTEMAKERS",
] as const;
export type AudienceCohortSlug = (typeof AUDIENCE_COHORT_SLUGS)[number];

/**
 * The M4 handoff.
 *
 * Written by `setReleaseStrategy`, stored on the release and carried in the
 * `release.published` payload. The simulator reads exactly this and never
 * inspects the strategy to work out what it should have meant.
 */
export type AudienceModifiers = {
  anticipation: number;
  reach: number;
  credibility: number;
};

/** Missing keys read as neutral rather than throwing — the payload is data. */
export function readAudienceModifiers(stored: Record<string, number> | null | undefined): AudienceModifiers {
  return {
    anticipation: Number(stored?.anticipation ?? 0),
    reach: Number(stored?.reach ?? 0),
    credibility: Number(stored?.credibility ?? 0),
  };
}

/** What a cohort listens for. */
export type AudienceCohortPreferences = {
  /** The region of Sound DNA it leans toward. Unspecified axes are indifferent. */
  sound: Partial<SoundProfileValues>;
  /** How far from that region it will still follow. Larger is more open. */
  tolerance: number;
  /** What it weighs in the work itself. Sums to 1. */
  qualities: {
    focus: number;
    distinctiveness: number;
    immediacy: number;
  };
};

/** How a cohort behaves once it has heard something. */
export type AudienceCohortBehaviour = {
  /** Share of the population still unreached that finds a record unaided, per day. */
  baseDiscoveryRate: number;
  /** Of those exposed, the share who listen at neutral fit. */
  attention: number;
  /** Of those who listen, the share who engage at neutral fit. */
  engagementBias: number;
  /** Divides conversion. Higher is harder to win over permanently. */
  conversionResistance: number;
  /** Shares produced per engaged listener. */
  shareTendency: number;
  /** People each share reaches. Tastemakers travel further than they are numerous. */
  shareAmplification: number;
  /** Of cumulative listeners, the share who come back on a later day. */
  repeatTendency: number;
  /** How strongly this cohort answers each stored modifier. */
  reachSensitivity: number;
  anticipationSensitivity: number;
  credibilitySensitivity: number;
  /** How this cohort's response pressures each career metric. */
  famePressure: number;
  respectPressure: number;
  heatPressure: number;
};

/**
 * Why a cohort responded the way it did.
 *
 * Persisted with the cohort's performance and carried in the reception events,
 * because "fit was 0.71" is the part that explains the numbers underneath it.
 */
export type CohortEvaluation = {
  cohortSlug: string;
  /** 0–1, the combined judgement. */
  fit: number;
  /** The record's own sound against the region this cohort leans toward. */
  soundFit: number;
  /** The record's qualities against what this cohort weighs. */
  qualityFit: number;
  /** The artist's Sound DNA against the same region — this outlives the record. */
  artistFit: number;
  /** 0–1, standing affinity carried in from previous work. */
  affinity: number;
  /** The stored modifiers as this cohort felt them. Multipliers around 1. */
  reachBoost: number;
  anticipationBoost: number;
  credibilityBoost: number;
};

/** One cohort's day. */
export type CohortTickOutcome = {
  cohortSlug: string;
  evaluation: CohortEvaluation;
  /** People here who had not encountered this record before today. */
  addressablePopulation: number;
  exposures: number;
  /** The part of `exposures` that arrived through somebody passing it on. */
  wordOfMouthExposures: number;
  listeners: number;
  engagedListeners: number;
  repeatListeners: number;
  fanConversions: number;
  shares: number;
  /** Exposure those shares will create on the next tick. */
  wordOfMouth: number;
};

export type ReceptionTotals = {
  exposures: number;
  listeners: number;
  engagedListeners: number;
  repeatListeners: number;
  fanConversions: number;
  shares: number;
  wordOfMouth: number;
};

/**
 * Career pressure, as fractions.
 *
 * Fame answers breadth, Respect answers who engaged, Heat answers movement.
 * Legacy is absent: a first single does not create it, and there is no field
 * here for it to arrive through.
 */
export type MetricPressure = {
  fame: number;
  respect: number;
  heat: number;
};

export type ReceptionTickResult = {
  simulatorVersion: string;
  dayIndex: number;
  seed: string;
  /** Echoed so a stored tick can be read without joining back to the release. */
  audienceModifiers: AudienceModifiers;
  cohorts: CohortTickOutcome[];
  totals: ReceptionTotals;
  momentumBefore: number;
  momentumAfter: number;
  pressure: MetricPressure;
};

/* --- Simulator inputs ----------------------------------------------------- */

/** What one cohort brings into a tick: who it is, and its history with this artist. */
export type ReceptionCohortState = {
  slug: string;
  size: number;
  preferences: AudienceCohortPreferences;
  behaviour: AudienceCohortBehaviour;
  /** Standing relationship with the artist — from `artist_audience`. */
  fans: number;
  /** 0–1000. */
  affinity: number;
  /** Unique people here who have ever encountered this artist. */
  priorExposure: number;
  /** What this record has already done here — from `release_cohort_performance`. */
  exposures: number;
  listeners: number;
  engagedListeners: number;
  /** Unique people here who have already come back at least once. */
  repeatListeners: number;
  fanConversions: number;
  /** Exposure owed to this cohort from the previous tick's sharing. */
  incomingWordOfMouth: number;
};

export type TrackCharacteristics = {
  sound: SoundProfileValues;
  /** As rendered in the Studio: 0–100 each. */
  focus: number;
  distinctiveness: number;
  immediacy: number;
};

export type ReceptionTickInput = {
  /** 1 is the first day the record is out. */
  dayIndex: number;
  /** Stable seed. Same seed and state reproduce the tick exactly. */
  seed: string;
  /** Read from the release. Never derived from the strategy. */
  audienceModifiers: AudienceModifiers;
  format: ReleaseFormat;
  careerAct: CareerAct;
  track: TrackCharacteristics;
  /** The artist's own Sound DNA, which is not the same as this record's. */
  artistSound: SoundProfileValues;
  /** Release-level velocity carried in from the previous tick. */
  momentum: number;
  cohorts: ReceptionCohortState[];
};
