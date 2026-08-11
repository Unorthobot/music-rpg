import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  AudienceCohortBehaviour,
  AudienceCohortPreferences,
  CohortEvaluation,
  ReceptionTickResult,
} from "@music-rpg/shared";
import { careers } from "./career";
import { releases } from "./releases";
import { worlds } from "./world";

/**
 * Reception.
 *
 * The boundary this schema exists to hold: audiences belong to the world,
 * affinity belongs to an artist, and listening belongs to a release. Collapsing
 * any two of those would make it impossible to say why a record performed the
 * way it did.
 */

/**
 * A population in a world that hears music a particular way.
 *
 * Not a class the player picks and not career-owned state: Johannesburg's scene
 * heads exist whether or not anyone has ever reached them, and every career
 * releasing into the city addresses the same people.
 */
export const audienceCohorts = pgTable(
  "audience_cohorts",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Addressable population: the ceiling on what one release can reach here. */
    size: integer("size").notNull().default(0),
    preferences: jsonb("preferences")
      .$type<AudienceCohortPreferences>()
      .notNull()
      .default({} as AudienceCohortPreferences),
    behaviouralWeights: jsonb("behavioural_weights")
      .$type<AudienceCohortBehaviour>()
      .notNull()
      .default({} as AudienceCohortBehaviour),
    /** Concentration by scene slug. Read by later milestones; recorded now. */
    sceneAffinity: jsonb("scene_affinity").$type<Record<string, number>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    worldSlugIdx: uniqueIndex("audience_cohorts_world_slug_key").on(table.worldId, table.slug),
  }),
);

/**
 * What a cohort feels about one artist or group.
 *
 * `fans` is persistent affinity and is never derived from a listener count —
 * 4,830 listeners with 187 fans and 740 listeners with 311 fans are different
 * careers, and this table is where that difference lives.
 */
export const artistAudience = pgTable(
  "artist_audience",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => audienceCohorts.id, { onDelete: "cascade" }),
    ownerType: text("owner_type").$type<"ARTIST" | "GROUP">().notNull(),
    ownerId: text("owner_id").notNull(),
    careerId: text("career_id").references(() => careers.id, { onDelete: "cascade" }),
    fans: integer("fans").notNull().default(0),
    /**
     * 0–1000. Warmth toward the artist, independent of any single release.
     * Fractional, because it accumulates in amounts smaller than one — a
     * ninety-four-thousand-strong cohort warms slowly or not at all.
     */
    affinity: real("affinity").notNull().default(0),
    /** 0–1000. How readily this cohort engages once it has listened. */
    engagementTendency: integer("engagement_tendency").notNull().default(0),
    /** 0–1000. What it now expects of the next record. */
    expectation: integer("expectation").notNull().default(0),
    /** Unique people here who have ever encountered this artist. */
    priorExposure: integer("prior_exposure").notNull().default(0),
    lastReachedGameTime: timestamp("last_reached_game_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerCohortIdx: uniqueIndex("artist_audience_owner_cohort_key").on(
      table.cohortId,
      table.ownerType,
      table.ownerId,
    ),
    careerIdx: index("artist_audience_career_idx").on(table.careerId),
  }),
);

/**
 * What one record did, in total.
 *
 * Every column is the sum of the cohort rows below it; nothing is written here
 * that cannot be reconciled with them, and neither can be written without the
 * canonical events that caused them.
 */
