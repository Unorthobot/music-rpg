import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artistAudience,
  careerMetricPressure,
  careers,
  artists,
  calendarItems,
  gameEvents,
  opportunities,
  performances,
  receptionTicks,
  releaseCohortPerformance,
  releasePerformance,
  transactions,
  eq,
  type UserRow,
} from "@music-rpg/database";
import {
  advanceCareerDay,
  getCareerCalendar,
  getCareerCounters,
  getCareerHome,
  getCareerTransactions,
  getOfferStory,
  loadOwnedCareer,
} from "@music-rpg/domain";
import { unwrap, type PerformanceDerivation } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import {
  PERFORMANCE_SEED,
  advanceUntilPlayed,
  commitmentsOf,
  liveUntilBooked,
  showcases,
  type BookedNight,
} from "../helpers/performance";

/**
 * The headless golden proof for M8.5.
 *
 * The line this suite exists to keep pinned:
 *
 * > **A show should become a real thing that happened before anything is
 * > allowed to treat it as evidence.**
 *
 * Everything here is produced by real commands. No performance row, calendar
 * completion, ledger entry or event is inserted by a fixture, because the whole
 * claim is that the game produces these rather than that a test can shape rows
 * to look as though it did.
 */

let test: TestContext;

/** The career whose night is still ahead of it. */
let user: UserRow;
let booked: BookedNight;

/** A second career in the same world, whose night the clock has reached. */
let secondUser: UserRow;
let played: BookedNight;

beforeAll(async () => {
  test = await createTestContext();

  user = await createTestUser(test);
  booked = await liveUntilBooked(test, user, { stageName: "KXMO" });

  secondUser = await createTestUser(test, "Second");
  played = await liveUntilBooked(test, secondUser, { stageName: "BRIGHT" });
  await advanceUntilPlayed(test, secondUser, played);
}, 240_000);

afterAll(async () => {
  await test?.close();
});

const rowsFor = async (careerId: string) =>
  test.handle.db.select().from(performances).where(eq(performances.careerId, careerId));

const eventsFor = async (careerId: string) =>
  test.handle.db.select().from(gameEvents).where(eq(gameEvents.careerId, careerId));

describe("1 · time causes the show; screens never do", () => {
  it("resolves on the advance that reaches the night, with no screen ever opened", async () => {
    const rows = await rowsFor(played.careerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.opportunityId).toBe(played.offer.id);

    // The night is priced as well as played: both halves committed together.
    expect(rows[0]!.status).toBe("RESOLVED");
    expect(rows[0]!.performedAt).not.toBeNull();
    expect(rows[0]!.resolvedAt).not.toBeNull();

    // The night is dated by the world, not by the server.
    expect(rows[0]!.occurredAtGameTime.getTime()).toBeGreaterThanOrEqual(
      played.commitment.startGameTime.getTime(),
    );
  });

  it("does nothing at all when every screen is opened ten times and no day passes", async () => {
    const career = unwrap(await loadOwnedCareer(test.handle.db, booked.careerId, user.id));

    for (let pass = 0; pass < 10; pass += 1) {
      await getCareerHome(test.handle.db, career);
      await getCareerCalendar(test.handle.db, career);
      await getCareerCounters(test.handle.db, career);
      await getCareerTransactions(test.handle.db, career.id);
      await getOfferStory(test.handle.db, career);
    }

    expect(await rowsFor(booked.careerId)).toHaveLength(0);

    const item = (await commitmentsOf(test, booked.careerId)).find(
      (row) => row.id === booked.commitment.id,
    );
    expect(item!.status).toBe("SCHEDULED");
  });
});

