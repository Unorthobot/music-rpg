import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { EventActorType, EventVisibility } from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * The canonical, immutable history of the simulation.
 *
 * Current-state tables are projections; this log is the record. Nothing here is
 * ever updated or deleted — corrections are new events. This is also the only
 * table world-control needs to explain "how did this career come to exist?".
 */
export const gameEvents = pgTable(
  "game_events",
  {
    id: text("id").primaryKey(),
    /** Monotonic ordering within the store, independent of clock skew. */
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").$type<EventActorType>().notNull(),
    actorId: text("actor_id"),
    targetType: text("target_type"),
    targetId: text("target_id"),
    visibility: text("visibility").$type<EventVisibility>().notNull().default("PRIVATE"),
    /** 1 (routine) – 100 (career-defining). Drives feeds and later notifications. */
    importance: integer("importance").notNull().default(10),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /**
     * Set by commands that must not double-write on retry. Unique, so a replayed
     * request collapses onto the original event instead of duplicating history.
     */
    idempotencyKey: text("idempotency_key"),
    /** In-world time. `createdAt` is wall-clock time. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("game_events_idempotency_key").on(table.idempotencyKey),
    worldIdx: index("game_events_world_id_idx").on(table.worldId),
    careerIdx: index("game_events_career_id_idx").on(table.careerId),
    typeIdx: index("game_events_event_type_idx").on(table.eventType),
    occurredIdx: index("game_events_occurred_at_idx").on(table.occurredAt),
  }),
);

export type GameEventRow = typeof gameEvents.$inferSelect;
export type NewGameEventRow = typeof gameEvents.$inferInsert;
