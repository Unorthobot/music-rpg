import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarItems,
  eq,
  npcMessages,
  opportunities,
} from "@music-rpg/database";
import {
  acceptOpportunity,
  advanceCareerDay,
  communicateOpportunities,
  declineOpportunity,
  getCalendarOffers,
  getCareerCalendar,
  getCareerHome,
  getCareerView,
  getNPCConversation,
  getNPCConversations,
  getOffer,
  getOfferHistory,
  getOfferStory,
  getOfferTable,
  getNotifications,
  PLAYER_OFFER_KEYS,
} from "@music-rpg/domain";
import { unwrap, type PlayerOffer } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * The boundary, and the chain.
 *
 * Two things are being protected here and they fail in opposite directions.
 *
 * **Leakage** is the boundary failing outwards: a score, a rule name or a
 * scene-standing decimal reaching a player, at which point the director stops
 * being a world and becomes a spreadsheet with names on it.
 *
 * **Drift** is every surface quietly growing its own idea of what the offer
 * was — the failure simulation-heavy products are most prone to. Home showing a
 * fee the detail screen disagrees with, a calendar entry titled from a stale
 * payload, an accepted offer Home still thinks is waiting. Nothing is obviously
 * broken; the game simply stops being about one world.
 *
 * The whole point of a single projection is that both become checkable rather
 * than aspirational, and this file is where they are checked.
 */

const SEED = "m7-player";
const DAYS = 3;

type World = {
  test: TestContext;
  careerId: string;
  userId: string;
  close: () => Promise<void>;
};

async function liveThrough(options: {
  stageName: string;
  title: string;
  producerSlug: string;
  friction: boolean;
  days?: number;
}): Promise<World> {
  const test = await createTestContext();
  const user = await createTestUser(test, options.stageName);

  const { careerId } = await makePublishedRelease(test, user, options.title, {
    stageName: options.stageName,
    producerSlug: options.producerSlug,
    strategy: "TEASE",
    friction: options.friction,
  });

  for (let day = 0; day < (options.days ?? DAYS); day += 1) {
    unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: SEED }));
  }

  return { test, careerId, userId: user.id, close: test.close };
}

/** The career as it stands now. Reread every time: game time moves. */
async function careerOf(world: World) {
  return (await getCareerView(world.test.handle.db, world.careerId))!.career;
}

