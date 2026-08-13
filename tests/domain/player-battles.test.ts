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
  relationships,
  type BattleRow,
  type UserRow,
} from "@music-rpg/database";
import {
  advanceCareerDay,
  declareBattleStrategy,
  getActiveBattle,
  getBattleAwaitingAngle,
  getCalendarBattles,
  getCareerBattleHistory,
  getCareerBattles,
  getDeclinedChallenges,
  getNotifications,
  getPlayerBattle,
  prepareForBattle,
  resolveBattle,
  scoutBattleOpponent,
  syncCareerRelationships,
  PLAYER_BATTLE_KEYS,
} from "@music-rpg/domain";
import { unwrap, type BattleStrategy, type PlayerBattle } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { acceptInto, liveUntilChallenged } from "../helpers/battle";

/**
 * The boundary, before anything renders it.
 *
 * This file exists at this point in the milestone deliberately. A read model
 * proven after the screens are built is a read model shaped by what the screens
 * turned out to want; proven before, it is the thing the screens have to live
 * within. Nothing player-facing about battles is built until this passes.
 *
 * Two failures are being guarded against and they run in opposite directions.
 *
 * **Leakage** is the boundary failing outwards. A `battles` row carries seven
 * performance quantities, four derivation shifts behind each of them, two totals
 * and a margin per judge, every weighted contribution behind those totals, the
 * seed, two engine versions and the whole priced consequence blob. Any of it
 * reaching a player turns a night in a room into a stat screen, and every
 * decision afterwards into an optimisation.
 *
 * **Drift** is every surface growing its own idea of what the battle was — the
 * calendar naming a night the route disagrees with, Career remembering a result
 * World never saw.
 *
 * Both are asserted rather than reviewed by eye.
 */

const SEED = "m8-player-boundary";

type World = {
  test: TestContext;
  user: Pick<UserRow, "id">;
  careerId: string;
  battle: BattleRow;
};

async function careerOf(world: World) {
  const rows = await world.test.handle.db
    .select()
    .from(careers)
    .where(eq(careers.id, world.careerId));
  return rows[0]!;
}

/**
 * A battle fought all the way through, by the real commands.
 *
 * Nothing is inserted behind a domain boundary: the career is onboarded, makes a
 * record, releases it, lives until somebody calls it out, agrees, declares an
 * angle, prepares, and lets the world reach the night.
 */
async function fightThrough(
  test: TestContext,
  user: Pick<UserRow, "id">,
  options: { stageName: string; strategy: BattleStrategy; prepare?: number },
): Promise<World> {
  const { careerId, challenge } = await liveUntilChallenged(test, user, {
    stageName: options.stageName,
  });

  const accepted = await acceptInto(test, user, careerId, challenge);

  unwrap(
    await scoutBattleOpponent(test.ctx, { careerId, userId: user.id, battleId: accepted.id }),
  );
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

  const night = accepted.scheduledGameTime!;
  for (let guard = 0; guard < 30; guard += 1) {
    const rows = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    if (rows[0]!.currentGameDate >= night) break;
    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: SEED }));
  }

  unwrap(
    await resolveBattle(test.ctx, {
      careerId,
      userId: user.id,
      battleId: accepted.id,
      seed: SEED,
    }),
  );

  const rows = await test.handle.db.select().from(battles).where(eq(battles.id, accepted.id));

  return { test, user, careerId, battle: rows[0]! };
}

