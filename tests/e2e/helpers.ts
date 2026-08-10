import type { Page } from "@playwright/test";

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
