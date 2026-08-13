import { expect, test, type Page } from "@playwright/test";
import { answerDiscovery, makeTrack, registerAccount, releaseTrack } from "./helpers";

/**
 * A battle, from being called out to living with the result.
 *
 * The critical walk, and the only place the whole causal chain is exercised
 * through the interface a person actually uses:
 *
 *     challenge arrives → accept → scout → choose an angle → prepare
 *       → time passes → the battle resolves without anybody opening it
 *       → the player is told → they read the decision → the world reflects it
 *
 * Two properties are being protected that no unit test can reach.
 *
 * **Time creates, screens reveal.** The night is never triggered from a page.
 * The only thing pressed between declaring an angle and reading a decision is
 * "Let a day pass", and the battle route is deliberately *not* visited in
 * between — so a result that appears could only have come from game time.
 *
 * **The boundary, as rendered.** The read-model tests prove the projection
 * carries no engine state. This proves the *page* does not either, by reading
 * the actual HTML and looking for the machinery — the last place a leak can hide
 * is a component that fetched something the projection never gave it.
 */

const CHALLENGE_HEADING = /called you out/i;

/**
 * The challenge card on Home, and the link that opens it.
 *
 * Found by the card's own offer id rather than by clicking the headline: the
 * headline is a span inside the card, and a card is opened by its action.
 */
function challengeCard(page: Page) {
  return page.locator("[data-offer-id]").filter({ hasText: CHALLENGE_HEADING }).first();
}

async function openTheChallenge(page: Page): Promise<void> {
  await page.goto("/home");
  await expect(challengeCard(page)).toBeVisible();
  await challengeCard(page).getByRole("link", { name: "Look at it" }).click();
  await page.waitForURL("**/opportunities/**");
}

/** Home's day button, waited on by consequence rather than by URL. */
async function letADayPass(page: Page): Promise<void> {
  await page.goto("/home");
  await page.getByRole("button", { name: "Let a day pass" }).click();
  await page.waitForURL("**/home");
  await page.waitForLoadState("networkidle");
}

