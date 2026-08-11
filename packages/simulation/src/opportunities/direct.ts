import {
  MAX_LIVE_OPPORTUNITIES as CAP,
  SESSION_INVITE_ANSWER_DAYS,
  SESSION_INVITE_NOTICE_DAYS,
} from "./constants";
import {
  OPPORTUNITY_DIRECTOR_VERSION,
  roundTo,
  type CandidateAssessment,
  type DirectorFacts,
  type EligibilityResult,
  type OpportunityCandidate,
  type PersonFacts,
  type RankingResult,
  type ShowcaseBilling,
} from "@music-rpg/shared";
import { sessionInviteEligibility, showcaseEligibility } from "./eligibility";
import { rankSessionInvite, rankShowcase } from "./ranking";
import { sceneStanding } from "./standing";

/**
 * The director.
 *
 * Given a world and a career, what could plausibly happen now? Pure, total, and
 * deterministic: same facts in, same decisions out, no clock, no randomness and
 * no database. Everything that writes lives in the domain command; everything
 * that *decides* lives here, so the decisions can be tested without a world
 * being built around them.
 *
 * There is no seed and no jitter anywhere in this file, deliberately. Reception
 * is stochastic because an audience is; what the world is willing to offer you is
 * not a dice roll, and a director that rerolled would make its own explanations
 * untrue.
 *
 * The order is fixed and the two gates never mix. Candidates are assembled from
 * what the world contains, eligibility decides which of them could exist,
 * ranking orders only those, and the cap decides how many of the ordered set are
 * worth a player's attention. A candidate cut by the cap was still a real
 * opportunity — it simply was not the most relevant one — and that is a different
 * fact from having failed a condition, kept separately all the way through.
 */

const DAY = 24 * 60 * 60 * 1000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY);
}

/** Identity for a promoter's night. Source and trigger, never the kind. */
export function showcaseIdentityKey(promoterSlug: string, nightGameTime: Date): string {
  return `promoter:${promoterSlug}:night:${nightGameTime.toISOString().slice(0, 10)}`;
}

/** Identity for one person asking for one more session, once per record out. */
export function sessionInviteIdentityKey(producerSlug: string, releaseId: string): string {
  return `producer:${producerSlug}:after:${releaseId}`;
}

/* --- Assembling what the world could offer -------------------------------- */

function showcaseCandidate(
  facts: DirectorFacts,
  promoter: PersonFacts,
): OpportunityCandidate | null {
  const profile = promoter.promoter;
  if (!profile) return null;

  const scene = facts.scenes.find((entry) => entry.slug === profile.sceneSlug);
  if (!scene) return null;

  const nightGameTime = addDays(facts.currentGameTime, profile.noticeDays);
  const standing = sceneStanding(profile.sceneSlug, facts.cohorts);

  /*
   * Which end of the bill. The same promoter, the same room, the same night — and
   * a materially different offer, decided by how well the scene actually knows
   * this career rather than by anything about the offer itself.
   */
  const billing: ShowcaseBilling =
    standing.value >= profile.standard ? "HEADLINE" : "SUPPORT";

  return {
    identityKey: showcaseIdentityKey(promoter.slug, nightGameTime),
    type: "SHOWCASE_SLOT",
    origin: "GENERATED",
    sourceEntityType: "CHARACTER",
    sourceEntityId: promoter.characterId,
    sceneId: scene.id,
    sceneSlug: scene.slug,
    triggerReason:
      billing === "HEADLINE"
        ? `${promoter.name} has a night at ${profile.nightName} and rates you enough to build it around you.`
        : `${promoter.name} has a night at ${profile.nightName} and room on the bill for somebody the scene is still learning.`,
    /*
     * The world as it stood. Kept with the row so the offer can be explained
     * months later without re-reading a world that has moved on.
     */
    triggerState: {
      sceneStanding: standing.value,
      sceneStandingContributors: standing.contributors,
      billing,
      promoterStandard: profile.standard,
      promoterSupportStandard: profile.supportStandard,
      momentum: roundTo(
        facts.releases.reduce((highest, release) => Math.max(highest, release.momentum), 0),
        3,
      ),
      heat: facts.standing.heat,
      respect: facts.standing.respect,
      releasesOut: facts.releases.filter((release) => release.daysSimulated > 0).length,
    },
    payload: {
      promoterName: promoter.name,
      nightName: profile.nightName,
      sceneName: scene.name,
      billing,
      capacity: profile.capacity,
      payoutMinor:
        billing === "HEADLINE" ? profile.payoutMinor : profile.supportPayoutMinor,
      offerLine: profile.offerLine,
      termsLine: profile.termsLine,
      nightGameTime: nightGameTime.toISOString(),
    },
    availableAtGameTime: facts.currentGameTime,
    /*
     * A promoter whose date has passed does not wait. Never later than the night
     * itself, and usually sooner, because they have a bill to finish.
     */
    expiresAtGameTime: addDays(
      facts.currentGameTime,
      Math.min(profile.answerByDays, profile.noticeDays),
    ),
  };
}

