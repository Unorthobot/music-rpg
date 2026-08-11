import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarItems,
  careers,
  characters,
  eq,
  gameEvents,
  opportunities,
  opportunityConflicts,
  opportunityDirectorRuns,
  type CharacterRow,
  type OpportunityRow,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType } from "@music-rpg/events";
import {
  acceptOpportunity,
  advanceCareerDay,
  declineOpportunity,
  loadDirectorFacts,
  runOpportunityDirector,
} from "@music-rpg/domain";
import {
  MAX_LIVE_OPPORTUNITIES,
  direct,
  sceneStanding,
  showcaseEligibility,
} from "@music-rpg/simulation";
import {
  unwrap,
  type CandidateAssessment,
  type DirectorTrace,
  type EligibilityRule,
} from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * The golden proof.
 *
 * > Same world, same starting conditions, different recorded histories →
 * > different plausible opportunities, for explainable reasons.
 *
 * The M5 and M6 shape, and it has the same two halves. Determinism on its own
 * proves nothing here: a director that always returned the same offer would be
 * perfectly deterministic and completely useless. So what is asserted is that two
 * careers *diverge*, and that every difference is reconstructible from state the
 * world actually recorded.
 *
 * Both careers are built entirely through real commands — onboarding, a producer,
 * a session with real decisions in it, a master, a release, a strategy, and the
 * same number of days of the world reacting. Nothing is inserted behind a domain
 * boundary to make a scenario convenient, which is the only way the histories can
 * be said to be genuinely different rather than differently fixtured.
 *
 * What makes them different is what a player would have done differently:
 *
 * - **KXMO** works with LEX, refuses his first read, asks for another pass, and
 *   asks for something scene-facing and high-risk. The record finds the scene
 *   heads and the tastemakers.
 * - **BRIGHT** works with ZERO, takes the first idea, and asks for something
 *   immediate aimed at everybody. In a city where casual listeners discover
 *   almost nothing, that record reaches fewer people and the scene has less use
 *   for it.
 */

const DAYS_ADVANCED = 3;

/**
 * One seed for both careers.
 *
 * Reception is stochastic and seeds from a release's own id, so two careers
 * normally get two different rolls of the dice. Handing them the same seed is what
 * makes this a controlled comparison: the audience behaves identically for both,
 * so every difference in what the world offers is attributable to the difference
 * in what they actually did.
 */
const SEED = "m7-golden";

type Career = {
  test: TestContext;
  careerId: string;
  userId: string;
  characters: CharacterRow[];
  live: OpportunityRow[];
  /** The most recent run. */
  trace: DirectorTrace;
  /** Every run, in order. World Control reads the ledger the same way. */
  traces: DirectorTrace[];
  close: () => Promise<void>;
};

async function liveThrough(options: {
  stageName: string;
  title: string;
  producerSlug: string;
  strategy: "TEASE" | "DROP";
  friction: boolean;
  direction?: Record<string, unknown>;
}): Promise<Career> {
  const test = await createTestContext();
  const user = await createTestUser(test, options.stageName);

  const { careerId } = await makePublishedRelease(test, user, options.title, {
    stageName: options.stageName,
    producerSlug: options.producerSlug,
    strategy: options.strategy,
    friction: options.friction,
    ...(options.direction ? { direction: options.direction as never } : {}),
  });

  const traces: DirectorTrace[] = [];

  for (let day = 0; day < DAYS_ADVANCED; day += 1) {
    const advanced = unwrap(
      await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: SEED }),
    );
    if (advanced.director) traces.push(advanced.director.trace);
  }

  return {
    test,
    careerId,
    userId: user.id,
    characters: await test.handle.db.select().from(characters),
    live: await liveOffers(test, careerId),
    trace: traces[traces.length - 1]!,
    traces,
    close: test.close,
  };
}

async function liveOffers(test: TestContext, careerId: string): Promise<OpportunityRow[]> {
  const rows = await test.handle.db
    .select()
    .from(opportunities)
    .where(eq(opportunities.careerId, careerId));

  return rows.filter((row) => row.status === "AVAILABLE");
}

/** Who offered it, by slug. The proof is about people, not identifiers. */
function sourceOf(career: Career, row: OpportunityRow): string {
  return career.characters.find((entry) => entry.id === row.sourceEntityId)?.slug ?? "?";
}

