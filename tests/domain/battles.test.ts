import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  artistAudience,
  artists,
  audienceCohorts,
  battleJudgements,
  battlePerformances,
  battleScoutingReports,
  battles,
  calendarItems,
  careers,
  characters,
  eq,
  gameEvents,
  opportunities,
  relationships,
  transactions,
  type BattleRow,
  type UserRow,
} from "@music-rpg/database";
import { sceneStanding } from "@music-rpg/simulation";
import { GameEventType } from "@music-rpg/events";
import {
  advanceCareerDay,
  declareBattleStrategy,
  declineBattleChallenge,
  prepareForBattle,
  resolveBattle,
  scoutBattleOpponent,
  syncCareerRelationships,
} from "@music-rpg/domain";
import { unwrap, type BattleStrategy, type JudgeDecision } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { acceptInto, liveUntilChallenged } from "../helpers/battle";

/**
 * The golden proof.
 *
 * > Two artists enter the same competitive event, make meaningful strategic
 * > choices, perform in ways represented as canonical facts, are judged
 * > differently by legitimate independent perspectives, and produce an
 * > explainable result.
 *
 * The M5/M6/M7 shape and the same two halves. Determinism proves nothing on its
 * own — a simulator that ignored its inputs would be perfectly deterministic and
 * completely useless — so what is asserted is **divergence for explainable
 * reasons**, and every difference is traced to a decision the player made rather
 * than to a seed.
 *
 * Every career here is built through real commands: onboarding, a producer, a
 * session with real decisions in it, a master, a release, and then days of the
 * world reacting until a rival decides they are worth calling out. Nothing is
 * inserted behind a domain boundary, because the claim being made is that the
 * game produces these situations rather than that a fixture can be shaped to
 * look like one.
 */

/** One seed for every battle below, so a comparison is of decisions, not dice. */
const SEED = "m8-golden-battle";

type Fought = {
  careerId: string;
  battle: BattleRow;
  judgements: JudgeDecision[];
  performances: Awaited<ReturnType<typeof readPerformances>>;
  standing: { fame: number; respect: number; heat: number; legacy: number };
};

async function readPerformances(test: TestContext, battleId: string) {
  return test.handle.db
    .select()
    .from(battlePerformances)
    .where(eq(battlePerformances.battleId, battleId));
}

async function standingOf(test: TestContext, careerId: string) {
  const rows = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
  const row = rows[0]!;
  return { fame: row.fame, respect: row.respect, heat: row.heat, legacy: row.legacy };
}

/**
 * A whole battle, from being called out to the consequences landing.
 *
 * The chain the milestone exists to establish, walked end to end through the
 * real commands, with only the declared angle and the preparation varying.
 */
async function fight(
  test: TestContext,
  user: Pick<UserRow, "id">,
  options: { strategy: BattleStrategy; prepare?: number; stageName?: string },
): Promise<Fought> {
  const { careerId, challenge } = await liveUntilChallenged(test, user, {
    ...(options.stageName ? { stageName: options.stageName } : {}),
  });

  const accepted = await acceptInto(test, user, careerId, challenge);

  unwrap(
    await declareBattleStrategy(test.ctx, {
      careerId,
      userId: user.id,
      battleId: accepted.id,
      strategy: options.strategy,
    }),
  );

  if (options.prepare) {
    unwrap(
      await prepareForBattle(test.ctx, {
        careerId,
        userId: user.id,
        battleId: accepted.id,
        sessions: options.prepare,
      }),
    );
  }

  /* The night has to come round. A battle cannot be fought before its date. */
  const night = accepted.scheduledGameTime!;
  for (let guard = 0; guard < 30; guard += 1) {
    const rows = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    if (rows[0]!.currentGameDate >= night) break;
    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: SEED }));
  }

  const resolved = unwrap(
    await resolveBattle(test.ctx, {
      careerId,
      userId: user.id,
      battleId: accepted.id,
      seed: SEED,
    }),
  );

  const rows = await test.handle.db.select().from(battles).where(eq(battles.id, accepted.id));

  return {
    careerId,
    battle: rows[0]!,
    judgements: resolved.result.judgements,
    performances: await readPerformances(test, accepted.id),
    standing: await standingOf(test, careerId),
  };
}

