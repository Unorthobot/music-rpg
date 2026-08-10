import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artists, eq, worlds, type UserRow } from "@music-rpg/database";
import {
  createCareer,
  createSoloArtist,
  findWorldsForSlug,
  getPublicArtistProfile,
  getPublicGroupProfile,
  selectCareerType,
} from "@music-rpg/domain";
import { ids, unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

/**
 * Identity is world-scoped end to end.
 *
 * Slugs are unique inside a world, never across worlds — so a public lookup
 * without a world is ambiguous by construction. These tests pin the behaviour
 * with two worlds present, which is the case a single-world deployment cannot
 * exercise and the one that silently returns the wrong artist if resolution
 * forgets the world.
 */
describe("world-scoped public identity", () => {
  let test: TestContext;
  let user: UserRow;
  let secondWorldId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");

    // A second world with an artist sharing the first world's slug.
    secondWorldId = ids.world();
    await test.handle.db.insert(worlds).values({
      id: secondWorldId,
      name: "Cape Town",
      slug: "cape-town",
      status: "ACTIVE",
      currentGameTime: new Date("2026-01-05T09:00:00.000Z"),
    });

    const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
    unwrap(
      await selectCareerType(test.ctx, {
        careerId: career.career.id,
        userId: user.id,
        careerType: "SOLO",
      }),
    );
    unwrap(
      await createSoloArtist(test.ctx, {
        careerId: career.career.id,
        userId: user.id,
        stageName: "KXMO",
        origin: "Braamfontein",
      }),
    );

    // Same stage name, different world — legal, and the whole point.
    await test.handle.db.insert(artists).values({
      id: ids.artist(),
      worldId: secondWorldId,
      stageName: "KXMO",
      slug: "kxmo",
      origin: "Woodstock",
      artistType: "WORLD_NPC",
      status: "ACTIVE",
      isPublic: true,
    });
  });

  afterAll(async () => {
    await test.close();
  });

  it("allows the same slug in two different worlds", async () => {
    const rows = await test.handle.db.select().from(artists).where(eq(artists.slug, "kxmo"));
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.worldId)).size).toBe(2);
  });

  it("resolves each world's artist independently", async () => {
    const johannesburg = await getPublicArtistProfile(
      test.handle.db,
      "johannesburg",
      "kxmo",
      user.id,
    );
    const capeTown = await getPublicArtistProfile(test.handle.db, "cape-town", "kxmo", user.id);

    expect(johannesburg?.origin).toBe("Braamfontein");
    expect(johannesburg?.worldSlug).toBe("johannesburg");
    expect(capeTown?.origin).toBe("Woodstock");
    expect(capeTown?.worldSlug).toBe("cape-town");
  });

  it("returns nothing for a world that doesn't exist", async () => {
    expect(await getPublicArtistProfile(test.handle.db, "atlantis", "kxmo", null)).toBeNull();
  });

  it("returns nothing for a slug that isn't in that world", async () => {
    // NOMA B is seeded into Johannesburg only.
    expect(await getPublicArtistProfile(test.handle.db, "cape-town", "noma-b", null)).toBeNull();
    expect(await getPublicArtistProfile(test.handle.db, "johannesburg", "noma-b", null)).not.toBeNull();
  });

  it("reports every world a legacy slug could mean, without guessing", async () => {
    const matches = await findWorldsForSlug(test.handle.db, "ARTIST", "kxmo");
    expect(matches.map((match) => match.worldSlug).sort()).toEqual(["cape-town", "johannesburg"]);

    const single = await findWorldsForSlug(test.handle.db, "ARTIST", "noma-b");
    expect(single).toHaveLength(1);
    expect(single[0]!.worldSlug).toBe("johannesburg");

    expect(await findWorldsForSlug(test.handle.db, "ARTIST", "nobody-here")).toHaveLength(0);
  });

  it("keeps a private artist private and previews it for its owner", async () => {
    const owner = await getPublicArtistProfile(test.handle.db, "johannesburg", "kxmo", user.id);
    const stranger = await createTestUser(test, "Stranger");
    const outsider = await getPublicArtistProfile(
      test.handle.db,
      "johannesburg",
      "kxmo",
      stranger.id,
    );
    const anonymous = await getPublicArtistProfile(test.handle.db, "johannesburg", "kxmo", null);

    expect(owner?.access).toBe("OWNER_PREVIEW");
    expect(outsider?.access).toBe("HIDDEN");
    expect(anonymous?.access).toBe("HIDDEN");
  });

  it("resolves groups through their world too", async () => {
    expect(await getPublicGroupProfile(test.handle.db, "atlantis", "anything", null)).toBeNull();
  });
});
