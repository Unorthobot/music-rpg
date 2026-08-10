import {
  SOUND_DIMENSIONS,
  clampAxis,
  clampStat,
  type ArchetypeKey,
  type CareerAct,
  type CreativeDirection,
  type ProducerProposal,
  type ProducerStance,
  type SoundDimension,
  type SoundProfileValues,
  type TraitKey,
} from "@music-rpg/shared";
import type { ProducerProfile } from "../content/characters";
import { describeSound, soundAxisWords } from "../describe";

/**
 * What a producer makes of what you asked for.
 *
 * Deterministic: the same artist, the same producer, the same direction and the
 * same round always produce the same three proposals. No model, no network, no
 * randomness that isn't seeded by the inputs — which is what lets a player's
 * decision be a real decision rather than a reroll.
 *
 * The engine is deliberately opinionated in one way: **the producer is not a
 * yes-man.** A direction that fights their taste, or that a high-standards
 * producer finds thin, produces pushback and a counter-proposal. Agreement is
 * earned by fit, not granted by the interface.
 */
export const INTERPRETATION_VERSION = 1;

export type InterpretationArtist = {
  stageName: string;
  soundDNA: SoundProfileValues;
  archetype: ArchetypeKey | null;
  traits: TraitKey[];
};

export type InterpretationInput = {
  producer: { name: string; slug: string; profile: ProducerProfile };
  artist: InterpretationArtist;
  direction: CreativeDirection;
  careerAct: CareerAct;
  /** Increments each time the player rejects the set. Changes the proposals. */
  round: number;
};

export type ProducerInterpretation = {
  version: number;
  round: number;
  /** How the producer feels about the direction as a whole. */
  stance: ProducerStance;
  /** What they say when they've heard you out. */
  opening: string;
  /** 0–100 agreement between what you asked for and what they like. */
  fit: number;
  proposals: ProducerProposal[];
};

/* --- Deterministic randomness -------------------------------------------- */

/** FNV-1a. Stable across platforms and versions, unlike `hashCode` folklore. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, and identical everywhere for a given seed. */
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

/* --- Direction → sound --------------------------------------------------- */

const INTENTION_SOUND: Record<string, Partial<SoundProfileValues>> = {
  introduce: { intimateAnthemic: -0.2, accessibleExperimental: -0.1, rawPolished: -0.1 },
  move: { melodicRhythmic: 0.45, intimateAnthemic: 0.35, accessibleExperimental: -0.25 },
  story: { intimateAnthemic: -0.45, minimalDense: -0.2, melodicRhythmic: -0.2 },
  technical: { melodicRhythmic: 0.2, accessibleExperimental: 0.15, minimalDense: 0.15 },
  strange: { accessibleExperimental: 0.55, rawPolished: -0.2, classicFuturistic: 0.25 },
};

const MOOD_SOUND: Record<string, Partial<SoundProfileValues>> = {
  tense: { darkBright: -0.4, minimalDense: -0.15, rawPolished: -0.1 },
  victorious: { darkBright: 0.45, intimateAnthemic: 0.4 },
  introspective: { intimateAnthemic: -0.4, darkBright: -0.25, minimalDense: -0.2 },
  warm: { darkBright: 0.3, organicElectronic: -0.35 },
  aggressive: { rawPolished: -0.35, melodicRhythmic: 0.3, darkBright: -0.2 },
  melancholic: { darkBright: -0.35, melodicRhythmic: -0.3, intimateAnthemic: -0.2 },
};

const AUDIENCE_SOUND: Record<string, Partial<SoundProfileValues>> = {
  core: { accessibleExperimental: 0.1, intimateAnthemic: -0.1 },
  general: { accessibleExperimental: -0.35, rawPolished: 0.25, intimateAnthemic: 0.2 },
  scene: { accessibleExperimental: 0.25, rawPolished: -0.15 },
  none: { accessibleExperimental: 0.15 },
};

function emptySound(): SoundProfileValues {
  return Object.fromEntries(SOUND_DIMENSIONS.map((axis) => [axis, 0])) as SoundProfileValues;
}

function addInto(target: SoundProfileValues, source: Partial<SoundProfileValues>, weight = 1): void {
  for (const axis of SOUND_DIMENSIONS) {
    target[axis] += (source[axis] ?? 0) * weight;
  }
}

function normalise(sound: SoundProfileValues): SoundProfileValues {
  const result = emptySound();
  for (const axis of SOUND_DIMENSIONS) {
    // Same saturation curve identity inference uses, so briefs and Sound DNA
    // stay comparable.
    result[axis] = clampAxis(sound[axis] / (1 + Math.abs(sound[axis]) / 1.6));
  }
  return result;
}