describe("the world offers what is plausible", () => {
  let a: Career;
  let b: Career;

  beforeAll(async () => {
    a = await liveThrough({
      stageName: "KXMO",
      title: "SCENE FIRST",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });

    b = await liveThrough({
      stageName: "BRIGHT",
      title: "STRAIGHT OUT",
      producerSlug: "producer-zero",
      strategy: "DROP",
      friction: false,
      direction: {
        intention: "hit",
        moods: ["bright", "confident"],
        energy: 82,
        risk: 12,
        audience: "everyone",
        note: "Something people can sing back on the first listen.",
      },
    });
  }, 240_000);

  afterAll(async () => {
    await a.close();
    await b.close();
  });

  /* --- Half one: the offers differ, and neither is empty ------------------- */

  it("offers both careers something, and not the same something", async () => {
    expect(a.live.length).toBeGreaterThan(0);
    expect(b.live.length).toBeGreaterThan(0);

    const shapeOf = (career: Career) =>
      career.live
        .map((row) => `${row.type}:${sourceOf(career, row)}:${row.payload.billing ?? "-"}`)
        .sort();

    expect(shapeOf(a)).not.toEqual(shapeOf(b));
  });

  /**
   * The clearest single statement the world can make about where a career stands.
   *
   * Same promoters, same rooms, same nights — and one career is asked to carry the
   * evening while the other is asked to open it. The bill is not a score; it is
   * two different offers, and which one arrives is decided by how well the scene
   * actually knows you.
   */
  it("puts one career on top of the bill and the other at the start of it", async () => {
    const billings = (career: Career) =>
      career.live
        .filter((row) => row.type === "SHOWCASE_SLOT")
        .map((row) => row.payload.billing);

    expect(billings(a).length).toBeGreaterThan(0);
    expect(billings(b).length).toBeGreaterThan(0);

    /*
     * KXMO is asked to carry a room. BRIGHT is only ever asked to open one — and
     * that is the whole difference between the two records, arriving as an offer.
     *
     * KXMO's set can contain both, because offers were made on different days and
     * the earlier ones were made when the scene knew less. An offer improving as a
     * career grows is the system working, not a leak.
     */
    expect(billings(a)).toContain("HEADLINE");
    expect(new Set(billings(b))).toEqual(new Set(["SUPPORT"]));
    expect(billings(b)).not.toContain("HEADLINE");
  });

  /**
   * The billing is never a judgement call: it is the standing against the bar.
   *
   * Asserted across every showcase either career was offered, so the rule holds
   * for offers made on different days at different levels of standing rather than
   * only for the one that happens to be convenient.
   */
  it("decides the billing from the standing it recorded at the time", async () => {
    const showcases = [...a.live, ...b.live].filter((row) => row.type === "SHOWCASE_SLOT");
    expect(showcases.length).toBeGreaterThan(2);

    for (const row of showcases) {
      const state = row.triggerState as {
        sceneStanding: number;
        billing: string;
        promoterStandard: number;
        promoterSupportStandard: number;
      };

      // Being on the bill at all is the support bar. Nothing below it is eligible.
      expect(state.sceneStanding).toBeGreaterThanOrEqual(state.promoterSupportStandard);
      // And the top of the bill is the headline bar, exactly.
      expect(state.billing).toBe(
        state.sceneStanding >= state.promoterStandard ? "HEADLINE" : "SUPPORT",
      );
    }
  });

  /* --- Half two: every difference is attributable ------------------------- */

  it("keeps the recorded facts that made each offer, with the offer", async () => {
    const showcase = a.live.find(
      (row) => row.type === "SHOWCASE_SLOT" && row.payload.billing === "HEADLINE",
    )!;
    const state = showcase.triggerState as {
      sceneStanding: number;
      billing: string;
      promoterStandard: number;
      promoterSupportStandard: number;
      momentum: number;
      releasesOut: number;
      sceneStandingContributors: { cohortSlug: string; standing: number; sceneWeight: number }[];
    };

    // Why this promoter said yes: the scene knows this career better than their bar.
    expect(state.sceneStanding).toBeGreaterThanOrEqual(state.promoterStandard);
    expect(state.billing).toBe("HEADLINE");
    expect(state.releasesOut).toBe(1);
    expect(state.momentum).toBeGreaterThan(0);

    /*
     * And the scene standing itself decomposes into M5's own numbers: each
     * cohort's warmth, weighted by how concentrated that cohort is in this scene.
     * Nothing about reception is recomputed — this is a reading of it.
     */
    expect(state.sceneStandingContributors.length).toBe(3);
    expect(state.sceneStandingContributors.map((entry) => entry.cohortSlug).sort()).toEqual([
      "CASUAL_LISTENERS",
      "SCENE_HEADS",
      "TASTEMAKERS",
    ]);

    const scene = state.sceneStandingContributors;
    const weighted =
      scene.reduce((sum, entry) => sum + entry.standing * entry.sceneWeight, 0) /
      scene.reduce((sum, entry) => sum + entry.sceneWeight, 0);
    expect(weighted).toBeCloseTo(state.sceneStanding, 3);
  });

  it("explains why a candidate was not an opportunity at all", async () => {
    // Soweto's night. Eleven years of standard, and a first single does not buy it.
    const sizwe = a.characters.find((entry) => entry.slug === "sizwe")!;
    const rejected = a.traces
      .flatMap((trace) => trace.candidates)
      .find((entry) => entry.sourceEntityId === sizwe.id)!;

    expect(rejected.suppressedBy).toBe("INELIGIBLE");
    expect(rejected.eligibility.eligible).toBe(false);
    expect(rejected.eligibility.failed).toContain<EligibilityRule>("SCENE_KNOWS_YOU");

    // Never scored. Ranking does not run on something that cannot exist.
    expect(rejected.ranking).toBeNull();
    expect(rejected.rank).toBeNull();

    // And the reason carries the numbers it was applied to, not just a verdict.
    const failure = rejected.eligibility.checks.find((check) => check.rule === "SCENE_KNOWS_YOU")!;
    expect(Number(failure.observed.sceneStanding)).toBeLessThan(
      Number(failure.observed.supportStandard),
    );
    expect(failure.observed.scene).toBe("soweto");
  });

  /**
   * The distinction the whole director is built around.
   *
   * "You have nothing to perform" and "something more relevant came up" are
   * different answers, and a blended score could not tell them apart. So the two
   * ways a candidate can fail to reach a player are recorded as two different
   * facts, and one of them keeps its score while the other never had one.
   */
  it("keeps failing a condition and losing a comparison distinguishable", async () => {
    // Across every run, because the two cases do not have to arise on the same day.
    const all = a.traces.flatMap((trace) => trace.candidates);
    const ineligible = all.filter((entry) => entry.suppressedBy === "INELIGIBLE");
    const outranked = all.filter((entry) => entry.suppressedBy === "OUTRANKED_BY_CAP");

    expect(ineligible.length).toBeGreaterThan(0);
    expect(outranked.length).toBeGreaterThan(0);

    for (const entry of ineligible) {
      expect(entry.eligibility.eligible).toBe(false);
      expect(entry.ranking).toBeNull();
    }

    for (const entry of outranked) {
      // Eligible. A real opportunity that lost a comparison, and it kept its score.
      expect(entry.eligibility.eligible).toBe(true);
      expect(entry.eligibility.failed).toEqual([]);
      expect(entry.ranking!.score).toBeGreaterThan(0);
      expect(entry.rank).toBeGreaterThan(0);
    }
  });

  it("explains why one eligible offer outranked another", async () => {
    /*
     * The comparison has to come from a single run: ranking is comparative, and
     * two candidates only ever compete against the ones considered beside them.
     */
    const contested = a.traces
      .map((trace) => trace.candidates.filter((entry) => entry.ranking !== null))
      .filter((entries) => entries.length > 1)
      .sort((first, second) => second.length - first.length)[0];

    expect(contested).toBeTruthy();
    const ranked = contested!.sort((first, second) => first.rank! - second.rank!);

    expect(ranked.length).toBeGreaterThan(1);

    const [winner, runnerUp] = ranked;
    expect(winner!.ranking!.score).toBeGreaterThanOrEqual(runnerUp!.ranking!.score);

    // Every score is the sum of its named parts. No opaque weight anywhere.
    for (const entry of ranked) {
      const sum = entry.ranking!.contributions.reduce(
        (running, part) => running + part.contribution,
        0,
      );
      expect(sum).toBeCloseTo(entry.ranking!.score, 3);
      expect(entry.ranking!.contributions.every((part) => part.note.length > 0)).toBe(true);
    }

    /*
     * And the winning margin is attributable term by term rather than to a number.
     *
     * Summed over the union of both sets, because two candidates of different
     * kinds weigh different things: a term one of them does not consider
     * contributes its whole value to the gap, and saying so is the explanation.
     */
    const contributionOf = (entry: CandidateAssessment, term: string) =>
      entry.ranking!.contributions.find((part) => part.term === term)?.contribution ?? 0;

    const terms = new Set([
      ...winner!.ranking!.contributions.map((part) => part.term),
      ...runnerUp!.ranking!.contributions.map((part) => part.term),
    ]);

    const byTerm = [...terms].reduce(
      (running, term) => running + contributionOf(winner!, term) - contributionOf(runnerUp!, term),
      0,
    );

    expect(byTerm).toBeCloseTo(winner!.ranking!.score - runnerUp!.ranking!.score, 3);
    expect(contributionOf(winner!, "base")).toBeGreaterThan(0);
  });

  it("names the facts it did not consider", async () => {
    const all = a.traces.flatMap((trace) => trace.candidates);
    const showcase = all.find(
      (entry) => entry.type === "SHOWCASE_SLOT" && entry.ranking !== null,
    )!;
    const invite = all.find(
      (entry) => entry.type === "SESSION_INVITE" && entry.ranking !== null,
    );

    /*
     * A promoter this career has never worked with has no opinion of it, and M6 is
     * right not to invent one — so a relationship is not a low contribution to a
     * showcase, it is not a contribution at all.
     */
    expect(showcase.ranking!.irrelevant).toContain("relationship");
    expect(showcase.ranking!.contributions.map((part) => part.term)).not.toContain("relationship");

    if (invite) {
      // And where a neighbourhood stands has nothing to do with whether the person
      // you made the record with wants to make another.
      expect(invite.ranking!.irrelevant).toContain("sceneFit");
      expect(invite.ranking!.contributions.map((part) => part.term)).not.toContain("sceneFit");
    }
  });

  it("reads M6 for whether anybody wants to work again, rather than guessing", async () => {
    const invite = a.live.find((row) => row.type === "SESSION_INVITE");
    expect(invite).toBeTruthy();

    const state = invite!.triggerState as {
      respect: number;
      creativeChemistry: number;
      tension: number;
      openMomentKinds: string[];
      interactionCount: number;
    };

    /*
     * Straight off M6's relationship, at the values M6 had derived when the offer
     * was made. Note `openMomentKinds` is empty here and that is correct: LEX's
     * tension had not yet crossed M6's bar on the day he asked, so what made the
     * offer plausible was the chemistry. The state is kept as it stood, not as it
     * later became.
     */
    expect(state.interactionCount).toBeGreaterThan(0);
    expect(state.respect).toBeGreaterThan(0);
    expect(state.creativeChemistry).toBeGreaterThan(0);
    expect(invite!.triggerReason).toContain("LEX");

    /*
     * And once M6 did surface a moment, the director saw it. Read from M6's own
     * table on every subsequent run — never re-detected here, which is the whole
     * point of M7 being a consumer.
     */
    const sawTheMoment = a.traces.some((trace) => {
      const relationships = (trace.inputs as {
        relationships?: { slug: string; openMoments: string[] }[];
      }).relationships;
      return relationships?.some(
        (entry) => entry.slug === "lex" && entry.openMoments.includes("WANTS_TO_TALK"),
      );
    });

    expect(sawTheMoment).toBe(true);

    /*
     * And the career whose producer relationship never got there is told so by
     * name. BRIGHT took the first idea and never disagreed with anybody: no
     * tension, less chemistry, and nothing asking for another session.
     */
    const zero = b.characters.find((entry) => entry.slug === "producer-zero")!;
    const refused = b.traces
      .flatMap((trace) => trace.candidates)
      .find((entry) => entry.sourceEntityId === zero.id)!;

    expect(refused.eligibility.failed).toContain<EligibilityRule>("SOMETHING_LEFT_TO_DO");
    expect(b.live.some((row) => row.type === "SESSION_INVITE")).toBe(false);
  });

  /* --- Sensitivity: change one input, explainably change the result -------- */

  /**
   * The other half of the M5 proof.
   *
   * Determinism is not the interesting property. What matters is that a *single*
   * meaningful change to recorded state changes what the world offers, for a
   * reason that can be named — and that changing something the rules do not
   * consider changes nothing at all.
   */
  it("stops offering a night once that night is actually booked", async () => {
    const [career] = await b.test.handle.db
      .select()
      .from(careers)
      .where(eq(careers.id, b.careerId));

    const naledi = b.characters.find((entry) => entry.slug === "naledi")!;
    const naledisNight = b.live.find(
      (row) => row.sourceEntityId === naledi.id && row.type === "SHOWCASE_SLOT",
    )!;
    const night = new Date(String(naledisNight.payload.nightGameTime));

    const promoterOf = (facts: Awaited<ReturnType<typeof loadDirectorFacts>>) =>
      facts.people.find((person) => person.characterId === naledi.id)!;

    /*
     * Before: that evening is free, so the rule passes. Asked of the real rule,
     * with the real recorded facts, for the real night on offer.
     */
    const before = await loadDirectorFacts(b.test.ctx, career!);
    const askedBefore = showcaseEligibility({
      facts: before,
      promoter: promoterOf(before),
      identityKey: "sensitivity:probe",
      nightGameTime: night,
    });

    expect(
      askedBefore.checks.find((check) => check.rule === "NIGHT_IS_FREE")!.passed,
    ).toBe(true);

    // One change, through the real command: take the night.
    unwrap(
      await acceptOpportunity(b.test.ctx, {
        careerId: b.careerId,
        userId: b.userId,
        opportunityId: naledisNight.id,
      }),
    );

    const after = await loadDirectorFacts(b.test.ctx, career!);
    const askedAfter = showcaseEligibility({
      facts: after,
      promoter: promoterOf(after),
      identityKey: "sensitivity:probe",
      nightGameTime: night,
    });

    /*
     * After: the same question, the same night, a different answer — and the
     * reason is the commitment, named, rather than a score that quietly moved.
     */
    const clash = askedAfter.checks.find((check) => check.rule === "NIGHT_IS_FREE")!;
    expect(clash.passed).toBe(false);
    expect(String(clash.observed.clashesWith)).toContain("Rooftop hours");
    expect(askedAfter.failed).toContain<EligibilityRule>("NIGHT_IS_FREE");
  });

  /**
   * Sensitivity on the input that decides the whole showcase question.
   *
   * The rest of this suite proves the director reads recorded state. This proves
   * it *depends* on it: one cohort's warmth moved, nothing else touched, and the
   * offer changes from opening a room to carrying it — with the crossing visible
   * in the numbers the rule was applied to.
   */
  it("changes what it offers when one recorded input changes, and only that input", async () => {
    const [career] = await b.test.handle.db
      .select()
      .from(careers)
      .where(eq(careers.id, b.careerId));

    const facts = await loadDirectorFacts(b.test.ctx, career!);
    const naledi = b.characters.find((entry) => entry.slug === "naledi")!;
    const promoter = facts.people.find((person) => person.characterId === naledi.id)!;
    const standard = promoter.promoter!.standard;

    const baseline = sceneStanding("braamfontein", facts.cohorts).value;
    expect(baseline).toBeLessThan(standard);

    /*
     * Exactly one recorded value changes: how warm the scene heads are. Everything
     * else — fans, the other cohorts, momentum, the calendar, the relationship —
     * is left exactly as the world wrote it.
     */
    const warmer = facts.cohorts.map((cohort) =>
      cohort.slug === "SCENE_HEADS" ? { ...cohort, affinity: 250 } : cohort,
    );

    const raised = sceneStanding("braamfontein", warmer).value;
    expect(raised).toBeGreaterThan(standard);

    const decision = direct({
      ...facts,
      cohorts: warmer,
      // Clear the board so the comparison is about standing, not about the cap.
      liveOpportunities: [],
    });

    const offer = decision.assessments.find(
      (entry) => entry.sourceEntityId === naledi.id && entry.eligibility.eligible,
    );

    expect(offer).toBeTruthy();

    const check = offer!.eligibility.checks.find((entry) => entry.rule === "SCENE_KNOWS_YOU")!;
    expect(check.observed.billing).toBe("HEADLINE");
    expect(Number(check.observed.sceneStanding)).toBeCloseTo(raised, 3);

    // And the same run against the untouched facts still says SUPPORT.
    const unchanged = direct({ ...facts, liveOpportunities: [] }).assessments.find(
      (entry) => entry.sourceEntityId === naledi.id && entry.eligibility.eligible,
    );

    expect(
      unchanged!.eligibility.checks.find((entry) => entry.rule === "SCENE_KNOWS_YOU")!.observed
        .billing,
    ).toBe("SUPPORT");
  });

  it("ignores a change to something it never considers", async () => {
    const [career] = await b.test.handle.db
      .select()
      .from(careers)
      .where(eq(careers.id, b.careerId));

    const facts = await loadDirectorFacts(b.test.ctx, career!);
    const before = direct({ ...facts, liveOpportunities: [] });

    /*
     * Fame and money are named as irrelevant to both kinds of offer. Moving them a
     * long way must therefore change nothing at all — which is what makes the
     * irrelevance list a claim rather than a comment.
     */
    const after = direct({
      ...facts,
      liveOpportunities: [],
      standing: { ...facts.standing, fame: 90, moneyBalance: 9_000_000 },
    });

    expect(JSON.stringify(after.assessments)).toBe(JSON.stringify(before.assessments));
  });
});

