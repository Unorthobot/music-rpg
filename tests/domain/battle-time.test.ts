import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  battleJudgements,
  battlePerformances,
  battles,
  calendarItems,
  careers,
  eq,
  gameEvents,
  npcMessages,
  opportunities,
  relationshipMoments,
  relationships,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType } from "@music-rpg/events";
import {
  advanceCareerDay,
  declareBattleStrategy,
  declineBattleChallenge,
  getActiveBattle,
  getBattleAwaitingAngle,
  getCalendarBattles,
  getCareerBattleHistory,
  getPlayerBattle,
  resolveBattle,
} from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { acceptInto, liveUntilChallenged } from "../helpers/battle";

/**
 * Time, and what it is not allowed to walk past.
 *
 * Two rules meet in this file and they pull in opposite directions, which is why
 * they are tested together.
 *
 * **Time creates.** A battle happens because game time reached the night, not
 * because anybody looked at it. A player who never opens the route still fights
 * the battle, is still told, and finds the decision waiting.
 *
 * **Time cannot walk past a commitment.** Accepting is a decision with a
 * consequence: the world will not carry the career through a night it agreed to
 * until the one decision that night requires has been made. Not because battling
 * is compulsory — declining was free and stays free — but because
 * `agreed → the night passes → an angle is chosen → the battle happens later` is
 * not a sequence of events that can occur.
 */

const SEED = "m8-battle-time";

type Challenged = {
  test: TestContext;
  user: Pick<UserRow, "id">;
  careerId: string;
  challengeId: string;
};

