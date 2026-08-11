import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  careerMetricPressure,
  careers,
  eq,
  receptionTicks,
  releaseCohortPerformance,
  releasePerformance,
  releases,
  soundProfiles,
  type Database,
  type UserRow,
} from "@music-rpg/database";
import { listCareerEvents } from "@music-rpg/events";
import { simulateReceptionTick } from "@music-rpg/domain";
import { unwrap, type CohortTickOutcome, type ReceptionTickResult } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * Determinism, sensitivity, and the seam back to M4.
 *
 * Determinism on its own would be satisfied by a simulator that ignored its
 * inputs and returned the same numbers forever, so both halves are here:
 *
 * - identical inputs reproduce the whole three-day trajectory exactly, and
 * - a changed input moves the outcome in the direction it should, for the
 *   reason it should, while the things it has no business touching stay put.
 *
 * And the rule that keeps M4 and M5 from drifting apart: the simulator consumes
 * the modifiers the release recorded. It never reads the strategy and works out
 * for itself what they ought to have been.
 */

const SEED = "golden-m5";

const cohortOf = (result: ReceptionTickResult, slug: string): CohortTickOutcome =>
  result.cohorts.find((entry) => entry.cohortSlug === slug)!;

type Run = {
  days: ReceptionTickResult[];
  fameAccrued: number;
  respectAccrued: number;
  heatAccrued: number;
  close: () => Promise<void>;
};

/**
 * A whole three-day life, from a fresh world.
 *
 * `mutate` runs after publication and before the first tick, so a single input
 * can be changed with everything else held identical — which is the only way an
 * experiment on a simulation means anything.
 */
async function runThreeDays(
  mutate?: (test: TestContext, ids: { careerId: string; releaseId: string }) => Promise<void>,
): Promise<Run> {
  const test = await createTestContext();
  const user = await createTestUser(test, "Kamo");
  const { careerId, releaseId } = await makePublishedRelease(test, user, "NO RECEPTION");

  if (mutate) await mutate(test, { careerId, releaseId });

  const days: ReceptionTickResult[] = [];
  for (let day = 1; day <= 3; day += 1) {
    const tick = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId, seed: SEED }),
    );
    days.push(tick.result);
  }

  const [pressure] = await test.handle.db
    .select()
    .from(careerMetricPressure)
    .where(eq(careerMetricPressure.careerId, careerId));

  return {
    days,
    fameAccrued: pressure!.fameAccrued,
    respectAccrued: pressure!.respectAccrued,
    heatAccrued: pressure!.heatAccrued,
    close: test.close,
  };
}

describe("the same inputs produce the same three days", () => {
  let first: Run;
  let second: Run;

  beforeAll(async () => {
    first = await runThreeDays();
    second = await runThreeDays();
  });

  afterAll(async () => {
    await first.close();
    await second.close();
  });

  it("reproduces the entire trajectory, not just the totals", () => {
    // Exposure, listening, engagement, conversion, sharing, momentum and metric
    // pressure — every day, every cohort, identical.
    expect(second.days).toEqual(first.days);
  });

  it("reproduces the career consequences", () => {
    expect(second.fameAccrued).toBe(first.fameAccrued);
    expect(second.respectAccrued).toBe(first.respectAccrued);
    expect(second.heatAccrued).toBe(first.heatAccrued);
  });
});