describe("what a player is allowed to know about a battle", () => {
  let world: World;
  let played: PlayerBattle;

  beforeAll(async () => {
    const test = await createTestContext();
    const user = await createTestUser(test, "BOUNDKX");
    world = await fightThrough(test, user, {
      stageName: "BOUNDKX",
      strategy: "OUTWRITE",
      prepare: 2,
    });

    played = (await getPlayerBattle(test.handle.db, await careerOf(world), world.battle.id))!;
  }, 600_000);

  afterAll(async () => {
    await world.test.close();
  });

  /* --- The structural half -------------------------------------------------- */

  /**
   * A closed shape, not a row.
   *
   * Not "we checked the rendered strings and found no numbers" — that catches
   * today's leak and none of tomorrow's. This asserts the shape rather than its
   * current contents, so a battle engine that grows a new diagnostic column next
   * year cannot have it arrive on a screen by default.
   */
  it("hands a screen a closed shape, not a row", async () => {
    expect(played).toBeDefined();
    expect(Object.keys(played).sort()).toEqual([...PLAYER_BATTLE_KEYS].sort());
  });

  /**
   * The same, for every function that returns one.
   *
   * A boundary held by one query and not by its four siblings is not a boundary.
   */
  it("holds the same shape from every query that returns a battle", async () => {
    const career = await careerOf(world);
    const db = world.test.handle.db;

    const history = await getCareerBattleHistory(db, career);
    const byCalendar = [...(await getCalendarBattles(db, career)).values()];

    expect(history.length).toBeGreaterThan(0);

    for (const battle of [...history, ...byCalendar]) {
      expect(Object.keys(battle).sort()).toEqual([...PLAYER_BATTLE_KEYS].sort());
    }
  });

  /* --- The serialised half -------------------------------------------------- */

  /**
   * The machinery, by name.
   *
   * A projection can be a closed shape at the top level and still smuggle a
   * decomposition through in a nested object, so this walks everything a
   * component could reach and looks for the names by which the engine is known.
   */
  it("carries no engine state anywhere in the bundle a screen receives", async () => {
    const career = await careerOf(world);
    const db = world.test.handle.db;

    const bundle = JSON.stringify({
      battle: played,
      history: await getCareerBattleHistory(db, career),
      active: await getActiveBattle(db, career),
      calendar: [...(await getCalendarBattles(db, career)).values()],
      declined: await getDeclinedChallenges(db, career),
    });

    /*
     * Checked as serialised **keys** rather than as bare substrings, because
     * several of these are also ordinary English. "The writing" is the heading
     * this milestone requires and "writing" is a column that must never cross,
     * and a test that cannot tell them apart would force the product to rename
     * the heading to keep the boundary green — the tail wagging the dog. A
     * leaked column serialises as `"writing":47.955`, which this catches and the
     * heading does not trip.
     */
    const forbiddenKeys = [
      /* The seven performance facts. */
      "writing",
      "flow",
      "structure",
      "originality",
      "rebuttal",
      "delivery",
      "crowdWork",
      /* How each of them was arrived at. */
      "derivation",
      "base",
      "strategyShift",
      "preparationShift",
      "composureShift",
      /* The judges' own arithmetic. */
      "challengerTotal",
      "opponentTotal",
      "margin",
      "contributions",
      "challengerContribution",
      "opponentContribution",
      "challengerInput",
      "opponentInput",
      "weight",
      "irrelevant",
      "term",
      "judge",
      "verdictSide",
      /* Craft, temperament and the room. */
      "skills",
      "psychology",
      "battleIQ",
      "resilience",
      "competitiveness",
      "strategyAptitude",
      "qualities",
      "attention",
      "sceneAffinity",
      "share",
      /* Replay, versioning and pricing. */
      "seed",
      "simulatorVersion",
      "engineVersion",
      "consequences",
      "pressure",
      "fame",
      "respect",
      "heat",
      "rivalry",
      /* The director, unchanged from M7's boundary. */
      "eligibility",
      "ranking",
      "triggerState",
      "triggerReason",
      "suppressedBy",
      "challengeState",
    ];

    for (const key of forbiddenKeys) {
      expect(bundle, `the "${key}" field reached a player-facing battle bundle`).not.toContain(
        `"${key}":`,
      );
    }

    /*
     * These are machine vocabulary in any position. None of them is a word a
     * person would write in a sentence about a room, so a bare match is a real
     * leak wherever it appears — including inside a string somebody assembled by
     * hand.
     */
    const forbiddenAnywhere = [
      "TECHNICAL",
      "STRATEGIC",
      "AUDIENCE",
      "intentMatch",
      "commitment",
      "opponentAnswered",
      "costOfChoice",
      "cohortTaste",
      "legibility",
      "roomHistory",
      "sceneStanding",
      "artist_skills",
      "artist_psychology",
      "battles-v1",
      "battle-judges-v1",
      "director-v1",
      "OUTRANKED_BY_CAP",
      "CHALLENGED",
      "PERFORMED",
      "JUDGED",
      "RESOLVED",
      /* The word this milestone bans outright, in the copy and in the code. */
      "scorecard",
    ];

    for (const term of forbiddenAnywhere) {
      expect(bundle, `"${term}" reached a player-facing battle bundle`).not.toContain(term);
    }
  });

  /**
   * The machinery, by value.
   *
   * Stronger than the name check and the one that actually pins the hard rule. A
   * field renamed on its way to a screen is still the number; this reads the
   * real quantities out of the rows and asserts that none of them appears
   * anywhere in what a player receives, in any form a screen could render.
   */
  it("carries none of the actual quantities the engine decided with", async () => {
    const career = await careerOf(world);
    const db = world.test.handle.db;

    /*
     * Timestamps and ids are stripped before scanning. An ISO date contains
     * "0.00" and a generated id contains arbitrary digit runs, so leaving them
     * in makes the test fail on coincidence rather than on leakage — and a test
     * that fails for the wrong reason gets weakened until it passes.
     */
    const bundle = JSON.stringify({
      battle: played,
      history: await getCareerBattleHistory(db, career),
      calendar: [...(await getCalendarBattles(db, career)).values()],
    })
      .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<when>")
      .replace(/id_[a-z0-9]+/g, "<id>");

    const performanceRows = await db
      .select()
      .from(battlePerformances)
      .where(eq(battlePerformances.battleId, world.battle.id));
    const judgementRows = await db
      .select()
      .from(battleJudgements)
      .where(eq(battleJudgements.battleId, world.battle.id));

    const quantities: { label: string; value: number }[] = [];

    for (const row of performanceRows) {
      for (const fact of [
        "writing",
        "flow",
        "structure",
        "originality",
        "rebuttal",
        "delivery",
        "crowdWork",
      ] as const) {
        quantities.push({ label: `${row.side}.${fact}`, value: row[fact] });
      }
    }

    for (const row of judgementRows) {
      quantities.push({ label: `${row.judge}.challengerTotal`, value: row.challengerTotal });
      quantities.push({ label: `${row.judge}.opponentTotal`, value: row.opponentTotal });
      quantities.push({ label: `${row.judge}.margin`, value: row.margin });

      for (const entry of row.contributions) {
        quantities.push({ label: `${row.judge}.${entry.term}.weight`, value: entry.weight });
        quantities.push({
          label: `${row.judge}.${entry.term}.challenger`,
          value: entry.challengerContribution,
        });
        quantities.push({
          label: `${row.judge}.${entry.term}.opponent`,
          value: entry.opponentContribution,
        });
      }
    }

    expect(quantities.length).toBeGreaterThan(20);

    for (const quantity of quantities) {
      /*
       * A zero carries no information about anybody's performance and appears in
       * every counter on the type, so asserting on it would be asserting on
       * coincidence.
       */
      if (quantity.value === 0) continue;

      /*
       * Checked at full precision and rounded, because the dishonest version of
       * this leak is a component that formats to one decimal place on the way
       * out and calls it a presentation concern.
       */
      const forms = [
        String(quantity.value),
        quantity.value.toFixed(1),
        quantity.value.toFixed(2),
      ];

      for (const form of forms) {
        /* Too short to be evidence: "45" is also a capacity and a fee. */
        if (form.replace(/\D/g, "").length < 3) continue;

        expect(
          bundle,
          `${quantity.label} (${form}) reached a player-facing battle bundle`,
        ).not.toContain(form);
      }
    }
  });

  /**
   * The decision is three perspectives, and never a quantity.
   *
   * The single hardest rule in the milestone, asserted against the rendered
   * strings themselves: no digit survives into any sentence describing what
   * happened, so there is no number to optimise against even in prose.
   */
  it("says what happened in words, with no quantity anywhere in them", () => {
    const decision = played.decision!;
    expect(decision).toBeDefined();

    expect(decision.perspectives).toHaveLength(3);
    expect(decision.perspectives.map((entry) => entry.heading)).toEqual([
      "The writing",
      "The plan",
      "The room",
    ]);

    const prose = [
      ...decision.perspectives.map((entry) => entry.line),
      decision.yourRound,
      ...decision.aftermath,
      ...(played.scouting?.sections.flatMap((section) => section.insights) ?? []),
      ...(played.scouting?.unknowns ?? []),
    ];

    for (const line of prose) {
      expect(line, "a battle line carried a digit").not.toMatch(/\d/);
      expect(line.toLowerCase()).not.toContain("score");
      expect(line.toLowerCase()).not.toContain("rating");
      expect(line.toLowerCase()).not.toContain("points");
    }

    /* The tally is the one place a figure belongs, and it is the panel's shape. */
    expect(decision.tally).toMatch(/^\d–\d$/);
  });

  /**
   * No reward language, in either of its two forms.
   *
   * The numbers are the obvious failure. The gamified copy is the one that
   * actually ships, because it feels like restraint — "Respect increased!" is the
   * same idea with the figure hidden, and it treats a night in a room as a
   * payout just as much as "+0.45" does.
   */
  it("never announces a metric, as a figure or as an exclamation", () => {
    const aftermath = played.decision!.aftermath.join(" ").toLowerCase();

    for (const banned of ["respect", "heat", "fame", "rivalry", "legacy", "unlocked", "reward"]) {
      expect(aftermath, `the aftermath announced ${banned}`).not.toContain(banned);
    }

    expect(aftermath).not.toMatch(/increased|gained|earned|\+\d/);
  });

  /* --- Reading changes nothing --------------------------------------------- */

  /**
   * A hundred visits show the same world a hundred times.
   *
   * The constitutional rule, asserted at the read model rather than in a
   * browser. Every player-facing battle query is run repeatedly and the world is
   * counted before and after: a read that resolved a battle, judged one, wrote
   * an event or moved standing would move one of these numbers.
   */
  it("changes nothing when every battle surface is read repeatedly", async () => {
    const db = world.test.handle.db;
    const career = await careerOf(world);

    const census = async () => ({
      battles: (await db.select().from(battles).where(eq(battles.careerId, career.id)))
        .map((row) => `${row.id}:${row.status}:${row.decision ?? ""}`)
        .sort(),
      performances: (await db.select().from(battlePerformances)).length,
      judgements: (await db.select().from(battleJudgements)).length,
      events: (await db.select().from(gameEvents).where(eq(gameEvents.careerId, career.id)))
        .length,
      calendar: (await db.select().from(calendarItems).where(eq(calendarItems.careerId, career.id)))
        .length,
      messages: (await db.select().from(npcMessages)).length,
      relationships: (
        await db.select().from(relationships).where(eq(relationships.careerId, career.id))
      )
        .map((row) => `${row.subjectId}:${row.rivalry}:${row.respect}`)
        .sort(),
      standing: [career.fame, career.respect, career.heat, career.legacy].join(":"),
      date: career.currentGameDate.toISOString(),
    });

    const before = await census();

    for (let visit = 0; visit < 5; visit += 1) {
      await getPlayerBattle(db, career, world.battle.id);
      await getCareerBattleHistory(db, career);
      await getActiveBattle(db, career);
      await getBattleAwaitingAngle(db, career);
      await getCalendarBattles(db, career);
      await getDeclinedChallenges(db, career);
    }

    expect(await census()).toEqual(before);
  });

  /**
   * The same battle, read twice, is the same words twice.
   *
   * Determinism at the surface rather than in the engine. Every sentence is a
   * reading of a persisted decomposition, so a fresh render months later — or on
   * a newer engine — produces the same account of the same night.
   */
  it("reads the same battle the same way, every time", async () => {
    const career = await careerOf(world);
    const again = await getPlayerBattle(world.test.handle.db, career, world.battle.id);

    expect(JSON.stringify(again)).toBe(JSON.stringify(played));
  });

  /**
   * One battle, everywhere it appears.
   *
   * The drift test. Every surface must resolve to the same battle by the same
   * id, and none may construct its own representation — the night in the
   * notification, on the Calendar, on the route and in Career's memory is one
   * row read five times, not five readings of it.
   *
   * The failure this guards against is not a crash. It is a game that quietly
   * stops being about one world: a calendar entry naming a night the route
   * disagrees with, or Career remembering a result World never saw.
   */
  it("is the same battle, by the same id, on every surface", async () => {
    const db = world.test.handle.db;
    const career = await careerOf(world);

    const [history, calendar, notifications] = await Promise.all([
      getCareerBattleHistory(db, career),
      getCalendarBattles(db, career),
      getNotifications(db, career),
    ]);

    /* Career's memory of it. */
    const remembered = history.find((entry) => entry.id === world.battle.id);
    expect(remembered, "career history forgot the battle").toBeDefined();

    /* The Calendar's night points back at the same battle. */
    const booked = [...calendar.values()].find((entry) => entry.id === world.battle.id);
    expect(booked, "the night is not on the calendar").toBeDefined();
    expect(booked!.calendarItemId).toBe(remembered!.calendarItemId);

    /* The notification points at the same route, and does not spoil it. */
    const told = notifications.find((entry) => entry.href === played.href);
    expect(told, "nobody told the player the night had happened").toBeDefined();
    expect(told!.line).toContain(played.rival.name);
    expect(told!.line).not.toMatch(/won|lost|takes it|\d–\d/i);

    /*
     * And every surface agrees on the night and the result, field by field —
     * compared rather than assumed, because the failure being guarded against is
     * precisely surfaces that agree on the id and disagree on the night.
     */
    for (const surface of [remembered!, booked!]) {
      expect(surface.night.at.toISOString()).toBe(played.night.at.toISOString());
      expect(surface.rival.name).toBe(played.rival.name);
      expect(surface.decision?.tally).toBe(played.decision!.tally);
      expect(surface.decision?.headline).toBe(played.decision!.headline);
      expect(surface.href).toBe(played.href);
    }

    /*
     * World's record of it is the same event the battle came from. The feed
     * renders a label and a date and never the payload, so what is asserted is
     * that the public fact exists and is about this battle.
     */
    const publicRecord = (
      await db.select().from(gameEvents).where(eq(gameEvents.careerId, career.id))
    ).filter(
      (row) => row.eventType === "battle.resolved" && row.targetId === world.battle.id,
    );

    expect(publicRecord).toHaveLength(1);
    expect(publicRecord[0]!.visibility).toBe("LOCAL_PUBLIC");
  });

  /* --- World Control keeps everything -------------------------------------- */

  /**
   * The boundary, not the absence of the data.
   *
   * The inspector must still be able to answer "why did the Audience judge
   * disagree with the Technical judge" months later, and that question is only
   * answerable from exactly the numbers the player may never see. A milestone
   * that achieved the player boundary by deleting the decomposition would have
   * failed both halves.
   */
  it("leaves World Control able to see all of it", async () => {
    const dossiers = await getCareerBattles(world.test.handle.db, world.careerId);
    const dossier = dossiers.find((entry) => entry.battle.id === world.battle.id)!;

    expect(dossier).toBeDefined();
    expect(dossier.battle.seed).toBeTruthy();
    expect(dossier.battle.simulatorVersion).toBeTruthy();
    expect(dossier.performances.length).toBe(2);
    expect(dossier.performances[0]!.derivation.length).toBeGreaterThan(0);
    expect(dossier.judgements.length).toBe(3);

    for (const judgement of dossier.judgements) {
      expect(judgement.contributions.length).toBeGreaterThan(0);
      expect(judgement.engineVersion).toBeTruthy();
      expect(typeof judgement.margin).toBe("number");
    }

    /* And the causal chain is still walkable. */
    expect(dossier.events.length).toBeGreaterThan(0);
    expect(Object.keys(dossier.battle.consequences).length).toBeGreaterThan(0);
  });
});

