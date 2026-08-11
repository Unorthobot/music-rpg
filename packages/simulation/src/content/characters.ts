import type {
  CharacterRole,
  CharacterTier,
  SoundProfileValues,
} from "@music-rpg/shared";

/**
 * The first people in the world.
 *
 * Personality and preferences are structured because engines read them: a
 * producer's `soundBias` shapes what they propose, `agreeableness` decides
 * whether they push back, and `standards` decides how hard they are to please.
 * None of this is decoration, and none of it is a prompt.
 */
export type ProducerProfile = {
  /** Axis pull this producer brings to any brief. */
  soundBias: Partial<SoundProfileValues>;
  /** Session fee in integer minor units. */
  sessionCostMinor: number;
  /** 0–100. Low means they will tell you the idea is weak. */
  agreeableness: number;
  /** 0–100. High means they reject their own first ideas too. */
  standards: number;
  /** 0–100. High means they reach for the strange option. */
  adventurousness: number;
  /** Structural habits, used when a proposal describes an arrangement. */
  structures: string[];
  /** What they say when they like it, and when they don't. */
  voice: {
    approve: string[];
    push: string[];
    refuse: string[];
    working: string[];
  };
  /** Player-facing one-liners. */
  soundLine: string;
  strength: string;
  workingStyle: string;
  tradeOff: string;
};

/**
 * Somebody who books rooms.
 *
 * The world had no promoters at all before M7, which made "a promoter with a
 * slot" impossible to generate from anything real. These are read structurally
 * by the opportunity director exactly as a producer's profile is read by the
 * interpretation engine: `standard` is how well the scene has to know you before
 * they will put you on, and it is the reason two promoters in the same
 * neighbourhood answer the same career differently.
 *
 * `standard` is on the same 0–100 scale as scene standing, where 100 means the
 * scene is yours. Underground numbers are single digits, and these are set
 * accordingly — a first single earns a rooftop, not a headline.
 */
export type PromoterProfile = {
  /** Scene slug they book in. */
  sceneSlug: string;
  /** What the night is called. */
  nightName: string;
  /**
   * 0–100 scene standing they want before they will give you the *headline*.
   *
   * Carrying a night is a different ask from being on it, which is why there are
   * two bars rather than one. A promoter with a room to fill will put somebody
   * nobody knows on at nine o'clock; they will not build the evening around them.
   */
  standard: number;
  /**
   * The floor for being on the bill at all, as support.
   *
   * Always below `standard`. This is what stops the director from having nothing
   * to say to a career the scene has barely noticed — the honest offer to
   * somebody at that stage is a support slot, not silence.
   */
  supportStandard: number;
  /** What a support slot pays, against `payoutMinor` for the headline. */
  supportPayoutMinor: number;
  /** How far ahead they book. Two promoters on the same notice want the same night. */
  noticeDays: number;
  /** How long you have to answer before the offer lapses. Never beyond the night. */
  answerByDays: number;
  /** The room. */
  capacity: number;
  /** What the slot pays, integer minor units. Zero is a door split. */
  payoutMinor: number;
  /** Player-facing. Deterministic fixtures, not generated prose. */
  offerLine: string;
  termsLine: string;
};

export type CharacterSeed = {
  slug: string;
  name: string;
  role: CharacterRole;
  tier: CharacterTier;
  origin: string;
  biography: string;
  quote: string;
  personality: Record<string, number>;
  motives: Record<string, unknown>;
  currentGoal?: string;
  currentMood?: string;
  producer?: ProducerProfile;
  promoter?: PromoterProfile;
};

