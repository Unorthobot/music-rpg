import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  eq,
  artistPsychology,
  artistSkills,
  artistTraits,
  artists,
  careers,
  soundProfiles,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType, listCareerEvents } from "@music-rpg/events";
import {
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createSoloArtist,
  loadDiscoveryQuestions,
  saveDiscoveryAnswer,
  selectCareerType,
  tuneIdentity,
} from "@music-rpg/domain";
import { gameConfig, unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

/**
 * The solo path, end to end, through the domain layer only — the same commands
 * the UI calls, with none of the UI.
 */
const ANSWERS: Record<string, string> = {
  q_aux: "listen",
  q_matters: "beat",
  q_challenged: "devastating",
  q_environment: "bedroom",
  q_statement: "hear what I left out",
};

describe("solo career", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
  });

  afterAll(async () => {
    await test.close();
  });

  it("creates a career with real starting state", async () => {
    const result = unwrap(await createCareer(test.ctx, { userId: user.id }));
    careerId = result.career.id;

    expect(result.created).toBe(true);
    expect(result.career.status).toBe("ONBOARDING");
    expect(result.career.careerAct).toBe("UNDERGROUND");
    expect(result.career.moneyBalance).toBe(gameConfig.career.startingMoneyMinor);
    expect(result.career.fame).toBe(0);
    expect(result.career.respect).toBe(0);
    expect(result.career.heat).toBe(0);
    expect(result.career.legacy).toBe(0);
    expect(result.career.primarySceneId).toBeTruthy();
  });

  it("is idempotent — retries never create a second career", async () => {
    const again = unwrap(await createCareer(test.ctx, { userId: user.id }));
    const third = unwrap(await createCareer(test.ctx, { userId: user.id }));

    expect(again.created).toBe(false);
    expect(again.career.id).toBe(careerId);
    expect(third.career.id).toBe(careerId);

    const rows = await test.handle.db.select().from(careers).where(eq(careers.userId, user.id));
    expect(rows).toHaveLength(1);
  });

  it("persists the career type immediately", async () => {
    const career = unwrap(
      await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "SOLO" }),
    );

    expect(career.careerType).toBe("SOLO");
    expect(career.onboardingState).toBe("IDENTITY");
  });

  it("refuses to complete onboarding without a controlled entity", async () => {
    const result = await completeCareerOnboarding(test.ctx, { careerId, userId: user.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONTROLLED_ENTITY_MISSING");
  });

  it("creates the artist and attaches it to the career", async () => {
    const result = unwrap(
      await createSoloArtist(test.ctx, {
        careerId,
        userId: user.id,
        stageName: "KXMO",
        origin: "Braamfontein",
      }),
    );

    expect(result.created).toBe(true);
    expect(result.artist.stageName).toBe("KXMO");
    expect(result.artist.slug).toBe("kxmo");
    expect(result.artist.artistType).toBe("PLAYER");
    expect(result.career.controlledEntityType).toBe("ARTIST");
    expect(result.career.controlledEntityId).toBe(result.artist.id);
    expect(result.career.onboardingState).toBe("SOUND_DISCOVERY");
  });

  it("renames rather than duplicating when identity is submitted again", async () => {
    const renamed = unwrap(
      await createSoloArtist(test.ctx, { careerId, userId: user.id, stageName: "KXMO." }),
    );

    expect(renamed.created).toBe(false);
    expect(renamed.artist.stageName).toBe("KXMO.");
    // The public slug is stable once assigned.
    expect(renamed.artist.slug).toBe("kxmo");

    const rows = await test.handle.db
      .select()
      .from(artists)
      .where(eq(artists.worldId, renamed.artist.worldId));
    const players = rows.filter((row) => row.artistType === "PLAYER");
    expect(players).toHaveLength(1);
  });

  it("refuses to complete discovery before every question is answered", async () => {
    const result = await completeSoundDiscovery(test.ctx, { careerId, userId: user.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_SOUND_DISCOVERY");
  });

  it("persists each discovery answer as it is given", async () => {
    const questions = await loadDiscoveryQuestions(test.handle.db, "SOLO");

    for (const question of questions) {
      const answer = ANSWERS[question.id];
      if (!answer) continue;
      unwrap(
        await saveDiscoveryAnswer(test.ctx, {
          careerId,
          userId: user.id,
          questionId: question.id,
          value: answer,
        }),
      );
    }

    const progress = unwrap(
      await saveDiscoveryAnswer(test.ctx, {
        careerId,
        userId: user.id,
        questionId: "q_aux",
        value: "listen",
      }),
    );

    expect(progress.session.responses.q_environment).toBe("bedroom");
    expect(progress.complete).toBe(true);
  });

  it("rejects an answer that is not one of the options", async () => {
    const result = await saveDiscoveryAnswer(test.ctx, {
      careerId,
      userId: user.id,
      questionId: "q_aux",
      value: "not_an_option",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_SOUND_DISCOVERY");
  });

  it("derives and persists sound DNA, skills, psychology and traits", async () => {
    const { identity, alreadyCompleted } = unwrap(
      await completeSoundDiscovery(test.ctx, { careerId, userId: user.id }),
    );

    expect(alreadyCompleted).toBe(false);
    expect(identity.archetype).toBeTruthy();

    const careerRow = (
      await test.handle.db.select().from(careers).where(eq(careers.id, careerId)).limit(1)
    )[0]!;
    const artistId = careerRow.controlledEntityId!;

    const [profile] = await test.handle.db
      .select()
      .from(soundProfiles)
      .where(eq(soundProfiles.ownerId, artistId));
    const [skills] = await test.handle.db
      .select()
      .from(artistSkills)
      .where(eq(artistSkills.artistId, artistId));
    const [psychology] = await test.handle.db
      .select()
      .from(artistPsychology)
      .where(eq(artistPsychology.artistId, artistId));
    const traits = await test.handle.db
      .select()
      .from(artistTraits)
      .where(eq(artistTraits.artistId, artistId));

    expect(profile?.summary).toBe(identity.soundSummary);
    expect(profile?.darkBright).toBeCloseTo(identity.sound.darkBright, 5);
    expect(skills?.production).toBe(identity.skills.production);
    expect(psychology?.discipline).toBe(identity.psychology.discipline);
    expect(traits.length).toBe(identity.traits.length);
    expect(traits.length).toBeGreaterThan(0);

    const [artist] = await test.handle.db.select().from(artists).where(eq(artists.id, artistId));
    expect(artist?.archetype).toBe(identity.archetype);
    expect(artist?.creativePhilosophy).toBe("hear what I left out");
    expect(careerRow.onboardingState).toBe("REVEAL");
  });

  it("re-running discovery completion is idempotent", async () => {
    const result = unwrap(await completeSoundDiscovery(test.ctx, { careerId, userId: user.id }));
    expect(result.alreadyCompleted).toBe(true);
  });

  it("lets the player tune visible identity without touching hidden values", async () => {
    const careerRow = (
      await test.handle.db.select().from(careers).where(eq(careers.id, careerId)).limit(1)
    )[0]!;
    const artistId = careerRow.controlledEntityId!;

    const before = (
      await test.handle.db.select().from(artistSkills).where(eq(artistSkills.artistId, artistId))
    )[0]!;

    const tuned = unwrap(
      await tuneIdentity(test.ctx, {
        careerId,
        userId: user.id,
        stageName: "KXMO",
        sound: { darkBright: 0.4 },
      }),
    );

    expect(tuned.sound.darkBright).toBeCloseTo(0.4, 5);
    expect(tuned.name).toBe("KXMO");

    const after = (
      await test.handle.db.select().from(artistSkills).where(eq(artistSkills.artistId, artistId))
    )[0]!;
    expect(after.production).toBe(before.production);
  });

  it("enters the underground with persisted state and the right events", async () => {
    const career = unwrap(await completeCareerOnboarding(test.ctx, { careerId, userId: user.id }));

    expect(career.status).toBe("ACTIVE");
    expect(career.careerAct).toBe("UNDERGROUND");
    expect(career.onboardingState).toBe("COMPLETE");
    expect(career.onboardingCompletedAt).toBeTruthy();
    expect(career.moneyBalance).toBe(gameConfig.career.startingMoneyMinor);

    const events = await listCareerEvents(test.handle.db, careerId);
    const types = events.map((event) => event.eventType);

    expect(types).toContain(GameEventType.CareerCreated);
    expect(types).toContain(GameEventType.CareerTypeSelected);
    expect(types).toContain(GameEventType.SoloArtistCreated);
    expect(types).toContain(GameEventType.ControlledEntityAssigned);
    expect(types).toContain(GameEventType.SoundDiscoveryStarted);
    expect(types).toContain(GameEventType.SoundDiscoveryCompleted);
    expect(types).toContain(GameEventType.ArtistIdentityEstablished);
    expect(types).toContain(GameEventType.ArtistIdentityTuned);
    expect(types).toContain(GameEventType.CareerOnboardingCompleted);
    expect(types).toContain(GameEventType.CareerEnteredUnderground);

    // History is ordered and append-only.
    const sequences = events.map((event) => Number(event.sequence));
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });

  it("does not re-emit entering the underground on retry", async () => {
    unwrap(await completeCareerOnboarding(test.ctx, { careerId, userId: user.id }));

    const events = await listCareerEvents(test.handle.db, careerId);
    const entered = events.filter(
      (event) => event.eventType === GameEventType.CareerEnteredUnderground,
    );

    expect(entered).toHaveLength(1);
  });

  it("fires the analytics funnel separately from the canonical log", async () => {
    const names = test.analytics.names();

    expect(names).toContain("career_creation_started");
    expect(names).toContain("career_type_selected");
    expect(names).toContain("artist_creation_started");
    expect(names).toContain("artist_created");
    expect(names).toContain("sound_discovery_started");
    expect(names).toContain("sound_discovery_answered");
    expect(names).toContain("sound_discovery_completed");
    expect(names).toContain("artist_tuned");
    expect(names).toContain("career_onboarding_completed");
  });

  it("refuses access to another player's career", async () => {
    const stranger = await createTestUser(test, "Stranger");
    const result = await completeCareerOnboarding(test.ctx, { careerId, userId: stranger.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHORIZED_CAREER_ACCESS");
  });
});
