import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type {
  CrewDecision,
  CrewStatus,
  CrewTerms,
  RelationshipSubjectType,
} from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * The people who are actually with you.
 *
 * Separate from `relationships` on purpose. A relationship is what passed
 * between two people; crew is a standing arrangement somebody agreed to. You
 * can have a strong relationship with a producer who is not your crew, and that
 * is a meaningful state rather than an incomplete one.
 */
export const crewMembers = pgTable(
  "crew_members",
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
    role: text("role").notNull(),
    status: text("status").$type<CrewStatus>().notNull(),
    /** What was offered. Kept, because terms are part of the deal. */
    terms: jsonb("terms").$type<CrewTerms>().notNull().default({} as CrewTerms),
    /** What they said and why. Player sees the line; inspector sees the rest. */
    decision: jsonb("decision").$type<CrewDecision | Record<string, never>>()
      .notNull()
      .default({}),
    askedAtGameTime: timestamp("asked_at_game_time", { withTimezone: true }),
    joinedAtGameTime: timestamp("joined_at_game_time", { withTimezone: true }),
    leftAtGameTime: timestamp("left_at_game_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: uniqueIndex("crew_members_subject_key").on(
      table.careerId,
      table.subjectType,
      table.subjectId,
    ),
    careerIdx: index("crew_members_career_idx").on(table.careerId, table.status),
  }),
);

export type CrewMemberRow = typeof crewMembers.$inferSelect;
