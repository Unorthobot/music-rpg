import { createDatabase, runMigrations } from "../client";
import { seedDatabase } from "./index";

/**
 * `npm run db:reset`
 *
 * Drops every table and rebuilds from migrations + seed. Development only —
 * it refuses to touch a database that isn't obviously local.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (url && !/localhost|127\.0\.0\.1/.test(url)) {
    console.error("[db] refusing to reset a non-local DATABASE_URL");
    process.exit(1);
  }

  const handle = await createDatabase();

  await handle.execRaw(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
  `);

  await runMigrations(handle);
  const result = await seedDatabase(handle.db);

  console.info(`[db] reset and seeded via ${handle.driver}`, result);
  await handle.close();
}

main().catch((error) => {
  console.error("[db] reset failed", error);
  process.exit(1);
});