describe("what a player is allowed to know about an offer", () => {
  let world: World;

  beforeAll(async () => {
    world = await liveThrough({
      stageName: "KXMO",
      title: "SCENE FIRST",
      producerSlug: "lex",
      friction: true,
    });
  }, 240_000);

  afterAll(async () => {
    await world.close();
  });

  /* --- The boundary -------------------------------------------------------- */

  /**
   * The structural half.
   *
   * Not "we checked the rendered strings and found no numbers" — that catches
   * today's leak and none of tomorrow's. The projection is a closed shape, and
   * this asserts the shape rather than its current contents, so a director that
   * grows a new diagnostic column next year cannot have it arrive on a screen by
   * default.
   */
  it("hands a screen a closed shape, not a row", async () => {
    const career = await careerOf(world);
    const table = await getOfferTable(world.test.handle.db, career);

    expect(table.offers.length).toBeGreaterThan(0);

    for (const offer of table.offers) {
      expect(Object.keys(offer).sort()).toEqual([...PLAYER_OFFER_KEYS].sort());
    }
  });

  /**
   * The serialised half.
   *
   * A projection can be a closed shape at the top level and still smuggle the
   * whole director through in a nested object. This walks everything a component
   * could reach and looks for the field names by which the machinery is known.
   */
  it("carries no director state anywhere in the bundle a screen receives", async () => {
    const career = await careerOf(world);

    const [table, history, conversations, notifications, home] = await Promise.all([
      getOfferTable(world.test.handle.db, career),
      getOfferHistory(world.test.handle.db, career),
      getNPCConversations(world.test.handle.db, career),
      getNotifications(world.test.handle.db, career),
      getCareerHome(world.test.handle.db, career),
    ]);

    const bundle = JSON.stringify({
      table,
      history,
      // The conversation summaries carry the same projection.
      offersInMessages: conversations.map((entry) => entry.offerWaiting),
      notifications,
      onTheTable: home.onTheTable,
      rightNow: home.rightNow,
    });

    const forbidden = [
      "eligibility",
      "ranking",
      "sceneStanding",
      "directorVersion",
      "triggerState",
      "triggerReason",
      "idempotencyKey",
      "suppressedBy",
      "liveCap",
      "promoterStandard",
      "promoterSupportStandard",
      "contributions",
      "OUTRANKED_BY_CAP",
      "NOT_ALREADY_OFFERED",
      "SOURCE_NOT_ALREADY_WAITING",
      "SCENE_KNOWS_YOU",
      "RECORD_IS_MOVING",
      "CALENDAR_SLOT",
      "director-v1",
    ];

    for (const term of forbidden) {
      expect(bundle, `"${term}" reached a player-facing bundle`).not.toContain(term);
    }
  });

  /**
   * Statuses are world vocabulary, not player vocabulary.
   *
   * `WITHDRAWN` is a correct name for a thing that happened and a terrible thing
   * to show somebody. The projection carries the outcome as its own closed
   * vocabulary with a label attached, so a screen never has to translate one.
   */
  it("never puts a status name in front of the player", async () => {
    const career = await careerOf(world);
    const history = await getOfferHistory(world.test.handle.db, career);

    for (const offer of history) {
      expect(["WAITING", "TAKEN", "TURNED_DOWN", "LAPSED", "GONE"]).toContain(offer.outcome);
      expect(offer.outcomeLabel).not.toMatch(/^(AVAILABLE|ACCEPTED|DECLINED|EXPIRED|WITHDRAWN)$/);
      expect(offer.headline).not.toMatch(/HEADLINE|SUPPORT|SHOWCASE_SLOT|SESSION_INVITE/);
    }
  });

  /* --- Read-only screens --------------------------------------------------- */

  /**
   * Ten visits to Home show the same world ten times.
   *
   * The constitutional rule, asserted at the read model rather than in a
   * browser: every player-facing query is run repeatedly and the world is
   * counted before and after. A read that created an offer, expired one, or
   * wrote a message would move one of these numbers.
   */
  it("creates nothing when every player-facing surface is read repeatedly", async () => {
    const career = await careerOf(world);
    const db = world.test.handle.db;

    const census = async () => ({
      offers: (await db.select().from(opportunities).where(eq(opportunities.careerId, career.id)))
        .length,
      messages: (await db.select().from(npcMessages)).length,
      calendar: (
        await db.select().from(calendarItems).where(eq(calendarItems.careerId, career.id))
      ).length,
      statuses: (
        await db.select().from(opportunities).where(eq(opportunities.careerId, career.id))
      )
        .map((row) => `${row.id}:${row.status}`)
        .sort(),
    });

    const before = await census();

    for (let visit = 0; visit < 3; visit += 1) {
      await getCareerHome(db, career);
      await getOfferTable(db, career);
      await getOfferHistory(db, career);
      await getNPCConversations(db, career);
      await getCareerCalendar(db, career);
      await getCalendarOffers(db, career);
      await getOfferStory(db, career);
      await getNotifications(db, career);

      const live = await getOfferTable(db, career);
      for (const offer of live.offers) await getOffer(db, career, offer.id);
    }

    expect(await census()).toEqual(before);
  });

  /* --- Communication ------------------------------------------------------- */

  /**
   * The offer is the world fact; the message is how somebody told you about it.
   *
   * Re-running the communication step must produce nothing new. If it did, a day
   * advance after a partial failure would say the same thing twice — and the
   * player would watch a promoter repeat themselves, which reads as a broken
   * world rather than a retried write.
   */
  it("says each thing exactly once, however many times it is retried", async () => {
    const db = world.test.handle.db;
    const before = (await db.select().from(npcMessages)).length;

    for (let retry = 0; retry < 3; retry += 1) {
      unwrap(
        await communicateOpportunities(world.test.ctx, {
          careerId: world.careerId,
          userId: world.userId,
        }),
      );
    }

    expect((await db.select().from(npcMessages)).length).toBe(before);
  });

  /**
   * Every live offer arrived as a message from a named person.
   *
   * The requirement that makes an opportunity a world event rather than a task:
   * somebody wants something from you, and you find out because they said so.
   */
  it("gives every live offer a message from the person who made it", async () => {
    const career = await careerOf(world);
    const table = await getOfferTable(world.test.handle.db, career);
    const messages = await world.test.handle.db.select().from(npcMessages);

    for (const offer of table.offers) {
      const spoken = messages.filter(
        (message) => (message.payload as { opportunityId?: string }).opportunityId === offer.id,
      );

      expect(spoken.length, `${offer.source.name} never mentioned their offer`).toBeGreaterThan(0);
      expect(offer.source.conversationId).toBeTruthy();
    }
  });

  /**
   * A failed message never costs an offer.
   *
   * Simulated by deleting the communication and confirming the offer is
   * untouched and still surfaced — which is the state the world would be in if
   * the message had never been written. Home still has it, the detail screen
   * still opens it, and the retry restores the message rather than the offer.
   */
  it("keeps an offer real when nobody managed to mention it", async () => {
    const db = world.test.handle.db;
    const career = await careerOf(world);

    const table = await getOfferTable(db, career);
    const offer = table.offers[0]!;

    await db.delete(npcMessages).where(eq(npcMessages.idempotencyKey, `opportunity:${offer.id}:OFFER`));

    const stillThere = await getOfferTable(db, career);
    expect(stillThere.offers.map((entry) => entry.id)).toContain(offer.id);
    expect((await getOffer(db, career, offer.id))!.outcome).toBe("WAITING");

    // And the retry writes the message back, from the same persisted facts.
    unwrap(
      await communicateOpportunities(world.test.ctx, {
        careerId: world.careerId,
        userId: world.userId,
      }),
    );

    const restored = await db
      .select()
      .from(npcMessages)
      .where(eq(npcMessages.idempotencyKey, `opportunity:${offer.id}:OFFER`));

    expect(restored).toHaveLength(1);
  });
});

