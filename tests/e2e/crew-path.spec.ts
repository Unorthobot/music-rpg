import { expect, test, type Page } from "@playwright/test";
import {
  answerDiscovery,
  makeTrackWithFriction,
  registerAccount,
  releaseTrack,
} from "./helpers";

/**
 * The full relationship loop, through the interface.
 *
 * > history → relationship state → moment → player decision →
 * > relationship event → new state → remembered history
 *
 * What is being proved is that the loop closes. A tense session produces a
 * relationship; days passing produce something LEX wants to say; answering it
 * changes the relationship and retires the moment permanently — and a reload
 * reproduces the state afterwards rather than rerolling any of it.
 *
 * Also proved, quietly: opening Crew never causes any of this. The moment is
 * only ever there because time passed.
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

async function buildTenseCareer(page: Page, stageName: string, title: string): Promise<void> {
  await registerAccount(page, `${stageName} Crew`);
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

test.describe("crew and relationships", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the mobile pass has its own spec");
  });

  test("desktop: history becomes a relationship, a moment, a decision, and history again", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    await buildTenseCareer(page, "TENSEKX", "SAID NOTHING");

    /* --- Somebody you worked with. Not crew. ----------------------------- */

    await page.goto("/crew");
    await expect(page.getByText("LEX", { exact: true }).first()).toBeVisible();

    // Collaboration is history; crew is commitment, and nobody has committed.
    await expect(page.getByText(/Nobody has committed to this yet/)).toBeVisible();

    // Nothing is waiting on the player, because no day has passed.
    await expect(page.getByText("Waiting on you")).toHaveCount(0);

    // Reloading does not conjure one either — screens reveal, they don't decide.
    await page.reload();
    await expect(page.getByText("Waiting on you")).toHaveCount(0);

    /* --- Time passes, and LEX has something to say ----------------------- */

    await letADayPass(page);
    await letADayPass(page);
    await letADayPass(page);

    await page.goto("/crew");
    await expect(page.getByText("Waiting on you")).toBeVisible();
    await expect(page.getByText("LEX wants to talk.")).toBeVisible();

    // The relationship is stated in words, and tension sits among them rather
    // than being flagged as a fault.
    const before = await page.locator("body").innerText();
    expect(before).toMatch(/respect/i);
    expect(before).toMatch(/tension/i);

    // Persisted, not rolled: the same moment survives a reload.
    await page.reload();
    await expect(page.getByText("LEX wants to talk.")).toBeVisible();

    /* --- The player answers ---------------------------------------------- */

    await page.getByRole("button", { name: "Hear them out" }).click();
    await page.waitForURL("**/crew**");

    // The moment is gone as something to act on, for good.
    await expect(page.getByText("LEX wants to talk.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Hear them out" })).toHaveCount(0);

    // And answering changed the relationship: hearing somebody out clears air.
    const after = await page.locator("body").innerText();
    expect(after).not.toBe(before);

    // A reload reproduces the post-response state rather than rerolling it.
    await page.reload();
    await expect(page.getByText("LEX wants to talk.")).toHaveCount(0);
    expect(await page.locator("body").innerText()).toContain("LEX");

    /* --- And crew is still a separate, explicit act ---------------------- */

    await page.getByRole("button", { name: "Invite to crew" }).click();
    await page.waitForURL("**/crew**");

    await expect(page.getByText("Crew", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Nobody has committed to this yet/)).toHaveCount(0);
    // What was agreed is shown apart from how they feel.
    await expect(page.getByText("A share of what it makes")).toBeVisible();

    /* --- Nothing internal escaped ---------------------------------------- */

    const body = await page.locator("body").innerText();
    for (const internal of [/creativeChemistry/i, /familiarity/i, /\btrust \d/i, /relationships-v1/i]) {
      expect(body, `"${internal}" leaked onto the crew screen`).not.toMatch(internal);
    }
  });
});

test.describe("crew on a phone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "phone-width pass");
  });

  test("mobile: the moment leads, and answering it closes the loop", async ({ page }) => {
    test.setTimeout(300_000);

    await buildTenseCareer(page, "PHONEKX", "QUIET ROOM");

    await letADayPass(page);
    await letADayPass(page);
    await letADayPass(page);

    // Reachable from the bottom navigation on a phone.
    await page.getByRole("link", { name: "Crew", exact: true }).click();
    await page.waitForURL("**/crew");

    await expect(page.getByText("LEX wants to talk.")).toBeVisible();

    // The moment is above the ordinary actions, which is the whole hierarchy.
    // Scoped to the page's own content: the shell renders navigation and a
    // context drawer around it, and their order is not what is being claimed.
    // Lower-cased because these are section labels: CSS uppercases them, and
    // innerText returns what is rendered rather than what was written.
    const main = (await page.getByRole("main").innerText()).toLowerCase();
    expect(main).toContain("waiting on you");
    expect(main.indexOf("waiting on you")).toBeLessThan(main.indexOf("collaborators"));

    await page.getByRole("button", { name: "Hear them out" }).click();
    await page.waitForURL("**/crew**");
    await expect(page.getByText("LEX wants to talk.")).toHaveCount(0);

    // One column, nothing pushed off the side.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
