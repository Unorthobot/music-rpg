import { MemoryAnalyticsAdapter } from "@music-rpg/analytics";
import { CredentialsAuthService } from "@music-rpg/auth";
import {
  createDatabase,
  runMigrations,
  seedDatabase,
  type DatabaseHandle,
  type UserRow,
} from "@music-rpg/database";
import type { CommandContext } from "@music-rpg/domain";
import { DevelopmentModerationService } from "@music-rpg/moderation";
import { unwrap } from "@music-rpg/shared";

/**
 * A throwaway world per test file: real schema, real migrations, real seed
 * content, running entirely in memory.
 */
export type TestContext = {
  handle: DatabaseHandle;
  ctx: CommandContext;
  analytics: MemoryAnalyticsAdapter;
  close: () => Promise<void>;
};

export async function createTestContext(): Promise<TestContext> {
  const handle = await createDatabase({ dataDir: "memory://" });
  await runMigrations(handle);
  await seedDatabase(handle.db);

  const analytics = new MemoryAnalyticsAdapter();

  return {
    handle,
    analytics,
    ctx: {
      db: handle.db,
      analytics,
      moderation: new DevelopmentModerationService(),
    },
    close: () => handle.close(),
  };
}

let userCounter = 0;

export async function createTestUser(test: TestContext, displayName = "Player"): Promise<UserRow> {
  userCounter += 1;
  const auth = new CredentialsAuthService(test.handle.db);

  return unwrap(
    await auth.register({
      email: `player${userCounter}@example.test`,
      password: "correct horse battery",
      displayName,
    }),
  );
}
