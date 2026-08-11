import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artistAudience,
  audienceCohorts,
  careerMetricPressure,
  careers,
  eq,
  receptionTicks,
  releaseCohortPerformance,
  releasePerformance,
  releases,
  soundProfiles,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType, listCareerEvents } from "@music-rpg/events";
import {
  getArtistAudience,
  getCareerCounters,
  getReceptionHistory,
  getReleaseCohortPerformance,
  getReleasePerformance,
  simulateReceptionTick,
} from "@music-rpg/domain";
import {
  RECEPTION_SIMULATOR_VERSION,
  unwrap,
  type CohortTickOutcome,
  type ReceptionTickResult,
} from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * M5 — what happened when the music met the world.
 *
 * The rules this suite exists to protect:
 *
 * - Exposure, listening, engagement and fandom are four different things, and
 *   each is a strict subset of the one before it.
 * - The stored M4 modifiers are the handoff. The simulator reads them and never
 *   re-derives them from the release strategy.
 * - Reception unfolds through game time. Nothing is resolved at publication.
 * - Determinism *and* sensitivity: the same inputs reproduce, and a changed
 *   input changes the outcome in the direction it should.
 * - Legacy does not move.
 */

const cohortOf = (result: ReceptionTickResult, slug: string): CohortTickOutcome =>
  result.cohorts.find((entry) => entry.cohortSlug === slug)!;

