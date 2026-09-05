import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { resolvePgliteDataDir } from "@music-rpg/database";

/**
 * One configured value, one physical database.
 *
 * The defect this file exists for: `PGLITE_DATA_DIR` is relative, PGlite
 * resolves relative paths against `process.cwd()`, and this repository's npm
 * scripts do not share a working directory. `npm run dev` executes in
 * `apps/web`; `npm run db:seed` executes at the root. The same configured
 * `.pglite/dev` therefore named two different databases, so a fresh checkout
 * seeded one and served the other.
 *
 * These are pure-function tests on purpose. The behaviour is path arithmetic,
 * and asserting it here rather than by booting two processes and comparing what
 * they see is the lowest boundary the property actually lives at.
 */

/** A throwaway workspace: a root with `workspaces`, and packages beneath it. */
function fakeWorkspace(): { root: string; web: string; pkg: string; nested: string } {
  const root = mkdtempSync(join(tmpdir(), "saifa-ws-"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "root", workspaces: ["apps/*", "packages/*"] }),
  );

  const web = join(root, "apps", "web");
  const pkg = join(root, "packages", "database");
  const nested = join(web, "src", "app", "(app)");
  for (const dir of [web, pkg, nested]) mkdirSync(dir, { recursive: true });

  // Workspace members carry their own manifests, without `workspaces`.
  writeFileSync(join(web, "package.json"), JSON.stringify({ name: "@music-rpg/web" }));
  writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "@music-rpg/database" }));

  return { root, web, pkg, nested };
}

describe("resolvePgliteDataDir", () => {
  it("resolves one configured path to one database from every workspace directory", () => {
    const { root, web, pkg, nested } = fakeWorkspace();
    const configured = ".pglite/dev";

    const fromRoot = resolvePgliteDataDir(configured, root);
    const fromWeb = resolvePgliteDataDir(configured, web);
    const fromPackage = resolvePgliteDataDir(configured, pkg);
    const fromNested = resolvePgliteDataDir(configured, nested);

    /* The property that was violated: every launch directory agrees. */
    expect(fromWeb, "apps/web disagreed with the repository root").toBe(fromRoot);
    expect(fromPackage, "a package directory disagreed with the root").toBe(fromRoot);
    expect(fromNested, "a deeply nested directory disagreed with the root").toBe(fromRoot);

    /* And they agree on the workspace root, not on whoever launched. */
    expect(fromRoot).toBe(resolve(root, ".pglite/dev"));
    expect(fromWeb).not.toContain(`${sep}apps${sep}web${sep}.pglite`);
  });

  it("reproduces the original bug when resolution is left to the launcher", () => {
    const { root, web } = fakeWorkspace();

    /*
     * What the old code did, spelled out: `resolve(cwd, configured)`. Two
     * directories, two databases — the exact failure the audit hit.
     */
    expect(resolve(web, ".pglite/dev")).not.toBe(resolve(root, ".pglite/dev"));
  });

  it("passes URL forms through untouched, so memory:// stays throwaway", () => {
    const { web } = fakeWorkspace();
    expect(resolvePgliteDataDir("memory://", web)).toBe("memory://");
    expect(resolvePgliteDataDir("file://somewhere", web)).toBe("file://somewhere");
  });

  it("honours an absolute path exactly, so an operator can still point anywhere", () => {
    const { root, web } = fakeWorkspace();
    const elsewhere = join(root, "somewhere-else");
    expect(resolvePgliteDataDir(elsewhere, web)).toBe(elsewhere);
  });

  it("falls back to the launcher when there is no workspace to anchor to", () => {
    /*
     * A deployed bundle with no repository around it. There is no root to find,
     * so the old behaviour is the correct behaviour — and in practice such a
     * deployment sets DATABASE_URL and never reaches this code.
     */
    const orphan = mkdtempSync(join(tmpdir(), "saifa-orphan-"));
    expect(resolvePgliteDataDir(".pglite/dev", orphan)).toBe(resolve(orphan, ".pglite/dev"));
  });

  it("agrees with the value the e2e config and its setup script both use", () => {
    const { root, web } = fakeWorkspace();

    /*
     * Playwright's webServer runs in apps/web and global setup runs at the
     * root. Before the repair the config had to climb out with "../../"; both
     * now configure the same plain value and must land in the same place.
     */
    expect(resolvePgliteDataDir(".pglite/e2e", web)).toBe(
      resolvePgliteDataDir(".pglite/e2e", root),
    );
  });
});