const verdictOf = (judgements: JudgeDecision[], judge: string) =>
  judgements.find((entry) => entry.judge === judge)!;

describe("a battle is a thing that happened, judged three ways", () => {
  let test: TestContext;
  let outwrite: Fought;
  let winTheCrowd: Fought;

  beforeAll(async () => {
    test = await createTestContext();

    /*
     * The comparison. Same career shape, same opponent, same night, same seed —
     * differing only in the angle declared before the round. Two separate careers
     * rather than one replayed, because a strategy is chosen once and lived with.
     */
    outwrite = await fight(test, await createTestUser(test, "KXMO"), {
      strategy: "OUTWRITE",
      prepare: 3,
      stageName: "KXMO",
    });
    winTheCrowd = await fight(test, await createTestUser(test, "KXMO"), {
      strategy: "WIN_THE_CROWD",
      prepare: 3,
      stageName: "KXMO",
    });
  }, 900_000);

  afterAll(async () => {
    await test.close();
  });

  /* --- A. Determinism ---------------------------------------------------- */

  it("replays exactly — same inputs, same facts, same verdicts, same result", async () => {
    const replay = await fight(test, await createTestUser(test, "KXMO"), {
      strategy: "OUTWRITE",
      prepare: 3,
      stageName: "KXMO",
    });

    const factsOf = (fought: Fought) =>
      [...fought.performances]
        .sort((a, b) => a.side.localeCompare(b.side))
        .map((row) => ({
          side: row.side,
          strategy: row.strategy,
          writing: row.writing,
          flow: row.flow,
          structure: row.structure,
          originality: row.originality,
          rebuttal: row.rebuttal,
          delivery: row.delivery,
          crowdWork: row.crowdWork,
        }));

    // The performances are identical to the last decimal.
    expect(factsOf(replay)).toEqual(factsOf(outwrite));

    // So are the judges, including their decompositions.
    for (const judge of ["TECHNICAL", "STRATEGIC", "AUDIENCE"]) {
      const first = verdictOf(outwrite.judgements, judge);
      const second = verdictOf(replay.judgements, judge);
      expect(second.verdict).toBe(first.verdict);
      expect(second.challengerTotal).toBe(first.challengerTotal);
      expect(second.opponentTotal).toBe(first.opponentTotal);
      expect(second.contributions).toEqual(first.contributions);
    }

    expect(replay.battle.decision).toBe(outwrite.battle.decision);
    expect(replay.battle.outcome).toBe(outwrite.battle.outcome);
  }, 900_000);

  /* --- B. Sensitivity ----------------------------------------------------- */

  it("produces a different battle from a different angle, for stated reasons", () => {
    const playerSide = outwrite.battle.playerSide!;
    const mine = (fought: Fought) =>
      fought.performances.find((row) => row.side === playerSide)!;

    const dense = mine(outwrite);
    const loud = mine(winTheCrowd);

    expect(dense.strategy).toBe("OUTWRITE");
    expect(loud.strategy).toBe("WIN_THE_CROWD");

    /*
     * The performances themselves differ, before any judge saw anything. This is
     * the milestone's central mechanic: strategy is not a modifier applied to a
     * score, it is what the artist actually did.
     */
    expect(dense.writing).toBeGreaterThan(loud.writing);
    expect(dense.structure).toBeGreaterThan(loud.structure);
    expect(loud.crowdWork).toBeGreaterThan(dense.crowdWork);
    expect(loud.delivery).toBeGreaterThan(dense.delivery);

    /*
     * And the judges' own reasoning explains the difference rather than a seed
     * doing it. The Technical judge — which is never told what angle was taken —
     * rates the dense round higher on the terms it actually weighs.
     */
    const technicalFor = (fought: Fought) => {
      const decision = verdictOf(fought.judgements, "TECHNICAL");
      return playerSide === "CHALLENGER"
        ? decision.challengerTotal
        : decision.opponentTotal;
    };
    expect(technicalFor(outwrite)).toBeGreaterThan(technicalFor(winTheCrowd));

    const audienceFor = (fought: Fought) => {
      const decision = verdictOf(fought.judgements, "AUDIENCE");
      return playerSide === "CHALLENGER" ? decision.challengerTotal : decision.opponentTotal;
    };
    // The room, conversely, preferred the round that was aimed at it.
    expect(audienceFor(winTheCrowd)).toBeGreaterThan(audienceFor(outwrite));

    /* The named contributions are what make that an argument, not an assertion. */
    const writingTerm = verdictOf(outwrite.judgements, "TECHNICAL").contributions.find(
      (entry) => entry.term === "writing",
    )!;
    expect(writingTerm.note).toBeTruthy();
    expect(writingTerm.weight).toBeGreaterThan(0);
  });

  /* --- C. Judge independence ---------------------------------------------- */

  it("lets the judges disagree, and records a split as a real 2-1", () => {
    const split = [outwrite, winTheCrowd].find((fought) => {
      const verdicts = fought.judgements.map((entry) => entry.verdict);
      return new Set(verdicts).size > 1;
    });

    expect(split, "no golden scenario produced a split decision").toBeTruthy();
    expect(split!.battle.decision).toBe("2-1");

    /*
     * Exactly one judge went the other way, and which one is not prescribed.
     * In this scenario it is the Strategic judge: KXMO lost the craft and lost
     * the room, and still carried out their own declared plan better than KGOSI
     * carried out his. That is precisely the outcome the milestone exists to make
     * expressible — a technically weaker performance winning a judge on its own
     * terms — and it arises from the mandates rather than from a coefficient.
     */
    const counts = new Map<string, number>();
    for (const entry of split!.judgements) {
      counts.set(entry.verdict, (counts.get(entry.verdict) ?? 0) + 1);
    }
    expect([...counts.values()].sort()).toEqual([1, 2]);

    const dissenter = split!.judgements.find(
      (entry) => counts.get(entry.verdict) === 1,
    )!;

    /* The dissent is argued, not asserted. */
    expect(dissenter.contributions.length).toBeGreaterThan(0);
    const decisive = dissenter.contributions.reduce((best, entry) =>
      Math.abs(entry.challengerContribution - entry.opponentContribution) >
      Math.abs(best.challengerContribution - best.opponentContribution)
        ? entry
        : best,
    );
    expect(decisive.note.length).toBeGreaterThan(0);

    /*
     * Independence, structurally. No two judges weigh the same named thing, so
     * agreement between any pair can never come from them reading one number.
     */
    const pairs: [string, string][] = [
      ["TECHNICAL", "STRATEGIC"],
      ["TECHNICAL", "AUDIENCE"],
      ["STRATEGIC", "AUDIENCE"],
    ];
    for (const [first, second] of pairs) {
      const a = verdictOf(split!.judgements, first).contributions.map((e) => e.term);
      const b = verdictOf(split!.judgements, second).contributions.map((e) => e.term);
      expect(a.some((term) => b.includes(term))).toBe(false);
    }

    /* And each says what it did not consider. */
    expect(verdictOf(split!.judgements, "TECHNICAL").irrelevant).toContain("crowdWork");
    expect(verdictOf(split!.judgements, "TECHNICAL").irrelevant).toContain("strategy");
    expect(verdictOf(split!.judgements, "AUDIENCE").irrelevant).toContain("intentMatch");
  });

  it("derives the result from the votes and never from a single number", async () => {
    const rows = await test.handle.db
      .select()
      .from(battleJudgements)
      .where(eq(battleJudgements.battleId, outwrite.battle.id));

    // Exactly one vote per required judge.
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.judge)).size).toBe(3);
    expect(rows.every((row) => row.panelRole === "REQUIRED")).toBe(true);

    // The winner reconciles with the votes.
    const votes = rows.filter((row) => row.verdictArtistId === outwrite.battle.winnerArtistId);
    expect(votes.length).toBeGreaterThan(rows.length - votes.length);

    // Every judge kept a decomposition rather than a bare number.
    for (const row of rows) {
      expect(row.contributions.length).toBeGreaterThan(0);
      for (const entry of row.contributions) {
        expect(entry.note.length).toBeGreaterThan(0);
      }
    }

    expect(outwrite.battle.winnerArtistId).not.toBe(outwrite.battle.loserArtistId);
  });
});

