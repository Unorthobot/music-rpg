import "server-only";
import { redirect } from "next/navigation";
import { getOnboardingView, type OnboardingView } from "@music-rpg/domain";
import type { OnboardingState } from "@music-rpg/shared";
import type { UserRow } from "@music-rpg/database";
import { getAppDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

/**
 * Step guard.
 *
 * Onboarding position is server state, so a player can close the tab on step
 * three and open the app on another device at step three. Going *back* to an
 * earlier step is allowed — that is how renaming and re-answering work — but
 * skipping ahead redirects to wherever the career actually is.
 */
const STEP_ORDER: OnboardingState[] = [
  "NOT_STARTED",
  "CAREER_TYPE",
  "IDENTITY",
  "SOUND_DISCOVERY",
  "MEMBERS",
  "REVEAL",
  "COMPLETE",
];

/** First step: a career may not exist yet, so `onboarding` can be null. */
export async function loadOnboardingEntry(): Promise<{
  user: UserRow;
  onboarding: OnboardingView | null;
}> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getAppDb();
  const onboarding = await getOnboardingView(db, user.id);

  if (onboarding?.career.status === "ACTIVE") redirect("/home");

  return { user, onboarding };
}

/** Later steps: a career must exist and must have reached this step. */
export async function requireOnboardingStep(
  step: Exclude<OnboardingState, "NOT_STARTED" | "CAREER_TYPE">,
): Promise<{ user: UserRow; onboarding: OnboardingView }> {
  const { user, onboarding } = await loadOnboardingEntry();

  if (!onboarding) redirect("/start");

  const current = STEP_ORDER.indexOf(onboarding.career.onboardingState);
  const requested = STEP_ORDER.indexOf(step);

  if (requested > current) redirect(onboarding.route);

  return { user, onboarding };
}
