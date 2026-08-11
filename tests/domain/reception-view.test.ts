import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { careers, eq, type UserRow } from "@music-rpg/database";
import {
  advanceCareerDay,
  createCareer,
  getCareerPulse,
  getHomeReception,
  getReleasePerformance,
  getReleaseReception,
  simulateReceptionTick,
} from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * What the player is allowed to see.
 *
 * Two things are being protected here. The first is the boundary: outcomes and
 * patterns cross it, simulator internals do not. The second is that the words
 * on the other side are true — a headline saying a record found its people has
 * to be backed by the cohort that actually kept the fans, or the interface is
 * telling a story the simulation did not.
 */

/** Anything on this list appearing in a player view is the bug. */
const FORBIDDEN_KEYS = [
  "fit",
  "soundFit",
  "qualityFit",
  "artistFit",
  "affinity",
  "reachBoost",
  "anticipationBoost",
  "credibilityBoost",
  "engagementBias",
  "shareAmplification",
  "baseDiscoveryRate",
  "conversionResistance",
  "evaluation",
  "behaviouralWeights",
  "preferences",
  "audienceModifiers",
  "simulationSeed",
  "simulatorVersion",
  "seed",
  "fameAccrued",
  "respectAccrued",
  "heatAccrued",
  "currentMomentum",
  "momentumBefore",
  "momentumAfter",
  "pressure",
  // Exposure is how the simulation reaches people; the player is told who
  // listened, which is a different and more honest number.
  "exposures",
  "totalExposures",
  "newExposures",
  "wordOfMouth",
  "wordOfMouthExposures",
];

function keysOf(value: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) keysOf(entry, found);
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      found.add(key);
      keysOf(nested, found);
    }
  }
  return found;
}