async function buildACareer(page: Page, stageName: string, title: string): Promise<void> {
  await registerAccount(page, `${stageName} Battle`);
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

/**
 * Live until somebody decides this career is worth their time.
 *
 * A first challenge does not arrive immediately and should not: rivals have a
 * standing bar, and until a scene knows a career the director correctly prefers
 * paid nights from promoters. So the career simply lives, and the loop watches
 * Home for the moment somebody calls them out.
 */
async function liveUntilChallenged(page: Page, maxDays = 26): Promise<void> {
  for (let day = 0; day < maxDays; day += 1) {
    await letADayPass(page);

    if (await page.getByText(CHALLENGE_HEADING).first().isVisible().catch(() => false)) {
      return;
    }
  }

  throw new Error(`No rival challenged this career within ${maxDays} days.`);
}

/**
 * Everything the player must never be shown, checked against rendered HTML.
 *
 * Machine vocabulary only — nothing here is a word somebody would write in a
 * sentence about a room, so a match is a leak wherever it appears. The
 * player-facing headings this milestone requires ("The writing", "The plan",
 * "The room") are deliberately not in this list and must not be: a test that
 * could not tell a heading from a column would force the copy to change to keep
 * the boundary green.
 */
/**
 * Machine identifiers, checked against the whole document.
 *
 * Every one of these is camelCase, SCREAMING_CASE or a version string — shapes
 * that appear in code and never in a stylesheet or in prose — so the check can
 * safely cover the *entire* markup, including the serialised props Next.js
 * embeds in the page. That matters: a projection leak would arrive in the flight
 * data whether or not any component rendered it, and a test that only read
 * visible text would miss exactly the failure the read model exists to prevent.
 *
 * The player-facing headings this milestone requires ("The writing", "The plan",
 * "The room") are deliberately absent from this list and must stay absent. A
 * test that could not tell a heading from a column would force the copy to
 * change in order to keep the boundary green, which is the tail wagging the dog.
 */
const FORBIDDEN_IN_MARKUP = [
  "TECHNICAL",
  "STRATEGIC",
  "AUDIENCE",
  "challengerTotal",
  "opponentTotal",
  "challengerContribution",
  "opponentContribution",
  "challengerInput",
  "opponentInput",
  "strategyAptitude",
  "battleIQ",
  "composureShift",
  "preparationShift",
  "strategyShift",
  "derivation",
  "cohortTaste",
  "sceneStanding",
  "roomHistory",
  "intentMatch",
  "costOfChoice",
  "opponentAnswered",
  "crowdWork",
  "battles-v1",
  "battle-judges-v1",
  "simulatorVersion",
  "engineVersion",
  "scorecard",
  "OUTRANKED_BY_CAP",
  "triggerState",
];

/**
 * Ordinary English that must not be *said* to a player.
 *
 * Checked against visible text only, because these words legitimately occur in
 * the stylesheet — "margin" is a CSS property, and a page that failed on its own
 * layout rules would be a test nobody could keep.
 */
const FORBIDDEN_IN_TEXT = [
  "margin",
  "contribution",
  "weight",
  "score",
  "rating",
  "points",
  "Respect +",
  "Heat +",
  "Fame +",
  "Rivalry +",
  "Respect increased",
  "Heat increased",
  "Rivalry increased",
];

async function assertNothingLeaked(page: Page, where: string): Promise<void> {
  const html = await page.content();

  for (const term of FORBIDDEN_IN_MARKUP) {
    expect(html, `"${term}" was in the markup of ${where}`).not.toContain(term);
  }

  const visible = (await page.getByRole("main").innerText()).toLowerCase();

  for (const term of FORBIDDEN_IN_TEXT) {
    expect(visible, `"${term}" was shown to the player on ${where}`).not.toContain(
      term.toLowerCase(),
    );
  }
}

test.describe("a battle, end to end", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the mobile pass has its own spec");
  });

  test("desktop: called out, agreed, prepared, fought by the clock, and read afterwards", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await buildACareer(page, "BATTLEKX", "NIGHTLINE");
    await liveUntilChallenged(page);

    /* --- 1. Somebody called you out, and it arrives as a person, not a quest. */

    await page.goto("/home");
    await expect(challengeCard(page)).toBeVisible();

    /* No global navigation item ever appears for battles. */
    await expect(page.getByRole("link", { name: "Battles", exact: true })).toHaveCount(0);

    await openTheChallenge(page);

    /* Both answers are present, and neither is dressed as the right one. */
    await expect(page.getByRole("button", { name: "Take it" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Turn it down" })).toBeVisible();

    /* No warning, no consequence preview, nothing about what refusing costs. */
    const offerHtml = await page.content();
    for (const nudge of ["are you sure", "may affect", "reputation will", "back down"]) {
      expect(offerHtml.toLowerCase()).not.toContain(nudge);
    }

    /* --- 2. Agreeing books the night and opens the confrontation's own screen. */

    await page.getByRole("button", { name: "Take it" }).click();
    await page.waitForURL("**/battles/**");

    const battleUrl = page.url();
    await assertNothingLeaked(page, "the battle screen, before the night");

    /* --- 3. Scouting: sourced, incomplete, and never a character sheet. */

    await page.getByRole("button", { name: "Ask around" }).click();
    await page.waitForURL("**/battles/**");

    await expect(page.getByText(/What you don.t know/)).toBeVisible();

    /*
     * The one unknown the whole strategy decision rests on. Nobody declares an
     * angle in advance, so the player chooses theirs without knowing the other.
     */
    await expect(page.getByText(/Nobody declares an angle in advance/i)).toBeVisible();

    /*
     * Provenance the world genuinely owns — never an opponent model in
     * adjectives, and never the angle they are going to take.
     *
     * Scoped to the scouting section rather than to the page, because the
     * player's *own* angle form legitimately carries `OUTWRITE` as a form value
     * three sections further down. What must never happen is a strategy name
     * appearing in what scouting reports, and that is what this reads.
     */
    const scoutingMarkup = await page.locator("[data-scouting]").innerHTML();
    expect(scoutingMarkup).not.toMatch(/Writing:\s*(Strong|Exceptional|Weak)/i);
    expect(scoutingMarkup).not.toMatch(/WIN_THE_CROWD|OUTWRITE|TAKE_THEM_APART/);
    expect(scoutingMarkup).not.toMatch(/battleIQ|lyricism|confidence|resilience/i);

    /* And no angle name is ever *shown* anywhere, whatever the forms carry. */
    const visible = await page.getByRole("main").innerText();
    expect(visible).not.toMatch(/WIN_THE_CROWD|OUTWRITE|TAKE_THEM_APART/);

    await assertNothingLeaked(page, "the scouting screen");

    /* --- 4. The angle: intent, with no modifiers anywhere near it. */

    await expect(page.getByRole("button", { name: /Outwrite them/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Win the crowd/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Take them apart/ })).toBeVisible();

    const angleHtml = await page.content();
    expect(angleHtml).not.toMatch(/[+-]\d+%/);
    expect(angleHtml).not.toMatch(/\+\s*(writing|crowd work|flow|structure)/i);

    await page.getByRole("button", { name: /Win the crowd/ }).click();
    await page.waitForURL("**/battles/**");
    await expect(page.getByText("Win the crowd")).toBeVisible();

    /* --- 5. Preparation, priced in days as well as money. */

    await expect(page.getByText(/a day a record could have had/i)).toBeVisible();
    await expect(page.getByText(/You can go into it with nothing prepared/i)).toBeVisible();

    await page.getByRole("button", { name: "Work on the round" }).click();
    await page.waitForURL("**/battles/**");
    await expect(page.getByText(/One session on it so far/i)).toBeVisible();

    /* Never a probability, and never a promise about what work buys. */
    const prepHtml = await page.content();
    expect(prepHtml).not.toMatch(/\d+%\s*(chance|better|more likely)/i);

    /* --- 6. Reading it repeatedly changes nothing. */

    for (let visit = 0; visit < 3; visit += 1) {
      await page.goto(battleUrl);
      await expect(page.getByText("Win the crowd")).toBeVisible();
      /* Still ahead of us: no decision has appeared merely because we looked. */
      await expect(page.getByText("Afterwards")).toHaveCount(0);
    }

    /* --- 7. The night happens because time reached it. */

    let fought = false;
    for (let day = 0; day < 20 && !fought; day += 1) {
      await letADayPass(page);

      /*
       * Deliberately checked on **Notifications**, not on the battle route. The
       * player learns the night happened without ever opening it, which is the
       * property this whole milestone turns on.
       */
      await page.goto("/notifications");
      fought = await page
        .getByText(/Your night with .* happened/i)
        .first()
        .isVisible()
        .catch(() => false);
    }

    expect(fought, "the world never reached the night").toBe(true);

    /* --- 8. The judges' decision: three perspectives, and a real dissent. */

    await page.goto(battleUrl);

    /*
     * Matched exactly, because the perspective *lines* legitimately talk about
     * the room — "The room went with KGOSI." — and a loose match would resolve
     * the heading and the sentence describing it to the same query.
     */
    for (const heading of ["The writing", "The plan", "The room"]) {
      await expect(page.getByText(heading, { exact: true }).first()).toBeVisible();
    }

    /* The shape of the panel's agreement, with an en dash. */
    await expect(page.getByText(/\d–\d/)).toBeVisible();
    await expect(page.getByText(/TAKES IT/)).toBeVisible();

    /*
     * The three are stacked, at every width. Read as geometry rather than as
     * class names: each heading sits below the one before it, which is what
     * makes them three perspectives rather than a comparison to be added up.
     */
    const boxes = await Promise.all(
      ["The writing", "The plan", "The room"].map((heading) =>
        page.getByText(heading, { exact: true }).first().boundingBox(),
      ),
    );

    expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
    expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);

    /* --- 9. No numbers, no reward screen, no machinery. */

    await assertNothingLeaked(page, "the decision screen");

    const decisionHtml = await page.content();
    /* No bars, meters, ratings or percentages anywhere on the result. */
    expect(decisionHtml).not.toMatch(/role="progressbar"/);
    expect(decisionHtml).not.toMatch(/\d+\s*\/\s*100/);
    expect(decisionHtml).not.toMatch(/★|⭐/);

    /* --- 10. The aftermath is the world, not a payout. */

    await expect(page.getByText("Afterwards")).toBeVisible();

    /* World carries the public fact, because a resolved battle is what the scene saw. */
    await page.goto("/world");
    await expect(page.getByText("What the scene has seen")).toBeVisible();
    await assertNothingLeaked(page, "the world feed");

    /* Career remembers it. */
    await page.goto("/career");
    await assertNothingLeaked(page, "the career screen");

    /* And the calendar's night is the same night, pointing at the same battle. */
    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: "What they decided" }).first()).toBeVisible();
    await page.getByRole("link", { name: "What they decided" }).first().click();
    await page.waitForURL("**/battles/**");
    expect(page.url()).toBe(battleUrl);
  });
});

