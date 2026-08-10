import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, getUserBySessionToken } from "@music-rpg/auth";
import type { UserRow } from "@music-rpg/database";
import { getAppDb } from "./db";

/**
 * Current-user resolution.
 *
 * Everything server-side reads the player through this function, so replacing
 * the credentials provider with a managed one touches `@music-rpg/auth` and
 * this file only.
 */
export async function getCurrentUser(): Promise<UserRow | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getAppDb();
  return getUserBySessionToken(db, token);
}

export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) {
    // Callers are server components/actions behind `requireSession` redirects;
    // reaching here means a session expired mid-request.
    throw new Error("UNAUTHENTICATED");
  }
  return user;
}

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function setSessionCookie(token: string, expiresAt: Date): void {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

export function readSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE)?.value;
}

/** World-control access: an internal flag, or an allow-listed email. */
export function isInternalUser(user: UserRow): boolean {
  if (user.isInternal) return true;

  const allowList = (process.env.WORLD_CONTROL_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowList.includes(user.email.toLowerCase());
}
