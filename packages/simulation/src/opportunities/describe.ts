import {
  OPPORTUNITY_CONFLICT_LABELS,
  type CandidateAssessment,
  type EligibilityRule,
  type OpportunityConflictKind,
  type RankingContribution,
} from "@music-rpg/shared";

/**
 * The director, read out loud.
 *
 * Deterministic classification of decisions the director already made — the same
 * boundary reception's interpretation layer holds. Same facts, same words, every
 * time; nothing here can change an outcome, and nothing here calls a model.
 *
 * These are for World Control. The player never sees a rule name, a weight or a
 * score, and the moment they do, the director has stopped being a simulation and
 * started being a spreadsheet.
 */

/** Why a candidate failed, in a phrase an operator can scan a list of. */
export const ELIGIBILITY_RULE_LABELS: Record<EligibilityRule, string> = {
  NOT_ALREADY_OFFERED: "Already offered",
  SOURCE_NOT_ALREADY_WAITING: "They're already waiting on you",
  SOURCE_IS_ACTIVE: "Nobody there to offer it",
  HAS_SOMETHING_TO_PLAY: "Nothing to play",
  SCENE_KNOWS_YOU: "Scene doesn't know you",
  RECORD_IS_MOVING: "Nothing moving",
  NIGHT_IS_FREE: "Night already booked",
  WORKED_TOGETHER: "Never worked together",
  THEY_RATE_THE_WORK: "They don't rate it yet",
  SOMETHING_LEFT_TO_DO: "No reason to go again",
  NOT_MID_SESSION: "Already in a session",
};

export function conflictLabel(kind: OpportunityConflictKind): string {
  return OPPORTUNITY_CONFLICT_LABELS[kind];
}

/**
 * One line saying why this appeared, or why it did not.
 *
 * The three answers are deliberately different sentences, because the whole point
 * of keeping eligibility and ranking apart is that "you have nothing to perform"
 * and "something else was more relevant" must never come out sounding the same.
 */
export function explainAssessment(assessment: CandidateAssessment): string {
  if (assessment.suppressedBy === "INELIGIBLE") {
    const failures = assessment.eligibility.checks.filter((check) => !check.passed);
    const named = failures.map((check) => ELIGIBILITY_RULE_LABELS[check.rule]).join(", ");
    return `Not possible — ${named.toLowerCase()}.`;
  }

  if (assessment.suppressedBy === "OUTRANKED_BY_CAP") {
    return `Possible, and ranked ${assessment.rank} — something more relevant came first.`;
  }

  return `Offered, ranked ${assessment.rank} on ${assessment.ranking?.score ?? 0}.`;
}

/** A score, spelled out term by term. Largest contribution first. */
export function explainRanking(contributions: RankingContribution[]): string[] {
  return [...contributions]
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .map(
      (entry) =>
        `${entry.term} ${entry.contribution >= 0 ? "+" : ""}${entry.contribution} (${entry.input} × ${entry.weight}) — ${entry.note}`,
    );
}
