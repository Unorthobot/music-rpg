import type { CareerAct } from "./enums";

/**
 * Tunable simulation constants. Everything a designer might want to rebalance
 * lives here rather than being scattered through commands.
 */
export const gameConfig = {
  career: {
    startingAct: "UNDERGROUND" as CareerAct,
    startingFame: 0,
    startingRespect: 0,
    startingHeat: 0,
    startingLegacy: 0,
    /** Stored in minor units (cents) to keep money integral. */
    startingMoneyMinor: 500_000,
    /** One career per user per world during development. */
    maxCareersPerUserPerWorld: 1,
  },
  currency: {
    code: "ZAR",
    symbol: "R",
    minorUnitsPerMajor: 100,
  },
  world: {
    developmentWorldName: "Johannesburg",
    /** In-world start date for new worlds. */
    startGameTime: "2026-01-05T09:00:00.000Z",
  },
  artist: {
    /** Skill floor/ceiling for freshly created player artists. */
    minStartingSkill: 8,
    maxStartingSkill: 62,
    /** Traits inferred at creation. */
    maxStartingTraits: 3,
  },
  group: {
    minFoundingMembers: 1,
    maxFoundingMembers: 4,
    /** Membership defaults for the founding player member. */
    founderInfluence: 70,
    founderSatisfaction: 75,
    founderCommitment: 80,
    founderSoloAmbition: 35,
  },
  identity: {
    minStageNameLength: 2,
    maxStageNameLength: 32,
    maxBiographyLength: 600,
    maxFreeTextLength: 180,
  },
} as const;

export type GameConfig = typeof gameConfig;
