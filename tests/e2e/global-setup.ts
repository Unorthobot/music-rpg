import { execFile } from "node:child_process";
import { promisify } from "node:util";

/**
 * The world every E2E run starts from.
 *
 * Two jobs, and the second is why this file exists.
 *
 * **A fresh world.** The wipe used to live in the Playwright `webServer`
 * command. It moved into the seeding script, because a setup that writes the
 * database and a server command that deletes it cannot both run. Every spec
 * still starts from a freshly migrated, freshly seeded world with unclaimed NPC
 * candidates.
 *
 * **One canonical split decision**, built through real domain commands with the
 * seed pinned, so the browser has a genuine 2-1 to read rather than a lucky one.
 * The reasoning, and the measurements behind it, are in the script.
 *
 * Delegated to `tsx` rather than done inline for two reasons: PGlite is
 * single-writer and is happiest owning the process that opens and closes it, and
 * the domain's dynamic `import("@music-rpg/database")` inside
 * `loadCohortStanding` does not resolve under Playwright's ESM loader. `tsx` is
 * how every other database script in this repository already runs.
 */

const run = promisify(execFile);

/** Where the split-decision spec finds what was built. Rewritten every run. */
export const SPLIT_FIXTURE = "test-results/split-battle.json";

export default async function globalSetup(): Promise<void> {
  const { stdout, stderr } = await run(
    "npx",
    ["tsx", "scripts/e2e-split-battle.ts"],
    /* A whole career, day by day, through the real commands. It takes a while. */
    { cwd: process.cwd(), timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
  );

  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
}
