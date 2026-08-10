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

  // The player authors themselves as a member of their own group.
  await page.waitForURL("**/start/founder");
  await expect(page.getByRole("heading", { name: "AND WHO ARE YOU IN IT?" })).toBeVisible();
  await page.getByLabel("Your stage name").fill("KXMO");
  await page.getByLabel("Where are you from?").fill("Braamfontein");
  await page.getByRole("radio", { name: /Lead MC/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await answerDiscovery(page, 0);
  // Group careers route to member selection before the reveal.
  await page.waitForURL("**/start/members");

  await expect(page.getByRole("heading", { name: "WHO'S IN THIS WITH YOU?" })).toBeVisible();

  // The player is already in the line-up, and cannot remove themselves.
  await expect(page.getByText(/In the group — chemistry/)).toBeVisible();
  await expect(page.getByText("KXMO").first()).toBeVisible();
  await expect(page.getByText("Can't leave your own group")).toBeVisible();

  // Recruit somebody from the scene.
  await page.getByRole("button", { name: "Add" }).first().click();
  await page.waitForTimeout(500);

  // …and write somebody who doesn't exist yet.
  await page.getByRole("button", { name: "Create a member" }).click();
  await page.getByLabel("Their name").fill("MA-B");
  await page.getByRole("radio", { name: /Producer/ }).check();
  await page.getByRole("radio", { name: /Strange on purpose/ }).check();
  await page.getByRole("radio", { name: /Brilliant and volatile/ }).check();
  await page.getByRole("button", { name: "Add them to the group" }).click();
  await page.waitForTimeout(800);

  await expect(page.getByText("MA-B").first()).toBeVisible();
  await expect(page.getByText("Written by you").first()).toBeVisible();

  await page.getByRole("button", { name: "Lock the line-up" }).click();

  await page.waitForURL("**/start/reveal");
  await expect(page.getByRole("heading", { name: "THE LONG WAY" })).toBeVisible();
  await expect(page.getByText("The line-up", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();

  await page.waitForURL("**/home");
  await expect(page.getByRole("heading", { name: "THE LONG WAY" })).toBeVisible();
  await expect(page.getByText("R5,000").first()).toBeVisible();

  // Crew distinguishes group membership from the wider crew concept, and the
  // player from the people around them.
  await page.goto("/crew");
  await expect(page.getByText("The group — THE LONG WAY")).toBeVisible();
  await expect(page.getByText("KXMO (you)")).toBeVisible();
  await expect(page.getByText(/Beyond the group, you're on your own/)).toBeVisible();

  // The player has their own world-scoped public address, separate from the
  // group's. Slugs are only unique inside a world, so read the real address
  // rather than assuming it — a previous run may already hold "kxmo".
  await page.goto("/profile");

  const groupHref = await page
    .locator('a[href^="/world/"][href*="/group/"]')
    .first()
    .getAttribute("href");
  const artistHref = await page
    .locator('a[href^="/world/"][href*="/artist/"]')
    .first()
    .getAttribute("href");

  expect(groupHref).toMatch(/^\/world\/johannesburg\/group\//);
  expect(artistHref).toMatch(/^\/world\/johannesburg\/artist\//);

  await page.goto(artistHref!);
  await expect(page.getByRole("heading", { name: /KXMO/ })).toBeVisible();
  await expect(page.getByText(/Member of/)).toBeVisible();

  // The old world-less link resolves rather than guessing.
  const artistSlug = artistHref!.split("/").pop()!;
  await page.goto(`/artist/${artistSlug}`);
  await page.waitForURL(`**/world/johannesburg/artist/${artistSlug}`);
});
