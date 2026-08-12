import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { npcMessages, type UserRow } from "@music-rpg/database";
import {
  advanceCareerDay,
  getCareerHome,
  getCareerView,
  getNPCConversations,
  getNotifications,
  getOfferTable,
} from "@music-rpg/domain";
import { unwrap, type OfferTable } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * Two careers, as they are actually experienced.
 *
 * The headless proof already showed that KXMO and BRIGHT diverge and that every
 * difference is reconstructible from recorded state. This asks the harder
 * question, which is a product question rather than a simulation one:
 *
 * > Does the *interface* make them feel like two different careers, and does it
 * > do that entirely through what arrives — never through what is withheld?
 *
 * That distinction is the whole test. An interface that leaks the director will
 * look almost identical for both careers with different numbers attached. BRIGHT
 * has no session invitation, and the correct player-facing consequence of that
 * is *nothing at all*: no locked card, no progress toward one, no explanation, no
 * hint that a session invitation is a thing that exists. Nothing is asked,
 * therefore nothing is displayed.
 */

/**
 * The same seed the headless golden proof uses.
 *
 * Deliberately not a new one. Reception is stochastic, so a different seed
 * produces a different pair of careers — still valid, but no longer *these*
 * careers, and this file exists to prove the specified pair is experienced
 * correctly rather than that some pair diverges.
 */
const SEED = "m7-golden";
const DAYS = 3;

type Career = {
  test: TestContext;
  careerId: string;
  user: UserRow;
  table: OfferTable;
  close: () => Promise<void>;
};

async function liveThrough(options: {
  stageName: string;
  title: string;
  producerSlug: string;
  strategy: "TEASE" | "DROP";
  friction: boolean;
  direction?: Record<string, unknown>;
}): Promise<Career> {
  const test = await createTestContext();
  const user = await createTestUser(test, options.stageName);

  const { careerId } = await makePublishedRelease(test, user, options.title, {
    stageName: options.stageName,
    producerSlug: options.producerSlug,
    strategy: options.strategy,
    friction: options.friction,
    ...(options.direction ? { direction: options.direction as never } : {}),
  });

  for (let day = 0; day < DAYS; day += 1) {
    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: SEED }));
  }

  const career = (await getCareerView(test.handle.db, careerId))!.career;

  return {
    test,
    careerId,
    user,
    table: await getOfferTable(test.handle.db, career),
    close: test.close,
  };
}

