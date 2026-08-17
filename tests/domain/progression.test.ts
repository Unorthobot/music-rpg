import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artists, careerProgressionObservations, careers, gameEvents, groups,
  receptionTicks, releasePerformance, eq,
} from "@music-rpg/database";
import { advanceCareerDay, loadProgressionObservation } from "@music-rpg/domain";
import { RECOGNITION_DOMAINS } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { decisionOf, domainsOf, liveGolden } from "../helpers/progression";

/**
 * The Come Up, proven through histories the game can actually produce.
 *
 * Every career here is built by real commands answering real offers. The
 * central claim is not that a rule was implemented but that **the four routes
 * are genuinely different and the runaway is genuinely blocked** — which is the
 * one thing a progression model can get wrong in a way nobody notices for a
 * year.
 */

let T: TestContext;
beforeAll(async () => { T = await createTestContext(); }, 120_000);
afterAll(async () => { await T?.close(); });

describe("the four routes", () => {
  it("A · a returning producer: RECEPTION + PEER, no crew, no battle, no night", async () => {
    const user = await createTestUser(T, "Golden A");
    const run = await liveGolden(T, user, "A");

    expect(await domainsOf(T, run.careerId)).toEqual(
      expect.arrayContaining(["RECEPTION", "PEER"]),
    );
    expect(await domainsOf(T, run.careerId)).not.toContain("PUBLIC_RECORD");
    expect(run.transitionDay, "A should reach The Come Up").not.toBeNull();

    const row = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(row.careerAct).toBe("COME_UP");
  }, 300_000);

  it("B · crew commitment: one landed record is enough, no second release", async () => {
    const user = await createTestUser(T, "Golden B");
    const run = await liveGolden(T, user, "B");

    expect(await domainsOf(T, run.careerId)).toEqual(
      expect.arrayContaining(["RECEPTION", "PEER"]),
    );
    expect(run.transitionDay).not.toBeNull();

    /* One record only — PEER did not come from repeated work. */
    const releases = await T.handle.db
      .select().from(releasePerformance).where(eq(releasePerformance.careerId, run.careerId));
    expect(releases).toHaveLength(1);
  }, 300_000);

  it("C · competitive: RECEPTION + PUBLIC_RECORD via battle, no PEER", async () => {
    const user = await createTestUser(T, "Golden C");
    const run = await liveGolden(T, user, "C", 45);

    const domains = await domainsOf(T, run.careerId);
    expect(domains).toEqual(expect.arrayContaining(["RECEPTION", "PUBLIC_RECORD"]));
    expect(run.transitionDay).not.toBeNull();

    const kinds = new Set(
      (await T.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, run.careerId)))
        .map((e) => e.eventType)
        .filter((t) => ["release.published", "battle.resolved", "performance.resolved"].includes(t)),
    );
    expect(kinds).toContain("battle.resolved");
    expect(kinds).not.toContain("performance.resolved");
  }, 300_000);

  it("D · live: RECEPTION + PUBLIC_RECORD via performance.resolved, no battle", async () => {
    const user = await createTestUser(T, "Golden D");
    const run = await liveGolden(T, user, "D");

    expect(await domainsOf(T, run.careerId)).toEqual(
      expect.arrayContaining(["RECEPTION", "PUBLIC_RECORD"]),
    );
    expect(run.transitionDay).not.toBeNull();

    const kinds = new Set(
      (await T.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, run.careerId)))
        .map((e) => e.eventType)
        .filter((t) => ["release.published", "battle.resolved", "performance.resolved"].includes(t)),
    );
    expect(kinds).toContain("performance.resolved");
    expect(kinds).not.toContain("battle.resolved");
  }, 300_000);
});