/* --- Lifecycle, idempotency, conflict ------------------------------------- */

describe("an opportunity is a world fact with a lifetime", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "KXMO");
    const made = await makePublishedRelease(test, user, "LIFECYCLE", {
      stageName: "KXMO",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });
    careerId = made.careerId;

    for (let day = 0; day < DAYS_ADVANCED; day += 1) {
      unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));
    }
  }, 180_000);

  afterAll(async () => {
    await test.close();
  });

  it("directs a game day exactly once, however many times it is asked", async () => {
    const before = await liveOffers(test, careerId);

    const again = unwrap(await runOpportunityDirector(test.ctx, { careerId, userId: user.id }));
    const third = unwrap(await runOpportunityDirector(test.ctx, { careerId, userId: user.id }));

    // The run ledger refuses the second write, so nothing happens twice.
    expect(again.ran).toBe(false);
    expect(third.ran).toBe(false);
    expect(again.created).toEqual([]);

    const after = await liveOffers(test, careerId);
    expect(after.map((row) => row.id).sort()).toEqual(before.map((row) => row.id).sort());
  });

  it("never lets more offers be live than the cap allows", async () => {
    const live = await liveOffers(test, careerId);
    expect(live.length).toBeLessThanOrEqual(MAX_LIVE_OPPORTUNITIES);
  });

  it("keeps a run ledger that explains what it decided against", async () => {
    const runs = await test.handle.db
      .select()
      .from(opportunityDirectorRuns)
      .where(eq(opportunityDirectorRuns.careerId, careerId));

    expect(runs.length).toBe(DAYS_ADVANCED);

    for (const run of runs) {
      const trace = run.trace as DirectorTrace;
      expect(run.candidatesConsidered).toBe(trace.candidates.length);
      expect(run.candidatesConsidered).toBeGreaterThan(run.createdCount);
      // Every candidate is accounted for: created, or suppressed for a reason.
      for (const candidate of trace.candidates) {
        expect(candidate.created || candidate.suppressedBy !== null).toBe(true);
      }
    }
  });

  it("gives two promoters the same kind of offer at once", async () => {
    const live = await liveOffers(test, careerId);
    const showcases = live.filter((row) => row.type === "SHOWCASE_SLOT");

    // The whole reason the unique index on (career, type) had to go.
    expect(showcases.length).toBeGreaterThan(1);
    expect(new Set(showcases.map((row) => row.sourceEntityId)).size).toBe(showcases.length);
    expect(new Set(showcases.map((row) => row.idempotencyKey)).size).toBe(showcases.length);
  });

  it("expires an offer because game time passed, and not because anybody looked", async () => {
    const live = await liveOffers(test, careerId);
    const expiring = live.filter((row) => row.expiresAtGameTime !== null);
    expect(expiring.length).toBeGreaterThan(0);

    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    // Reading the world repeatedly changes nothing at all. This is the rule.
    for (let look = 0; look < 3; look += 1) {
      await loadDirectorFacts(test.ctx, career!);
    }
    expect((await liveOffers(test, careerId)).length).toBe(live.length);

    /*
     * Letting days pass does. Advanced one day at a time until something lapses,
     * rather than to a fixed count, so the test says what it means: expiry is a
     * consequence of the world moving past a date.
     */
    let lapsed = 0;

    for (let day = 0; day < 6 && lapsed === 0; day += 1) {
      const result = await advanceCareerDay(test.ctx, { careerId, userId: user.id });
      if (!result.ok) break;
      lapsed = result.value.expired.length;
    }

    expect(lapsed).toBeGreaterThan(0);

    const all = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, careerId));

    const expired = all.filter((row) => row.status === "EXPIRED");
    expect(expired.length).toBeGreaterThan(0);

    for (const row of expired) {
      expect(row.expiredAt).not.toBeNull();
      // Lapsing is not declining, and the row says which one happened.
      expect(row.declinedAt).toBeNull();
      expect(row.acceptedAt).toBeNull();
      expect(row.withdrawnAt).toBeNull();
      // It lapsed because the world reached the date it was given.
      expect(row.expiresAtGameTime!.getTime()).toBeLessThanOrEqual(Date.now() + 0);
    }

    const events = await test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, careerId));

    expect(events.some((event) => event.eventType === GameEventType.OpportunityExpired)).toBe(true);
  });
});

