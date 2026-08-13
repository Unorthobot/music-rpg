import { describe, expect, it } from "vitest";
import {
  decisionHeadline,
  describeAftermath,
  describeJudgePerspective,
  describePlayerRound,
  describeScouting,
  formatTally,
} from "@music-rpg/simulation";
import type {
  BattleResult,
  JudgeContribution,
  JudgeDecision,
  ScoutingFinding,
} from "@music-rpg/shared";

/**
 * Reading a decomposition out loud.
 *
 * Pure functions, so this is where the properties that matter most can be
 * asserted directly rather than inferred from a rendered page: that the same
 * facts always produce the same words, that no quantity survives into any
 * sentence, and — the one the judging model exists for — that **a split decision
 * reads differently from a unanimous one**.
 */

function contribution(
  term: string,
  challenger: number,
  opponent: number,
): JudgeContribution {
  return {
    term: term as JudgeContribution["term"],
    challengerInput: challenger,
    opponentInput: opponent,
    weight: 0.25,
    challengerContribution: challenger * 0.25,
    opponentContribution: opponent * 0.25,
    /* Inspector vocabulary, deliberately leaky, and never rendered. */
    note: "Casual listeners 88%, Scene heads 9% — OUTWRITE against WIN_THE_CROWD.",
  };
}

function judgement(
  judge: JudgeDecision["judge"],
  verdict: JudgeDecision["verdict"],
  contributions: JudgeContribution[],
): JudgeDecision {
  return {
    judge,
    panelRole: "REQUIRED",
    question: "",
    verdict,
    challengerTotal: 61.4211,
    opponentTotal: 58.9034,
    margin: 2.5177,
    contributions,
    irrelevant: ["delivery", "crowdWork"],
    engineVersion: "battle-judges-v1",
  };
}

function result(options: {
  decision: string;
  verdicts: Record<JudgeDecision["judge"], JudgeDecision["verdict"]>;
}): BattleResult {
  const judgements: JudgeDecision[] = [
    judgement("TECHNICAL", options.verdicts.TECHNICAL, [
      contribution("writing", 70, 52),
      contribution("flow", 55, 54),
    ]),
    judgement("STRATEGIC", options.verdicts.STRATEGIC, [
      contribution("commitment", 68, 44),
      contribution("intentMatch", 60, 58),
    ]),
    judgement("AUDIENCE", options.verdicts.AUDIENCE, [
      contribution("cohortTaste", 71, 49),
      contribution("roomHistory", 50, 49),
    ]),
  ];

  return {
    winner: "CHALLENGER",
    loser: "OPPONENT",
    winnerArtistId: "artist-rival",
    loserArtistId: "artist-player",
    decision: options.decision,
    judgements,
    split: !options.decision.endsWith("-0"),
    engineVersion: "battle-judges-v1",
  };
}

const UNANIMOUS = result({
  decision: "3-0",
  verdicts: { TECHNICAL: "CHALLENGER", STRATEGIC: "CHALLENGER", AUDIENCE: "CHALLENGER" },
});

/** The player carried the plan. A materially different night from a 3-0. */
const SPLIT = result({
  decision: "2-1",
  verdicts: { TECHNICAL: "CHALLENGER", STRATEGIC: "OPPONENT", AUDIENCE: "CHALLENGER" },
});

const AS = { playerSide: "OPPONENT" as const, rivalName: "KGOSI" };

function perspectivesOf(source: BattleResult) {
  return source.judgements.map((judgement) =>
    describeJudgePerspective({ judgement, ...AS }),
  );
}

