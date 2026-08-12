import {
  clamp,
  roundTo,
  type BattleInteractionKind,
  type BattleResult,
  type BattleSide,
  type BattleStandingPressure,
} from "@music-rpg/shared";
import {
  CLOSE_CONTEST_MAX_MARGIN,
  FAME_LOSS_FACTOR,
  FAME_PER_HEAD_IN_ROOM,
  HEAT_PER_LOSS,
  HEAT_PER_WIN,
  RESPECT_PER_CLOSE_CONTEST,
  RESPECT_PER_LOSS,
  RESPECT_PER_WIN,
} from "./constants";
import { contestMargin } from "./resolve";

/**
 * What a battle did to a career, and to the person on the other side of it.
 *
 * Pure. Produces *proposals* — a standing pressure and a list of named
 * interactions — which the domain then applies through the systems that already
 * own those consequences. Nothing here writes, and nothing here invents a
 * currency: M8 has no battle XP, no battle tokens and no reward economy of its
 * own, and this file is where that discipline is either kept or lost.
 *
 * ## Standing
 *
 * Through M5's existing pressure model and its accrual, in the same shape
 * reception produces. A battle is a **room**, not a release:
 *
 * - **Respect** moves most. Being taken seriously by the people who were there
 *   is precisely what a battle establishes.
 * - **Heat** moves nearly as much, because competitive attention is exactly what
 *   Heat measures.
 * - **Fame** barely moves, and is scaled by the room's actual capacity. Winning a
 *   220-person rooftop accrues about a fifth of a point, which is the honest
 *   answer to whether one Underground battle makes anybody widely known.
 * - **Legacy does not appear.** There is no term for it, no coefficient for it,
 *   and no path by which a generic metric writer could let it in.
 *
 * Losing is not nothing. Showing up, being seen, and being close are all real,
 * and a model in which defeat was purely subtractive would have made declining
 * strictly better than competing — which is a different game from the one the
 * brief describes.
 */

export type ConsequenceInput = {
  result: BattleResult;
  /** Which side the career was. A player-issued challenge swaps this. */
  playerSide: BattleSide;
  /** The room. The only thing Fame reads. */
  capacity: number;
};

export function battleStandingPressure(input: ConsequenceInput): BattleStandingPressure {
  const won = input.result.winner === input.playerSide;
  const margin = contestMargin(input.result);
  const close = margin <= CLOSE_CONTEST_MAX_MARGIN;

  /*
   * How many of the panel this career actually convinced. A 2-1 defeat is not the
   * same as a 3-0 defeat, and Respect is the metric that should know the
   * difference — it is the one that measures being taken seriously.
   */
  const required = input.result.judgements.filter((entry) => entry.panelRole === "REQUIRED");
  const convinced = required.filter((entry) => entry.verdict === input.playerSide).length;
  const share = required.length > 0 ? convinced / required.length : 0;

  const respectBase = won ? RESPECT_PER_WIN : RESPECT_PER_LOSS;
  const respect = respectBase * share + (close ? RESPECT_PER_CLOSE_CONTEST * share : 0);
  const heat = won ? HEAT_PER_WIN : HEAT_PER_LOSS;
  const fame = capacityFame(input.capacity) * (won ? 1 : FAME_LOSS_FACTOR);

  return {
    fame: roundTo(Math.max(0, fame), 5),
    respect: roundTo(Math.max(0, respect), 5),
    heat: roundTo(Math.max(0, heat), 5),
    contributions: [
      {
        metric: "respect",
        input: roundTo(share * 100, 2),
        weight: respectBase,
        contribution: roundTo(respectBase * share, 5),
        note: won
          ? `Won ${input.result.decision}. Respect follows how much of the panel was actually convinced, not the fact of winning.`
          : `Lost ${input.result.decision}. Convincing ${convinced} of ${required.length} judges is worth something; being beaten is not worth nothing.`,
      },
      ...(close
        ? [
            {
              metric: "respect" as const,
              input: roundTo(margin, 4),
              weight: RESPECT_PER_CLOSE_CONTEST,
              contribution: roundTo(RESPECT_PER_CLOSE_CONTEST * share, 5),
              note: "The panel nearly went the other way. A close contest is a real fact about a room.",
            },
          ]
        : []),
      {
        metric: "heat",
        input: won ? 1 : 0,
        weight: won ? HEAT_PER_WIN : HEAT_PER_LOSS,
        contribution: roundTo(heat, 5),
        note: "Competitive attention is what Heat measures, and a battle produces it either way.",
      },
      {
        metric: "fame",
        input: input.capacity,
        weight: FAME_PER_HEAD_IN_ROOM * (won ? 1 : FAME_LOSS_FACTOR),
        contribution: roundTo(fame, 5),
        note: `${input.capacity} people were in the room. A room is not a release, and Fame reads it as exactly that many people.`,
      },
    ],
  };
}

function capacityFame(capacity: number): number {
  return clamp(capacity, 0, 100_000) * FAME_PER_HEAD_IN_ROOM;
}

/* --- What happened between the two people ---------------------------------- */

/**
 * The battle, as things that happened between two people.
 *
 * Semantic, per M6. There is no `rivalry = margin × multiplier` anywhere in this
 * milestone — a battle produces a list of *named interactions*, and the fold
 * prices those exactly as it prices a refused idea or a mastered record.
 *
 * `CRAFT_ACKNOWLEDGED` is the one that is derived rather than declared, and it is
 * the most interesting: it is emitted when the Technical judge went to somebody
 * who lost overall, which is precisely "they respect the work even though they
 * won". It is grounded in a canonical judge decision, not in a mood.
 */
export function battleInteractionsFor(input: {
  result: BattleResult;
  playerSide: BattleSide;
}): { kind: BattleInteractionKind; contestMargin: number }[] {
  const margin = contestMargin(input.result);
  const won = input.result.winner === input.playerSide;

  const kinds: BattleInteractionKind[] = [
    won ? "BATTLE_WON" : "BATTLE_LOST",
    margin <= CLOSE_CONTEST_MAX_MARGIN ? "CLOSE_CONTEST" : "DECISIVE_CONTEST",
  ];

  /*
   * The craft was acknowledged by the judge whose only question is craft, even
   * though the panel as a whole did not go that way. Real, recorded, and the
   * reason a battle can raise respect and rivalry at the same time.
   */
  const technical = input.result.judgements.find((entry) => entry.judge === "TECHNICAL");
  if (technical && technical.verdict === input.playerSide && !won) {
    kinds.push("CRAFT_ACKNOWLEDGED");
  }

  return kinds.map((kind) => ({ kind, contestMargin: margin }));
}
