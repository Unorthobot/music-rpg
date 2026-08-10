"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addGroupMember,
  completeCareerOnboarding,
  completeGroupLineup,
  completeSoundDiscovery,
  createCareer,
  createGroup,
  createSoloArtist,
  removeGroupMember,
  saveDiscoveryAnswer,
  selectCareerType,
  tuneIdentity,
} from "@music-rpg/domain";
import type { CareerType, GroupRole } from "@music-rpg/shared";
import type { TunableSoundAxis } from "@music-rpg/simulation";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";

/**
 * Onboarding actions.
 *
 * Every one of these is a thin adapter: read the form, call the domain command,
 * map the typed error onto a query parameter. No screen reaches the database or
 * mutates a table directly, and no business rule lives here.
 */
function failTo(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function startCareerAction(): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const result = await createCareer(ctx, { userId: user.id });
  if (!result.ok) failTo("/start", result.error.message);

  revalidatePath("/start");
}

export async function selectCareerTypeAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerType = String(formData.get("careerType") ?? "") as CareerType;

  const created = await createCareer(ctx, { userId: user.id });
  if (!created.ok) failTo("/start", created.error.message);

  const result = await selectCareerType(ctx, {
    careerId: created.value.career.id,
    userId: user.id,
    careerType,
  });
  if (!result.ok) failTo("/start", result.error.message);

  redirect("/start/identity");
}

export async function saveIdentityAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");
  const careerType = String(formData.get("careerType") ?? "") as CareerType;

  if (careerType === "SOLO") {
    const result = await createSoloArtist(ctx, {
      careerId,
      userId: user.id,
      stageName: String(formData.get("stageName") ?? ""),
      origin: String(formData.get("origin") ?? "") || null,
      biography: String(formData.get("biography") ?? "") || null,
    });
    if (!result.ok) failTo("/start/identity", result.error.message);
  } else {
    const result = await createGroup(ctx, {
      careerId,
      userId: user.id,
      name: String(formData.get("stageName") ?? ""),
      creativeDirection: String(formData.get("creativeDirection") ?? "") || null,
      biography: String(formData.get("biography") ?? "") || null,
    });
    if (!result.ok) failTo("/start/identity", result.error.message);
  }

  redirect("/start/sound");
}

export async function answerDiscoveryAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");
  const questionId = String(formData.get("questionId") ?? "");
  const value = String(formData.get("value") ?? "");

  const result = await saveDiscoveryAnswer(ctx, { careerId, userId: user.id, questionId, value });
  if (!result.ok) failTo("/start/sound", result.error.message);

  revalidatePath("/start/sound");
}

export async function completeDiscoveryAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");

  const result = await completeSoundDiscovery(ctx, { careerId, userId: user.id });
  if (!result.ok) failTo("/start/sound", result.error.message);

  redirect("/start/reveal");
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");
  const artistId = String(formData.get("artistId") ?? "");
  const role = (formData.get("role") ? String(formData.get("role")) : undefined) as
    | GroupRole
    | undefined;

  const result = await addGroupMember(ctx, { careerId, userId: user.id, artistId, role });
  if (!result.ok) failTo("/start/members", result.error.message);

  revalidatePath("/start/members");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");
  const artistId = String(formData.get("artistId") ?? "");

  const result = await removeGroupMember(ctx, { careerId, userId: user.id, artistId });
  if (!result.ok) failTo("/start/members", result.error.message);

  revalidatePath("/start/members");
}

export async function confirmLineupAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");

  const result = await completeGroupLineup(ctx, { careerId, userId: user.id });
  if (!result.ok) failTo("/start/members", result.error.message);

  redirect("/start/reveal");
}

export async function tuneIdentityAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");

  const sound: Partial<Record<TunableSoundAxis, number>> = {};
  for (const axis of ["darkBright", "rawPolished", "minimalDense", "intimateAnthemic"] as const) {
    const raw = formData.get(`sound.${axis}`);
    if (raw !== null && raw !== "") sound[axis] = Number(raw);
  }

  const result = await tuneIdentity(ctx, {
    careerId,
    userId: user.id,
    ...(formData.get("stageName") ? { stageName: String(formData.get("stageName")) } : {}),
    ...(formData.has("origin") ? { origin: String(formData.get("origin") ?? "") || null } : {}),
    ...(formData.has("creativePhilosophy")
      ? { creativePhilosophy: String(formData.get("creativePhilosophy") ?? "") || null }
      : {}),
    sound,
  });

  if (!result.ok) failTo("/start/reveal", result.error.message);

  redirect("/start/reveal");
}

export async function enterUndergroundAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const careerId = String(formData.get("careerId") ?? "");

  const result = await completeCareerOnboarding(ctx, { careerId, userId: user.id });
  if (!result.ok) failTo("/start/reveal", result.error.message);

  redirect("/home");
}
