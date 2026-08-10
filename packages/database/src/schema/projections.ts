import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type { TrackStatus } from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * Projections the player-facing counters read from.
 *
 * These exist so Home never reports a number the simulation didn't produce.
 * They are legitimately empty today — the systems that write them arrive in
 * later milestones — but a zero read from here is a fact about the world, not
 * a literal in a template.
 */

/** One row per career, created with the career. Audience simulation owns it later. */
export const careerAudience = pgTable("career_audience", {
  careerId: text("career_id")
    .primaryKey()
    .references(() => careers.id, { onDelete: "cascade" }),
  fans: integer("fans").notNull().default(0),
  monthlyListeners: integer("monthly_listeners").notNull().default(0),
  reach: integer("reach").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Catalogue. Deliberately minimal — the Studio milestone owns the real shape of
 * a track (sound, credits, sessions, masters); this is the spine that lets a
 * catalogue count be honest before any of that exists.
 */
export const tracks = pgTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "cascade" }),
    /**
     * Primary owner. A group career's track belongs to the Group — and
     * `primaryArtistId` still names the player's own artist, so a member
     * leaving never erases who made it.
     */
    ownerType: text("owner_type").$type<"ARTIST" | "GROUP">().notNull(),
    ownerId: text("owner_id").notNull(),
    primaryArtistId: text("primary_artist_id"),
    /** Null until the player names it; a working title lives on the version. */
    title: text("title"),
    purpose: text("purpose").notNull().default("TRACK"),
    status: text("status").$type<TrackStatus>().notNull().default("IDEA"),
    currentMasterVersionId: text("current_master_version_id"),
    sessionId: text("session_id"),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("tracks_career_id_idx").on(table.careerId),
    ownerIdx: index("tracks_owner_idx").on(table.ownerType, table.ownerId),
  }),
);

/** Battle record. Same reasoning as `tracks`: a real spine for an honest count. */
export const battles = pgTable(
  "battles",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "cascade" }),
    challengerId: text("challenger_id").notNull(),
    opponentId: text("opponent_id"),
    status: text("status")
      .$type<"SCHEDULED" | "COMPLETED" | "FORFEITED">()
      .notNull()
      .default("SCHEDULED"),
    outcome: text("outcome").$type<"WON" | "LOST" | "DRAW">(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("battles_career_id_idx").on(table.careerId),
  }),
);

export type CareerAudienceRow = typeof careerAudience.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
export type BattleRow = typeof battles.$inferSelect;
