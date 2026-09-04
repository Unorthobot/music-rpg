import { expect, test, type Page } from "@playwright/test";
import { answerDiscovery, makeTrackWithFriction, registerAccount, releaseTrack } from "./helpers";

/**
 * The world starting to treat a career differently — in a browser.
 *
 * M9's acceptance run. A career puts out a record, somebody commits to it, days
 * pass, and on one of them the act changes. What is proved here is the half the
 * headless suite cannot: that the player *finds out*, on the surfaces they
 * already use, in language a person could say — and that a career which has not
 * come up is told nothing whatsoever about coming up.
 *
 * Nothing in this spec sets an act, and no assertion below is reachable by
 * looking at a screen twice. The transition happens on a day advance or it does
 * not happen.
 *
 * The copy is written out rather than imported. `@music-rpg/shared` is not on
 * this project's module graph, and an end-to-end spec should be reading what
 * reached the page anyway — the source of truth for these four strings is
 * `packages/shared/src/chapter-view.ts`, and this is the test that fails if one
 * of them changes without the other.
 */

const CHAPTER = "The Come Up";
/** `COME_UP_PLAYER_LINE` — Home on the day, and Notifications. */
const PLAYER_LINE = "Your name is starting to travel.";
/** `COME_UP_WORLD_LINE` and `CHAPTER_LINES.COME_UP` — the scene's register. */
const WORLD_LINE = "The name is starting to travel.";
/** `CHAPTER_LINES.UNDERGROUND`. */
const UNDERGROUND_LINE = "Nobody knows the name yet.";

/**
 * Vocabulary that must not survive the trip to a browser.
 *
 * The headless suite asserts this over the read models; this asserts it over
 * what a page actually rendered, which is where a stray prop or a serialised
 * payload would show up.
 */
const FORBIDDEN = [
  /\bRECEPTION\b/,
  /PUBLIC_RECORD/,
  /WORK_THAT_LANDED/,
  /AUDIENCE_THAT_STAYED/,
  /A_SCENE_THAT_KNOWS_YOU/,
  /PEOPLE_WHO_CAME_BACK/,
  /THINGS_THE_SCENE_SAW/,
  /COHORT_BREADTH/,
  /satisfiedDomains/,
  /beyondReception/i,
  /evaluatorVersion/i,
  /recognition domain/i,
  /\b\d+ of \d+\b/,
  // The row label the inspector keeps and the player must never be handed.
  /Career entered The Come Up/,
];

async function expectNoLeaks(page: Page, where: string): Promise<void> {
  const body = await page.locator("body").innerText();
  for (const term of FORBIDDEN) {
    expect(body, `${term} leaked onto ${where}`).not.toMatch(term);
  }
}

/**
 * Advance the career's clock by one in-world day.
 *
 * Waits on the day count rather than on the URL: the action posts to Home from
 * Home, so a URL wait resolves while the write is still in flight and the next
 * press lands on a stale page.
 */
async function letADayPass(page: Page): Promise<void> {
  await page.goto("/home");
  const daysOut = page
    .locator("dl div", { has: page.getByText("Days out", { exact: true }) })
    .locator("dd")
    .first();

  const before = (await daysOut.count()) ? Number(await daysOut.innerText()) : 0;
  await page.getByRole("button", { name: "Let a day pass" }).click();
  await expect(daysOut).toHaveText(String(before + 1), { timeout: 30_000 });
}

