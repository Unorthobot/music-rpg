import {
  SOUND_DIMENSIONS,
  clampAxis,
  clampStat,
  type CreativeDirection,
  type MusicBriefShape,
  type ProducerProposal,
  type RevisionKindId,
  type SkillValues,
  type SoundProfileValues,
  type TrackVersionContent,
} from "@music-rpg/shared";
import { describeSound, soundAxisWords } from "../describe";
import type { ProducerInterpretation } from "./interpretation";

/**
 * From decision to brief to work.
 *
 * A MusicBrief is the contract between the room and the render: it carries what
 * the player asked for, what the producer made of it, and the sound the two of
 * them agreed on. Revisions never edit a brief — they derive a new one that
 * points back at its parent, which is what keeps version 1 meaningful after
 * version 2 exists.
 *
 * Everything here is deterministic. The "render" is a structured description of
 * a record, clearly marked as a development preview: no audio is produced and
 * nothing pretends otherwise.
 */

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length]!;
}

export type BuildBriefInput = {
  direction: CreativeDirection;
  proposal: ProducerProposal;
  interpretation: Pick<ProducerInterpretation, "stance" | "opening">;
  producerName: string;
  purpose: string;
};

export function buildMusicBrief(input: BuildBriefInput): MusicBriefShape {
  const { direction, proposal } = input;

  return {
    purpose: input.purpose,
    intention: direction.intention,
    mood: [...direction.moods],
    energy: proposal.energy,
    risk: proposal.risk,
    audience: direction.audience,
    soundDirection: proposal.soundDirection,
    subject: direction.note?.trim() || null,
    structure: proposal.structure,
    interpretation: {
      producerName: input.producerName,
      stance: proposal.stance,
      line: proposal.line,
      rationale: proposal.rationale,
    },
  };
}

/* --- Revision ------------------------------------------------------------- */

const REVISION_SOUND: Record<RevisionKindId, Partial<SoundProfileValues>> = {
  darker: { darkBright: -0.35 },
  brighter: { darkBright: 0.35 },
  sparser: { minimalDense: -0.35 },
  denser: { minimalDense: 0.35 },
  aggressive: { rawPolished: -0.3, melodicRhythmic: 0.25 },
  melodic: { melodicRhythmic: -0.35 },
  stranger: { accessibleExperimental: 0.4, classicFuturistic: 0.2 },
  safer: { accessibleExperimental: -0.4, rawPolished: 0.2 },
};

const REVISION_ENERGY: Partial<Record<RevisionKindId, number>> = {
  aggressive: 12,
  melodic: -6,
  denser: 6,
  sparser: -6,
};

const REVISION_RISK: Partial<Record<RevisionKindId, number>> = {
  stranger: 15,
  safer: -15,
};

const REVISION_NOTES: Record<RevisionKindId, string> = {
  darker: "Pull the light out of it.",
  brighter: "Open it up.",
  sparser: "Take things away until it hurts.",
  denser: "Fill the room.",
  aggressive: "Harder, and meaner with it.",
  melodic: "Let it sing.",
  stranger: "Break something on purpose.",
  safer: "Straighten it out.",
};

/**
 * A revision is a new brief, not an edit.
 *
 * The parent is recorded so the lineage of a track — asked for this, then that,
 * then landed here — stays readable long after the session.
 */
export function applyRevision(
  brief: MusicBriefShape,
  kind: RevisionKindId,
  note?: string | null,
): MusicBriefShape {
  const sound: Partial<SoundProfileValues> = {};
  for (const axis of SOUND_DIMENSIONS) {
    const base = brief.soundDirection[axis] ?? 0;
    sound[axis] = clampAxis(base + (REVISION_SOUND[kind][axis] ?? 0));
  }

  const trimmedNote = note?.trim();

  return {
    ...brief,
    soundDirection: sound,
    energy: clampStat(brief.energy + (REVISION_ENERGY[kind] ?? 0)),
    risk: clampStat(brief.risk + (REVISION_RISK[kind] ?? 0)),
    subject: trimmedNote ? trimmedNote : brief.subject,
    interpretation: {
      ...brief.interpretation,
      line: trimmedNote ? `"${trimmedNote}" — alright. ${REVISION_NOTES[kind]}` : REVISION_NOTES[kind],
    },
  };
}

/* --- Rendering ------------------------------------------------------------ */

const STRUCTURE_PARTS = ["Intro", "Verse", "Hook", "Verse", "Bridge", "Outro"];

const THEME_BY_INTENTION: Record<string, string> = {
  introduce: "Who you are, said once, without asking permission.",
  move: "Motion for its own sake — a room deciding to give in.",
  story: "One night, told in order, with the details left in.",
  technical: "Craft as the argument. The work is the point.",
  strange: "A shape nobody asked for, held long enough to make sense.",
};

const PERFORMANCE_BY_ENERGY = [
  "Close to the mic, barely above speech.",
  "Conversational, holding something back.",
  "Full voice, no hedging.",
  "Pushed to the edge of control.",
];