describe("KXMO and BRIGHT, as the player meets them", () => {
  let kxmo: Career;
  let bright: Career;

  beforeAll(async () => {
    kxmo = await liveThrough({
      stageName: "KXMO",
      title: "SCENE FIRST",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });

    bright = await liveThrough({
      stageName: "BRIGHT",
      title: "STRAIGHT OUT",
      producerSlug: "producer-zero",
      strategy: "DROP",
      friction: false,
      direction: {
        intention: "hit",
        moods: ["bright", "confident"],
        energy: 82,
        risk: 12,
        audience: "everyone",
        note: "Something people can sing back on the first listen.",
      },
    });
  }, 300_000);

  afterAll(async () => {
    await kxmo.close();
    await bright.close();
  });

  /* --- What arrives -------------------------------------------------------- */

  it("puts something on both tables, and not the same something", () => {
    expect(kxmo.table.count).toBeGreaterThan(0);
    expect(bright.table.count).toBeGreaterThan(0);

    const shapeOf = (career: Career) =>
      career.table.offers.map((offer) => `${offer.source.name}:${offer.headline}`).sort();

    expect(shapeOf(kxmo)).not.toEqual(shapeOf(bright));
  });

  /**
   * The clearest statement the world can make about where a career stands, and
   * it is made without a number appearing anywhere.
   *
   * One career is asked to carry a room. The other is only ever asked to open
   * one. A player reading these two screens learns exactly where they stand and
   * is never told a figure — which is the whole design.
   */
  it("asks one career to carry a room and the other only to open one", () => {
    const headlinesFor = (career: Career) =>
      career.table.offers
        .filter((offer) => offer.type === "SHOWCASE_SLOT")
        .map((offer) => offer.headline);

    expect(headlinesFor(kxmo)).toContain("Carrying the room");
    expect(new Set(headlinesFor(bright))).toEqual(new Set(["Opening the night"]));
    expect(headlinesFor(bright)).not.toContain("Carrying the room");
  });

  it("has somebody ask KXMO for another record, and nobody ask BRIGHT", () => {
    expect(kxmo.table.offers.some((offer) => offer.type === "SESSION_INVITE")).toBe(true);
    expect(bright.table.offers.some((offer) => offer.type === "SESSION_INVITE")).toBe(false);
  });

  /* --- What is not withheld ------------------------------------------------ */

  /**
   * The absence principle, asserted as an absence.
   *
   * BRIGHT is not shown a locked headline slot, a greyed session invitation, a
   * bar to fill, or any acknowledgement that either was considered. Everything
   * ZERO's silence means is expressed by ZERO not writing — and if that
   * discipline ever slips, it will slip as a helpful little hint, which is
   * exactly what these patterns look for.
   */
  it("tells BRIGHT nothing about what was never offered", async () => {
    const career = (await getCareerView(bright.test.handle.db, bright.careerId))!.career;

    const [home, conversations, notifications] = await Promise.all([
      getCareerHome(bright.test.handle.db, career),
      getNPCConversations(bright.test.handle.db, career),
      getNotifications(bright.test.handle.db, career),
    ]);

    const messages = await bright.test.handle.db.select().from(npcMessages);

    const everything = JSON.stringify({
      onTheTable: home.onTheTable,
      rightNow: home.rightNow,
      story: home.story,
      conversations: conversations.map((entry) => ({
        name: entry.character.name,
        offer: entry.offerWaiting,
        last: entry.lastMessage?.content,
      })),
      notifications,
      messages: messages.map((message) => message.content),
    }).toLowerCase();

    /*
     * Nothing may describe a door that did not open. These are the shapes a
     * leak takes in practice: a lock, a requirement, a threshold, or an
     * encouraging noise about what would unlock next.
     */
    const hints = [
      "locked",
      "unlock",
      "not eligible",
      "ineligible",
      "requires",
      "you need",
      "not enough",
      "too low",
      "keep going",
      "come back when",
      "chemistry",
      "scene standing",
      "no offers",
      "nothing available",
      "no session",
    ];

    for (const hint of hints) {
      expect(everything, `BRIGHT was told "${hint}"`).not.toContain(hint);
    }

    // And ZERO has not written at all about a session that was never proposed.
    const zeroSaid = conversations.find((entry) => entry.character.slug === "producer-zero");
    expect(zeroSaid?.offerWaiting ?? null).toBeNull();
  });

  /**
   * Both careers are experienced as people getting in touch.
   *
   * The offers are not a list the game produced; they are messages from named
   * promoters. Asserted for both careers because the fiction has to hold for the
   * quieter one too — BRIGHT's career is smaller, not more mechanical.
   */
  it("makes both careers arrive as people, not as a list", async () => {
    for (const career of [kxmo, bright]) {
      const row = (await getCareerView(career.test.handle.db, career.careerId))!.career;
      const conversations = await getNPCConversations(career.test.handle.db, row);

      const waiting = conversations.filter((entry) => entry.offerWaiting !== null);
      expect(waiting.length).toBeGreaterThan(0);

      for (const entry of waiting) {
        // A named person, with a thread, saying something in their own voice.
        expect(entry.character.name).toBeTruthy();
        expect(entry.lastMessage?.content ?? "").not.toBe("");
        expect(entry.offerWaiting!.source.name).toBe(entry.character.name);
      }
    }
  });

  /**
   * An empty table is an absent section, not an empty one.
   *
   * Checked at the read model, which is where the screen decides: `count === 0`
   * is the condition Home renders on, so a career with nothing waiting has no
   * offers section at all rather than one containing a polite apology.
   */
  it("gives Home nothing to render when nothing is being asked", async () => {
    const test = await createTestContext();
    const user = await createTestUser(test, "QUIET");

    try {
      // A career that has done nothing has been asked for nothing — except
      // Thabo's introduction, which is a real offer and correctly present.
      const made = await makePublishedRelease(test, user, "NOTHING YET", {
        stageName: "QUIET",
        producerSlug: "lex",
        strategy: "TEASE",
      });

      const career = (await getCareerView(test.handle.db, made.careerId))!.career;
      const home = await getCareerHome(test.handle.db, career);

      // No day has passed, so the director has never run and nothing generated
      // exists. Whatever is on the table is authored, and there is no empty
      // container either way.
      for (const offer of home.onTheTable.offers) {
        expect(offer.type).toBe("PRODUCER_INTRO");
      }
    } finally {
      await test.close();
    }
  }, 120_000);
});
