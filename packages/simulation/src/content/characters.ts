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