describe("a changed input produces an explainably different trajectory", () => {
  let baseline: Run;
  let reachier: Run;
  let closerToTheScene: Run;

  beforeAll(async () => {
    baseline = await runThreeDays();

    // One variable: the reach the release recorded. The strategy, the record,
    // the artist and the world are untouched.
    reachier = await runThreeDays(async (test, { releaseId }) => {
      await test.handle.db
        .update(releases)
        .set({ audienceModifiers: { anticipation: 0, reach: 60, credibility: 0 } })
        .where(eq(releases.id, releaseId));
    });

    // One variable: the artist's own Sound DNA, moved onto the region scene
    // heads lean toward.
    closerToTheScene = await runThreeDays(async (test, { careerId }) => {
      const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
      await test.handle.db
        .update(soundProfiles)
        .set({
          rawPolished: -0.45,
          accessibleExperimental: 0.4,
          darkBright: -0.25,
          intimateAnthemic: -0.2,
        })
        .where(eq(soundProfiles.ownerId, career!.controlledEntityId!));
    });
  });

  afterAll(async () => {
    await baseline.close();
    await reachier.close();
    await closerToTheScene.close();
  });

  it("more recorded reach reaches more of the people who answer reach", () => {
    const before = cohortOf(baseline.days[0]!, "CASUAL_LISTENERS");
    const after = cohortOf(reachier.days[0]!, "CASUAL_LISTENERS");

    // Casual listeners answer reach and almost nothing else, so this is where
    // the modifier should show up first and largest.
    expect(after.evaluation.reachBoost).toBeGreaterThan(before.evaluation.reachBoost);
    expect(after.exposures).toBeGreaterThan(before.exposures);
    expect(reachier.days[0]!.totals.exposures).toBeGreaterThan(baseline.days[0]!.totals.exposures);

    // Breadth is Fame's business, so Fame is what moves.
    expect(reachier.fameAccrued).toBeGreaterThan(baseline.fameAccrued);
  });

  it("does not change what anybody thought of the record", () => {
    // Reach buys attention, not approval. Every cohort's judgement of the work
    // itself is untouched — if this drifted, the modifier would be doing
    // something it has no business doing.
    for (const slug of ["SCENE_HEADS", "CASUAL_LISTENERS", "TASTEMAKERS"]) {
      const before = cohortOf(baseline.days[0]!, slug).evaluation;
      const after = cohortOf(reachier.days[0]!, slug).evaluation;

      expect(after.fit).toBe(before.fit);
      expect(after.soundFit).toBe(before.soundFit);
      expect(after.qualityFit).toBe(before.qualityFit);
      expect(after.artistFit).toBe(before.artistFit);
      expect(after.credibilityBoost).toBe(before.credibilityBoost);
    }
  });

  it("an artist whose sound sits closer to the scene is taken more seriously by it", () => {
    const before = cohortOf(baseline.days[0]!, "SCENE_HEADS");
    const after = cohortOf(closerToTheScene.days[0]!, "SCENE_HEADS");

    // The cause.
    expect(after.evaluation.artistFit).toBeGreaterThan(before.evaluation.artistFit);
    expect(after.evaluation.fit).toBeGreaterThan(before.evaluation.fit);

    // The consequence, in order: engaged more, converted more, and pressed
    // harder on the metric that answers to this cohort.
    const engaged = (run: Run) =>
      run.days.reduce((sum, day) => sum + cohortOf(day, "SCENE_HEADS").engagedListeners, 0);
    const converted = (run: Run) =>
      run.days.reduce((sum, day) => sum + cohortOf(day, "SCENE_HEADS").fanConversions, 0);

    expect(engaged(closerToTheScene)).toBeGreaterThanOrEqual(engaged(baseline));
    expect(converted(closerToTheScene)).toBeGreaterThanOrEqual(converted(baseline));
    expect(closerToTheScene.respectAccrued).toBeGreaterThan(baseline.respectAccrued);
  });

  it("changes only what the artist's own sound could change", () => {
    // The record is the same record: how it sounds and what it is have not
    // moved for anybody. Only the artist behind it has.
    for (const slug of ["SCENE_HEADS", "CASUAL_LISTENERS", "TASTEMAKERS"]) {
      const before = cohortOf(baseline.days[0]!, slug).evaluation;
      const after = cohortOf(closerToTheScene.days[0]!, slug).evaluation;

      expect(after.soundFit).toBe(before.soundFit);
      expect(after.qualityFit).toBe(before.qualityFit);
      expect(after.reachBoost).toBe(before.reachBoost);
    }

    /*
     * Moving toward one cohort moves away from another: the same record now
     * divides the room more than it did. That widening gap is the trade the
     * player is actually making, and it is the claim worth asserting — the
     * absolute distance from the casual region can move either way depending
     * on which axes an artist happens to shift along.
     */
    const gap = (run: Run) =>
      cohortOf(run.days[0]!, "SCENE_HEADS").evaluation.fit -
      cohortOf(run.days[0]!, "CASUAL_LISTENERS").evaluation.fit;

    expect(gap(closerToTheScene)).toBeGreaterThan(gap(baseline));
  });
});

