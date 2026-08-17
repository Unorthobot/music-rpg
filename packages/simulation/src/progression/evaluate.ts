import {
  COME_UP_REQUIRED_DOMAINS,
  COME_UP_REQUIRES_NON_RECEPTION,
  DOMAIN_QUALIFIER,
  EVIDENCE_DESCRIPTORS,
  PROGRESSION_EVALUATOR_VERSION,
  RECOGNITION_DOMAINS,
  SCENE_WITNESSED_KINDS_REQUIRED,
  roundTo,
  type DomainCheck,
  type EvidenceCheck,
  type EvidenceDescriptor,
  type EvidenceFacts,
  type EvidenceResult,
  type PersonReturnFacts,
  type ReleaseReceptionFacts,
} from "@music-rpg/shared";
import { INVITE_MIN_RESPECT } from "../opportunities/constants";
import { sceneStanding } from "../opportunities/standing";
import {
  LANDED_MIN_ENGAGED_LISTENERS,
  LANDED_MIN_FAN_CONVERSIONS,
  LANDED_MIN_REPEAT_LISTENERS,
  STAYED_MIN_FANS,
  WORK_MIN_LANDED_RELEASES,
} from "./constants";

/**
 * Has the world already started treating this artist differently?
 *
 * Pure and total. Facts in, families out — no clock, no randomness, no
 * database, no network, the shape `direct()` and the three judges already hold.
 * The same facts always produce the same answer, which is what makes a phase
 * something that can be explained months later rather than asserted.
 *
 * **Every family is evaluated, even after enough have passed.** Eligibility's
 * discipline, and for its reason: short-circuiting would reduce "why not yet?"
 * to whichever condition happened to be checked first, when the honest answer is
 * frequently that three separate things are not true.
 *
 * Nothing here sums anything. There is no total to return and no variable in
 * this file that holds one.
 */

function check(
  descriptor: EvidenceDescriptor,
  passed: boolean,
  reason: string,
  observed: EvidenceCheck["observed"],
): EvidenceCheck {
  return { descriptor, passed, reason, observed };
}

/* --- People did not merely encounter the work. Some stayed. --------------- */

function audienceThatStayed(facts: EvidenceFacts): EvidenceCheck {
  const fans = facts.cohorts.reduce((total, cohort) => total + cohort.fans, 0);
  /*
   * Reported beside the fans and never compared against: the whole point of the
   * family is that these two numbers come apart. A career with thousands of
   * listeners and four fans has been encountered, not kept.
   */
  const reached = facts.cohorts.reduce((total, cohort) => total + cohort.priorExposure, 0);

  const cohortsWithFans = facts.cohorts.filter((cohort) => cohort.fans > 0);

  return check(
    "AUDIENCE_THAT_STAYED",
    fans >= STAYED_MIN_FANS,
    fans >= STAYED_MIN_FANS
      ? `${fans} people stayed after finding the work.`
      : `Plenty may have heard it; ${fans} stayed.`,
    {
      fans,
      required: STAYED_MIN_FANS,
      everReached: reached,
      cohortsWithFans: cohortsWithFans.length,
      strongestCohort:
        cohortsWithFans.sort((a, b) => b.fans - a.fans)[0]?.slug ?? null,
    },
  );
}

/* --- Somebody's own bar for their own room -------------------------------- */

/**
 * The anchor that belongs to a place.
 *
 * Read against a **promoter's own headline standard** — the bar the world
 * seeded for a room somebody actually runs — rather than against a number M9
 * chose. That is the difference between "the scene knows you" and "the player
 * accumulated N scene points", and it is why this family cannot be reached by
 * doing more of anything.
 *
 * Every scene is evaluated and the best margin is reported, so the inspector can
 * see not just whether a bar was met but which room it was and by how far.
 */
