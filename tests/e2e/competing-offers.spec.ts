import { expect, test, type Page } from "@playwright/test";
import { answerDiscovery, makeTrack, registerAccount, releaseTrack } from "./helpers";

/**
 * Two promoters, one Friday, and the only confirmation in the whole flow.
 *
 * The domain suite already proves the consequence — the loser is withdrawn for
 * a stated reason and stays legible. This proves the *interaction*, because the
 * moment a player is about to lose a night they were never asked about is
 * exactly the moment an interface has to be a person rather than a system.
 *
 * **How the clash is arrived at, and why it is not slow.** It is not driven out
 * of the director by grinding day advances until something collides. Naledi and
 * Dineo are seeded with the same `noticeDays` in the same scene precisely so
 * that they want the same night — the seed says so in a comment — so the
 * specification's own path gets there in one step: decline what is on the table,
 * let a single day pass, and both of them come back wanting the same Friday.
 * That is structural rather than stochastic, which is what makes a single
 * unguarded assertion safe here despite reception being unseeded in the browser.
 *
 * Everything after that is player-facing only. This test does not re-examine
 * eligibility, ranking, the cap or the conflict record; it reads what is on the
 * screen.
 */

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
 * The action redirects to Home from Home, so a URL wait resolves before the post
 * has landed and the next press hits a stale page.
 */
async function letADayPass(page: Page, expectedDaysOut: number): Promise<void> {
  await page.goto("/home");
  await page.getByRole("button", { name: "Let a day pass" }).click();
  await expect(figureLocator(page, "Days out")).toHaveText(String(expectedDaysOut), {
    timeout: 30_000,
  });
}

/** Every offer currently on the table, by the id the markup carries. */
async function liveOfferIds(page: Page): Promise<string[]> {
  await page.goto("/home");
  return page.locator("[data-offer-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-offer-id")!),
  );
}

/**
 * Turn down everything currently being asked, then let a day pass.
 *
 * The specification's own route to a contested night, and the only one that does
 * not reach behind the game: a promoter who is waiting on you does not phone
 * back, so the table has to be cleared before the world will ask again.
 */
async function clearTheTable(page: Page, nextDaysOut: number): Promise<void> {
  for (const offerId of await liveOfferIds(page)) {
    await page.goto(`/opportunities/${offerId}`);

    // Skip anything already answered, and the authored introduction, which has
    // a screen of its own and nothing to turn down.
    const turnDown = page.getByRole("button", { name: "Turn it down" });
    if ((await turnDown.count()) === 0) continue;

    await turnDown.click();
    await page.waitForURL("**/opportunities/**");
  }

  await letADayPass(page, nextDaysOut);
}

/** The grouped block Home renders when two offers want one night. */
function contestedNight(page: Page) {
  return page.locator("li", { hasText: "Both of these want this night" }).first();
}

