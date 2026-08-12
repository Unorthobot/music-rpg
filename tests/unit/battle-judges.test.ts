import { describe, expect, it } from "vitest";
import {
  audienceCohortSeeds,
  baselineFacts,
  convenePanel,
  deriveResult,
  expandPsychology,
  expandSkills,
  judgeAudience,
  judgeTechnical,
  opponentSeeds,
  performBattleRound,
  roomComposition,
  strategyAptitude,
} from "@music-rpg/simulation";
import {
  NO_PREPARATION,
  type BattleCohortFacts,
  type BattlePerformanceFacts,
  type BattleStrategy,
} from "@music-rpg/shared";

/**
 * The judges, on their own.
 *
 * Everything here is pure: no database, no clock, no seed beyond the ones passed
 * in. What is being protected is the property the whole milestone rests on —
 * that three judges answering three different questions from three different
 * inputs are *capable of legitimate disagreement*, and are not three differently
 * named readings of one number.
 */

/** M5's populations, narrowed. Every value is the cohort's own recorded one. */
const COHORTS: BattleCohortFacts[] = audienceCohortSeeds.map((cohort) => ({
  slug: cohort.slug,
  name: cohort.name,
  size: cohort.size,
  sceneAffinity: cohort.sceneAffinity,
  qualities: cohort.preferences.qualities,
  attention: cohort.behaviour.attention,
}));

const PLAYER = {
  skills: expandSkills({
    lyricism: 62,
    flow: 58,
    storytelling: 60,
    performance: 55,
    battleIQ: 48,
    experimentation: 54,
    versatility: 50,
  }),
  psychology: expandPsychology({
    confidence: 58,
    discipline: 60,
    resilience: 52,
    adaptability: 55,
  }),
};

function rivalOf(slug: string) {
  const seed = opponentSeeds.find((entry) => entry.slug === slug)!;
  return {
    seed,
    skills: expandSkills(seed.skills),
    psychology: expandPsychology(seed.psychology),
  };
}

describe("the room is a real input, not a second quality score", () => {
  /*
   * §21's test, and the one that proves the Audience judge consumes world
   * context rather than being a third opinion about craft.
   *
   * The performances are computed once and *held constant*. Only the scene
   * changes — which changes who is in the room, because M5's cohorts are
   * concentrated differently and want different things.
   */
  const rival = rivalOf("seko");
  const challenger = performBattleRound({
    side: "CHALLENGER",
    artistId: "rival",
    skills: rival.skills,
    psychology: rival.psychology,
    strategy: "TAKE_THEM_APART",
    preparation: NO_PREPARATION,
    seed: "fixed:rival",
  });
  const opponent = performBattleRound({
    side: "OPPONENT",
    artistId: "player",
    skills: PLAYER.skills,
    psychology: PLAYER.psychology,
    strategy: "OUTWRITE",
    preparation: NO_PREPARATION,
    seed: "fixed:player",
  });

  const judgeIn = (sceneSlug: string) =>
    judgeAudience({
      challenger: { facts: challenger.facts, strategy: challenger.strategy },
      opponent: { facts: opponent.facts, strategy: opponent.strategy },
      sceneSlug,
      cohorts: COHORTS,
      // Held equal, so nothing but the room can explain a difference.
      challengerStanding: 10,
      opponentStanding: 10,
    });

  it("puts different people in different rooms, from M5's own concentrations", () => {
    const alexandra = roomComposition("alexandra", COHORTS);
    const maboneng = roomComposition("maboneng", COHORTS);
    const newtown = roomComposition("newtown", COHORTS);

    const shareOf = (room: ReturnType<typeof roomComposition>, slug: string) =>
      room.find((seat) => seat.slug === slug)!.share;

    /* Every room sums to one, and none of them is the same room. */
    for (const room of [alexandra, maboneng, newtown]) {
      expect(room.reduce((total, seat) => total + seat.share, 0)).toBeCloseTo(1, 5);
    }

    // Maboneng is where the tastemakers are; Alexandra is not.
    expect(shareOf(maboneng, "TASTEMAKERS")).toBeGreaterThan(shareOf(alexandra, "TASTEMAKERS"));
    // Newtown is the scene's institutional memory, and reads that way.
    expect(shareOf(newtown, "SCENE_HEADS")).toBeGreaterThan(shareOf(alexandra, "SCENE_HEADS"));
    // Alexandra is the broadest room of the three.
    expect(shareOf(alexandra, "CASUAL_LISTENERS")).toBeGreaterThan(
      shareOf(newtown, "CASUAL_LISTENERS"),
    );
  });

  it("judges identical performances differently because the room is different", () => {
    const alexandra = judgeIn("alexandra");
    const newtown = judgeIn("newtown");

    /*
     * The dense `OUTWRITE` round plays better to a room that is nearly half scene
     * heads than to one that is three-quarters casual listeners — because scene
     * heads weight immediacy at 0.13 and casual listeners at 0.62, which is M5's
     * seeded data and not this engine's opinion.
     */
    expect(newtown.opponentTotal).toBeGreaterThan(alexandra.opponentTotal);

    // And the gap between the two artists narrows in the room that rewards density.
    const gap = (decision: typeof alexandra) =>
      decision.challengerTotal - decision.opponentTotal;
    expect(gap(newtown)).toBeLessThan(gap(alexandra));

    /* The reason is named on the contribution, not left to be inferred. */
    const taste = newtown.contributions.find((entry) => entry.term === "cohortTaste")!;
    expect(taste.note).toContain("newtown");
  });
});

