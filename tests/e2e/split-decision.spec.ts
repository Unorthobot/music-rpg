import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { SPLIT_FIXTURE } from "./global-setup";

/**
 * A 2-1, on the screen.
 *
 * The judging model's whole claim is that three perspectives can genuinely
 * disagree, and the player-experience milestone's whole claim is that a night
 * somebody carried one perspective in must not read like a night they were
 * simply beaten. Both are proven in the engine and in the read model. This is
 * the browser evidence for the part neither can give: **what a person actually
 * sees.**
 *
 * The battle is not fought here. It was built by global setup, out of process,
 * through the same domain commands the interface calls, with the seed pinned so
 * the 2-1 is canonical rather than lucky — the golden career's own unseeded path
 * lands on 2-1 only about half the time, because a night's composure shift is
 * seeded from the battle's random id. This spec logs in, opens the real route,
 * and reads it.
 *
 * It asserts presentation only. Nothing here re-tests the simulator.
 */

type Fixture = {
  email: string;
  password: string;
  battleId: string;
  decision: string;
  winnerIsRival: boolean;
};

async function fixture(): Promise<Fixture> {
  return JSON.parse(await readFile(SPLIT_FIXTURE, "utf8")) as Fixture;
}

async function signIn(page: Page, entry: Fixture): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(entry.email);
  await page.getByLabel("Password").fill(entry.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/** The three perspective blocks, in the order the page puts them. */
async function perspectives(page: Page) {
  const headings = ["The writing", "The plan", "The room"];

  return Promise.all(
    headings.map(async (heading) => {
      const label = page.getByText(heading, { exact: true }).first();
      /* The block is the surface the heading sits in. */
      const block = label.locator("xpath=ancestor::div[1]/..");

      return {
        heading,
        label,
        text: (await block.innerText()).replace(/\s+/g, " ").trim(),
        box: (await label.boundingBox())!,
      };
    }),
  );
}

test.describe("a split decision, as the player reads it", () => {
  test("the panel disagreed, and the screen says so without apologising for it", async ({
    page,
  }) => {
    const entry = await fixture();
    expect(entry.decision, "global setup did not produce a canonical 2-1").toBe("2-1");

    await signIn(page, entry);
    await page.goto(`/battles/${entry.battleId}`);

    /* --- The result ------------------------------------------------------- */

    /* The canonical winner, and the shape of the agreement with an en dash. */
    await expect(page.getByText("2–1")).toBeVisible();
    await expect(page.getByText(/TAKES IT/)).toBeVisible();

    const headline = await page.getByText(/TAKES IT/).first().innerText();
    if (entry.winnerIsRival) {
      expect(headline).not.toBe("YOU TAKE IT");
    } else {
      expect(headline).toBe("YOU TAKE IT");
    }

    /* --- Three perspectives, in the intended order ------------------------ */

    const blocks = await perspectives(page);

    for (const block of blocks) {
      await expect(block.label).toBeVisible();
    }

    expect(blocks[0]!.box.y).toBeLessThan(blocks[1]!.box.y);
    expect(blocks[1]!.box.y).toBeLessThan(blocks[2]!.box.y);

    /* --- Exactly one dissent, and it reads as a judgement ----------------- */

    const main = await page.getByRole("main").innerText();

    /*
     * Who each perspective went with, counted from the blocks themselves. A 2-1
     * has to be *visible as* a 2-1: two perspectives naming the winner and one
     * naming the other side. A screen that showed the tally and then described
     * three defeats would be numerically correct and completely wrong.
     */
    const wentWithYou = blocks.filter((block) => /\bYOU\b/.test(block.text));
    expect(wentWithYou, "the dissent is not attributed to anybody").toHaveLength(1);
    expect(blocks.length - wentWithYou.length).toBe(2);

    /* The panel's disagreement is stated, not glossed over. */
    await expect(page.getByText(/didn.t agree/i)).toBeVisible();

    /* Every perspective explains itself, qualitatively and without figures. */
    for (const block of blocks) {
      const explanation = block.text.replace(block.heading, "").trim();
      expect(explanation.length, `${block.heading} gave no reason`).toBeGreaterThan(20);
      expect(explanation, `${block.heading} carried a figure`).not.toMatch(/\d/);
    }

    /* --- The dissent is legitimate, not consolation ----------------------- */

    /*
     * The failure this guards against is not a missing dissent — it is a dissent
     * framed as a pat on the head. "One judge felt for you" is worse than not
     * showing it, because it tells the player the disagreement did not count.
     */
    for (const consolation of [
      "at least",
      "consolation",
      "not all bad",
      "silver lining",
      "next time",
      "unlucky",
      "better luck",
      "so close",
      "nearly",
      "almost had",
      "keep going",
      "don't worry",
      "chin up",
    ]) {
      expect(main.toLowerCase(), `the dissent was consoled: "${consolation}"`).not.toContain(
        consolation,
      );
    }

    /* And nothing says the judge who disagreed got it wrong. */
    for (const dismissal of [
      "wrong",
      "mistaken",
      "overruled",
      "outvoted",
      "incorrect",
      "disagreed with the others",
      "minority",
      "outlier",
      "should have",
    ]) {
      expect(
        main.toLowerCase(),
        `the dissenting perspective was dismissed as "${dismissal}"`,
      ).not.toContain(dismissal);
    }

    /* --- None of the machinery ------------------------------------------- */

    const markup = await page.content();

    for (const term of [
      /* Judge identity and arithmetic. */
      "TECHNICAL",
      "STRATEGIC",
      "AUDIENCE",
      "challengerTotal",
      "opponentTotal",
      "challengerContribution",
      "opponentContribution",
      "challengerInput",
      "opponentInput",
      /* Craft, temperament and the room. */
      "strategyAptitude",
      "battleIQ",
      "composureShift",
      "preparationShift",
      "strategyShift",
      "derivation",
      "crowdWork",
      "cohortTaste",
      "sceneStanding",
      "roomHistory",
      "intentMatch",
      /* Angles, as the engine names them. */
      "OUTWRITE",
      "WIN_THE_CROWD",
      "TAKE_THEM_APART",
      /* Replay and versioning. */
      "battles-v1",
      "battle-judges-v1",
      "simulatorVersion",
      "engineVersion",
      "scorecard",
    ]) {
      expect(markup, `"${term}" was in the markup of the decision screen`).not.toContain(term);
    }

    /* Said, rather than embedded: margins, weights and metric deltas. */
    for (const term of ["margin", "weight", "contribution", "rivalry", "respect", "heat", "fame"]) {
      expect(main.toLowerCase(), `"${term}" was shown to the player`).not.toContain(term);
    }

    /* No performance fact, in any of the shapes a quantity can take. */
    expect(main).not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
    expect(main).not.toMatch(/\b\d+(\.\d+)?%/);
    expect(main).not.toMatch(/[+-]\d+(\.\d+)?\b/);
    expect(markup).not.toMatch(/role="progressbar"/);
    expect(markup).not.toMatch(/★|⭐/);

    /*
     * The only figure anywhere on this screen is the panel's agreement. Counted
     * rather than described: every digit in the visible text belongs to "2–1".
     */
    const digits = main.replace(/2–1/g, "").match(/\d/g) ?? [];
    expect(digits, `unexpected figures on the decision screen: ${digits.join("")}`).toEqual([]);
  });

  /**
   * The person on the other side of it, afterwards.
   *
   * The aftermath is supposed to be felt through the surfaces that already own
   * it rather than announced, and the relationship is the clearest case: M6 has
   * described people in qualitative bands since it shipped, `rivalry` was a
   * declared dimension nothing moved, and a resolved battle is the first thing
   * that moves it.
   *
   * Nothing was built for this. `getPeople` returns everyone a career has a
   * relationship with and the Crew screen already renders the non-crew ones, so
   * this only checks that what M6 now has to say arrives in words — and that the
   * figure behind it does not.
   */
  test("the rival shows up afterwards in words, never as a number", async ({ page }) => {
    const entry = await fixture();

    await signIn(page, entry);
    await page.goto("/crew");

    const rival = page.getByText("Rival", { exact: false }).first();
    await expect(rival, "the person you battled is nowhere in the world afterwards").toBeVisible();

    const main = await page.getByRole("main").innerText();

    /*
     * M6's own vocabulary for the dimension battles finally move. Any one of
     * these is the relationship being described; none of them is a quantity.
     */
    expect(
      [
        "Aware of each other",
        "Measuring themselves against you",
        "Competitive",
        "Serious rivalry",
        "Out to beat you",
      ].some((band) => main.includes(band)),
      "the rivalry was not described in the world's own words",
    ).toBe(true);

    /* And never the figure underneath it, in any form. */
    expect(main).not.toMatch(/rivalry[^.]*\d/i);
    expect(main).not.toMatch(/\b\d+(\.\d+)?\s*(rivalry|respect|tension|familiarity)/i);
    expect(main).not.toMatch(/(rivalry|respect|tension|familiarity)\s*[:=]\s*\d/i);
    expect(main).not.toMatch(/[+-]\d+(\.\d+)?/);
  });

  /**
   * The stack, at phone width.
   *
   * Cheap to exercise here because the battle already exists — this is a login
   * and a navigation, not a second career. Three perspectives side by side
   * become a comparison, and a comparison invites somebody to add them up, so
   * the layout is asserted as geometry rather than as class names.
   */
  test("the three perspectives stay stacked on a phone", async ({ page }) => {
    const entry = await fixture();

    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page, entry);
    await page.goto(`/battles/${entry.battleId}`);

    const blocks = await perspectives(page);

    /* Below one another, never beside. */
    expect(blocks[0]!.box.y).toBeLessThan(blocks[1]!.box.y);
    expect(blocks[1]!.box.y).toBeLessThan(blocks[2]!.box.y);
    expect(Math.abs(blocks[0]!.box.x - blocks[1]!.box.x)).toBeLessThan(2);
    expect(Math.abs(blocks[1]!.box.x - blocks[2]!.box.x)).toBeLessThan(2);

    /* And the dissent is still legible at this width. */
    await expect(page.getByText(/didn.t agree/i)).toBeVisible();
    await expect(page.getByText("2–1")).toBeVisible();

    /* Nothing scrolls sideways to make it fit. */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
