import {
  PHASE_BLOCKERS,
  PROGRESSION_EVALUATOR_VERSION,
  RECOGNITION_DOMAINS,
  type DomainFirstReached,
  type EvidenceFacts,
  type EvidenceResult,
  type ObservationUpdate,
  type PhaseBlocker,
  type PhaseDecision,
  type ProgressionObservation,
  type RecognitionDomain,
} from "@music-rpg/shared";
import { evaluateEvidence } from "./evaluate";

/**
 * When did the world first say so?
 *
 * The only thing about a phase that cannot be recovered by folding current
 * state. Whether a career qualifies *now* is a pure function of facts other
 * milestones already own; the day each domain first became true is not, so it
 * is written down.
 *
 * **There is no durability window, and its absence is a measured finding.** The
 * brief specified that breadth had to hold continuously for a number of game
 * days. Nothing in this world can lose a domain — reception counters are
 * monotonic, the event log is append-only, PEER is history, and no command
 * writes `CREW_STATUSES.LEFT` — so a window could only ever delay a transition,
 * never test it. Seven, fourteen and twenty-one days were compared and each
 * produced exactly `second-domain day + N`. What survives is history:
 * first-reached timestamps, set once and never cleared.
 *
 * Everything here is pure. It takes the observation as last written, the
 * evidence as it stands and the career's own clock, and returns the observation
 * as it should now be. The domain writes it; nothing here touches a database,
 * and nothing here reads a wall clock.
 */

/** An observation for a career that has never been evaluated. */
export function emptyObservation(careerId: string): ProgressionObservation {
  return {
    careerId,
    domainFirstReached: {},
    lastEvaluatedGameTime: null,
    evaluatorVersion: PROGRESSION_EVALUATOR_VERSION,
  };
}

/**
 * Record the day each domain was first reached. **Never clears.**
 *
 * Two cases and no third: a domain that is true and has no timestamp gets one,
 * and everything else is left exactly as it was. A domain that is currently
 * false does *not* have its timestamp removed — the day a record first landed
 * is still the day it first landed, whatever happens afterwards. This is
 * history, not qualification state.
 */
function advanceFirstReached(
  previous: DomainFirstReached,
  evidence: EvidenceResult,
  currentGameTime: Date,
): { next: DomainFirstReached; newlyReached: RecognitionDomain[] } {
  const next: DomainFirstReached = { ...previous };
  const newlyReached: RecognitionDomain[] = [];

  for (const domain of RECOGNITION_DOMAINS) {
    if (!evidence.satisfiedDomains.includes(domain)) continue;
    if (next[domain]) continue;
    next[domain] = currentGameTime;
    newlyReached.push(domain);
  }

  return { next, newlyReached };
}

export type ObservationInput = {
  previous: ProgressionObservation;
  evidence: EvidenceResult;
  currentGameTime: Date;
};

/**
 * The observation, advanced by one evaluation.
 *
 * Pure bookkeeping that decides nothing: it records when domains were first
 * reached and reports which of them arrived today.
 */
export function advanceObservation(input: ObservationInput): ObservationUpdate {
  const { previous, evidence, currentGameTime } = input;
  const { next, newlyReached } = advanceFirstReached(
    previous.domainFirstReached,
    evidence,
    currentGameTime,
  );

  return {
    observation: {
      careerId: previous.careerId,
      domainFirstReached: next,
      lastEvaluatedGameTime: currentGameTime,
      evaluatorVersion: PROGRESSION_EVALUATOR_VERSION,
    },
    newlyReached,
  };
}

/**
 * The most specific true reason this career is not coming up.
 *
 * `RECEPTION_ONLY` is asked *before* breadth, deliberately. A runaway record
 * with no second domain fails both conditions, and "not enough domains" would
 * be technically true and useless — the answerable question is *which* kind of
 * recognition is missing, and for the classic one-dimensional career the honest
 * answer is that a record landed and nothing beyond it ever happened.
 *
 * A career with no domains at all still gets `NOT_ENOUGH_DOMAINS`, because
 * there is nothing more specific to say about it.
 */
function blockerFor(facts: EvidenceFacts, evidence: EvidenceResult): PhaseBlocker | null {
  if (facts.careerAct !== "UNDERGROUND") return "ALREADY_TRANSITIONED";
  if (evidence.satisfiedDomains.length > 0 && !evidence.beyondReception) return "RECEPTION_ONLY";
  if (!evidence.breadth) return "NOT_ENOUGH_DOMAINS";
  return null;
}

/**
 * Why this career is, or is not, leaving the Underground.
 *
 * The whole model in one call: the evidence, the history, and the single
 * boolean that follows. Evaluated for every career on every advance including
 * careers that have already transitioned — the answer for those is
 * `ALREADY_TRANSITIONED` rather than silence, because "this career is past that
 * question" is information the inspector needs and an empty result is not.
 *
 * A career past the Underground never transitions again here. M9 implements one
 * transition, `UNDERGROUND → COME_UP`, and the phase is monotonic: nothing in
 * this codebase writes `UNDERGROUND` over `COME_UP`, because `ACT_REACH` would
 * make a later record reach fewer people for reasons no player can see and
 * `availableFormats` would revoke an album a career already has eight tracks
 * toward. The scene does not un-know you.
 */
export function decidePhase(
  facts: EvidenceFacts,
  previous: ProgressionObservation,
): PhaseDecision {
  const evidence = evaluateEvidence(facts);
  const observation = advanceObservation({
    previous,
    evidence,
    currentGameTime: facts.currentGameTime,
  });

  const blockedBy = blockerFor(facts, evidence);

  return {
    careerId: facts.careerId,
    fromAct: facts.careerAct,
    currentGameTime: facts.currentGameTime,
    evidence,
    observation,
    transitions: blockedBy === null,
    blockedBy,
  };
}

/** Exported so the inspector can label a blocker without repeating the list. */
export const PHASE_BLOCKER_LABELS: Record<PhaseBlocker, string> = {
  ALREADY_TRANSITIONED: "Already past the Underground",
  NOT_ENOUGH_DOMAINS: "The world has not changed how it relates to this career in enough ways",
  RECEPTION_ONLY: "A record landed, and nothing beyond it has happened",
};

/* A compile-time guarantee that the labels stay exhaustive. */
void PHASE_BLOCKERS;