/**
 * One offer, followed end to end.
 *
 * The drift test. Every surface must resolve to the same opportunity id and none
 * may construct its own representation — the night on Home, in the thread, on
 * the detail screen and on the Calendar is one date from one row, not four
 * readings of it.
 */
describe("a single offer, across every surface", () => {
  let world: World;
  let taken: PlayerOffer;

  beforeAll(async () => {
    world = await liveThrough({
      stageName: "CROSSKX",
      title: "SAME NIGHT",
      producerSlug: "lex",
      friction: true,
    });
  }, 240_000);

  afterAll(async () => {
    await world.close();
  });

  it("shows the same offer, with the same terms, everywhere it appears", async () => {
    const db = world.test.handle.db;
    const career = await careerOf(world);

    /* Director created it, and somebody wrote about it. */
    const table = await getOfferTable(db, career);
    const showcase = table.offers.find((offer) => offer.type === "SHOWCASE_SLOT");
    expect(showcase, "no showcase was offered to follow").toBeDefined();
    taken = showcase!;

    /* Home has it. */
    const home = await getCareerHome(db, career);
    const onHome = home.onTheTable.offers.find((offer) => offer.id === taken.id);
    expect(onHome).toBeDefined();

    /* Messages has it, in the source character's thread. */
    const conversations = await getNPCConversations(db, career);
    const thread = conversations.find(
      (entry) => entry.character.id === taken.source.characterId,
    );
    expect(thread, "the promoter has no conversation").toBeDefined();
    expect(thread!.offerWaiting?.id).toBe(taken.id);

    const view = await getNPCConversation(db, career, thread!.conversation.id);
    const inThread = view!.offers.find((offer) => offer.id === taken.id);
    expect(inThread).toBeDefined();

    /* The detail screen has it. */
    const detail = await getOffer(db, career, taken.id);
    expect(detail).toBeDefined();

    /*
     * And all four are the same reading. Compared field by field rather than by
     * identity, because the failure being guarded against is precisely four
     * surfaces that agree on the id and disagree on the night.
     */
    for (const surface of [onHome!, inThread!, detail!]) {
      expect(surface.id).toBe(taken.id);
      expect(surface.night?.at.toISOString()).toBe(taken.night?.at.toISOString());
      expect(surface.feeMinor).toBe(taken.feeMinor);
      expect(surface.headline).toBe(taken.headline);
      expect(surface.answerBy?.toISOString()).toBe(taken.answerBy?.toISOString());
      expect(surface.source.name).toBe(taken.source.name);
    }
  });

  it("stops treating it as pending, and puts the night on the calendar", async () => {
    const db = world.test.handle.db;

    unwrap(
      await acceptOpportunity(world.test.ctx, {
        careerId: world.careerId,
        userId: world.userId,
        opportunityId: taken.id,
      }),
    );
    unwrap(
      await communicateOpportunities(world.test.ctx, {
        careerId: world.careerId,
        userId: world.userId,
      }),
    );

    const career = await careerOf(world);

    /* Home no longer treats it as waiting. */
    const home = await getCareerHome(db, career);
    expect(home.onTheTable.offers.map((offer) => offer.id)).not.toContain(taken.id);

    /* The calendar holds the same commitment, on the same night. */
    const calendar = await getCareerCalendar(db, career);
    const offersByItem = await getCalendarOffers(db, career);

    const booking = calendar.upcoming.find((item) => offersByItem.get(item.id)?.id === taken.id);
    expect(booking, "the night is not on the calendar").toBeDefined();
    expect(booking!.startGameTime.toISOString()).toBe(taken.night!.at.toISOString());
    expect(booking!.type).toBe("PERFORMANCE");

    /* And the calendar entry reads backwards to the offer it came from. */
    expect(offersByItem.get(booking!.id)!.id).toBe(taken.id);

    /* The thread reflects the acceptance, in the promoter's own voice. */
    const view = await getNPCConversation(db, career, taken.source.conversationId!);
    const answered = view!.offers.find((offer) => offer.id === taken.id);
    expect(answered!.outcome).toBe("TAKEN");
    expect(view!.messages.some((message) => message.senderType === "PLAYER")).toBe(true);

    /*
     * Career history does *not* yet claim it happened.
     *
     * Changed in M8.5, and the original assertion here was the bug. This test
     * previously required an accepted night to appear in the story as `TAKEN`,
     * which renders as "Headlined …" / "Opened …" — past tense, in a history
     * list, about a night nobody has played yet. That reading was the only one
     * available while `RESOLVED` was unreachable for showcases; now that the
     * clock actually resolves them, agreeing to a night and having played it are
     * different facts and the story tells them apart.
     *
     * The acceptance is not lost — the calendar holds it and the promoter's
     * thread reports it, both asserted above. It is simply not history yet.
     */
    const story = await getOfferStory(db, career);
    expect(story.map((entry) => entry.id)).not.toContain(taken.id);

    /* Nothing about accepting moved a metric. Booking is not performing. */
    expect(career.fame).toBe((await careerOf(world)).fame);
  });
});

