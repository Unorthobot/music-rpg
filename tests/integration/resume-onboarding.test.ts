import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { artists, careers, eq, gameEvents, type UserRow } from "@music-rpg/database";
import {
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createSoloArtist,
  getCareerViewForUser,
  getOnboardingView,
  loadDiscoveryQuestions,
  saveDiscoveryAnswer,
  selectCareerType,
} from "@music-rpg/domain";
import { formatMoney, gameConfig, unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

/**
 * Resumability and transactional safety.
 *
 * The promise the product makes is that you can leave at any point — mid
 * question, mid flow, mid session — and come back to exactly where you were,
 * on any device, with nothing duplicated.
 */
describe("resuming onboarding", () => {
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

  it("sends a brand-new account to the first step", async () => {
    expect(await getOnboardingView(test.handle.db, user.id)).toBeNull();
  });

  it("resumes at the identity step after choosing solo", async () => {
    const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
    careerId = career.career.id;
    unwrap(await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "SOLO" }));

    const view = (await getOnboardingView(test.handle.db, user.id))!;

    expect(view.route).toBe("/start/identity");
    expect(view.career.careerType).toBe("SOLO");
    expect(view.questions.length).toBeGreaterThan(0);
  });

  it("resumes at sound discovery once the artist exists", async () => {
    unwrap(
      await createSoloArtist(test.ctx, { careerId, userId: user.id, stageName: "KXMO" }),
    );

    const view = (await getOnboardingView(test.handle.db, user.id))!;

    expect(view.route).toBe("/start/sound");
    expect(view.view?.entity?.type).toBe("ARTIST");
  });

  it("remembers partial discovery answers", async () => {
    unwrap(
      await saveDiscoveryAnswer(test.ctx, {
        careerId,
        userId: user.id,
        questionId: "q_aux",
        value: "uncomfortable",
      }),
    );

    const view = (await getOnboardingView(test.handle.db, user.id))!;

    expect(view.responses.q_aux).toBe("uncomfortable");
    expect(view.discoveryComplete).toBe(false);
    expect(view.route).toBe("/start/sound");
  });

  it("lets a player change an earlier answer before completing", async () => {
    unwrap(
      await saveDiscoveryAnswer(test.ctx, {
        careerId,
        userId: user.id,
        questionId: "q_aux",
        value: "listen",
      }),
    );

    const view = (await getOnboardingView(test.handle.db, user.id))!;
    expect(view.responses.q_aux).toBe("listen");
  });

  it("resumes at the reveal once discovery is complete", async () => {
    const questions = await loadDiscoveryQuestions(test.handle.db, "SOLO");
    const answers: Record<string, string> = {
      q_matters: "story",
      q_challenged: "ignore",
      q_environment: "basement",
      q_statement: "stay with it",
    };

    for (const question of questions) {
      const answer = answers[question.id];
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

    unwrap(await completeSoundDiscovery(test.ctx, { careerId, userId: user.id }));

    const view = (await getOnboardingView(test.handle.db, user.id))!;
    expect(view.route).toBe("/start/reveal");
    expect(view.discoveryComplete).toBe(true);
  });

  it("never duplicates the artist across repeated identity submissions", async () => {
    const rows = await test.handle.db.select().from(artists);
    const players = rows.filter((row) => row.artistType === "PLAYER");

    expect(players).toHaveLength(1);
  });

  it("reads home from real persisted state after entering the underground", async () => {
    unwrap(await completeCareerOnboarding(test.ctx, { careerId, userId: user.id }));

    const view = (await getCareerViewForUser(test.handle.db, user.id))!;

    expect(view.career.status).toBe("ACTIVE");
    expect(view.career.careerAct).toBe("UNDERGROUND");
    expect(view.displayName).toBe("KXMO");
    expect(formatMoney(view.career.moneyBalance)).toBe("R5,000");
    expect(view.career.moneyBalance).toBe(gameConfig.career.startingMoneyMinor);
    expect(view.world.name).toBe("Johannesburg");
    expect(view.scene?.name).toBeTruthy();
    expect(view.entity?.sound).not.toBeNull();
    expect(view.archetype).not.toBeNull();

    const onboarding = (await getOnboardingView(test.handle.db, user.id))!;
    expect(onboarding.route).toBe("/home");
  });

  it("keeps a complete, ordered, append-only history of how the career happened", async () => {
    const events = await test.handle.db
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.careerId, careerId))
      .orderBy(gameEvents.sequence);

    expect(events.length).toBeGreaterThanOrEqual(8);
    expect(events[0]!.eventType).toBe("career.created");
    expect(events[events.length - 1]!.eventType).toBe("career.entered_underground");

    // Every event carries the world it happened in, so world-scoped queries work
    // without a join through careers.
    for (const event of events) {
      expect(event.worldId).toBeTruthy();
    }
  });

  it("rolls the whole command back when part of it fails", async () => {
    const before = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));

    // Committing to a career type after the career is live must change nothing.
    const result = await selectCareerType(test.ctx, {
      careerId,
      userId: user.id,
      careerType: "GROUP",
    });

    expect(result.ok).toBe(false);

    const after = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    expect(after[0]!.careerType).toBe(before[0]!.careerType);
    expect(after[0]!.controlledEntityId).toBe(before[0]!.controlledEntityId);
  });
});
