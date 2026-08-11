import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artistAudience,
  audienceCohorts,
  careers,
  eq,
  receptionTicks,
  releaseCohortPerformance,
  releasePerformance,
  type AudienceCohortRow,
  type ReleaseCohortPerformanceRow,
  type ReleasePerformanceRow,
  type UserRow,
} from "@music-rpg/database";
import { advanceCareerDay } from "@music-rpg/domain";
import { calculateEngagement } from "@music-rpg/simulation";
import {
  unwrap,
  type CohortEvaluation,
  type ReceptionCohortState,
  type ReceptionTickResult,
} from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * Reception over a long horizon.
 *
 * Every projection column in reception is a *lifetime*, and the table's CHECK
 * constraints are the ontology written down: engaged listeners and returning
 * listeners are subsets of the people who listened, and listeners are a subset of
 * the people who were reached. Those statements have to hold for the whole life of
 * a record, not for as long as a test suite happens to simulate.
 *
 * The suite used to stop at three days, and that was the only reason nobody had
 * noticed. It became urgent once M7 arrived: opportunities expire on dates several
 * days out, so the world now routinely runs well past the point where a record's
 * returning listeners outnumber its daily new ones.
 *
 * Sixty days, one record, through the real day advance — reception, relationships,
 * moments and the director, exactly as a player would produce them.
 */

const HORIZON = 60;
const SEED = "long-horizon";

type Snapshot = {
  performance: ReleasePerformanceRow;
  cohorts: ReleaseCohortPerformanceRow[];
};