async function careerOf(test: TestContext, careerId: string) {
  return (await test.handle.db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
}

async function battleOf(test: TestContext, careerId: string) {
  return (await test.handle.db.select().from(battles).where(eq(battles.careerId, careerId)))[0];
}

/** Everything about this career, as it stands. A refusal must move none of it. */
async function census(test: TestContext, careerId: string) {
  const db = test.handle.db;
  const career = await careerOf(test, careerId);

  return {
    date: career.currentGameDate.toISOString(),
    standing: [career.fame, career.respect, career.heat, career.legacy].join(":"),
    money: career.moneyBalance,
    battles: (await db.select().from(battles).where(eq(battles.careerId, careerId)))
      .map((row) => `${row.id}:${row.status}`)
      .sort(),
    performances: (await db.select().from(battlePerformances)).length,
    judgements: (await db.select().from(battleJudgements)).length,
    events: (await db.select().from(gameEvents).where(eq(gameEvents.careerId, careerId))).length,
    offers: (await db.select().from(opportunities).where(eq(opportunities.careerId, careerId)))
      .map((row) => `${row.id}:${row.status}`)
      .sort(),
    calendar: (await db.select().from(calendarItems).where(eq(calendarItems.careerId, careerId)))
      .length,
    messages: (await db.select().from(npcMessages)).length,
    moments: (
      await db.select().from(relationshipMoments).where(eq(relationshipMoments.careerId, careerId))
    ).length,
    relationships: (await db.select().from(relationships).where(eq(relationships.careerId, careerId)))
      .map((row) => `${row.subjectId}:${row.familiarity}:${row.respect}:${row.rivalry}`)
      .sort(),
  };
}

async function challenge(stageName: string): Promise<Challenged> {
  const test = await createTestContext();
  const user = await createTestUser(test, stageName);
  const { careerId, challenge: offer } = await liveUntilChallenged(test, user, { stageName });

  return { test, user, careerId, challengeId: offer.id };
}

describe("a night the world cannot walk past", () => {
  let world: Challenged;
  let battleId: string;
  let night: Date;

  beforeAll(async () => {
    world = await challenge("CLOCKKX");
    const accepted = await acceptInto(
      world.test,
      world.user,
      world.careerId,
      (
        await world.test.handle.db
          .select()
          .from(opportunities)
          .where(eq(opportunities.id, world.challengeId))
      )[0]!,
    );

    battleId = accepted.id;
    night = accepted.scheduledGameTime!;
  }, 600_000);

  afterAll(async () => {
    await world.test.close();
  });

  /**
   * Agreeing to something in a fortnight does not stop tomorrow.
   *
   * The guard is about *crossing* a commitment, not about having one. A career
   * that accepted a battle two weeks out has two weeks of ordinary life to get
   * on with, and a rule that froze the clock the moment somebody said yes would
   * have made accepting a punishment.
   */
  it("lets time pass normally while the night is still ahead", async () => {
    const career = await careerOf(world.test, world.careerId);
    expect(night.getTime()).toBeGreaterThan(career.currentGameDate.getTime() + 24 * 60 * 60 * 1000);

    const before = career.currentGameDate.getTime();

    const advanced = await advanceCareerDay(world.test.ctx, {
      careerId: world.careerId,
      userId: world.user.id,
      seed: SEED,
    });

    expect(advanced.ok, "a distant commitment blocked an ordinary day").toBe(true);
    expect((await careerOf(world.test, world.careerId)).currentGameDate.getTime()).toBeGreaterThan(
      before,
    );

    /* Still agreed to, still unanswered, still not fought. */
    expect((await battleOf(world.test, world.careerId))!.status).toBe("ACCEPTED");
  }, 120_000);

  /**
   * The day that would reach the night is refused.
   *
   * Advanced until the world is about to arrive at it, which is the only honest
   * way to reach this state — the guard fires on whichever day would actually
   * land on or past the night, and that day is a property of where the releases
   * are rather than something a test should assert its way to.
   */
  it("refuses the day that would carry the career through it", async () => {
    let refusal: string | null = null;

    for (let day = 0; day < 30; day += 1) {
      const advanced = await advanceCareerDay(world.test.ctx, {
        careerId: world.careerId,
        userId: world.user.id,
        seed: SEED,
      });

      if (!advanced.ok) {
        refusal = advanced.error.message;
        break;
      }
    }

    expect(refusal, "the world walked straight past a battle nobody had prepared for").toBeTruthy();

    /* It says what is outstanding, and what to do about it. */
    expect(refusal).toContain("Decide how you're going in");
    /* Named, so the player knows which commitment this is. */
    expect(refusal).toMatch(/You agreed to battle \w+/);

    /* And it is a refusal about a decision, never about the player's character. */
    for (const banned of ["must", "required", "cannot skip", "afraid", "avoid"]) {
      expect(refusal!.toLowerCase()).not.toContain(banned);
    }
  }, 300_000);

  /**
   * A refused day is a day that did not happen.
   *
   * The half most likely to be got wrong. The career's clock follows its
   * records, so a guard placed one line too late would refuse *after* a release
   * had already ticked — leaving reception written for a day the player was told
   * did not occur. Everything is counted, the advance is refused repeatedly, and
   * everything is counted again.
   */
  it("changes absolutely nothing when it refuses", async () => {
    const before = await census(world.test, world.careerId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const advanced = await advanceCareerDay(world.test.ctx, {
        careerId: world.careerId,
        userId: world.user.id,
        seed: SEED,
      });
      expect(advanced.ok).toBe(false);
    }

    expect(await census(world.test, world.careerId)).toEqual(before);
  }, 120_000);

  /**
   * Reading is not deciding.
   *
   * Every player-facing battle query, run repeatedly against a battle whose
   * night the world is one day away from. None of it may resolve anything, move
   * the clock, or turn a commitment into a result — the route is a window, and
   * windows do not decide what is outside them.
   */
  it("resolves nothing however many times the battle is read", async () => {
    const db = world.test.handle.db;
    const before = await census(world.test, world.careerId);
    const career = await careerOf(world.test, world.careerId);

    for (let visit = 0; visit < 5; visit += 1) {
      await getPlayerBattle(db, career, battleId);
      await getActiveBattle(db, career);
      await getBattleAwaitingAngle(db, career);
      await getCareerBattleHistory(db, career);
      await getCalendarBattles(db, career);
    }

    expect(await census(world.test, world.careerId)).toEqual(before);
    expect((await battleOf(world.test, world.careerId))!.status).toBe("ACCEPTED");
    expect(await db.select().from(battleJudgements)).toHaveLength(0);
  }, 120_000);

  /**
   * The player is told what is outstanding, where they already look.
   *
   * Consequence-of-commitment language, not a participation nudge. It states a
   * fact about a night they agreed to and the decision it still needs.
   */
  it("says what is outstanding, in the player's own terms", async () => {
    const career = await careerOf(world.test, world.careerId);
    const waiting = await getBattleAwaitingAngle(world.test.handle.db, career);

    expect(waiting, "nothing told the player why the day would not move").toBeTruthy();
    expect(waiting!.awaitingAngle).toBe(true);
    expect(waiting!.awaitingAngleLine).toContain("decide how you're going in");
    expect(waiting!.strategy).toBeNull();

    /* No pressure, no scoring, no implication of failure. */
    const line = waiting!.awaitingAngleLine!.toLowerCase();
    for (const banned of ["must", "penalty", "miss", "lose", "warning", "fail"]) {
      expect(line).not.toContain(banned);
    }
  });

  /**
   * Declaring an angle unblocks the world, and nothing else is compulsory.
   *
   * Preparation is deliberately not done here. It costs money and days a record
   * could have had, and a battle that could not be entered without it would have
   * made the cost mandatory rather than a decision.
   */
  it("moves again once the angle is declared, with nothing prepared", async () => {
    unwrap(
      await declareBattleStrategy(world.test.ctx, {
        careerId: world.careerId,
        userId: world.user.id,
        battleId,
        strategy: "TAKE_THEM_APART",
      }),
    );

    expect((await battleOf(world.test, world.careerId))!.status).toBe("SCHEDULED");

    const career = await careerOf(world.test, world.careerId);
    const ready = await getPlayerBattle(world.test.handle.db, career, battleId);

    expect(ready!.awaitingAngle).toBe(false);
    expect(ready!.awaitingAngleLine).toBeNull();
    expect(ready!.stage).toBe("READY");
    /* Nothing was spent, and nothing needed to be. */
    expect(ready!.preparation.sessions).toBe(0);
    expect(ready!.preparation.spendMinor).toBe(0);
  });

  /**
   * The night happens because the world reached it.
   *
   * Not because anything was opened, and not because anything was called. The
   * day advance is the only thing that ran, and the battle is decided at the end
   * of it.
   */
  it("fights the battle on the day advance that reaches the night", async () => {
    let resolvedOn: Awaited<ReturnType<typeof advanceCareerDay>> | null = null;

    for (let day = 0; day < 30; day += 1) {
      const advanced = await advanceCareerDay(world.test.ctx, {
        careerId: world.careerId,
        userId: world.user.id,
        seed: SEED,
      });

      expect(advanced.ok, "the day was refused after the angle was declared").toBe(true);
      if (advanced.ok && advanced.value.battles.length > 0) {
        resolvedOn = advanced;
        break;
      }
    }

    expect(resolvedOn, "the world never reached the night").toBeTruthy();

    const outcome = resolvedOn!.ok ? resolvedOn!.value.battles[0]! : null;
    expect(outcome!.ran).toBe(true);
    expect(outcome!.result.decision).toMatch(/^\d-\d$/);

    const row = (await battleOf(world.test, world.careerId))!;
    expect(row.status).toBe("RESOLVED");
    expect(row.decision).toBeTruthy();
    expect(row.winnerArtistId).toBeTruthy();

    /* Three judges, each having decided for itself. */
    expect(await world.test.handle.db.select().from(battleJudgements)).toHaveLength(3);
  }, 300_000);

  /**
   * And the day after is an ordinary day again.
   *
   * A resolved battle stops being a scheduled event. If it did not, every
   * subsequent advance would try to fight it again — and the idempotency that
   * makes that harmless is not a reason to keep asking.
   */
  it("does not fight it a second time, or block anything afterwards", async () => {
    const advanced = await advanceCareerDay(world.test.ctx, {
      careerId: world.careerId,
      userId: world.user.id,
      seed: SEED,
    });

    expect(advanced.ok).toBe(true);
    expect(advanced.ok && advanced.value.battles).toEqual([]);

    expect(await world.test.handle.db.select().from(battleJudgements)).toHaveLength(3);
    expect(await world.test.handle.db.select().from(battlePerformances)).toHaveLength(2);

    /* Explicitly asking again is a no-op rather than a second night. */
    const again = unwrap(
      await resolveBattle(world.test.ctx, {
        careerId: world.careerId,
        userId: world.user.id,
        battleId,
      }),
    );
    expect(again.ran).toBe(false);

    /*
     * The battle's consequences landed exactly once.
     *
     * Asserted against the battle's own event rather than against the career's
     * standing, because standing legitimately keeps moving: the record is still
     * out and reception is still accruing every day. A test that read a raw
     * metric here would be asserting that the rest of the world had stopped.
     */
    const applied = (
      await world.test.handle.db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.careerId, world.careerId))
    ).filter((row) => row.eventType === GameEventType.BattleConsequencesApplied);

    expect(applied).toHaveLength(1);
  }, 180_000);
});

