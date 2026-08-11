import { expect, type Page } from "@playwright/test";

/** Unique per run so repeated E2E runs never collide on the unique email index. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.test`;
}

export async function registerAccount(page: Page, displayName: string): Promise<string> {
  const email = uniqueEmail(displayName.toLowerCase().replace(/\W+/g, ""));

  await page.goto("/register");
  await page.getByLabel("What should we call you?").fill(displayName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/start");

  return email;
}

/** Answers every choice question by picking the nth available option. */
export async function answerDiscovery(page: Page, optionIndex = 0): Promise<void> {
  await page.waitForURL("**/start/sound");

  // The flow advances one question at a time; loop until the free-text step.
  for (let step = 0; step < 10; step += 1) {
    if (await page.locator("#free-text").count()) break;

    // Choice cards are the only controls carrying aria-pressed.
    const choices = page.locator("button[aria-pressed]");
    const count = await choices.count();
    if (count === 0) break;

    await choices.nth(Math.min(optionIndex, count - 1)).click();
    await page.waitForTimeout(400);
  }

  await page.locator("#free-text").fill("remember where they were when they heard it");
  await page.getByRole("button", { name: "See what that makes" }).click();
  await page.waitForURL("**/start/reveal");
}

/** Everything M3 does, through the interface, ending on a saved track. */
export async function makeTrack(page: Page, title: string): Promise<void> {
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
export async function releaseTrack(page: Page, title: string): Promise<string> {
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