async function releaseAndCollaborate(page: Page, stageName: string, title: string): Promise<void> {
  await registerAccount(page, `${stageName} Come Up`);
  await page.getByRole("button", { name: /SOLO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/start/identity");
  await page.getByLabel("Stage name").fill(stageName);
  await page.getByRole("button", { name: "Continue" }).click();
  await answerDiscovery(page, 2);
  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
  await page.waitForURL("**/home");

  await makeTrackWithFriction(page, title);
  await releaseTrack(page, title);
}

test.describe("the come up", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the phone-width pass has its own test");
  });

  test("desktop: a day advance changes the chapter, and every surface reads the same one", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await releaseAndCollaborate(page, "COMEUPKX", "OPEN WINDOW");

    /* --- Before: an Underground career, told nothing about any of this ---- */

    await page.goto("/career");
    await expect(page.getByText(UNDERGROUND_LINE)).toBeVisible();
    await expect(page.getByText(CHAPTER, { exact: true })).toHaveCount(0);
    // No date, because a career does not *enter* the chapter it starts in.
    await expect(page.getByText(/^Began /)).toHaveCount(0);

    await page.goto("/catalogue/projects");
    await expect(page.getByText("Not at this stage of your career.").first()).toBeVisible();

    /* --- Somebody commits ------------------------------------------------- */

    // Three days is what it takes for the producer to have something to say.
    await letADayPass(page);
    await letADayPass(page);
    await letADayPass(page);

    await page.goto("/crew");
    await page.getByRole("button", { name: "Hear them out" }).click();
    await page.waitForURL("**/crew**");
    await page.getByRole("button", { name: "Invite to crew" }).click();
    await page.waitForURL("**/crew**");
    await expect(page.getByText(/Nobody has committed to this yet/)).toHaveCount(0);

    /*
     * Committing does not do it on its own, and it does not do it here.
     *
     * The record still has to reach people, and the evaluator runs on the day
     * advance and nowhere else — so the screen the player is standing on when
     * they commit says nothing about a chapter.
     */
    await page.goto("/home");
    await expect(page.getByText(PLAYER_LINE)).toHaveCount(0);

    /* --- Days pass, and one of them is the day ---------------------------- */

    let cameUp = false;
    for (let day = 0; day < 20 && !cameUp; day += 1) {
      await letADayPass(page);
      cameUp = await page.getByText(PLAYER_LINE).isVisible();
    }
    expect(cameUp, "the career never came up in twenty in-world days").toBe(true);

    /* --- Home, on the day ------------------------------------------------- */

    // Stated, not celebrated, and with nothing to do about it.
    await expect(page.getByText(PLAYER_LINE)).toBeVisible();
    await expect(page.getByRole("main").getByText(CHAPTER).first()).toBeVisible();
    await expect(page.getByText(/unlock|level|tier|rank/i)).toHaveCount(0);
    await expectNoLeaks(page, "Home");

    /*
     * Reading it changes nothing. A second look on the same in-world day is the
     * same page, because the condition is the world's clock rather than
     * anything this browser has or has not seen.
     */
    await page.reload();
    await expect(page.getByText(PLAYER_LINE)).toBeVisible();

    /* --- Notifications: told, rather than having discovered it ------------ */

    await page.goto("/notifications");
    const told = page.getByRole("link").filter({ hasText: PLAYER_LINE });
    await expect(told).toHaveCount(1);
    await expect(told).toHaveAttribute("href", "/career");
    await expectNoLeaks(page, "Notifications");

    /* --- Career: the durable home of the chapter -------------------------- */

    await told.click();
    await page.waitForURL("**/career");

    await expect(page.getByText(CHAPTER).first()).toBeVisible();
    await expect(page.getByText(WORLD_LINE).first()).toBeVisible();
    // The one fact M9 adds: when this chapter began.
    await expect(page.getByText(/^Began /)).toBeVisible();
    await expect(page.getByText(UNDERGROUND_LINE)).toHaveCount(0);
    await expectNoLeaks(page, "Career");

    /* --- World: what the scene saw, in the scene's language --------------- */

    await page.goto("/world");
    await expect(page.getByRole("main").getByText(WORLD_LINE).first()).toBeVisible();
    await expectNoLeaks(page, "World");

    /* --- Projects: a shape that was closed is open ------------------------ */

    await page.goto("/catalogue/projects");

    // The act gate is gone from every format — and what is left is a reason the
    // player can actually act on, counted honestly against one released track.
    await expect(page.getByText("Not at this stage of your career.")).toHaveCount(0);
    await expect(page.getByText("You need at least 4 tracks.").first()).toBeVisible();

    // No unlock treatment of any kind: the discovery is the screen reading
    // differently, not the screen announcing itself.
    await expect(page.getByText(/^New$/)).toHaveCount(0);
    await expectNoLeaks(page, "Projects");

    /* --- The next day: the colour goes, the fact stays -------------------- */

    await letADayPass(page);

    await expect(page.getByText(PLAYER_LINE)).toHaveCount(0);

    await page.goto("/career");
    await expect(page.getByText(CHAPTER).first()).toBeVisible();
    await expect(page.getByText(/^Began /)).toBeVisible();
  });

  /**
   * The harder half of the milestone.
   *
   * A career with a record out and nobody committed to it must be told nothing
   * — not a meter, not a hint, not a locked chapter, and above all not what it
   * is missing. The moment that hint exists, the way to play becomes farming
   * it.
   */
  test("desktop: a career with only a record is never told what it is missing", async ({ page }) => {
    test.setTimeout(600_000);

    await releaseAndCollaborate(page, "QUIETKX", "NO ANSWER");

    // The same stretch of days as the career that came up — and nobody is ever
    // invited to anything, which is the only difference between the two.
    for (let day = 0; day < 12; day += 1) {
      await letADayPass(page);
    }

    for (const [route, where] of [
      ["/home", "Home"],
      ["/career", "Career"],
      ["/world", "World"],
      ["/catalogue/projects", "Projects"],
      ["/notifications", "Notifications"],
    ] as const) {
      await page.goto(route);

      await expect(page.getByText(CHAPTER, { exact: true }), `${where} named the chapter`).toHaveCount(0);
      await expect(page.getByText(PLAYER_LINE), `${where} announced a transition`).toHaveCount(0);
      await expect(page.getByText(WORLD_LINE), `${where} announced a transition`).toHaveCount(0);

      // Nothing anywhere describes a thing this career has not got.
      const body = await page.locator("body").innerText();
      for (const hint of [
        /almost/i,
        /close to/i,
        /not yet enough/i,
        /to unlock/i,
        /you still need someone/i,
        /progress/i,
      ]) {
        expect(body, `${where} hinted at what is missing`).not.toMatch(hint);
      }

      await expectNoLeaks(page, where);
    }

    // It is an Underground career whose record is out, and it is told exactly
    // that. The music may be doing well; the chapter has not changed.
    await page.goto("/career");
    await expect(page.getByText(UNDERGROUND_LINE)).toBeVisible();

    await page.goto("/catalogue/projects");
    await expect(page.getByText("Not at this stage of your career.").first()).toBeVisible();
  });
});

