import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const packagePath = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

/**
 * Unit, domain and integration tests.
 *
 * Integration tests run against embedded PGlite (`memory://`), so they exercise
 * the real schema, real migrations and real SQL — no mocks, no external
 * database, no Docker.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@music-rpg/shared": packagePath("shared"),
      "@music-rpg/ui": packagePath("ui"),
      "@music-rpg/domain": packagePath("domain"),
      "@music-rpg/simulation": packagePath("simulation"),
      "@music-rpg/events": packagePath("events"),
      "@music-rpg/ai": packagePath("ai"),
      "@music-rpg/database": packagePath("database"),
      "@music-rpg/jobs": packagePath("jobs"),
      "@music-rpg/analytics": packagePath("analytics"),
      "@music-rpg/moderation": packagePath("moderation"),
      "@music-rpg/storage": packagePath("storage"),
      "@music-rpg/auth": packagePath("auth"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // PGlite bootstraps a Postgres instance per suite; give it room.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