describe("three perspectives, read out loud", () => {
  /**
   * The property the whole judging model was built to have.
   *
   * A 2-1 in which the player carried one perspective must not read as a 3-0.
   * Asserted on the projection's own output rather than on a screen, because if
   * the difference is not *in the data* no amount of styling can put it back.
   */
  it("makes a split decision visibly different from a unanimous one", () => {
    const unanimous = perspectivesOf(UNANIMOUS);
    const split = perspectivesOf(SPLIT);

    /* Nobody carried anything in a 3-0. */
    expect(unanimous.every((entry) => !entry.wentWithYou)).toBe(true);
    expect(unanimous.map((entry) => entry.wentWith)).toEqual(["KGOSI", "KGOSI", "KGOSI"]);

    /* Exactly one perspective went the other way, and it is named. */
    const dissent = split.filter((entry) => entry.wentWithYou);
    expect(dissent).toHaveLength(1);
    expect(dissent[0]!.heading).toBe("The plan");
    expect(dissent[0]!.wentWith).toBe("You");

    /* And it says so in the player's own voice, not the rival's. */
    expect(dissent[0]!.line).toMatch(/^You /);
    expect(dissent[0]!.line).not.toContain("KGOSI");

    /* The two nights do not produce the same account of themselves. */
    expect(JSON.stringify(split)).not.toBe(JSON.stringify(unanimous));
  });

  /**
   * Same facts, same words, every time.
   *
   * A fresh render months later, or under a newer engine, gives the same account
   * of the same night — which is what makes a persisted decomposition worth
   * keeping rather than a result worth caching.
   */
  it("says the same thing every time it is asked", () => {
    for (let run = 0; run < 5; run += 1) {
      expect(perspectivesOf(SPLIT)).toEqual(perspectivesOf(SPLIT));
    }
  });

  /**
   * The line follows the decomposition rather than the judge's identity.
   *
   * `writing` is the largest differential for the Technical judge here, and
   * `commitment` for the Strategic one, so those are the reasons given. A
   * describer that returned a fixed sentence per judge would pass every other
   * test in this file and be worthless.
   */
  it("gives the reason the decomposition actually supports", () => {
    const [technical, strategic, audience] = perspectivesOf(UNANIMOUS);

    expect(technical!.line).toContain("said more");
    expect(strategic!.line).toContain("held the angle");
    expect(audience!.line).toContain("wanted what");
  });

  /**
   * The recorded notes stay in World Control.
   *
   * They are inspector vocabulary and they leak: the fixture's note carries the
   * room composition and both raw strategy names, exactly as the real Audience
   * and Strategic judges' notes do. Nothing here may echo one.
   */
  it("never repeats a recorded note, however convenient it would be", () => {
    for (const perspective of [...perspectivesOf(SPLIT), ...perspectivesOf(UNANIMOUS)]) {
      expect(perspective.line).not.toContain("Casual listeners");
      expect(perspective.line).not.toContain("OUTWRITE");
      expect(perspective.line).not.toContain("WIN_THE_CROWD");
      expect(perspective.line).not.toMatch(/\d/);
    }
  });

  /** Headings, never the enum the panel is keyed on. */
  it("names the three perspectives in the player's language", () => {
    expect(perspectivesOf(SPLIT).map((entry) => entry.heading)).toEqual([
      "The writing",
      "The plan",
      "The room",
    ]);
  });
});

