import { mkdir, rm, writeFile } from "node:fs/promises";
import { MemoryAnalyticsAdapter } from "@music-rpg/analytics";
import { CredentialsAuthService } from "@music-rpg/auth";
import { battles, createDatabase, eq, runMigrations, seedDatabase } from "@music-rpg/database";
import {
  advanceCareerDay,
  declareBattleStrategy,
  prepareForBattle,
  resolveBattle,
} from "@music-rpg/domain";
import { DevelopmentModerationService } from "@music-rpg/moderation";
import { unwrap } from "@music-rpg/shared";
import { acceptInto, liveUntilChallenged } from "../tests/helpers/battle";
import type { TestContext } from "../tests/helpers/context";

/**
 * The world every E2E run starts from, and one canonical split decision in it.
 *
 * Run by Playwright's global setup, **as its own `tsx` process**, before the
 * server opens the data directory. Two constraints put it here rather than in
 * the setup file itself:
 *
 * - PGlite is embedded and single-writer, so the data directory belongs to
 *   whichever process has it open. Global setup runs before `webServer`, which
 *   is the one window in which a test can write to the world the app will serve.
 * - The domain reaches for `await import("@music-rpg/database")` inside
 *   `loadCohortStanding`, and that dynamic import of a workspace package does
 *   not resolve under Playwright's ESM loader — it does under `tsx`, which is
 *   how every other database script in this repository already runs.
 *
 * ## Why the battle is built here instead of driven in a browser
 *
 * A 2-1 is the property the whole judging model exists to have, so it deserves
 * browser evidence — but it cannot be *driven* to reliably. A night's composure
 * shift is seeded from the battle's own id, which is random, so the same career
 * taking the same angle with the same preparation lands on 2-1 about half the
 * time. Measured rather than assumed: four unseeded runs of the identical path
 * returned `2-1, 3-0, 3-0, 2-1`. A spec that pressed the same buttons and hoped
 * would fail every other run, and one that retried until it got the answer it
 * wanted would be worse than no spec at all.
 *
 * So the seed is pinned and the path is walked here — through **the same domain
 * commands the interface calls**, in the same order a player would: onboard,
 * record, release, live until somebody calls you out, agree, declare, prepare,
 * and let the world reach the night. Nothing is inserted behind a domain
 * boundary and no judge row is fabricated. The 2-1 the spec reads is one the
 * engine genuinely produced; the spec only reads how it is presented.
 */

const DATA_DIR = ".pglite/e2e";
const FIXTURE = "test-results/split-battle.json";

/**
 * The headless golden proof's own seed.
 *
 * It produces the outcome that milestone documented: an early-career artist with
 * three sessions of preparation loses 2-1 to a seeded veteran, one judge having
 * gone the other way. Preparation lifted the round and did not decide it.
 */
const SEED = "m8-golden-battle";

const ACCOUNT = {
  email: "split-decision@example.test",
  password: "correct horse battery",
  displayName: "SPLITKX",
};

async function main(): Promise<void> {
  await rm(DATA_DIR, { recursive: true, force: true });

  const handle = await createDatabase({ dataDir: DATA_DIR });
  await runMigrations(handle);
  await seedDatabase(handle.db);

  const test: TestContext = {
    handle,
    analytics: new MemoryAnalyticsAdapter(),
    ctx: {
      db: handle.db,
      analytics: new MemoryAnalyticsAdapter(),
      moderation: new DevelopmentModerationService(),
    },
    close: () => handle.close(),
  };

  const auth = new CredentialsAuthService(handle.db);
  const user = unwrap(await auth.register(ACCOUNT));

  const { careerId, challenge } = await liveUntilChallenged(test, user, {
    stageName: ACCOUNT.displayName,
  });

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

  /* The night arrives because time reached it, exactly as it does in play. */
  const night = battle.scheduledGameTime!;
  for (let guard = 0; guard < 30; guard += 1) {
    const advanced = await advanceCareerDay(test.ctx, {
      careerId,
      userId: user.id,
      seed: SEED,
    });
    if (!advanced.ok || advanced.value.gameTime >= night) break;
  }

  unwrap(
    await resolveBattle(test.ctx, {
      careerId,
      userId: user.id,
      battleId: battle.id,
      seed: SEED,
    }),
  );

  const resolved = (await handle.db.select().from(battles).where(eq(battles.id, battle.id)))[0]!;

  if (resolved.decision !== "2-1") {
    throw new Error(
      `Expected a canonical 2-1 and the engine produced "${resolved.decision}". The ` +
        `split-decision spec asserts a rendered dissent and cannot run without one.`,
    );
  }

  await mkdir("test-results", { recursive: true });
  await writeFile(
    FIXTURE,
    JSON.stringify(
      {
        email: ACCOUNT.email,
        password: ACCOUNT.password,
        battleId: resolved.id,
        /* Asserted against, so the spec cannot drift off the fixture silently. */
        decision: resolved.decision,
        winnerIsRival: resolved.winnerArtistId === resolved.challengerId,
      },
      null,
      2,
    ),
  );

  /*
   * Released explicitly, and the process ends here. The directory has to be
   * closed before the app can open it, and PGlite's shutdown is the one part of
   * this that is happier owning its own process.
   */
  await handle.close();
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
