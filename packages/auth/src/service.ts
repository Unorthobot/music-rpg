import { eq, or } from "drizzle-orm";
import { users, type DbClient, type UserRow } from "@music-rpg/database";
import { err, ids, ok, slugify, type Result } from "@music-rpg/shared";
import { hashPassword, verifyPassword } from "./password";

/**
 * Account identity operations.
 *
 * `AuthService` is the seam a managed provider (Auth.js, Supabase Auth, Clerk)
 * would implement. Everything above it — commands, routes, UI — depends on this
 * interface and on `users`, never on a specific provider.
 */
export type AuthError =
  | { code: "EMAIL_TAKEN"; message: string }
  | { code: "USERNAME_TAKEN"; message: string }
  | { code: "INVALID_CREDENTIALS"; message: string }
  | { code: "INVALID_INPUT"; message: string; field?: string }
  | { code: "ACCOUNT_UNAVAILABLE"; message: string };

export type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
  username?: string;
};

export interface AuthService {
  register(input: RegisterInput): Promise<Result<UserRow, AuthError>>;
  authenticate(email: string, password: string): Promise<Result<UserRow, AuthError>>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export class CredentialsAuthService implements AuthService {
  constructor(private readonly db: DbClient) {}

  async register(input: RegisterInput): Promise<Result<UserRow, AuthError>> {
    const email = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();

    if (!EMAIL_PATTERN.test(email)) {
      return err({ code: "INVALID_INPUT", message: "Enter a valid email address.", field: "email" });
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      return err({
        code: "INVALID_INPUT",
        message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
        field: "password",
      });
    }
    if (displayName.length < 2) {
      return err({ code: "INVALID_INPUT", message: "Tell us what to call you.", field: "displayName" });
    }

    const username = await this.resolveUsername(input.username ?? displayName ?? email.split("@")[0]!);

    const existing = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing[0]) {
      return err({ code: "EMAIL_TAKEN", message: "That email already has an account." });
    }

    const passwordHash = await hashPassword(input.password);

    const inserted = await this.db
      .insert(users)
      .values({
        id: ids.user(),
        email,
        username,
        displayName,
        passwordHash,
        onboardingState: "NOT_STARTED",
      })
      .returning();

    const user = inserted[0];
    if (!user) {
      return err({ code: "ACCOUNT_UNAVAILABLE", message: "We couldn't create that account." });
    }

    return ok(user);
  }

  async authenticate(rawEmail: string, password: string): Promise<Result<UserRow, AuthError>> {
    const email = rawEmail.trim().toLowerCase();

    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];

    // Same error for "no such user" and "wrong password": never confirm which
    // emails have accounts.
    if (!user) {
      return err({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    }
    if (user.accountStatus !== "ACTIVE") {
      return err({ code: "ACCOUNT_UNAVAILABLE", message: "This account isn't available." });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return err({ code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." });
    }

    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    return ok(user);
  }

  /** Usernames are account handles, not stage names — collisions just get a suffix. */
  private async resolveUsername(seed: string): Promise<string> {
    const base = slugify(seed) || "player";

    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.db
        .select({ id: users.id })
        .from(users)
        .where(or(eq(users.username, candidate)))
        .limit(1);
      if (!taken[0]) return candidate;
    }

    return `${base}-${Math.floor(Math.random() * 100_000).toString(36)}`;
  }
}
