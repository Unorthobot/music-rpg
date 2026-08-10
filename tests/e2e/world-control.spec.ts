import { expect, test } from "@playwright/test";
import { answerDiscovery } from "./helpers";

/**
 * World Control.
 *
 * The milestone's end state requires that the internal inspector can show the
 * canonical events that created a career. This walks a career into existence
 * and then reads its history back out of the log.
 *
 * The account email is fixed (and allow-listed in playwright.config.ts) because
 * the E2E database is wiped before every run.
 */
const INTERNAL_EMAIL = "world-control@example.test";

test.describe("world control", () => {
  // One pass is enough, and the fixed email can only be registered once per run.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "inspector is a desktop surface");
  });

  test("shows the canonical events behind a career", async ({ page }) => {
    // Build a career to inspect.
    await page.goto("/register");
    await page.getByLabel("What should we call you?").fill("Internal");
    await page.getByLabel("Email").fill(INTERNAL_EMAIL);
    await page.getByLabel("Password").fill("correct horse battery");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL("**/start");

    await page.getByRole("button", { name: /SOLO/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/start/identity");
    await page.getByLabel("Stage name").fill("INSPECTOR");
    await page.getByRole("button", { name: "Continue" }).click();

    await answerDiscovery(page, 2);
    await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
    await page.waitForURL("**/home");

    // Overview.
    await page.goto("/world-control");
    await expect(page.getByText("Worlds")).toBeVisible();
    await expect(page.getByText("Johannesburg").first()).toBeVisible();
    await expect(page.getByText("Game events")).toBeVisible();

    // Careers list, then the detail view.
    await page.goto("/world-control/careers");
    await page.getByRole("link", { name: "Internal" }).first().click();

    await expect(page.getByRole("heading", { name: "INSPECTOR" })).toBeVisible();
    await expect(page.getByText("Sound DNA")).toBeVisible();
    await expect(page.getByText("Skills")).toBeVisible();
    await expect(page.getByText("Psychology")).toBeVisible();

    // The history that produced this career.
    await expect(page.getByText("Career created")).toBeVisible();
    await expect(page.getByText("Solo artist created")).toBeVisible();
    await expect(page.getByText("Sound discovery completed")).toBeVisible();
    await expect(page.getByText("Artist identity established")).toBeVisible();
    await expect(page.getByText("Career entered The Underground")).toBeVisible();
  });
});
