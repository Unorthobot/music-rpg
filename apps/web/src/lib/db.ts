import "server-only";
import { getDatabase, seedDatabase, type Database } from "@music-rpg/database";

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

/**
 * Brings an embedded database up to the current seed, once per process.
 *
 * This used to return early if a world already existed, which treated "has a
 * world" as a proxy for "has everything the seed provides". That proxy fails
 * the moment the seed grows: a database seeded before characters existed keeps
 * its world for ever and never gains a connector or a producer, and a career
 * created in it has no way to start — the exact state the M0–M9 playability
 * audit found and could not recover from.
 *
 * `seedDatabase` is idempotent by construction — every insert is an upsert
 * keyed on its natural key — so the honest thing is to run it rather than to
 * guess from one row whether it has already been run. It is a few dozen upserts
 * against a local database, once per process.
 *
 * Embedded only. Hosted Postgres still seeds exclusively through a deliberate
 * `npm run db:seed`, and that contract is unchanged.
 */
async function ensureSeeded(db: Database): Promise<void> {
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
