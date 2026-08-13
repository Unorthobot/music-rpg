import type { BattleStrategy } from "./battles";

/**
 * A battle, as a player is allowed to see it.
 *
 * The product boundary, expressed as a type — M7's `PlayerOffer` applied to a
 * considerably more dangerous row. `battles`, `battle_performances`,
 * `battle_judgements` and `battle_scouting_reports` between them hold seven
 * performance quantities, four derivation shifts per quantity, two totals and a
 * margin per judge, every weighted contribution behind those totals, the room's
 * cohort composition, the seed, two engine versions and the whole priced
 * consequence blob. Exactly none of it belongs in front of somebody who agreed
 * to stand in a room.
 *
 * ## Why this is a type and not a review checklist
 *
 * `getCareerBattles` hands back `BattleDossier`, which contains whole rows, so
 * `dossier.judgements[0].margin` is two dots away and typechecks. Nothing in
 * this file contains a row, a fact, a total, a weight or a contribution, so the
 * same expression **does not compile**. A screen that wants a margin has to come
 * here and add a field, which is the conversation the boundary exists to force.
 *
 * That is the only version of this boundary that survives contact with a
 * deadline. "The component doesn't render it" is not a boundary; it is a promise
 * about today's components.
 *
 * ## The hardest rule, restated where it will be read
 *
 * A performance fact is never a quantity in any form. Not a number, not a bar,
 * not five stars, not a hexagon, and not a qualitative tier derived one-to-one
 * from a threshold — "Strong writing" computed from `writing >= 60` is the
 * number with a costume on. The moment a player can see that their writing was
 * a 48, the game stops being about what happened in a room and becomes a stat
 * screen, and every decision after that is an optimisation.
 *
 * Every string on this type is produced by a deterministic describer reading a
 * decomposition that already exists. No sentence here decides anything, and no
 * sentence says something the decomposition does not support.
 */

/**
 * Where a battle has got to, in the player's terms.
 *
 * Deliberately three rather than the row's seven. `CHALLENGED`, `PERFORMED` and
 * `JUDGED` are lifecycle states the engine needs and a person does not: a
 * battle that has been performed but not yet judged is a state that exists for
 * a few milliseconds inside one transaction, and surfacing it would invite a
 * screen to render a half-finished night.
 *
 * There is no `LOST` stage. A battle that has been decided is `DECIDED`,
 * whoever took it, because a player who lost has the same screen to read as a
 * player who won — and a stage vocabulary that encoded the result would make it
 * trivially easy to style one of them as a failure.
 */
export type PlayerBattleStage =
  /** Agreed to, and no angle declared yet. The night is still ahead. */
  | "AGREED"
  /** An angle is declared. Preparation is optional from here. */
  | "READY"
  /** It happened and three people said what they made of it. */
  | "DECIDED";

/** What the player is told a stage means. Never a status name. */
export const BATTLE_STAGE_LABELS: Record<PlayerBattleStage, string> = {
  AGREED: "You agreed to this",
  READY: "Going in",
  DECIDED: "Decided",
};

/**
 * The person on the other side of it.
 *
 * A name, and where they are from. Not their skills, not their psychology, not
 * their strategy aptitude, not the rivalry figure M6 holds about the two of
 * them, and not the standing the Audience judge reads. A rival is somebody who
 * called you out, and everything else the world knows about them is the world's.
 */
export type BattleRival = {
  /** Their name, as they are known. */
  name: string;
  /** Where they operate. Their origin, never a standing. */
  origin: string | null;
  /** The conversation they called you out in, when one exists. */
  conversationId: string | null;
};

/** The night, as a person would describe it. */
export type BattleNight = {
  at: Date;
  /** The room it happens in. */
  venueName: string | null;
  /** The scene the room is in. */
  sceneName: string | null;
  /** How many people are in it. A room's size is a public fact about the room. */
  capacity: number | null;
};

/**
 * What preparing has cost so far, and what is left.
 *
 * The days matter more than the money and are listed first for that reason. The
 * model's whole justification for preparation is that it spends *the studio time
 * a record could otherwise have had*, so an interface showing only a fee has
 * hidden the actual price and turned a career decision into a purchase.
 *
 * Both figures are the player's own choices and their own spend. Neither is a
 * simulation internal, and neither implies a probability — nothing on this type
 * says what preparation buys, because the honest answer is "sharpening", not a
 * number of percentage points.
 */
export type BattlePreparationState = {
  sessions: number;
  maxSessions: number;
  /** In minor units, formatted at the edge. What the ledger actually moved. */
  spendMinor: number;
  /** Game days these sessions occupied. Days a record could have had. */
  daysCommitted: number;
  /** What one more session would cost, while there is one left to book. */
  nextSessionCostMinor: number | null;
};

/**
 * One angle, as intent.
 *
 * `label` and `intent` are artistic and competitive statements. There is
 * deliberately no field here for what an angle does to a performance fact,
 * because the answer would be a modifier and a modifier is a number the player
 * would optimise against. What an angle *is* is a decision about how to go into
 * a room.
 */
export type BattleStrategyOption = {
  strategy: BattleStrategy;
  label: string;
  intent: string;
};

/**
 * One provenance, and what it actually told you.
 *
 * The heading is the *source the world genuinely owns*, translated — never the
 * internal model in adjectives. "Writing: Strong" is a character sheet and is
 * forbidden; "Around the scene: KGOSI carries a room in Braamfontein" is a thing
 * the world recorded and can stand behind.
 *
 * `ScoutingFinding.observed` — the raw values the finding was established from —
 * is read by the describer inside the query module and **does not exist on this
 * type**. There is no path from a screen to it.
 */