describe("the judges are independent by construction", () => {
  it("does not let the Technical judge see the declared angle", () => {
    /*
     * Structural rather than behavioural: the Technical judge's input type has no
     * strategy field, so it cannot read one. The brief's requirement that
     * `OUTWRITE` be rewarded technically is met by the *facts* differing — which
     * is checked below — rather than by the judge being told what to think.
     */
    const facts: BattlePerformanceFacts = {
      writing: 70,
      flow: 60,
      structure: 65,
      originality: 55,
      rebuttal: 50,
      delivery: 80,
      crowdWork: 90,
    };
    const quieter: BattlePerformanceFacts = { ...facts, delivery: 10, crowdWork: 10 };

    // Two rounds that differ only in what the room saw are identical to this judge.
    const first = judgeTechnical({
      challenger: facts,
      opponent: quieter,
      challengerArtistId: "a",
      opponentArtistId: "b",
    });
    expect(first.challengerTotal).toBe(first.opponentTotal);
    expect(first.irrelevant).toContain("crowdWork");
    expect(first.irrelevant).toContain("delivery");
  });

  it("makes an angle an attempt, not a switch", () => {
    /*
     * The correction that made the Strategic judge more than a second Technical
     * one. Aptitude differs by artist, so declaring an angle you are unsuited to
     * genuinely produces a weaker execution of it.
     */
    const kgosi = rivalOf("kgosi");
    const madala = rivalOf("madala");

    // The performer is far better placed to take a room than the writer is.
    expect(strategyAptitude("WIN_THE_CROWD", kgosi.skills, kgosi.psychology)).toBeGreaterThan(
      strategyAptitude("WIN_THE_CROWD", madala.skills, madala.psychology),
    );
    // And the reverse, on the angle that is about what was actually written.
    expect(strategyAptitude("OUTWRITE", madala.skills, madala.psychology)).toBeGreaterThan(
      strategyAptitude("OUTWRITE", kgosi.skills, kgosi.psychology),
    );
  });

  it("lets a technically weaker round win the judge whose question it answered", () => {
    /*
     * MADALA declares the angle he is worst suited to and does not carry it out;
     * the player declares one that suits them and does. The Technical judge still
     * prefers MADALA — he is simply a better writer — and the Strategic judge is
     * capable of not, because that is not the question it is asking.
     *
     * Swept across seeds rather than asserted on one, and deliberately so. The
     * two are genuinely close on execution, so a single seed would be picking a
     * night rather than demonstrating a property. What is claimed is that the
     * Strategic judge *can* part company with the Technical one on the same pair
     * of rounds — which a judge that was a second reading of craft never could.
     */
    const madala = rivalOf("madala");
    const seeds = ["night:a", "night:b", "night:c", "night:d", "night:e", "night:f"];

    let technicalAlwaysMadala = true;
    let strategicDissents = 0;
    let splits = 0;

    for (const seed of seeds) {
      const challenger = performBattleRound({
        side: "CHALLENGER",
        artistId: "madala",
        skills: madala.skills,
        psychology: madala.psychology,
        strategy: "WIN_THE_CROWD",
        preparation: NO_PREPARATION,
        seed: `${seed}:challenger`,
      });
      const opponent = performBattleRound({
        side: "OPPONENT",
        artistId: "player",
        skills: PLAYER.skills,
        psychology: PLAYER.psychology,
        strategy: "OUTWRITE",
        preparation: NO_PREPARATION,
        seed: `${seed}:opponent`,
      });

      const judgements = convenePanel({
        challenger: {
          performance: challenger,
          skills: madala.skills,
          psychology: madala.psychology,
          sceneStanding: 20,
        },
        opponent: {
          performance: opponent,
          skills: PLAYER.skills,
          psychology: PLAYER.psychology,
          sceneStanding: 6,
        },
        sceneSlug: madala.seed.battler.sceneSlug,
        cohorts: COHORTS,
      });

      const technical = judgements.find((entry) => entry.judge === "TECHNICAL")!;
      const strategic = judgements.find((entry) => entry.judge === "STRATEGIC")!;

      if (technical.verdict !== "CHALLENGER") technicalAlwaysMadala = false;
      if (strategic.verdict !== technical.verdict) strategicDissents += 1;

      const result = deriveResult({
        judgements,
        challengerArtistId: "madala",
        opponentArtistId: "player",
      });
      if (result.split) splits += 1;
    }

    /* The craft judge is not in doubt: MADALA is the better writer, every night. */
    expect(technicalAlwaysMadala).toBe(true);

    /* And the execution judge parts company with it on some of those nights. */
    expect(strategicDissents).toBeGreaterThan(0);
    expect(splits).toBeGreaterThan(0);
  });

  it("derives a result from votes and never from a sum of the judges' totals", () => {
    const judgements = [
      {
        judge: "TECHNICAL" as const,
        panelRole: "REQUIRED" as const,
        question: "",
        verdict: "CHALLENGER" as const,
        // A landslide for this judge, and it is still worth exactly one vote.
        challengerTotal: 99,
        opponentTotal: 1,
        margin: 98,
        contributions: [],
        irrelevant: [],
        engineVersion: "test",
      },
      {
        judge: "STRATEGIC" as const,
        panelRole: "REQUIRED" as const,
        question: "",
        verdict: "OPPONENT" as const,
        challengerTotal: 50,
        opponentTotal: 51,
        margin: 1,
        contributions: [],
        irrelevant: [],
        engineVersion: "test",
      },
      {
        judge: "AUDIENCE" as const,
        panelRole: "REQUIRED" as const,
        question: "",
        verdict: "OPPONENT" as const,
        challengerTotal: 50,
        opponentTotal: 51,
        margin: 1,
        contributions: [],
        irrelevant: [],
        engineVersion: "test",
      },
    ];

    const result = deriveResult({
      judgements,
      challengerArtistId: "a",
      opponentArtistId: "b",
    });

    /*
     * Summing the totals would give the challenger 199 to 103 and the wrong
     * answer. The panel is a count of verdicts, which is the whole point.
     */
    expect(result.winner).toBe("OPPONENT");
    expect(result.decision).toBe("2-1");
  });

  it("ignores advisory perspectives when deriving a result", () => {
    /*
     * The property that makes judgements-as-rows safe: a fourth perspective can
     * be recorded against a battle later without a battle that has already been
     * decided changing its mind.
     */
    const base = {
      question: "",
      challengerTotal: 50,
      opponentTotal: 40,
      margin: 10,
      contributions: [],
      irrelevant: [],
      engineVersion: "test",
    };

    const result = deriveResult({
      judgements: [
        { ...base, judge: "TECHNICAL" as const, panelRole: "REQUIRED" as const, verdict: "CHALLENGER" as const },
        { ...base, judge: "STRATEGIC" as const, panelRole: "REQUIRED" as const, verdict: "CHALLENGER" as const },
        { ...base, judge: "AUDIENCE" as const, panelRole: "REQUIRED" as const, verdict: "OPPONENT" as const },
        // Three advisory votes the other way change nothing.
        { ...base, judge: "COMMUNITY" as unknown as "TECHNICAL", panelRole: "ADVISORY" as const, verdict: "OPPONENT" as const },
      ],
      challengerArtistId: "a",
      opponentArtistId: "b",
    });

    expect(result.winner).toBe("CHALLENGER");
    expect(result.decision).toBe("2-1");
  });
});

