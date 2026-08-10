import { createDatabase, pendingMigrations, runMigrations } from "../client";

/**
 * `npm run db:migrate` — the deploy pipeline's schema step.
 *
 * This is the only thing that changes a hosted schema. The application runtime
 * verifies and refuses to start against a database this has not been run on.
 *
 * Exit codes: 0 applied (or already current), 1 failed. `--check` reports
 * pending migrations without applying them, for a pre-deploy gate.
 */
async function main() {
  const checkOnly = process.argv.includes("--check");
  const handle = await createDatabase();

  try {
    const pending = await pendingMigrations(handle);

    if (checkOnly) {
      if (pending.length === 0) {
        console.info(`[db] schema is current (${handle.driver})`);
      } else {
        console.error(`[db] pending migrations: ${pending.join(", ")}`);
        process.exitCode = 1;
      }
      return;
    }

    if (pending.length === 0) {
      console.info(`[db] no migrations to apply (${handle.driver})`);
      return;
    }

    console.info(`[db] applying ${pending.length} migration(s) to ${handle.driver}…`);
    const applied = await runMigrations(handle);
    console.info(`[db] applied: ${applied.join(", ")}`);
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error("[db] migration failed", error);
  process.exit(1);
});
