import {
  SOUND_DIMENSIONS,
  type PsychologyKey,
  type SkillKey,
  type SoundDimension,
  type SoundProfileValues,
} from "@music-rpg/shared";

/**
 * Turning simulation numbers into language.
 *
 * The player never sees a raw 0–100 skill or a hidden psychology value in M1 —
 * they see what those numbers *mean*. Keeping that translation in one place
 * stops components from inventing their own vocabulary.
 */

type AxisWords = {
  /** Word for the negative pole. */
  low: string;
  /** Word for the positive pole. */
  high: string;
  /** What the sound is "built around" at each pole. */
  lowFocus: string;
  highFocus: string;
  /** Human labels for the axis ends, used by the Tune It control. */
  lowLabel: string;
  highLabel: string;
};

export const soundAxisWords: Record<SoundDimension, AxisWords> = {
  darkBright: {
    low: "dark",
    high: "bright",
    lowFocus: "introspection",
    highFocus: "lift and colour",
    lowLabel: "Dark",
    highLabel: "Bright",
  },
  rawPolished: {
    low: "raw",
    high: "polished",
    lowFocus: "texture and imperfection",
    highFocus: "control and finish",
    lowLabel: "Raw",
    highLabel: "Polished",
  },
  minimalDense: {
    low: "sparse",
    high: "dense",
    lowFocus: "space",
    highFocus: "layered detail",
    lowLabel: "Minimal",
    highLabel: "Dense",
  },
  organicElectronic: {
    low: "organic",
    high: "electronic",
    lowFocus: "live playing",
    highFocus: "synthetic texture",
    lowLabel: "Organic",
    highLabel: "Electronic",
  },
  classicFuturistic: {
    low: "classicist",
    high: "futurist",
    lowFocus: "tradition",
    highFocus: "forward design",
    lowLabel: "Classic",
    highLabel: "Futuristic",
  },
  accessibleExperimental: {
    low: "immediate",
    high: "unconventional",
    lowFocus: "immediacy",
    highFocus: "unconventional structure",
    lowLabel: "Accessible",
    highLabel: "Experimental",
  },
  melodicRhythmic: {
    low: "melodic",
    high: "rhythm-led",
    lowFocus: "melody",
    highFocus: "rhythm",
    lowLabel: "Melodic",
    highLabel: "Rhythmic",
  },
  intimateAnthemic: {
    low: "intimate",
    high: "anthemic",
    lowFocus: "closeness",
    highFocus: "scale",
    lowLabel: "Intimate",
    highLabel: "Anthemic",
  },
};

/**
 * The axes "Tune It" exposes.
 *
 * A deliberate subset: the player adjusts characteristics they can hear and
 * name, while the rest of the Sound DNA stays derived. Showing all eight
 * sliders would turn identity into a character-creator spreadsheet.
 */
export const TUNABLE_SOUND_AXES = [
  "darkBright",
  "rawPolished",
  "minimalDense",
  "intimateAnthemic",
] as const satisfies readonly SoundDimension[];

export type TunableSoundAxis = (typeof TUNABLE_SOUND_AXES)[number];

const DESCRIPTOR_THRESHOLD = 0.22;

function rankedAxes(sound: SoundProfileValues): { axis: SoundDimension; value: number }[] {
  return SOUND_DIMENSIONS.map((axis) => ({ axis, value: sound[axis] }))
    .filter((entry) => Math.abs(entry.value) >= DESCRIPTOR_THRESHOLD)
    // Stable: strongest first, then declaration order for ties.
    .sort((a, b) => {
      const delta = Math.abs(b.value) - Math.abs(a.value);
      if (delta !== 0) return delta;
      return SOUND_DIMENSIONS.indexOf(a.axis) - SOUND_DIMENSIONS.indexOf(b.axis);
    });
}

/** Two or three adjectives, strongest first: ["dark", "sparse", "electronic"]. */
export function soundAdjectives(sound: SoundProfileValues, limit = 3): string[] {
  return rankedAxes(sound)
    .slice(0, limit)
    .map(({ axis, value }) => (value < 0 ? soundAxisWords[axis].low : soundAxisWords[axis].high));
}

/**
 * The one-line description shown on the reveal screen, e.g.
 * "Dark, sparse, electronic music built around introspection and unconventional structure."
 */
export function describeSound(sound: SoundProfileValues): string {
  const ranked = rankedAxes(sound);

  if (ranked.length === 0) {
    return "Unsettled and still forming — a sound that hasn't picked a side yet.";
  }

  const adjectives = soundAdjectives(sound);
  const focuses = ranked
    .slice(0, 2)
    .map(({ axis, value }) =>
      value < 0 ? soundAxisWords[axis].lowFocus : soundAxisWords[axis].highFocus,
    );

  const adjectivePhrase = adjectives.join(", ");
  const focusPhrase = focuses.length > 1 ? `${focuses[0]} and ${focuses[1]}` : focuses[0];
  const sentence = `${adjectivePhrase} music built around ${focusPhrase}.`;

  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Short qualitative band for a 0–100 stat. Never shows the number itself. */
export function describeStat(value: number): string {
  if (value >= 85) return "Exceptional";
  if (value >= 70) return "Strong";
  if (value >= 55) return "Capable";
  if (value >= 40) return "Developing";
  if (value >= 25) return "Untested";
  return "Raw";
}

const SKILL_LABELS: Record<SkillKey, string> = {
  lyricism: "Lyricism",
  flow: "Flow",
  melody: "Melody",
  storytelling: "Storytelling",
  performance: "Performance",
  production: "Production",
  experimentation: "Experimentation",
  versatility: "Versatility",
  battleIQ: "Battle IQ",
};

const PSYCHOLOGY_LABELS: Record<PsychologyKey, string> = {
  confidence: "Confidence",
  discipline: "Discipline",
  ambition: "Ambition",
  resilience: "Resilience",
  ego: "Ego",
  patience: "Patience",
  adaptability: "Adaptability",
  riskTolerance: "Risk tolerance",
  competitiveness: "Competitiveness",
};

export function skillLabel(key: SkillKey): string {
  return SKILL_LABELS[key];
}

export function psychologyLabel(key: PsychologyKey): string {
  return PSYCHOLOGY_LABELS[key];
}

/** The two or three skills worth naming as strengths on the reveal screen. */
export function topSkills(
  skills: Record<SkillKey, number>,
  limit = 3,
): { key: SkillKey; label: string; value: number; descriptor: string }[] {
  return (Object.keys(SKILL_LABELS) as SkillKey[])
    .map((key) => ({ key, label: SKILL_LABELS[key], value: skills[key], descriptor: describeStat(skills[key]) }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * Qualitative personality line for NPC candidates: the player sees "Strong
 * ambition", never "ambition: 78".
 */
export function describePersonality(psychology: Record<PsychologyKey, number>): string {
  const ranked = (Object.keys(PSYCHOLOGY_LABELS) as PsychologyKey[])
    .map((key) => ({ key, value: psychology[key] }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));

  const top = ranked[0];
  if (!top) return "Hard to read";
  return `${describeStat(top.value)} ${PSYCHOLOGY_LABELS[top.key].toLowerCase()}`;
}