function aSceneThatKnowsYou(facts: EvidenceFacts): EvidenceCheck {
  const measured = facts.sceneStandards.map((standard) => {
    const standing = sceneStanding(standard.sceneSlug, facts.cohorts);
    return {
      ...standard,
      standing: standing.value,
      margin: roundTo(standing.value - standard.standard, 4),
    };
  });

  // Stable ordering on a recorded key, never on a seed: the strongest margin
  // wins, and ties break on the promoter's slug.
  const ranked = [...measured].sort(
    (a, b) => b.margin - a.margin || a.promoterSlug.localeCompare(b.promoterSlug),
  );
  const best = ranked[0];
  const met = ranked.filter((entry) => entry.margin >= 0);

  return check(
    "A_SCENE_THAT_KNOWS_YOU",
    met.length > 0,
    met.length > 0
      ? `${met[0]!.promoterName} would build ${met[0]!.nightName} around you.`
      : best
        ? `${best.promoterName} needs ${best.standard} in ${best.sceneSlug}; you're at ${best.standing}.`
        : "Nobody in this world books rooms.",
    {
      scenesMeetingStandard: met.length,
      scene: best?.sceneSlug ?? null,
      promoter: best?.promoterSlug ?? null,
      sceneStanding: best?.standing ?? 0,
      headlineStandard: best?.standard ?? null,
      margin: best?.margin ?? null,
    },
  );
}

/* --- The work was received, which is not the same as released ------------- */

/** Whether one record met an audience that wanted it. */
export function releaseLanded(release: ReleaseReceptionFacts): boolean {
  return (
    release.engagedListeners >= LANDED_MIN_ENGAGED_LISTENERS &&
    release.repeatListeners >= LANDED_MIN_REPEAT_LISTENERS &&
    release.fanConversions >= LANDED_MIN_FAN_CONVERSIONS
  );
}

/**
 * One record met listeners properly. **This is the RECEPTION domain.**
 *
 * The same predicate `WORK_THAT_LANDED` uses, over one release rather than two,
 * and the split is deliberate: *did the work land* and *did it land repeatedly*
 * are different questions, and only the first is a precondition for the world
 * relating to a career differently. Requiring two would block the one-record
 * live, battle and crew routes, all of which are legitimate histories.
 *
 * Measured against a real reception spectrum this separated records that
 * converted nobody (4–9 conversions) from records that landed (580–938) with no
 * case in between, and stayed stable across deterministic seeds. Its thresholds
 * are M9's to read and never to tune.
 */
function workLandedOnce(facts: EvidenceFacts): EvidenceCheck {
  const landed = facts.releases.filter(releaseLanded);
  const best = facts.releases.reduce(
    (top, release) => (release.fanConversions > (top?.fanConversions ?? -1) ? release : top),
    facts.releases[0],
  );

  return check(
    "WORK_LANDED_ONCE",
    landed.length >= 1,
    landed.length >= 1
      ? `A record met an audience properly.`
      : facts.releases.length === 0
        ? `Nothing is out yet.`
        : `${facts.releases.length} out; none of them landed.`,
    {
      releasesOut: facts.releases.length,
      releasesLanded: landed.length,
      /* The clause that actually decided it, for a legible near miss. */
      bestEngagedListeners: best?.engagedListeners ?? 0,
      bestRepeatListeners: best?.repeatListeners ?? 0,
      bestFanConversions: best?.fanConversions ?? 0,
      engagedBar: LANDED_MIN_ENGAGED_LISTENERS,
      repeatBar: LANDED_MIN_REPEAT_LISTENERS,
      conversionBar: LANDED_MIN_FAN_CONVERSIONS,
    },
  );
}

/**
 * Fans in more than one cohort. **Explanatory only — never qualifying.**
 *
 * Kept because "who stayed" is a real question World Control should answer, and
 * excluded from qualification because a record may legitimately land narrowly
 * and deeply. Encoding breadth as a prerequisite would make M9 quietly require
 * broad appeal, which is a different claim from *the work landed*.
 */
function cohortBreadth(facts: EvidenceFacts): EvidenceCheck {
  const withFans = facts.cohorts.filter((cohort) => cohort.fans > 0);

  return check(
    "COHORT_BREADTH",
    withFans.length >= 2,
    withFans.length >= 2
      ? `${withFans.length} kinds of listener kept it.`
      : `It landed with ${withFans.length === 1 ? "one kind of listener" : "nobody"}.`,
    {
      cohortsWithFans: withFans.length,
      cohortsTotal: facts.cohorts.length,
      note: "Explanatory. Narrow and deep is a legitimate reception.",
    },
  );
}

