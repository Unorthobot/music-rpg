import {
  BATTLE_PERFORMANCE_FACTS,
  BATTLE_SIMULATOR_VERSION,
  PERFORMANCE_FACT_CEILING,
  PERFORMANCE_FACT_FLOOR,
  clamp,
  roundTo,
  type BattlePerformance,
  type BattlePerformanceFact,
  type BattlePerformanceFacts,
  type BattlePreparation,
  type BattleSide,
  type BattleStrategy,
  type PerformanceFactDerivation,
  type PsychologyValues,
  type SkillValues,
} from "@music-rpg/shared";
import { seededFrom } from "../random";
import {
  COMPOSURE_RESILIENCE_DAMPING,
  COMPOSURE_SPREAD,
  FACT_COMPOSITION,
  MAX_PREPARATION_SESSIONS,
  PREPARATION_DISCIPLINE_FLOOR,
  PREPARATION_LIFT_PER_SESSION,
  STRATEGY_APTITUDE,
  STRATEGY_APTITUDE_FLOOR,
  STRATEGY_EMPHASIS,
} from "./constants";

/**
 * What an artist actually did on the night.
 *
 * Pure, total and deterministic: same artist, same angle, same preparation, same
 * seed, same seven facts. No database, no clock, and no `Math.random` — a result
 * nobody can reproduce cannot be explained, and explaining outcomes is the whole
 * point of the milestone.
 *
 * **No lyrics are generated and none are needed.** M8 represents a performance
 * structurally, in facts a judge can read, and the judges never see prose. A
 * fabricated verse would not have made the judging more honest; it would have
 * made it decorative, because nothing would have read it.
 *
 * ## The four things that decide a fact
 *
 * Each of the seven facts is built in the same four named steps, and every one of
 * them is kept on the row so the number can be argued with later:
 *
 * 1. **base** — the craft. What this artist can do, from skills and temperament.
 * 2. **strategyShift** — the angle. *What you actually did differently.*
 * 3. **preparationShift** — what rehearsing bought, bounded.
 * 4. **composureShift** — the night itself. Seeded, small, damped by resilience.
 *
 * The second of those is the milestone's central mechanic. Strategy is not a
 * modifier applied to a score after the fact — it changes the performance
 * *before any judge sees anything*, which is why an `OUTWRITE` round and a
 * `WIN_THE_CROWD` round are genuinely different events rather than the same event
 * scored two ways.
 */

export type PerformInput = {
  side: BattleSide;
  artistId: string;
  skills: SkillValues;
  psychology: PsychologyValues;
  strategy: BattleStrategy;
  preparation: BattlePreparation;
  /** Stable across replays. Built from the battle and the artist, never a clock. */
  seed: string;
};

/**
 * The craft underneath, before any choice was made about it.
 *
 * A weighted read of skills and psychology whose shares sum to one, so a fact is
 * always on the same 0-100 scale as the abilities behind it. Nothing here can be
 * inflated by adding another input to it.
 */
function baseFact(
  fact: BattlePerformanceFact,
  skills: SkillValues,
  psychology: PsychologyValues,
): { value: number; note: string } {
  const composition = FACT_COMPOSITION[fact];
  let total = 0;
  const parts: string[] = [];

  for (const [key, share] of Object.entries(composition.skills ?? {})) {
    const value = skills[key as keyof SkillValues] ?? 0;
    total += value * (share ?? 0);
    parts.push(`${key} ${value}×${share}`);
  }

  for (const [key, share] of Object.entries(composition.psych ?? {})) {
    const value = psychology[key as keyof PsychologyValues] ?? 0;
    total += value * (share ?? 0);
    parts.push(`${key} ${value}×${share}`);
  }

  return { value: roundTo(total, 4), note: parts.join(" + ") };
}

/**
 * How well suited this artist is to the angle they declared, 0-100.
 *
 * An angle is an attempt, not a switch. Declaring `TAKE_THEM_APART` with a
 * battle IQ of 48 is a harder plan to carry out than the same declaration at 82,
 * and this is where that difference enters — before any judge sees anything, in
 * what the round actually contained.
 */
export function strategyAptitude(
  strategy: BattleStrategy,
  skills: SkillValues,
  psychology: PsychologyValues,
): number {
  const composition = STRATEGY_APTITUDE[strategy];
  let total = 0;

  for (const [key, share] of Object.entries(composition.skills ?? {})) {
    total += (skills[key as keyof SkillValues] ?? 0) * (share ?? 0);
  }
  for (const [key, share] of Object.entries(composition.psych ?? {})) {
    total += (psychology[key as keyof PsychologyValues] ?? 0) * (share ?? 0);
  }

  return roundTo(total, 4);
}

