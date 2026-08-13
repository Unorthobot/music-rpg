import type {
  BattleJudge,
  BattleResult,
  BattleSide,
  BattleStrategy,
  JudgeContribution,
  JudgeDecision,
  ScoutingFinding,
} from "@music-rpg/shared";
import { battleInteractionsFor } from "./consequences";

/**
 * A battle, read out loud.
 *
 * The player-facing half of the boundary, and the same discipline reception's
 * interpretation layer and `relationships/describe.ts` hold: **deterministic
 * classification of facts that already exist**. Same decomposition, same words,
 * every time. Nothing here can change an outcome, nothing here calls a model,
 * and no sentence here says something the row does not support.
 *
 * ## Why this does not render the recorded `note`
 *
 * Every `JudgeContribution` carries a `note` explaining why that term weighed
 * what it did, and reaching for it is the obvious way to write these lines. It
 * is also wrong, because those notes are **inspector vocabulary** and several of
 * them interpolate exactly what the boundary forbids:
 *
 * - the Audience judge's `cohortTaste` note contains the room composition in
 *   full — `"Casual listeners 88%, Scene heads 9%…"` — which is cohort slugs and
 *   shares, verbatim;
 * - the Strategic judge's `intentMatch` note contains both raw strategy enum
 *   names, including **the opponent's**, which the player is specifically never
 *   allowed to know;
 * - the Audience judge's notes name the scene slug rather than the scene.
 *
 * So the notes stay in World Control, where they are correct and useful, and the
 * player-facing line is selected by **term identity** — which contribution
 * actually decided it — and then written from the closed vocabulary below. The
 * determinism guarantee is identical and the boundary is one a type can keep.
 *
 * ## What is never said
 *
 * No total, no margin, no weight, no contribution value, no performance fact, in
 * any form — including a qualitative tier read straight off a threshold, which is
 * the same number wearing a coat. These functions receive numbers and return
 * sentences about a room; no number crosses.
 */

/* --- Voice ---------------------------------------------------------------- */

/**
 * Who a sentence is about, in the four forms English needs.
 *
 * Built from a name rather than a pronoun schema, deliberately. The world states
 * pronouns for two of three rivals in biography prose and for KGOSI not at all,
 * there is no structured pronoun field anywhere in the codebase, and inferring
 * one from a name is exactly the failure that produces a game which misgenders
 * its own characters. Every phrase below reads correctly with a name or with
 * "you", and nothing needs a third form.
 */
export type BattleVoice = {
  /** Sentence-initial: "You", "KGOSI". */
  subject: string;
  /** Mid-sentence: "you", "KGOSI". */
  subjectLower: string;
  /** "your", "KGOSI's". */
  possessive: string;
  /** Object position: "you", "KGOSI". */
  object: string;
};

export function playerVoice(): BattleVoice {
  return { subject: "You", subjectLower: "you", possessive: "your", object: "you" };
}

export function rivalVoice(name: string): BattleVoice {
  return { subject: name, subjectLower: name, possessive: `${name}'s`, object: name };
}

/* --- The three perspectives ------------------------------------------------ */

/** What each judge is called, in front of a player. Never the enum. */
export const JUDGE_HEADINGS: Record<BattleJudge, string> = {
  TECHNICAL: "The writing",
  STRATEGIC: "The plan",
  AUDIENCE: "The room",
};

/**
 * One reason, per term, in the player's language.
 *
 * A closed vocabulary keyed on the judge's own term identity. Every entry is a
 * statement about what happened in a room; none is a restatement of a quantity,
 * and none can be inverted back into one — "held the angle instead of hedging
 * it" is true of a commitment differential of two points and of twenty.
 */
