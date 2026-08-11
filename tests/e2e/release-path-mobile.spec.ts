import { expect, test } from "@playwright/test";
import { answerDiscovery, makeTrack, registerAccount, releaseTrack } from "./helpers";

/**
 * The release path on a phone.
 *
 * The desktop spec proves the flow; this proves the flow *composes* at phone
 * width — where the sidebar is gone, navigation is the bottom bar, the release
 * choices stack instead of sitting side by side, and the mini-player sits above
 * the nav rather than across the foot of a wide window.
 *
 * The assertion that matters most is the same one: playback lives above the
 * routes, so moving through the bottom navigation must not interrupt it.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone-width pass");
});

test("mobile: release a track and keep playing across the bottom navigation", async ({ page }) => {
  test.setTimeout(240_000);

  await registerAccount(page, "Phone Release");
  await page.getByRole("button", { name: /SOLO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/start/identity");
  await page.getByLabel("Stage name").fill("KXMO");
  await page.getByRole("button", { name: "Continue" }).click();
  await answerDiscovery(page, 1);
  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
  await page.waitForURL("**/home");

  await makeTrack(page, "LOW SIGNAL");
  const publicHref = await releaseTrack(page, "LOW SIGNAL");

  // The world feed is reachable from the bottom navigation on a phone.
  await page.getByRole("link", { name: "World", exact: true }).click();
  await page.waitForURL("**/world");
  await expect(page.getByText("Out in Johannesburg")).toBeVisible();
  await expect(page.getByText("LOW SIGNAL")).toBeVisible();

  // Start playback from the track's own page.
  await page.goto("/catalogue");
  await page.getByText("LOW SIGNAL").click();
  await page.waitForURL("**/catalogue/**");

  const main = page.locator("main");
  await main.getByRole("button", { name: "Play" }).click();
  await expect(main.getByRole("button", { name: "Pause" })).toBeVisible();

  // The mini-player sits above the bottom navigation and shows the track.
  const player = page.locator("footer");
  await expect(player.getByText("LOW SIGNAL")).toBeVisible();

  // Navigate with the bottom bar — the provider is above the routes, so the
  // track keeps playing through every destination.
  for (const [href, label] of [
    ["/home", "Home"],
    ["/studio", "Studio"],
    ["/career", "Career"],
    ["/crew", "Crew"],
    ["/world", "World"],
  ] as const) {
    await page.getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL(`**${href}`);
    await expect(player.getByText("LOW SIGNAL")).toBeVisible();
    await expect(
      page.getByText("Nothing playing yet — your catalogue starts in the Studio."),
    ).toHaveCount(0);
  }

  // A hard reload is a different promise. Playback is session state, so the
  // mini-player returns to its idle line — while the career and the release it
  // made are server state, and are exactly where they were.
  await page.reload();
  await expect(
    page.getByText("Nothing playing yet — your catalogue starts in the Studio."),
  ).toBeVisible();
  await expect(page.getByText("Out in Johannesburg")).toBeVisible();
  await expect(page.getByText("LOW SIGNAL")).toBeVisible();

  // The public page reads correctly at phone width.
  await page.goto(publicHref);
  await expect(page.getByRole("heading", { name: "LOW SIGNAL" })).toBeVisible();
  await expect(page.getByText("Primary artist ·")).toBeVisible();
  await expect(page.getByText(/\d+ fans/)).toHaveCount(0);
});
