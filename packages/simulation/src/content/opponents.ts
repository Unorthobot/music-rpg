import type {
  ArchetypeKey,
  PsychologyValues,
  SkillValues,
  SoundProfileValues,
  TraitKey,
} from "@music-rpg/shared";

/**
 * The people who would actually call you out.
 *
 * Before M8 the world contained a connector, three producers, four promoters and
 * a handful of group-member candidates. `CHARACTER_ROLES` has included `ARTIST`
 * since M1 and nobody had ever been one. That is a content gap that would have
 * masqueraded as an engine gap: a battle system with nobody to battle tests
 * nothing.
 *
 * These are not fixtures. Each one is seeded as a **pair** — an `artists` row
 * carrying the craft (skills, psychology, sound, traits) and a `characters` row
 * carrying the social face (a biography, a reason to care, a room they run,
 * something they would actually say) — linked by `characters.artist_id`. The
 * split is the world's, not the milestone's: the Opportunity Director, messaging
 * and M6's relationships are all character-keyed, and a verse can only be derived
 * from an artist. Neither half is decoration and neither is a prompt.
 *
 * Three of them, and the differences are the point. They are drawn from the
 * scenes the world already describes rather than invented beside them:
 *
 * - **Alexandra** — *"Dense, competitive, unsentimental. Bars get tested in the
 *   street before they reach a stage."* SEKO is what that scene produces.
 * - **Soweto** — *"Deep roots and hard standards. Respect is slow to earn and
 *   slower to lose."* MADALA battles rarely, and the standard is the point.
 * - **Braamfontein** — *"Student bars, rooftop shows and too many people with
 *   something to prove."* KGOSI takes rooms rather than arguments.
 *
 * A career that battles all three of them will have been judged by three
 * genuinely different problems, which is the only honest test of a panel that is
 * allowed to disagree.
 */

/**
 * Somebody who competes.
 *
 * Read structurally by the director exactly as `PromoterProfile` is — `standard`
 * is how much of a career they need to see before you are worth their time, on
 * the same 0-100 scene-standing scale, and Underground numbers are single
 * digits. Nobody with a reputation calls out somebody nobody has heard of; that
 * is not modesty, it is that there is nothing in it for them.
 */
export type BattlerProfile = {
  /** Where they are from and where they would hold it. */
  sceneSlug: string;
  /** The room. Small — a battle is a room, not a release. */
  venueName: string;
  capacity: number;
  /**
   * 0-100 scene standing they want before you are worth challenging.
   *
   * The floor, not a target. Above it they are interested; far above it they are
   * *more* interested, and that is ranking's business rather than eligibility's.
   */
  standard: number;
  /** How far ahead they would set it. */
  noticeDays: number;
  /** How long you have to answer before they stop waiting. */
  answerByDays: number;
  /**
   * Why they compete at all.
   *
   * Read by eligibility, because the three have different preconditions: making
   * a name needs somebody worth taking it from, defending a scene needs you to
   * be *in* their scene, and settling something needs there to be something.
   */
  motive: "MAKE_A_NAME" | "DEFEND_THE_SCENE" | "SETTLE_SOMETHING";
  /** What they say when they call you out. Authored, never generated. */
  challengeLine: string;
  termsLine: string;
};

export type OpponentSeed = {
  slug: string;
  stageName: string;
  origin: string;
  archetype: ArchetypeKey;
  /** The artist half. */
  biography: string;
  traits: TraitKey[];
  sound: Partial<SoundProfileValues>;
  skills: Partial<SkillValues>;
  psychology: Partial<PsychologyValues>;
  /** The character half. */
  quote: string;
  personality: Record<string, number>;
  motives: Record<string, unknown>;
  currentGoal: string;
  currentMood: string;
  battler: BattlerProfile;
};