const TERM_PHRASES: Record<string, (voice: BattleVoice) => string> = {
  /* Technical — was this well made? */
  writing: (v) => `${v.subject} said more, and put it together better.`,
  flow: (v) => `${v.subject} sat in the pocket and stayed there.`,
  structure: (v) =>
    `${v.subject} built the round properly — setup, escalation, somewhere to land.`,
  originality: (v) => `Nobody in that room had heard what ${v.subjectLower} brought.`,
  rebuttal: (v) => `${v.subject} answered what was actually brought.`,

  /* Strategic — did they do what they set out to do? */
  intentMatch: (v) => `${v.subject} went in with a plan, and the round looked like it.`,
  commitment: (v) => `${v.subject} held the angle instead of hedging it.`,
  opponentAnswered: (v) => `${v.subject} had an answer for what the other one came with.`,
  costOfChoice: (v) => `What ${v.possessive} angle gave up was worth what it bought.`,

  /* Audience — did this work, for this crowd, in this room? */
  cohortTaste: (v) => `That room wanted what ${v.subjectLower} came with.`,
  legibility: (v) => `The room could tell exactly what ${v.subjectLower} was doing.`,
  roomHistory: (v) => `The room went with ${v.object}.`,
  sceneStanding: (v) => `That scene already knew ${v.object}.`,
};

/**
 * How much smaller than the deciding reason a second reason may be and still be
 * worth saying.
 *
 * A term that contributed a rounding error is not why anybody won, and listing
 * it would pad a sentence with something the decomposition does not really
 * support.
 */
const SECOND_REASON_SHARE = 0.25;

/** The terms that actually decided it, largest first, at most two. */
function decidingTerms(judgement: JudgeDecision): JudgeContribution[] {
  const towardVerdict = (entry: JudgeContribution): number =>
    judgement.verdict === "CHALLENGER"
      ? entry.challengerContribution - entry.opponentContribution
      : entry.opponentContribution - entry.challengerContribution;

  const ranked = [...judgement.contributions]
    .map((entry) => ({ entry, favours: towardVerdict(entry) }))
    .sort((first, second) => {
      const difference = second.favours - first.favours;
      // Ties break on the term name, so the same battle reads the same forever.
      return difference !== 0 ? difference : first.entry.term.localeCompare(second.entry.term);
    });

  const positive = ranked.filter((candidate) => candidate.favours > 0);
  /*
   * A judge whose verdict no single term favours is possible in principle — the
   * verdict follows the totals, not any one term — and the honest answer there
   * is the largest term either way rather than silence.
   */
  const usable = positive.length > 0 ? positive : ranked.slice(0, 1);

  const top = usable[0];
  if (!top) return [];

  const second = usable[1];
  const worthSaying = second && second.favours >= top.favours * SECOND_REASON_SHARE;

  return worthSaying ? [top.entry, second.entry] : [top.entry];
}

export type JudgePerspectiveInput = {
  judgement: JudgeDecision;
  /** Which side the career is. A player-issued challenge swaps this. */
  playerSide: BattleSide;
  rivalName: string;
};

export type DescribedPerspective = {
  heading: string;
  wentWith: string;
  wentWithYou: boolean;
  line: string;
};

/**
 * One judge, as a perspective.
 *
 * What it was looking at, who it went with, and why — where "why" is this
 * judge's own largest one or two differentials, said in words. No total, no
 * margin, and no sense in which two perspectives can be added together.
 */
export function describeJudgePerspective(input: JudgePerspectiveInput): DescribedPerspective {
  const { judgement, playerSide, rivalName } = input;
  const wentWithYou = judgement.verdict === playerSide;
  const voice = wentWithYou ? playerVoice() : rivalVoice(rivalName);

  const line = decidingTerms(judgement)
    .map((entry) => TERM_PHRASES[entry.term]?.(voice))
    .filter((phrase): phrase is string => Boolean(phrase))
    .join(" ");

  return {
    heading: JUDGE_HEADINGS[judgement.judge],
    wentWith: wentWithYou ? "You" : rivalName,
    wentWithYou,
    /*
     * A judge whose every term is outside the vocabulary would otherwise produce
     * an empty line, which reads as a broken screen rather than as a verdict.
     * Falling back to the bare fact is honest and says nothing extra.
     */
    line: line || `${wentWithYou ? "You" : rivalName} took this one.`,
  };
}

/* --- The result ------------------------------------------------------------ */

/**
 * "2-1" as "2–1".
 *
 * The column holds the hyphen because it is an identifier for the shape of an
 * agreement; the en dash is presentation, and doing this anywhere but here would
 * mean two surfaces formatting the same fact differently.
 */