describe("reception — the golden three days", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let releaseId: string;
  const days: ReceptionTickResult[] = [];

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
    const made = await makePublishedRelease(test, user, "NO RECEPTION");
    careerId = made.careerId;
    releaseId = made.releaseId;
  });

  afterAll(async () => {
    await test.close();
  });

  it("starts from a record that is out and that nobody has reacted to", async () => {
    const counters = await getCareerCounters(test.handle.db, { id: careerId });
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const view = await getReleasePerformance(test.handle.db, releaseId);

    expect(counters.monthlyListeners).toBe(0);
    expect(counters.fans).toBe(0);
    expect(career!.fame).toBe(0);
    expect(career!.respect).toBe(0);
    expect(career!.heat).toBe(0);
    expect(career!.legacy).toBe(0);

    // No performance at all, which is a different fact from a performance of
    // nothing: the simulation has not run.
    expect(view!.performance).toBeNull();
  });

  it("has audiences in the world that this artist has never reached", async () => {
    const [release] = await test.handle.db
      .select()
      .from(releases)
      .where(eq(releases.id, releaseId));

    const cohorts = await test.handle.db
      .select()
      .from(audienceCohorts)
      .where(eq(audienceCohorts.worldId, release!.worldId));

    expect(cohorts.map((cohort) => cohort.slug).sort()).toEqual([
      "CASUAL_LISTENERS",
      "SCENE_HEADS",
      "TASTEMAKERS",
    ]);
    // Populations exist independently of any career.
    expect(cohorts.every((cohort) => cohort.size > 0)).toBe(true);

    const standing = await test.handle.db
      .select()
      .from(artistAudience)
      .where(eq(artistAudience.careerId, careerId));
    expect(standing).toHaveLength(0);
  });

  it("day 1 — the record is exposed, and the cohorts answer differently", async () => {
    const tick = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId }),
    );
    days.push(tick.result);

    expect(tick.dayIndex).toBe(1);
    expect(tick.alreadySimulated).toBe(false);
    expect(tick.result.totals.exposures).toBeGreaterThan(0);
    expect(tick.result.cohorts).toHaveLength(3);

    // The same record, three different judgements. If these collapsed onto one
    // number the model would be a score with extra steps.
    const fits = tick.result.cohorts.map((cohort) => cohort.evaluation.fit);
    expect(new Set(fits).size).toBeGreaterThan(1);

    // A sparse, experimental, LEX-produced record: the scene hears it, the city
    // mostly does not.
    const scene = cohortOf(tick.result, "SCENE_HEADS");
    const casual = cohortOf(tick.result, "CASUAL_LISTENERS");
    expect(scene.evaluation.fit).toBeGreaterThan(casual.evaluation.fit);

    // Day one cannot contain word of mouth: nobody has heard it yet to pass on.
    expect(tick.result.cohorts.every((cohort) => cohort.wordOfMouthExposures === 0)).toBe(true);
    expect(tick.result.totals.repeatListeners).toBe(0);
  });

  it("day 2 — the previous day is an input, not a fresh start", async () => {
    const tick = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId }),
    );
    days.push(tick.result);

    expect(tick.dayIndex).toBe(2);

    // Yesterday's sharing is today's exposure, and yesterday's listeners are the
    // only people who can come back.
    expect(tick.result.cohorts.some((cohort) => cohort.wordOfMouthExposures > 0)).toBe(true);
    expect(tick.result.totals.repeatListeners).toBeGreaterThan(0);

    // Momentum carried rather than being recomputed from zero.
    expect(tick.result.momentumBefore).toBeCloseTo(days[0]!.momentumAfter, 5);
  });

  it("day 3 — a trajectory, and fans have emerged", async () => {
    const tick = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId }),
    );
    days.push(tick.result);

    expect(tick.dayIndex).toBe(3);
    expect(tick.result.momentumBefore).toBeCloseTo(days[1]!.momentumAfter, 5);

    const performance = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;
    expect(performance.daysSimulated).toBe(3);
    expect(performance.fanConversions).toBeGreaterThan(0);

    // Fewer fans than listeners, by a distance. If these were close the model
    // would be turning attention into loyalty for free.
    expect(performance.fanConversions).toBeLessThan(performance.uniqueListeners);
  });

  it("keeps exposure, listening, engagement and fandom as four different things", async () => {
    const performance = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;

    expect(performance.uniqueListeners).toBeLessThan(performance.totalExposures);
    expect(performance.engagedListeners).toBeLessThan(performance.uniqueListeners);
    expect(performance.fanConversions).toBeLessThanOrEqual(performance.engagedListeners);
    expect(performance.repeatListeners).toBeLessThanOrEqual(performance.uniqueListeners);
  });

  it("cannot exceed the population of a cohort", async () => {
    const views = await getReleaseCohortPerformance(test.handle.db, releaseId);

    for (const view of views) {
      expect(view.performance!.exposures).toBeLessThanOrEqual(view.cohort.size);
      expect(view.performance!.listeners).toBeLessThanOrEqual(view.performance!.exposures);
      expect(view.performance!.fanConversions).toBeLessThanOrEqual(
        view.performance!.engagedListeners,
      );
    }
  });

  it("reconciles the totals with the cohorts they are made of", async () => {
    const performance = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;
    const views = await getReleaseCohortPerformance(test.handle.db, releaseId);
    const rows = views.map((view) => view.performance!);

    const sum = (pick: (row: (typeof rows)[number]) => number) =>
      rows.reduce((total, row) => total + pick(row), 0);

    expect(sum((row) => row.exposures)).toBe(performance.totalExposures);
    expect(sum((row) => row.listeners)).toBe(performance.uniqueListeners);
    expect(sum((row) => row.engagedListeners)).toBe(performance.engagedListeners);
    expect(sum((row) => row.repeatListeners)).toBe(performance.repeatListeners);
    expect(sum((row) => row.fanConversions)).toBe(performance.fanConversions);
  });

  it("reconstructs every number from the canonical events", async () => {
    const events = await listCareerEvents(test.handle.db, careerId, 500);
    const performance = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;

    const exposureEvents = events.filter(
      (event) => event.eventType === GameEventType.ReceptionExposureOccurred,
    );
    const engagementEvents = events.filter(
      (event) => event.eventType === GameEventType.ReceptionEngagementOccurred,
    );
    const conversionEvents = events.filter(
      (event) => event.eventType === GameEventType.ReceptionFanConversionOccurred,
    );
    const tickEvents = events.filter(
      (event) => event.eventType === GameEventType.ReceptionTickCompleted,
    );

    expect(tickEvents).toHaveLength(3);
    expect(exposureEvents.length).toBeGreaterThan(0);

    const total = (rows: typeof events, key: string) =>
      rows.reduce((sum, event) => sum + Number((event.payload as Record<string, number>)[key] ?? 0), 0);

    // The projection is the sum of its history, not a number written beside it.
    expect(total(exposureEvents, "exposures")).toBe(performance.totalExposures);
    expect(total(engagementEvents, "listeners")).toBe(performance.uniqueListeners);
    expect(total(engagementEvents, "engagedListeners")).toBe(performance.engagedListeners);
    expect(total(conversionEvents, "fanConversions")).toBe(performance.fanConversions);

    // And each exposure event carries the evaluation that caused it.
    const payload = exposureEvents[0]!.payload as { evaluation?: { fit: number } };
    expect(payload.evaluation?.fit).toBeGreaterThan(0);
  });

  it("moves Fame, Respect and Heat for different reasons", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const [pressure] = await test.handle.db
      .select()
      .from(careerMetricPressure)
      .where(eq(careerMetricPressure.careerId, careerId));

    expect(pressure!.fameAccrued).toBeGreaterThan(0);
    expect(pressure!.respectAccrued).toBeGreaterThan(0);
    expect(pressure!.heatAccrued).toBeGreaterThan(0);

    // The visible metric is the floor of what has accrued — every point is
    // traceable to the ticks that earned it.
    expect(career!.fame).toBe(Math.floor(pressure!.fameAccrued));
    expect(career!.respect).toBe(Math.floor(pressure!.respectAccrued));
    expect(career!.heat).toBe(Math.floor(pressure!.heatAccrued));

    /*
     * A record the scene took seriously and the city did not notice. Respect
     * answers who engaged; Fame answers how many were reached — so a hundred
     * and thirty exposures must not buy the same standing as being taken up by
     * the people who matter to this artist.
     */
    expect(pressure!.respectAccrued).toBeGreaterThan(pressure!.fameAccrued);
    expect(career!.fame).toBeLessThan(5);
  });

  it("leaves Legacy at zero", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    expect(career!.legacy).toBe(0);

    // Not merely unmoved: there is nowhere for legacy pressure to accumulate.
    const [pressure] = await test.handle.db
      .select()
      .from(careerMetricPressure)
      .where(eq(careerMetricPressure.careerId, careerId));
    expect(pressure).not.toHaveProperty("legacyAccrued");
  });

  it("counts listeners and fans separately on the career", async () => {
    const counters = await getCareerCounters(test.handle.db, { id: careerId });
    const performance = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;

    expect(counters.monthlyListeners).toBe(performance.uniqueListeners);
    expect(counters.reach).toBe(performance.totalExposures);
    expect(counters.fans).toBe(performance.fanConversions);
    expect(counters.fans).toBeLessThan(counters.monthlyListeners);
  });

  it("keeps the artist's standing with each cohort, including the ones that ignored it", async () => {
    const [release] = await test.handle.db
      .select()
      .from(releases)
      .where(eq(releases.id, releaseId));
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    const views = await getArtistAudience(test.handle.db, {
      worldId: release!.worldId,
      ownerType: career!.controlledEntityType!,
      ownerId: career!.controlledEntityId!,
    });

    expect(views).toHaveLength(3);

    const scene = views.find((view) => view.cohort.slug === "SCENE_HEADS")!;
    const casual = views.find((view) => view.cohort.slug === "CASUAL_LISTENERS")!;

    // The cohort that engaged is warmer toward the artist than the one that
    // merely came across the record.
    expect(scene.audience!.affinity).toBeGreaterThan(casual.audience!.affinity);
    expect(scene.audience!.priorExposure).toBeGreaterThan(0);
    // Fans are persistent affinity, held per cohort, not a copy of listeners.
    expect(scene.audience!.fans).toBeGreaterThan(0);
    expect(scene.audience!.fans).toBeLessThan(scene.audience!.priorExposure);
  });

  it("records which simulator produced it", async () => {
    const performance = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;
    const history = await getReceptionHistory(test.handle.db, releaseId);

    expect(performance.simulatorVersion).toBe(RECEPTION_SIMULATOR_VERSION);
    expect(history).toHaveLength(3);
    expect(history.map((tick) => tick.dayIndex)).toEqual([1, 2, 3]);
    expect(history.every((tick) => tick.simulatorVersion === RECEPTION_SIMULATOR_VERSION)).toBe(true);
    // Every tick shares the seed the first one established.
    expect(new Set(history.map((tick) => tick.simulationSeed)).size).toBe(1);
  });

  it("simulating a day that already ran changes nothing", async () => {
    const before = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;
    const eventsBefore = await listCareerEvents(test.handle.db, careerId, 500);

    const again = unwrap(
      await simulateReceptionTick(test.ctx, { careerId, userId: user.id, releaseId, dayIndex: 2 }),
    );
    expect(again.alreadySimulated).toBe(true);

    const after = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;
    const eventsAfter = await listCareerEvents(test.handle.db, careerId, 500);

    expect(after.totalExposures).toBe(before.totalExposures);
    expect(after.fanConversions).toBe(before.fanConversions);
    expect(after.daysSimulated).toBe(3);
    expect(eventsAfter).toHaveLength(eventsBefore.length);

    const history = await getReceptionHistory(test.handle.db, releaseId);
    expect(history).toHaveLength(3);
  });

  it("refuses to skip ahead of the reception", async () => {
    const result = await simulateReceptionTick(test.ctx, {
      careerId,
      userId: user.id,
      releaseId,
      dayIndex: 9,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/in order/i);
  });

  it("moves the career's clock forward with its record, never backwards", async () => {
    const [release] = await test.handle.db
      .select()
      .from(releases)
      .where(eq(releases.id, releaseId));
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    const expected = new Date(release!.releasedGameTime!.getTime() + 3 * 24 * 60 * 60 * 1000);
    expect(career!.currentGameDate.getTime()).toBe(expected.getTime());
  });
});

describe("reception refuses to run on work that is not out", () => {
  let test: TestContext;
  let user: UserRow;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
  });

  afterAll(async () => {
    await test.close();
  });

  it("will not simulate a release that has only been planned", async () => {
    const { careerId, releaseId } = await makePublishedRelease(test, user, "HELD BACK");

    // Put it back to planned behind the command's back: the guard is on the
    // release's state, not on how it got there.
    await test.handle.db
      .update(releases)
      .set({ status: "PLANNED", releasedGameTime: null })
      .where(eq(releases.id, releaseId));

    const result = await simulateReceptionTick(test.ctx, {
      careerId,
      userId: user.id,
      releaseId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/isn't out/i);
  });
});
