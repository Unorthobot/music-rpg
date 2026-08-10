import "server-only";
import { redirect } from "next/navigation";
import { getCareerViewForUser, onboardingRoute, type CareerView } from "@music-rpg/domain";
import type { CareerAct } from "@music-rpg/shared";
import type { UserRow } from "@music-rpg/database";
import { getAppDb } from "./db";
import { getCurrentUser } from "./session";

/** Player-facing act names. The enum is storage; this is language. */
export const ACT_LABELS: Record<CareerAct, string> = {
  UNDERGROUND: "The Underground",
  COME_UP: "The Come Up",
  INDUSTRY: "The Industry",
  LEGACY: "Legacy",
};

export const ACT_LINES: Record<CareerAct, string> = {
  UNDERGROUND: "Get noticed.",
  COME_UP: "Turn attention into a career.",
  INDUSTRY: "Decide what to do with influence.",
  LEGACY: "What outlasts you.",
};

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