export const characterSeeds: CharacterSeed[] = [
  {
    slug: "thabo",
    name: "Thabo",
    role: "CONNECTOR",
    tier: "CORE",
    origin: "Braamfontein",
    biography:
      "Knows every door in Braam and which ones are worth knocking on. Books rooms, moves equipment, introduces people, takes no credit and remembers everything.",
    quote: "I don't make music. I make the phone ring.",
    personality: { warmth: 68, directness: 74, patience: 55, loyalty: 72, ego: 30 },
    motives: {
      primary: "keep the scene moving",
      secondary: "be owed favours by people who matter later",
      /** He is not impressed yet, and the writing should not pretend otherwise. */
      opinionOfPlayer: "unproven",
    },
    currentGoal: "Fill three producer sessions this month",
    currentMood: "busy",
  },
  {
    slug: "lex",
    name: "LEX",
    role: "PRODUCER",
    tier: "CORE",
    origin: "Newtown",
    biography:
      "Builds from silence outward. Owns very little equipment and uses less of it than you would expect. Has turned down more work than most producers have taken.",
    quote: "I don't make beats for everybody.",
    personality: { warmth: 34, directness: 88, patience: 62, loyalty: 55, ego: 66 },
    motives: { primary: "make something nobody else would make" },
    currentGoal: "Find one artist worth the time",
    currentMood: "sceptical",
    producer: {
      soundBias: {
        minimalDense: -0.55,
        organicElectronic: 0.5,
        accessibleExperimental: 0.5,
        darkBright: -0.4,
      },
      sessionCostMinor: 150_000,
      agreeableness: 28,
      standards: 88,
      adventurousness: 84,
      structures: [
        "Verse / space / verse — no chorus",
        "One long build with no release",
        "Intro, verse, collapse, verse",
      ],
      voice: {
        approve: [
          "That's the one. It's uncomfortable in the right place.",
          "Yes. Don't add anything to it.",
        ],
        push: [
          "I get what you're saying, but the whole thing's too safe.",
          "That idea works. It just isn't yours yet.",
        ],
        refuse: [
          "No. That's somebody else's record.",
          "I'm not doing that one. Give me something harder.",
        ],
        working: ["LEX is stripping things out.", "LEX is finding the space."],
      },
      soundLine: "Experimental / electronic / sparse",
      strength: "Originality",
      workingStyle: "Says no early and often",
      tradeOff: "High standards — expect pushback",
    },
  },
  {
    slug: "mo",
    name: "MO",
    role: "PRODUCER",
    tier: "CORE",
    origin: "Soweto",
    biography:
      "Came up on records his mother played on Sundays and has been chasing that specific warmth since. Digs for weeks, chops for hours, and will make you sing a line forty times.",
    quote: "Tell me what actually happened. Then we'll make it sound like it.",
    personality: { warmth: 78, directness: 60, patience: 80, loyalty: 74, ego: 42 },
    motives: { primary: "get the feeling right, however long it takes" },
    currentGoal: "Finish the record he's been sitting on for two years",
    currentMood: "steady",
    producer: {
      soundBias: {
        organicElectronic: -0.55,
        classicFuturistic: -0.45,
        melodicRhythmic: -0.2,
        intimateAnthemic: -0.3,
      },
      sessionCostMinor: 220_000,
      agreeableness: 68,
      standards: 72,
      adventurousness: 44,
      structures: [
        "Intro, verse, hook, verse, hook, outro",
        "Sample-led loop with a live break",
        "Two verses, no hook, long fade",
      ],
      voice: {
        approve: [
          "Now that's a song. Let's cut it properly.",
          "That's the truth. We keep that.",
        ],
        push: [
          "It's good. It's not honest yet — say the harder version.",
          "I hear it. Slow it down and mean it more.",
        ],
        refuse: [
          "That's a trend. You'll hate it in a year.",
          "Not that one. It's not you talking.",
        ],
        working: ["MO is chopping something.", "MO is chasing the warmth."],
      },
      soundLine: "Soulful / sample-led / drum-driven",
      strength: "Musicality and storytelling",
      workingStyle: "Patient, asks a lot of questions",
      tradeOff: "Costs more per session",
    },
  },
  {
    /*
     * Canonical slug is deliberately `producer-zero`: the display name ZERO must
     * not collide with any future artist identifier of a similar name.
     */
    slug: "producer-zero",
    name: "ZERO",
    role: "PRODUCER",
    tier: "WORLD",
    origin: "Alexandra",
    biography:
      "Learned production from tutorials and stubbornness. Fast, loud, and unbothered by whether an idea is fashionable, as long as it works on the first listen.",
    quote: "If it doesn't hit in eight seconds, it doesn't hit.",
    personality: { warmth: 62, directness: 70, patience: 34, loyalty: 50, ego: 58 },
    motives: { primary: "a placement, a hit, a way out" },
    currentGoal: "Get one record on the radio",
    currentMood: "hungry",
    producer: {
      soundBias: {
        accessibleExperimental: -0.5,
        rawPolished: 0.45,
        intimateAnthemic: 0.5,
        darkBright: 0.25,
      },
      sessionCostMinor: 90_000,
      agreeableness: 74,
      standards: 48,
      adventurousness: 38,
      structures: [
        "Hook, verse, hook, verse, hook",
        "Cold open on the hook",
        "Short verses, doubled chorus",
      ],
      voice: {
        approve: ["That's a single. I'm telling you now.", "Yes — that one moves."],
        push: [
          "It's cold. Give me something people can hold onto.",
          "Nobody's finishing that one. Bring the hook forward.",
        ],
        refuse: ["That's an album track at best.", "Not that. It's too clever for its own good."],
        working: ["ZERO is stacking the hook.", "ZERO is pushing the levels."],
      },
      soundLine: "Melodic / modern / immediate",
      strength: "Accessibility on the first listen",
      workingStyle: "Fast, agreeable, high energy",
      tradeOff: "Less experienced — fewer surprises",
    },
  },
];

export const producerSeeds = characterSeeds.filter((character) => character.producer);

export function producerProfileFor(slug: string): ProducerProfile | undefined {
  return characterSeeds.find((character) => character.slug === slug)?.producer;
}

/**
 * The people who book the rooms.
 *
 * Four of them, and the differences between them are the point: two in
 * Braamfontein who book the same weekend and will therefore compete for it, one
 * in Newtown who wants a little more before committing, and one in Soweto whose
 * standards the brief's own scene description already set — respect there is slow
 * to earn and slower to lose, so a first single does not buy a night.
 */