export function formatTally(decision: string): string {
  return decision.replace(/-/g, "–");
}

/** The result, said plainly. Never softened, and never consoled. */
export function decisionHeadline(input: {
  result: BattleResult;
  playerSide: BattleSide;
  rivalName: string;
}): string {
  return input.result.winner === input.playerSide ? "YOU TAKE IT" : `${input.rivalName} TAKES IT`;
}

/* --- The player's own round ------------------------------------------------ */

/** What each angle was an attempt to do. Intent, never a modifier. */
const ROUND_INTENT: Record<BattleStrategy, string> = {
  OUTWRITE: "You went in to say something they could not answer.",
  WIN_THE_CROWD: "You went in to take the room before they could.",
  TAKE_THEM_APART: "You went in to answer everything they brought.",
};

/**
 * How the player's own round read.
 *
 * **Never enumerated.** A list of seven labelled values is a stat screen whatever
 * the labels say, and it is the single most tempting thing to build on this
 * screen because the data is right there.
 *
 * Grounded in two things the decomposition genuinely establishes: what the
 * player declared, and whether the judge whose entire mandate is *did they do
 * what they set out to do* thought they had. Those are the same facts the
 * Strategic judge used, read back rather than re-derived.
 */
export function describePlayerRound(input: {
  strategy: BattleStrategy;
  judgements: JudgeDecision[];
  playerSide: BattleSide;
}): string {
  const strategic = input.judgements.find((entry) => entry.judge === "STRATEGIC");
  const audience = input.judgements.find((entry) => entry.judge === "AUDIENCE");

  const carriedThePlan = strategic?.verdict === input.playerSide;
  const carriedTheRoom = audience?.verdict === input.playerSide;

  const execution = carriedThePlan
    ? "You carried it through."
    : "It did not come out the way you described it.";

  const room = carriedTheRoom
    ? "The room came with you."
    : "The room went somewhere else.";

  return `${ROUND_INTENT[input.strategy]} ${execution} ${room}`;
}

/* --- Afterwards ------------------------------------------------------------ */

/**
 * What became true because it happened.
 *
 * **There is no reward vocabulary here and there is no number.** Not
 * `Respect +0.45`, and not its gamified twin `Respect increased!` — both treat a
 * night in a room as a payout, and the second is worse for being deniable.
 *
 * Every line is read from the **named interactions the world actually recorded**
 * — the same `battleInteractionsFor` output M6's fold prices — rather than from
 * `battles.consequences`, which no player surface reads. The standing movement
 * is not announced at all: it is observed where standing already lives, on Home
 * and in Career, exactly as reception's is.
 */
export function describeAftermath(input: {
  result: BattleResult;
  playerSide: BattleSide;
  rivalName: string;
}): string[] {
  const kinds = new Set(
    battleInteractionsFor({ result: input.result, playerSide: input.playerSide }).map(
      (entry) => entry.kind,
    ),
  );

  const lines: string[] = [];

  if (kinds.has("BATTLE_WON")) lines.push("You took it, in front of everybody who was there.");
  if (kinds.has("BATTLE_LOST")) lines.push("You lost it, in front of everybody who was there.");

  /*
   * Closeness as a recorded world fact rather than as a judge's margin. The
   * distinction is the whole of it: `CLOSE_CONTEST` is an interaction M6 prices
   * and the relationship genuinely reflects, whereas a margin is machinery, and
   * no perspective on this screen ever says how near it was.
   */
  if (kinds.has("CLOSE_CONTEST")) lines.push("People noticed how close you made it.");
  if (kinds.has("DECISIVE_CONTEST")) lines.push("Nobody who was there is calling it close.");

  if (kinds.has("CRAFT_ACKNOWLEDGED")) {
    lines.push("The one person there to judge the writing went with you anyway.");
  }

  lines.push(`Whatever this is between you and ${input.rivalName}, it isn't finished.`);

  return lines;
}

/* --- Scouting -------------------------------------------------------------- */

