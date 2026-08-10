import { expect, test, type Page } from "@playwright/test";
import { answerDiscovery, registerAccount } from "./helpers";

/**
 * M4's acceptance line, in the browser:
 *
 * make a track → plan it → publish it → see it in the world → play it →
 * navigate without interrupting playback → view it publicly — and do the same
 * from a group career with attribution intact.
 */

/** Everything M3 does, through the interface, ending on a saved track. */
async function makeTrack(page: Page, title: string): Promise<void> {
  await page.getByRole("link", { name: "Read it" }).click();
  await page.getByRole("link", { name: "See the producers" }).click();
  await page.getByRole("button", { name: /Book a session with/ }).first().click();
  await page.waitForURL("**/studio");

  await page.getByRole("button", { name: "Start the session" }).click();
  await page.waitForURL("**/studio/session/**");

  await page.getByRole("button", { name: /Tell a story/ }).click();
  await page.getByRole("button", { name: "Tense", exact: true }).click();
  await page.getByRole("button", { name: /^Tell (LEX|MO|ZERO)$/ }).click();

  // Wait for the producer to actually come back before choosing an idea.
  await page.getByText(/came back with three/).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "Make this one" }).first().click();
  await page.getByRole("button", { name: "Master this" }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Master this" }).click();
  await page.getByText("Mastered — name it and keep it").waitFor({ timeout: 60_000 });

  await page.getByLabel("Track title").fill(title);
  await page.getByRole("button", { name: "Save to catalogue" }).click();
  await page.waitForURL("**/home");
}

/** Plan → shape → approach → date → out. */
async function releaseTrack(page: Page, title: string): Promise<string> {
  await page.goto("/catalogue");
  await expect(page.getByText(title)).toBeVisible();
  await page.getByText(title).click();
  await page.waitForURL("**/catalogue/**");

  // Unreleased work offers exactly two doors.
  await expect(page.getByRole("button", { name: "Keep it private" })).toBeVisible();
  await page.getByRole("button", { name: "Plan a release" }).click();

  // A one-track career is told what an album would need, rather than offered one.
  await expect(page.getByText("Not at this stage of your career.").first()).toBeVisible();

  await page.getByRole("button", { name: /^Single/ }).click();
  await page.getByRole("button", { name: /^Drop it/ }).click();
  await page.getByRole("button", { name: "As soon as possible" }).click();

  await expect(page.getByText(/Scheduled for/)).toBeVisible();
  await page.getByRole("button", { name: "Put it out" }).click();

  await expect(page.getByText("Out in the world")).toBeVisible();

  const publicHref = await page
    .getByRole("link", { name: "See its public page" })
    .getAttribute("href");

  return publicHref!;
}

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

  // Before release, the world has nothing to find.
  await page.goto("/world");
  await expect(page.getByText("The scene is quiet for now.")).toBeVisible();

  // Projects are visible and honestly locked, not hidden.
  await page.goto("/catalogue/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("Not at this stage of your career.").first()).toBeVisible();

  const publicHref = await releaseTrack(page, "NO RECEPTION");

  // --- the world can discover it ----------------------------------------
  await page.goto("/world");
  await expect(page.getByText("Out in Johannesburg")).toBeVisible();
  await expect(page.getByText("NO RECEPTION")).toBeVisible();
  await expect(page.getByText("Solo release")).toBeVisible();

  // --- playback survives navigation --------------------------------------
  await page.goto("/catalogue");
  await page.getByText("NO RECEPTION").click();
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