export const opponentSeeds: OpponentSeed[] = [
  {
    slug: "seko",
    stageName: "SEKO",
    origin: "Alexandra",
    archetype: "THE_DISRUPTOR",
    biography:
      "Came up battling on the corner of London Road where losing meant walking home. Writes for the counter — every bar he brings is built to answer something you have not said yet. Has never released a record and does not seem bothered about it.",
    traits: ["BATTLE_BORN", "HEADSTRONG"],
    sound: { rawPolished: -0.6, darkBright: -0.45, minimalDense: 0.4, accessibleExperimental: 0.2 },
    /*
     * The technician. Highest battleIQ in the world, writing and flow to match,
     * and almost no melody — he has never needed any. Rebuttal is what he is
     * for, so a strategy that ignores what he brought loses to him badly.
     */
    skills: {
      battleIQ: 82,
      lyricism: 74,
      flow: 76,
      performance: 58,
      storytelling: 52,
      melody: 18,
      production: 22,
      experimentation: 46,
      versatility: 40,
    },
    psychology: {
      competitiveness: 92,
      confidence: 80,
      ego: 74,
      resilience: 76,
      discipline: 62,
      patience: 28,
      riskTolerance: 66,
      adaptability: 58,
      ambition: 64,
    },
    quote: "I don't write songs. I write answers.",
    personality: { warmth: 26, directness: 92, patience: 28, loyalty: 44, ego: 74 },
    motives: {
      primary: "be the one nobody will book against",
      secondary: "prove the record people are overrated",
      opinionOfPlayer: "unproven",
    },
    currentGoal: "Take somebody's reputation before they have finished building it",
    currentMood: "sharp",
    battler: {
      sceneSlug: "alexandra",
      venueName: "The yard on London Road",
      // Small, loud, and nobody there is neutral.
      capacity: 90,
      /*
       * The lowest bar of the three. He is *looking* for somebody with something
       * worth taking, which means he does not need you to be established — he
       * needs you to have started.
       */
      standard: 3,
      noticeDays: 5,
      answerByDays: 3,
      motive: "MAKE_A_NAME",
      challengeLine:
        "Heard your thing. Come to the yard on Friday and say it in front of people.",
      termsLine: "Three rounds, no beat, whoever the yard believes.",
    },
  },
  {
    slug: "madala",
    stageName: "MADALA",
    origin: "Soweto",
    archetype: "THE_STORYTELLER",
    biography:
      "Has been writing since before most of the people he battles were born, and turns down more of them than he accepts. Builds a verse like an argument — setup, evidence, the thing you cannot answer — and has never once raised his voice to win a room.",
    traits: ["CRATE_DIGGER", "WORKHORSE"],
    sound: { organicElectronic: -0.6, classicFuturistic: -0.55, rawPolished: -0.2, intimateAnthemic: -0.35 },
    /*
     * The writer. Structure and storytelling are what he wins with, and his crowd
     * work is deliberately the weakest of the three — he does not perform at a
     * room, he argues at it. An audience judge reading immediacy will punish him
     * in a scene that wants to be moved.
     */
    skills: {
      lyricism: 80,
      storytelling: 84,
      battleIQ: 66,
      flow: 62,
      performance: 50,
      melody: 34,
      production: 30,
      experimentation: 38,
      versatility: 56,
    },
    psychology: {
      discipline: 86,
      patience: 88,
      confidence: 70,
      resilience: 82,
      competitiveness: 58,
      ego: 40,
      riskTolerance: 30,
      adaptability: 44,
      ambition: 48,
    },
    quote: "I've been doing this since before you had a reason to.",
    personality: { warmth: 58, directness: 76, patience: 88, loyalty: 78, ego: 40 },
    motives: {
      primary: "keep the standard where it was left",
      secondary: "find out whether anybody coming up can actually write",
      opinionOfPlayer: "unproven",
    },
    currentGoal: "Test whoever the scene has started talking about",
    currentMood: "unhurried",
    battler: {
      sceneSlug: "soweto",
      venueName: "The back room on Vilakazi",
      capacity: 140,
      /*
       * The highest bar, for the reason the scene's own description gives:
       * respect in Soweto is slow to earn. He does not test people the scene has
       * not started talking about, because there is nothing to test.
       */
      standard: 9,
      noticeDays: 10,
      answerByDays: 5,
      motive: "DEFEND_THE_SCENE",
      challengeLine:
        "People keep saying your name to me. Come and say something in the back room and I'll tell you if they're right.",
      termsLine: "Two rounds, written, and the room has been here longer than both of us.",
    },
  },
  {
    slug: "kgosi",
    stageName: "KGOSI",
    origin: "Braamfontein",
    archetype: "THE_PERFORMER",
    biography:
      "Won a rooftop battle in front of four hundred people with a verse most writers would call thin, and has been dining out on it since. Reads a room faster than anybody in the city and is entirely unembarrassed about what that is worth.",
    traits: ["SHOWMAN", "BATTLE_BORN"],
    sound: { rawPolished: 0.35, intimateAnthemic: 0.55, accessibleExperimental: -0.4, darkBright: 0.3 },
    /*
     * The performer. Delivery and crowd work carry him and his writing genuinely
     * does not — which is the case the milestone needs to exist: a technical
     * judge marking somebody down while the room goes with them anyway.
     */
    skills: {
      performance: 84,
      flow: 78,
      battleIQ: 70,
      lyricism: 58,
      storytelling: 44,
      melody: 52,
      production: 26,
      experimentation: 34,
      versatility: 62,
    },
    psychology: {
      confidence: 90,
      riskTolerance: 82,
      competitiveness: 76,
      ego: 78,
      adaptability: 74,
      resilience: 62,
      discipline: 40,
      patience: 34,
      ambition: 72,
    },
    quote: "Nobody remembers the best verse. They remember the best night.",
    personality: { warmth: 72, directness: 70, patience: 34, loyalty: 48, ego: 78 },
    motives: {
      primary: "be the night people talk about on Monday",
      secondary: "stay ahead of the people who can actually write",
      opinionOfPlayer: "unproven",
    },
    currentGoal: "Put on one more rooftop before somebody better turns up",
    currentMood: "restless",
    battler: {
      sceneSlug: "braamfontein",
      venueName: "The rooftop off Juta",
      // The biggest room of the three, which is the only reason Fame moves at all.
      capacity: 220,
      standard: 5,
      noticeDays: 7,
      answerByDays: 4,
      motive: "SETTLE_SOMETHING",
      challengeLine:
        "You've been getting mentioned in rooms I'm in. Let's settle that on the roof.",
      termsLine: "Three rounds over beats, and four hundred people decide.",
    },
  },
];

export function battlerProfileFor(slug: string): BattlerProfile | undefined {
  return opponentSeeds.find((opponent) => opponent.slug === slug)?.battler;
}