function sessionInviteCandidate(
  facts: DirectorFacts,
  producer: PersonFacts,
): OpportunityCandidate | null {
  /*
   * Keyed to the most recent record, so "let's do another one" is asked once per
   * thing you have actually finished together rather than once per day.
   */
  const latest = [...facts.releases].sort(
    (a, b) => b.releasedGameTime.getTime() - a.releasedGameTime.getTime(),
  )[0];
  if (!latest) return null;

  const state = producer.relationship;

  return {
    identityKey: sessionInviteIdentityKey(producer.slug, latest.releaseId),
    type: "SESSION_INVITE",
    origin: "GENERATED",
    sourceEntityType: "CHARACTER",
    sourceEntityId: producer.characterId,
    sceneId: null,
    sceneSlug: null,
    triggerReason: producer.openMomentKinds.includes("WANTS_ANOTHER_SESSION")
      ? `${producer.name} has already said they want to go again.`
      : `${producer.name} rates what you made together and the room worked.`,
    triggerState: {
      respect: roundTo(state?.respect ?? 0, 3),
      trust: roundTo(state?.trust ?? 0, 3),
      creativeChemistry: roundTo(state?.creativeChemistry ?? 0, 3),
      tension: roundTo(state?.tension ?? 0, 3),
      interactionCount: producer.interactionCount,
      // M6's, read. The director does not detect moments.
      openMomentKinds: producer.openMomentKinds,
      afterRelease: latest.releaseId,
      afterReleaseTitle: latest.title,
    },
    payload: {
      producerName: producer.name,
      sessionCostMinor: producer.sessionCostMinor,
      afterReleaseTitle: latest.title,
      proposedGameTime: addDays(facts.currentGameTime, SESSION_INVITE_NOTICE_DAYS).toISOString(),
    },
    availableAtGameTime: facts.currentGameTime,
    expiresAtGameTime: addDays(facts.currentGameTime, SESSION_INVITE_ANSWER_DAYS),
  };
}

/**
 * Everything the world could put in front of this career today.
 *
 * Assembled from what the world actually contains — the promoters it has, the
 * scenes they book in, the people this career has worked with — rather than from
 * a table of situations. A world with no promoters offers no nights, which is the
 * correct behaviour and was the actual state of the game until this milestone.
 */