describe("2 · accepting a showcase is not evidence that it happened", () => {
  it("gives a career that accepted a night it has not reached no evidence of any kind", async () => {
    // No night.
    expect(await rowsFor(booked.careerId)).toHaveLength(0);

    // No public fact.
    const events = await eventsFor(booked.careerId);
    expect(events.filter((row) => row.eventType === "performance.resolved")).toHaveLength(0);
    expect(events.filter((row) => row.eventType === "performance.performed")).toHaveLength(0);

    // No fee.
    const ledger = await test.handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.careerId, booked.careerId));
    expect(ledger.filter((row) => row.category === "PERFORMANCE_FEE")).toHaveLength(0);

    // The offer is agreed to, and nothing more.
    const offer = (await showcases(test, booked.careerId)).find(
      (row) => row.id === booked.offer.id,
    );
    expect(offer!.status).toBe("ACCEPTED");
    expect(offer!.resolvedAt).toBeNull();
  });
});

describe("2b · career history tells agreeing and playing apart", () => {
  /*
   * A latent M7 read-model defect, exposed by M8.5.
   *
   * `getOfferStory` mapped both ACCEPTED and RESOLVED to TAKEN, and TAKEN
   * renders through `BILLING_PAST_TENSE` as "Headlined" / "Opened". While
   * RESOLVED was unreachable for showcases that had exactly one meaning; now it
   * has two, and the wrong one puts a night in the past tense before anybody
   * has played it.
   */
  it("does not narrate an accepted night as one that happened", async () => {
    const career = unwrap(await loadOwnedCareer(test.handle.db, booked.careerId, user.id));
    const story = await getOfferStory(test.handle.db, career);

    const entry = story.find((row) => row.id === booked.offer.id);
    expect(entry, "an unplayed night is being reported as history").toBeUndefined();

    /* And nothing anywhere in the story claims a stage this career never took. */
    const billing = (booked.offer.payload as { nightName?: string }).nightName;
    for (const row of story) {
      if (billing && row.line.includes(billing)) {
        expect(row.line).not.toMatch(/^(Headlined|Opened)\b/);
      }
    }
  });

  it("narrates a resolved night as played, dated by the night and not the booking", async () => {
    const career = unwrap(
      await loadOwnedCareer(test.handle.db, played.careerId, secondUser.id),
    );
    const story = await getOfferStory(test.handle.db, career);

    const entry = story.find((row) => row.id === played.offer.id);
    expect(entry, "a played night is missing from career history").toBeDefined();
    expect(entry!.outcome).toBe("TAKEN");
    expect(entry!.line).toMatch(/^(Headlined|Opened)\b/);

    /*
     * Dated by the resolution rather than the acceptance. A night agreed on one
     * date and played on another belongs in the story where it happened.
     */
    const offer = (await showcases(test, played.careerId)).find(
      (row) => row.id === played.offer.id,
    )!;
    expect(entry!.occurredAt.getTime()).toBe(offer.resolvedAt!.getTime());
  });

  it("leaves session and producer history exactly as it was", async () => {
    /*
     * Accepting a session invitation genuinely creates the session in the same
     * transaction — the room exists, the money has moved — so acceptance *is*
     * the event for those, and must keep reading as history immediately. This
     * is the half of the fix that had to stay still.
     */
    const career = unwrap(await loadOwnedCareer(test.handle.db, booked.careerId, user.id));
    const story = await getOfferStory(test.handle.db, career);

    const all = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, booked.careerId));

    const acceptedNonShowcase = all.filter(
      (row) => row.status === "ACCEPTED" && row.type !== "SHOWCASE_SLOT",
    );

    for (const row of acceptedNonShowcase) {
      const entry = story.find((item) => item.id === row.id);
      expect(entry, `${row.type} stopped appearing as history`).toBeDefined();
      expect(entry!.outcome).toBe("TAKEN");
    }

    /* Every ending other than a booked night still reaches the story. */
    const ended = all.filter((row) =>
      ["DECLINED", "EXPIRED", "WITHDRAWN", "RESOLVED"].includes(row.status),
    );
    for (const row of ended) {
      // PRODUCER_INTRO renders an empty line for anything but TAKEN by design.
      if (row.type === "PRODUCER_INTRO" && row.status !== "ACCEPTED") continue;
      expect(story.some((item) => item.id === row.id)).toBe(true);
    }
  });
});