export const releasePerformance = pgTable(
  "release_performance",
  {
    releaseId: text("release_id")
      .primaryKey()
      .references(() => releases.id, { onDelete: "cascade" }),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    /** Unique reach: people given an opportunity to encounter the record. */
    totalExposures: integer("total_exposures").notNull().default(0),
    /** Every distinct person who has played it, ever. Not plays, not a window. */
    uniqueListeners: integer("unique_listeners").notNull().default(0),
    engagedListeners: integer("engaged_listeners").notNull().default(0),
    /** Distinct people who came back at least once. Counted once each. */
    repeatListeners: integer("repeat_listeners").notNull().default(0),
    fanConversions: integer("fan_conversions").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    /** Exposure this record's own word of mouth will create on the next tick. */
    wordOfMouth: integer("word_of_mouth").notNull().default(0),
    /** 0–100. Velocity around the record now — not Fame, and not permanent. */
    currentMomentum: real("current_momentum").notNull().default(0),
    daysSimulated: integer("days_simulated").notNull().default(0),
    lastSimulatedGameTime: timestamp("last_simulated_game_time", { withTimezone: true }),
    simulationSeed: text("simulation_seed").notNull(),
    /** Which simulator produced this. Formulas change; history must not. */
    simulatorVersion: text("simulator_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("release_performance_career_idx").on(table.careerId),
  }),
);

/** The same record, cohort by cohort. `evaluation` is why, not just what. */
export const releaseCohortPerformance = pgTable(
  "release_cohort_performance",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => audienceCohorts.id, { onDelete: "cascade" }),
    exposures: integer("exposures").notNull().default(0),
    /** The same measure as `release_performance.unique_listeners`, per cohort. */
    uniqueListeners: integer("unique_listeners").notNull().default(0),
    engagedListeners: integer("engaged_listeners").notNull().default(0),
    repeatListeners: integer("repeat_listeners").notNull().default(0),
    fanConversions: integer("fan_conversions").notNull().default(0),
    shares: integer("shares").notNull().default(0),
    /** Pending exposure the last tick's sharing will create — replaced, not summed. */
    wordOfMouth: integer("word_of_mouth").notNull().default(0),
    evaluation: jsonb("evaluation").$type<CohortEvaluation | Record<string, never>>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    releaseCohortIdx: uniqueIndex("release_cohort_performance_key").on(
      table.releaseId,
      table.cohortId,
    ),
  }),
);

/**
 * One row per simulated day, per release.
 *
 * The unique key on (release, day) is the idempotency guarantee — a day cannot
 * be applied twice no matter how the command is retried.
 */
export const receptionTicks = pgTable(
  "reception_ticks",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    /** 1 is the first day the record is out. */
    dayIndex: integer("day_index").notNull(),
    gameTime: timestamp("game_time", { withTimezone: true }).notNull(),
    simulatorVersion: text("simulator_version").notNull(),
    simulationSeed: text("simulation_seed").notNull(),
    result: jsonb("result")
      .$type<ReceptionTickResult | Record<string, never>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    releaseDayIdx: uniqueIndex("reception_ticks_release_day_key").on(
      table.releaseId,
      table.dayIndex,
    ),
    careerIdx: index("reception_ticks_career_idx").on(table.careerId, table.gameTime),
  }),
);

/**
 * Accrued Fame / Respect / Heat.
 *
 * `careers.fame` is an integer the player reads; reception produces fractional
 * pressure. Accruing here and taking the floor keeps both honest, and makes
 * every point traceable to the ticks that earned it.
 *
 * Legacy is absent by design: nothing in M5 may move it, so there is nowhere
 * for it to accumulate.
 */
export const careerMetricPressure = pgTable("career_metric_pressure", {
  careerId: text("career_id")
    .primaryKey()
    .references(() => careers.id, { onDelete: "cascade" }),
  fameAccrued: real("fame_accrued").notNull().default(0),
  respectAccrued: real("respect_accrued").notNull().default(0),
  heatAccrued: real("heat_accrued").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AudienceCohortRow = typeof audienceCohorts.$inferSelect;
export type ArtistAudienceRow = typeof artistAudience.$inferSelect;
export type ReleasePerformanceRow = typeof releasePerformance.$inferSelect;
export type ReleaseCohortPerformanceRow = typeof releaseCohortPerformance.$inferSelect;
export type ReceptionTickRow = typeof receptionTicks.$inferSelect;
export type CareerMetricPressureRow = typeof careerMetricPressure.$inferSelect;
