"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { advanceCareerDay } from "@music-rpg/domain";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";
import { requireCareer } from "@/lib/career";

/**
 * Letting a day pass.
 *
 * The only way reception moves. A record's life is not resolved when it is
 * published — it accumulates, one in-world day at a time, and this is the
 * player's hand on that clock.
 *
 * Safe to double-submit: the tick is idempotent per release and day, so two
 * presses of the same button advance the world once.
 */
export async function advanceDayAction(): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const result = await advanceCareerDay(ctx, { careerId: view.career.id, userId: user.id });

  if (!result.ok) {
    redirect(`/home?error=${encodeURIComponent(result.error.message)}`);
  }

  revalidatePath("/home");
  revalidatePath("/career");
  revalidatePath("/world");
  revalidatePath("/catalogue");
  redirect("/home");
}