/* --- D. Preparation ------------------------------------------------------- */

describe("preparation costs something and decides nothing", () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await createTestContext();
  }, 120_000);

  afterAll(async () => {
    await test.close();
  });

  it("spends money and days, raises the round, and still loses", async () => {
    const bare = await fight(test, await createTestUser(test, "KXMO"), {
      strategy: "OUTWRITE",
      stageName: "KXMO",
    });
    const worked = await fight(test, await createTestUser(test, "KXMO"), {
      strategy: "OUTWRITE",
      prepare: 3,
      stageName: "KXMO",
    });

    const side = bare.battle.playerSide!;
    const mine = (fought: Fought) => fought.performances.find((row) => row.side === side)!;

    /* It raised the ceiling. Every fact the angle touches is better. */
    expect(mine(worked).writing).toBeGreaterThan(mine(bare).writing);
    expect(mine(worked).structure).toBeGreaterThan(mine(bare).structure);

    /*
     * It cost something scarce, through the systems that already own scarcity —
     * the money ledger and the calendar — and not through a currency of its own.
     */
    expect(mine(worked).preparationSessions).toBe(3);
    expect(mine(worked).preparationSpendMinor).toBeGreaterThan(0);

    const charges = await test.handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.careerId, worked.careerId));
    const prep = charges.filter((row) => row.relatedEntityType === "BATTLE");
    expect(prep.length).toBeGreaterThan(0);
    expect(prep.every((row) => row.direction === "DEBIT")).toBe(true);

    const days = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.careerId, worked.careerId));
    // Days a record could have had. Booked as REHEARSAL, which is what they are.
    expect(days.filter((row) => row.type === "REHEARSAL")).toHaveLength(3);
    // And the night itself is a commitment on the same calendar.
    expect(days.filter((row) => row.type === "BATTLE")).toHaveLength(1);

    /*
     * And it did not decide. A prepared first-record artist against an
     * established rooftop battler is still beaten — which is the half of this
     * that a reward model would have got wrong.
     */
    expect(worked.battle.outcome).toBe("LOST");
    // But it was a better showing: it took a judge that the bare round did not.
    const carried = (fought: Fought) =>
      fought.judgements.filter((entry) => entry.verdict === side).length;
    expect(carried(worked)).toBeGreaterThan(carried(bare));
  }, 900_000);

  it("is bounded — there is a point past which more work buys nothing", async () => {
    const { careerId, challenge } = await liveUntilChallenged(
      test,
      await createTestUser(test, "KXMO"),
      { stageName: "KXMO" },
    );
    const rows = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const user = { id: rows[0]!.userId };
    const battle = await acceptInto(test, user, careerId, challenge);

    unwrap(
      await declareBattleStrategy(test.ctx, {
        careerId,
        userId: user.id,
        battleId: battle.id,
        strategy: "OUTWRITE",
      }),
    );
    unwrap(
      await prepareForBattle(test.ctx, {
        careerId,
        userId: user.id,
        battleId: battle.id,
        sessions: 3,
      }),
    );

    const more = await prepareForBattle(test.ctx, {
      careerId,
      userId: user.id,
      battleId: battle.id,
      sessions: 1,
    });
    expect(more.ok).toBe(false);
  }, 900_000);
});