describe("reception holds its own invariants for the life of a record", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let releaseId: string;
  let cohortRows: AudienceCohortRow[];
  let daysAdvanced = 0;
  /** Every day's stored state, so an invariant can be located rather than merely failed. */
  const history: Snapshot[] = [];

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "KXMO");

    const made = await makePublishedRelease(test, user, "LONG HORIZON", {
      stageName: "KXMO",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });
    careerId = made.careerId;
    releaseId = made.releaseId;

    cohortRows = await test.handle.db.select().from(audienceCohorts);

    for (let day = 1; day <= HORIZON; day += 1) {
      const result = await advanceCareerDay(test.ctx, {
        careerId,
        userId: user.id,
        seed: SEED,
      });

      // A refusal is a failure here: sixty days must be survivable.
      unwrap(result);
      daysAdvanced += 1;

      const [performance] = await test.handle.db
        .select()
        .from(releasePerformance)
        .where(eq(releasePerformance.releaseId, releaseId));
      const cohorts = await test.handle.db
        .select()
        .from(releaseCohortPerformance)
        .where(eq(releaseCohortPerformance.releaseId, releaseId));

      history.push({ performance: performance!, cohorts });
    }
  }, 300_000);

  afterAll(async () => {
    await test.close();
  });

  it("advances sixty days without refusing one", () => {
    expect(daysAdvanced).toBe(HORIZON);
    expect(history).toHaveLength(HORIZON);
    expect(history[HORIZON - 1]!.performance.daysSimulated).toBe(HORIZON);
  });

  /**
   * The invariant this suite exists for.
   *
   * `repeatListeners` counts unique people from the listener population who have
   * returned at least once, each counted once over the record's lifetime. It can
   * therefore never exceed `uniqueListeners` — and it must not merely happen to
   * stay under it for the first few ticks.
   */
  it("never lets returning listeners outnumber listeners, on any day", () => {
    for (const [index, snapshot] of history.entries()) {
      const day = index + 1;
      expect(
        snapshot.performance.repeatListeners,
        `release totals, day ${day}`,
      ).toBeLessThanOrEqual(snapshot.performance.uniqueListeners);
    }
  });

  it("holds the same invariant for every cohort, on every day", () => {
    for (const [index, snapshot] of history.entries()) {
      const day = index + 1;
      for (const cohort of snapshot.cohorts) {
        const slug = cohortRows.find((row) => row.id === cohort.cohortId)?.slug ?? cohort.cohortId;
        expect(cohort.repeatListeners, `${slug}, day ${day}`).toBeLessThanOrEqual(
          cohort.uniqueListeners,
        );
      }
    }
  });

  /** The rest of the ontology, which the same write path could equally have broken. */
  it("keeps every listener population a subset of the one above it", () => {
    for (const [index, snapshot] of history.entries()) {
      const day = index + 1;
      const { performance, cohorts } = snapshot;

      expect(performance.uniqueListeners, `listeners ≤ reach, day ${day}`).toBeLessThanOrEqual(
        performance.totalExposures,
      );
      expect(performance.engagedListeners, `engaged ≤ listeners, day ${day}`).toBeLessThanOrEqual(
        performance.uniqueListeners,
      );
      expect(performance.fanConversions, `fans ≤ engaged, day ${day}`).toBeLessThanOrEqual(
        performance.engagedListeners,
      );

      for (const cohort of cohorts) {
        const slug = cohortRows.find((row) => row.id === cohort.cohortId)?.slug ?? cohort.cohortId;
        expect(cohort.uniqueListeners, `${slug} listeners ≤ reach, day ${day}`).toBeLessThanOrEqual(
          cohort.exposures,
        );
        expect(
          cohort.engagedListeners,
          `${slug} engaged ≤ listeners, day ${day}`,
        ).toBeLessThanOrEqual(cohort.uniqueListeners);
        expect(cohort.fanConversions, `${slug} fans ≤ engaged, day ${day}`).toBeLessThanOrEqual(
          cohort.engagedListeners,
        );
      }
    }
  });

  it("reconciles release totals against the cohort rows beneath them, every day", () => {
    for (const [index, snapshot] of history.entries()) {
      const day = index + 1;
      const sum = (pick: (row: ReleaseCohortPerformanceRow) => number) =>
        snapshot.cohorts.reduce((running, row) => running + pick(row), 0);

      expect(snapshot.performance.totalExposures, `reach, day ${day}`).toBe(
        sum((row) => row.exposures),
      );
      expect(snapshot.performance.uniqueListeners, `listeners, day ${day}`).toBe(
        sum((row) => row.uniqueListeners),
      );
      expect(snapshot.performance.engagedListeners, `engaged, day ${day}`).toBe(
        sum((row) => row.engagedListeners),
      );
      expect(snapshot.performance.repeatListeners, `returning, day ${day}`).toBe(
        sum((row) => row.repeatListeners),
      );
      expect(snapshot.performance.fanConversions, `fans, day ${day}`).toBe(
        sum((row) => row.fanConversions),
      );
      expect(snapshot.performance.shares, `shares, day ${day}`).toBe(sum((row) => row.shares));
    }
  });

  /** Lifetime totals only ever grow. Nothing here is a window. */
  it("never moves a lifetime total backwards", () => {
    for (let day = 1; day < HORIZON; day += 1) {
      const before = history[day - 1]!.performance;
      const after = history[day]!.performance;

      expect(after.totalExposures).toBeGreaterThanOrEqual(before.totalExposures);
      expect(after.uniqueListeners).toBeGreaterThanOrEqual(before.uniqueListeners);
      expect(after.engagedListeners).toBeGreaterThanOrEqual(before.engagedListeners);
      expect(after.repeatListeners).toBeGreaterThanOrEqual(before.repeatListeners);
      expect(after.fanConversions).toBeGreaterThanOrEqual(before.fanConversions);
      expect(after.shares).toBeGreaterThanOrEqual(before.shares);
    }
  });

  it("simulates each day exactly once, in order", async () => {
    const ticks = await test.handle.db
      .select()
      .from(receptionTicks)
      .where(eq(receptionTicks.releaseId, releaseId))
      .orderBy(receptionTicks.dayIndex);

    expect(ticks).toHaveLength(HORIZON);
    expect(ticks.map((tick) => tick.dayIndex)).toEqual(
      Array.from({ length: HORIZON }, (_, index) => index + 1),
    );
  });

  /**
   * A day's figures are not a lifetime, and this is the shape of the bug that
   * made the write path wrong: every recorded day is free to produce more
   * returning listeners than new ones, and over sixty days at least one does.
   */
  it("records days where returners outnumber arrivals, which is the correct behaviour", async () => {
    const ticks = await test.handle.db
      .select()
      .from(receptionTicks)
      .where(eq(receptionTicks.releaseId, releaseId))
      .orderBy(receptionTicks.dayIndex);

    const crossovers = ticks.filter((tick) => {
      const result = tick.result as ReceptionTickResult;
      return result.totals.newRepeatListeners > result.totals.newListeners;
    });

    expect(crossovers.length).toBeGreaterThan(0);
  });

  it("keeps momentum bounded and never negative", () => {
    for (const snapshot of history) {
      expect(snapshot.performance.currentMomentum).toBeGreaterThanOrEqual(0);
      expect(snapshot.performance.currentMomentum).toBeLessThanOrEqual(100);
    }
  });

  it("leaves Legacy exactly where it found it", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    // Sixty days of one Underground single does not create a legacy, and there is
    // nowhere for one to accumulate.
    expect(career!.legacy).toBe(0);
    expect(career!.fame).toBeGreaterThan(0);
  });

  it("keeps fans a persistent affinity rather than a listener count", async () => {
    const audience = await test.handle.db
      .select()
      .from(artistAudience)
      .where(eq(artistAudience.careerId, careerId));

    const last = history[HORIZON - 1]!;
    const totalFans = audience.reduce((running, row) => running + row.fans, 0);

    expect(totalFans).toBeGreaterThan(0);
    // Far fewer fans than listeners, for the whole horizon. Fans are not a rate.
    expect(totalFans).toBeLessThan(last.performance.uniqueListeners);

    for (const row of audience) {
      expect(row.affinity).toBeGreaterThanOrEqual(0);
      expect(row.affinity).toBeLessThanOrEqual(1000);
      expect(row.expectation).toBeLessThanOrEqual(1000);
    }
  });
});