describe("the careers that must not come up", () => {
  it("E · a record nobody responded to never even reaches RECEPTION", async () => {
    const user = await createTestUser(T, "Golden E");
    const run = await liveGolden(T, user, "E");

    expect(await domainsOf(T, run.careerId)).not.toContain("RECEPTION");
    expect(run.transitionDay).toBeNull();

    const row = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(row.careerAct).toBe("UNDERGROUND");
  }, 300_000);

  /** The anti-grind proof, and the reason the non-RECEPTION clause exists. */
  it("F · arbitrarily large reception alone never comes up", async () => {
    const user = await createTestUser(T, "Golden F");
    const run = await liveGolden(T, user, "F", 60);

    const decision = await decisionOf(T, run.careerId);
    expect(decision.evidence.satisfiedDomains).toEqual(["RECEPTION"]);
    expect(decision.evidence.beyondReception).toBe(false);
    expect(decision.evidence.qualifying).toBe(false);
    expect(decision.blockedBy).toBe("RECEPTION_ONLY");
    expect(run.transitionDay).toBeNull();

    /* And the magnitude really is large — this is not a weak career. */
    const performance = (await T.handle.db
      .select().from(releasePerformance).where(eq(releasePerformance.careerId, run.careerId)))[0]!;
    expect(performance.fanConversions).toBeGreaterThan(500);

    /* Descriptors may be plentiful; they still do not add up to a domain. */
    expect(decision.evidence.satisfied.length).toBeGreaterThan(1);
  }, 300_000);
});