export const promoterSeeds: CharacterSeed[] = [
  {
    slug: "naledi",
    name: "Naledi",
    role: "PROMOTER",
    tier: "CORE",
    origin: "Braamfontein",
    biography:
      "Runs a rooftop on Juta Street twice a month and has put on the first show of about half the people who matter now. Books on instinct, pays on the night, and does not chase anybody twice.",
    quote: "I don't need you to be big. I need you to be worth standing up for.",
    personality: { warmth: 70, directness: 80, patience: 40, loyalty: 60, ego: 38 },
    motives: { primary: "keep the room interesting", secondary: "find them before anyone else" },
    currentGoal: "Fill the next two rooftops with people nobody has seen yet",
    currentMood: "restless",
    promoter: {
      sceneSlug: "braamfontein",
      nightName: "Rooftop hours",
      // Takes chances. The scene only has to have started noticing.
      standard: 4,
      // She will put anybody on at nine to see what happens.
      supportStandard: 2,
      supportPayoutMinor: 12_000,
      noticeDays: 6,
      answerByDays: 4,
      capacity: 120,
      payoutMinor: 40_000,
      offerLine: "I've got a rooftop in a week and a half-hour I'd give you.",
      termsLine: "Thirty minutes, paid on the night, bring your own people.",
    },
  },
  {
    slug: "dineo",
    name: "Dineo",
    role: "PROMOTER",
    tier: "WORLD",
    origin: "Braamfontein",
    biography:
      "Books a basement under a bookshop with eighty people in it and a sound system worth more than the building. Fussier than the room deserves, which is why the room has a reputation.",
    quote: "Small room. Nowhere to hide in it.",
    personality: { warmth: 48, directness: 72, patience: 66, loyalty: 55, ego: 52 },
    motives: { primary: "protect what the room means" },
    currentGoal: "Keep the basement's run of good nights going",
    currentMood: "particular",
    promoter: {
      sceneSlug: "braamfontein",
      nightName: "Basement sessions",
      // A bit more selective than Naledi, in the same neighbourhood.
      standard: 6,
      supportStandard: 4,
      supportPayoutMinor: 8_000,
      // The same notice, deliberately: two promoters wanting the same weekend is
      // the case the conflict model exists for.
      noticeDays: 6,
      answerByDays: 3,
      capacity: 80,
      payoutMinor: 25_000,
      offerLine: "There's a Friday in the basement. It's yours if you want it.",
      termsLine: "Forty minutes, small door split, no support act.",
    },
  },
  {
    slug: "tumi",
    name: "Tumi",
    role: "PROMOTER",
    tier: "WORLD",
    origin: "Newtown",
    biography:
      "Programmes a live room with a house band and engineers who have heard everything. Will not book somebody who cannot hold a room without a laptop.",
    quote: "Live is different. Everybody finds that out on stage.",
    personality: { warmth: 56, directness: 66, patience: 74, loyalty: 64, ego: 44 },
    motives: { primary: "keep the live room live" },
    currentGoal: "Put together a bill that works without a headliner",
    currentMood: "measured",
    promoter: {
      sceneSlug: "newtown",
      nightName: "The live room",
      standard: 5,
      supportStandard: 3,
      supportPayoutMinor: 18_000,
      noticeDays: 9,
      answerByDays: 5,
      capacity: 180,
      payoutMinor: 60_000,
      offerLine: "I've got a slot on a bill in Newtown. House band, real room.",
      termsLine: "Two songs with the band, a fee, one rehearsal expected.",
    },
  },
  {
    slug: "sizwe",
    name: "Sizwe",
    role: "PROMOTER",
    tier: "WORLD",
    origin: "Soweto",
    biography:
      "Has run the same night for eleven years and remembers every person who wasted a slot on it. The bill is short and nobody on it is there by accident.",
    quote: "People here have been coming for eleven years. I'm not experimenting on them.",
    personality: { warmth: 52, directness: 84, patience: 80, loyalty: 76, ego: 46 },
    motives: { primary: "the night's reputation, before anybody's career" },
    currentGoal: "Keep the standard that made the night worth attending",
    currentMood: "unhurried",
    promoter: {
      sceneSlug: "soweto",
      nightName: "Sunday long set",
      // Soweto: deep roots and hard standards. A first single does not buy this.
      standard: 12,
      // Even the opening slot on this night is earned.
      supportStandard: 8,
      supportPayoutMinor: 30_000,
      noticeDays: 12,
      answerByDays: 6,
      capacity: 300,
      payoutMinor: 90_000,
      offerLine: "There's a Sunday. I don't offer them twice.",
      termsLine: "A full set, properly paid, and the room will tell you the truth.",
    },
  },
];

export function promoterProfileFor(slug: string): PromoterProfile | undefined {
  return promoterSeeds.find((character) => character.slug === slug)?.promoter;
}

/** Everybody a world starts with. One list, one seeding loop. */
export const worldCharacterSeeds: CharacterSeed[] = [...characterSeeds, ...promoterSeeds];
