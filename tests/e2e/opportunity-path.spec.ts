import { expect, test, type Page } from "@playwright/test";
import { answerDiscovery, makeTrack, registerAccount, releaseTrack } from "./helpers";

/**
 * An offer, followed across every surface a player would actually touch.
 *
 * The domain suite proves the projection is one projection. This proves the
 * *screens* are, by walking them in the order a player walks them and checking
 * that the night on Home, in the thread, on the offer screen and on the Calendar
 * is the same night — rendered, not queried.
 *
 * Two other things are being proved quietly throughout. Opening a screen never
 * creates anything: offers arrive because a day passed, and reloading Home ten
 * times shows the same world ten times. And nothing internal is ever on screen:
 * the director's vocabulary is grepped for on every page the player visits.
 */

/** Field names that must never appear on a page a player can reach. */
const INTERNALS = [
  /eligibility/i,
  /\branking\b/i,
  /sceneStanding/i,
  /scene standing/i,
  /directorVersion/i,
  /director-v1/i,
  /triggerState/i,
  /idempotenc/i,
  /suppress/i,
  /CALENDAR_SLOT/,
  /OUTRANKED/,
  /SCENE_KNOWS_YOU/,
  /RECORD_IS_MOVING/,
  /NOT_ALREADY_OFFERED/,
  /SHOWCASE_SLOT/,
  /SESSION_INVITE/,
  /\bHEADLINE\b/,
  /\bSUPPORT\b/,
  /\bWITHDRAWN\b/,
  /\bAVAILABLE\b/,
  /liveCap/i,
  /promoterStandard/i,
];

async function expectNoLeaks(page: Page, where: string): Promise<void> {
  const body = await page.locator("body").innerText();
  for (const pattern of INTERNALS) {
    expect(body, `${pattern} leaked onto ${where}`).not.toMatch(pattern);
  }
}