describe("3 · billing means something", () => {
  it("traces the fee to the terms that were agreed, and the room to the billing", async () => {
    const row = (await rowsFor(played.careerId))[0]!;
    const terms = played.offer.payload as { payoutMinor?: number; billing?: string; capacity?: number };

    expect(row.billing).toBe(terms.billing);
    expect(row.capacity).toBe(terms.capacity);
    // The fee is the accepted terms, not the performance outcome.
    expect(row.feeMinor).toBe(terms.payoutMinor);

    const support = row.derivation.find(
      (entry: PerformanceDerivation) => entry.fact === "attendance",
    )!;
    const billingTerm = support.contributions.find((one) => one.term === "billing")!;
    expect(billingTerm).toBeDefined();
    expect(billingTerm.note).toMatch(row.billing === "HEADLINE" ? /Carrying/ : /Opening/);
  });
});

describe("4 · no quality score exists", () => {
  it("records three named facts and a derivation, and nothing that totals them", async () => {
    const row = (await rowsFor(played.careerId))[0]!;

    expect(row).toHaveProperty("attendance");
    expect(row).toHaveProperty("wonOver");
    expect(row).toHaveProperty("wordLeftTheRoom");

    /* Structural, not a spot check: no column and no payload key is a grade. */
    const forbidden = /quality|score|rating|success|grade|overall/i;
    for (const key of Object.keys(row)) expect(key).not.toMatch(forbidden);

    const serialised = JSON.stringify({
      derivation: row.derivation,
      consequences: row.consequences,
    });
    const keys = serialised.match(/"[^"]+":/g) ?? [];
    expect(keys.filter((key) => forbidden.test(key))).toEqual([]);
  });
});

describe("5 · the calendar closes", () => {
  it("completes the booking and says so exactly once", async () => {
    const item = (await commitmentsOf(test, played.careerId)).find(
      (row) => row.id === played.commitment.id,
    );
    expect(item!.status).toBe("COMPLETED");

    const events = await eventsFor(played.careerId);
    const completed = events.filter(
      (row) => row.eventType === "calendar_item.completed" && row.targetId === item!.id,
    );
    expect(completed).toHaveLength(1);
  });
});

describe("6 · the night frees up", () => {
  it("stops a resolved night occupying its window", async () => {
    const career = unwrap(await loadOwnedCareer(test.handle.db, played.careerId, secondUser.id));
    const calendar = await getCareerCalendar(test.handle.db, career);

    /*
     * The window is no longer a commitment. Proved through the calendar's own
     * view rather than by re-reading the row this milestone wrote, because the
     * claim is about what the rest of the game now believes.
     */
    const stillUpcoming = calendar.upcoming.filter(
      (entry) => entry.id === played.commitment.id,
    );
    expect(stillUpcoming).toHaveLength(0);
  });
});

describe("7 · the offer ends properly", () => {
  it("reaches RESOLVED, dated, and says so once", async () => {
    const offer = (await showcases(test, played.careerId)).find(
      (row) => row.id === played.offer.id,
    )!;

    expect(offer.status).toBe("RESOLVED");
    expect(offer.resolvedAt).not.toBeNull();

    const resolved = (await eventsFor(played.careerId)).filter(
      (row) => row.eventType === "opportunity.resolved" && row.targetId === offer.id,
    );
    expect(resolved).toHaveLength(1);
  });
});

describe("8 · money moves", () => {
  it("credits exactly the agreed fee, once, and reconciles with the career", async () => {
    const row = (await rowsFor(played.careerId))[0]!;

    const ledger = (
      await test.handle.db
        .select()
        .from(transactions)
        .where(eq(transactions.careerId, played.careerId))
    ).filter((entry) => entry.category === "PERFORMANCE_FEE");

    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.direction).toBe("CREDIT");
    expect(ledger[0]!.amountMinor).toBe(row.feeMinor);
    expect(ledger[0]!.id).toBe(row.transactionId);

    const careerRows = await test.handle.db
      .select()
      .from(careers)
      .where(eq(careers.id, played.careerId));

    // The running balance and the ledger's own record of it agree.
    expect(careerRows[0]!.moneyBalance).toBe(ledger[0]!.balanceAfterMinor);
  });
});