/* --- E, F, G. Consequences, declining, and doing none of it twice --------- */

describe("what a battle leaves behind", () => {
  let test: TestContext;
  let fought: Fought;
  let user: Pick<UserRow, "id">;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "KXMO");
    fought = await fight(test, user, { strategy: "OUTWRITE", prepare: 3, stageName: "KXMO" });
    unwrap(await syncCareerRelationships(test.ctx, { careerId: fought.careerId, userId: user.id }));
  }, 900_000);

  afterAll(async () => {
    await test.close();
  });

  it("moves Respect and Heat, barely moves Fame, and never touches Legacy", () => {
    const consequences = fought.battle.consequences as {
      pressure: { fame: number; respect: number; heat: number; contributions: unknown[] };
    };

    expect(consequences.pressure.respect).toBeGreaterThan(0);
    expect(consequences.pressure.heat).toBeGreaterThan(0);

    /*
     * A battle is a room, not a release. Two hundred and twenty people is a real
     * night and a rounding error in how widely known anybody is.
     */
    expect(consequences.pressure.fame).toBeLessThan(consequences.pressure.respect);
    expect(consequences.pressure.fame).toBeLessThan(consequences.pressure.heat);
    expect(consequences.pressure.fame).toBeLessThan(1);

    /* Every movement decomposed. Never a bare number. */
    expect(consequences.pressure.contributions.length).toBeGreaterThan(0);

    // Legacy is untouched, and there is no path by which it could have moved.
    expect(fought.standing.legacy).toBe(0);
  });

  it("makes rivalry real, and lets respect and rivalry rise together", async () => {
    const rows = await test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, fought.careerId));

    const rival = rows.find((row) => row.rivalry > 0);
    expect(rival, "M8 is the first system that should move rivalry").toBeTruthy();

    /*
     * Both, at once. Rivalry is not tension and it is not the inverse of
     * respect: somebody who measured themselves against you and found it close
     * rates you more, not less.
     */
    expect(rival!.rivalry).toBeGreaterThan(0);
    expect(rival!.respect).toBeGreaterThan(0);

    /* And the kind M6 declared and never assigned is finally assigned. */
    expect(rival!.kind).toBe("RIVAL");
  });

  it("leaves a public record of what happened, and none of what was proposed", async () => {
    const events = await test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, fought.careerId));

    const resolved = events.filter((row) => row.eventType === GameEventType.BattleResolved);
    expect(resolved).toHaveLength(1);
    // The scene saw it.
    expect(resolved[0]!.visibility).toBe("LOCAL_PUBLIC");

    // The challenge that produced it did not reach the world.
    const issued = events.filter((row) => row.eventType === GameEventType.BattleChallengeIssued);
    expect(issued.length).toBeGreaterThan(0);
    expect(issued.every((row) => row.visibility === "PRIVATE")).toBe(true);
  });

  it("does none of it twice, however many times it is replayed", async () => {
    const before = await standingOf(test, fought.careerId);

    const again = unwrap(
      await resolveBattle(test.ctx, {
        careerId: fought.careerId,
        userId: user.id,
        battleId: fought.battle.id,
        seed: SEED,
      }),
    );
    expect(again.ran).toBe(false);

    /* No second performance, no second vote, no second application. */
    expect(await readPerformances(test, fought.battle.id)).toHaveLength(2);

    const votes = await test.handle.db
      .select()
      .from(battleJudgements)
      .where(eq(battleJudgements.battleId, fought.battle.id));
    expect(votes).toHaveLength(3);

    expect(await standingOf(test, fought.careerId)).toEqual(before);

    /* And the relationship fold consumes it once, not once per sync. */
    const rivalryBefore = (
      await test.handle.db
        .select()
        .from(relationships)
        .where(eq(relationships.careerId, fought.careerId))
    ).find((row) => row.rivalry > 0)!.rivalry;

    unwrap(await syncCareerRelationships(test.ctx, { careerId: fought.careerId, userId: user.id }));

    const rivalryAfter = (
      await test.handle.db
        .select()
        .from(relationships)
        .where(eq(relationships.careerId, fought.careerId))
    ).find((row) => row.rivalry > 0)!.rivalry;

    expect(rivalryAfter).toBe(rivalryBefore);
  }, 300_000);

  it("scouts by revealing, and looking twice is looking once", async () => {
    const first = unwrap(
      await scoutBattleOpponent(test.ctx, {
        careerId: fought.careerId,
        userId: user.id,
        battleId: fought.battle.id,
      }),
    );
    const second = unwrap(
      await scoutBattleOpponent(test.ctx, {
        careerId: fought.careerId,
        userId: user.id,
        battleId: fought.battle.id,
      }),
    );

    expect(second.findings).toEqual(first.findings);
    expect(first.findings.length).toBeGreaterThan(0);
    /* What could not be known is reported as such rather than guessed at. */
    expect(first.unknowns.length).toBeGreaterThan(0);
    expect(first.unknowns.map((entry) => entry.label)).toContain(
      "What they will actually come with",
    );
  }, 300_000);

  /**
   * A finding about them is about *them*.
   *
   * The regression. `scoutBattleOpponent` derived its scene standing from
   * `loadCohortStanding(db, worldId, careerId)` — which reads `artist_audience`
   * by career, and therefore described **this career's** standing under a
   * heading naming the rival. Invisible headlessly, because nothing rendered a
   * finding; unavoidable the moment "Around the scene" is a player-facing
   * heading making a claim the world is supposed to own.
   *
   * The two values are forced apart rather than hoped apart: the rival is given
   * a sentinel reputation the player's own audience cannot produce, and the
   * player's standing is recomputed here exactly the way the defect computed it.
   * A regression puts the second number in the report and fails on both
   * assertions at once.
   */
  it("takes the rival's standing from the rival, not from this career's audience", async () => {
    const db = test.handle.db;

    const rivalArtistId =
      fought.battle.playerSide === "CHALLENGER"
        ? fought.battle.opponentId!
        : fought.battle.challengerId;

    /* Distinctive, and nothing an early career's cohort standing lands on. */
    const RIVAL_REPUTATION = 41;
    await db.update(artists).set({ respect: RIVAL_REPUTATION }).where(eq(artists.id, rivalArtistId));

    const careerRow = (
      await db.select().from(careers).where(eq(careers.id, fought.careerId))
    )[0]!;

    const characterRow = (
      await db.select().from(characters).where(eq(characters.artistId, rivalArtistId)).limit(1)
    )[0];
    const sceneSlug =
      (characterRow?.preferences as { battler?: { sceneSlug: string } } | undefined)?.battler
        ?.sceneSlug ?? "braamfontein";

    /* What the defect would have reported: this career's own audience, weighted. */
    const [cohortRows, audienceRows] = await Promise.all([
      db.select().from(audienceCohorts).where(eq(audienceCohorts.worldId, careerRow.worldId)),
      db.select().from(artistAudience).where(eq(artistAudience.careerId, fought.careerId)),
    ]);

    const careerStanding = sceneStanding(
      sceneSlug,
      cohortRows.map((cohort) => {
        const audience = audienceRows.find((row) => row.cohortId === cohort.id);
        return {
          slug: cohort.slug,
          name: cohort.name,
          size: cohort.size,
          fans: audience?.fans ?? 0,
          affinity: audience?.affinity ?? 0,
          priorExposure: audience?.priorExposure ?? 0,
          sceneAffinity: cohort.sceneAffinity,
        };
      }),
    ).value;

    expect(
      careerStanding,
      "the test proves nothing unless the two values genuinely differ",
    ).not.toBeCloseTo(RIVAL_REPUTATION, 3);

    /*
     * The report is written once and stands, so the persisted one is cleared to
     * make scouting derive a fresh answer. The same technique the M7 boundary
     * suite uses to re-run a communication.
     */
    await db
      .delete(battleScoutingReports)
      .where(eq(battleScoutingReports.battleId, fought.battle.id));

    const report = unwrap(
      await scoutBattleOpponent(test.ctx, {
        careerId: fought.careerId,
        userId: user.id,
        battleId: fought.battle.id,
      }),
    );

    const scene = report.findings.find((entry) => entry.source === "SCENE");
    expect(scene, "scouting said nothing about the scene").toBeDefined();

    expect(scene!.observed.sceneStanding).toBe(RIVAL_REPUTATION);
    expect(scene!.observed.sceneStanding).not.toBe(careerStanding);
    /* And the finding is still about the person it names. */
    expect(scene!.label).toContain(sceneSlug);
  }, 300_000);
});