/** What the player asked for, as a sound vector. */
export function directionToSound(direction: CreativeDirection): SoundProfileValues {
  const sound = emptySound();

  addInto(sound, INTENTION_SOUND[direction.intention] ?? {});
  for (const mood of direction.moods) {
    addInto(sound, MOOD_SOUND[mood] ?? {}, 1 / Math.max(1, direction.moods.length) + 0.35);
  }
  addInto(sound, AUDIENCE_SOUND[direction.audience] ?? {});

  // Energy and risk are continuous controls, so they push axes continuously.
  const energy = (direction.energy - 50) / 50;
  const risk = (direction.risk - 50) / 50;
  sound.intimateAnthemic += energy * 0.4;
  sound.melodicRhythmic += energy * 0.25;
  sound.accessibleExperimental += risk * 0.6;
  sound.rawPolished -= risk * 0.2;

  return normalise(sound);
}

/* --- Fit ----------------------------------------------------------------- */

/**
 * How much this producer wants to make this record.
 *
 * Distance between the direction and their taste, adjusted for whether the risk
 * level suits their appetite. Low fit is not a failure state — it is where the
 * interesting conversations happen.
 */
export function computeFit(
  direction: CreativeDirection,
  profile: ProducerProfile,
): number {
  const asked = directionToSound(direction);
  const biasAxes = Object.entries(profile.soundBias) as [SoundDimension, number][];

  const alignment =
    biasAxes.length === 0
      ? 0
      : biasAxes.reduce((total, [axis, bias]) => total + bias * asked[axis], 0) / biasAxes.length;

  // A cautious producer handed an experimental brief, or an adventurous one
  // handed a safe brief, both lose fit.
  const riskGap = Math.abs(direction.risk - profile.adventurousness) / 100;

  return clampStat(55 + alignment * 90 - riskGap * 45);
}

function resolveStance(fit: number, profile: ProducerProfile, random: () => number): ProducerStance {
  const tolerance = profile.agreeableness;

  if (fit >= 70) return tolerance >= 50 ? "ENTHUSIASTIC" : "INTERESTED";
  if (fit >= 55) return tolerance >= 60 ? "INTERESTED" : "CAUTIOUS";
  if (fit >= 40) {
    // High standards turn ambivalence into an argument.
    if (profile.standards >= 75) return "PUSHING_BACK";
    return random() > 0.5 ? "CAUTIOUS" : "COMPROMISING";
  }
  return tolerance <= 45 || profile.standards >= 75 ? "PUSHING_BACK" : "COMPROMISING";
}

/* --- Titles --------------------------------------------------------------- */

const TITLE_NOUNS = [
  "ROOM",
  "RECEPTION",
  "SIGNAL",
  "VICTORY",
  "DRUMS",
  "CITY",
  "HOURS",
  "WEIGHT",
  "DISTANCE",
  "WITNESS",
  "TRAFFIC",
  "STATIC",
];

const TITLE_MODIFIERS = [
  "EMPTY",
  "FALSE",
  "NO",
  "LOW",
  "SECOND",
  "QUIET",
  "LATE",
  "COLD",
  "FIRST",
  "DEAD",
];

function makeTitle(random: () => number, sound: SoundProfileValues): string {
  const modifier = pick(TITLE_MODIFIERS, random);
  const noun = pick(TITLE_NOUNS, random);

  // A very sparse record earns a one-word title more often than a dense one.
  if (sound.minimalDense < -0.4 && random() > 0.55) return noun;
  return `${modifier} ${noun}`;
}

/* --- Proposals ------------------------------------------------------------ */

type ProposalKind = "AS_ASKED" | "PRODUCER_ANGLE" | "COUNTER";

function proposalRationale(
  kind: ProposalKind,
  sound: SoundProfileValues,
  direction: CreativeDirection,
): string {
  const strongest = [...SOUND_DIMENSIONS]
    .sort((a, b) => Math.abs(sound[b]) - Math.abs(sound[a]))
    .slice(0, 2);

  const words = strongest.map((axis) =>
    sound[axis] < 0 ? soundAxisWords[axis].low : soundAxisWords[axis].high,
  );

  switch (kind) {
    case "AS_ASKED":
      return `Your idea, made properly: ${words.join(", ")}, and nothing in the way of it.`;
    case "PRODUCER_ANGLE":
      return `Same feeling, my way — ${words.join(" and ")}, built around what I know works.`;
    case "COUNTER":
      return direction.risk > 55
        ? `The version that actually earns the risk: ${words.join(", ")}.`
        : `Harder than what you asked for: ${words.join(", ")}.`;
  }
}

function proposalStance(
  kind: ProposalKind,
  overall: ProducerStance,
  profile: ProducerProfile,
): ProducerStance {
  if (kind === "AS_ASKED") return overall;
  if (kind === "PRODUCER_ANGLE") return overall === "ENTHUSIASTIC" ? "INTERESTED" : "COMPROMISING";
  // The counter-proposal is where a producer says what they actually think.
  return profile.standards >= 70 || profile.agreeableness <= 45 ? "PUSHING_BACK" : "INTERESTED";
}