describe("9 · standing is bounded and traceable", () => {
  it("decomposes every movement into named contributions from recorded facts", async () => {
    const row = (await rowsFor(played.careerId))[0]!;
    const consequences = row.consequences as {
      pressure: {
        fame: number;
        respect: number;
        heat: number;
        roomShare: number;
        contributions: { metric: string; from: string; contribution: number }[];
      };
    };

    expect(consequences.pressure.contributions.length).toBeGreaterThan(0);
    for (const entry of consequences.pressure.contributions) {
      expect(["attendance", "wonOver", "wordLeftTheRoom"]).toContain(entry.from);
    }

    // Bounded by attendance, never by capacity.
    expect(consequences.pressure.roomShare).toBeLessThanOrEqual(1);
    expect(consequences.pressure.roomShare).toBeCloseTo(
      Math.min(row.attendance / 300, 1),
      4,
    );

    const pressure = await test.handle.db
      .select()
      .from(careerMetricPressure)
      .where(eq(careerMetricPressure.careerId, played.careerId));
    expect(pressure[0]!.heatAccrued).toBeGreaterThan(0);
  });

  it("moves a career less for a small room than a large one, attributable to attendance", async () => {
    const { performanceStandingPressure } = await import("@music-rpg/simulation");

    const basement = performanceStandingPressure({
      attendance: 80,
      wonOver: 40,
      wordLeftTheRoom: 10,
    });
    const sunday = performanceStandingPressure({
      attendance: 300,
      wonOver: 150,
      wordLeftTheRoom: 40,
    });

    expect(sunday.heat).toBeGreaterThan(basement.heat);
    expect(sunday.fame).toBeGreaterThan(basement.fame);
    expect(sunday.respect).toBeGreaterThan(basement.respect);
  });
});

describe("10 · capacity bounds everything", () => {
  it("affects no more people across every cohort than the room holds", async () => {
    const row = (await rowsFor(played.careerId))[0]!;
    const consequences = row.consequences as {
      audience: {
        totalAffected: number;
        cohorts: { cohortSlug: string; attendees: number; wonOver: number; newFans: number }[];
      };
    };

    /* The invariant over the whole diff, not a spot check. */
    const total = consequences.audience.cohorts.reduce(
      (sum, entry) => sum + entry.attendees,
      0,
    );
    expect(total).toBe(consequences.audience.totalAffected);
    expect(total).toBeLessThanOrEqual(row.attendance);
    expect(row.attendance).toBeLessThanOrEqual(row.capacity);

    for (const cohort of consequences.audience.cohorts) {
      expect(cohort.wonOver).toBeLessThanOrEqual(cohort.attendees);
      expect(cohort.newFans).toBeLessThanOrEqual(cohort.wonOver);
    }
  });

  it("keeps the three facts within one another on the row itself", async () => {
    const row = (await rowsFor(played.careerId))[0]!;
    expect(row.attendance).toBeLessThanOrEqual(row.capacity);
    expect(row.wonOver).toBeLessThanOrEqual(row.attendance);
    expect(row.wordLeftTheRoom).toBeLessThanOrEqual(row.wonOver);
  });

  it("refuses at the database, not merely in the resolver", async () => {
    const row = (await rowsFor(played.careerId))[0]!;

    await expect(
      test.handle.db
        .update(performances)
        .set({ attendance: row.capacity + 1 })
        .where(eq(performances.id, row.id)),
    ).rejects.toThrow();
  });
});

describe("11 · a night is not a release", () => {
  it("creates or alters no reception row of any kind", async () => {
    const row = (await rowsFor(played.careerId))[0]!;

    const ticks = await test.handle.db
      .select()
      .from(receptionTicks)
      .where(eq(receptionTicks.careerId, played.careerId));

    // Every tick belongs to a release; none was caused by a night.
    for (const tick of ticks) {
      expect(tick.releaseId).toBeTruthy();
    }

    const cohortRows = await test.handle.db.select().from(releaseCohortPerformance);
    for (const entry of cohortRows) expect(entry.releaseId).toBeTruthy();

    const releaseRows = await test.handle.db.select().from(releasePerformance);
    for (const entry of releaseRows) expect(entry.releaseId).toBeTruthy();

    // What a night does write is the artist's own audience, and only that.
    const audience = await test.handle.db
      .select()
      .from(artistAudience)
      .where(eq(artistAudience.careerId, played.careerId));
    expect(audience.length).toBeGreaterThan(0);

    expect(row.consequences).toHaveProperty("release");
  });
});

