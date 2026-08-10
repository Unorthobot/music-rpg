import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  DiscoveryAudience,
  DiscoveryOption,
  DiscoveryQuestionKind,
  DiscoveryResponses,
  DiscoverySubject,
} from "@music-rpg/shared";
import { careers } from "./career";

/**
 * Sound Discovery questions are configuration, not screen logic. Adding or
 * reordering a question is a seed change; the flow renders whatever it finds.
 */
export const soundDiscoveryQuestions = pgTable(
  "sound_discovery_questions",
  {
    id: text("id").primaryKey(),
    version: integer("version").notNull().default(1),
    orderIndex: integer("order_index").notNull(),
    prompt: text("prompt").notNull(),
    helpText: text("help_text"),
    kind: text("kind").$type<DiscoveryQuestionKind>().notNull().default("CHOICE"),
    /** SOLO, GROUP or BOTH — group discovery asks slightly different questions. */
    appliesTo: text("applies_to").$type<DiscoveryAudience>().notNull().default("BOTH"),
    options: jsonb("options").$type<DiscoveryOption[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index("sound_discovery_questions_order_idx").on(table.version, table.orderIndex),
  }),
);

/**
 * One discovery session per career. Answers are written as the player goes so
 * that leaving mid-flow and returning on another device resumes exactly.
 */
export const soundDiscoverySessions = pgTable(
  "sound_discovery_sessions",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    subjectType: text("subject_type").$type<DiscoverySubject>().notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").$type<"IN_PROGRESS" | "COMPLETED">().notNull().default("IN_PROGRESS"),
    /** questionId -> optionId | free text */
    responses: jsonb("responses").$type<DiscoveryResponses>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: uniqueIndex("sound_discovery_sessions_career_key").on(table.careerId),
  }),
);

export type SoundDiscoveryQuestionRow = typeof soundDiscoveryQuestions.$inferSelect;
export type SoundDiscoverySessionRow = typeof soundDiscoverySessions.$inferSelect;