describe("a performance is what you did, not what you said you would do", () => {
  it("keeps the strategy and the facts as separate things", () => {
    const strategies: BattleStrategy[] = ["OUTWRITE", "WIN_THE_CROWD", "TAKE_THEM_APART"];
    const rounds = strategies.map((strategy) =>
      performBattleRound({
        side: "OPPONENT",
        artistId: "player",
        skills: PLAYER.skills,
        psychology: PLAYER.psychology,
        strategy,
        preparation: NO_PREPARATION,
        seed: "fixed:player",
      }),
    );

    const [dense, loud, direct] = rounds;

    /* Each angle produces a genuinely different round, in facts. */
    expect(dense!.facts.writing).toBeGreaterThan(loud!.facts.writing);
    expect(loud!.facts.crowdWork).toBeGreaterThan(dense!.facts.crowdWork);
    expect(direct!.facts.rebuttal).toBeGreaterThan(dense!.facts.rebuttal);

    /* And every fact says how it got there. */
    for (const round of rounds) {
      expect(round.derivation).toHaveLength(7);
      for (const entry of round.derivation) {
        expect(entry.note.length).toBeGreaterThan(0);
        expect(entry.value).toBeGreaterThanOrEqual(0);
        expect(entry.value).toBeLessThanOrEqual(100);
      }
    }

    /* Nothing anywhere sums them. There is no total on a performance. */
    expect(Object.keys(dense!.facts)).toHaveLength(7);
    expect(Object.keys(dense!.facts)).not.toContain("total");
  });

  it("has an angle cost the same whoever takes it, and buy less to the unsuited", () => {
    const kgosi = rivalOf("kgosi");
    const madala = rivalOf("madala");

    const round = (who: typeof kgosi) =>
      performBattleRound({
        side: "OPPONENT",
        artistId: "x",
        skills: who.skills,
        psychology: who.psychology,
        strategy: "OUTWRITE",
        preparation: NO_PREPARATION,
        seed: "fixed",
      });

    const performerTrying = round(kgosi);
    const writerDoingIt = round(madala);

    const shiftFor = (
      derivation: typeof performerTrying.derivation,
      fact: string,
    ) => derivation.find((entry) => entry.fact === fact)!.strategyShift;

    /* The writer gets more out of the angle they are actually built for. */
    expect(shiftFor(writerDoingIt.derivation, "writing")).toBeGreaterThan(
      shiftFor(performerTrying.derivation, "writing"),
    );

    /* And both pay the same price for taking it. */
    expect(shiftFor(writerDoingIt.derivation, "crowdWork")).toBe(
      shiftFor(performerTrying.derivation, "crowdWork"),
    );
  });

  it("lifts a round with preparation without lifting anybody past their craft", () => {
    const bare = performBattleRound({
      side: "OPPONENT",
      artistId: "player",
      skills: PLAYER.skills,
      psychology: PLAYER.psychology,
      strategy: "OUTWRITE",
      preparation: NO_PREPARATION,
      seed: "fixed:player",
    });
    const worked = performBattleRound({
      side: "OPPONENT",
      artistId: "player",
      skills: PLAYER.skills,
      psychology: PLAYER.psychology,
      strategy: "OUTWRITE",
      preparation: { sessions: 3, spendMinor: 135_000, daysCommitted: 3 },
      seed: "fixed:player",
    });

    expect(worked.facts.writing).toBeGreaterThan(bare.facts.writing);

    /*
     * And a fully prepared player is still nowhere near a genuinely better
     * writer's unprepared round. Preparation raises the ceiling; it does not
     * hand anybody ability they do not have.
     */
    const madala = rivalOf("madala");
    const theirs = performBattleRound({
      side: "CHALLENGER",
      artistId: "madala",
      skills: madala.skills,
      psychology: madala.psychology,
      strategy: "OUTWRITE",
      preparation: NO_PREPARATION,
      seed: "fixed:madala",
    });
    expect(theirs.facts.writing).toBeGreaterThan(worked.facts.writing);
  });

  it("computes a baseline the Strategic judge can measure intent against", () => {
    const baseline = baselineFacts(PLAYER.skills, PLAYER.psychology);
    const round = performBattleRound({
      side: "OPPONENT",
      artistId: "player",
      skills: PLAYER.skills,
      psychology: PLAYER.psychology,
      strategy: "WIN_THE_CROWD",
      preparation: NO_PREPARATION,
      seed: "fixed:player",
    });

    // The baseline is what they would have done with no angle at all.
    expect(round.facts.crowdWork).toBeGreaterThan(baseline.crowdWork);
    expect(round.facts.structure).toBeLessThan(baseline.structure);
  });
});