export type RenderInput = {
  brief: MusicBriefShape;
  artistName: string;
  producerName: string;
  versionNumber: number;
  /** Extra seed material so revisions of the same brief differ. */
  seedSalt?: string;
  skills?: SkillValues;
};

/** Deterministic stand-in for a waveform. Presentational only. */
function waveform(random: () => number, energy: number): number[] {
  return Array.from({ length: 48 }, (_, index) => {
    const swell = Math.sin((index / 48) * Math.PI);
    const jitter = 0.55 + random() * 0.45;
    return Math.round(Math.min(100, swell * jitter * (40 + energy * 0.7)));
  });
}

export function renderVersionContent(input: RenderInput): TrackVersionContent {
  const { brief } = input;
  const random = seeded(
    hashString(
      [
        input.artistName,
        input.producerName,
        input.versionNumber,
        brief.intention,
        brief.structure,
        brief.energy,
        brief.risk,
        JSON.stringify(brief.soundDirection),
        input.seedSalt ?? "",
      ].join(":"),
    ),
  );

  const sound = brief.soundDirection as SoundProfileValues;
  const summary = describeSound(sound);

  const ranked = [...SOUND_DIMENSIONS]
    .filter((axis) => Math.abs(sound[axis] ?? 0) > 0.2)
    .sort((a, b) => Math.abs(sound[b] ?? 0) - Math.abs(sound[a] ?? 0));

  const productionNotes = ranked
    .slice(0, 3)
    .map((axis) => {
      const words = soundAxisWords[axis];
      return (sound[axis] ?? 0) < 0 ? words.lowFocus : words.highFocus;
    })
    .join(", ");

  const partCount = brief.energy > 65 ? 6 : brief.energy > 40 ? 5 : 4;
  const structure = STRUCTURE_PARTS.slice(0, partCount);

  return {
    workingTitle: suggestTitle(brief, input.versionNumber, input.seedSalt),
    description: summary,
    structure,
    lyricalTheme: brief.subject
      ? `${brief.subject}`
      : (THEME_BY_INTENTION[brief.intention] ?? "Untitled feeling, worked out loud."),
    productionNotes: productionNotes
      ? `${input.producerName} builds it around ${productionNotes}.`
      : `${input.producerName} keeps it plain and lets the take carry it.`,
    performanceDirection: pick(
      [PERFORMANCE_BY_ENERGY[Math.min(3, Math.floor(brief.energy / 26))]!],
      random,
    ),
    waveform: waveform(random, brief.energy),
    developmentPreview: true,
  };
}

const TITLE_NOUNS = [
  "RECEPTION",
  "ROOM",
  "SIGNAL",
  "HOURS",
  "TRAFFIC",
  "WEIGHT",
  "DISTANCE",
  "STATIC",
  "WITNESS",
];
const TITLE_MODIFIERS = ["NO", "EMPTY", "LOW", "LATE", "COLD", "SECOND", "QUIET"];

/**
 * A working title so a version can be talked about before it is named.
 * The player renames it at save; this is never forced on them.
 */
export function suggestTitle(
  brief: MusicBriefShape,
  versionNumber: number,
  seedSalt?: string,
): string {
  const random = seeded(
    hashString(
      `${brief.intention}:${brief.structure}:${brief.energy}:${brief.risk}:${versionNumber}:${seedSalt ?? ""}`,
    ),
  );

  const noun = pick(TITLE_NOUNS, random);
  const sound = brief.soundDirection as SoundProfileValues;

  if ((sound.minimalDense ?? 0) < -0.35 && random() > 0.5) return noun;
  return `${pick(TITLE_MODIFIERS, random)} ${noun}`;
}

/**
 * Development quality read-out.
 *
 * Not a score the player is graded on — a description of what the work is,
 * derived from how committed the brief is. Real evaluation belongs to whatever
 * eventually renders audio.
 */
export function qualityMetrics(brief: MusicBriefShape): Record<string, number> {
  const sound = brief.soundDirection as SoundProfileValues;
  const commitment =
    SOUND_DIMENSIONS.reduce((total, axis) => total + Math.abs(sound[axis] ?? 0), 0) /
    SOUND_DIMENSIONS.length;

  return {
    focus: clampStat(35 + commitment * 90),
    distinctiveness: clampStat(25 + brief.risk * 0.6 + commitment * 40),
    immediacy: clampStat(90 - brief.risk * 0.55 + (brief.energy - 50) * 0.3),
  };
}

/**
 * Mastering.
 *
 * Deterministic in development, and honest about what it is: the same work,
 * finished — tighter structure notes and a lift in the read-out, not a
 * different record.
 */
export function masterVersionContent(
  content: TrackVersionContent,
  producerName: string,
): TrackVersionContent {
  return {
    ...content,
    productionNotes: `${content.productionNotes} Mastered with ${producerName}: levels set, edges cleaned, nothing added.`,
  };
}

export function masteredMetrics(metrics: Record<string, number>): Record<string, number> {
  return {
    ...metrics,
    focus: clampStat((metrics.focus ?? 50) + 6),
    immediacy: clampStat((metrics.immediacy ?? 50) + 4),
  };
}
