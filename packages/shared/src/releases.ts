import type { CareerAct } from "./enums";

/**
 * Releases.
 *
 * A release is a decision about existing work, never a way to make work. The
 * vocabulary here is shared by the commands, the read models and the interface
 * so "planned but not scheduled" means one thing everywhere.
 */

export const RELEASE_FORMATS = [
  "LOOSE_TRACK",
  "SINGLE",
  "EP",
  "MIXTAPE",
  "ALBUM",
  "COLLABORATIVE",
] as const;
export type ReleaseFormat = (typeof RELEASE_FORMATS)[number];

export const RELEASE_STRATEGIES = ["DROP", "TEASE", "PERFORM_FIRST", "SEND_AROUND"] as const;
export type ReleaseStrategy = (typeof RELEASE_STRATEGIES)[number];

export const RELEASE_STATUSES = ["PLANNED", "SCHEDULED", "RELEASED", "CANCELLED"] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

/** Legal transitions. Commands consult this; the interface never decides. */
export const RELEASE_TRANSITIONS: Record<ReleaseStatus, ReleaseStatus[]> = {
  PLANNED: ["SCHEDULED", "CANCELLED"],
  // A release can go straight out, or be pulled before it does.
  SCHEDULED: ["RELEASED", "PLANNED", "CANCELLED"],
  RELEASED: [],
  CANCELLED: [],
};

export function canReleaseTransition(from: ReleaseStatus, to: ReleaseStatus): boolean {
  return RELEASE_TRANSITIONS[from].includes(to);
}

/**
 * What each strategy is, costs and asks for.
 *
 * `audienceModifiers` are **recorded, never applied**. M4 decides how a record
 * goes out; the audience simulator decides what that was worth. Writing the
 * modifiers here and reading them there is the seam between the two.
 */
export type ReleaseStrategyProfile = {
  id: ReleaseStrategy;
  label: string;
  detail: string;
  /** In-world days between committing to the strategy and the release. */
  leadDays: number;
  /** Integer minor units. Zero for strategies that only cost time. */
  costMinor: number;
  /** Requirements that gate the strategy at this point in a career. */
  requires: ("VENUE" | "CONTACTS")[];
  /** Consumed by M5. Nothing in M4 may read these to change state. */
  audienceModifiers: Record<string, number>;
};

export const RELEASE_STRATEGY_PROFILES: Record<ReleaseStrategy, ReleaseStrategyProfile> = {
  DROP: {
    id: "DROP",
    label: "Drop it",
    detail: "Straight out, no build-up. Whoever finds it, finds it.",
    leadDays: 0,
    costMinor: 0,
    requires: [],
    audienceModifiers: { anticipation: 0, reach: 0, credibility: 0 },
  },
  TEASE: {
    id: "TEASE",
    label: "Tease it",
    detail: "Put a piece of it out first and let people wait.",
    leadDays: 3,
    costMinor: 0,
    requires: [],
    audienceModifiers: { anticipation: 25, reach: 10, credibility: 0 },
  },
  PERFORM_FIRST: {
    id: "PERFORM_FIRST",
    label: "Perform it first",
    detail: "Let a room hear it before the internet does.",
    leadDays: 5,
    costMinor: 30_000,
    requires: ["VENUE"],
    audienceModifiers: { anticipation: 15, reach: 5, credibility: 30 },
  },
  SEND_AROUND: {
    id: "SEND_AROUND",
    label: "Send it around",
    detail: "Get it to the people locally whose opinion travels.",
    leadDays: 4,
    costMinor: 0,
    requires: ["CONTACTS"],
    audienceModifiers: { anticipation: 10, reach: 30, credibility: 15 },
  },
};

/* --- Formats grow with the career ---------------------------------------- */

export type FormatAvailability = {
  format: ReleaseFormat;
  label: string;
  detail: string;
  available: boolean;
  /** Why it is locked, in the player's language. Null when available. */
  lockedReason: string | null;
  /** Tracks this format needs. */
  minimumTracks: number;
};

const FORMAT_RULES: {
  format: ReleaseFormat;
  label: string;
  detail: string;
  minimumTracks: number;
  /** Acts in which this format is offered at all. */
  acts: CareerAct[];
}[] = [
  {
    format: "LOOSE_TRACK",
    label: "Loose track",
    detail: "Out on its own, no ceremony. It counts, it just isn't an event.",
    minimumTracks: 1,
    acts: ["UNDERGROUND", "COME_UP", "INDUSTRY", "LEGACY"],
  },
  {
    format: "SINGLE",
    label: "Single",
    detail: "One track, treated like it matters.",
    minimumTracks: 1,
    acts: ["UNDERGROUND", "COME_UP", "INDUSTRY", "LEGACY"],
  },
  {
    format: "EP",
    label: "EP",
    detail: "A short body of work with a shape to it.",
    minimumTracks: 4,
    acts: ["COME_UP", "INDUSTRY", "LEGACY"],
  },
  {
    format: "MIXTAPE",
    label: "Mixtape",
    detail: "Volume and momentum over polish.",
    minimumTracks: 6,
    acts: ["COME_UP", "INDUSTRY", "LEGACY"],
  },
  {
    format: "ALBUM",
    label: "Album",
    detail: "The thing you get judged on.",
    minimumTracks: 8,
    acts: ["COME_UP", "INDUSTRY", "LEGACY"],
  },
  {
    format: "COLLABORATIVE",
    label: "Collaborative project",
    detail: "Made with somebody, credited to both.",
    minimumTracks: 4,
    acts: ["COME_UP", "INDUSTRY", "LEGACY"],
  },
];

/**
 * What this career may release right now, and why not for the rest.
 *
 * A locked format is shown with its reason rather than hidden: that is how the
 * interface teaches the game. A one-track career is never offered an album.
 */
export function availableFormats(input: {
  careerAct: CareerAct;
  /** Finished, unreleased and released tracks — the whole catalogue. */
  catalogueSize: number;
}): FormatAvailability[] {
  return FORMAT_RULES.map((rule) => {
    const actAllows = rule.acts.includes(input.careerAct);
    const enoughTracks = input.catalogueSize >= rule.minimumTracks;

    const lockedReason = !actAllows
      ? "Not at this stage of your career."
      : !enoughTracks
        ? `You need at least ${rule.minimumTracks} tracks.`
        : null;

    return {
      format: rule.format,
      label: rule.label,
      detail: rule.detail,
      minimumTracks: rule.minimumTracks,
      available: actAllows && enoughTracks,
      lockedReason,
    };
  });
}

/** Formats that take more than one track, for project-shaped releases. */
export function isProjectFormat(format: ReleaseFormat): boolean {
  return format !== "LOOSE_TRACK" && format !== "SINGLE";
}

export const PROJECT_TYPES = ["EP", "MIXTAPE", "ALBUM", "COLLABORATIVE"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_STATUSES = ["DRAFT", "IN_PROGRESS", "COMPLETE", "RELEASED", "ABANDONED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
