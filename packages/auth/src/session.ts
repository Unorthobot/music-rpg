import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { sessions, users, type DbClient, type UserRow } from "@music-rpg/database";
import { ids } from "@music-rpg/shared";

export const SESSION_COOKIE = "music_rpg_session";
export const SESSION_TTL_DAYS = 30;

/**
 * Server-side sessions.
 *
 * The cookie carries an opaque token; only its SHA-256 digest is stored, so a
 * database dump cannot be replayed as a login. Swapping to a managed auth
 * provider means replacing this module and leaving every caller of
 * `getUserBySessionToken` untouched.
 */
function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type CreatedSession = { token: string; expiresAt: Date };

export async function createSession(
  db: DbClient,
  userId: string,
  userAgent?: string | null,
): Promise<CreatedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: ids.session(),
    userId,
    tokenHash: digest(token),
    userAgent: userAgent ?? null,
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getUserBySessionToken(
  db: DbClient,
  token: string | undefined | null,
): Promise<UserRow | null> {
  if (!token) return null;

  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, digest(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.user.accountStatus !== "ACTIVE") return null;
  return row.user;
}

export async function destroySession(db: DbClient, token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
}

/** Housekeeping; safe to call from a scheduled job later. */
export async function purgeExpiredSessions(db: DbClient): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
