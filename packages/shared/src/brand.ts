/**
 * Central brand configuration.
 *
 * The public product name is deliberately NOT hardcoded across components.
 * Every user-facing reference to the product must read from this object so the
 * codename can be swapped for a real brand without touching feature code.
 */
export const brand = {
  productName: "Music RPG",
  shortName: "Music RPG",
  tagline: "Build your sound. Build your career. Leave a legacy.",
  /** Used for <title> suffixes, share cards, and the world-control header. */
  descriptor: "A persistent music-career simulation",
  /** Internal codename used in logs and job names. */
  codename: "music-rpg",
} as const;

export type Brand = typeof brand;
