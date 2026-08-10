import "server-only";
import { getDatabase, seedDatabase, worlds, type Database } from "@music-rpg/database";

/**
 * Application database access.
 *
 * Two different contracts, chosen by driver:
 *
 * - **Embedded (PGlite, local dev and tests).** The database is a directory this
 *   process owns, so `getDatabase()` migrates it and we seed it once per process.
 *   `npm run dev` works from a clean checkout with no setup step.
 * - **Hosted Postgres.** The runtime never migrates and never seeds. Schema
 *   changes belong to the deploy pipeline (`npm run db:migrate`), and content
 *   seeding to a deliberate `npm run db:seed`; a process that finds an
 *   out-of-date schema fails fast rather than racing another instance.
 */
let seeding: Promise<void> | null = null;

async function ensureSeeded(db: Database): Promise<void> {
  const existing = await db.select({ id: worlds.id }).from(worlds).limit(1);
  if (existing[0]) return;
  await seedDatabase(db);
}

export async function getAppDb(): Promise<Database> {
  const handle = await getDatabase();

  if (handle.driver !== "pglite") return handle.db;

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
