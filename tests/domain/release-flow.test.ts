import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarItems,
  careerMemories,
  careers,
  eq,
  releases,
  tracks,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType, listCareerEvents } from "@music-rpg/events";
import {
  cancelRelease,
  chooseReleaseFormat,
  getCareerCounters,
  getCatalogue,
  keepTrackPrivate,
  planRelease,
  publishRelease,
  scheduleRelease,
  setReleaseStrategy,
} from "@music-rpg/domain";
import { availableFormats, unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makeFinishedTrack } from "../helpers/studio";

/**
 * M4 — deciding whether the world gets it.
 *
 * The rule this suite exists to protect: releasing is a decision about work
 * that already exists. Nothing here creates a track or a version, and nothing
 * here moves an audience — that is M5's, and inventing it would be the fake
 * state we've refused everywhere else.
 */
describe("releases", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let trackId: string;
  let releaseId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
    const made = await makeFinishedTrack(test, user, "NO RECEPTION");
    careerId = made.careerId;
    trackId = made.trackId;
  });

  afterAll(async () => {
    await test.close();
  });

  it("starts from finished, unreleased work that nobody has heard", async () => {
    const [trackRow] = await test.handle.db.select().from(tracks).where(eq(tracks.id, trackId));
    const counters = await getCareerCounters(test.handle.db, { id: careerId });

    expect(trackRow!.status).toBe("UNRELEASED");
    expect(trackRow!.currentMasterVersionId).toBeTruthy();
    expect(trackRow!.releasedAt).toBeNull();
    expect(counters.catalogue).toBe(1);
    expect(counters.releases).toBe(0);
    expect(counters.fans).toBe(0);
  });

  it("offers an Underground career a loose track or a single, and nothing else", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const catalogue = await getCatalogue(test.ctx, career!);

    const open = catalogue.formats.filter((format) => format.available).map((f) => f.format);
    expect(open.sort()).toEqual(["LOOSE_TRACK", "SINGLE"]);

    // Locked formats say why, rather than hiding.
    const album = catalogue.formats.find((format) => format.format === "ALBUM")!;
    expect(album.available).toBe(false);
    expect(album.lockedReason).toBeTruthy();
  });

  it("refuses an album to a one-track career", async () => {
    const result = await planRelease(test.ctx, {
      careerId,
      userId: user.id,
      trackId,
      format: "ALBUM",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/stage of your career|at least/i);
  });

  it("records keeping a track private as a decision", async () => {
    const kept = unwrap(await keepTrackPrivate(test.ctx, { careerId, userId: user.id, trackId }));

    expect(kept.keptPrivateAt).toBeTruthy();
    expect(kept.status).toBe("UNRELEASED");

    const events = await listCareerEvents(test.handle.db, careerId);
    expect(events.map((event) => event.eventType)).toContain(GameEventType.TrackKeptPrivate);
  });

  it("plans a release, and planning twice returns the same plan", async () => {
    const first = unwrap(
      await planRelease(test.ctx, { careerId, userId: user.id, trackId, format: "SINGLE" }),
    );
    const second = unwrap(await planRelease(test.ctx, { careerId, userId: user.id, trackId }));

    releaseId = first.release.id;

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.release.id).toBe(releaseId);
    expect(first.release.status).toBe("PLANNED");
    expect(first.release.strategy).toBe("DROP");

    const rows = await test.handle.db
      .select()
      .from(releases)
      .where(eq(releases.careerId, careerId));
    expect(rows.filter((row) => row.status === "PLANNED")).toHaveLength(1);

    // Planning clears a previous decision to keep it back.
    const [trackRow] = await test.handle.db.select().from(tracks).where(eq(tracks.id, trackId));
    expect(trackRow!.keptPrivateAt).toBeNull();
  });

  it("refuses strategies the career can't support yet, with the reason", async () => {
    const performing = await setReleaseStrategy(test.ctx, {
      careerId,
      userId: user.id,
      releaseId,
      strategy: "PERFORM_FIRST",
      capabilities: [],
    });
    expect(performing.ok).toBe(false);
    if (!performing.ok) expect(performing.error.message).toMatch(/room to play/i);

    const sending = await setReleaseStrategy(test.ctx, {
      careerId,
      userId: user.id,
      releaseId,
      strategy: "SEND_AROUND",
      capabilities: [],
    });
    expect(sending.ok).toBe(false);
    if (!sending.ok) expect(sending.error.message).toMatch(/anyone to send/i);
  });

  it("records the strategy's modifiers without applying them", async () => {
    const updated = unwrap(
      await setReleaseStrategy(test.ctx, {
        careerId,
        userId: user.id,
        releaseId,
        strategy: "TEASE",
      }),
    );

    expect(updated.strategy).toBe("TEASE");
    expect(updated.audienceModifiers.anticipation).toBeGreaterThan(0);

    // The modifiers are for M5. Nothing about the career moved.
    const counters = await getCareerCounters(test.handle.db, { id: careerId });
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    expect(counters.fans).toBe(0);
    expect(career!.fame).toBe(0);
    expect(career!.respect).toBe(0);
    expect(career!.heat).toBe(0);
  });

  it("holds a teased release to its lead time", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    const tooSoon = await scheduleRelease(test.ctx, {
      careerId,
      userId: user.id,
      releaseId,
      scheduledGameTime: career!.currentGameDate,
    });

    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.error.message).toMatch(/needs 3 days/i);
  });

  it("schedules the release onto the calendar", async () => {
    const scheduled = unwrap(await scheduleRelease(test.ctx, { careerId, userId: user.id, releaseId }));

    expect(scheduled.release.status).toBe("SCHEDULED");
    expect(scheduled.release.scheduledGameTime).toBeTruthy();

    const [trackRow] = await test.handle.db.select().from(tracks).where(eq(tracks.id, trackId));
    expect(trackRow!.status).toBe("SCHEDULED");
    expect(trackRow!.releasedAt).toBeNull();

    const [item] = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.relatedEntityId, releaseId));
    expect(item!.type).toBe("RELEASE");
    expect(item!.status).toBe("SCHEDULED");
  });

  it("can be pulled before it goes out, without scrapping the work", async () => {
    const cancelled = unwrap(
      await cancelRelease(test.ctx, { careerId, userId: user.id, releaseId, reason: "Not ready." }),
    );
    expect(cancelled.status).toBe("CANCELLED");

    const [trackRow] = await test.handle.db.select().from(tracks).where(eq(tracks.id, trackId));
    expect(trackRow!.status).toBe("UNRELEASED");
    expect(trackRow!.currentMasterVersionId).toBeTruthy();

    const [item] = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.relatedEntityId, releaseId));
    expect(item!.status).toBe("CANCELLED");

    // …and the work can be planned again afterwards.
    const replanned = unwrap(
      await planRelease(test.ctx, { careerId, userId: user.id, trackId, format: "SINGLE" }),
    );
    expect(replanned.created).toBe(true);
    releaseId = replanned.release.id;
  });

  it("refuses to publish something that was never scheduled", async () => {
    const result = await publishRelease(test.ctx, { careerId, userId: user.id, releaseId });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CAREER_STATE");
  });

  it("puts the record into the world", async () => {
    unwrap(
      await setReleaseStrategy(test.ctx, { careerId, userId: user.id, releaseId, strategy: "DROP" }),
    );
    unwrap(await scheduleRelease(test.ctx, { careerId, userId: user.id, releaseId }));

    const published = unwrap(await publishRelease(test.ctx, { careerId, userId: user.id, releaseId }));

    expect(published.alreadyPublished).toBe(false);
    expect(published.release.status).toBe("RELEASED");
    expect(published.release.releasedGameTime).toBeTruthy();
    expect(published.track!.status).toBe("RELEASED");
    expect(published.track!.releasedAt).toBeTruthy();

    const counters = await getCareerCounters(test.handle.db, { id: careerId });
    expect(counters.releases).toBe(1);
    expect(counters.catalogue).toBe(1);

    const [item] = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.relatedEntityId, releaseId));
    expect(item!.status).toBe("COMPLETED");
  });

  it("leaves the audience exactly where it was", async () => {
    const counters = await getCareerCounters(test.handle.db, { id: careerId });
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    // It is out. Nobody has reacted. That is M5's job, and it hasn't run.
    expect(counters.fans).toBe(0);
    expect(counters.monthlyListeners).toBe(0);
    expect(career!.fame).toBe(0);
    expect(career!.respect).toBe(0);
    expect(career!.heat).toBe(0);
    expect(career!.legacy).toBe(0);
  });

  it("is visible to the world as a local public event carrying M5's inputs", async () => {
    const events = await listCareerEvents(test.handle.db, careerId);
    const published = events.filter((event) => event.eventType === GameEventType.ReleasePublished);

    expect(published).toHaveLength(1);
    expect(published[0]!.visibility).toBe("LOCAL_PUBLIC");

    const payload = published[0]!.payload as {
      title: string;
      strategy: string;
      audienceModifiers: Record<string, number>;
    };
    expect(payload.title).toBe("NO RECEPTION");
    expect(payload.strategy).toBe("DROP");
    // Recorded for the simulator to read, not acted on here.
    expect(payload.audienceModifiers).toBeDefined();
  });

  it("remembers it", async () => {
    const memories = await test.handle.db
      .select()
      .from(careerMemories)
      .where(eq(careerMemories.careerId, careerId));

    const release = memories.find((memory) => memory.kind === "FIRST_RELEASE");
    expect(release?.summary).toContain("NO RECEPTION");
    expect(release?.sourceEventId).toBeTruthy();
  });

  it("publishing twice changes nothing", async () => {
    const again = unwrap(await publishRelease(test.ctx, { careerId, userId: user.id, releaseId }));
    expect(again.alreadyPublished).toBe(true);

    const events = await listCareerEvents(test.handle.db, careerId);
    expect(
      events.filter((event) => event.eventType === GameEventType.ReleasePublished),
    ).toHaveLength(1);

    const memories = await test.handle.db
      .select()
      .from(careerMemories)
      .where(eq(careerMemories.careerId, careerId));
    expect(memories.filter((memory) => memory.kind === "FIRST_RELEASE")).toHaveLength(1);

    const counters = await getCareerCounters(test.handle.db, { id: careerId });
    expect(counters.releases).toBe(1);
  });

  it("refuses to unrelease or re-plan something already out", async () => {
    const kept = await keepTrackPrivate(test.ctx, { careerId, userId: user.id, trackId });
    expect(kept.ok).toBe(false);

    const replanned = await planRelease(test.ctx, { careerId, userId: user.id, trackId });
    expect(replanned.ok).toBe(false);
  });

  it("shows the catalogue as released work plus its release", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const catalogue = await getCatalogue(test.ctx, career!);

    expect(catalogue.releasedCount).toBe(1);
    expect(catalogue.tracks[0]!.track.title).toBe("NO RECEPTION");
    expect(catalogue.tracks[0]!.release?.status).toBe("RELEASED");
  });
});

describe("format availability grows with the career", () => {
  it("opens bodies of work once there is enough music and enough career", () => {
    const underground = availableFormats({ careerAct: "UNDERGROUND", catalogueSize: 12 });
    // Enough music, wrong act: still no album in the Underground.
    expect(underground.find((format) => format.format === "ALBUM")!.available).toBe(false);

    const comeUpThin = availableFormats({ careerAct: "COME_UP", catalogueSize: 2 });
    expect(comeUpThin.find((format) => format.format === "EP")!.available).toBe(false);
    expect(comeUpThin.find((format) => format.format === "EP")!.lockedReason).toContain("4 tracks");

    const comeUpReady = availableFormats({ careerAct: "COME_UP", catalogueSize: 9 });
    expect(comeUpReady.find((format) => format.format === "EP")!.available).toBe(true);
    expect(comeUpReady.find((format) => format.format === "ALBUM")!.available).toBe(true);
  });
});
