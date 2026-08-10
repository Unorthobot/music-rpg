import {
  SOUND_DIMENSIONS,
  clampStat,
  type PsychologyValues,
  type SoundProfileValues,
} from "@music-rpg/shared";

/**
 * Formation-time chemistry.
 *
 * Deliberately shallow: M1 only needs an honest starting number for the group
 * reveal. Real group simulation (drift, resentment, splits) lands later and
 * will read the same membership fields this seeds.
 */
export type ChemistryMember = {
  sound: SoundProfileValues;
  psychology: PsychologyValues;
};

export type ChemistryResult = {
  score: number;
  /** Player-facing explanation. Never exposes the underlying numbers. */
  summary: string;
  /** Honest trade-offs, shown on the group review step. */
  tensions: string[];
  strengths: string[];
};

function soundDistance(a: SoundProfileValues, b: SoundProfileValues): number {
  const total = SOUND_DIMENSIONS.reduce((sum, axis) => sum + Math.abs(a[axis] - b[axis]), 0);
  return total / SOUND_DIMENSIONS.length; // 0 (identical) .. 2 (opposite)
}

export function computeChemistry(members: ChemistryMember[]): ChemistryResult {
  if (members.length < 2) {
    return {
      score: 70,
      summary: "Too early to tell — one voice, one direction.",
      tensions: [],
      strengths: ["A single creative direction, unopposed."],
    };
  }

  let pairs = 0;
  let distanceTotal = 0;
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) {
      distanceTotal += soundDistance(members[i]!.sound, members[j]!.sound);
      pairs += 1;
    }
  }

  const averageDistance = pairs === 0 ? 0 : distanceTotal / pairs;
  // Some distance is healthy — identical taste makes a flat record. The curve
  // peaks around a moderate spread rather than at zero.
  const alignment = 100 - Math.abs(averageDistance - 0.35) * 110;

  const avg = (pick: (p: PsychologyValues) => number) =>
    members.reduce((sum, member) => sum + pick(member.psychology), 0) / members.length;

  const egoPressure = Math.max(0, avg((p) => p.ego) - 60) * 0.6;
  const adaptabilityBonus = (avg((p) => p.adaptability) - 50) * 0.25;
  const disciplineBonus = (avg((p) => p.discipline) - 50) * 0.2;
  const soloDrift = Math.max(0, avg((p) => p.ambition) - 70) * 0.3;

  const score = clampStat(alignment + adaptabilityBonus + disciplineBonus - egoPressure - soloDrift);

  const strengths: string[] = [];
  const tensions: string[] = [];

  if (averageDistance < 0.25) strengths.push("Everyone hears the same record. Sessions will move fast.");
  else if (averageDistance < 0.6) strengths.push("Enough overlap to agree, enough difference to argue usefully.");
  else tensions.push("Wide taste gap — early sessions will be slow and loud.");

  if (avg((p) => p.adaptability) >= 62) strengths.push("This group bends without breaking.");
  if (avg((p) => p.discipline) >= 65) strengths.push("Work ethic is not going to be the problem.");
  if (avg((p) => p.ego) >= 65) tensions.push("Strong egos. Credit will become a conversation.");
  if (avg((p) => p.ambition) >= 72) tensions.push("High individual ambition — solo pull is real here.");
  if (avg((p) => p.patience) <= 40) tensions.push("Low collective patience. Expect fast decisions, some regretted.");

  const summary =
    score >= 78
      ? "Immediate. This works the first time you're all in a room."
      : score >= 60
        ? "Workable. Real friction, but the kind that makes records."
        : score >= 42
          ? "Volatile. Talent is not the issue — agreement is."
          : "Combustible. Something great or something short.";

  return { score, summary, tensions, strengths };
}