function voiceFor(stance: ProducerStance, profile: ProducerProfile, random: () => number): string {
  switch (stance) {
    case "ENTHUSIASTIC":
      return pick(profile.voice.approve, random);
    case "INTERESTED":
      return pick(profile.voice.approve, random);
    case "CAUTIOUS":
    case "COMPROMISING":
      return pick(profile.voice.push, random);
    case "PUSHING_BACK":
      return pick(profile.voice.refuse, random);
  }
}

/**
 * Three ways this could go.
 *
 * One is the player's idea taken seriously, one is the producer pulling it
 * toward their own taste, and one is a counter — the record they would rather
 * make. The counter is where disagreement lives.
 */
export function interpretDirection(input: InterpretationInput): ProducerInterpretation {
  const { producer, artist, direction, round } = input;
  const profile = producer.profile;

  const seedKey = [
    INTERPRETATION_VERSION,
    producer.slug,
    artist.stageName,
    artist.archetype ?? "none",
    direction.intention,
    [...direction.moods].sort().join("|"),
    direction.energy,
    direction.risk,
    direction.audience,
    (direction.note ?? "").trim().toLowerCase(),
    input.careerAct,
    round,
  ].join(":");

  const random = seeded(hashString(seedKey));
  const asked = directionToSound(direction);
  const fit = computeFit(direction, profile);
  const stance = resolveStance(fit, profile, random);

  const kinds: ProposalKind[] = ["AS_ASKED", "PRODUCER_ANGLE", "COUNTER"];

  const proposals = kinds.map((kind, index) => {
    const sound = emptySound();

    // Every proposal starts from what was asked and who the artist already is.
    addInto(sound, asked, 1);
    addInto(sound, artist.soundDNA, 0.35);

    if (kind === "PRODUCER_ANGLE") addInto(sound, profile.soundBias, 0.9);
    if (kind === "AS_ASKED") addInto(sound, profile.soundBias, 0.2);
    if (kind === "COUNTER") {
      // The counter leans hard into the producer, and further from the brief.
      addInto(sound, profile.soundBias, 1.2);
      addInto(sound, asked, -0.35);
    }

    const shaped = normalise(sound);
    const proposalStanceValue = proposalStance(kind, stance, profile);

    const energy = clampStat(
      direction.energy +
        (kind === "COUNTER" ? (profile.adventurousness - 50) * 0.35 : 0) +
        (kind === "PRODUCER_ANGLE" ? 6 : 0),
    );

    const risk = clampStat(
      kind === "COUNTER"
        ? direction.risk * 0.5 + profile.adventurousness * 0.6
        : kind === "PRODUCER_ANGLE"
          ? (direction.risk + profile.adventurousness) / 2
          : direction.risk,
    );

    return {
      id: `${round}-${index}-${kind.toLowerCase()}`,
      title: makeTitle(random, shaped),
      rationale: proposalRationale(kind, shaped, direction),
      soundDirection: shaped,
      energy,
      risk,
      structure: pick(profile.structures, random),
      stance: proposalStanceValue,
      line: voiceFor(proposalStanceValue, profile, random),
    } satisfies ProducerProposal;
  });

  const opening =
    stance === "PUSHING_BACK"
      ? pick(profile.voice.push, random)
      : stance === "ENTHUSIASTIC"
        ? pick(profile.voice.approve, random)
        : pick(profile.voice.push, random);

  return {
    version: INTERPRETATION_VERSION,
    round,
    stance,
    opening,
    fit,
    proposals,
  };
}

/**
 * Two proposals become one.
 *
 * The combination is the midpoint of their sound with the higher of their
 * intents — a player who liked the shape of one and the nerve of the other
 * should get exactly that, not an average of everything.
 */
export function combineProposals(
  first: ProducerProposal,
  second: ProducerProposal,
  producer: { name: string; profile: ProducerProfile },
): ProducerProposal {
  const sound = emptySound();
  for (const axis of SOUND_DIMENSIONS) {
    sound[axis] = clampAxis(
      ((first.soundDirection[axis] ?? 0) + (second.soundDirection[axis] ?? 0)) / 2,
    );
  }

  const random = seeded(hashString(`${first.id}+${second.id}+${producer.name}`));

  return {
    id: `combined-${first.id}-${second.id}`,
    title: makeTitle(random, sound),
    rationale: `${first.title} and ${second.title}, folded together: the shape of one with the nerve of the other.`,
    soundDirection: sound,
    energy: Math.round((first.energy + second.energy) / 2),
    risk: Math.max(first.risk, second.risk),
    structure: first.structure,
    stance: "COMPROMISING",
    line: pick(producer.profile.voice.push, random),
  };
}

/** One-line summary of a proposal's sound, for cards and briefs. */
export function describeProposal(proposal: ProducerProposal): string {
  return describeSound(proposal.soundDirection as SoundProfileValues);
}
