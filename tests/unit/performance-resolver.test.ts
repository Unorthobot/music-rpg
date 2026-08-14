import { describe, expect, it } from "vitest";
import {
  PERFORMANCE_FACTS,
  type CohortStandingFacts,
  type ShowcaseBilling,
} from "@music-rpg/shared";
import {
  distributeRoom,
  performanceStandingPressure,
  resolvePerformance,
  type ResolvePerformanceInput,
} from "@music-rpg/simulation";

/**
 * The pure half of a night, tested before a world exists around it.
 *
 * Everything here is hand-built input and arithmetic. No database, no clock, no
 * career — which is the point: if the three facts cannot be explained from
 * named numbers on a table, they cannot be explained at all.
 */

const room: ResolvePerformanceInput = {
  capacity: 200,
  billing: "HEADLINE",
  sceneStanding: 40,
  momentum: 0.5,
  performanceSkill: 60,
  seed: "night:test:v1",
};

const night = (over: Partial<ResolvePerformanceInput> = {}) =>
  resolvePerformance({ ...room, ...over });

describe("what happened in the room", () => {
  it("records three named facts and nothing that totals them", () => {
    const result = night();

    expect(Object.keys(result.facts).sort()).toEqual([...PERFORMANCE_FACTS].sort());

    /*
     * The structural assertion, not a spot check. No key anywhere in the result
     * or its derivation may be a score, a grade or a total — the one thing this
     * milestone must not be able to produce.
     */
    const forbidden = /quality|score|rating|success|grade|total|overall/i;
    const everyKey = JSON.stringify(result).match(/"[^"]+":/g) ?? [];
    expect(everyKey.filter((key) => forbidden.test(key))).toEqual([]);
  });

  it("bounds attendance by the room, won over by attendance, word by won over", () => {
    for (const capacity of [1, 40, 80, 200, 300, 1200]) {
      for (const skill of [0, 35, 70, 100]) {
        for (const standing of [0, 25, 60, 100]) {
          const result = night({ capacity, performanceSkill: skill, sceneStanding: standing });

          expect(result.facts.attendance).toBeLessThanOrEqual(capacity);
          expect(result.facts.wonOver).toBeLessThanOrEqual(result.facts.attendance);
          expect(result.facts.wordLeftTheRoom).toBeLessThanOrEqual(result.facts.wonOver);
          expect(result.facts.attendance).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("replays exactly — the same seed gives the same night forever", () => {
    expect(night()).toEqual(night());
    expect(night({ seed: "other" })).not.toEqual(night());
  });

  it("gives SUPPORT and HEADLINE materially different nights in the same room", () => {
    const headline = night({ billing: "HEADLINE" });
    const support = night({ billing: "SUPPORT" });

    // Most of a support room came for somebody else.
    expect(support.facts.attendance).toBeLessThan(headline.facts.attendance);
    expect(support.facts).not.toEqual(headline.facts);
  });

  it("carries every fact's bound and says whether it actually bit", () => {
    /*
     * A career the scene fully knows, with a record still moving, carrying a
     * room that holds ten. The fill terms sum to exactly 1 at their maximum, so
     * this is the case where the room itself is the binding constraint.
     */
    const packed = night({
      capacity: 10,
      sceneStanding: 100,
      momentum: 1,
      performanceSkill: 100,
    });
    const attendance = packed.derivation.find((entry) => entry.fact === "attendance")!;

    expect(attendance.bound).toBe(10);
    expect(attendance.boundLabel).toBe("the room's capacity");
    expect(attendance.bounded).toBe(true);
    expect(attendance.value).toBe(10);

    const roomy = night({ capacity: 5000, sceneStanding: 5, momentum: 0 });
    const unbounded = roomy.derivation.find((entry) => entry.fact === "attendance")!;
    expect(unbounded.bounded).toBe(false);
    expect(unbounded.value).toBeLessThan(5000);
  });

  it("names every input it used, and only inputs that already existed", () => {
    const result = night();
    const terms = new Set(
      result.derivation.flatMap((entry) => entry.contributions.map((one) => one.term)),
    );

    expect(terms).toContain("room");
    expect(terms).toContain("sceneStanding");
    expect(terms).toContain("performanceSkill");
    expect(terms).toContain("billing");
    expect(terms).toContain("nerves");
  });

  it("lets stagecraft decide who cared, and standing decide who came", () => {
    const unknownButGood = night({ sceneStanding: 5, performanceSkill: 95 });
    const knownButPoor = night({ sceneStanding: 95, performanceSkill: 5 });

    // A name fills a room; a performance wins it.
    expect(knownButPoor.facts.attendance).toBeGreaterThan(unknownButGood.facts.attendance);

    const shareWon = (result: ReturnType<typeof night>) =>
      result.facts.attendance > 0 ? result.facts.wonOver / result.facts.attendance : 0;

    expect(shareWon(unknownButGood)).toBeGreaterThan(shareWon(knownButPoor));
  });

  it("lets a decayed record and a moving one differ", () => {
    expect(night({ momentum: 0 }).facts.attendance).toBeLessThan(
      night({ momentum: 1 }).facts.attendance,
    );
  });
});

describe("what the night moved", () => {
  const facts = (attendance: number, wonOver: number, word: number) => ({
    attendance,
    wonOver,
    wordLeftTheRoom: word,
  });

  it("is bounded by attendance and never by capacity", () => {
    /*
     * The same billing, the same career, two rooms. A half-empty 300 and a full
     * 80 are compared on who was actually there — the promoter's optimism about
     * their own venue is not a fact about the artist.
     */
    const basement = performanceStandingPressure(facts(80, 40, 10));
    const soweto = performanceStandingPressure(facts(300, 150, 40));

    expect(soweto.heat).toBeGreaterThan(basement.heat);
    expect(soweto.fame).toBeGreaterThan(basement.fame);
    expect(soweto.respect).toBeGreaterThan(basement.respect);

    // A big room that nobody came to moves a career like the small night it was.
    const halfEmpty = performanceStandingPressure(facts(80, 40, 10));
    expect(halfEmpty).toEqual(basement);
  });

  it("moves Heat most and Fame least — one night is not a broadcast", () => {
    const moved = performanceStandingPressure(facts(300, 200, 60));
    expect(moved.heat).toBeGreaterThan(moved.respect);
    expect(moved.respect).toBeGreaterThan(moved.fame);
  });

  it("decomposes every movement into named contributions from recorded facts", () => {
    const moved = performanceStandingPressure(facts(150, 90, 30));

    expect(moved.contributions.length).toBeGreaterThan(0);
    for (const entry of moved.contributions) {
      expect(["attendance", "wonOver", "wordLeftTheRoom"]).toContain(entry.from);
      expect(entry.note).toBeTruthy();
    }

    // Nothing moves without a decomposition that sums to it.
    const heat = moved.contributions
      .filter((entry) => entry.metric === "heat")
      .reduce((running, entry) => running + entry.contribution, 0);
    expect(moved.heat).toBeCloseTo(heat, 4);
  });

  it("never produces Legacy, and has no term that could", () => {
    const moved = performanceStandingPressure(facts(300, 300, 300));
    expect(Object.keys(moved)).not.toContain("legacy");
    expect(JSON.stringify(moved)).not.toMatch(/legacy/i);
  });
});

describe("who was in the room", () => {
  const cohorts: CohortStandingFacts[] = [
    {
      slug: "scene-heads",
      name: "Scene heads",
      size: 4000,
      fans: 0,
      affinity: 0,
      priorExposure: 0,
      sceneAffinity: { braamfontein: 0.6, soweto: 0.1 },
    },
    {
      slug: "casual-listeners",
      name: "Casual listeners",
      size: 94000,
      fans: 0,
      affinity: 0,
      priorExposure: 0,
      sceneAffinity: { braamfontein: 0.2, soweto: 0.5 },
    },
    {
      slug: "tastemakers",
      name: "Tastemakers",
      size: 800,
      fans: 0,
      affinity: 0,
      priorExposure: 0,
      sceneAffinity: { braamfontein: 0.3 },
    },
    {
      slug: "elsewhere",
      name: "People who live somewhere else",
      size: 50000,
      fans: 0,
      affinity: 0,
      priorExposure: 0,
      sceneAffinity: { durban: 0.9 },
    },
  ];

  it("never affects more people than were in the room, at any size", () => {
    for (const attendance of [0, 1, 7, 80, 199, 200, 301, 1200]) {
      const distribution = distributeRoom({
        facts: { attendance, wonOver: Math.floor(attendance / 2), wordLeftTheRoom: 0 },
        sceneSlug: "braamfontein",
        cohorts,
      });

      // The invariant, over the whole diff rather than as a spot check.
      expect(distribution.totalAffected).toBeLessThanOrEqual(attendance);
      expect(
        distribution.shares.reduce((sum, share) => sum + share.attendees, 0),
      ).toBe(distribution.totalAffected);
    }
  });

  it("only fills from cohorts who are actually in that scene", () => {
    const distribution = distributeRoom({
      facts: { attendance: 200, wonOver: 100, wordLeftTheRoom: 20 },
      sceneSlug: "braamfontein",
      cohorts,
    });

    expect(distribution.shares.map((share) => share.cohortSlug)).not.toContain("elsewhere");
    // Scene heads are concentrated in Braam, so they are most of that room.
    const heads = distribution.shares.find((s) => s.cohortSlug === "scene-heads")!;
    const casual = distribution.shares.find((s) => s.cohortSlug === "casual-listeners")!;
    expect(heads.attendees).toBeGreaterThan(casual.attendees);
  });

  it("fills a Soweto room from different people than a Braamfontein one", () => {
    const facts = { attendance: 200, wonOver: 100, wordLeftTheRoom: 20 };
    const braam = distributeRoom({ facts, sceneSlug: "braamfontein", cohorts });
    const soweto = distributeRoom({ facts, sceneSlug: "soweto", cohorts });

    const headsIn = (d: typeof braam) =>
      d.shares.find((s) => s.cohortSlug === "scene-heads")?.attendees ?? 0;

    expect(headsIn(braam)).toBeGreaterThan(headsIn(soweto));
  });

  it("keeps won over within attendees and fans within won over, cohort by cohort", () => {
    const distribution = distributeRoom({
      facts: { attendance: 180, wonOver: 180, wordLeftTheRoom: 90 },
      sceneSlug: "braamfontein",
      cohorts,
    });

    for (const share of distribution.shares) {
      expect(share.wonOver).toBeLessThanOrEqual(share.attendees);
      expect(share.newFans).toBeLessThanOrEqual(share.wonOver);
      expect(share.attendees).toBeLessThanOrEqual(share.cohortSize);
    }
  });

  it("cannot make a thousand fans out of a room that holds two hundred", () => {
    const distribution = distributeRoom({
      facts: { attendance: 200, wonOver: 200, wordLeftTheRoom: 200 },
      sceneSlug: "braamfontein",
      cohorts,
    });

    const fans = distribution.shares.reduce((sum, share) => sum + share.newFans, 0);
    expect(fans).toBeLessThanOrEqual(200);
    expect(fans).toBeLessThan(50);
  });

  it("distributes the same room the same way every time", () => {
    const facts = { attendance: 137, wonOver: 61, wordLeftTheRoom: 14 };
    const once = distributeRoom({ facts, sceneSlug: "braamfontein", cohorts });
    const twice = distributeRoom({ facts, sceneSlug: "braamfontein", cohorts });
    expect(once).toEqual(twice);
  });
});
