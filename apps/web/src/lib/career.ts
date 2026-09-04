import "server-only";
import { redirect } from "next/navigation";
import { getCareerViewForUser, onboardingRoute, type CareerView } from "@music-rpg/domain";
import type { UserRow } from "@music-rpg/database";
import { getAppDb } from "./db";
import { getCurrentUser } from "./session";

/**
 * Player-facing chapter names. The enum is storage; this is language.
 *
 * Re-exported from `@music-rpg/shared` rather than declared here, because the
 * same words now appear on a screen the web app does not own — a chapter reaches
 * the player through `ChapterView`, and two copies of the wording would drift the
 * first time one of them was edited. The `ACT_` names are kept because twenty
 * screens pass one to `AppShell`; the words behind them are the chapter's.
 */
export { CHAPTER_LABELS as ACT_LABELS, CHAPTER_LINES as ACT_LINES } from "@music-rpg/shared";

/**
 * Guard for every in-app destination: a signed-in player with a career that has
 * finished onboarding. Anything else is sent back to the right step.
 */
export async function requireCareer(): Promise<{ user: UserRow; view: CareerView }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const db = await getAppDb();
  const view = await getCareerViewForUser(db, user.id);

  if (!view) redirect("/start");
  if (view.career.status === "ONBOARDING") redirect(onboardingRoute(view.career));

  return { user, view };
}
