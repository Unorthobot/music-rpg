import { boolean, index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { AccountStatus, OnboardingState, SubscriptionTier } from "@music-rpg/shared";

/**
 * Real-account identity.
 *
 * `users` is deliberately thin: it holds who the human is, never who their
 * artist is. Fictional identity lives in `artists`/`groups` and must never be
 * derivable from this table by the public profile routes.
 */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    /** Managed-auth deployments leave this null and authenticate elsewhere. */
    passwordHash: text("password_hash"),
    accountStatus: text("account_status").$type<AccountStatus>().notNull().default("ACTIVE"),
    onboardingState: text("onboarding_state").$type<OnboardingState>().notNull().default("NOT_STARTED"),
    subscriptionTier: text("subscription_tier").$type<SubscriptionTier>().notNull().default("FREE"),
    locale: text("locale").notNull().default("en-ZA"),
    timezone: text("timezone").notNull().default("Africa/Johannesburg"),
    /** Grants access to the world-control debug surface. */
    isInternal: boolean("is_internal").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_key").on(table.email),
    usernameIdx: uniqueIndex("users_username_key").on(table.username),
  }),
);

/**
 * Sessions are stored server-side so that a managed auth provider can replace
 * the credentials provider without changing how the app reads the current user.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("sessions_token_hash_key").on(table.tokenHash),
    userIdx: index("sessions_user_id_idx").on(table.userId),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