describe("declining and lapsing are different facts", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "KXMO");
    const made = await makePublishedRelease(test, user, "TURNED DOWN", {
      stageName: "KXMO",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });
    careerId = made.careerId;

    for (let day = 0; day < DAYS_ADVANCED; day += 1) {
      unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));
    }
  }, 180_000);

  afterAll(async () => {
    await test.close();
  });

  it("records turning something down as a choice, and moves nothing else", async () => {
    const live = await liveOffers(test, careerId);
    const target = live[0]!;

    const [before] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    const declined = unwrap(
      await declineOpportunity(test.ctx, {
        careerId,
        userId: user.id,
        opportunityId: target.id,
      }),
    );

    expect(declined.status).toBe("DECLINED");
    expect(declined.declinedAt).not.toBeNull();
    // A different fact from lapsing, and the row keeps them apart.
    expect(declined.expiredAt).toBeNull();
    expect(declined.withdrawnAt).toBeNull();

    /*
     * An opportunity creates a situation. Declining one is not a punishment, and
     * nothing here manufactures a consequence: standing is untouched, and if a
     * promoter turned down twice should mean something, M6's derivation is where
     * that gets priced.
     */
    const [after] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    expect(after!.fame).toBe(before!.fame);
    expect(after!.respect).toBe(before!.respect);
    expect(after!.heat).toBe(before!.heat);

    const events = await test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, careerId));

    expect(events.some((event) => event.eventType === GameEventType.OpportunityDeclined)).toBe(
      true,
    );
  });

  it("refuses to answer the same offer twice", async () => {
    const live = await liveOffers(test, careerId);
    const target = live[0]!;

    unwrap(
      await acceptOpportunity(test.ctx, {
        careerId,
        userId: user.id,
        opportunityId: target.id,
      }),
    );

    const again = await declineOpportunity(test.ctx, {
      careerId,
      userId: user.id,
      opportunityId: target.id,
    });

    expect(again.ok).toBe(false);
  });
});

