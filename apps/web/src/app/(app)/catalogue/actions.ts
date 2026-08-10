"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cancelRelease,
  chooseReleaseFormat,
  keepTrackPrivate,
  planRelease,
  publishRelease,
  scheduleRelease,
  setReleaseStrategy,
} from "@music-rpg/domain";
import type { ReleaseFormat, ReleaseStrategy } from "@music-rpg/shared";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";
import { requireCareer } from "@/lib/career";

/**
 * Release actions.
 *
 * Adapters only. Every decision — what can be released, in what shape, how soon
 * — is the domain's; these just carry the answer back to the screen.
 */
function failTo(trackId: string, message: string): never {
  redirect(`/catalogue/${trackId}?error=${encodeURIComponent(message)}`);
}

function back(trackId: string): never {
  revalidatePath(`/catalogue/${trackId}`);
  revalidatePath("/catalogue");
  revalidatePath("/home");
  redirect(`/catalogue/${trackId}`);
}

export async function keepPrivateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();
  const trackId = String(formData.get("trackId") ?? "");

  const result = await keepTrackPrivate(ctx, { careerId: view.career.id, userId: user.id, trackId });
  if (!result.ok) failTo(trackId, result.error.message);
  back(trackId);
}

export async function planReleaseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();
  const trackId = String(formData.get("trackId") ?? "");

  const result = await planRelease(ctx, {
    careerId: view.career.id,
    userId: user.id,
    trackId,
    format: (formData.get("format") ? String(formData.get("format")) : undefined) as
      | ReleaseFormat
      | undefined,
  });
  if (!result.ok) failTo(trackId, result.error.message);
  back(trackId);
}

export async function setFormatAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();
  const trackId = String(formData.get("trackId") ?? "");

  const result = await chooseReleaseFormat(ctx, {
    careerId: view.career.id,
    userId: user.id,
    releaseId: String(formData.get("releaseId") ?? ""),
    format: String(formData.get("format") ?? "SINGLE") as ReleaseFormat,
  });
  if (!result.ok) failTo(trackId, result.error.message);
  back(trackId);
}

export async function setStrategyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();
  const trackId = String(formData.get("trackId") ?? "");

  const result = await setReleaseStrategy(ctx, {
    careerId: view.career.id,
    userId: user.id,
    releaseId: String(formData.get("releaseId") ?? ""),
    strategy: String(formData.get("strategy") ?? "DROP") as ReleaseStrategy,
    // An Underground career has neither yet; the domain refuses with the reason.
    capabilities: [],
  });
  if (!result.ok) failTo(trackId, result.error.message);
  back(trackId);
}

export async function scheduleReleaseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();
  const trackId = String(formData.get("trackId") ?? "");
  const when = String(formData.get("when") ?? "earliest");

  const scheduledGameTime =
    when === "tomorrow"
      ? new Date(view.career.currentGameDate.getTime() + 24 * 60 * 60 * 1000)
      : when === "date" && formData.get("date")
        ? new Date(String(formData.get("date")))
        : undefined;

  const result = await scheduleRelease(ctx, {
    careerId: view.career.id,
    userId: user.id,
    releaseId: String(formData.get("releaseId") ?? ""),
    scheduledGameTime,
  });
  if (!result.ok) failTo(trackId, result.error.message);
  back(trackId);
}

export async function cancelReleaseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();
  const trackId = String(formData.get("trackId") ?? "");

  const result = await cancelRelease(ctx, {
    careerId: view.career.id,
    userId: user.id,
    releaseId: String(formData.get("releaseId") ?? ""),
    reason: String(formData.get("reason") ?? "") || null,
  });
  if (!result.ok) failTo(trackId, result.error.message);
  back(trackId);
}

export async function publishReleaseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const { view } = await requireCareer();
  const ctx = await createCommandContext();
  const trackId = String(formData.get("trackId") ?? "");

  const result = await publishRelease(ctx, {
    careerId: view.career.id,
    userId: user.id,
    releaseId: String(formData.get("releaseId") ?? ""),
  });
  if (!result.ok) failTo(trackId, result.error.message);
  back(trackId);
}
