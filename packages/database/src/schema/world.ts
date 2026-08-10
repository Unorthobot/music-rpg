import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { WorldStatus } from "@music-rpg/shared";

/**
 * A world is a persistent simulation container. Development seeds one
 * (Johannesburg), but every downstream table carries `world_id` so additional
 * worlds — and later, world-scoped simulation ticks — need no migration.
 */
export const worlds = pgTable(
  "worlds",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    status: text("status").$type<WorldStatus>().notNull().default("ACTIVE"),
    /** In-world clock. Advances independently of wall-clock time. */
    currentGameTime: timestamp("current_game_time", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: uniqueIndex("worlds_slug_key").on(table.slug),
  }),
);

/**
 * Scenes are the local music ecosystems inside a world. In M0/M1 they only
 * anchor a career's origin; later milestones hang audiences, venues and
 * relationships off them.
 */
export const scenes = pgTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    worldSlugIdx: uniqueIndex("scenes_world_slug_key").on(table.worldId, table.slug),
    worldIdx: index("scenes_world_id_idx").on(table.worldId),
  }),
);

export type WorldRow = typeof worlds.$inferSelect;
export type SceneRow = typeof scenes.$inferSelect;
