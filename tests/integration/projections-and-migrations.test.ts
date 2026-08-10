import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  assertSchemaReady,
  battles,
  careerAudience,
  careers,
  createDatabase,
  eq,
  pendingMigrations,
  runMigrations,
  shouldBootstrapAtRuntime,
  tracks,
  type UserRow,
} from "@music-rpg/database";
import {
  createCareer,
  createSoloArtist,
  getCareerCounters,
  selectCareerType,
} from "@music-rpg/domain";
import { ids, unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

describe("home counters read from projections", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");

    const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
    careerId = career.career.id;
    unwrap(await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "SOLO" }));
    unwrap(await createSoloArtist(test.ctx, { careerId, userId: user.id, stageName: "KXMO" }));
  });

  afterAll(async () => {
    await test.close();
  });

  it("creates the audience projection with the career", async () => {
    const rows = await test.handle.db
      .select()
      .from(careerAudience)
      .where(eq(careerAudience.careerId, careerId));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.fans).toBe(0);
  });

  it("reports zero because the tables say zero", async () => {
    const counters = await getCareerCounters(test.handle.db, { id: careerId });

    expect(counters).toEqual({
      fans: 0,
      monthlyListeners: 0,
      reach: 0,
      catalogue: 0,
      releases: 0,
      battles: 0,
    });
  });

  it("reflects the projection the moment a later system writes to it", async () => {
    // Stands in for M2's audience simulation: the query is unchanged, only the
    // writer is new.
    await test.handle.db
      .update(careerAudience)
      .set({ fans: 1240, monthlyListeners: 5600 })
      .where(eq(careerAudience.careerId, careerId));

    const counters = await getCareerCounters(test.handle.db, { id: careerId });

    expect(counters.fans).toBe(1240);
    expect(counters.monthlyListeners).toBe(5600);
  });

  it("counts catalogue, releases and battles from their own tables", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const worldId = career!.worldId;
    const artistId = career!.playerArtistId!;

    await test.handle.db.insert(tracks).values([
      {
        id: ids.generic(),
        worldId,
        careerId,
        ownerType: "ARTIST",
        ownerId: artistId,
        title: "Untitled 1",
        status: "IDEA",
      },
      {
        id: ids.generic(),
        worldId,
        careerId,
        ownerType: "ARTIST",
        ownerId: artistId,
        title: "First single",
        status: "COMPLETE",
        // Releases are a later milestone; a release date is what counts.
        releasedAt: new Date(),
      },
      {
        id: ids.generic(),
        worldId,
        careerId,
        ownerType: "ARTIST",
        ownerId: artistId,
        title: "Abandoned",
        status: "SCRAPPED",
      },
    ]);

    await test.handle.db.insert(battles).values({
      id: ids.generic(),
      worldId,
      careerId,
      challengerId: artistId,
      status: "COMPLETED",
      outcome: "WON",
    });

    const counters = await getCareerCounters(test.handle.db, { id: careerId });

    // Scrapped work is not in the catalogue.
    expect(counters.catalogue).toBe(2);
    expect(counters.releases).toBe(1);
    expect(counters.battles).toBe(1);
  });
});

describe("migration policy", () => {
  it("bootstraps embedded databases and never hosted ones", () => {
    expect(shouldBootstrapAtRuntime("pglite", {})).toBe(true);
    expect(shouldBootstrapAtRuntime("postgres", {})).toBe(false);
  });

  it("honours an explicit override in both directions", () => {
    expect(shouldBootstrapAtRuntime("postgres", { DB_ALLOW_RUNTIME_MIGRATION: "true" })).toBe(true);
    expect(shouldBootstrapAtRuntime("pglite", { DB_ALLOW_RUNTIME_MIGRATION: "false" })).toBe(false);
  });

  it("reports pending migrations on an empty database and none after migrating", async () => {
    const handle = await createDatabase({ dataDir: "memory://" });

    try {
      const before = await pendingMigrations(handle);
      expect(before.length).toBeGreaterThan(0);
      await expect(assertSchemaReady(handle)).rejects.toThrow(/pending migrations/i);

      await runMigrations(handle);

      expect(await pendingMigrations(handle)).toHaveLength(0);
      await expect(assertSchemaReady(handle)).resolves.toBeUndefined();
    } finally {
      await handle.close();
    }
  });

  it("is idempotent — a second run applies nothing", async () => {
    const handle = await createDatabase({ dataDir: "memory://" });

    try {
      const first = await runMigrations(handle);
      const second = await runMigrations(handle);

      expect(first.length).toBeGreaterThan(0);
      expect(second).toHaveLength(0);
    } finally {
      await handle.close();
    }
  });
});
