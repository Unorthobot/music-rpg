import {
  calendarItems,
  eq,
  opportunities,
  type CalendarItemRow,
  type OpportunityRow,
  type UserRow,
} from "@music-rpg/database";
import { acceptOpportunity, advanceCareerDay, declineOpportunity } from "@music-rpg/domain";
import { unwrap } from "@music-rpg/shared";
import type { TestContext } from "./context";
import { makePublishedRelease } from "./release";

/**
 * A career that has actually agreed to play somewhere.
 *
 * Built entirely through real commands — onboarding, a producer, a session, a
 * master, a release, and then days of the world reacting until a promoter
 * offers a night. Nothing is inserted behind a domain boundary, because the
 * whole claim of the golden proof is that these are things the game can produce
 * rather than fixtures shaped to look like them.
 *
 * The loop is the honest part. A promoter does not book an unknown, and should
 * not: showcases have a standing bar and a momentum bar. So the career simply
 * lives — turning down what it does not want — until somebody offers it a room.
 */
export const PERFORMANCE_SEED = "m8.5-golden";

export type BookedNight = {
  careerId: string;
  /** The offer, now ACCEPTED. */
  offer: OpportunityRow;
  /** The commitment acceptance created. Still SCHEDULED. */
  commitment: CalendarItemRow;
  /** How many days the world took to offer it. */
  daysLived: number;
};

async function liveOffers(test: TestContext, careerId: string): Promise<OpportunityRow[]> {
  const rows = await test.handle.db
    .select()
    .from(opportunities)
    .where(eq(opportunities.careerId, careerId));
  return rows.filter((row) => row.status === "AVAILABLE");
}

/** Every showcase this career has ever been offered, whatever became of it. */
export async function showcases(
  test: TestContext,
  careerId: string,
): Promise<OpportunityRow[]> {
  const rows = await test.handle.db
    .select()
    .from(opportunities)
    .where(eq(opportunities.careerId, careerId));
  return rows.filter((row) => row.type === "SHOWCASE_SLOT");
}

export async function commitmentsOf(
  test: TestContext,
  careerId: string,
): Promise<CalendarItemRow[]> {
  return test.handle.db
    .select()
    .from(calendarItems)
    .where(eq(calendarItems.careerId, careerId));
}

/**
 * Live until a promoter offers a night, then take it.
 *
 * Stops the moment the night is booked. Deliberately does **not** advance past
 * it: "accepted and not yet reached" is the state most of this suite is about,
 * and a helper that resolved the night on the way out would make the assertion
 * that acceptance is not evidence untestable.
 */
export async function liveUntilBooked(
  test: TestContext,
  user: Pick<UserRow, "id">,
  options: {
    stageName?: string;
    maxDays?: number;
    /** Take only this billing, declining the other. Both if unset. */
    billing?: "HEADLINE" | "SUPPORT";
  } = {},
): Promise<BookedNight> {
  const made = await makePublishedRelease(test, user, "Nightline", {
    stageName: options.stageName ?? "KXMO",
  });
  const careerId = made.careerId;
  const maxDays = options.maxDays ?? 30;

  for (let day = 1; day <= maxDays; day += 1) {
    unwrap(
      await advanceCareerDay(test.ctx, { careerId, userId: user.id, seed: PERFORMANCE_SEED }),
    );

    const live = await liveOffers(test, careerId);

    const wanted = live.find((row) => {
      if (row.type !== "SHOWCASE_SLOT") return false;
      if (!options.billing) return true;
      return (row.payload as { billing?: string }).billing === options.billing;
    });

    if (wanted) {
      unwrap(
        await acceptOpportunity(test.ctx, {
          careerId,
          userId: user.id,
          opportunityId: wanted.id,
        }),
      );

      const booked = (await commitmentsOf(test, careerId)).find(
        (item) => item.relatedEntityId === wanted.id && item.type === "PERFORMANCE",
      );
      if (!booked) throw new Error("Accepting a showcase did not create a commitment.");

      const offer = (await showcases(test, careerId)).find((row) => row.id === wanted.id)!;
      return { careerId, offer, commitment: booked, daysLived: day };
    }

    /*
     * Answer everything else, so the world is not permanently full of offers
     * nobody responded to — a promoter who is waiting to hear about Friday does
     * not ring back about Saturday.
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

  throw new Error(`No promoter offered this career a night within ${maxDays} days.`);
}

/**
 * Advance until the booked night is behind the career.
 *
 * Returns how many advances it took. Nothing here opens a screen or calls a
 * resolver: the only thing that happens is time.
 */
export async function advanceUntilPlayed(
  test: TestContext,
  user: Pick<UserRow, "id">,
  night: BookedNight,
  options: { maxDays?: number } = {},
): Promise<number> {
  const maxDays = options.maxDays ?? 30;

  for (let day = 1; day <= maxDays; day += 1) {
    unwrap(
      await advanceCareerDay(test.ctx, {
        careerId: night.careerId,
        userId: user.id,
        seed: PERFORMANCE_SEED,
      }),
    );

    const item = (await commitmentsOf(test, night.careerId)).find(
      (row) => row.id === night.commitment.id,
    );
    if (item?.status === "COMPLETED") return day;
  }

  throw new Error(`The booked night never resolved within ${maxDays} advances.`);
}
