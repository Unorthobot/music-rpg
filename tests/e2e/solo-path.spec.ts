import { expect, test } from "@playwright/test";
import { answerDiscovery, registerAccount } from "./helpers";

/**
 * The solo path, exactly as the milestone describes it:
 * register → solo → identity → sound discovery → reveal → the underground →
 * home, then prove the career survived the browser closing.
 */
test("solo: register, build an artist, and enter the underground", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await registerAccount(page, "Solo Player");

  // Step 1 — the fork.
  await expect(page.getByRole("heading", { name: "WHO ARE YOU BECOMING?" })).toBeVisible();
  await page.getByRole("button", { name: /SOLO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2 — the name.
  await page.waitForURL("**/start/identity");
  await page.getByLabel("Stage name").fill("KXMO");
  await page.getByLabel("Where are you from?").fill("Braamfontein");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3 — sound discovery.
  await answerDiscovery(page, 1);

  // Step 4 — the reveal.
  await expect(page.getByRole("heading", { name: "KXMO" })).toBeVisible();
  await expect(page.getByText("Where you're strong")).toBeVisible();
  await expect(page.getByText("Starting traits")).toBeVisible();

  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();

  // Home reads real career state.
  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { name: "KXMO" })).toBeVisible();
  // The act is in the page header on every viewport (the sidebar copy is
  // hidden on mobile, so target the header explicitly).
  await expect(page.locator("header").getByText("The Underground")).toBeVisible();
  await expect(page.getByText("R5,000").first()).toBeVisible();
  await expect(page.getByText("Every career starts somewhere.")).toBeVisible();

  // The career is server state: a full reload changes nothing.
  await page.reload();
  await expect(page.getByRole("heading", { name: "KXMO" })).toBeVisible();
  await expect(page.getByText("R5,000").first()).toBeVisible();

  // Career reads the artist that discovery produced.
  await page.goto("/career");
  await expect(page.getByRole("heading", { name: "KXMO" })).toBeVisible();
  await expect(page.getByText("Sound DNA")).toBeVisible();

  // Solo careers have no crew, and the screen says so rather than inventing one.
  await page.goto("/crew");
  await expect(page.getByText(/No crew yet/)).toBeVisible();

  // The Studio exists but is honestly locked.
  await page.goto("/studio");
  await expect(page.getByText("Your first session starts here.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a session" })).toBeDisabled();
});

test("solo: onboarding resumes at the step it was left on", async ({ page }) => {
  await registerAccount(page, "Resumer");

  await page.getByRole("button", { name: /SOLO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/start/identity");

  await page.getByLabel("Stage name").fill("HALFWAY");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/start/sound");

  // Answer one question, then "leave".
  await page.locator("button[aria-pressed]").first().click();
  await page.waitForTimeout(500);

  // Skipping ahead is refused; the player is returned to where they actually are.
  await page.goto("/start/reveal");
  await page.waitForURL("**/start/sound");
  await expect(page.getByText(/\d \/ \d/)).toBeVisible();

  // And the app itself sends them back to the same step.
  await page.goto("/home");
  await page.waitForURL("**/start/sound");
});
