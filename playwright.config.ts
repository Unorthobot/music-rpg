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
  /*
   * The world every run starts from, built before the server opens the data
   * directory. It performs the wipe that used to live in the `webServer`
   * command below, and additionally builds one canonical split decision — see
   * `tests/e2e/global-setup.ts` for why that cannot be driven from a browser.
   */
  globalSetup: "./tests/e2e/global-setup.ts",
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
    // The data directory lives at the repo root, so PGLITE_DATA_DIR has to climb
    // out of apps/web. The wipe belongs to global setup, which runs first and
    // needs the directory to itself.
    command: `npx next build && npx next start -p ${PORT}`,
    cwd: "apps/web",
    url: `http://127.0.0.1:${PORT}`,
    // Never reuse: global setup rebuilds the database every run, so NPC
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