describe("declining is a real path", () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await createTestContext();
  }, 120_000);

  afterAll(async () => {
    await test.close();
  });

  it("is not a loss, and costs no Respect", async () => {
    const user = await createTestUser(test, "KXMO");
    const { careerId, challenge } = await liveUntilChallenged(test, user, { stageName: "KXMO" });

    const before = await standingOf(test, careerId);

    unwrap(
      await declineBattleChallenge(test.ctx, {
        careerId,
        userId: user.id,
        opportunityId: challenge.id,
      }),
    );
    unwrap(await syncCareerRelationships(test.ctx, { careerId, userId: user.id }));

    /* Refusing is not losing: no battle exists, because none happened. */
    const rows = await test.handle.db.select().from(battles).where(eq(battles.careerId, careerId));
    expect(rows).toHaveLength(0);

    /* And standing is untouched. Declining is a decision, not a penalty. */
    const after = await standingOf(test, careerId);
    expect(after.respect).toBe(before.respect);
    expect(after.fame).toBe(before.fame);
    expect(after.legacy).toBe(0);

    /* It is remembered, and it is remembered as its own thing. */
    const offer = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, challenge.id));
    expect(offer[0]!.status).toBe("DECLINED");

    const events = await test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, careerId));
    expect(
      events.filter((row) => row.eventType === GameEventType.BattleChallengeDeclined),
    ).toHaveLength(1);
    // A refusal is between the two of you. The scene does not hear about it.
    expect(events.filter((row) => row.eventType === GameEventType.BattleResolved)).toHaveLength(0);
  }, 900_000);

  it("leaves a different relationship from a lost battle, and neither is silent", async () => {
    const refuser = await createTestUser(test, "KXMO");
    const refused = await liveUntilChallenged(test, refuser, { stageName: "KXMO" });
    unwrap(
      await declineBattleChallenge(test.ctx, {
        careerId: refused.careerId,
        userId: refuser.id,
        opportunityId: refused.challenge.id,
      }),
    );
    unwrap(
      await syncCareerRelationships(test.ctx, {
        careerId: refused.careerId,
        userId: refuser.id,
      }),
    );

    const fighter = await createTestUser(test, "KXMO");
    const fought = await fight(test, fighter, {
      strategy: "OUTWRITE",
      prepare: 3,
      stageName: "KXMO",
    });
    unwrap(
      await syncCareerRelationships(test.ctx, { careerId: fought.careerId, userId: fighter.id }),
    );

    const relationshipFor = async (careerId: string) => {
      const rows = await test.handle.db
        .select()
        .from(relationships)
        .where(eq(relationships.careerId, careerId));
      return rows.find((row) => row.rivalry > 0)!;
    };

    const refusedState = await relationshipFor(refused.careerId);
    const foughtState = await relationshipFor(fought.careerId);

    /*
     * Neither is silent, and they are not the same history.
     *
     * Both have rivalry, because in both KGOSI *decided to measure himself*
     * against this career — that is what issuing a challenge is, and it is true
     * whether or not it was taken up. Declining adds none of its own.
     */
    expect(refusedState.rivalry).toBeGreaterThan(0);
    expect(foughtState.rivalry).toBeGreaterThan(refusedState.rivalry);

    /*
     * The load-bearing assertion of the whole milestone on this point.
     *
     * Refusing moves respect **not at all, in either direction**. An artist who
     * does not battle is an artist who does not battle, and the model does not
     * quietly tax them for it. Competing — even losing — is what earns it.
     */
    expect(refusedState.respect).toBe(0);
    expect(foughtState.respect).toBeGreaterThan(0);

    /* Refusing leaves something unresolved; going through with it settles it. */
    expect(refusedState.tension).toBeGreaterThan(0);
    expect(foughtState.tension).toBe(0);

    /*
     * And declining is not losing. There is no battle row for a refusal, because
     * no battle happened — where a fought one is RESOLVED with a real verdict.
     */
    const refusedBattles = await test.handle.db
      .select()
      .from(battles)
      .where(eq(battles.careerId, refused.careerId));
    expect(refusedBattles).toHaveLength(0);
    expect(fought.battle.status).toBe("RESOLVED");
    expect(fought.battle.outcome).toBe("LOST");
  }, 900_000);
});