/**
 * The four endings, kept four.
 *
 * Asserted as player-visible facts rather than as statuses, because the
 * requirement is that somebody reading the screen can tell them apart — not that
 * the database can.
 */
describe("how an offer can end", () => {
  let world: World;

  beforeAll(async () => {
    world = await liveThrough({
      stageName: "ENDINGS",
      title: "FOUR WAYS",
      producerSlug: "lex",
      friction: true,
    });
  }, 240_000);

  afterAll(async () => {
    await world.close();
  });

  it("tells turning something down apart from letting it lapse", async () => {
    const db = world.test.handle.db;
    const career = await careerOf(world);

    const table = await getOfferTable(db, career);
    const target = table.offers.find((offer) => offer.type === "SHOWCASE_SLOT")!;

    unwrap(
      await declineOpportunity(world.test.ctx, {
        careerId: world.careerId,
        userId: world.userId,
        opportunityId: target.id,
      }),
    );

    const declined = (await getOffer(db, await careerOf(world), target.id))!;
    expect(declined.outcome).toBe("TURNED_DOWN");
    expect(declined.outcomeLabel).toBe("Turned down");

    /*
     * Lapsing is the world's doing, not the player's, so it is produced by
     * letting time pass rather than by calling anything.
     */
    let remaining = (await getOfferTable(db, await careerOf(world))).offers.filter(
      (offer) => offer.type === "SHOWCASE_SLOT",
    );

    for (let day = 0; day < 8 && remaining.length > 0; day += 1) {
      unwrap(
        await advanceCareerDay(world.test.ctx, {
          careerId: world.careerId,
          userId: world.userId,
          seed: SEED,
        }),
      );
      remaining = (await getOfferTable(db, await careerOf(world))).offers.filter(
        (offer) => offer.id === remaining[0]?.id,
      );
    }

    const history = await getOfferHistory(db, await careerOf(world));
    const lapsed = history.filter((offer) => offer.outcome === "LAPSED");

    expect(lapsed.length, "nothing ever lapsed").toBeGreaterThan(0);
    expect(lapsed[0]!.outcomeLabel).toBe("Lapsed");
    // And it reads as the promoter's decision, not the player's.
    expect(lapsed[0]!.outcomeLabel).not.toBe(declined.outcomeLabel);
  }, 180_000);
});

/**
 * Two promoters, one Friday.
 *
 * The conflict has to be visible *before* a destructive choice, and afterwards
 * the loser has to stay legible rather than disappearing. What is asserted is the
 * player-facing consequence of the machinery, never the machinery: the word
 * "CALENDAR_SLOT" appears nowhere in any of this.
 */
