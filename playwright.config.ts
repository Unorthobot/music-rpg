import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end coverage of both onboarding paths, at a representative desktop and
 * mobile viewport.
 *
 * The app under test runs against its own embedded PGlite database
 * (`.pglite/e2e`), so the suite needs no external services and cannot touch
 * development data.
 */
const PORT = 3101;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
  webServer: {
    // A production build, not the dev server: on-demand compilation makes the
    // first request to each route slow and occasionally flaky, which is a
    // property of `next dev` rather than of the app.
    //
    // Paths are relative to `cwd` below: the data directory lives at the repo
    // root, so both the wipe and PGLITE_DATA_DIR have to climb out of apps/web.
    command: `rm -rf ../../.pglite/e2e && npx next build && npx next start -p ${PORT}`,
    cwd: "apps/web",
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse: each run starts from a freshly seeded database, so NPC
    // candidates are unclaimed and the suite is deterministic.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PGLITE_DATA_DIR: "../../.pglite/e2e",
      ANALYTICS_ADAPTER: "noop",
      // Grants the world-control spec's fixed account access to the inspector.
      WORLD_CONTROL_EMAILS: "world-control@example.test",
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-32",
    },
  },
});