export type BattleScoutingSection = {
  /** "What you've heard", "Around the scene", … Never a `source` enum. */
  heading: string;
  insights: string[];
};

/**
 * What was knowable, and what was not.
 *
 * `unknowns` is a first-class half rather than a footnote. A report that quietly
 * omitted what it could not establish would imply the world knows more about a
 * stranger than it does — and one specific unknown is load-bearing for the whole
 * milestone: nobody declares an angle in advance, so the player chooses theirs
 * without knowing the other one.
 */
export type BattleScouting = {
  sections: BattleScoutingSection[];
  unknowns: string[];
};

/**
 * One judge, as a perspective rather than as a score.
 *
 * Three fields, and the absences are the design. There is no total here, no
 * margin, no weight, no contribution and no term name. What a perspective
 * produces is: what it was looking at, who it went with, and why — in words,
 * generated deterministically from that judge's own decomposition.
 */
export type BattleJudgePerspective = {
  /** "The writing", "The plan", "The room". Never TECHNICAL/STRATEGIC/AUDIENCE. */
  heading: string;
  /** Who it went with, by name. "KGOSI", or the player's own name. */
  wentWith: string;
  /** True when this is the player's side. Lets a dissent be styled as one. */
  wentWithYou: boolean;
  /** Why, qualitatively, from this judge's largest differentials. */
  line: string;
};

/**
 * What three people made of it.
 *
 * **Not a scorecard**, and that word appears nowhere in this codebase. The shape
 * foregrounds the three perspectives; the tally is the *shape of the panel's
 * agreement* rather than a measure of how good anybody was.
 *
 * `split` exists so a 2-1 can be rendered as the materially different night it
 * is. A player who carried one perspective was not simply beaten, and a screen
 * that could not tell the difference would flatten the one property the judging
 * model was built to have.
 */
export type BattleDecision = {
  /** "KGOSI TAKES IT". The result, said plainly. */
  headline: string;
  /** "2–1", with an en dash. The column holds "2-1"; this is presentation. */
  tally: string;
  /** True when the panel did not agree. */
  split: boolean;
  /** True when the player took it. Not a stage, and never styled as a reward. */
  wonByPlayer: boolean;
  /** Three perspectives, in panel order. Stacked at every width. */
  perspectives: BattleJudgePerspective[];
  /** The player's own round, in the same register. Never enumerated. */
  yourRound: string;
  /**
   * What became true because it happened, in the world's own terms.
   *
   * Read from the judged result and the recorded interactions. **Never from
   * `battles.consequences`** — no player surface reads that column. These are
   * sentences about a room and the people in it, never "Respect +0.45" and never
   * its gamified twin "Respect increased!". Both treat a night as a payout.
   */
  aftermath: string[];
};

/**
 * A battle the player is in, or has been in.
 *
 * Every field is something a person who was there would know. There is no field
 * whose honest rendering is a quantity to optimise against.
 */
export type PlayerBattle = {
  /**
   * The battle's own id.
   *
   * The one identifier that crosses, and it crosses precisely so every surface
   * resolves to the same row — the calendar entry, the notification, the route
   * and the career's memory of it are one battle, not four readings of one.
   */
  id: string;
  rival: BattleRival;
  night: BattleNight;
  stage: PlayerBattleStage;
  stageLabel: string;
  /**
   * They agreed and have not said how they are going in.
   *
   * The one piece of state on this type that the *world* acts on rather than
   * only displaying: game time cannot cross a night the player has committed to
   * without this answered. That is a consequence of their own commitment, not a
   * nudge toward battling — declining was free and remains a complete answer.
   */
  awaitingAngle: boolean;
  /** What the world will not let time pass through, said as a person would. */
  awaitingAngleLine: string | null;
  /** Their own words when they called you out. */
  challengeLine: string | null;
  /** What the arrangement is. */
  termsLine: string | null;
  /** The angle, once declared. Null until it is. */
  strategy: BattleStrategy | null;
  strategyLabel: string | null;
  strategyIntent: string | null;
  preparation: BattlePreparationState;
  /** What was knowable about them, once looked into. Null until scouted. */
  scouting: BattleScouting | null;
  /** What three people made of it. Null until the night has happened. */
  decision: BattleDecision | null;
  /** The night on the calendar. */
  calendarItemId: string | null;
  /** Where the player goes. One canonical route per battle. */
  href: string;
  /** When they agreed to it, for ordering and for history. */
  agreedAt: Date;
};

/**
 * A challenge that was refused.
 *
 * Deliberately its own type, and deliberately not a `PlayerBattle` with a
 * `TURNED_DOWN` stage. **Declining creates no battle** — no row, no night, no
 * commitment, nothing to prepare for — and giving a refusal the same shape as a
 * fought battle would be the first step toward rendering it as one, which is the
 * failure the whole decline path exists to prevent.
 *
 * There is nothing here about consequence, because there is no consequence to
 * describe. `CHALLENGE_DECLINED` cannot move respect in either direction, and an
 * artist who does not battle is an artist who does not battle.
 */
export type DeclinedChallenge = {
  /** The opportunity's id. There is no battle id, because there is no battle. */
  id: string;
  rivalName: string;
  /** The night that is not happening. */
  night: Date | null;
  sceneName: string | null;
  /** "You turned this down." Neutral, in the register of a declined booking. */
  line: string;
  declinedAt: Date;
};
