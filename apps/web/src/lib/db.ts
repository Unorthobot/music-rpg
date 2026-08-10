import "server-only";
import { getDatabase, seedDatabase, worlds, type Database } from "@music-rpg/database";

/**
 * Application database access.
 *
 * `getDatabase()` already runs migrations. On top of that, a fresh embedded
 * database is seeded once per process so `npm run dev` and the E2E suite work
 * from a clean checkout with no manual setup step. Seeding is idempotent and
 * skipped as soon as a world exists.
 */
let seeding: Promise<void> | null = null;

async function ensureSeeded(db: Database): Promise<void> {
  const existing = await db.select({ id: worlds.id }).from(worlds).limit(1);
  if (existing[0]) return;
  await seedDatabase(db);
}

export async function getAppDb(): Promise<Database> {
  const handle = await getDatabase();

  if (!seeding) {
    seeding = ensureSeeded(handle.db).catch((error) => {
      // Reset so a transient failure can be retried on the next request rather
      // than poisoning every subsequent one.
      seeding = null;
      throw error;
    });
  }
  await seeding;

  return handle.db;
}
