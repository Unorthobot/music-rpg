import { expect, test, type Page } from "@playwright/test";
import {
  answerDiscovery,
  makeTrackWithFriction,
  registerAccount,
  releaseTrack,
} from "./helpers";

/**
 * A career that can keep going.
 *
 * The full arc the milestone exists to make possible, through the interface:
 *
 *     first track → released → the world reacts → LEX asks for another →
 *     accept → a real session in the Studio → the second one begins
 *
 * Until now the last three arrows did not exist. Booking a session was gated on
 * Thabo's one-time introduction, so every career in this game had exactly one
 * record in it. This walks the whole thing as a player, because the claim being
 * made is about the game rather than about a function.
 */

function figureLocator(page: Page, label: string) {
  return page
    .locator("dl div", { has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

async function letADayPass(page: Page, expectedDaysOut: number): Promise<void> {
  await page.goto("/home");
  await page.getByRole("button", { name: "Let a day pass" }).click();
  await expect(figureLocator(page, "Days out")).toHaveText(String(expectedDaysOut), {
    timeout: 30_000,
  });
}

test.describe("the second record", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one pass is enough for this arc");
  });

  test("desktop: a producer asks for another, and the studio opens again", async ({ page }) => {
    test.setTimeout(600_000);

    /* --- The first record --------------------------------------------------- */

    await registerAccount(page, "SECOND Record");
    await page.getByRole("button", { name: /SOLO/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/start/identity");
    await page.getByLabel("Stage name").fill("SECONDKX");
    await page.getByRole("button", { name: "Continue" }).click();
    await answerDiscovery(page, 2);
    await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
    await page.waitForURL("**/home");

    /*
     * With friction in the room, deliberately. A producer asks to go again
     * because of what happened between two people — a set refused, a second
     * pass taken, a revision asked for. The clean path is a career in which
     * nobody ever disagreed, and it does not, and should not, produce an
     * invitation.
     */
    await makeTrackWithFriction(page, "SCENE FIRST");
    await releaseTrack(page, "SCENE FIRST");

    // One session, and it is finished. There is no way to book another yet, and
    // the Studio says so honestly rather than offering a button that cannot work.
    await page.goto("/studio");
    await expect(page.getByText("No session booked.")).toBeVisible();

    /* --- The world reacts --------------------------------------------------- */

    await letADayPass(page, 1);
    await letADayPass(page, 2);
    await letADayPass(page, 3);

    /* --- Somebody asks ------------------------------------------------------ */

    await page.goto("/home");

    // Anchored on the offer card itself rather than on a name in a preview:
    // Thabo's thread mentions the producer by name too, and matching that would
    // find the connector's conversation instead of the producer's.
    const inviteCard = page
      .locator("[data-offer-id]")
      .filter({ hasText: "Another session" })
      .first();

    await expect(inviteCard).toBeVisible({ timeout: 15_000 });
    const inviteId = await inviteCard.getAttribute("data-offer-id");
    expect(inviteId).toBeTruthy();

    // And it arrived as a message from the person who made it, in their thread.
    await page.goto("/messages");
    await expect(page.getByText("Offer waiting").first()).toBeVisible();

    await page.goto(`/opportunities/${inviteId}`);
    const backToPerson = page.getByRole("link", { name: /^←/ });
    await expect(backToPerson).toBeVisible();
    await backToPerson.click();
    await page.waitForURL("**/messages/**");

    await expect(
      page.locator(`[data-offer-id="${inviteId}"]`),
      "the invitation is not in the producer's own thread",
    ).toBeVisible();

    /* --- Accepting books a real session ------------------------------------- */

    await page.goto(`/opportunities/${inviteId}`);

    // What it costs, and against what — the world offering something a career
    // may not be able to afford is a real situation and is stated plainly.
    await expect(page.getByRole("main")).toContainText("You have");

    await page.getByRole("button", { name: /^Book it with/ }).click();
    await page.waitForURL("**/studio", { timeout: 30_000 });

    /* --- And the room is really there --------------------------------------- */

    await expect(page.getByRole("button", { name: "Start the session" })).toBeVisible({
      timeout: 15_000,
    });

    // On the calendar too, as a studio booking rather than a card invented here.
    await page.goto("/calendar");
    await expect(page.getByRole("main")).toContainText("studio");

    /* --- The second track begins -------------------------------------------- */

    await page.goto("/studio");
    await page.getByRole("button", { name: "Start the session" }).click();
    await page.waitForURL("**/studio/session/**");

    await page.getByRole("button", { name: /Tell a story/ }).click();
    await page.getByRole("button", { name: "Tense", exact: true }).click();
    await page.getByRole("button", { name: /^Tell (LEX|MO|ZERO)$/ }).click();

    await page.getByText(/came back with three/).waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: "Make this one" }).first().click();
    await page.getByRole("button", { name: "Master this" }).waitFor({ timeout: 60_000 });
    await page.getByRole("button", { name: "Master this" }).click();
    await page.getByText("Mastered — name it and keep it").waitFor({ timeout: 60_000 });

    await page.getByLabel("Track title").fill("SECOND CITY");
    await page.getByRole("button", { name: "Save to catalogue" }).click();
    await page.waitForURL("**/home");

    /* --- Two records, one career -------------------------------------------- */

    await page.goto("/catalogue");
    const catalogue = page.getByRole("main");
    await expect(catalogue.getByText("SCENE FIRST", { exact: true }).first()).toBeVisible();
    await expect(catalogue.getByText("SECOND CITY", { exact: true }).first()).toBeVisible();

    // And the story says how the second one came about.
    await page.goto("/career");
    await expect(page.getByRole("main")).toContainText(/Back in the studio with/);
  });
});