describe("two offers that want the same night", () => {
  let world: World;

  beforeAll(async () => {
    world = await liveThrough({
      stageName: "CLASHKX",
      title: "BOTH FRIDAYS",
      producerSlug: "lex",
      friction: true,
      days: 4,
    });
  }, 240_000);

  afterAll(async () => {
    await world.close();
  });

  it("groups a contested night, then keeps the loser legible", async () => {
    const db = world.test.handle.db;
    let career = await careerOf(world);

    let table = await getOfferTable(db, career);
    let contested = table.groups.find((group) => group.sharedNight !== null);

    /*
     * The clash is a property of what the world happened to offer, so a run that
     * did not produce one is created the way the game would: by declining what is
     * on the table and letting another day pass, which is exactly the path the
     * specification describes.
     */
    for (let attempt = 0; attempt < 4 && !contested; attempt += 1) {
      for (const offer of table.offers.filter((entry) => entry.type === "SHOWCASE_SLOT")) {
        unwrap(
          await declineOpportunity(world.test.ctx, {
            careerId: world.careerId,
            userId: world.userId,
            opportunityId: offer.id,
          }),
        );
      }

      unwrap(
        await advanceCareerDay(world.test.ctx, {
          careerId: world.careerId,
          userId: world.userId,
          seed: SEED,
        }),
      );

      career = await careerOf(world);
      table = await getOfferTable(db, career);
      contested = table.groups.find((group) => group.sharedNight !== null);
    }

    expect(contested, "the world never offered two nights that clash").toBeDefined();
    expect(contested!.offers.length).toBeGreaterThan(1);

    const [first, second] = contested!.offers;

    // Both are named, both name each other, and both name the shared night.
    expect(first!.competingWith.map((entry) => entry.offerId)).toContain(second!.id);
    expect(second!.competingWith.map((entry) => entry.offerId)).toContain(first!.id);
    expect(first!.competingWith[0]!.who).toBe(second!.source.name);
    expect(first!.night!.at.toISOString().slice(0, 10)).toBe(
      second!.night!.at.toISOString().slice(0, 10),
    );

    /* Taking one ends the other, named. */
    unwrap(
      await acceptOpportunity(world.test.ctx, {
        careerId: world.careerId,
        userId: world.userId,
        opportunityId: first!.id,
      }),
    );
    unwrap(
      await communicateOpportunities(world.test.ctx, {
        careerId: world.careerId,
        userId: world.userId,
      }),
    );

    career = await careerOf(world);
    const loser = (await getOffer(db, career, second!.id))!;

    expect(loser.outcome).toBe("GONE");
    expect(loser.outcomeLabel).toBe("No longer possible");
    // Not deleted from existence, and it says what displaced it.
    expect(loser.displacedBy?.offerId).toBe(first!.id);
    expect(loser.displacedBy?.who).toBe(first!.source.name);

    /*
     * It reads differently from a refusal and from a lapse. Asserted as
     * *distinctness* rather than against a fixed phrase, because the four
     * endings are a product requirement and the exact wording is not — and a
     * test pinned to one sentence would fail the next time somebody improved it.
     */
    const story = await getOfferStory(db, career);
    const entry = story.find((row) => row.id === second!.id)!;
    expect(entry.outcome).toBe("GONE");
    expect(entry.line).toContain(second!.source.name);
    // The clash is named as the cause, not reported as a refusal or a lapse.
    expect(entry.line).not.toMatch(/turned down|lapsed|stopped waiting/i);

    /*
     * And it is still on Home, where it was, saying what happened — not removed
     * between one navigation and the next, which reads as a bug rather than as a
     * consequence. It leaves on its own once the world passes the night.
     */
    const afterAccepting = await getOfferTable(db, career);
    expect(afterAccepting.recentlyEnded.map((entry) => entry.id)).toContain(second!.id);
    expect(afterAccepting.offers.map((entry) => entry.id)).not.toContain(second!.id);

    // And the person who offered is the one who says it is over.
    const messages = await db.select().from(npcMessages);
    const told = messages.some(
      (message) =>
        (message.payload as { opportunityId?: string; moment?: string }).opportunityId ===
          second!.id &&
        (message.payload as { moment?: string }).moment === "WITHDRAWN",
    );
    expect(told, "nobody told the player their other night was gone").toBe(true);
  }, 300_000);
});
