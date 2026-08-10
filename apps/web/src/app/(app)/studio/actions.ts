"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  advanceGenerationJob,
  combineProducerProposals,
  interpretCreativeDirection,
  rejectProducerProposals,
  renameTrack,
  requestMaster,
  requestRevision,
  saveTrackToCatalogue,
  selectProducerProposal,
  setCreativeDirection,
  startCreativeSession,
} from "@music-rpg/domain";
import type { AudienceId, CreativeDirection, IntentionId, MoodId, RevisionKindId } from "@music-rpg/shared";
import { createCommandContext } from "@/lib/command-context";
import { requireUser } from "@/lib/session";

/**
 * Studio actions.
 *
 * Thin adapters over the commands. Every failure message is safe to show as-is,
 * and none of them destroy work: a failed render leaves the session and its
 * versions exactly where they were.
 */
function failTo(sessionId: string, message: string): never {
  redirect(`/studio/session/${sessionId}?error=${encodeURIComponent(message)}`);
}

/**
 * Back to the room, with a fresh view.
 *
 * Without the revalidate, Next's router cache can serve the previous render —
 * so a player who rejects a set of ideas sees the old three, clicks one, and is
 * told it isn't on the table. The session's state is the authority, so the
 * cache has to be dropped every time that state moves.
 */
function backToSession(sessionId: string): never {
  revalidatePath(`/studio/session/${sessionId}`);
  revalidatePath("/studio");
  redirect(`/studio/session/${sessionId}`);
}

export async function startSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");

  const result = await startCreativeSession(ctx, { sessionId, userId: user.id });
  if (!result.ok) failTo(sessionId, result.error.message);

  backToSession(sessionId);
}

export async function submitDirectionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");

  const direction: CreativeDirection = {
    intention: String(formData.get("intention") ?? "introduce") as IntentionId,
    moods: formData.getAll("moods").map((mood) => String(mood) as MoodId),
    energy: Number(formData.get("energy") ?? 50),
    risk: Number(formData.get("risk") ?? 50),
    audience: String(formData.get("audience") ?? "core") as AudienceId,
    note: String(formData.get("note") ?? "") || null,
  };

  const set = await setCreativeDirection(ctx, { sessionId, userId: user.id, direction });
  if (!set.ok) failTo(sessionId, set.error.message);

  // The producer responds immediately — that is the beat the player expects.
  const interpreted = await interpretCreativeDirection(ctx, { sessionId, userId: user.id });
  if (!interpreted.ok) failTo(sessionId, interpreted.error.message);

  backToSession(sessionId);
}

export async function selectProposalAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");

  const result = await selectProducerProposal(ctx, {
    sessionId,
    userId: user.id,
    proposalId: String(formData.get("proposalId") ?? ""),
  });
  if (!result.ok) failTo(sessionId, result.error.message);

  backToSession(sessionId);
}

export async function combineProposalsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");
  const picked = formData.getAll("combine").map(String);

  if (picked.length !== 2) failTo(sessionId, "Pick exactly two ideas to combine.");

  const result = await combineProducerProposals(ctx, {
    sessionId,
    userId: user.id,
    proposalIds: [picked[0]!, picked[1]!],
  });
  if (!result.ok) failTo(sessionId, result.error.message);

  backToSession(sessionId);
}

export async function rejectProposalsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");

  const rejected = await rejectProducerProposals(ctx, {
    sessionId,
    userId: user.id,
    reason: String(formData.get("reason") ?? "") || null,
  });
  if (!rejected.ok) failTo(sessionId, rejected.error.message);

  const interpreted = await interpretCreativeDirection(ctx, { sessionId, userId: user.id });
  if (!interpreted.ok) failTo(sessionId, interpreted.error.message);

  backToSession(sessionId);
}

/**
 * One step of the render.
 *
 * Called on an interval by the workspace while a job is in flight, so the
 * player watches the job move through its real states. Leaving the page is
 * safe: the job resumes from wherever it got to.
 */
export async function advanceRenderAction(jobId: string): Promise<string> {
  const user = await requireUser();
  const ctx = await createCommandContext();

  const result = await advanceGenerationJob(ctx, { jobId, userId: user.id });
  if (!result.ok) return "FAILED";

  revalidatePath(`/studio/session/${result.value.job.sessionId}`);
  revalidatePath("/studio");
  return result.value.done ? "COMPLETE" : result.value.job.status;
}

export async function requestRevisionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");

  const result = await requestRevision(ctx, {
    sessionId,
    userId: user.id,
    kind: String(formData.get("kind") ?? "darker") as RevisionKindId,
    note: String(formData.get("note") ?? "") || null,
  });
  if (!result.ok) failTo(sessionId, result.error.message);

  backToSession(sessionId);
}

export async function requestMasterAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");

  const result = await requestMaster(ctx, {
    sessionId,
    userId: user.id,
    versionId: String(formData.get("versionId") ?? ""),
  });
  if (!result.ok) failTo(sessionId, result.error.message);

  backToSession(sessionId);
}

export async function saveTrackAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const ctx = await createCommandContext();
  const sessionId = String(formData.get("sessionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (title) {
    const renamed = await renameTrack(ctx, { sessionId, userId: user.id, title });
    if (!renamed.ok) failTo(sessionId, renamed.error.message);
  }

  const saved = await saveTrackToCatalogue(ctx, { sessionId, userId: user.id, title: title || null });
  if (!saved.ok) failTo(sessionId, saved.error.message);

  revalidatePath("/home");
  revalidatePath("/studio");
  redirect("/home");
}
