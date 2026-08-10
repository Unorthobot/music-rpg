"use server";

import { redirect } from "next/navigation";
import { selectProducer } from "@music-rpg/domain";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";
import { requireCareer } from "@/lib/career";

/**
 * Booking the session.
 *
 * The command charges, schedules and seats everyone in one transaction, so this
 * adapter only has to route the outcome: on failure the player is told plainly
 * that they have not been charged, because they haven't.
 */
export async function selectProducerAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const result = await selectProducer(ctx, {
    careerId: view.career.id,
    userId: user.id,
    producerId: String(formData.get("producerId") ?? ""),
  });

  if (!result.ok) {
    redirect(`/opportunities/producers?error=${encodeURIComponent(result.error.message)}`);
  }

  redirect("/studio");
}
