import { describe, expect, it } from "vitest";
import { SKILL_KEYS, SOUND_DIMENSIONS, gameConfig } from "@music-rpg/shared";
import {
  inferMemberIdentity,
  isMemberChoiceValid,
  memberPersonalities,
  memberRoleProfiles,
  memberTendencies,
} from "@music-rpg/simulation";

/**
 * Authoring a bandmate follows the same rules as authoring yourself:
 * deterministic, bounded, and never a shortcut to a better musician.
 */
const CHOICES = {
  role: "PRODUCER",
  tendencyId: "experimental",
  personalityId: "volatile",
  visualId: "monochrome",
} as const;

describe("inferMemberIdentity", () => {
  it("is deterministic", () => {
    expect(inferMemberIdentity(CHOICES)).toEqual(inferMemberIdentity(CHOICES));
  });

  it("gives different choices different people", () => {
    const producer = inferMemberIdentity(CHOICES);
    const singer = inferMemberIdentity({
      role: "SINGER",
      tendencyId: "polished",
      personalityId: "driven",
      visualId: "vintage",
    });

    expect(singer.skills.melody).toBeGreaterThan(producer.skills.melody);
    expect(producer.skills.production).toBeGreaterThan(singer.skills.production);
    expect(singer.soundSummary).not.toBe(producer.soundSummary);
  });

  it("respects the same starting band as the player's own artist", () => {
    for (const role of memberRoleProfiles) {
      for (const tendency of memberTendencies) {
        for (const personality of memberPersonalities) {
          const member = inferMemberIdentity({
            role: role.role,
            tendencyId: tendency.id,
            personalityId: personality.id,
          });

          for (const key of SKILL_KEYS) {
            expect(member.skills[key]).toBeGreaterThanOrEqual(gameConfig.artist.minStartingSkill);
            expect(member.skills[key]).toBeLessThanOrEqual(gameConfig.artist.maxStartingSkill);
          }
          for (const axis of SOUND_DIMENSIONS) {
            expect(Math.abs(member.sound[axis])).toBeLessThanOrEqual(1);
          }
          for (const value of Object.values(member.psychology)) {
            expect(value).toBeGreaterThanOrEqual(10);
            expect(value).toBeLessThanOrEqual(92);
          }
          expect(member.traits.length).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("derives an archetype and a readable sound line", () => {
    const member = inferMemberIdentity(CHOICES);

    expect(member.archetype).toBeTruthy();
    expect(member.soundSummary.endsWith(".")).toBe(true);
    expect(member.visual?.id).toBe("monochrome");
    expect(member.provenance.authored).toBe(true);
  });

  it("rejects choices that aren't seeded content", () => {
    expect(isMemberChoiceValid(CHOICES)).toBe(true);
    expect(
      isMemberChoiceValid({ ...CHOICES, tendencyId: "made-up" }),
    ).toBe(false);
    expect(
      isMemberChoiceValid({ ...CHOICES, personalityId: "made-up" }),
    ).toBe(false);
  });
});