/**
 * What preparation bought.
 *
 * Proportional to the fact it is lifting rather than to the room above it.
 * Rehearsing sharpens what an artist can already do; it does not hand them
 * ability they do not have. That is the whole of "preparation raises the ceiling
 * and does not guarantee the floor" — a prepared weak performance is a better
 * weak performance, and it still loses to a strong one.
 *
 * Discipline decides how much of the work lands, with a floor: even somebody
 * scattered gets something out of going over it.
 */
function preparationLift(
  base: number,
  preparation: BattlePreparation,
  discipline: number,
): number {
  const sessions = clamp(preparation.sessions, 0, MAX_PREPARATION_SESSIONS);
  if (sessions === 0) return 0;

  const disciplineFactor =
    PREPARATION_DISCIPLINE_FLOOR + (1 - PREPARATION_DISCIPLINE_FLOOR) * (discipline / 100);

  return roundTo(base * PREPARATION_LIFT_PER_SESSION * sessions * disciplineFactor, 4);
}

/**
 * The night itself.
 *
 * Seeded from the battle, the artist and the fact, so the same battle always
 * produces the same nerves and a replay is exact. Damped by resilience: somebody
 * who has done this a hundred times varies less than somebody who has not, which
 * is a real thing about performers and not a balancing knob.
 */
function composureShift(seed: string, fact: BattlePerformanceFact, resilience: number): number {
  const damping = 1 - COMPOSURE_RESILIENCE_DAMPING * (resilience / 100);
  const roll = seededFrom(seed, "composure", fact)();
  return roundTo((roll * 2 - 1) * COMPOSURE_SPREAD * damping, 4);
}

/**
 * One artist's round, as canonical facts.
 *
 * Returns the facts *and* the derivation of every one of them. The derivation is
 * not debug output — it is what lets World Control answer "why was their writing
 * a 71" months later under a newer engine, and it is the only reason the numbers
 * are allowed to exist at all.
 */
export function performBattleRound(input: PerformInput): BattlePerformance {
  const emphasis = STRATEGY_EMPHASIS[input.strategy];
  const facts = {} as BattlePerformanceFacts;
  const derivation: PerformanceFactDerivation[] = [];

  /*
   * How much of the angle this artist can actually deliver. Scales what an angle
   * *buys* and never what it *costs*: attempting something you are not built for
   * still trades away what the angle trades, and simply gets less back for it.
   */
  const aptitude = strategyAptitude(input.strategy, input.skills, input.psychology);
  const aptitudeFactor =
    STRATEGY_APTITUDE_FLOOR + (1 - STRATEGY_APTITUDE_FLOOR) * (aptitude / 100);

  for (const fact of BATTLE_PERFORMANCE_FACTS) {
    const base = baseFact(fact, input.skills, input.psychology);
    const declared = emphasis[fact] ?? 0;
    const strategyShift =
      declared > 0 ? roundTo(declared * aptitudeFactor, 4) : declared;
    const preparationShift = preparationLift(
      base.value,
      input.preparation,
      input.psychology.discipline,
    );
    const composure = composureShift(input.seed, fact, input.psychology.resilience);

    const value = roundTo(
      clamp(
        base.value + strategyShift + preparationShift + composure,
        PERFORMANCE_FACT_FLOOR,
        PERFORMANCE_FACT_CEILING,
      ),
      4,
    );

    facts[fact] = value;
    derivation.push({
      fact,
      base: base.value,
      strategyShift,
      preparationShift,
      composureShift: composure,
      value,
      note:
        `${base.note}` +
        (strategyShift !== 0
          ? ` · ${input.strategy} ${strategyShift > 0 ? "+" : ""}${strategyShift}` +
            (declared > 0
              ? ` (declared ${declared}, aptitude ${aptitude} for this angle)`
              : " (the angle's cost, paid in full)")
          : ` · ${input.strategy} does not touch this`) +
        (preparationShift > 0
          ? ` · ${input.preparation.sessions} session(s) prepared +${preparationShift}`
          : ""),
    });
  }

  return {
    side: input.side,
    artistId: input.artistId,
    strategy: input.strategy,
    facts,
    derivation,
    preparation: input.preparation,
    simulatorVersion: BATTLE_SIMULATOR_VERSION,
  };
}

/**
 * What this artist would have done with no angle at all.
 *
 * The Strategic judge needs it: "did the performance actually lean the way they
 * said it would" is only answerable against what leaning *nothing* would have
 * looked like for this particular artist. Computed rather than stored, because it
 * is a property of the artist and not an event that happened.
 */
export function baselineFacts(
  skills: SkillValues,
  psychology: PsychologyValues,
): BattlePerformanceFacts {
  const facts = {} as BattlePerformanceFacts;
  for (const fact of BATTLE_PERFORMANCE_FACTS) {
    facts[fact] = baseFact(fact, skills, psychology).value;
  }
  return facts;
}
