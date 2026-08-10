import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ProjectStatus,
  ProjectType,
  ReleaseFormat,
  ReleaseStatus,
  ReleaseStrategy,
} from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * Bodies of work.
 *
 * Entities from day one so the capability can open when a career has the music
 * for it, rather than needing a migration at the moment it becomes interesting.
 * Nothing in M4 lets a one-track career make an album.
 */
export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    type: text("type").$type<ProjectType>().notNull(),
    title: text("title"),
    status: text("status").$type<ProjectStatus>().notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("projects_career_idx").on(table.careerId, table.status),
  }),
);

export const projectTracks = pgTable(
  "project_tracks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    trackId: text("track_id").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex("project_tracks_key").on(table.projectId, table.trackId),
  }),
);

/**
 * A release.
 *
 * The decision about existing work: what shape it goes out in, how, and when.
 * It points at a track or a project and can never create either. `audienceModifiers`
 * are written here and read by M5 — a release records what it was worth
 * attempting, and the audience decides what it was actually worth.
 */
export const releases = pgTable(
  "releases",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    trackId: text("track_id"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "cascade" }),
    format: text("format").$type<ReleaseFormat>().notNull(),
    strategy: text("strategy").$type<ReleaseStrategy>().notNull().default("DROP"),
    status: text("status").$type<ReleaseStatus>().notNull().default("PLANNED"),
    scheduledGameTime: timestamp("scheduled_game_time", { withTimezone: true }),
    releasedGameTime: timestamp("released_game_time", { withTimezone: true }),
    strategyState: jsonb("strategy_state").$type<Record<string, unknown>>().notNull().default({}),
    audienceModifiers: jsonb("audience_modifiers")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    costMinor: bigint("cost_minor", { mode: "number" }).notNull().default(0),
    transactionId: text("transaction_id"),
    cancelledReason: text("cancelled_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("releases_career_idx").on(table.careerId, table.status),
    trackIdx: index("releases_track_idx").on(table.trackId),
  }),
);

export type ProjectRow = typeof projects.$inferSelect;
export type ProjectTrackRow = typeof projectTracks.$inferSelect;
export type ReleaseRow = typeof releases.$inferSelect;
