import { battles, eq, opportunities, type OpportunityRow } from "@music-rpg/database";
import { acceptBattleChallenge, advanceCareerDay, declineOpportunity } from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import type { UserRow } from "@music-rpg/database";
import type { TestContext } from "./context";
import { makePublishedRelease } from "./release";

/**
 * A career that somebody has actually called out.
 *
 * Built entirely through real commands — onboarding, a producer, a session, a
 * master, a release, and then days of the world reacting until a rival decides
 * the career is worth their time. Nothing is inserted behind a domain boundary,
 * because the whole claim of the golden proof is that these are things the game
 * can produce rather than fixtures shaped to look like them.
 *
 * The loop is the honest part. A first challenge does not arrive immediately and
 * should not: rivals have a standing bar, and until a scene knows a career the
 * director correctly prefers paid nights from promoters. So the career simply
 * lives — answering what it is offered — until somebody calls it out.
 */
export const BATTLE_SEED = "m8-golden";

export type ChallengedCareer = {
  careerId: string;
  /** The challenge itself, still unanswered. */
  challenge: OpportunityRow;
  /** How many days the world took to produce it. */
  daysLived: number;
};

async function liveOffers(test: TestContext, careerId: string): Promise<OpportunityRow[]> {
  const rows = await test.handle.db
    .select()
    .from(opportunities)
    .where(eq(opportunities.careerId, careerId));
  return rows.filter((row) => row.status === "AVAILABLE");
}

export async function liveUntilChallenged(
  test: TestContext,
  user: Pick<UserRow, "id">,
  options: { stageName?: string; maxDays?: number } = {},
): Promise<ChallengedCareer> {
  const made = await makePublishedRelease(test, user, "Nightline", {
    stageName: options.stageName ?? "KXMO",
  });
  const careerId = made.careerId;
  const maxDays = options.maxDays ?? 24;

  for (let day = 1; day <= maxDays; day += 1) {
    unwrap(
      await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: BATTLE_SEED }),
    );

    const live = await liveOffers(test, careerId);
    const challenge = live.find((row) => row.type === "BATTLE_CHALLENGE");
    if (challenge) return { careerId, challenge, daysLived: day };

    /*
     * Answer everything else, so the world is not permanently full of nights
     * nobody responded to. Declining is the neutral answer here: this helper is
     * about reaching a challenge, and accepting a showcase would book a night
     * that then blocks one.
     */
    for (const row of live) {
      unwrap(
        await declineOpportunity(test.ctx, {
          careerId,
          userId: user.id,
          opportunityId: row.id,
        }),
      );
    }
  }

  throw new Error(`No rival challenged this career within ${maxDays} days.`);
}

/** Take the challenge and get the battle it became. */
export async function acceptInto(
  test: TestContext,
  user: Pick<UserRow, "id">,
  careerId: string,
  challenge: OpportunityRow,
) {
  const accepted = unwrap(
    await acceptBattleChallenge(test.ctx, {
      careerId,
      userId: user.id,
      opportunityId: challenge.id,
    }),
  );

  const rows = await test.handle.db
    .select()
    .from(battles)
    .where(eq(battles.id, accepted.battle.id));

  return rows[0]!;
}