describe("two offers that cannot both happen", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "KXMO");
    const made = await makePublishedRelease(test, user, "SAME NIGHT", {
      stageName: "KXMO",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });
    careerId = made.careerId;

    for (let day = 0; day < DAYS_ADVANCED; day += 1) {
      unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));
    }
  }, 180_000);

  afterAll(async () => {
    await test.close();
  });

  /**
   * Accepting one offer resolves the other *because of the conflict*.
   *
   * The loser does not quietly vanish and it is not marked as something it was
   * not: the player never declined it, no time passed, and nothing happened. It
   * is withdrawn, and the row points at the offer that made it impossible.
   */
  it("withdraws the loser for a stated reason when one is accepted", async () => {
    /*
     * Two promoters in Braamfontein book on the same notice, so they want the same
     * evening whenever they are considered on the same day. Reaching that state is
     * a player action, not a contrivance: while Naledi is waiting to hear about her
     * rooftop she does not phone back, so the way both end up on the board is to
     * turn down what is already there and let another day pass.
     */
    for (const row of await liveOffers(test, careerId)) {
      unwrap(
        await declineOpportunity(test.ctx, {
          careerId,
          userId: user.id,
          opportunityId: row.id,
        }),
      );
    }

    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));

    const live = await liveOffers(test, careerId);

    const byNight = new Map<string, OpportunityRow[]>();
    for (const row of live) {
      const payload = row.payload as { nightGameTime?: string; proposedGameTime?: string };
      const stamp = payload.nightGameTime ?? payload.proposedGameTime;
      if (!stamp) continue;
      const day = stamp.slice(0, 10);
      byNight.set(day, [...(byNight.get(day) ?? []), row]);
    }

    const clashing = [...byNight.values()].find((rows) => rows.length >= 2);

    // The world has to have produced a real clash for this to be a real test.
    expect(clashing).toBeTruthy();
    const [first, second] = clashing!;

    // Two different promoters, the same night. Which is why type-level uniqueness
    // could not survive, and why the conflict has to be recorded explicitly.
    expect(first!.sourceEntityId).not.toBe(second!.sourceEntityId);

    const conflicts = await test.handle.db
      .select()
      .from(opportunityConflicts)
      .where(eq(opportunityConflicts.careerId, careerId));

    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts[0]!.kind).toBe("CALENDAR_SLOT");

    const accepted = unwrap(
      await acceptOpportunity(test.ctx, {
        careerId,
        userId: user.id,
        opportunityId: first!.id,
      }),
    );

    expect(accepted.opportunity.status).toBe("ACCEPTED");
    expect(accepted.withdrawn.length).toBeGreaterThan(0);

    const [loser] = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, second!.id));

    expect(loser!.status).toBe("WITHDRAWN");
    expect(loser!.withdrawnAt).not.toBeNull();
    // Pointing at what made it impossible, rather than at nothing.
    expect(loser!.withdrawnForOpportunityId).toBe(first!.id);
    // And distinguishable from every other ending.
    expect(loser!.declinedAt).toBeNull();
    expect(loser!.expiredAt).toBeNull();
    expect(loser!.acceptedAt).toBeNull();

    const events = await test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, careerId));

    expect(events.some((event) => event.eventType === GameEventType.OpportunityWithdrawn)).toBe(
      true,
    );
  }, 120_000);

  it("turns an accepted night into a real commitment, and nothing else", async () => {
    const accepted = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, careerId));

    const taken = accepted.find(
      (row) => row.status === "ACCEPTED" && row.type === "SHOWCASE_SLOT",
    );
    if (!taken) return;

    const booked = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.careerId, careerId));

    const item = booked.find((row) => row.relatedEntityId === taken.id);

    // The offer became a commitment in the calendar the game already models.
    expect(item).toBeTruthy();
    expect(item!.type).toBe("PERFORMANCE");
    expect(item!.status).toBe("SCHEDULED");
    expect(item!.startGameTime.toISOString()).toBe(String(taken.payload.nightGameTime));
  });
});

