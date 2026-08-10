import { assertSchemaReady, createDatabase, runMigrations } from "../client";
import { seedDatabase } from "./index";

/**
 * `npm run db:seed`
 *
 * Runs migrations then seeds. Safe to run repeatedly.
 */
async function main() {
  const handle = await createDatabase();

  // Seeding an embedded database implies bootstrapping it; against hosted
  // Postgres the schema must already have been migrated by the deploy step.
  if (handle.driver === "pglite") {
    const applied = await runMigrations(handle);
    if (applied.length > 0) {
      console.info(`[db] applied migrations: ${applied.join(", ")}`);
    }
  } else {
    await assertSchemaReady(handle);
  }

  const result = await seedDatabase(handle.db);
  console.info(
    `[db] seeded via ${handle.driver}: ${result.worlds} world(s), ${result.scenes} scene(s), ` +
      `${result.archetypes} archetypes, ${result.traits} traits, ${result.questions} questions, ` +
      `${result.candidates} candidate member(s)`,
  );

  await handle.close();
}

main().catch((error) => {
  console.error("[db] seed failed", error);
  process.exit(1);
});