describe("the result, said plainly", () => {
  it("formats the panel's agreement without softening it", () => {
    expect(formatTally("2-1")).toBe("2–1");
    expect(formatTally("3-0")).toBe("3–0");

    expect(decisionHeadline({ result: SPLIT, ...AS })).toBe("KGOSI TAKES IT");
    expect(
      decisionHeadline({ result: { ...SPLIT, winner: "OPPONENT" }, ...AS }),
    ).toBe("YOU TAKE IT");
  });

  /**
   * A loss is a loss.
   *
   * No consolation framing and no "you'll get them next time" — the game does
   * not know that and should not say it.
   */
  it("does not console anybody", () => {
    const prose = [
      decisionHeadline({ result: SPLIT, ...AS }),
      describePlayerRound({
        strategy: "OUTWRITE",
        judgements: SPLIT.judgements,
        playerSide: "OPPONENT",
      }),
      ...describeAftermath({ result: SPLIT, ...AS }),
    ]
      .join(" ")
      .toLowerCase();

    for (const banned of [
      "next time",
      "unlucky",
      "so close",
      "don't worry",
      "keep going",
      "better luck",
      "well played",
    ]) {
      expect(prose).not.toContain(banned);
    }
  });

  /**
   * The aftermath is the world, not a payout.
   *
   * Neither the figures nor their deniable twin. "Respect increased!" is the
   * same idea with the number hidden and is the one that actually ships.
   */
  it("never announces a metric", () => {
    const lines = describeAftermath({ result: SPLIT, ...AS }).join(" ").toLowerCase();

    for (const banned of ["respect", "heat", "fame", "rivalry", "increased", "gained", "+"]) {
      expect(lines).not.toContain(banned);
    }

    /* It still says the rivalry is live — in the world's terms, not the model's. */
    expect(lines).toContain("kgosi");
    expect(lines).toContain("isn't finished");
  });

  /** The player's own round, described and never enumerated. */
  it("describes the player's round without listing anything", () => {
    const round = describePlayerRound({
      strategy: "WIN_THE_CROWD",
      judgements: SPLIT.judgements,
      playerSide: "OPPONENT",
    });

    expect(round).toContain("take the room");
    expect(round).not.toMatch(/\d/);
    /* Not one of the seven facts, named as a fact. */
    for (const fact of ["writing:", "flow:", "structure:", "crowd work:"]) {
      expect(round.toLowerCase()).not.toContain(fact);
    }
  });
});

describe("what scouting is allowed to say", () => {
  const findings: ScoutingFinding[] = [
    {
      label: "KGOSI in braamfontein",
      observed: { sceneStanding: 62.4, fame: 31, respect: 62.4 },
      source: "SCENE",
    },
    {
      label: "What they have done in rooms before",
      observed: { battles: 4, won: 3, lost: 1 },
      source: "BATTLE_HISTORY",
    },
  ];

  const unknowns = [
    {
      label: "What they will actually come with",
      reason: "Nobody declares an angle in advance, and guessing would not be scouting.",
    },
  ];

  it("attributes everything to a provenance the world owns", () => {
    const described = describeScouting({ findings, unknowns, rivalName: "KGOSI" });

    expect(described.sections.map((section) => section.heading)).toEqual([
      "Around the scene",
      "From previous battles",
    ]);

    /* Prose about a person, never the model in adjectives. */
    for (const line of described.sections.flatMap((section) => section.insights)) {
      expect(line).not.toMatch(/\d/);
      expect(line).not.toMatch(/writing|flow|structure|battleIQ|aptitude/i);
      expect(line).toContain("KGOSI");
    }
  });

  /**
   * What you don't know is first-class, and one unknown is load-bearing.
   *
   * The player chooses an angle without knowing the other one, and that is the
   * entire design of the strategy decision rather than a gap in the report.
   */
  it("reports what could not be known, including the angle", () => {
    const described = describeScouting({ findings, unknowns, rivalName: "KGOSI" });

    expect(described.unknowns).toHaveLength(1);
    expect(described.unknowns[0]).toContain("Nobody declares an angle in advance");
  });

  /**
   * An unrecognised finding is dropped rather than guessed at.
   *
   * The safe direction to fail. Falling back to the raw label or stringifying
   * `observed` would make every future finding a leak by default.
   */
  it("says nothing at all about a finding it does not understand", () => {
    const described = describeScouting({
      findings: [
        {
          label: "Something new the engine started recording",
          observed: { hiddenAptitude: 91.4, secretSkill: 77 },
          source: "WORLD",
        },
      ] satisfies ScoutingFinding[],
      unknowns: [],
      rivalName: "KGOSI",
    });

    expect(described.sections).toEqual([]);
    expect(JSON.stringify(described)).not.toContain("91.4");
    expect(JSON.stringify(described)).not.toContain("hiddenAptitude");
  });
});