function workThatLanded(facts: EvidenceFacts): EvidenceCheck {
  const landed = facts.releases.filter(releaseLanded);

  return check(
    "WORK_THAT_LANDED",
    landed.length >= WORK_MIN_LANDED_RELEASES,
    landed.length >= WORK_MIN_LANDED_RELEASES
      ? `${landed.length} records met an audience properly.`
      : `${facts.releases.length} out, ${landed.length} of them landed.`,
    {
      releasesOut: facts.releases.length,
      releasesLanded: landed.length,
      required: WORK_MIN_LANDED_RELEASES,
      /*
       * The best record's own numbers, so a near miss is legible: "one landed
       * and the second reached 44 engaged listeners" is a different career from
       * "one landed and nothing else was ever released".
       */
      bestEngagedListeners: facts.releases.reduce(
        (best, release) => Math.max(best, release.engagedListeners),
        0,
      ),
      bestRepeatListeners: facts.releases.reduce(
        (best, release) => Math.max(best, release.repeatListeners),
        0,
      ),
      bestFanConversions: facts.releases.reduce(
        (best, release) => Math.max(best, release.fanConversions),
        0,
      ),
    },
  );
}

/* --- Somebody decided, unprompted, that they want more -------------------- */

/**
 * The anchor that belongs to a person.
 *
 * **Two** satisfiers, and each is a decision somebody else made:
 *
 * - an **open** `WANTS_ANOTHER_SESSION` — M6 raised it unprompted, on M6's own
 *   compound condition, against a state the player does not set;
 * - a crew member who **said yes** — `crewDecision` is the character's, weighed
 *   against their own standards, and asking is emphatically not being accepted.
 *
 * ## Why the third satisfier is gone
 *
 * The M9 brief names a third: *a relationship past a producer's own
 * `INVITE_MIN_RESPECT`*. Measured against what the simulation actually
 * produces, it qualifies this family for **every career that has ever finished
 * one record with one producer** — including a career whose record reached
 * nobody at all. The stalled control career holds `respect 37.6` against a bar
 * of 30 after a single session, and the runaway single reaches the ceiling of
 * 100. A satisfier that is true of every career that used the studio once is
 * not evidence of anything, and it made a family that reads *came back*
 * satisfiable by *turned up once*.
 *
 * That is a direct violation of the rule the whole model rests on — no family
 * may qualify because the player performed an action — and it is what let the
 * one-dimensional grinder out of the Underground on one record. Respect is a
 * state, and a high one is a good afternoon; coming back is a second decision,
 * and only the two satisfiers above are one.
 *
 * What is still deliberately not a satisfier: booking somebody twice, inviting
 * anybody, or writing a crew row. Those are things the player did.
 *
 * The moment satisfier reads **open** rather than "open or answered", which is
 * the second place this evaluator narrows the brief. An answered moment is a
 * decision the player made about somebody else's request; leaving it as
 * standing evidence would make this family monotonic, and a family that can
 * only ever become true cannot lapse — which would make the durability window
 * unfalsifiable and quietly delete the property it exists to prove. Somebody
 * who wanted back in the room and was turned away has not come back.
 */
function peopleWhoCameBack(facts: EvidenceFacts): EvidenceCheck {
  /*
   * Ever, not currently open. Somebody deciding they want back in the room is a
   * historical fact; the player answering them is a different fact with its own
   * M6 consequences, and none of those consequences is "it never happened".
   */
  const wantsMore = facts.people.filter((person) =>
    person.returnedMomentKinds.includes("WANTS_ANOTHER_SESSION"),
  );
  const crew = facts.people.filter((person) => person.isCrew);

  const returned = [...wantsMore, ...crew];
  const first = wantsMore[0] ?? crew[0];

  const reasonFor = (person: PersonReturnFacts): string =>
    person.returnedMomentKinds.includes("WANTS_ANOTHER_SESSION")
      ? `${person.name} wanted to get back in the room.`
      : `${person.name} said yes to being crew.`;

  return check(
    "PEOPLE_WHO_CAME_BACK",
    returned.length > 0,
    first ? reasonFor(first) : "Nobody has decided they want more of this.",
    {
      wantsAnotherSession: wantsMore.length,
      /* Still unanswered, reported beside it and never compared against. */
      wantsAnotherStillOpen: facts.people.filter((person) =>
        person.openMomentKinds.includes("WANTS_ANOTHER_SESSION"),
      ).length,
      crewWhoSaidYes: crew.length,
      /*
       * Reported and never compared. Keeping the number the discarded satisfier
       * would have used is what makes the correction arguable later: an
       * inspector can see that respect was at the ceiling and that it bought
       * this family nothing.
       */
      highestRespect: facts.people.reduce(
        (best, person) => Math.max(best, roundTo(person.respect, 2)),
        0,
      ),
      inviteBarForReference: INVITE_MIN_RESPECT,
      who: first?.characterId ?? null,
    },
  );
}