describe("the player view of reception", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let releaseId: string;
  let trackId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
    const made = await makePublishedRelease(test, user, "NO RECEPTION");
    careerId = made.careerId;
    releaseId = made.releaseId;
    trackId = made.trackId;
  });

  afterAll(async () => {
    await test.close();
  });

  it("says a record is out and nothing has come back, before any day passes", async () => {
    const home = (await getHomeReception(test.handle.db, { id: careerId }))!;

    expect(home.awaitingFirstDay).toBe(true);
    expect(home.release.headline).toBe("NO RECEPTION is out. Nobody knows what happens next.");
    expect(home.release.uniqueListeners).toBe(0);
    expect(home.release.daysOut).toBe(0);

    // No reception at all rather than a reception of nothing.
    expect(await getReleaseReception(test.handle.db, releaseId)).toBeNull();
  });

  it("advances one in-world day at a time", async () => {
    const first = unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));
    expect(first.ticks).toHaveLength(1);
    expect(first.ticks[0]!.dayIndex).toBe(1);

    const view = (await getReleaseReception(test.handle.db, releaseId))!;
    expect(view.daysOut).toBe(1);
    expect(view.days).toHaveLength(1);
    expect(view.days[0]!.line).toBe("People are starting to find it.");

    // The career's clock moved with its record.
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    expect(career!.currentGameDate.getTime()).toBe(first.gameTime.getTime());
  });

  it("tells the three-day story, day by day, in the order it happened", async () => {
    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));
    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id }));

    const view = (await getReleaseReception(test.handle.db, releaseId))!;

    expect(view.daysOut).toBe(3);
    expect(view.days.map((day) => day.dayIndex)).toEqual([1, 2, 3]);
    expect(view.days.map((day) => day.line)).toEqual([
      "People are starting to find it.",
      "It's being passed around.",
      "The first pattern is emerging.",
    ]);

    // Running totals only ever climb, and the last one is the headline figure.
    const cumulative = view.days.map((day) => day.cumulativeListeners);
    expect([...cumulative].sort((a, b) => a - b)).toEqual(cumulative);
    expect(cumulative[cumulative.length - 1]).toBe(view.uniqueListeners);
    expect(view.days[view.days.length - 1]!.cumulativeFans).toBe(view.fansGained);
  });

  it("names what happened, and the naming is backed by the numbers", async () => {
    const view = (await getReleaseReception(test.handle.db, releaseId))!;

    expect(view.trajectory).toBe("FINDING_ITS_PEOPLE");
    expect(view.headline).toBe("NO RECEPTION is finding its people.");
    expect(view.insight).toBe(
      "Scene heads are responding much more strongly than casual listeners.",
    );

    const scene = view.cohorts.find((cohort) => cohort.name === "Scene heads")!;
    const casual = view.cohorts.find((cohort) => cohort.name === "Casual listeners")!;

    // The headline claims one audience took it up and kept it, so that audience
    // must actually hold the fans — otherwise the interface is narrating.
    expect(scene.responseLabel).toBe("Strong response");
    expect(scene.fansGained).toBe(view.fansGained);
    expect(casual.responseLabel).toBe("Weak response");
    expect(casual.fansGained).toBe(0);
  });

  it("reconciles every visible number with the simulator", async () => {
    const view = (await getReleaseReception(test.handle.db, releaseId))!;
    const performance = (await getReleasePerformance(test.handle.db, releaseId))!.performance!;

    expect(view.uniqueListeners).toBe(performance.uniqueListeners);
    expect(view.fansGained).toBe(performance.fanConversions);
    expect(view.engagedListeners).toBe(performance.engagedListeners);
    expect(view.returningListeners).toBe(performance.repeatListeners);
    expect(view.daysOut).toBe(performance.daysSimulated);

    // Cohorts reconcile too, so a breakdown can never sum to something other
    // than the total sitting above it.
    const sum = view.cohorts.reduce((total, cohort) => total + cohort.uniqueListeners, 0);
    expect(sum).toBe(performance.uniqueListeners);
  });

  it("carries no simulator internals across the boundary", async () => {
    const view = (await getReleaseReception(test.handle.db, releaseId))!;
    const home = (await getHomeReception(test.handle.db, { id: careerId }))!;
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const pulse = await getCareerPulse(test.handle.db, career!);

    for (const [name, payload] of [
      ["release", view],
      ["home", home],
      ["pulse", pulse],
    ] as const) {
      const keys = keysOf(payload);
      for (const forbidden of FORBIDDEN_KEYS) {
        expect(
          keys.has(forbidden),
          `${name} view exposes "${forbidden}" — that belongs in World Control`,
        ).toBe(false);
      }
    }

    // Momentum crosses as a direction, never as 13.55.
    expect(typeof view.momentum).toBe("string");
    expect(view.momentumLabel).toBeTruthy();
    expect(JSON.stringify(view)).not.toMatch(/momentum"\s*:\s*[0-9]/);
  });

  it("reports what the week did to the career, Legacy included", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const pulse = await getCareerPulse(test.handle.db, career!);

    expect(pulse.fansGained).toBeGreaterThan(0);
    expect(pulse.newListeners).toBeGreaterThan(0);
    expect(pulse.quiet).toBe(false);

    const by = (key: string) => pulse.metrics.find((metric) => metric.key === key)!;

    // Fame crossing from nothing to something is its own event, and reads
    // differently from Respect, which moved further.
    expect(by("FAME").movementLabel).toBe("Emerging");
    expect(by("RESPECT").movementLabel).toBe("Rising");
    expect(by("HEAT").movementLabel).toBe("Rising");

    // Legacy is reported rather than omitted. Saying it did not move is the
    // whole point of it.
    expect(by("LEGACY").movement).toBe("UNCHANGED");
    expect(by("LEGACY").level).toBe("Not written");
    expect(career!.legacy).toBe(0);

    // Levels are words. The integers stay on the career row.
    for (const metric of pulse.metrics) {
      expect(metric.level).not.toMatch(/[0-9]/);
    }
  });

  it("leads Home with the record, and points at the track it came from", async () => {
    const home = (await getHomeReception(test.handle.db, { id: careerId }))!;

    expect(home.awaitingFirstDay).toBe(false);
    expect(home.release.headline).toBe("NO RECEPTION is finding its people.");
    expect(home.release.trackId).toBe(trackId);
  });

  it("refuses to advance a career with nothing out", async () => {
    const other = await createTestUser(test, "Nobody");
    const created = unwrap(await createCareer(test.ctx, { userId: other.id }));

    const result = await advanceCareerDay(test.ctx, {
      careerId: created.career.id,
      userId: other.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/nothing/i);
  });

  it("advancing twice in the same breath moves the world once", async () => {
    const before = (await getReleaseReception(test.handle.db, releaseId))!;

    // Same day requested directly: the ledger key refuses the second write.
    const repeat = unwrap(
      await simulateReceptionTick(test.ctx, {
        careerId,
        userId: user.id,
        releaseId,
        dayIndex: before.daysOut,
      }),
    );
    expect(repeat.alreadySimulated).toBe(true);

    const after = (await getReleaseReception(test.handle.db, releaseId))!;
    expect(after.uniqueListeners).toBe(before.uniqueListeners);
    expect(after.days).toHaveLength(before.days.length);
  });
});