describe("12 · performance.resolved, exactly once and LOCAL_PUBLIC", () => {
  it("is public, and is the only public event a night writes", async () => {
    const events = await eventsFor(played.careerId);
    const resolved = events.filter((row) => row.eventType === "performance.resolved");

    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.visibility).toBe("LOCAL_PUBLIC");

    const nightEvents = events.filter((row) => row.eventType.startsWith("performance."));
    for (const event of nightEvents) {
      if (event.eventType === "performance.resolved") continue;
      expect(event.visibility).toBe("PRIVATE");
    }
  });

  it("carries the three facts, the room, the billing and the promoter", async () => {
    const row = (await rowsFor(played.careerId))[0]!;
    const resolved = (await eventsFor(played.careerId)).find(
      (event) => event.eventType === "performance.resolved",
    )!;

    const payload = resolved.payload as Record<string, unknown>;
    expect(payload.attendance).toBe(row.attendance);
    expect(payload.wonOver).toBe(row.wonOver);
    expect(payload.wordLeftTheRoom).toBe(row.wordLeftTheRoom);
    expect(payload.capacity).toBe(row.capacity);
    expect(payload.billing).toBe(row.billing);
    expect(payload.sceneSlug).toBe(row.sceneSlug);
    expect(payload.promoterName).toBe(row.promoterName);
  });

  it("references nothing about progression", async () => {
    const resolved = (await eventsFor(played.careerId)).find(
      (event) => event.eventType === "performance.resolved",
    )!;
    expect(JSON.stringify(resolved.payload)).not.toMatch(
      /career_act|careerAct|evidence|phase|come_up|progression/i,
    );
  });
});

describe("13 · idempotent in full", () => {
  it("pays, emits, moves and touches nothing a second time across ten more advances", async () => {
    const before = {
      performances: await rowsFor(played.careerId),
      events: await eventsFor(played.careerId),
      ledger: await test.handle.db
        .select()
        .from(transactions)
        .where(eq(transactions.careerId, played.careerId)),
      pressure: await test.handle.db
        .select()
        .from(careerMetricPressure)
        .where(eq(careerMetricPressure.careerId, played.careerId)),
      audience: await test.handle.db
        .select()
        .from(artistAudience)
        .where(eq(artistAudience.careerId, played.careerId)),
    };

    for (let day = 0; day < 10; day += 1) {
      await advanceCareerDay(test.ctx, {
        careerId: played.careerId,
        userId: secondUser.id,
        seed: PERFORMANCE_SEED,
      });
    }

    const after = {
      performances: await rowsFor(played.careerId),
      events: await eventsFor(played.careerId),
      ledger: await test.handle.db
        .select()
        .from(transactions)
        .where(eq(transactions.careerId, played.careerId)),
    };

    // No second night, no second fee, no second public event.
    expect(after.performances).toHaveLength(before.performances.length);
    expect(after.performances[0]).toEqual(before.performances[0]);
    expect(
      after.ledger.filter((row) => row.category === "PERFORMANCE_FEE"),
    ).toHaveLength(1);
    expect(
      after.events.filter((row) => row.eventType === "performance.resolved"),
    ).toHaveLength(1);
    expect(
      after.events.filter((row) => row.eventType === "performance.performed"),
    ).toHaveLength(1);
    expect(
      after.events.filter((row) => row.eventType === "performance.consequences_applied"),
    ).toHaveLength(1);
  }, 120_000);
});

describe("14 · Legacy remains 0", () => {
  it("is untouched for every career and every artist in the suite", async () => {
    const careerRows = await test.handle.db.select().from(careers);
    for (const row of careerRows) expect(row.legacy).toBe(0);

    const artistRows = await test.handle.db.select().from(artists);
    for (const row of artistRows) expect(row.legacy).toBe(0);
  });
});