/**
 * Refusing leaves nothing behind, including this rule.
 *
 * The guard exists because the player took on a commitment. Somebody who turned
 * the challenge down took on nothing, and their world must be exactly as free as
 * it was before anybody asked — no battle, no blocked day, and nothing anywhere
 * that counts what they declined.
 */
describe("declining creates no commitment to be blocked by", () => {
  let world: Challenged;

  beforeAll(async () => {
    world = await challenge("FREEKX");
  }, 600_000);

  afterAll(async () => {
    await world.test.close();
  });

  it("never blocks a day, however far past the night the world goes", async () => {
    const db = world.test.handle.db;

    const offer = (
      await db.select().from(opportunities).where(eq(opportunities.id, world.challengeId))
    )[0]!;
    const wouldHaveBeen = new Date(String((offer.payload as { nightGameTime: string }).nightGameTime));

    unwrap(
      await declineBattleChallenge(world.test.ctx, {
        careerId: world.careerId,
        userId: world.user.id,
        opportunityId: world.challengeId,
      }),
    );

    /* No commitment was created, so there is nothing that could block. */
    expect(await db.select().from(battles).where(eq(battles.careerId, world.careerId))).toHaveLength(
      0,
    );

    /* And the world walks straight through the night that is not happening. */
    let crossed = false;
    for (let day = 0; day < 30 && !crossed; day += 1) {
      const advanced = await advanceCareerDay(world.test.ctx, {
        careerId: world.careerId,
        userId: world.user.id,
        seed: SEED,
      });

      expect(advanced.ok, "a refused challenge blocked a day").toBe(true);
      crossed = (await careerOf(world.test, world.careerId)).currentGameDate >= wouldHaveBeen;
    }

    expect(crossed, "the world never reached the night that was declined").toBe(true);

    /* Nothing was fought, and nothing was recorded as having been. */
    expect(await db.select().from(battles).where(eq(battles.careerId, world.careerId))).toHaveLength(
      0,
    );
    expect(await db.select().from(battleJudgements)).toHaveLength(0);

    const career = await careerOf(world.test, world.careerId);
    expect(await getActiveBattle(db, career)).toBeNull();
    expect(await getBattleAwaitingAngle(db, career)).toBeNull();
  }, 600_000);
});