/* --- A public fact more than once, in more than one way ------------------- */

function thingsTheSceneSaw(facts: EvidenceFacts): EvidenceCheck {
  const kinds = facts.witnessed.filter((entry) => entry.count > 0);
  const occurrences = kinds.reduce((total, entry) => total + entry.count, 0);

  return check(
    "THINGS_THE_SCENE_SAW",
    kinds.length >= SCENE_WITNESSED_KINDS_REQUIRED,
    kinds.length >= SCENE_WITNESSED_KINDS_REQUIRED
      ? `The scene has seen you ${kinds.length} different ways.`
      : `The scene has seen one kind of thing from you.`,
    {
      kinds: kinds.length,
      required: SCENE_WITNESSED_KINDS_REQUIRED,
      // Kept and never compared: repetition is why this counts kinds.
      occurrences,
      seen: kinds.map((entry) => entry.eventType).sort().join(",") || null,
    },
  );
}

/* --- Descriptors, folded into domains -------------------------------------- */

const DESCRIPTOR_EVALUATORS: Record<
  EvidenceDescriptor,
  (facts: EvidenceFacts) => EvidenceCheck
> = {
  AUDIENCE_THAT_STAYED: audienceThatStayed,
  A_SCENE_THAT_KNOWS_YOU: aSceneThatKnowsYou,
  WORK_LANDED_ONCE: workLandedOnce,
  WORK_THAT_LANDED: workThatLanded,
  COHORT_BREADTH: cohortBreadth,
  PEOPLE_WHO_CAME_BACK: peopleWhoCameBack,
  THINGS_THE_SCENE_SAW: thingsTheSceneSaw,
};

/**
 * Every descriptor, then the three domains they fold into.
 *
 * **Every descriptor is evaluated even after enough domains hold**, for the
 * reason eligibility never short-circuits: "why not yet?" is usually several
 * separate things, and the failure side is the one that gets debugged.
 *
 * Qualification reads the domains and nothing else. The descriptors travel with
 * the decision so World Control can explain it, and carry no weight of their
 * own — there is no count of descriptors anywhere in the qualifying path.
 */
export function evaluateEvidence(facts: EvidenceFacts): EvidenceResult {
  // Declaration order, so two runs of the same facts produce identical rows.
  const checks = EVIDENCE_DESCRIPTORS.map((d) => DESCRIPTOR_EVALUATORS[d](facts));
  const byDescriptor = new Map(checks.map((entry) => [entry.descriptor, entry]));
  const satisfied = checks.filter((entry) => entry.passed).map((entry) => entry.descriptor);

  const domains: DomainCheck[] = RECOGNITION_DOMAINS.map((domain) => {
    const decidedBy = DOMAIN_QUALIFIER[domain];
    const decider = byDescriptor.get(decidedBy)!;
    return { domain, passed: decider.passed, decidedBy, reason: decider.reason };
  });

  const satisfiedDomains = domains.filter((entry) => entry.passed).map((entry) => entry.domain);

  const breadth = satisfiedDomains.length >= COME_UP_REQUIRED_DOMAINS;
  /*
   * The semantic invariant, checked rather than inferred from the arithmetic:
   * arbitrarily large magnitude inside RECEPTION alone can never qualify.
   */
  const beyondReception = satisfiedDomains.some((domain) => domain !== "RECEPTION");

  return {
    checks,
    satisfied,
    domains,
    satisfiedDomains,
    breadth,
    beyondReception,
    qualifying: breadth && (!COME_UP_REQUIRES_NON_RECEPTION || beyondReception),
    evaluatorVersion: PROGRESSION_EVALUATOR_VERSION,
  };
}
