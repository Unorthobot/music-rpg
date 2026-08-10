import { describe, expect, it } from "vitest";
import { SKILL_KEYS, SOUND_DIMENSIONS, gameConfig, questionsForAudience } from "@music-rpg/shared";
import { discoveryQuestions, inferIdentity } from "@music-rpg/simulation";

/**
 * The inference engine is the one piece of M1 the whole product's identity
 * rests on, so these tests pin its guarantees: deterministic, bounded, and
 * actually responsive to what the player chose.
 */
const soloQuestions = questionsForAudience(discoveryQuestions, "SOLO");

const architectAnswers = {
  q_aux: "listen",
  q_matters: "beat",
  q_challenged: "devastating",
  q_environment: "bedroom",
  q_statement: "hear the space between things",
};

const performerAnswers = {
  q_aux: "move",
  q_matters: "hook",
  q_challenged: "laugh",
  q_environment: "rehearsal",
  q_statement: "lose it in the room",
};

describe("inferIdentity", () => {
  it("is deterministic for the same answers", () => {
    const first = inferIdentity({ questions: soloQuestions, responses: architectAnswers });
    const second = inferIdentity({ questions: soloQuestions, responses: architectAnswers });

    expect(second).toEqual(first);
  });

  it("produces different identities for different answers", () => {
    const architect = inferIdentity({ questions: soloQuestions, responses: architectAnswers });
    const performer = inferIdentity({ questions: soloQuestions, responses: performerAnswers });

    expect(architect.archetype).not.toBe(performer.archetype);
    expect(architect.soundSummary).not.toBe(performer.soundSummary);
  });

  it("keeps every sound axis inside [-1, 1]", () => {
    const identity = inferIdentity({ questions: soloQuestions, responses: architectAnswers });

    for (const axis of SOUND_DIMENSIONS) {
      expect(identity.sound[axis]).toBeGreaterThanOrEqual(-1);
      expect(identity.sound[axis]).toBeLessThanOrEqual(1);
    }
  });

  it("keeps starting skills inside the configured starting band", () => {
    const identity = inferIdentity({ questions: soloQuestions, responses: performerAnswers });

    for (const key of SKILL_KEYS) {
      expect(identity.skills[key]).toBeGreaterThanOrEqual(gameConfig.artist.minStartingSkill);
      expect(identity.skills[key]).toBeLessThanOrEqual(gameConfig.artist.maxStartingSkill);
    }
  });

  it("keeps psychology inside a plausible human band", () => {
    const identity = inferIdentity({ questions: soloQuestions, responses: architectAnswers });

    for (const value of Object.values(identity.psychology)) {
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value).toBeLessThanOrEqual(92);
    }
  });

  it("never hands out every trait", () => {
    const identity = inferIdentity({ questions: soloQuestions, responses: architectAnswers });

    expect(identity.traits.length).toBeGreaterThan(0);
    expect(identity.traits.length).toBeLessThanOrEqual(gameConfig.artist.maxStartingTraits);
    expect(new Set(identity.traits.map((trait) => trait.key)).size).toBe(identity.traits.length);
  });

  it("infers a battle-shaped artist from confrontational answers", () => {
    const identity = inferIdentity({
      questions: soloQuestions,
      responses: {
        q_aux: "better",
        q_matters: "bars",
        q_challenged: "immediate",
        q_environment: "basement",
      },
    });

    expect(identity.traits.map((trait) => trait.key)).toContain("BATTLE_BORN");
    // Baseline is 50; confrontational answers should push it well above that.
    expect(identity.psychology.competitiveness).toBeGreaterThanOrEqual(70);
  });

  it("captures the free-text answer verbatim as creative philosophy", () => {
    const identity = inferIdentity({
      questions: soloQuestions,
      responses: { ...architectAnswers, q_statement: "  sit with it for a while  " },
    });

    expect(identity.creativePhilosophy).toBe("sit with it for a while");
  });

  it("ignores answers that no longer match a seeded option", () => {
    const identity = inferIdentity({
      questions: soloQuestions,
      responses: { ...architectAnswers, q_aux: "option_that_was_removed" },
    });

    expect(identity.provenance.answered.q_aux).toBeUndefined();
    expect(identity.archetype).toBeTruthy();
  });

  it("records provenance so a stored profile can be traced back", () => {
    const identity = inferIdentity({ questions: soloQuestions, responses: architectAnswers });

    expect(identity.provenance.version).toBe(identity.version);
    expect(identity.provenance.answered.q_matters).toBe("beat");
  });
});
