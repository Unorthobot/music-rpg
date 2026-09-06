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

    /* Home offers a way out, and it is the one the player can actually press. */
    expect(home.rightNow.cta).toBe("See who's around");

    /*
     * And it promises nothing the world will not do. A career with nothing
     * released cannot advance its clock, so the copy must not offer a day.
     */
    const words = `${home.rightNow.title} ${home.rightNow.detail} ${home.rightNow.cta}`;
    expect(words).not.toMatch(/day|tomorrow|wait a/i);

    /* Nor may it tell the player that anything went wrong behind the scenes. */
    expect(words).not.toMatch(/error|failed|wrong|retry|again|our side|support/i);
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

  it("recovers through the command behind Home's control, without moving the clock", async () => {
    await removeTheConnector();
    const { careerId, userId } = await onboard("Stranded");
    await restoreTheWorld();

    const stranded = await rowOf(careerId);
    expect((await getCareerHome(T.handle.db, stranded)).rightNow.kind).toBe(
      "AWAITING_FIRST_CONTACT",
    );
    expect(await contactState(careerId)).toEqual({ offers: 0, conversations: 0 });

    /* Nothing is out — the precondition that used to make this unreachable. */
    const before = await rowOf(careerId);

    /*
     * The same command Home's control posts to. It reports success, because
     * something genuinely moved forward, and it does not pretend a day passed.
     */
    const recovered = await advanceCareerDay(T.ctx, { careerId, userId });
    expect(recovered.ok, "the player was handed a failure after recovering").toBe(true);

    const day = unwrap(recovered);
    expect(day.ticks, "a career with nothing out simulated a release").toEqual([]);
    expect(day.progression, "an empty day evaluated progression").toBeNull();
    expect(day.director, "an empty day ran the director").toBeNull();

    /* The clock follows records, and there are none. */
    const after = await rowOf(careerId);
    expect(after.currentGameDate, "the clock moved without a record to move it").toEqual(
      before.currentGameDate,
    );
    expect(day.gameTime).toEqual(before.currentGameDate);

    /* Exactly one first contact, and the state has recovered. */
    expect(await contactState(careerId)).toEqual({ offers: 1, conversations: 1 });
    const home = await getCareerHome(T.handle.db, after);
    expect(home.rightNow.kind).not.toBe("AWAITING_FIRST_CONTACT");
    expect(["FIRST_MESSAGE", "PRODUCER_CHOICE"]).toContain(home.rightNow.kind);
  }, 120_000);

  it("presses the control twice without a second first contact or a moved clock", async () => {
    await removeTheConnector();
    const { careerId, userId } = await onboard("Double Press");
    await restoreTheWorld();

    const before = await rowOf(careerId);
    unwrap(await advanceCareerDay(T.ctx, { careerId, userId }));

    /*
     * A second press. The career is contacted now and still has nothing out, so
     * it is refused exactly as any contacted career would be — the narrow
     * recovery path closed behind it.
     */
    const again = await advanceCareerDay(T.ctx, { careerId, userId });
    expect(again.ok).toBe(false);

    expect(
      await contactState(careerId),
      "a second press created a duplicate first contact",
    ).toEqual({ offers: 1, conversations: 1 });
    expect((await rowOf(careerId)).currentGameDate).toEqual(before.currentGameDate);
  }, 120_000);

  it("renders that CTA on Home as an action rather than a link", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("apps/web/src/app/(app)/home/page.tsx", "utf8");

    /*
     * Asserted against the page rather than only the read model, because the
     * read model can offer a CTA that Home renders as a link to nowhere. This
     * one state has to post to the world command; every other stays a link.
     */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(code).toMatch(/rightNow\.kind === "AWAITING_FIRST_CONTACT"/);
    expect(code).toMatch(/<form action=\{advanceDayAction\}>[\s\S]{0,200}rightNow\.cta/);
    expect(code).toMatch(/<LinkButton href=\{home\.rightNow\.href\}>/);
  });

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