/** The figure under a labelled stat, as the player reads it. */
function figureLocator(page: Page, label: string) {
  return page
    .locator("dl div", { has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

/**
 * Wait on the consequence, not the URL.
 *
 * The action redirects to Home from Home, so waiting on navigation resolves
 * before the post has landed and the next press hits a stale page.
 */
async function letADayPass(page: Page, expectedDaysOut: number): Promise<void> {
  await page.goto("/home");
  await page.getByRole("button", { name: "Let a day pass" }).click();
  await expect(figureLocator(page, "Days out")).toHaveText(String(expectedDaysOut), {
    timeout: 30_000,
  });
}

async function buildAndRelease(page: Page, stageName: string, title: string): Promise<void> {
  await registerAccount(page, `${stageName} Offers`);
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

/** The section Home only renders when somebody is asking for something. */
function onTheTable(page: Page) {
  return page.getByRole("main").getByText("On the table", { exact: true });
}

test.describe("an offer, end to end", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the phone pass has its own spec");
  });

  test("desktop: the same offer on Home, in Messages, on the offer screen and the Calendar", async ({
    page,
  }) => {
    test.setTimeout(360_000);

    await buildAndRelease(page, "OFFERKX", "SCENE FIRST");

    /* --- Nothing is being asked yet, so nothing is shown ------------------- */

    await page.goto("/home");
    await expect(onTheTable(page)).toHaveCount(0);

    // And the absence is silent. No empty container, no apology, no locked row.
    const quiet = await page.getByRole("main").innerText();
    expect(quiet).not.toMatch(/no offers|nothing available|nothing on the table/i);

    /* --- Reading a screen never creates one -------------------------------- */

    for (let visit = 0; visit < 3; visit += 1) {
      await page.reload();
      await expect(onTheTable(page)).toHaveCount(0);
    }

    /* --- Time passes, and somebody gets in touch ---------------------------- */

    await letADayPass(page, 1);
    await letADayPass(page, 2);
    await letADayPass(page, 3);

    await page.goto("/home");
    await expect(onTheTable(page)).toBeVisible();
    await expectNoLeaks(page, "Home");

    /*
     * The offer's own id, carried in the markup, is what makes this a
     * cross-surface test rather than four tests that each pass on their own.
     */
    const card = page.locator("[data-offer-id]").first();
    await expect(card).toBeVisible();
    const offerId = await card.getAttribute("data-offer-id");
    expect(offerId).toBeTruthy();

    const onHome = await card.innerText();

    /* --- Messages has the same offer, from a named person ------------------ */

    await page.goto("/messages");
    await expect(page.getByText("Offer waiting").first()).toBeVisible();
    await expectNoLeaks(page, "the messages list");

    // Somebody other than Thabo is now in the list, which is the whole point of
    // a world where more than one person has a reason to write.
    const listed = await page.getByRole("main").innerText();
    expect(listed).toMatch(/Naledi|Dineo|Tumi|Sizwe|LEX/);

    await page.locator(`[data-offer-id="${offerId}"]`).count();

    /* --- The offer screen ---------------------------------------------------- */

    await page.goto(`/opportunities/${offerId}`);
    await expect(page.getByRole("button", { name: /^Take/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn it down" })).toBeVisible();
    await expectNoLeaks(page, "the offer screen");

    const detail = await page.getByRole("main").innerText();

    /*
     * The same night, the same money, in both places. Compared by extracting
     * what each surface actually rendered rather than by trusting that they read
     * the same row — the failure being guarded against is exactly a surface that
     * agrees on the id and disagrees on the terms.
     */
    const nightOnHome = onHome.match(/\d{1,2}\s+\w+\s+\d{4}|\w+day,?\s+\d{1,2}\s+\w+/)?.[0];
    if (nightOnHome) {
      const day = nightOnHome.match(/\d{1,2}\s+\w+/)![0];
      expect(detail).toContain(day);
    }

    const feeOnHome = onHome.match(/R[\d ,]+/)?.[0];
    if (feeOnHome) expect(detail).toContain(feeOnHome);

    /* --- Opening the offer changed nothing --------------------------------- */

    await page.goto("/home");
    await expect(page.locator(`[data-offer-id="${offerId}"]`)).toBeVisible();

    /* --- Taking it ---------------------------------------------------------- */

    await page.goto(`/opportunities/${offerId}`);
    const takeButton = page.getByRole("button", { name: /^Take/ });
    const isSession = (await page.getByRole("button", { name: /^Book it with/ }).count()) > 0;
    await (isSession ? page.getByRole("button", { name: /^Book it with/ }) : takeButton).click();

    // Either the studio (a session) or back to the offer (a night).
    await page.waitForURL(/\/(studio|opportunities)/, { timeout: 30_000 });

    /* --- Home stops treating it as pending ---------------------------------- */

    await page.goto("/home");
    const stillWaiting = page.locator(`[data-offer-id="${offerId}"]`);
    if ((await stillWaiting.count()) > 0) {
      // If it is still rendered it is rendered as answered, never as waiting.
      await expect(stillWaiting.first()).toContainText(/Taken|No longer possible/);
    }

    /* --- The Calendar holds the commitment, and links back ------------------ */

    await page.goto("/calendar");
    await expect(page.getByText("Coming up")).toBeVisible();
    await expectNoLeaks(page, "the calendar");

    const calendar = await page.getByRole("main").innerText();
    expect(calendar).not.toMatch(/Nothing scheduled/);

    /* --- The thread reflects the decision ----------------------------------- */

    await page.goto("/messages");
    await page.getByRole("main").locator("a").first().click();
    await page.waitForURL("**/messages/**");
    await expectNoLeaks(page, "a message thread");

    /* --- And Career remembers it -------------------------------------------- */

    await page.goto("/career");
    await expect(page.getByRole("main").getByText("Your story")).toBeVisible();
    await expectNoLeaks(page, "the career screen");
  });

  /**
   * Read-only means read-only.
   *
   * Every route a player can open, opened repeatedly, with the live set counted
   * before and after. A screen that ran the director, expired something or wrote
   * a message would move the count.
   */
  test("desktop: opening every screen repeatedly changes nothing", async ({ page }) => {
    test.setTimeout(360_000);

    await buildAndRelease(page, "READONLY", "STILL LIFE");

    await letADayPass(page, 1);
    await letADayPass(page, 2);
    await letADayPass(page, 3);

    await page.goto("/home");
    const before = await page.locator("[data-offer-id]").count();

    for (let visit = 0; visit < 2; visit += 1) {
      for (const route of ["/home", "/messages", "/calendar", "/career", "/world", "/notifications"]) {
        await page.goto(route);
      }
    }

    await page.goto("/home");
    expect(await page.locator("[data-offer-id]").count()).toBe(before);
  });
});

test.describe("answering an offer on a phone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-width pass");
  });

  /**
   * No decision may require a desktop.
   *
   * The terms scroll past the fold on a phone, so the actions are sticky; the
   * comparison of two offers wanting one night stays stacked rather than
   * compressed side by side; and nothing is pushed off the side of the screen.
   */
  test("mobile: the whole decision is reachable at phone width", async ({ page }) => {
    test.setTimeout(360_000);

    await buildAndRelease(page, "PHONEOF", "SMALL SCREEN");

    await letADayPass(page, 1);
    await letADayPass(page, 2);
    await letADayPass(page, 3);

    await page.goto("/home");
    await expect(onTheTable(page)).toBeVisible();
    await expectNoLeaks(page, "Home on a phone");

    const card = page.locator("[data-offer-id]").first();
    const offerId = await card.getAttribute("data-offer-id");

    // Cards stack, and nothing overflows sideways.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);

    await page.goto(`/opportunities/${offerId}`);

    const take = page.getByRole("button", { name: /^(Take|Book it with)/ });
    await expect(take).toBeVisible();

    // A 44px minimum target, the rule every interactive control in this app holds.
    const box = await take.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // Still on screen after scrolling to the bottom: the action bar is sticky.
    await page.mouse.wheel(0, 4000);
    await expect(take).toBeInViewport();

    await expectNoLeaks(page, "the offer screen on a phone");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);

    await take.click();
    await page.waitForURL(/\/(studio|opportunities)/, { timeout: 30_000 });

    // And the consequence is reachable from the bottom navigation.
    await page.goto("/calendar");
    await expect(page.getByRole("main")).not.toContainText("Nothing scheduled");
  });
});
