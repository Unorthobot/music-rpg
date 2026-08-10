"use server";

import { redirect } from "next/navigation";
import { CredentialsAuthService, createSession, destroySession } from "@music-rpg/auth";
import { getActiveCareer, onboardingRoute } from "@music-rpg/domain";
import { getAppDb } from "@/lib/db";
import { createCommandContext } from "@/lib/command-context";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/lib/session";

/**
 * Account actions.
 *
 * These deliberately do not touch career state: registering an account and
 * starting a career are separate steps, because a User is not a Career.
 */
function backTo(path: string, message: string, values?: Record<string, string>): never {
  const params = new URLSearchParams({ error: message, ...values });
  redirect(`${path}?${params.toString()}`);
}

export async function registerAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("displayName") ?? "");

  const db = await getAppDb();
  const auth = new CredentialsAuthService(db);
  const result = await auth.register({ email, password, displayName });

  if (!result.ok) {
    backTo("/register", result.error.message, { email, displayName });
  }

  const session = await createSession(db, result.value.id);
  setSessionCookie(session.token, session.expiresAt);

  const ctx = await createCommandContext();
  await ctx.analytics.track({
    name: "account_created",
    userId: result.value.id,
    properties: { method: "credentials" },
  });

  redirect("/start");
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const db = await getAppDb();
  const auth = new CredentialsAuthService(db);
  const result = await auth.authenticate(email, password);

  if (!result.ok) {
    backTo("/login", result.error.message, { email });
  }

  const session = await createSession(db, result.value.id);
  setSessionCookie(session.token, session.expiresAt);

  // Return the player exactly where they left off, on any device.
  const career = await getActiveCareer(db, result.value.id);
  redirect(onboardingRoute(career));
}

export async function logoutAction(): Promise<void> {
  const token = readSessionToken();
  const db = await getAppDb();
  await destroySession(db, token);
  clearSessionCookie();
  redirect("/");
}
