import { expect, test, type Page } from "@playwright/test";
import { answerDiscovery, makeTrack, registerAccount, releaseTrack } from "./helpers";

/**
 * Watching an audience appear.
 *
 * The acceptance run for M5: a record goes out at zero reception, the player
 * advances three in-world days, and each day says what it was before it says
 * what it counted. What is being proved is that reception *unfolds* — a
 * trajectory the player walks through rather than a final score waiting behind
 * a refresh.
 *
 * The assertions avoid pinning phrases that depend on how this particular
 * record sounds. Day one is always discovery, because nobody can pass on a
 * record they have not heard; everything after that is the simulation's to
 * decide, and a spec that demanded a specific verdict would be testing the
 * seed rather than the game.
 */

/** The figure under a labelled stat, as the player reads it. */
function figureLocator(page: Page, label: string) {
  return page
    .locator("dl div", { has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

async function figure(page: Page, label: string): Promise<number> {
  return Number((await figureLocator(page, label).innerText()).replace(/[^0-9]/g, ""));
}

/**
 * Wait on the consequence, not the URL.
 *
 * The action redirects to Home from Home, so a URL wait resolves before the
 * post has even landed and the next press lands on a stale page. The day count
 * is the thing that actually has to change, so that is what is waited for —
 * which makes the progression an assertion rather than a hope.
 */
async function letADayPass(page: Page, expectedDaysOut: number): Promise<void> {
  await page.getByRole("button", { name: "Let a day pass" }).click();
  await expect(figureLocator(page, "Days out")).toHaveText(String(expectedDaysOut), {
    timeout: 30_000,
  });
}

async function buildAndRelease(page: Page, stageName: string, title: string): Promise<void> {
  await registerAccount(page, `${stageName} Reception`);
  await page.getByRole("button", { name: /SOLO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/start/identity");
  await page.getByLabel("Stage name").fill(stageName);
  await page.getByRole("button", { name: "Continue" }).click();
  await answerDiscovery(page, 2);
  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
  await page.waitForURL("**/home");

  await makeTrack(page, title);
  await releaseTrack(page, title);
}

test.describe("reception", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the mobile pass has its own spec");
  });

  test("desktop: an audience appears over three days, and every number agrees", async ({ page }) => {
    test.setTimeout(300_000);

    await buildAndRelease(page, "FIRST LIGHT", "FIRST LIGHT");

    /* --- Out, and nothing has come back ---------------------------------- */

    await page.goto("/home");
    await expect(page.getByText("FIRST LIGHT is out. Nobody knows what happens next.")).toBeVisible();

    // Reception has not run, so nothing claims it has.
    await expect(page.getByText("Unique listeners")).toHaveCount(0);

    /* --- Day one: discovery ---------------------------------------------- */

    await letADayPass(page, 1);

    await expect(
      page.getByText("FIRST LIGHT is out. Nobody knows what happens next."),
    ).toHaveCount(0);
    const listenersAfterDayOne = await figure(page, "Unique listeners");
    expect(listenersAfterDayOne).toBeGreaterThan(0);

    /* --- Days two and three ---------------------------------------------- */

    await letADayPass(page, 2);
    await letADayPass(page, 3);

    // The audience only ever grows: these are people, counted once each.
    const listeners = await figure(page, "Unique listeners");
    expect(listeners).toBeGreaterThanOrEqual(listenersAfterDayOne);

    /* --- The record's own page ------------------------------------------- */

    await page.getByRole("link", { name: /See how it/ }).click();
    await page.waitForURL("**/catalogue/**");

    await expect(page.getByText("3 days out")).toBeVisible();

    // Time is visible as a sequence, not as a number that changed.
    for (const day of ["Day 1", "Day 2", "Day 3"]) {
      await expect(page.getByText(day, { exact: true })).toBeVisible();
    }
    await expect(page.getByText("People are starting to find it.")).toBeVisible();

    // Who is responding, cohort by cohort, in words rather than rates.
    await expect(page.getByText("Who’s responding")).toBeVisible();
    for (const cohort of ["Scene heads", "Casual listeners", "Tastemakers"]) {
      await expect(page.getByText(cohort, { exact: true })).toBeVisible();
    }

    // The figure on Home and the figure on the record are the same figure.
    expect(await figure(page, "Unique listeners")).toBe(listeners);

    // Four separate measures, and none of them collapsed into the others.
    for (const label of ["Fans gained", "Engaged listeners", "Returners"]) {
      await expect(page.getByText(label)).toBeVisible();
    }

    /* --- Nothing internal escaped ---------------------------------------- */

    const body = await page.locator("body").innerText();
    for (const internal of [
      /\bfit\b/i,
      /artistFit/i,
      /qualityFit/i,
      /engagementBias/i,
      /shareAmplification/i,
      /reception-v1/i,
      // Momentum reaches the player as "Holding steady", never as a figure.
      /momentum/i,
      /\bseed\b/i,
    ]) {
      expect(body, `"${internal}" leaked onto the record's page`).not.toMatch(internal);
    }

    /* --- What it did to the career --------------------------------------- */

    await page.goto("/career");
    await expect(page.getByText("This week")).toBeVisible();

    // Legacy is reported, and reported as unchanged. That restraint is the
    // whole statement — a first single does not write a legacy.
    // The innermost element carrying both is the row itself: its label child
    // has the level but not the movement, and the card above has neither.
    const legacyRow = page
      .locator("div")
      .filter({ hasText: "Legacy" })
      .filter({ hasText: "Unchanged" })
      .last();
    await expect(legacyRow).toContainText("Not written");
    await expect(legacyRow).toContainText("Unchanged");
  });
});

test.describe("reception on a phone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-width pass");
  });

  test("mobile: the day trail and the cohort breakdown stack and stay reachable", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    await buildAndRelease(page, "SECOND WIND", "SECOND WIND");

    await page.goto("/home");
    await expect(
      page.getByText("SECOND WIND is out. Nobody knows what happens next."),
    ).toBeVisible();

    await letADayPass(page, 1);
    await letADayPass(page, 2);
    await letADayPass(page, 3);

    const listeners = await figure(page, "Unique listeners");
    expect(listeners).toBeGreaterThan(0);

    // Reachable from the record itself rather than from a desktop-only panel.
    await page.getByRole("link", { name: /See how it/ }).click();
    await page.waitForURL("**/catalogue/**");

    await expect(page.getByText("3 days out")).toBeVisible();
    await expect(page.getByText("Day 3", { exact: true })).toBeVisible();
    await expect(page.getByText("Scene heads", { exact: true })).toBeVisible();
    expect(await figure(page, "Unique listeners")).toBe(listeners);

    // The page scrolls in one column: nothing is pushed off the side of a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // And the world knows the record exists, without knowing how it is doing.
    await page.getByRole("link", { name: "World", exact: true }).click();
    await page.waitForURL("**/world");

    const inWorld = page.getByRole("main").getByRole("link", { name: /SECOND WIND/ }).first();
    await expect(inWorld).toBeVisible();
    await expect(inWorld).toContainText(/Released (today|yesterday|\d+ days ago)/);

    // The world is told the record exists. How it is doing stays private.
    await expect(page.getByText("Unique listeners")).toHaveCount(0);
    await expect(page.getByText("Who’s responding")).toHaveCount(0);
  });
});