export function assembleCandidates(facts: DirectorFacts): OpportunityCandidate[] {
  const candidates: OpportunityCandidate[] = [];

  const promoters = facts.people
    .filter((person) => person.promoter !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  for (const promoter of promoters) {
    const candidate = showcaseCandidate(facts, promoter);
    if (candidate) candidates.push(candidate);
  }

  /*
   * Only people this career has actually been in a room with. Everybody else has
   * nothing to go on, and M6 is right not to give them an opinion.
   */
  const collaborators = facts.people
    .filter((person) => person.promoter === null && person.interactionCount > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  for (const producer of collaborators) {
    const candidate = sessionInviteCandidate(facts, producer);
    if (candidate) candidates.push(candidate);
  }

  return candidates;
}

/* --- Deciding -------------------------------------------------------------- */

export type DirectorDecision = {
  directorVersion: string;
  liveCap: number;
  liveBefore: number;
  /** Every candidate, reasoned about, in the order they were considered. */
  assessments: CandidateAssessment[];
  /** The ones to write down, best first. A subset of the eligible. */
  toCreate: OpportunityCandidate[];
};

function eligibilityFor(
  facts: DirectorFacts,
  candidate: OpportunityCandidate,
  person: PersonFacts,
): EligibilityResult {
  if (candidate.type === "SHOWCASE_SLOT") {
    return showcaseEligibility({
      facts,
      promoter: person,
      identityKey: candidate.identityKey,
      nightGameTime: new Date(String(candidate.payload.nightGameTime)),
    });
  }

  return sessionInviteEligibility({ facts, producer: person, identityKey: candidate.identityKey });
}

function rankingFor(
  facts: DirectorFacts,
  candidate: OpportunityCandidate,
  person: PersonFacts,
  liveCount: number,
): RankingResult {
  if (candidate.type === "SHOWCASE_SLOT") {
    return rankShowcase({
      facts,
      promoter: person,
      nightGameTime: new Date(String(candidate.payload.nightGameTime)),
      billing: candidate.payload.billing as ShowcaseBilling,
      liveCount,
    });
  }

  return rankSessionInvite({
    facts,
    producer: person,
    answerByDays: SESSION_INVITE_ANSWER_DAYS,
    liveCount,
  });
}

/**
 * Assemble, gate, order, cap.
 *
 * The cap is applied last and only to things that already passed eligibility, so
 * the two reasons a player might not see something stay completely separate: a
 * candidate is either not possible, or it is possible and something else was more
 * worth their attention. Both are recorded; only the second is a ranking
 * decision.
 */
export function direct(facts: DirectorFacts): DirectorDecision {
  const liveBefore = facts.liveOpportunities.length;
  const room = Math.max(0, CAP - liveBefore);

  const byId = new Map(facts.people.map((person) => [person.characterId, person]));

  const describe = (
    candidate: OpportunityCandidate,
    eligibility: EligibilityResult,
  ): CandidateAssessment => ({
    identityKey: candidate.identityKey,
    type: candidate.type,
    origin: candidate.origin,
    sourceEntityId: candidate.sourceEntityId,
    sceneSlug: candidate.sceneSlug,
    triggerReason: candidate.triggerReason,
    eligibility,
    ranking: null,
    rank: null,
    created: false,
    suppressedBy: null,
    opportunityId: null,
  });

  const ineligible: CandidateAssessment[] = [];
  const eligible: {
    candidate: OpportunityCandidate;
    assessment: CandidateAssessment;
    ranking: RankingResult;
  }[] = [];

  for (const candidate of assembleCandidates(facts)) {
    const person = byId.get(candidate.sourceEntityId);
    if (!person) continue;

    const eligibility = eligibilityFor(facts, candidate, person);
    const assessment = describe(candidate, eligibility);

    if (!eligibility.eligible) {
      // Never scored. Ranking does not run on something that cannot exist.
      assessment.suppressedBy = "INELIGIBLE";
      ineligible.push(assessment);
      continue;
    }

    eligible.push({
      candidate,
      assessment,
      ranking: rankingFor(facts, candidate, person, liveBefore),
    });
  }

  /*
   * Best first. Ties break on the identity key rather than on a seed, so two
   * candidates the rules genuinely cannot separate are still ordered the same way
   * every time this runs.
   */
  eligible.sort(
    (a, b) =>
      b.ranking.score - a.ranking.score ||
      a.candidate.identityKey.localeCompare(b.candidate.identityKey),
  );

  const toCreate: OpportunityCandidate[] = [];

  for (const [index, entry] of eligible.entries()) {
    const withinCap = toCreate.length < room;
    if (withinCap) toCreate.push(entry.candidate);

    entry.assessment.ranking = entry.ranking;
    entry.assessment.rank = index + 1;
    entry.assessment.created = withinCap;
    // Eligible and not surfaced. A real offer that lost a comparison, which is a
    // different fact from having failed a condition.
    entry.assessment.suppressedBy = withinCap ? null : "OUTRANKED_BY_CAP";
  }

  const assessments = [...eligible.map((entry) => entry.assessment), ...ineligible];

  return {
    directorVersion: OPPORTUNITY_DIRECTOR_VERSION,
    liveCap: CAP,
    liveBefore,
    assessments,
    toCreate,
  };
}