/**
 * The four provenances the world genuinely owns, in the player's language.
 *
 * Every heading corresponds to a `source` the headless model already sets.
 * Nothing here invents a voice the world does not have — in particular there is
 * **no named advisor**. "LEX reckons you shouldn't try to out-perform him" reads
 * considerably better and is backed by nothing: `scoutOpponent` takes no crew
 * input and no part of the model gives a crew member an opinion about a battle.
 * That needs a real crew-advice and knowledge system, which is its own milestone.
 */
export const SCOUTING_HEADINGS: Record<ScoutingFinding["source"], string> = {
  WORLD: "What you've heard",
  SCENE: "Around the scene",
  RELATIONSHIP: "What's already between you",
  BATTLE_HISTORY: "From previous battles",
};

/** The order the sections read in. Stable, so a report never rearranges. */
const SCOUTING_ORDER: ScoutingFinding["source"][] = [
  "WORLD",
  "SCENE",
  "RELATIONSHIP",
  "BATTLE_HISTORY",
];

/**
 * One finding, as a sentence.
 *
 * Reads `observed` — the recorded values the finding was established from — and
 * returns prose. This is the only place `observed` is touched: it is not on the
 * player-facing type, so there is no path from a screen to it.
 *
 * Returns `null` for a finding shape this vocabulary does not know. Dropping an
 * unrecognised finding is deliberate and is the safe direction to fail: the
 * alternative — falling back to the raw `label` or stringifying `observed` —
 * would turn every future finding into a leak by default.
 */
function describeFinding(finding: ScoutingFinding, rivalName: string): string | null {
  const observed = finding.observed;

  if (finding.source === "SCENE") {
    const standing = Number(observed.sceneStanding ?? 0);

    if (standing >= 55) {
      return `${rivalName} carries a room here. People turn up for the night as much as for whoever is on it.`;
    }
    if (standing >= 20) {
      return `${rivalName} is known around here. Enough people would come out for this.`;
    }
    return `${rivalName} is not somebody this scene talks about much yet.`;
  }

  if (finding.source === "BATTLE_HISTORY") {
    const won = Number(observed.won ?? 0);
    const lost = Number(observed.lost ?? 0);

    if (won > lost) {
      return `${rivalName} has been in rooms like this before, and come out of them fine.`;
    }
    if (lost > won) {
      return `${rivalName} has been in rooms like this before, and not always come out on top.`;
    }
    return `${rivalName} has been in rooms like this before.`;
  }

  if (finding.source === "RELATIONSHIP") {
    const tension = Number(observed.tension ?? 0);
    const respect = Number(observed.theirRespectForYou ?? 0);

    if (tension >= 30) return "There is already something unsettled between the two of you.";
    if (respect >= 30) {
      return `${rivalName} rates what you do. That is most of why this is happening.`;
    }
    return "You two have crossed paths before, without much coming of it.";
  }

  /*
   * WORLD is a supported provenance with no finding that currently reaches it —
   * the only one the model produces is the opponent's declared angle, and
   * `knownStrategy` is always null because nobody declares an angle in advance.
   * The heading stays supported; no content is invented to fill it.
   */
  return null;
}

export type DescribedScouting = {
  sections: { heading: string; insights: string[] }[];
  unknowns: string[];
};

/**
 * What was knowable, and what was not.
 *
 * `unknowns` is a first-class half rather than a footnote, and one of them is
 * load-bearing for the whole milestone: nobody declares an angle in advance, so
 * the player chooses theirs without knowing the other one. The recorded `reason`
 * is authored prose stating exactly that, so it is read out as it stands.
 */
export function describeScouting(input: {
  findings: ScoutingFinding[];
  unknowns: { label: string; reason: string }[];
  rivalName: string;
}): DescribedScouting {
  const sections = SCOUTING_ORDER.map((source) => ({
    heading: SCOUTING_HEADINGS[source],
    insights: input.findings
      .filter((finding) => finding.source === source)
      .map((finding) => describeFinding(finding, input.rivalName))
      .filter((line): line is string => line !== null),
  })).filter((section) => section.insights.length > 0);

  return {
    sections,
    unknowns: input.unknowns.map((entry) => entry.reason),
  };
}
