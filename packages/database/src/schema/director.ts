import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import type { DirectorTrace, OpportunityConflictKind } from "@music-rpg/shared";
import { careers } from "./career";
import { opportunities } from "./career-life";
import { worlds } from "./world";

/**
 * The director's own record of what it did.
 *
 * Two tables, and neither of them holds an opportunity: these are how the world
 * explains itself about opportunities.
 */

/**
 * Two offers that cannot both happen.
 *
 * Conflict is an explicit relationship rather than an implicit consequence, so
 * that accepting one offer can resolve the other *because of the conflict* — a
 * stated reason, pointing at the thing that caused it — instead of a stale row
 * quietly disappearing.
 *
 * Deliberately not a scheduling economy. Detecting that two things want the same
 * night is the entire requirement, and anything more belongs to a milestone that
 * has a calendar worth negotiating over.
 */
export const opportunityConflicts = pgTable(
  "opportunity_conflicts",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    /** The pair is ordered by id at write time, so it is stored exactly once. */
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    otherOpportunityId: text("other_opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    kind: text("kind").$type<OpportunityConflictKind>().notNull(),
    /** What they are competing for, in recorded values. */
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    detectedAtGameTime: timestamp("detected_at_game_time", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pairIdx: uniqueIndex("opportunity_conflicts_pair_key").on(
      table.opportunityId,
      table.otherOpportunityId,
    ),
    careerIdx: index("opportunity_conflicts_career_idx").on(table.careerId),
  }),
);

/**
 * One run of the director, in full.
 *
 * The `reception_ticks` shape, for the same two reasons. The unique key on
 * (career, game_time) makes a day impossible to direct twice however the command
 * is retried. And the trace keeps the whole reasoning rather than only its
 * outcome — every candidate considered, the conditions it passed or failed, what
 * its score decomposed into, and whether it was written down.
 *
 * The candidates that were *eligible and not surfaced* are the important ones.
 * They are the only evidence that "something more relevant came up" is a true
 * answer rather than a guess, and they live here precisely because they must not
 * become player-facing rows.
 */
export const opportunityDirectorRuns = pgTable(
  "opportunity_director_runs",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    /** In-world time. One run per career per game day. */
    gameTime: timestamp("game_time", { withTimezone: true }).notNull(),
    directorVersion: text("director_version").notNull(),
    trace: jsonb("trace").$type<DirectorTrace | Record<string, never>>().notNull().default({}),
    candidatesConsidered: integer("candidates_considered").notNull().default(0),
    eligibleCount: integer("eligible_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    expiredCount: integer("expired_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    dayIdx: uniqueIndex("opportunity_director_runs_day_key").on(table.careerId, table.gameTime),
    careerIdx: index("opportunity_director_runs_career_idx").on(table.careerId, table.gameTime),
  }),
);

export type OpportunityConflictRow = typeof opportunityConflicts.$inferSelect;
export type OpportunityDirectorRunRow = typeof opportunityDirectorRuns.$inferSelect;
