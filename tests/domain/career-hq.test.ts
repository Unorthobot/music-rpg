import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarItems,
  characters,
  creativeSessionParticipants,
  creativeSessions,
  eq,
  npcMessages,
  opportunities,
  transactions,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType, listCareerEvents } from "@music-rpg/events";
import {
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createFirstContact,
  createSoloArtist,
  getCareerHome,
  getNPCConversations,
  getProducerOpportunity,
  loadDiscoveryQuestions,
  saveDiscoveryAnswer,
  selectCareerType,
  selectProducer,
} from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

/**
 * M2 — the first real thing that happens to a career: somebody gets in touch,
 * offers something, and the player spends real money on it.
 */
const ANSWERS: Record<string, string> = {
  q_aux: "listen",
  q_matters: "beat",
  q_challenged: "devastating",
  q_environment: "bedroom",
  q_statement: "hear what I left out",
};

describe("career HQ", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");

    const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
    careerId = career.career.id;
    unwrap(await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "SOLO" }));
    unwrap(await createSoloArtist(test.ctx, { careerId, userId: user.id, stageName: "KXMO" }));

    for (const question of await loadDiscoveryQuestions(test.handle.db, "SOLO")) {
      const answer = ANSWERS[question.id];
      if (answer) {
        unwrap(
          await saveDiscoveryAnswer(test.ctx, {
            careerId,
            userId: user.id,
            questionId: question.id,
            value: answer,
          }),
        );
      }
    }
    unwrap(await completeSoundDiscovery(test.ctx, { careerId, userId: user.id }));
    unwrap(await completeCareerOnboarding(test.ctx, { careerId, userId: user.id }));
  });

  afterAll(async () => {
    await test.close();
  });

  it("refuses to contact a career that hasn't started", async () => {
    const other = await createTestUser(test, "Unstarted");
    const career = unwrap(await createCareer(test.ctx, { userId: other.id }));

    const result = await createFirstContact(test.ctx, {
      careerId: career.career.id,
      userId: other.id,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CAREER_STATE");
  });

  /**
   * First contact happens once, and entering The Underground is what does it.
   *
   * This assertion used to read `first.created === true` on the first call from a
   * test, because Home triggered first contact on render and a test standing in
   * for Home was therefore the creator. M7 moved the trigger into
   * `completeCareerOnboarding`: a screen may reveal a world fact and must never
   * author one, and entering is a decision the player actually made.
   *
   * So by the time anything calls this command, the introduction already exists —
   * and what is worth asserting is what was always the real guarantee. Exactly one
   * opportunity, one conversation, two messages, no matter how many callers ask.
   */
  it("creates first contact exactly once, through entering The Underground", async () => {
    const first = unwrap(await createFirstContact(test.ctx, { careerId, userId: user.id }));
    const second = unwrap(await createFirstContact(test.ctx, { careerId, userId: user.id }));
    const third = unwrap(await createFirstContact(test.ctx, { careerId, userId: user.id }));

    // Nobody here created anything: onboarding did, and these are replays.
    expect(first.created).toBe(false);
    expect(second.created).toBe(false);
    expect(third.opportunity.id).toBe(first.opportunity.id);

    const conversations = await getNPCConversations(test.handle.db, careerId);
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.character.slug).toBe("thabo");
    expect(conversations[0]!.unread).toBe(2);

    const opportunityRows = await test.handle.db
      .select()
      .from(opportunities)
      .where(eq(opportunities.careerId, careerId));
    expect(opportunityRows).toHaveLength(1);
    expect(opportunityRows[0]!.status).toBe("AVAILABLE");
    // Authored, and recorded as such: hand-written content on a condition.
    expect(opportunityRows[0]!.origin).toBe("AUTHORED");
    // Identity per opportunity, which is what replaced the (career, type) index.
    expect(opportunityRows[0]!.idempotencyKey).toBeTruthy();
  });

  it("links the message to the opportunity it is about", async () => {
    const conversations = await getNPCConversations(test.handle.db, careerId);
    const messages = await test.handle.db
      .select()
      .from(npcMessages)
      .where(eq(npcMessages.conversationId, conversations[0]!.conversation.id));

    const offer = messages.find(
      (message) => (message.payload as { opportunityId?: string }).opportunityId,
    );
    expect(offer).toBeTruthy();
  });

  it("surfaces the message as the one thing to do right now", async () => {
    const home = await getCareerHome(test.handle.db, (await currentCareer(test, careerId))!);

    expect(home.rightNow.kind).toBe("FIRST_MESSAGE");
    expect(home.unreadMessages).toBeGreaterThan(0);
    expect(home.pulse.spentMinor).toBe(0);
  });

  it("shows producers with what a player could actually know", async () => {
    const view = await getProducerOpportunity(test.handle.db, (await currentCareer(test, careerId))!);

    expect(view?.options).toHaveLength(3);
    for (const option of view!.options) {
      expect(option.soundLine).toBeTruthy();
      expect(option.strength).toBeTruthy();
      expect(option.tradeOff).toBeTruthy();
      expect(option.costMinor).toBeGreaterThan(0);
    }
    // R5,000 balance affords every first session on offer.
    expect(view!.options.every((option) => option.affordable)).toBe(true);
  });

  it("refuses a producer the career cannot afford", async () => {
    const [lex] = await test.handle.db
      .select()
      .from(characters)
      .where(eq(characters.slug, "lex"));

    const broke = await createTestUser(test, "Broke");
    const brokeCareer = unwrap(await createCareer(test.ctx, { userId: broke.id }));
    await test.handle.db
      .update((await import("@music-rpg/database")).careers)
      .set({ moneyBalance: 100, status: "ACTIVE" })
      .where(eq((await import("@music-rpg/database")).careers.id, brokeCareer.career.id));

    const result = await selectProducer(test.ctx, {
      careerId: brokeCareer.career.id,
      userId: broke.id,
      producerId: lex!.id,
    });

    expect(result.ok).toBe(false);

    const charges = await test.handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.careerId, brokeCareer.career.id));
    expect(charges).toHaveLength(0);
  });

  it("charges once, schedules the session and seats everyone, atomically", async () => {
    const [lex] = await test.handle.db
      .select()
      .from(characters)
      .where(eq(characters.slug, "lex"));

    const result = unwrap(
      await selectProducer(test.ctx, { careerId, userId: user.id, producerId: lex!.id }),
    );

    expect(result.created).toBe(true);
    expect(result.costMinor).toBe(150_000);
    expect(result.session.status).toBe("SCHEDULED");
    expect(result.session.transactionId).toBe(result.transactionId);

    const career = (await currentCareer(test, careerId))!;
    expect(career.moneyBalance).toBe(500_000 - 150_000);

    const ledger = await test.handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.careerId, careerId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.direction).toBe("DEBIT");
    expect(ledger[0]!.balanceAfterMinor).toBe(350_000);

    const participants = await test.handle.db
      .select()
      .from(creativeSessionParticipants)
      .where(eq(creativeSessionParticipants.sessionId, result.session.id));
    const roles = participants.map((participant) => participant.role).sort();
    expect(roles).toEqual(["PRIMARY_ARTIST", "PRODUCER"]);

    const items = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.careerId, careerId));
    expect(items).toHaveLength(1);
    expect(items[0]!.type).toBe("STUDIO");
    expect(items[0]!.relatedEntityId).toBe(result.session.id);
  });

  it("never charges twice for the same producer", async () => {
    const [lex] = await test.handle.db
      .select()
      .from(characters)
      .where(eq(characters.slug, "lex"));

    const again = unwrap(
      await selectProducer(test.ctx, { careerId, userId: user.id, producerId: lex!.id }),
    );

    expect(again.created).toBe(false);

    const ledger = await test.handle.db
      .select()
      .from(transactions)
      .where(eq(transactions.careerId, careerId));
    expect(ledger).toHaveLength(1);

    const sessions = await test.handle.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.careerId, careerId));
    expect(sessions).toHaveLength(1);

    const career = (await currentCareer(test, careerId))!;
    expect(career.moneyBalance).toBe(350_000);
  });

  it("records the causal chain in canonical events", async () => {
    const events = await listCareerEvents(test.handle.db, careerId);
    const types = events.map((event) => event.eventType);

    expect(types).toContain(GameEventType.CharacterFirstContactCreated);
    expect(types).toContain(GameEventType.NpcMessageSent);
    expect(types).toContain(GameEventType.OpportunityCreated);
    expect(types).toContain(GameEventType.OpportunityAccepted);
    expect(types).toContain(GameEventType.TransactionRecorded);
    expect(types).toContain(GameEventType.ProducerSelected);
    expect(types).toContain(GameEventType.CreativeSessionCreated);
    expect(types).toContain(GameEventType.CalendarItemCreated);

    // Each of these happened once, even though the commands were replayed.
    for (const type of [
      GameEventType.ProducerSelected,
      GameEventType.CreativeSessionCreated,
      GameEventType.TransactionRecorded,
    ]) {
      expect(types.filter((candidate) => candidate === type)).toHaveLength(1);
    }
  });

  it("moves Home on to the session once a producer is chosen", async () => {
    const home = await getCareerHome(test.handle.db, (await currentCareer(test, careerId))!);

    expect(home.rightNow.kind).toBe("SESSION_READY");
    expect(home.pulse.spentMinor).toBe(150_000);
    expect(home.pulse.sessionsBooked).toBe(1);
    expect(home.nextCalendarItem?.type).toBe("STUDIO");
    expect(home.story.some((card) => card.title === "Producer chosen")).toBe(true);
  });
});

async function currentCareer(test: TestContext, careerId: string) {
  const { careers } = await import("@music-rpg/database");
  const rows = await test.handle.db.select().from(careers).where(eq(careers.id, careerId)).limit(1);
  return rows[0];
}
