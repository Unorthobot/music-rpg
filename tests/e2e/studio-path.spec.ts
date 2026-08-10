import { expect, test } from "@playwright/test";
import { answerDiscovery, registerAccount } from "./helpers";

/**
 * The required M2 + M3 player story, end to end:
 *
 * Home → Thabo's message → choose LEX → R1,500 charged once → session on the
 * calendar → studio → direction → three interpretations → reject one set →
 * choose → quick render through its job states → version 1 → darker revision →
 * version 2 (version 1 still there) → master → name it → save → Home changed,
 * catalogue = 1.
 *
 * Runs at desktop and phone viewports; the Studio composes differently on each
 * rather than compressing.
 */
test("solo: from an empty career to a track in the catalogue", async ({ page }, testInfo) => {
  test.setTimeout(180_000);

  await registerAccount(page, "Studio Player");

  // --- onboarding -------------------------------------------------------
  await page.getByRole("button", { name: /SOLO/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/start/identity");
  await page.getByLabel("Stage name").fill("KXMO");
  await page.getByLabel("Where are you from?").fill("Braamfontein");
  await page.getByRole("button", { name: "Continue" }).click();

  await answerDiscovery(page, 1);
  await page.getByRole("button", { name: "ENTER THE UNDERGROUND" }).click();
  await page.waitForURL("**/home");

  // --- Thabo ------------------------------------------------------------
  await expect(page.getByText("Thabo sent you a message.")).toBeVisible();
  await page.getByRole("link", { name: "Read it" }).click();

  await expect(page.getByText(/I know three producers/)).toBeVisible();
  await page.getByRole("link", { name: "See the producers" }).click();

  // --- choosing a producer ---------------------------------------------
  await page.waitForURL("**/opportunities/producers");
  await expect(page.getByRole("heading", { name: "WHO DO YOU WANT IN THE ROOM?" })).toBeVisible();
  await expect(page.getByText("I don't make beats for everybody.")).toBeVisible();
  await expect(page.getByText("R1,500").first()).toBeVisible();

  await page.getByRole("button", { name: "Book a session with LEX" }).click();
  await page.waitForURL("**/studio");

  // The money moved, once.
  await page.goto("/home");
  await expect(page.getByText("Your first studio session is ready.")).toBeVisible();
  await expect(page.getByText("R3,500")).toBeVisible();

  // …and the calendar knows about it.
  await page.goto("/calendar");
  await expect(page.getByText("Studio session with LEX")).toBeVisible();

  // --- the session ------------------------------------------------------
  await page.goto("/studio");
  await page.getByRole("button", { name: "Start the session" }).click();
  await page.waitForURL("**/studio/session/**");

  await expect(page.getByText("LEX is set up. What are we making?")).toBeVisible();

  await page.getByRole("button", { name: /Tell a story/ }).click();
  await page.getByRole("button", { name: "Tense", exact: true }).click();
  await page.getByRole("button", { name: "Introspective" }).click();
  await page
    .getByLabel("Anything else?")
    .fill("Driving through Joburg at 2am. Empty city. I want the words to feel dangerous.");
  await page.getByRole("button", { name: "Tell LEX" }).click();

  // --- three ideas, and a producer with opinions ------------------------
  await expect(page.getByText("LEX came back with three.")).toBeVisible();
  await expect(page.getByText("First pass")).toBeVisible();
  // At least one of them is an argument, not an agreement.
  await expect(page.getByText("He disagrees").first()).toBeVisible();

  // Reject the set — he goes away and comes back with different ideas. The
  // pass label is what proves the page in front of us is the new one.
  await page.getByRole("button", { name: "None of these — try again" }).click();
  await expect(page.getByText("Pass 2")).toBeVisible();
  await expect(page.getByText("LEX went away and came back with three more.")).toBeVisible();

  await page.getByRole("button", { name: "Make this one" }).first().click();

  // --- the render walks its states --------------------------------------
  await expect(page.getByRole("status")).toContainText("LEX is", { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Master this" })).toBeVisible({ timeout: 60_000 });

  await expect(page.getByText(/version 1/i).first()).toBeVisible();
  await expect(page.getByText("Development preview — structured work, not audio")).toBeVisible();

  // --- a darker revision -------------------------------------------------
  await page.getByRole("button", { name: "Keep working" }).click();
  await page.getByRole("radio", { name: "Darker" }).check();
  await page.getByRole("button", { name: "Send it back" }).click();

  await expect(page.getByRole("button", { name: "Master this" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/version 2/i).first()).toBeVisible();
  // Version 1 is still there.
  await expect(page.getByText("Earlier versions")).toBeVisible();
  await expect(page.getByText("Nothing here is ever overwritten.")).toBeVisible();

  // --- master and save ---------------------------------------------------
  await page.getByRole("button", { name: "Master this" }).click();
  await expect(page.getByText("Mastered — name it and keep it")).toBeVisible({ timeout: 60_000 });

  await page.getByLabel("Track title").fill("NO RECEPTION");
  await page.getByRole("button", { name: "Save to catalogue" }).click();

  // --- home has changed --------------------------------------------------
  await page.waitForURL("**/home");
  await expect(page.getByText("Your first track is in your catalogue.")).toBeVisible();
  await expect(page.getByText("Track saved to catalogue")).toBeVisible();

  // Catalogue is a real count, and the money only moved once.
  // The metric tile, not the story card that also says "Catalogue": the tile
  // reads label + count + descriptor.
  const catalogueTile = page.locator("div").filter({ hasText: /^Catalogue1Yours\.$/ }).first();
  await expect(catalogueTile).toBeVisible();
  await expect(page.getByText("R3,500")).toBeVisible();

  // The track survives a full reload, and so does its history.
  await page.goto("/studio");
  await expect(page.getByText("NO RECEPTION")).toBeVisible();
  await expect(page.getByText(/3 versions/)).toBeVisible();

  testInfo.annotations.push({ type: "flow", description: "M2+M3 vertical complete" });
});