test.describe("the come up on a phone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-width pass");
  });

  /**
   * The transition adds one line to Home, one date to Career and one line to
   * World. All three are single-column text in surfaces that already stack, so
   * what is actually at risk on a phone is reachability rather than layout.
   */
  test("mobile: the chapter reads in one column and is reachable from the bottom bar", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await releaseAndCollaborate(page, "PHONECU", "SHORT WAVE");

    await letADayPass(page);
    await letADayPass(page);
    await letADayPass(page);

    await page.goto("/crew");
    await page.getByRole("button", { name: "Hear them out" }).click();
    await page.waitForURL("**/crew**");
    await page.getByRole("button", { name: "Invite to crew" }).click();
    await page.waitForURL("**/crew**");

    let cameUp = false;
    for (let day = 0; day < 20 && !cameUp; day += 1) {
      await letADayPass(page);
      cameUp = await page.getByText(PLAYER_LINE).isVisible();
    }
    expect(cameUp, "the career never came up in twenty in-world days").toBe(true);

    await expect(page.getByText(PLAYER_LINE)).toBeVisible();

    // One column, nothing pushed off the side of a phone.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    /*
     * Career is reachable from the bottom navigation, and carries the date.
     *
     * The chapter lives in the shell's contextual zone, which is a third column
     * on a wide screen and a labelled drawer below `xl` — the same disclosure
     * every context panel in the app uses, and the reason this is a tap rather
     * than an assertion against the page body. What matters on a phone is that
     * it is reachable and reads in one column, not that it is on screen without
     * asking.
     */
    await page.getByRole("link", { name: "Career", exact: true }).click();
    await page.waitForURL("**/career");

    await page.getByRole("button", { name: "Chapter", exact: true }).click();
    const chapterPanel = page.getByRole("dialog", { name: "Chapter" });
    await expect(chapterPanel.getByText(CHAPTER)).toBeVisible();
    await expect(chapterPanel.getByText(/^Began /)).toBeVisible();
    await expect(chapterPanel.getByText(WORLD_LINE)).toBeVisible();

    // Scoped to the panel: the scrim behind it is also a button, named
    // "Close panel", and an unscoped lookup matches both.
    await chapterPanel.getByRole("button", { name: "Close", exact: true }).click();

    await page.getByRole("link", { name: "World", exact: true }).click();
    await page.waitForURL("**/world");
    await expect(page.getByRole("main").getByText(WORLD_LINE).first()).toBeVisible();
  });
});