/**
 * Determinism across the whole horizon.
 *
 * Two worlds, the same seed, the same sixty days: identical stored state. This is
 * what makes the invariants above claims about the model rather than about one
 * lucky run, and it is what would have caught the write path changing an answer
 * rather than only a tuple.
 */
describe("sixty days replay identically", () => {
  it("produces the same numbers from the same seed", async () => {
    const run = async () => {
      const test = await createTestContext();
      const user = await createTestUser(test, "KXMO");
      const made = await makePublishedRelease(test, user, "REPLAY", {
        stageName: "KXMO",
        producerSlug: "lex",
        strategy: "TEASE",
        friction: true,
      });

      for (let day = 1; day <= HORIZON; day += 1) {
        unwrap(
          await advanceCareerDay(test.ctx, {
            careerId: made.careerId,
            userId: user.id,
            seed: SEED,
          }),
        );
      }

      const [performance] = await test.handle.db
        .select()
        .from(releasePerformance)
        .where(eq(releasePerformance.releaseId, made.releaseId));
      const cohorts = await test.handle.db
        .select()
        .from(releaseCohortPerformance)
        .where(eq(releaseCohortPerformance.releaseId, made.releaseId));
      const [career] = await test.handle.db
        .select()
        .from(careers)
        .where(eq(careers.id, made.careerId));

      const shape = {
        exposures: performance!.totalExposures,
        listeners: performance!.uniqueListeners,
        engaged: performance!.engagedListeners,
        repeat: performance!.repeatListeners,
        fans: performance!.fanConversions,
        shares: performance!.shares,
        momentum: performance!.currentMomentum,
        standing: { fame: career!.fame, respect: career!.respect, heat: career!.heat },
        cohorts: cohorts
          .map((row) => ({
            exposures: row.exposures,
            listeners: row.uniqueListeners,
            engaged: row.engagedListeners,
            repeat: row.repeatListeners,
            fans: row.fanConversions,
          }))
          .sort((a, b) => b.exposures - a.exposures),
      };

      await test.close();
      return shape;
    };

    const first = await run();
    const second = await run();

    expect(second).toEqual(first);
  }, 300_000);
});

