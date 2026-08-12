"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptOpportunity, communicateOpportunities, declineOpportunity } from "@music-rpg/domain";
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

export async function acceptOfferAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const opportunityId = String(formData.get("opportunityId") ?? "");

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
