import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, slugify, uniqueSlug } from "@music-rpg/shared";
import { computeChemistry, describeSound, describeStat, expandPsychology, expandSound } from "@music-rpg/simulation";
import { DevelopmentModerationService } from "@music-rpg/moderation";

describe("slugify", () => {
  it("normalises stage names into URL-safe slugs", () => {
    expect(slugify("KXMO")).toBe("kxmo");
    expect(slugify("The Long Way")).toBe("the-long-way");
    expect(slugify("  ¡Señor!  ")).toBe("senor");
    expect(slugify("$$$")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("suffixes deterministically when a slug is taken", async () => {
    const taken = new Set(["kxmo", "kxmo-2"]);
    const slug = await uniqueSlug("KXMO", async (candidate) => taken.has(candidate));

    expect(slug).toBe("kxmo-3");
  });

  it("never returns a reserved route word", async () => {
    const slug = await uniqueSlug("settings", async () => false);

    expect(RESERVED_SLUGS.has(slug)).toBe(false);
  });

  it("falls back when a name produces no usable characters", async () => {
    const slug = await uniqueSlug("!!!", async () => false, "unnamed-artist");

    expect(slug).toBe("unnamed-artist");
  });

  it("skips a fallback that would collide with a route word", async () => {
    // "artist" is reserved, so the first acceptable candidate is suffixed.
    expect(await uniqueSlug("!!!", async () => false, "artist")).toBe("artist-2");
  });
});

describe("describeSound", () => {
  it("turns axes into a sentence the player can read", () => {
    const summary = describeSound(
      expandSound({ darkBright: -0.7, minimalDense: -0.5, organicElectronic: 0.6 }),
    );

    expect(summary.startsWith("Dark")).toBe(true);
    expect(summary).toContain("built around");
    expect(summary.endsWith(".")).toBe(true);
  });

  it("says so honestly when nothing is pronounced", () => {
    expect(describeSound(expandSound({}))).toContain("hasn't picked a side");
  });
});

describe("describeStat", () => {
  it("bands a raw value into language", () => {
    expect(describeStat(90)).toBe("Exceptional");
    expect(describeStat(45)).toBe("Developing");
    expect(describeStat(5)).toBe("Raw");
  });
});

describe("computeChemistry", () => {
  it("returns a neutral read for a single member", () => {
    const result = computeChemistry([
      { sound: expandSound({}), psychology: expandPsychology({}) },
    ]);

    expect(result.score).toBe(70);
    expect(result.tensions).toHaveLength(0);
  });

  it("flags ego and solo ambition as tensions", () => {
    const loaded = { ego: 80, ambition: 85 };
    const result = computeChemistry([
      { sound: expandSound({ darkBright: -0.3 }), psychology: expandPsychology(loaded) },
      { sound: expandSound({ darkBright: 0.2 }), psychology: expandPsychology(loaded) },
    ]);

    expect(result.tensions.join(" ")).toMatch(/egos|solo pull/i);
  });
});

describe("DevelopmentModerationService", () => {
  const moderation = new DevelopmentModerationService();

  it("normalises whitespace on accepted names", async () => {
    const verdict = await moderation.check("  THE   LONG WAY ", "GROUP_NAME");

    expect(verdict.allowed).toBe(true);
    expect(verdict.value).toBe("THE LONG WAY");
  });

  it("rejects names that impersonate the platform", async () => {
    const verdict = await moderation.check("official admin", "STAGE_NAME");

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBeTruthy();
  });

  it("rejects names that are too short", async () => {
    expect((await moderation.check("K", "STAGE_NAME")).allowed).toBe(false);
  });
});
