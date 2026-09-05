import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  careers,
  characters,
  eq,
  npcConversations,
  opportunities,
  seedDatabase,
  type CareerRow,
} from "@music-rpg/database";
import {
  advanceCareerDay,
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createFirstContact,
  createSoloArtist,
  getCareerHome,
  loadDiscoveryQuestions,
  saveDiscoveryAnswer,
  selectCareerType,
} from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

/**
 * A career must never be created that cannot be started.
 *
 * The M0–M9 playability audit lost two careers to this. `completeOnboarding`
 * calls `createFirstContact` and used to discard the result, so a world that
 * could not supply a connector produced an ACTIVE career with no message, no
 * producers, no session, no track, no release — and therefore no day advance
 * either, because that control is gated on having something out. Nothing was
 * logged. Home said *"Nothing's waiting on you. Go and make something happen."*
 *
 * The important structural fact, and the reason the repair is small: **a failed
 * attempt consumes nothing.** `createFirstContact` returns before it writes, so
 * the operation was always still available. What was missing was anybody
 * knowing it had failed, and anything ever calling it again.
 */

let T: TestContext;
beforeAll(async () => {
  T = await createTestContext();
}, 120_000);
afterAll(async () => {
  await T?.close();
});

/** Onboarding, exactly as the app performs it — including its first contact. */
async function onboard(displayName: string): Promise<{ careerId: string; userId: string }> {
  const user = await createTestUser(T, displayName);
  const created = unwrap(await createCareer(T.ctx, { userId: user.id }));
  const careerId = created.career.id;

  unwrap(await selectCareerType(T.ctx, { careerId, userId: user.id, careerType: "SOLO" }));
  unwrap(
    await createSoloArtist(T.ctx, { careerId, userId: user.id, stageName: "STUCK" }),
  );

  for (const question of await loadDiscoveryQuestions(T.handle.db, "SOLO")) {
    /* Choice questions take an option id; the closing question is free text. */
    const value =
      question.kind === "CHOICE" ? question.options[0]!.id : "hear what I left out";
    unwrap(
      await saveDiscoveryAnswer(T.ctx, {
        careerId,
        userId: user.id,
        questionId: question.id,
        value,
      }),
    );
  }

  unwrap(await completeSoundDiscovery(T.ctx, { careerId, userId: user.id }));
  unwrap(await completeCareerOnboarding(T.ctx, { careerId, userId: user.id }));

  return { careerId, userId: user.id };
}

const rowOf = async (careerId: string): Promise<CareerRow> =>
  (await T.handle.db.select().from(careers).where(eq(careers.id, careerId)))[0]!;

const contactState = async (careerId: string) => ({
  offers: (
    await T.handle.db.select().from(opportunities).where(eq(opportunities.careerId, careerId))
  ).length,
  conversations: (
    await T.handle.db
      .select()
      .from(npcConversations)
      .where(eq(npcConversations.careerId, careerId))
  ).length,
});

/**
 * The injected fault: a world with nobody to make the introduction.
 *
 * `thabo` is the connector `createFirstContact` looks for by slug. Removing him
 * reproduces the audit's world — which had no characters at all, because the
 * seed had been written to a different physical database — without having to
 * break the schema to do it.
 */
async function removeTheConnector(): Promise<void> {
  await T.handle.db.delete(characters).where(eq(characters.slug, "thabo"));
}

/** Seeding is idempotent, so re-running it is how a broken world is repaired. */
async function restoreTheWorld(): Promise<void> {
  await seedDatabase(T.handle.db);
}

describe("first contact · failure never consumes the ability to retry", () => {
  it("starts the career, writes nothing, and says so honestly", async () => {
    await removeTheConnector();
    const { careerId } = await onboard("No Connector");
    await restoreTheWorld();

    /* The career still started — a broken world must not undo somebody's entry. */
    const career = await rowOf(careerId);
    expect(career.status).toBe("ACTIVE");

    /* And nothing was consumed by the attempt. */
    expect(await contactState(careerId)).toEqual({ offers: 0, conversations: 0 });

    /*
     * Home tells the truth. Before the repair this state rendered as "Nothing's
     * waiting on you / Go and make something happen", pointing at a studio that
     * would point at an empty inbox.
     */
    const home = await getCareerHome(T.handle.db, career);
    expect(home.rightNow.kind).toBe("AWAITING_FIRST_CONTACT");
    expect(home.rightNow.title.toLowerCase()).not.toContain("nothing's waiting");
  }, 120_000);

  it("succeeds on retry, exactly once, with no duplicate consequences", async () => {
    await removeTheConnector();
    const { careerId, userId } = await onboard("Retries");
    await restoreTheWorld();

    expect(await contactState(careerId)).toEqual({ offers: 0, conversations: 0 });

    /* Retry → success. */
    const first = unwrap(await createFirstContact(T.ctx, { careerId, userId }));
    expect(first.created).toBe(true);
    expect(await contactState(careerId)).toEqual({ offers: 1, conversations: 1 });

    /* Retried again → the same first contact, not a second one. */
    const again = unwrap(await createFirstContact(T.ctx, { careerId, userId }));
    expect(again.created).toBe(false);
    expect(again.opportunity.id).toBe(first.opportunity.id);
    expect(await contactState(careerId)).toEqual({ offers: 1, conversations: 1 });

    /* And Home now has something to say. */
    const home = await getCareerHome(T.handle.db, await rowOf(careerId));
    expect(home.rightNow.kind).not.toBe("AWAITING_FIRST_CONTACT");
  }, 120_000);

  it("is retried by the world's own tick, above the release guard", async () => {
    await removeTheConnector();
    const { careerId, userId } = await onboard("Day Advance");
    await restoreTheWorld();

    expect(await contactState(careerId)).toEqual({ offers: 0, conversations: 0 });

    /*
     * `advanceCareerDay` refuses a career with nothing released — which is
     * exactly the career this failure produces, so the retry is placed above
     * that guard. The command still reports the refusal; the scene still
     * catches up.
     */
    const advanced = await advanceCareerDay(T.ctx, { careerId, userId });
    expect(advanced.ok, "a career with nothing out should still be refused a day").toBe(false);

    expect(
      await contactState(careerId),
      "the day advance did not retry first contact",
    ).toEqual({ offers: 1, conversations: 1 });
  }, 120_000);

  it("leaves a normally-contacted career exactly-once when days pass", async () => {
    const { careerId, userId } = await onboard("Healthy");

    /* Onboarding contacted this one on the first attempt. */
    expect(await contactState(careerId)).toEqual({ offers: 1, conversations: 1 });

    await advanceCareerDay(T.ctx, { careerId, userId });
    await advanceCareerDay(T.ctx, { careerId, userId });

    expect(
      await contactState(careerId),
      "the retry created a second first contact",
    ).toEqual({ offers: 1, conversations: 1 });
  }, 120_000);
});