/**
 * The whole thing, at phone width.
 *
 * Not a smoke test. The decision screen is the one place in this milestone where
 * a layout failure would change what the game is saying — three perspectives
 * side by side become a comparison, and a comparison invites somebody to add
 * them up — so the stack is asserted as geometry on a real phone viewport.
 */
test.describe("a battle on a phone", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "the desktop pass has its own spec");
  });

  test("mobile: every decision is reachable, and the three perspectives stack", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await buildACareer(page, "PHONEKX", "SMALLROOM");
    await liveUntilChallenged(page);

    await openTheChallenge(page);

    /* Both answers reachable without a desktop, and both real targets. */
    const take = page.getByRole("button", { name: "Take it" });
    await expect(take).toBeVisible();
    expect((await take.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await take.click();
    await page.waitForURL("**/battles/**");
    const battleUrl = page.url();

    await page.getByRole("button", { name: "Ask around" }).click();
    await page.waitForURL("**/battles/**");
    await expect(page.getByText(/What you don.t know/)).toBeVisible();

    await page.getByRole("button", { name: /Outwrite them/ }).click();
    await page.waitForURL("**/battles/**");
    await expect(page.getByText("Outwrite them")).toBeVisible();

    /* Going in with nothing prepared is a real path, and taken here. */
    let fought = false;
    for (let day = 0; day < 20 && !fought; day += 1) {
      await letADayPass(page);
      await page.goto("/notifications");
      fought = await page
        .getByText(/Your night with .* happened/i)
        .first()
        .isVisible()
        .catch(() => false);
    }

    expect(fought, "the world never reached the night").toBe(true);

    await page.goto(battleUrl);

    /* The stack, on a phone, asserted as geometry. */
    const boxes = await Promise.all(
      ["The writing", "The plan", "The room"].map((heading) =>
        page.getByText(heading, { exact: true }).first().boundingBox(),
      ),
    );

    expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
    expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);

    /* Never side by side: each starts at the same left edge as the one above. */
    expect(Math.abs(boxes[0]!.x - boxes[1]!.x)).toBeLessThan(2);
    expect(Math.abs(boxes[1]!.x - boxes[2]!.x)).toBeLessThan(2);

    /* And nothing horizontal scrolls to make it fit. */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await assertNothingLeaked(page, "the decision screen on a phone");
  });
});