describe("the M4 handoff", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let releaseId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
    const made = await makePublishedRelease(test, user, "TEASED", { strategy: "TEASE" });
    careerId = made.careerId;
    releaseId = made.releaseId;
  });

  afterAll(async () => {
    await test.close();
  });

  it("consumes the modifiers the release recorded", async () => {
    const [release] = await test.handle.db
      .select()
      .from(releases)
      .where(eq(releases.id, releaseId));

    const tick = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId }),
    );

    // Exactly the stored payload, echoed by the tick that read it.
    expect(tick.result.audienceModifiers).toEqual({
      anticipation: release!.audienceModifiers.anticipation,
      reach: release!.audienceModifiers.reach,
      credibility: release!.audienceModifiers.credibility,
    });
    expect(tick.result.audienceModifiers.anticipation).toBeGreaterThan(0);
    expect(cohortOf(tick.result, "TASTEMAKERS").evaluation.anticipationBoost).toBeGreaterThan(1);
  });

  it("follows the stored payload even when the strategy says otherwise", async () => {
    /*
     * Rewrite the strategy on the release without touching the modifiers it
     * recorded. A simulator that re-derived the modifiers from the strategy
     * would now behave as though this had been dropped with no build-up.
     */
    await test.handle.db
      .update(releases)
      .set({ strategy: "DROP" })
      .where(eq(releases.id, releaseId));

    const tick = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId }),
    );

    expect(tick.dayIndex).toBe(2);
    expect(tick.result.audienceModifiers.anticipation).toBeGreaterThan(0);
    expect(cohortOf(tick.result, "TASTEMAKERS").evaluation.anticipationBoost).toBeGreaterThan(1);
  });

  it("stops answering anticipation when the stored payload stops carrying it", async () => {
    // The payload is the input. Empty it and the behaviour follows it down,
    // while the strategy column stays exactly where the last test left it.
    await test.handle.db
      .update(releases)
      .set({ audienceModifiers: { anticipation: 0, reach: 0, credibility: 0 } })
      .where(eq(releases.id, releaseId));

    const tick = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId }),
    );

    expect(tick.dayIndex).toBe(3);
    for (const cohort of tick.result.cohorts) {
      expect(cohort.evaluation.anticipationBoost).toBe(1);
      expect(cohort.evaluation.reachBoost).toBe(1);
    }
  });
});

/**
 * A database handle that fails partway through a reception tick.
 *
 * Wraps the transaction so that one specific write throws after the cohort
 * performance, the release performance and the artist's audience have all been
 * written — the worst possible moment, and precisely the one that would leave
 * projections without the events that justify them.
 */
function failingOn(db: Database, table: unknown): Database {
  const wrapTransaction = (tx: unknown) =>
    new Proxy(tx as object, {
      get(target, property, receiver) {
        if (property === "insert") {
          return (argument: unknown) => {
            if (argument === table) throw new Error("simulated failure mid-tick");
            return (target as { insert: (argument: unknown) => unknown }).insert(argument);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  return new Proxy(db as object, {
    get(target, property, receiver) {
      if (property === "transaction") {
        return (callback: (tx: unknown) => unknown) =>
          (target as { transaction: (inner: (tx: unknown) => unknown) => unknown }).transaction(
            (tx: unknown) => callback(wrapTransaction(tx)),
          );
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Database;
}

describe("a tick that fails applies nothing", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let releaseId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
    const made = await makePublishedRelease(test, user, "ROLLED BACK");
    careerId = made.careerId;
    releaseId = made.releaseId;
  });

  afterAll(async () => {
    await test.close();
  });

  it("rolls the whole tick back, and the retry is safe", async () => {
    const eventsBefore = await listCareerEvents(test.handle.db, careerId, 500);

    await expect(
      simulateReceptionTick(
        { ...test.ctx, db: failingOn(test.handle.db, careerMetricPressure) },
        { careerId, userId: user.id, releaseId },
      ),
    ).rejects.toThrow(/simulated failure/);

    // Nothing half-applied: no ledger row, no performance, no cohort rows, no
    // audience, no events, and the career untouched.
    const [ticks, performance, cohorts, pressure, career, eventsAfter] = await Promise.all([
      test.handle.db.select().from(receptionTicks).where(eq(receptionTicks.releaseId, releaseId)),
      test.handle.db
        .select()
        .from(releasePerformance)
        .where(eq(releasePerformance.releaseId, releaseId)),
      test.handle.db
        .select()
        .from(releaseCohortPerformance)
        .where(eq(releaseCohortPerformance.releaseId, releaseId)),
      test.handle.db
        .select()
        .from(careerMetricPressure)
        .where(eq(careerMetricPressure.careerId, careerId)),
      test.handle.db.select().from(careers).where(eq(careers.id, careerId)),
      listCareerEvents(test.handle.db, careerId, 500),
    ]);

    expect(ticks).toHaveLength(0);
    expect(performance).toHaveLength(0);
    expect(cohorts).toHaveLength(0);
    expect(pressure).toHaveLength(0);
    expect(career[0]!.fame).toBe(0);
    expect(career[0]!.respect).toBe(0);
    expect(career[0]!.heat).toBe(0);
    expect(eventsAfter).toHaveLength(eventsBefore.length);

    // And running it again, properly, produces day one exactly as it should.
    const retried = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId }),
    );
    expect(retried.dayIndex).toBe(1);
    expect(retried.alreadySimulated).toBe(false);
    expect(retried.result.totals.exposures).toBeGreaterThan(0);
  });
});
