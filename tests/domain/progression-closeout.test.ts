import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artists, careerProgressionObservations, careers, gameEvents, groupMemberships, groups,
  receptionTicks, releaseCohortPerformance, releasePerformance, tracks, eq,
} from "@music-rpg/database";
import { advanceCareerDay, loadProgressionObservation } from "@music-rpg/domain";
import { ACT_REACH, PHASE_BLOCKER_LABELS } from "@music-rpg/simulation";
import { RECOGNITION_DOMAINS, availableFormats } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { decisionOf, domainsOf, liveGolden } from "../helpers/progression";

/**
 * M9 closeout: consequences and historical integrity.
 *
 * The ontology is proven elsewhere. This file exists for the failure that would
 * be worst and quietest — **entering The Come Up rewriting the past**. A phase
 * is a fact about the world from now on; a record that reached people as an
 * Underground record reached them as one, forever.
 */

let T: TestContext;
beforeAll(async () => { T = await createTestContext(); }, 120_000);
afterAll(async () => { await T?.close(); });

/**
 * The public feed, filtered exactly as `/world` filters it.
 *
 * Read straight from `game_events` rather than through `listCareerEvents`,
 * which caps its result — a career with weeks of reception has thousands of
 * events and the cap would hide the very fact under test.
 */
const publicEventsFor = async (careerId: string) =>
  (await T.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, careerId)))
    .filter((e) => e.visibility === "LOCAL_PUBLIC" || e.visibility === "GLOBAL_PUBLIC");

describe("1 · the transition itself", () => {
  for (const mode of ["A", "B", "C", "D"] as const) {
    it(`${mode} · transitions exactly once and never backwards`, async () => {
      const user = await createTestUser(T, `Closeout ${mode}`);
      const run = await liveGolden(T, user, mode, mode === "C" ? 45 : 40);
      expect(run.transitionDay).not.toBeNull();

      /* Ten further advances must change nothing about the transition. */
      for (let i = 0; i < 10; i += 1) {
        await advanceCareerDay(T.ctx, { careerId: run.careerId, userId: user.id, seed: "golden" });
      }

      const events = (await T.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, run.careerId)))
        .filter((e) => e.eventType === "career.entered_come_up");
      expect(events, "entered_come_up must be written once").toHaveLength(1);
      expect(events[0]!.visibility).toBe("LOCAL_PUBLIC");

      const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
      expect(career.careerAct).toBe("COME_UP");
      expect(career.legacy).toBe(0);

      if (career.controlledEntityType === "ARTIST") {
        const artist = (await T.handle.db.select().from(artists).where(eq(artists.id, career.controlledEntityId!)))[0]!;
        expect(artist.legacy).toBe(0);
      }
    }, 300_000);
  }
});

