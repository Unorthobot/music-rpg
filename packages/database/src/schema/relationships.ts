import { bigint, index, integer, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { RelationshipKind, RelationshipSubjectType } from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * What one person makes of another.
 *
 * One framework for everybody. The subject is polymorphic so a producer today
 * and a rival later are the same row shape — the dimensions are person-to-
 * person and mean the same thing regardless of who is on the other end. What
 * differs by role is `kind`, which decides which dimensions move and what they
 * unlock.
 *
 * Nothing here is ever awarded. Every value is a reading of canonical history,
 * and `derivedThroughSequence` is what makes that both true and cheap: the
 * first fold consumes a career's whole past, and every later one resumes from
 * the watermark.
 */
export const relationships = pgTable(
  "relationships",
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
    kind: text("kind").$type<RelationshipKind>().notNull().default("CONTACT"),

    /** 0–100. Longitudinal: one session cannot buy either of these. */
    familiarity: real("familiarity").notNull().default(0),
    loyalty: real("loyalty").notNull().default(0),

    respect: real("respect").notNull().default(0),
    trust: real("trust").notNull().default(0),
    creativeChemistry: real("creative_chemistry").notNull().default(0),
    /** Independent of trust, and not a penalty. Both can be high at once. */
    tension: real("tension").notNull().default(0),
    rivalry: real("rivalry").notNull().default(0),

    interactionCount: integer("interaction_count").notNull().default(0),
    /** High-water mark in the career's canonical history. */
    derivedThroughSequence: bigint("derived_through_sequence", { mode: "number" })
      .notNull()
      .default(0),
    engineVersion: text("engine_version").notNull(),
    firstMetAt: timestamp("first_met_at", { withTimezone: true }),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: uniqueIndex("relationships_subject_key").on(
      table.careerId,
      table.subjectType,
      table.subjectId,
    ),
    careerIdx: index("relationships_career_idx").on(table.careerId, table.kind),
  }),
);

export type RelationshipRow = typeof relationships.$inferSelect;