/**
 * Turning somebody down.
 *
 * Verified against its own criterion rather than assumed, because getting this
 * wrong is the most likely way the milestone fails quietly. A career that
 * refuses everything is a career that made a decision, and nothing anywhere may
 * imply it made a mistake.
 */
describe("declining is a complete answer", () => {
  let test: TestContext;
  let user: Pick<UserRow, "id">;
  let careerId: string;
  let challengeId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "NOPEKX");

    const challenged = await liveUntilChallenged(test, user, { stageName: "NOPEKX" });
    careerId = challenged.careerId;
    challengeId = challenged.challenge.id;
  }, 600_000);

  afterAll(async () => {
    await test.close();
  });

  /**
   * A refusal creates no battle, so there is nothing to read.
   *
   * Asserted at the read model because that is where it would first go wrong: a
   * projection that produced a `PlayerBattle` with a `TURNED_DOWN` stage would
   * be one styling decision away from rendering a refusal as a defeat.
   */
  it("creates no battle, and nothing that counts one", async () => {
    const { declineBattleChallenge } = await import("@music-rpg/domain");

    unwrap(
      await declineBattleChallenge(test.ctx, {
        careerId,
        userId: user.id,
        opportunityId: challengeId,
      }),
    );

    const career = (await test.handle.db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
    const db = test.handle.db;

    /* No row, at the database. */
    expect(await db.select().from(battles).where(eq(battles.careerId, careerId))).toHaveLength(0);

    /* And therefore nothing for any battle surface to show. */
    expect(await getCareerBattleHistory(db, career)).toEqual([]);
    expect(await getActiveBattle(db, career)).toBeNull();
    expect(await getBattleAwaitingAngle(db, career)).toBeNull();
    expect([...(await getCalendarBattles(db, career)).keys()]).toEqual([]);

    /* The refusal is remembered, neutrally, and it is not a battle. */
    const declined = await getDeclinedChallenges(db, career);
    expect(declined).toHaveLength(1);
    expect(declined[0]!.id).toBe(challengeId);
  });

  /**
   * Nothing about it reads as a failure.
   *
   * The blunt acceptance test: a player who declines every challenge for an
   * entire career must never be shown anything implying they are playing the
   * game incorrectly. Checked as strings over everything the refusal produced,
   * because this is a copy failure before it is anything else.
   */
  it("says nothing that implies a mistake was made", async () => {
    const career = (await test.handle.db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
    const declined = await getDeclinedChallenges(test.handle.db, career);

    const prose = declined.map((entry) => entry.line).join(" ").toLowerCase();

    for (const banned of [
      "afraid",
      "scared",
      "coward",
      "backed down",
      "chickened",
      "ducked",
      "missed",
      "lost",
      "forfeit",
      "penalty",
      "next time",
      "should have",
    ]) {
      expect(prose, `declining was described as "${banned}"`).not.toContain(banned);
    }

    /* Nothing counts battles fought, declined or won. */
    expect(prose).not.toMatch(/\d+ (of|battles|challenges)/);
  });

  /**
   * Refusing costs no Respect, and the model is where that is kept.
   *
   * The interface is where this gets honoured or quietly reversed, so the
   * player-facing half asserts what the headless half already proves: a declined
   * challenge moves familiarity and tension, and cannot move respect in either
   * direction.
   */
  it("leaves respect exactly where it was", async () => {
    const db = test.handle.db;

    /*
     * A refusal becomes a relationship the way every interaction does — through
     * the fold, which the day advance runs. Called directly here so the
     * assertion is about what declining prices rather than about what else a day
     * of the world happened to do.
     */
    unwrap(await syncCareerRelationships(test.ctx, { careerId, userId: user.id }));

    /*
     * The rival's own relationship, found through the challenge that named them.
     * A career at this point also has a producer it has actually worked with,
     * and a test that took the first relationship with anything on it would be
     * asserting about LEX — which passes or fails for reasons that have nothing
     * to do with battles.
     */
    const challenge = (
      await db.select().from(opportunities).where(eq(opportunities.id, challengeId))
    )[0]!;

    const rows = await db
      .select()
      .from(relationships)
      .where(eq(relationships.careerId, careerId));

    const rival = rows.find((row) => row.subjectId === challenge.sourceEntityId);

    expect(rival, "refusing somebody should still be something that happened").toBeTruthy();

    /*
     * Familiarity and tension are permitted to move. Respect is not, in either
     * direction, and the empty entry in `BATTLE_INTERACTION_DIMENSIONS` is what
     * keeps it that way — "I don't battle" is a legitimate artist identity, and
     * a model that quietly taxed it would have decided otherwise on the player's
     * behalf.
     */
    expect(rival!.familiarity).toBeGreaterThan(0);
    expect(rival!.respect).toBe(0);

    /*
     * The person is a `RIVAL`, and that is correct rather than a penalty.
     * Somebody who called you out and has no collaborative history with you is
     * competition and nothing else, which is the rule M6 already applies — the
     * brief's own "a rival who was refused is a rival who remembers". The kind
     * is descriptive; it carries no respect movement and no implication that
     * refusing was a mistake.
     */
    expect(rival!.kind).toBe("RIVAL");
    expect(rival!.rivalry).toBeGreaterThan(0);
  });
});