/* --- Determinism and rollback -------------------------------------------- */

describe("the director decides the same thing every time", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "KXMO");
    const made = await makePublishedRelease(test, user, "DETERMINISM", {
      stageName: "KXMO",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });
    careerId = made.careerId;
    for (let day = 0; day < DAYS_ADVANCED; day += 1) {
      unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));
    }
  }, 180_000);

  afterAll(async () => {
    await test.close();
  });

  it("produces identical decisions from identical facts", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const facts = await loadDirectorFacts(test.ctx, career!);

    const first = direct(facts);
    const second = direct(facts);
    const third = direct(await loadDirectorFacts(test.ctx, career!));

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(third)).toBe(JSON.stringify(first));
  });

  it("reads a scene's standing as a fold, so looking never changes it", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const facts = await loadDirectorFacts(test.ctx, career!);

    const readings = [1, 2, 3].map(() => sceneStanding("braamfontein", facts.cohorts).value);
    expect(new Set(readings).size).toBe(1);
  });

  it("writes nothing at all when a run is refused", async () => {
    const before = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, careerId));
    const runsBefore = await test.handle.db
      .select()
      .from(opportunityDirectorRuns)
      .where(eq(opportunityDirectorRuns.careerId, careerId));

    // Same game day again: the ledger key collides before anything is written.
    const refused = unwrap(await runOpportunityDirector(test.ctx, { careerId, userId: user.id }));
    expect(refused.ran).toBe(false);

    const after = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, careerId));
    const runsAfter = await test.handle.db
      .select()
      .from(opportunityDirectorRuns)
      .where(eq(opportunityDirectorRuns.careerId, careerId));

    expect(after.length).toBe(before.length);
    expect(runsAfter.length).toBe(runsBefore.length);
  });

  it("refuses an offer that belongs to somebody else's career", async () => {
    const other = await createTestUser(test, "Stranger");
    const live = await liveOffers(test, careerId);
    if (live.length === 0) return;

    const result = await acceptOpportunity(test.ctx, {
      careerId,
      userId: other.id,
      opportunityId: live[0]!.id,
    });

    expect(result.ok).toBe(false);
  });
});