describe("how qualification is counted", () => {
  it("counts witnessed kinds, never occurrences", async () => {
    const user = await createTestUser(T, "Kinds");
    const run = await liveGolden(T, user, "D");

    const events = (await T.handle.db
      .select().from(gameEvents).where(eq(gameEvents.careerId, run.careerId)))
      .filter((e) => e.eventType === "performance.resolved");

    /* Many nights happened... */
    expect(events.length).toBeGreaterThan(1);

    /* ...and they are one kind of public fact, not many. */
    const decision = await decisionOf(T, run.careerId);
    const witnessed = decision.evidence.checks.find((c) => c.descriptor === "THINGS_THE_SCENE_SAW")!;
    expect(witnessed.observed.kinds).toBe(2);
  }, 300_000);

  it("has no durability window, no score and no progress percentage", async () => {
    const user = await createTestUser(T, "Shape");
    const run = await liveGolden(T, user, "B", 20);
    const decision = await decisionOf(T, run.careerId);

    const serialised = JSON.stringify(decision);
    /*
     * "progression" is the module's own name and is expected; what must never
     * appear is a window, a total or anything a screen could render as a bar.
     */
    for (const forbidden of ["durab", "qualifyingsince", "percent", "score", "weight", "confidence"]) {
      expect(serialised.toLowerCase(), `decision leaked "${forbidden}"`).not.toContain(forbidden);
    }
    expect(Object.keys(decision)).not.toContain("durability");

    /*
     * No field anywhere sums evidence into one figure. Plain counts survive —
     * `cohortsTotal` is how many cohorts exist, not how far along a career is —
     * so this looks for a total *of the decision*, which must not exist.
     */
    const keys = (serialised.match(/"[^"]+":/g) ?? []).map((k) => k.toLowerCase());
    expect(keys.filter((k) => /"(total|points|progresstoward|overall)"/.test(k))).toEqual([]);
  }, 300_000);
});

describe("the transition itself", () => {
  it("happens exactly once and never goes backwards", async () => {
    const user = await createTestUser(T, "Once");
    const run = await liveGolden(T, user, "B");
    expect(run.transitionDay).not.toBeNull();

    for (let i = 0; i < 10; i += 1) {
      await advanceCareerDay(T.ctx, { careerId: run.careerId, userId: user.id, seed: "golden" });
    }

    const entered = (await T.handle.db
      .select().from(gameEvents).where(eq(gameEvents.careerId, run.careerId)))
      .filter((e) => e.eventType === "career.entered_come_up");

    expect(entered).toHaveLength(1);
    expect(entered[0]!.visibility).toBe("LOCAL_PUBLIC");

    const row = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(row.careerAct).toBe("COME_UP");
  }, 300_000);

  it("opens the controlled entity's profile and nothing else", async () => {
    const user = await createTestUser(T, "Public");
    const publicBefore = new Set(
      (await T.handle.db.select().from(artists)).filter((a) => a.isPublic).map((a) => a.id),
    );

    const run = await liveGolden(T, user, "B");
    const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;

    if (career.controlledEntityType === "ARTIST") {
      const artist = (await T.handle.db
        .select().from(artists).where(eq(artists.id, career.controlledEntityId!)))[0]!;
      expect(artist.isPublic).toBe(true);
    } else {
      const group = (await T.handle.db
        .select().from(groups).where(eq(groups.id, career.controlledEntityId!)))[0]!;
      expect(group.isPublic).toBe(true);
    }

    /*
     * Nobody else became public because this career did. Measured as a delta:
     * the suite shares one world, so earlier golden careers are legitimately
     * public already.
     */
    const newlyPublic = (await T.handle.db.select().from(artists))
      .filter((a) => a.isPublic && !publicBefore.has(a.id))
      .map((a) => a.id);
    expect(newlyPublic).toEqual(
      career.controlledEntityType === "ARTIST" ? [career.controlledEntityId] : [],
    );
  }, 300_000);

  it("keeps Legacy at zero", async () => {
    const careerRows = await T.handle.db.select().from(careers);
    for (const row of careerRows) expect(row.legacy).toBe(0);
    const artistRows = await T.handle.db.select().from(artists);
    for (const row of artistRows) expect(row.legacy).toBe(0);
  });
});

describe("observation storage", () => {
  it("records when each domain was first reached, and never clears it", async () => {
    const user = await createTestUser(T, "Observation");
    const run = await liveGolden(T, user, "B");

    const before = await loadProgressionObservation(T.ctx, run.careerId);
    expect(before.domainFirstReached.RECEPTION).toBeTruthy();
    expect(before.domainFirstReached.PEER).toBeTruthy();

    for (let i = 0; i < 10; i += 1) {
      await advanceCareerDay(T.ctx, { careerId: run.careerId, userId: user.id, seed: "golden" });
    }

    const after = await loadProgressionObservation(T.ctx, run.careerId);
    for (const domain of RECOGNITION_DOMAINS) {
      const first = before.domainFirstReached[domain];
      if (!first) continue;
      /* Set once. It never moves and never clears. */
      expect(after.domainFirstReached[domain]?.getTime()).toBe(first.getTime());
    }

    const row = (await T.handle.db
      .select().from(careerProgressionObservations)
      .where(eq(careerProgressionObservations.careerId, run.careerId)))[0]!;
    expect(row.receptionFirstReachedGameTime).not.toBeNull();
    expect(Object.keys(row)).not.toContain("qualifyingSinceGameTime");
  }, 300_000);
});

describe("the transition does not rewrite history", () => {
  it("leaves every fact recorded before it byte-identical", async () => {
    const user = await createTestUser(T, "History");
    const run = await liveGolden(T, user, "B", 12);

    const snapshot = async () => ({
      ticks: await T.handle.db.select().from(receptionTicks).where(eq(receptionTicks.careerId, run.careerId)),
      performance: await T.handle.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, run.careerId)),
    });

    const before = await snapshot();
    const beforeIds = new Set(before.ticks.map((t) => t.id));

    for (let i = 0; i < 6; i += 1) {
      await advanceCareerDay(T.ctx, { careerId: run.careerId, userId: user.id, seed: "golden" });
    }

    const after = await snapshot();

    /* Every tick that existed before the transition is unchanged. */
    for (const tick of before.ticks) {
      const same = after.ticks.find((t) => t.id === tick.id);
      expect(same, "a reception tick disappeared").toBeDefined();
      expect(same).toEqual(tick);
    }
    /* New ticks are additions, never rewrites of old ones. */
    expect(after.ticks.filter((t) => beforeIds.has(t.id))).toHaveLength(before.ticks.length);
  }, 300_000);
});

describe("M8.5 knows nothing about progression", () => {
  it("imports no progression symbol anywhere in the performance system", async () => {
    const { readFileSync } = await import("node:fs");
    const files = [
      "packages/domain/src/commands/performances.ts",
      "packages/simulation/src/performances/resolve.ts",
      "packages/simulation/src/performances/consequences.ts",
      "packages/simulation/src/performances/constants.ts",
      "packages/shared/src/performances.ts",
      "packages/database/src/schema/performances.ts",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      /*
       * Imports only. `performances.ts` says in prose that it references no
       * progression concept, and a naive substring search would fail on the
       * sentence asserting the very property being tested.
       */
      const imports = source
        .split("\n")
        .filter((line) => /^\s*(import|export)\s.*from\s/.test(line))
        .join("\n");
      expect(imports, `${file} imports progression`).not.toMatch(/progression/i);

      /* And no progression vocabulary is used, in prose or otherwise. */
      expect(source).not.toMatch(/RECOGNITION_DOMAINS|EVIDENCE_DESCRIPTORS|decidePhase|PhaseDecision/);
    }
  });
});
