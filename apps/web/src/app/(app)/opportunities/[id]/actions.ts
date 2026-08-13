"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  acceptBattleChallenge,
  acceptOpportunity,
  communicateOpportunities,
  declineBattleChallenge,
  declineOpportunity,
  getOffer,
} from "@music-rpg/domain";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";
import { requireCareer } from "@/lib/career";

/**
 * Answering an offer.
 *
 * Adapters. Whether an offer can still be taken, what taking it books, what it
 * makes impossible and what that costs are all the domain's; these carry the
 * answer back to a screen.
 *
 * **Writes belong here, not to a render.** Accepting is a player's decision and
 * a decision is allowed to change the world — which is exactly why the offer
 * detail page itself does nothing but read. The communication step runs after the
 * decision for the same reason it runs on a day advance: somebody has to be told,
 * and being told is a write.
 */

function refresh(): void {
  revalidatePath("/home");
  revalidatePath("/messages");
  revalidatePath("/calendar");
  revalidatePath("/career");
  revalidatePath("/studio");
}

/**
 * What kind of thing is being answered.
 *
 * A challenge and a booking arrive on the same screen, because "somebody wants
 * something from you" is one question — but they are answered by different
 * commands, because agreeing to a battle creates an event with its own lifetime
 * and refusing one is a thing that happens between two people. The domain
 * refuses a challenge sent to the generic commands rather than trusting this
 * dispatch, so a future surface cannot reintroduce the mistake.
 */
async function offerTypeOf(careerId: string, opportunityId: string): Promise<string | null> {
  const { view } = await requireCareer();
  const db = await getAppDb();
  const offer = await getOffer(db, view.career, opportunityId);
  return offer?.type ?? null;
}

export async function acceptOfferAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const opportunityId = String(formData.get("opportunityId") ?? "");

  /*
   * Agreeing to a battle books the night and opens the confrontation's own
   * screen, because from here it stops being an offer and becomes a sequence of
   * decisions with a date at the end of it.
   */
  if ((await offerTypeOf(view.career.id, opportunityId)) === "BATTLE_CHALLENGE") {
    const agreed = await acceptBattleChallenge(ctx, {
      careerId: view.career.id,
      userId: user.id,
      opportunityId,
    });

    if (!agreed.ok) {
      redirect(`/opportunities/${opportunityId}?error=${encodeURIComponent(agreed.error.message)}`);
    }

    await communicateOpportunities(ctx, { careerId: view.career.id, userId: user.id });
    refresh();
    redirect(`/battles/${agreed.value.battle.id}`);
  }

  const result = await acceptOpportunity(ctx, {
    careerId: view.career.id,
    userId: user.id,
    opportunityId,
  });

  if (!result.ok) {
    redirect(`/opportunities/${opportunityId}?error=${encodeURIComponent(result.error.message)}`);
  }

  /*
   * The people involved hear about it: the promoter whose night was taken, and
   * anybody whose night just became impossible. Failing here must not undo the
   * booking — the night is real whether or not the message landed — so the
   * result is deliberately not checked, and the next day advance retries it.
   */
  await communicateOpportunities(ctx, { careerId: view.career.id, userId: user.id });

  refresh();

  /*
   * An accepted invitation lands the player in the room it just booked. A night
   * has no room to walk into, so it returns to the offer, which now shows what
   * it became and points at the calendar.
   */
  if (result.value.sessionId) redirect("/studio");
  redirect(`/opportunities/${opportunityId}`);
}

export async function declineOfferAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const opportunityId = String(formData.get("opportunityId") ?? "");

  /*
   * Turning a challenge down. No confirmation, no warning and no consequence
   * preview, because there is no consequence to preview: `CHALLENGE_DECLINED`
   * moves familiarity and tension and cannot move respect in either direction.
   * It goes through its own command so the rival actually learns of it — the one
   * way a refusal can be got wrong is by making it silent.
   */
  if ((await offerTypeOf(view.career.id, opportunityId)) === "BATTLE_CHALLENGE") {
    const refused = await declineBattleChallenge(ctx, {
      careerId: view.career.id,
      userId: user.id,
      opportunityId,
    });

    if (!refused.ok) {
      redirect(`/opportunities/${opportunityId}?error=${encodeURIComponent(refused.error.message)}`);
    }

    await communicateOpportunities(ctx, { careerId: view.career.id, userId: user.id });
    refresh();
    redirect(`/opportunities/${opportunityId}`);
  }

  const result = await declineOpportunity(ctx, {
    careerId: view.career.id,
    userId: user.id,
    opportunityId,
  });

  if (!result.ok) {
    redirect(`/opportunities/${opportunityId}?error=${encodeURIComponent(result.error.message)}`);
  }

  await communicateOpportunities(ctx, { careerId: view.career.id, userId: user.id });

  refresh();
  redirect(`/opportunities/${opportunityId}`);
}