describe("2 · ACT_REACH applies forward only", () => {
  it("leaves every reception row written before the transition byte-identical", async () => {
    const user = await createTestUser(T, "Reach");
    const run = await liveGolden(T, user, "C", 12);

    const career0 = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(career0.careerAct, "must still be Underground for this to prove anything").toBe("UNDERGROUND");

    const before = {
      ticks: await T.handle.db.select().from(receptionTicks).where(eq(receptionTicks.careerId, run.careerId)),
      performance: await T.handle.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, run.careerId)),
      cohorts: await T.handle.db.select().from(releaseCohortPerformance),
    };
    expect(before.ticks.length).toBeGreaterThan(0);

    /* Run until it comes up, then a few days beyond. */
    let transitioned = false;
    for (let i = 0; i < 20 && !transitioned; i += 1) {
      await advanceCareerDay(T.ctx, { careerId: run.careerId, userId: user.id, seed: "golden" });
      const row = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
      transitioned = row.careerAct === "COME_UP";
    }
    expect(transitioned, "career never came up").toBe(true);

    const after = {
      ticks: await T.handle.db.select().from(receptionTicks).where(eq(receptionTicks.careerId, run.careerId)),
      performance: await T.handle.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, run.careerId)),
      cohorts: await T.handle.db.select().from(releaseCohortPerformance),
    };

    /*
     * **`reception_ticks` is the immutable history**: one row per simulated
     * day, recording what actually happened on it. Every row written while the
     * career was Underground must survive the transition byte-for-byte. This is
     * the assertion that makes it impossible for COME_UP's 1.6x reach to
     * retroactively inflate a day that was lived as an unknown.
     */
    for (const tick of before.ticks) {
      expect(after.ticks.find((t) => t.id === tick.id), "a tick was rewritten").toEqual(tick);
    }

    /*
     * `release_performance` and `release_cohort_performance` are *running
     * projections*, not history — they accumulate as a record keeps being
     * simulated, so byte-equality would be the wrong claim. What must hold is
     * that they only ever move forward and never revise what was already
     * counted.
     */
    for (const cohort of before.cohorts) {
      const now = after.cohorts.find((c) => c.id === cohort.id);
      expect(now, "a cohort projection vanished").toBeDefined();
      expect(now!.releaseId).toBe(cohort.releaseId);
      expect(now!.cohortId).toBe(cohort.cohortId);
      expect(now!.uniqueListeners).toBeGreaterThanOrEqual(cohort.uniqueListeners);
      expect(now!.fanConversions).toBeGreaterThanOrEqual(cohort.fanConversions);
    }

    /*
     * `release_performance` is a running projection, so it legitimately moves
     * forward. What must never happen is a *decrease* or a rewrite of the
     * already-counted history.
     */
    for (const row of before.performance) {
      /* Keyed by release: `release_performance` is one row per release. */
      const now = after.performance.find((p) => p.releaseId === row.releaseId)!;
      expect(now.daysSimulated).toBeGreaterThanOrEqual(row.daysSimulated);
      expect(now.uniqueListeners).toBeGreaterThanOrEqual(row.uniqueListeners);
      expect(now.fanConversions).toBeGreaterThanOrEqual(row.fanConversions);
      /* And the release's own identity and start are unchanged. */
      expect(now.releaseId).toBe(row.releaseId);
      expect(now.careerId).toBe(row.careerId);
    }

    /* The constant the future will read is the existing one; M9 invented none. */
    expect(ACT_REACH.COME_UP).toBe(1.6);
    expect(ACT_REACH.UNDERGROUND).toBe(1);
  }, 300_000);
});

describe("3 · release formats open by act, honestly", () => {
  it("unlocks act-gated formats on the same catalogue, and keeps track gates", async () => {
    const user = await createTestUser(T, "Formats");
    const run = await liveGolden(T, user, "B");

    const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(career.careerAct).toBe("COME_UP");

    const catalogueSize = (await T.handle.db.select().from(tracks).where(eq(tracks.careerId, run.careerId))).length;

    const underground = availableFormats({ careerAct: "UNDERGROUND", catalogueSize });
    const comeUp = availableFormats({ careerAct: "COME_UP", catalogueSize });

    const find = (list: typeof underground, format: string) => list.find((f) => f.format === format)!;

    /* EP is act-gated: locked as Underground for that reason alone. */
    expect(find(underground, "EP").available).toBe(false);
    expect(find(underground, "EP").lockedReason).toBe("Not at this stage of your career.");

    /* Same catalogue, after the act changes. */
    const ep = find(comeUp, "EP");
    if (catalogueSize >= ep.minimumTracks) {
      expect(ep.available, "act gate should have opened").toBe(true);
    } else {
      /* Still locked — but now honestly, for the track count, not the act. */
      expect(ep.available).toBe(false);
      expect(ep.lockedReason).toBe(`You need at least ${ep.minimumTracks} tracks.`);
    }

    /* Formats open to everyone are unaffected by the transition. */
    expect(find(underground, "SINGLE").available).toBe(find(comeUp, "SINGLE").available);

    /* And a catalogue gate is never waived by the act. */
    const album = availableFormats({ careerAct: "COME_UP", catalogueSize: 1 }).find((f) => f.format === "ALBUM")!;
    expect(album.available).toBe(false);
  }, 300_000);
});