/**
 * Where the invariant actually comes from.
 *
 * The projection can only be trusted if the simulator cannot produce a figure
 * that breaks it, so this asks the engine directly, with no database anywhere
 * near it.
 *
 * The mechanism is an aggregate pool rather than individual listener identities,
 * which are deliberately not modelled: the people eligible to return today are
 * the ones who have already listened and have not come back yet. A day may
 * convert some of that pool and no more, so returning listeners approach the
 * listener population and never pass it.
 */
describe("the returner pool is what bounds returning listeners", () => {
  const cohort = (uniqueListeners: number, repeatListeners: number): ReceptionCohortState => ({
    slug: "SCENE_HEADS",
    size: 3_800,
    preferences: {
      sound: {},
      tolerance: 0.85,
      qualities: { focus: 0.35, distinctiveness: 0.52, immediacy: 0.13 },
    },
    behaviour: {
      baseDiscoveryRate: 0.0062,
      attention: 0.46,
      engagementBias: 0.44,
      conversionResistance: 3.2,
      shareTendency: 0.22,
      shareAmplification: 2.4,
      // Absurdly high on purpose: if anything could overshoot the pool, this would.
      repeatTendency: 1,
      reachSensitivity: 0.5,
      anticipationSensitivity: 0.35,
      credibilitySensitivity: 1,
      famePressure: 0.6,
      respectPressure: 1,
      heatPressure: 0.7,
    },
    fans: 0,
    affinity: 0,
    priorExposure: 0,
    exposures: 0,
    uniqueListeners,
    engagedListeners: 0,
    repeatListeners,
    fanConversions: 0,
    incomingWordOfMouth: 0,
  });

  const evaluation: CohortEvaluation = {
    cohortSlug: "SCENE_HEADS",
    fit: 1,
    soundFit: 1,
    qualityFit: 1,
    artistFit: 1,
    affinity: 0,
    reachBoost: 1,
    anticipationBoost: 1,
    credibilityBoost: 1,
  };

  it("never returns more returners than the pool allows, over a long run", () => {
    let uniqueListeners = 0;
    let repeatListeners = 0;

    for (let dayIndex = 1; dayIndex <= 200; dayIndex += 1) {
      // Arrivals dry up, exactly as they do late in a record's life.
      const newExposures = dayIndex < 20 ? 40 : 0;

      const outcome = calculateEngagement({
        cohort: cohort(uniqueListeners, repeatListeners),
        evaluation,
        newExposures,
        dayIndex,
        seed: "pool",
      });

      const pool = uniqueListeners - repeatListeners;
      expect(outcome.newRepeatListeners, `day ${dayIndex}`).toBeLessThanOrEqual(pool);
      expect(outcome.newRepeatListeners).toBeGreaterThanOrEqual(0);

      uniqueListeners += outcome.newListeners;
      repeatListeners += outcome.newRepeatListeners;

      // The lifetime invariant, asserted at the source rather than at the table.
      expect(repeatListeners, `day ${dayIndex}`).toBeLessThanOrEqual(uniqueListeners);
    }

    // And it did real work rather than trivially returning zero throughout.
    expect(repeatListeners).toBeGreaterThan(0);
    expect(uniqueListeners).toBeGreaterThan(0);
  });

  it("offers nobody to return on the first day, because nobody has heard it", () => {
    const outcome = calculateEngagement({
      cohort: cohort(0, 0),
      evaluation,
      newExposures: 100,
      dayIndex: 1,
      seed: "pool",
    });

    expect(outcome.newRepeatListeners).toBe(0);
    expect(outcome.newListeners).toBeGreaterThan(0);
  });
});
