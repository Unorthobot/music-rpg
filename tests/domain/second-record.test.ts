import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarItems,
  creativeSessionParticipants,
  creativeSessions,
  eq,
  transactions,
  type UserRow,
} from "@music-rpg/database";
import {
  acceptOpportunity,
  advanceCareerDay,
  getCareerView,
  getOffer,
  getOfferStory,
  getOfferTable,
  getStudioHome,
  interpretCreativeDirection,
  renameTrack,
  requestMaster,
  runGenerationJobToCompletion,
  saveTrackToCatalogue,
  selectProducerProposal,
  setCreativeDirection,
  startCreativeSession,
} from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * The second record.
 *
 * This is the milestone's real gameplay consequence, and it is bigger than the
 * feature it arrives in. Booking a session has been gated on Thabo's one-time
 * introduction since M3, which quietly made the whole game a beautifully
 * simulated *first* record: a career could release, be received, build
 * relationships and accumulate history, and then had nowhere to go.
 *
 * What closes the loop is not a menu item. Somebody who rated the last record
 * asks for another one, and saying yes books a real session — the same
 * `creative_session` the introduction produces, seated with the same
 * participants, charged through the same ledger, on the same calendar, resumable
 * in the same Studio. A career can keep a catalogue now, and it gets there
 * through the world rather than through a button.
 */

const SEED = "m7-second";

describe("somebody asks for another record", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let inviteId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "KXMO");

    // The full first record, through the real commands. LEX, with friction in
    // the room, is the history that gives him a reason to want another.
    const made = await makePublishedRelease(test, user, "SCENE FIRST", {
      stageName: "KXMO",
      producerSlug: "lex",
      strategy: "TEASE",
      friction: true,
    });
    careerId = made.careerId;

    for (let day = 0; day < 3; day += 1) {
      unwrap(await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: SEED }));
    }
  }, 240_000);

  afterAll(async () => {
    await test.close();
  });

  const career = async () => (await getCareerView(test.handle.db, careerId))!.career;

  it("offers another session, from the producer who was actually in the room", async () => {
    const table = await getOfferTable(test.handle.db, await career());
    const invite = table.offers.find((offer) => offer.type === "SESSION_INVITE");

    expect(invite, "LEX never asked for another session").toBeDefined();
    inviteId = invite!.id;

    expect(invite!.source.name).toBe("LEX");
    // What it costs, and in which direction — a session is spent, not earned.
    expect(invite!.feeDirection).toBe("COSTS");
    expect(invite!.feeMinor).toBeGreaterThan(0);
    // In human language, with no type name in sight.
    expect(invite!.headline).toBe("Another session");
  });

  /**
   * The important assertion in the whole milestone.
   *
   * Not "a studio card appeared" — a real `creative_session`, with the producer
   * and the player seated on it, a ledger entry, and a calendar booking. If this
   * were a parallel implementation it would pass a shallower test and fail the
   * moment somebody tried to walk into the room.
   */
  it("books a real session through the studio's own path", async () => {
    const before = await test.handle.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.careerId, careerId));

    const balanceBefore = (await career()).moneyBalance;

    const accepted = unwrap(
      await acceptOpportunity(test.ctx, {
        careerId,
        userId: user.id,
        opportunityId: inviteId,
      }),
    );

    expect(accepted.sessionId, "accepting did not produce a session").toBeTruthy();

    const after = await test.handle.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.careerId, careerId));

    expect(after.length).toBe(before.length + 1);

    const session = after.find((row) => row.id === accepted.sessionId)!;
    expect(session.status).toBe("SCHEDULED");
    expect(session.purpose).toBe("TRACK");

    /* Charged through the ledger, once, with a balance that moved to match. */
    expect(session.transactionId).toBeTruthy();

    const ledger = await test.handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, session.transactionId!));

    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.direction).toBe("DEBIT");
    expect((await career()).moneyBalance).toBe(balanceBefore - session.costMinor);

    /* The producer is preserved, and so is the player's own attribution. */
    const seats = await test.handle.db
      .select()
      .from(creativeSessionParticipants)
      .where(eq(creativeSessionParticipants.sessionId, session.id));

    const roles = seats.map((seat) => seat.role).sort();
    expect(roles).toContain("PRODUCER");
    expect(roles).toContain("PRIMARY_ARTIST");

    /* And it is on the calendar as a studio booking. */
    const bookings = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.relatedEntityId, session.id));

    expect(bookings).toHaveLength(1);
    expect(bookings[0]!.type).toBe("STUDIO");

    /* The offer points at what it became, so causality reads forwards too. */
    const offer = (await getOffer(test.handle.db, await career(), inviteId))!;
    expect(offer.outcome).toBe("TAKEN");
    expect(offer.sessionId).toBe(session.id);
  });

  it("puts the session in the Studio, where it can be walked into", async () => {
    const studio = await getStudioHome(test.handle.db, await career());

    expect(studio.activeSession?.id).toBeTruthy();
    expect(studio.activeSession!.producerName).toBe("LEX");
  });

  /**
   * And a career can now actually make a second thing.
   *
   * Walked through the real M3 commands rather than asserted structurally,
   * because "the session exists" and "the session works" are different claims
   * and only the second one is the point of the milestone.
   */
  it("lets the player make a second track in it", async () => {
    const studio = await getStudioHome(test.handle.db, await career());
    const sessionId = studio.activeSession!.id;

    unwrap(await startCreativeSession(test.ctx, { sessionId, userId: user.id }));
    unwrap(
      await setCreativeDirection(test.ctx, {
        sessionId,
        userId: user.id,
        direction: {
          intention: "story",
          moods: ["tense", "melancholic"],
          energy: 44,
          risk: 62,
          audience: "scene",
          note: "The follow-up. Same city, later.",
        },
      }),
    );

    const { proposals } = unwrap(
      await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
    );

    const chosen = unwrap(
      await selectProducerProposal(test.ctx, {
        sessionId,
        userId: user.id,
        proposalId: proposals[0]!.id,
      }),
    );

    const rendered = unwrap(
      await runGenerationJobToCompletion(test.ctx, { jobId: chosen.jobId, userId: user.id }),
    );

    const master = unwrap(
      await requestMaster(test.ctx, {
        sessionId,
        userId: user.id,
        versionId: rendered.version!.id,
      }),
    );
    unwrap(await runGenerationJobToCompletion(test.ctx, { jobId: master.jobId, userId: user.id }));

    unwrap(await renameTrack(test.ctx, { sessionId, userId: user.id, title: "SECOND CITY" }));
    unwrap(await saveTrackToCatalogue(test.ctx, { sessionId, userId: user.id }));

    // Two tracks, from two sessions, in one catalogue. This is the thing the
    // persistent-career architecture was built for and could not do until now.
    const finished = await getStudioHome(test.handle.db, await career());
    expect(finished.tracks.map((track) => track.title)).toEqual(
      expect.arrayContaining(["SCENE FIRST", "SECOND CITY"]),
    );
  }, 120_000);

  it("remembers going back in as its own thing in the story", async () => {
    const story = await getOfferStory(test.handle.db, await career());
    const entry = story.find((row) => row.id === inviteId);

    expect(entry, "history forgot the session invitation").toBeDefined();
    expect(entry!.outcome).toBe("TAKEN");
    expect(entry!.line).toContain("LEX");
    // A session read differently from a night: you went back in, you did not
    // headline anything.
    expect(entry!.line).not.toMatch(/headlined|opened/i);
  });
});