describe("4 · public identity", () => {
  it("solo: the controlled artist becomes public and nobody else does", async () => {
    const user = await createTestUser(T, "Solo Public");
    const before = new Set((await T.handle.db.select().from(artists)).filter((a) => a.isPublic).map((a) => a.id));

    const run = await liveGolden(T, user, "B");
    const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(career.controlledEntityType).toBe("ARTIST");

    const newlyPublic = (await T.handle.db.select().from(artists))
      .filter((a) => a.isPublic && !before.has(a.id)).map((a) => a.id);
    expect(newlyPublic).toEqual([career.controlledEntityId]);
  }, 300_000);

  /**
   * The regression that matters: a group coming up must never publish its
   * members. `player_artist_id` exists precisely so the public thing and the
   * player's own artist can differ.
   */
  it("group: only the group is published, never its members", async () => {
    const groupRows = await T.handle.db.select().from(groups);
    const memberships = await T.handle.db.select().from(groupMemberships);

    for (const group of groupRows) {
      const careerRows = (await T.handle.db.select().from(careers))
        .filter((c) => c.controlledEntityType === "GROUP" && c.controlledEntityId === group.id);
      if (careerRows.length === 0 || careerRows[0]!.careerAct !== "COME_UP") continue;

      expect(group.isPublic, "the group itself should be public").toBe(true);

      const memberIds = memberships.filter((m) => m.groupId === group.id).map((m) => m.artistId);
      for (const artistId of memberIds) {
        const artist = (await T.handle.db.select().from(artists).where(eq(artists.id, artistId)))[0];
        expect(artist?.isPublic, `member ${artistId} was published by the group coming up`).toBe(false);
      }
    }
  });

  it("structurally: the transition writes one entity, chosen by controlled_entity_type", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("packages/domain/src/commands/progression.ts", "utf8");
    /* No path publishes group members or the player artist. */
    expect(source).not.toMatch(/groupMemberships[\s\S]{0,200}isPublic/);
    expect(source).not.toMatch(/playerArtistId[\s\S]{0,200}isPublic/);
  });
});

describe("5 · the scene learns about it", () => {
  it("puts entered_come_up in the existing public feed with no new surface", async () => {
    const user = await createTestUser(T, "Feed");
    const run = await liveGolden(T, user, "B");

    const publicFeed = await publicEventsFor(run.careerId);
    const entry = publicFeed.find((e) => e.eventType === "career.entered_come_up");

    expect(entry, "the world never learned about it").toBeDefined();
    expect(entry!.visibility).toBe("LOCAL_PUBLIC");
    /* It sits beside the other public facts rather than in a channel of its own. */
    expect(publicFeed.some((e) => e.eventType === "release.published")).toBe(true);
  }, 300_000);
});

