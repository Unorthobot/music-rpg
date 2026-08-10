import { expect, test } from "@playwright/test";
import { answerDiscovery, registerAccount } from "./helpers";

/**
 * The group path: register → group → identity → sound discovery → choose
 * members → reveal → the underground → home, with the group's founding members
 * showing up under Crew as group membership rather than as generic "crew".
 */
test("group: register, form a group, and enter the underground", async ({ page }) => {
  await registerAccount(page, "Group Player");

  await expect(page.getByRole("heading", { name: "WHO ARE YOU BECOMING?" })).toBeVisible();
  await page.getByRole("button", { name: /GROUP/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/start/identity");
  await page.getByLabel("Group name").fill("THE LONG WAY");
  await page.getByLabel("Initial creative direction").fill("Live drums, nothing quantised.");
  await page.getByRole("button", { name: "Continue" }).click();

  await answerDiscovery(page, 0);
  // Group careers route to member selection before the reveal.
  await page.waitForURL("**/start/members");

  await expect(page.getByRole("heading", { name: "WHO'S IN THIS WITH YOU?" })).toBeVisible();

  // Candidates are described qualitatively.
  const firstAdd = page.getByRole("button", { name: "Add" }).first();
  await firstAdd.click();
  await page.waitForTimeout(500);

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.waitForTimeout(500);

  await expect(page.getByText(/In the group — chemistry/)).toBeVisible();

  await page.getByRole("button", { name: "Lock the line-up" }).click();

  await page.waitForURL("**/start/reveal");
  await expect(page.getByRole("heading", { name: "THE LONG WAY" })).toBeVisible();
  await expect(page.getByText("The line-up", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();

  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { name: "THE LONG WAY" })).toBeVisible();
  await expect(page.getByText("R5,000").first()).toBeVisible();

  // Crew distinguishes group membership from the wider crew concept.
  await page.goto("/crew");
  await expect(page.getByText("The group — THE LONG WAY")).toBeVisible();
  await expect(page.getByText(/Beyond the group, you're on your own/)).toBeVisible();
});