test.describe("two offers that want the same night", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one pass is enough for this interaction");
  });

  test("desktop: the clash is visible first, named at the decision, and legible after", async ({
    page,
  }) => {
    test.setTimeout(300_000);

    /* --- A career the scene has started to notice ---------------------------- */

    await registerAccount(page, "CLASH Offers");
    await page.getByRole("button", { name: /SOLO/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/start/identity");
    await page.getByLabel("Stage name").fill("CLASHKX");
    await page.getByRole("button", { name: "Continue" }).click();
    await answerDiscovery(page, 2);
    await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
    await page.waitForURL("**/home");

    await makeTrack(page, "SAME NIGHT");
    await releaseTrack(page, "SAME NIGHT");

    await letADayPass(page, 1);
    await letADayPass(page, 2);
    await letADayPass(page, 3);

    /* --- Turn down what is on the table, and let the world come back --------- */

    /*
     * At most three cycles, and the bound is reasoning rather than hope.
     *
     * Naledi and Dineo book the same scene on the same notice, so whenever both
     * are created on one day they necessarily want the same night. What can
     * displace Dineo is the cap: a producer's invitation outranks her and takes
     * the third slot. That invitation is keyed to the record it follows, so
     * declining it retires it permanently — after which the three slots belong
     * to the promoters and the pair that shares a notice period lands together.
     *
     * One cycle to clear the table, one to exhaust the invitation, and a third
     * only as slack. Each is a few seconds, and the loop stops the moment the
     * clash is on screen.
     */
    let daysOut = 3;

    for (let cycle = 0; cycle < 3; cycle += 1) {
      daysOut += 1;
      await clearTheTable(page, daysOut);

      await page.goto("/home");
      if ((await contestedNight(page).count()) > 0) break;
    }

    /* --- Both offers, grouped, before any decision --------------------------- */

    const group = contestedNight(page);
    await expect(
      group,
      "the world did not put two offers on the same night",
    ).toBeVisible({ timeout: 15_000 });

    // The consequence is stated before the player can act on it.
    await expect(group).toContainText("Taking one means letting the other go");

    const grouped = group.locator("[data-offer-id]");
    await expect(grouped).toHaveCount(2);

    const chosenId = await grouped.nth(0).getAttribute("data-offer-id");
    const losingId = await grouped.nth(1).getAttribute("data-offer-id");
    expect(chosenId).toBeTruthy();
    expect(losingId).not.toBe(chosenId);

    // Two different people, each named, both wanting the one night.
    const promoters = ["Naledi", "Dineo", "Tumi", "Sizwe"];
    const groupText = await group.innerText();
    const asking = promoters.filter((name) => groupText.includes(name));
    expect(asking.length, `expected two named promoters, saw: ${groupText}`).toBe(2);

    /* --- The offer screen says what else wants the night --------------------- */

    await page.goto(`/opportunities/${chosenId}`);

    /*
     * The clash panel is authored three times — the context rail, the drawer
     * behind its toggle, and the stacked block a phone gets — because the
     * comparison has to survive every viewport. Exactly one is visible at a
     * time, so the assertion is scoped to whichever that is rather than to a
     * particular layout.
     */
    await expect(
      page.locator("text=Something else wants that night >> visible=true").first(),
    ).toBeVisible();
    await expect(
      page.locator("text=Taking this one ends that one >> visible=true").first(),
    ).toBeVisible();

    const chosenText = await page.getByRole("main").innerText();
    const chosenWho = asking.find((name) => chosenText.includes(`${name}'s slot`))!;
    const losingWho = asking.find((name) => name !== chosenWho)!;

    /* --- The confirmation is a person, not a system -------------------------- */

    const primary = page.getByRole("button", { name: `Take ${chosenWho}'s slot` });
    await expect(primary).toBeVisible();
    await primary.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // It names what is being lost, and whose it is.
    await expect(dialog).toContainText(`This means turning down ${losingWho}'s offer.`);
    await expect(dialog).toContainText("you won't be available");
    await expect(dialog).toContainText(losingWho);

    // The primary action names what is being taken. It never describes the
    // machinery — no "Confirm", no "Resolve", no "conflict".
    const confirm = dialog.getByRole("button", { name: `Take ${chosenWho}'s slot` });
    await expect(confirm).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Not yet" })).toBeVisible();

    const dialogText = await dialog.innerText();
    for (const machinery of [/confirm/i, /resolve/i, /conflict/i, /CALENDAR_SLOT/]) {
      expect(dialogText, `${machinery} appeared in the confirmation`).not.toMatch(machinery);
    }

    await confirm.click();
    await page.waitForURL("**/opportunities/**", { timeout: 30_000 });

    /* --- The one taken is taken ---------------------------------------------- */

    await page.goto(`/opportunities/${chosenId}`);
    await expect(page.getByRole("main")).toContainText("Taken");
    await expect(page.getByRole("button", { name: /^Take/ })).toHaveCount(0);

    /* --- And the other stays visible, as no longer possible ------------------ */

    await page.goto("/home");

    const loser = page.locator(`[data-offer-id="${losingId}"]`);
    await expect(
      loser,
      "the losing offer vanished instead of being replaced in place",
    ).toBeVisible();

    await expect(loser).toContainText("No longer possible");
    // It says the player chose something else that night — not that it failed,
    // lapsed, or was turned down.
    await expect(loser).toContainText("the same night");
    await expect(loser).not.toContainText("Turned down");
    await expect(loser).not.toContainText("Lapsed");

    /* --- Nothing internal reached the screen --------------------------------- */

    for (const route of ["/home", `/opportunities/${losingId}`, "/career"]) {
      await page.goto(route);
      const body = await page.locator("body").innerText();

      for (const machinery of [
        /CALENDAR_SLOT/,
        /SAME_RESOURCE/,
        /\bWITHDRAWN\b/,
        /conflict/i,
        /suppress/i,
        /\branking\b/i,
        /eligibility/i,
      ]) {
        expect(body, `${machinery} leaked onto ${route}`).not.toMatch(machinery);
      }
    }

    // The promoter who lost the night is the one who says so, in their thread.
    await page.goto(`/opportunities/${losingId}`);
    await expect(page.getByRole("main")).toContainText("No longer possible");
    await page.getByRole("link", { name: `Back to ${losingWho}` }).click();
    await page.waitForURL("**/messages/**");
    await expect(page.getByRole("main")).toContainText(losingWho);
  });
});
