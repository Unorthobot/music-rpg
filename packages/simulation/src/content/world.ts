import { gameConfig } from "@music-rpg/shared";

/**
 * Development world content.
 *
 * One world is seeded, but nothing here is special-cased: adding a second world
 * is adding another entry.
 */
export type SceneSeed = { slug: string; name: string; description: string };
export type WorldSeed = {
  slug: string;
  name: string;
  currentGameTime: string;
  scenes: SceneSeed[];
};

export const worldSeeds: WorldSeed[] = [
  {
    slug: "johannesburg",
    name: gameConfig.world.developmentWorldName,
    currentGameTime: gameConfig.world.startGameTime,
    scenes: [
      {
        slug: "braamfontein",
        name: "Braamfontein",
        description:
          "Student bars, rooftop shows and too many people with something to prove. Where most careers get their first real audience.",
      },
      {
        slug: "maboneng",
        name: "Maboneng",
        description:
          "Galleries, pop-ups and industry eyes. Attention here travels further than it should.",
      },
      {
        slug: "soweto",
        name: "Soweto",
        description:
          "Deep roots and hard standards. Respect is slow to earn and slower to lose.",
      },
      {
        slug: "alexandra",
        name: "Alexandra",
        description:
          "Dense, competitive, unsentimental. Bars get tested in the street before they reach a stage.",
      },
      {
        slug: "newtown",
        name: "Newtown",
        description:
          "Old venues, live rooms and engineers who remember everything. The scene's institutional memory.",
      },
    ],
  },
];