/* --- Long horizon --------------------------------------------------------- */

describe("a battle stays fought", () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await createTestContext();
  }, 120_000);

  afterAll(async () => {
    await test.close();
  });

  /**
   * M7 exposed a reception defect that only appeared after several days, so a
   * three-step golden path is not evidence of lifecycle safety. This runs the
   * world well past the battle and checks the things that a replayed or
   * long-running world is actually capable of getting wrong.
   */
  it("survives three weeks of the world continuing to happen", async () => {
    const user = await createTestUser(test, "KXMO");
    const fought = await fight(test, user, {
      strategy: "OUTWRITE",
      prepare: 3,
      stageName: "KXMO",
    });

    const standingAfterBattle = await standingOf(test, fought.careerId);

    for (let day = 0; day < 21; day += 1) {
      unwrap(
        await advanceCareerDay(test.ctx, {
          careerId: fought.careerId,
          userId: user.id,
          seed: SEED,
        }),
      );
    }

    /* Exactly one canonical result, and it is the one that was decided. */
    const rows = await test.handle.db
      .select()
      .from(battles)
      .where(eq(battles.careerId, fought.careerId));
    const resolved = rows.filter((row) => row.status === "RESOLVED");
    expect(resolved).toHaveLength(1);
    expect(resolved[0]!.id).toBe(fought.battle.id);
    expect(resolved[0]!.decision).toBe(fought.battle.decision);
    expect(resolved[0]!.winnerArtistId).toBe(fought.battle.winnerArtistId);

    /* Judged exactly once, whatever else the world did afterwards. */
    const votes = await test.handle.db
      .select()
      .from(battleJudgements)
      .where(eq(battleJudgements.battleId, fought.battle.id));
    expect(votes).toHaveLength(3);

    const events = await test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, fought.careerId));
    expect(
      events.filter((row) => row.eventType === GameEventType.BattleResolved),
    ).toHaveLength(1);
    expect(
      events.filter((row) => row.eventType === GameEventType.BattleConsequencesApplied),
    ).toHaveLength(1);

    /*
     * The consequences landed once. Standing keeps moving because reception
     * keeps running — that is the record, not the battle — so what is asserted
     * is that it never went *backwards* and that Legacy never moved at all.
     */
    const now = await standingOf(test, fought.careerId);
    expect(now.respect).toBeGreaterThanOrEqual(standingAfterBattle.respect);
    expect(now.heat).toBeGreaterThanOrEqual(0);
    expect(now.legacy).toBe(0);

    /* Relationship state stays inside its bounds however long the fold runs. */
    unwrap(await syncCareerRelationships(test.ctx, { careerId: fought.careerId, userId: user.id }));
    const people = await test.handle.db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, fought.careerId));

    for (const person of people) {
      for (const value of [
        person.rivalry,
        person.respect,
        person.tension,
        person.trust,
        person.familiarity,
        person.loyalty,
        person.creativeChemistry,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }

    /*
     * And a battle that has been fought does not come back. The rival may
     * legitimately challenge again — that is a *new* battle — but the settled one
     * never re-enters the pool and is never re-offered under its old identity.
     */
    const offers = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, fought.careerId));

    const challenges = offers.filter((row) => row.type === "BATTLE_CHALLENGE");
    const keys = challenges.map((row) => row.idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);

    const settledChallenge = challenges.find((row) => row.id === fought.battle.opportunityId)!;
    expect(settledChallenge.status).toBe("ACCEPTED");

    /* One battle row per challenge that was taken. Never two. */
    const battleKeys = rows.map((row) => row.idempotencyKey);
    expect(new Set(battleKeys).size).toBe(battleKeys.length);
  }, 900_000);
});
