import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { GenerationJobStatus } from "@music-rpg/shared";
import { careers } from "./career";
import { users } from "./identity";
import { worlds } from "./world";

/**
 * Asynchronous work (later: audio generation, artwork, world ticks).
 * Nothing enqueues real generation in M0/M1, but the table and the queue
 * abstraction exist so those systems slot in without a schema change.
 */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id").references(() => worlds.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    status: text("status").$type<GenerationJobStatus>().notNull().default("REQUESTED"),
    /** The session and version this job belongs to, for causality. */
    sessionId: text("session_id"),
    trackVersionId: text("track_version_id"),
    /** A retried request resolves to the same job instead of a second render. */
    idempotencyKey: text("idempotency_key"),
    provider: text("provider").notNull().default("development"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index("generation_jobs_status_idx").on(table.status),
    careerIdx: index("generation_jobs_career_id_idx").on(table.careerId),
  }),
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("notifications_user_id_idx").on(table.userId),
  }),
);

/**
 * Product analytics sink for the development adapter.
 *
 * Intentionally separate from `game_events`: analytics answers "how is the
 * funnel doing", the canonical log answers "what happened in the fiction".
 * Swapping in a vendor adapter replaces this table's writer, nothing else.
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    userId: text("user_id"),
    careerId: text("career_id"),
    anonymousId: text("anonymous_id"),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index("analytics_events_name_idx").on(table.name),
    userIdx: index("analytics_events_user_id_idx").on(table.userId),
  }),
);

export type GenerationJobRow = typeof generationJobs.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type AnalyticsEventRow = typeof analyticsEvents.$inferSelect;