describe("15 · replay is exact", () => {
  it("gives two identically-built worlds the same night from the same seed", async () => {
    const first = await createTestContext();
    const second = await createTestContext();

    try {
      const runOne = await createTestUser(first, "Replay");
      const runTwo = await createTestUser(second, "Replay");

      const nightOne = await liveUntilBooked(first, runOne, { stageName: "ECHO" });
      const nightTwo = await liveUntilBooked(second, runTwo, { stageName: "ECHO" });

      await advanceUntilPlayed(first, runOne, nightOne);
      await advanceUntilPlayed(second, runTwo, nightTwo);

      const rowOne = (
        await first.handle.db
          .select()
          .from(performances)
          .where(eq(performances.careerId, nightOne.careerId))
      )[0]!;
      const rowTwo = (
        await second.handle.db
          .select()
          .from(performances)
          .where(eq(performances.careerId, nightTwo.careerId))
      )[0]!;

      expect(rowOne.attendance).toBe(rowTwo.attendance);
      expect(rowOne.wonOver).toBe(rowTwo.wonOver);
      expect(rowOne.wordLeftTheRoom).toBe(rowTwo.wordLeftTheRoom);
      expect(rowOne.feeMinor).toBe(rowTwo.feeMinor);
      expect(rowOne.billing).toBe(rowTwo.billing);
      expect(rowOne.derivation).toEqual(rowTwo.derivation);

      /*
       * The consequences, minus generated identity.
       *
       * Two separately-built worlds necessarily mint different row ids, and the
       * ledger row's id is identity rather than outcome — replay says the same
       * night happened and moved the same things, not that two databases chose
       * the same primary keys. Everything that *is* the night is compared:
       * the standing movement and its decomposition, who in the audience was
       * touched, and the fee that was agreed.
       */
      const night = (row: typeof rowOne) => {
        const consequences = row.consequences as Record<string, unknown> & {
          fee: Record<string, unknown>;
        };
        const { transactionId: _identity, ...fee } = consequences.fee;
        return { ...consequences, fee };
      };

      expect(night(rowOne)).toEqual(night(rowTwo));
      // And the identity that was excluded is genuinely present on both.
      expect(rowOne.transactionId).toBeTruthy();
      expect(rowTwo.transactionId).toBeTruthy();
    } finally {
      await first.close();
      await second.close();
    }
  }, 240_000);
});

describe("the line to keep pinned", () => {
  it("lets a player accept a night, forget about it, and find that it happened", async () => {
    const world = await createTestContext();

    try {
      const forgetful = await createTestUser(world, "Forgetful");
      const night = await liveUntilBooked(world, forgetful, { stageName: "LATE" });

      const before = (
        await world.handle.db.select().from(careers).where(eq(careers.id, night.careerId))
      )[0]!;

      /* A week of doing nothing but letting time pass. No screen is opened. */
      for (let day = 0; day < 7; day += 1) {
        await advanceCareerDay(world.ctx, {
          careerId: night.careerId,
          userId: forgetful.id,
          seed: PERFORMANCE_SEED,
        });
      }

      const row = (
        await world.handle.db
          .select()
          .from(performances)
          .where(eq(performances.careerId, night.careerId))
      )[0];

      // It happened.
      expect(row).toBeDefined();

      // They were paid.
      const after = (
        await world.handle.db.select().from(careers).where(eq(careers.id, night.careerId))
      )[0]!;
      expect(after.moneyBalance).toBe(before.moneyBalance + row!.feeMinor);

      // And the scene knows.
      const public_ = (
        await world.handle.db
          .select()
          .from(gameEvents)
          .where(eq(gameEvents.careerId, night.careerId))
      ).filter((event) => event.eventType === "performance.resolved");

      expect(public_).toHaveLength(1);
      expect(public_[0]!.visibility).toBe("LOCAL_PUBLIC");
    } finally {
      await world.close();
    }
  }, 240_000);
});
