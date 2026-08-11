"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { inviteToCrew, respondToMoment } from "@music-rpg/domain";
import type { CrewArrangement, MomentResponse } from "@music-rpg/shared";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";
import { requireCareer } from "@/lib/career";

/**
 * Crew actions.
 *
 * Adapters only. Whether somebody can be asked, what they say, and what
 * answering them is worth are all the domain's — these carry the answer back to
 * the screen.
 */
function back(message?: string): never {
  revalidatePath("/crew");
  revalidatePath("/home");
  redirect(message ? `/crew?said=${encodeURIComponent(message)}` : "/crew");
}

export async function inviteToCrewAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const result = await inviteToCrew(ctx, {
    careerId: view.career.id,
    userId: user.id,
    subjectId: String(formData.get("subjectId") ?? ""),
    arrangement: String(formData.get("arrangement") ?? "SESSION_RATE") as CrewArrangement,
  });

  if (!result.ok) {
    redirect(`/crew?error=${encodeURIComponent(result.error.message)}`);
  }

  // Their answer is worth showing whichever way it went.
  back(result.value.line);
}

export async function respondToMomentAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();

  const result = await respondToMoment(ctx, {
    careerId: view.career.id,
    userId: user.id,
    momentId: String(formData.get("momentId") ?? ""),
    response: String(formData.get("response") ?? "") as MomentResponse,
  });

  if (!result.ok) {
    redirect(`/crew?error=${encodeURIComponent(result.error.message)}`);
  }

  back();
}