/**
 * Turning it down, and being left alone about it.
 *
 * The acceptance test is blunt: a career that declines must never be shown
 * anything implying it is playing the game incorrectly. No battle is created, no
 * night is booked, the clock is never held, and nothing counts what was refused.
 */
test.describe("declining a challenge", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one pass is enough for this one");
  });

  test("desktop: two taps, no warning, and nothing left behind that reads as failure", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    await buildACareer(page, "NOTHANKS", "QUIETONE");
    await liveUntilChallenged(page);

    await openTheChallenge(page);

    /* Two taps: open it, refuse it. No confirmation step in between. */
    await page.getByRole("button", { name: "Turn it down" }).click();
    await page.waitForURL("**/opportunities/**");

    await expect(page.getByText("Turned down")).toBeVisible();

    /* It reads as a decision, in the register of a declined booking. */
    const html = (await page.content()).toLowerCase();
    for (const banned of [
      "afraid",
      "coward",
      "backed down",
      "chickened",
      "missed your chance",
      "you should have",
      "next time",
      "penalty",
      "streak",
    ]) {
      expect(html, `declining was framed as "${banned}"`).not.toContain(banned);
    }

    /* Nothing anywhere counts battles fought, declined or won. */
    expect(html).not.toMatch(/\d+\s*(battles|challenges)\s*(fought|declined|won|lost)/);

    /*
     * And the world keeps moving. A refusal creates no commitment, so no day is
     * ever held — which is the difference between a rule about commitments and a
     * rule about participation.
     */
    for (let day = 0; day < 6; day += 1) {
      await letADayPass(page);
      await expect(page.getByRole("button", { name: "Let a day pass" })).toBeVisible();
    }

    /* No battle screen was ever created to be nagged about. */
    await page.goto("/home");
    await expect(page.getByText(/You still need to decide how you.re going in/)).toHaveCount(0);
  });
});
