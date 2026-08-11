import { bigint, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type {
  MomentKind,
  MomentResponse,
  MomentStatus,
  RelationshipState,
  RelationshipSubjectType,
} from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * Something a relationship has to say.
 *
 * Written once, when the condition is first met, and then left alone. The
 * moment does not move the relationship — the player's answer does — so this
 * row is a question waiting for one, not a record of an effect.
 */
export const relationshipMoments = pgTable(
  "relationship_moments",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").$type<RelationshipSubjectType>().notNull(),
    subjectId: text("subject_id").notNull(),
    kind: text("kind").$type<MomentKind>().notNull(),
    status: text("status").$type<MomentStatus>().notNull().default("OPEN"),
    /** The relationship as it stood when this surfaced. Never recomputed. */
    triggerState: jsonb("trigger_state")
      .$type<RelationshipState | Record<string, never>>()
      .notNull()
      .default({}),
    triggerReason: text("trigger_reason").notNull(),
    triggeredAtSequence: bigint("triggered_at_sequence", { mode: "number" })
      .notNull()
      .default(0),
    engineVersion: text("engine_version").notNull(),
    response: text("response").$type<MomentResponse>(),
    surfacedAtGameTime: timestamp("surfaced_at_game_time", { withTimezone: true }).notNull(),
    resolvedAtGameTime: timestamp("resolved_at_game_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("relationship_moments_career_idx").on(table.careerId, table.status),
  }),
);

export type RelationshipMomentRow = typeof relationshipMoments.$inferSelect;