describe("6 · first-reached is history, not state", () => {
  it("is null before, set once, and never moves afterwards", async () => {
    const user = await createTestUser(T, "History");
    const { careerId } = await liveGolden(T, user, "F", 3);

    const early = await loadProgressionObservation(T.ctx, careerId);
    expect(early.domainFirstReached.PEER ?? null).toBeNull();
    expect(early.domainFirstReached.PUBLIC_RECORD ?? null).toBeNull();

    /* Let F accumulate a great deal more reception. */
    for (let i = 0; i < 40; i += 1) {
      await advanceCareerDay(T.ctx, { careerId, userId: user.id, seed: "golden" });
    }

    const mid = await loadProgressionObservation(T.ctx, careerId);
    const receptionAt = mid.domainFirstReached.RECEPTION;
    expect(receptionAt, "RECEPTION should have been reached").toBeTruthy();

    const before = (await T.handle.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, careerId)))[0]!;

    for (let i = 0; i < 20; i += 1) {
      await advanceCareerDay(T.ctx, { careerId, userId: user.id, seed: "golden" });
    }

    const after = await loadProgressionObservation(T.ctx, careerId);
    const grown = (await T.handle.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, careerId)))[0]!;

    /* Magnitude kept climbing... */
    expect(grown.fanConversions).toBeGreaterThanOrEqual(before.fanConversions);
    /* ...and the day it first landed did not move. */
    expect(after.domainFirstReached.RECEPTION?.getTime()).toBe(receptionAt!.getTime());
    /* Domains never reached stay null rather than being invented. */
    expect(after.domainFirstReached.PEER ?? null).toBeNull();
    expect(after.domainFirstReached.PUBLIC_RECORD ?? null).toBeNull();
  }, 300_000);

  it("stores game time, never a wall clock", async () => {
    const user = await createTestUser(T, "GameTime");
    const run = await liveGolden(T, user, "B", 15);

    const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    const row = (await T.handle.db.select().from(careerProgressionObservations)
      .where(eq(careerProgressionObservations.careerId, run.careerId)))[0]!;

    /* The world's clock is years from the wall clock; that is the assertion. */
    expect(row.receptionFirstReachedGameTime!.getTime()).toBeLessThanOrEqual(career.currentGameDate.getTime());
    expect(Math.abs(row.receptionFirstReachedGameTime!.getTime() - Date.now())).toBeGreaterThan(24 * 60 * 60 * 1000);
    expect(row.lastEvaluatedGameTime!.getTime()).toBe(career.currentGameDate.getTime());
  }, 300_000);
});

describe("7 · descriptors explain, domains qualify", () => {
  it("gives no descriptor a vote and reads only three booleans", async () => {
    const user = await createTestUser(T, "Separation");
    const run = await liveGolden(T, user, "F", 30);
    const decision = await decisionOf(T, run.careerId);

    /* Several descriptors hold... */
    expect(decision.evidence.satisfied.length).toBeGreaterThan(1);
    /* ...and exactly one domain does. Descriptor count is not domain count. */
    expect(decision.evidence.satisfiedDomains).toEqual(["RECEPTION"]);
    expect(decision.evidence.qualifying).toBe(false);

    /* No descriptor carries a vote, weight or contribution field. */
    for (const check of decision.evidence.checks) {
      expect(Object.keys(check).sort()).toEqual(["descriptor", "observed", "passed", "reason"]);
    }

    /* Qualification is a function of the domain booleans and nothing else. */
    const passing = decision.evidence.domains.filter((d) => d.passed).map((d) => d.domain);
    expect(decision.evidence.satisfiedDomains).toEqual(passing);
    expect(decision.evidence.breadth).toBe(passing.length >= 2);

    /*
     * The five-vote architecture cannot quietly return. Asserted against the
     * modules' actual exports rather than their text: both files document the
     * removal in prose, and a substring search would fail on the sentence
     * explaining the very property being tested.
     */
    const shared = await import("@music-rpg/shared");
    const simulation = await import("@music-rpg/simulation");
    const exported = [...Object.keys(shared), ...Object.keys(simulation)];

    for (const gone of [
      "EVIDENCE_FAMILIES", "ANCHOR_FAMILIES", "COME_UP_REQUIRED_FAMILIES",
      "COME_UP_DURABILITY_DAYS", "advanceDurability",
    ]) {
      expect(exported, `${gone} came back`).not.toContain(gone);
    }
    /* And the vocabulary that replaced them is present. */
    expect(exported).toContain("RECOGNITION_DOMAINS");
    expect(exported).toContain("EVIDENCE_DESCRIPTORS");
    expect(shared.PHASE_BLOCKERS).not.toContain("NOT_DURABLE_YET");
  }, 300_000);
});

