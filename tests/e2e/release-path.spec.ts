import { expect, test, type Page } from "@playwright/test";
import { answerDiscovery, makeTrack, registerAccount, releaseTrack } from "./helpers";

/**
 * M4's acceptance line, in the browser:
 *
 * make a track → plan it → publish it → see it in the world → play it →
 * navigate without interrupting playback → view it publicly — and do the same
 * from a group career with attribution intact.
 */

/*
 * Desktop only for now. The flows themselves are exercised at phone width by
 * studio-path; what is missing here is a mobile-specific pass over the release
 * screens and the mini-player's navigation behaviour, which needs its own
 * selectors rather than a shared one.
 */
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "release path is covered on desktop");
});

test("solo: plan a release, put it out, and keep playing while you move around", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await registerAccount(page, "Release Player");
  await page.getByRole("button", { name: /SOLO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/start/identity");
  await page.getByLabel("Stage name").fill("KXMO");
  await page.getByRole("button", { name: "Continue" }).click();
  await answerDiscovery(page, 1);
  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
  await page.waitForURL("**/home");

  await makeTrack(page, "NO RECEPTION");

  /*
   * Before release, the world cannot find *this* record.
   *
   * Not "the city is empty": the world feed is shared by every career in it, so
   * whether Johannesburg is quiet depends on which specs ran first. What is
   * actually being claimed is that unreleased work is undiscoverable, and that
   * claim survives other people releasing things.
   */
  await page.goto("/world");
  await expect(page.getByRole("main").getByText("NO RECEPTION", { exact: true })).toHaveCount(0);

  // Projects are visible and honestly locked, not hidden.
  await page.goto("/catalogue/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("Not at this stage of your career.").first()).toBeVisible();

  const publicHref = await releaseTrack(page, "NO RECEPTION");

  // --- the world can discover it ----------------------------------------
  await page.goto("/world");
  await expect(page.getByText("Out in Johannesburg")).toBeVisible();

  // Scoped to this record's own row: the feed is shared, so "a solo release is
  // listed" is not the same claim as "this one is".
  const listing = page.getByRole("main").getByRole("link", { name: /NO RECEPTION/ }).first();
  await expect(listing).toBeVisible();
  await expect(listing).toContainText("Solo release");

  // --- playback survives navigation --------------------------------------
  await page.goto("/catalogue");
  await page.getByRole("main").getByText("NO RECEPTION", { exact: true }).first().click();
  await page.waitForURL("**/catalogue/**");

  const main = page.locator("main");
  await main.getByRole("button", { name: "Play" }).click();
  await expect(main.getByRole("button", { name: "Pause" })).toBeVisible();

  // The mini-player is showing the track, not the idle state.
  const player = page.locator("footer");
  await expect(player.getByText("NO RECEPTION")).toBeVisible();

  // Move around the app. Playback is above the routes, so it does not reset.
  for (const [href, label] of [
    ["/home", "Home"],
    ["/career", "Career"],
    ["/studio", "Studio"],
    ["/world", "World"],
  ] as const) {
    await page.getByRole("link", { name: label, exact: true }).first().click();
    await page.waitForURL(`**${href}`);
    await expect(player.getByText("NO RECEPTION")).toBeVisible();
    await expect(
      page.getByText("Nothing playing yet — your catalogue starts in the Studio."),
    ).toHaveCount(0);
  }

  // --- public page --------------------------------------------------------
  await page.goto(publicHref);
  await expect(page.getByRole("heading", { name: "NO RECEPTION" })).toBeVisible();
  await expect(page.getByText("Out now").first()).toBeVisible();
  await expect(page.getByText("Primary artist ·")).toBeVisible();
  await expect(page.getByText("KXMO", { exact: false }).first()).toBeVisible();

  // Nothing on a public page claims an audience that hasn't happened.
  await expect(page.getByText(/\d+ fans/)).toHaveCount(0);
});

test("group: a released track is billed to the group and still credits the member", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await registerAccount(page, "Group Release");
  await page.getByRole("button", { name: /GROUP/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/start/identity");
  await page.getByLabel("Group name").fill("THE LONG WAY");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/start/founder");
  await page.getByLabel("Your stage name").fill("KXMO");
  await page.getByRole("button", { name: "Continue" }).click();

  await answerDiscovery(page, 0);
  await page.waitForURL("**/start/members");
  await page.getByRole("button", { name: "Add" }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Lock the line-up" }).click();

  await page.waitForURL("**/start/reveal");
  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
  await page.waitForURL("**/home");

  await makeTrack(page, "SECOND WIND");
  const publicHref = await releaseTrack(page, "SECOND WIND");

  await page.goto("/world");
  await expect(page.getByText("Group release")).toBeVisible();

  await page.goto(publicHref);
  await expect(page.getByRole("heading", { name: "SECOND WIND" })).toBeVisible();

  // The group is billed…
  await expect(page.getByText("THE LONG WAY").first()).toBeVisible();

  // …and the player's founding artist is still credited on it. Losing this is
  // the solo assumption we are specifically testing for.
  const credits = page.locator("section").filter({ hasText: "Credits" });
  await expect(credits.getByText("Primary artist ·")).toBeVisible();
  await expect(credits.getByText("THE LONG WAY")).toBeVisible();
  await expect(credits.getByText("Contributing artist ·")).toBeVisible();
  await expect(credits.getByRole("link", { name: "KXMO" })).toBeVisible();
});