describe("8 · Golden F under stress", () => {
  it("refuses at any magnitude, for a named reason", async () => {
    const user = await createTestUser(T, "Stress F");
    const run = await liveGolden(T, user, "F", 90);

    const decision = await decisionOf(T, run.careerId);
    expect(decision.evidence.satisfiedDomains).toEqual(["RECEPTION"]);
    expect(decision.evidence.beyondReception).toBe(false);
    expect(decision.blockedBy).toBe("RECEPTION_ONLY");
    expect(decision.transitions).toBe(false);

    const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(career.careerAct).toBe("UNDERGROUND");

    /* It really is a large career: this is refusal, not weakness. */
    const performance = (await T.handle.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, run.careerId)))[0]!;
    expect(performance.fanConversions).toBeGreaterThan(500);
    expect(performance.uniqueListeners).toBeGreaterThan(2000);

    /* And nothing else ever happened to it. */
    expect(await domainsOf(T, run.careerId)).not.toContain("PEER");
    expect(await domainsOf(T, run.careerId)).not.toContain("PUBLIC_RECORD");
  }, 600_000);
});

describe("9 · Golden E is a different refusal", () => {
  it("distinguishes 'nothing landed' from 'landed, and nothing else changed'", async () => {
    const user = await createTestUser(T, "Stress E");
    const run = await liveGolden(T, user, "E", 40);

    const decision = await decisionOf(T, run.careerId);
    expect(decision.evidence.satisfiedDomains).toEqual([]);
    expect(decision.blockedBy).toBe("NOT_ENOUGH_DOMAINS");

    const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;
    expect(career.careerAct).toBe("UNDERGROUND");
  }, 300_000);
});

describe("10 · the inspector's data contract", () => {
  /**
   * The World Control panel is a server component and is not rendered here.
   * What is asserted is the **data it derives** — the whole chain it prints,
   * for the career whose explanation matters most.
   */
  it("gives F a complete, score-free explanation", async () => {
    const user = await createTestUser(T, "Inspector F");
    const run = await liveGolden(T, user, "F", 40);

    const decision = await decisionOf(T, run.careerId);
    const observation = await loadProgressionObservation(T.ctx, run.careerId);
    const career = (await T.handle.db.select().from(careers).where(eq(careers.id, run.careerId)))[0]!;

    /* facts -> descriptors */
    expect(decision.evidence.checks.length).toBeGreaterThan(0);
    for (const check of decision.evidence.checks) {
      expect(typeof check.reason).toBe("string");
      expect(check.observed).toBeTypeOf("object");
    }

    /* -> domains, exactly as the panel ticks them */
    const byDomain = Object.fromEntries(decision.evidence.domains.map((d) => [d.domain, d.passed]));
    expect(byDomain).toEqual({ RECEPTION: true, PEER: false, PUBLIC_RECORD: false });

    /* -> first reached */
    expect(observation.domainFirstReached.RECEPTION).toBeTruthy();
    expect(observation.domainFirstReached.PEER ?? null).toBeNull();
    expect(observation.domainFirstReached.PUBLIC_RECORD ?? null).toBeNull();

    /* -> qualification / blocker, with a renderable label */
    expect(decision.evidence.qualifying).toBe(false);
    expect(decision.blockedBy).toBe("RECEPTION_ONLY");
    expect(PHASE_BLOCKER_LABELS.RECEPTION_ONLY).toBe(
      "A record landed, and nothing beyond it has happened",
    );

    /* -> career act */
    expect(career.careerAct).toBe("UNDERGROUND");

    /* And nothing the panel could turn into a progress bar. */
    const renderable = JSON.stringify({ decision, observation });
    for (const forbidden of ["percent", "score", "confidence", "durab", "qualifyingsince"]) {
      expect(renderable.toLowerCase()).not.toContain(forbidden);
    }
  }, 300_000);
});
