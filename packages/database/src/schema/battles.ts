import {
  bigint,
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
  BattleJudge,
  BattlePanelRole,
  BattleSide,
  BattleStatus,
  BattleStrategy,
  JudgeContribution,
  PerformanceFactDerivation,
  ScoutingFinding,
} from "@music-rpg/shared";
import { artists } from "./artist";
import { careers } from "./career";
import { opportunities } from "./career-life";
import { scenes, worlds } from "./world";

/**
 * A battle.
 *
 * The M1 hardening stub existed so `counters.battles` could honestly read zero.
 * M8 gives it the lifetime, the reasoning and the identity, following `0011`'s
 * precedent with `opportunities` — keep the row, add everything that makes a
 * competitive event a world fact.
 *
 * **The challenge and the battle are different facts.** The invitation lives in
 * `opportunities` with M7's statuses and answers *do you want to fight?*; this
 * row is the event, with its own lifetime. Overloading one for the other would
 * make "the offer lapsed" and "nobody turned up" the same state.
 *
 * **There is no score column.** Not here, not on the performances, and not on
 * the judgements beyond each judge's own private pair of totals. The result is
 * the panel's agreement, derived from `battle_judgements`, and a single number
 * that already knew the answer is the one thing this table must not be able to
 * hold.
 */
export const battles = pgTable(
  "battles",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    careerId: text("career_id").references(() => careers.id, { onDelete: "cascade" }),

    /**
     * Roles, not "the player and the other one".
     *
     * Since M1 these have been bare text; `0013` makes them real references, at
     * which point "battle participants must exist" stops being a promise the
     * application makes and becomes one the database keeps.
     */
    challengerId: text("challenger_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    opponentId: text("opponent_id").references(() => artists.id, { onDelete: "cascade" }),
    /** Which half of it the career is. A player-issued challenge swaps this. */
    playerSide: text("player_side").$type<BattleSide>(),

    status: text("status").$type<BattleStatus>().notNull().default("CHALLENGED"),
    /** From the career's point of view. Derived; never independently decided. */
    outcome: text("outcome").$type<"WON" | "LOST" | "DRAW">(),

    /** Source and trigger. One battle per challenge, however often a day runs. */
    idempotencyKey: text("idempotency_key"),
    /** The challenge this came from. A battle without one has no origin. */
    opportunityId: text("opportunity_id").references(() => opportunities.id, {
      onDelete: "set null",
    }),
    sceneId: text("scene_id").references(() => scenes.id, { onDelete: "set null" }),

    /* In game time, like every other commitment. Never wall-clock. */
    challengedAtGameTime: timestamp("challenged_at_game_time", { withTimezone: true }),
    scheduledGameTime: timestamp("scheduled_game_time", { withTimezone: true }),

    /** Why this challenge existed, and the recorded state it came from. */
    challengeReason: text("challenge_reason"),
    challengeState: jsonb("challenge_state").$type<Record<string, unknown>>().notNull().default({}),

    /** Which engine, and the seed it decided from. Replay needs both. */
    simulatorVersion: text("simulator_version"),
    seed: text("seed"),

    /** The verdict, as entities rather than as a score. */
    winnerArtistId: text("winner_artist_id").references(() => artists.id, {
      onDelete: "set null",
    }),
    loserArtistId: text("loser_artist_id").references(() => artists.id, { onDelete: "set null" }),
    /** "2-1". The shape of the panel's agreement, derived from the votes. */
    decision: text("decision"),

    /** What followed, decomposed. Legacy is absent and cannot arrive. */
    consequences: jsonb("consequences").$type<Record<string, unknown>>().notNull().default({}),

    /* Each ending is its own fact. Declining is not losing. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    performedAt: timestamp("performed_at", { withTimezone: true }),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("battles_career_id_idx").on(table.careerId),
    careerStatusIdx: index("battles_career_status_idx").on(table.careerId, table.status),
    identityIdx: uniqueIndex("battles_identity_key").on(table.careerId, table.idempotencyKey),
  }),
);

/**
 * What one artist actually did.
 *
 * A track has versions, briefs and decisions; a verse had nothing. These seven
 * facts are the smallest honest representation that lets a judge evaluate
 * without pretending bars exist — M8 generates no lyrics and no judge reads
 * prose.
 *
 * They are real columns rather than a blob for the same reason `artist_skills`
 * is: a closed craft vocabulary with bounds the database can keep. `derivation`
 * beside them is the versioned half — how each was arrived at from skills,
 * psychology, the declared angle and preparation.
 *
 * `strategy` sits apart from the facts deliberately. What you set out to do and
 * what you actually did are different things, and the Strategic judge exists
 * because they can come apart.
 */
export const battlePerformances = pgTable(
  "battle_performances",
  {
    id: text("id").primaryKey(),
    battleId: text("battle_id")
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    side: text("side").$type<BattleSide>().notNull(),

    /** The angle. Declared before preparation, never after. */
    strategy: text("strategy").$type<BattleStrategy>().notNull(),
    strategyDeclaredAtGameTime: timestamp("strategy_declared_at_game_time", {
      withTimezone: true,
    }),

    /** What preparing cost. Bounded, so no amount of it becomes a guarantee. */
    preparationSessions: integer("preparation_sessions").notNull().default(0),
    preparationSpendMinor: bigint("preparation_spend_minor", { mode: "number" })
      .notNull()
      .default(0),
    preparation: jsonb("preparation").$type<Record<string, unknown>>().notNull().default({}),

    /* The performance, as facts. None of these is a total. */
    writing: real("writing").notNull().default(0),
    flow: real("flow").notNull().default(0),
    structure: real("structure").notNull().default(0),
    originality: real("originality").notNull().default(0),
    rebuttal: real("rebuttal").notNull().default(0),
    delivery: real("delivery").notNull().default(0),
    crowdWork: real("crowd_work").notNull().default(0),

    /** How each fact above was arrived at. The versioned half. */
    derivation: jsonb("derivation").$type<PerformanceFactDerivation[]>().notNull().default([]),
    simulatorVersion: text("simulator_version"),
    submittedAtGameTime: timestamp("submitted_at_game_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sideIdx: uniqueIndex("battle_performances_side_key").on(table.battleId, table.side),
    artistIdx: uniqueIndex("battle_performances_artist_key").on(table.battleId, table.artistId),
  }),
);

/**
 * What one judge made of it.
 *
 * Rows rather than columns, which is the whole reason this is a table. M8's
 * required panel is Technical, Strategic and Audience; `judge` is deliberately
 * unconstrained, because the next perspective worth having should be a row
 * rather than a migration.
 *
 * `panelRole` is what makes that safe. A result derives from the `REQUIRED`
 * judges only, so an `ADVISORY` perspective can be recorded against a battle
 * without a battle that has already been decided changing its mind.
 *
 * The two totals are this judge's own. They are not comparable with another
 * judge's, and nothing anywhere sums them across the panel.
 */
export const battleJudgements = pgTable(
  "battle_judgements",
  {
    id: text("id").primaryKey(),
    battleId: text("battle_id")
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    judge: text("judge").$type<BattleJudge>().notNull(),
    panelRole: text("panel_role").$type<BattlePanelRole>().notNull().default("REQUIRED"),

    verdictSide: text("verdict_side").$type<BattleSide>().notNull(),
    verdictArtistId: text("verdict_artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),

    challengerTotal: real("challenger_total").notNull(),
    opponentTotal: real("opponent_total").notNull(),
    /** How close it was, for this judge. A near-tie is a real fact. */
    margin: real("margin").notNull(),

    /** The argument: named contributions, their inputs, and why they weigh. */
    contributions: jsonb("contributions").$type<JudgeContribution[]>().notNull().default([]),
    /** What this judge does not consider. "Irrelevant" is a real answer. */
    irrelevant: jsonb("irrelevant").$type<string[]>().notNull().default([]),
    engineVersion: text("engine_version").notNull(),
    judgedAtGameTime: timestamp("judged_at_game_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    judgeIdx: uniqueIndex("battle_judgements_judge_key").on(table.battleId, table.judge),
    battleIdx: index("battle_judgements_battle_idx").on(table.battleId),
  }),
);

/**
 * What was knowable about them, on the day it was asked.
 *
 * Scouting reveals; it does not improve. Persisted rather than recomputed on
 * read for M6's reason and M7's — what the world knew when you looked is a fact,
 * and re-deriving it later would answer a different question with a newer world.
 *
 * No judge is given this row, and that is why it is a separate table rather than
 * a column on the performance: a scouting report cannot become a hidden modifier
 * if nothing that judges can reach it.
 */
export const battleScoutingReports = pgTable(
  "battle_scouting_reports",
  {
    id: text("id").primaryKey(),
    battleId: text("battle_id")
      .notNull()
      .references(() => battles.id, { onDelete: "cascade" }),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    subjectArtistId: text("subject_artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    findings: jsonb("findings").$type<ScoutingFinding[]>().notNull().default([]),
    /** Named things that could not be known. Absence is information. */
    unknowns: jsonb("unknowns").$type<{ label: string; reason: string }[]>().notNull().default([]),
    scoutedAtGameTime: timestamp("scouted_at_game_time", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    subjectIdx: uniqueIndex("battle_scouting_reports_key").on(table.battleId, table.subjectArtistId),
  }),
);

export type BattleRow = typeof battles.$inferSelect;
export type BattlePerformanceRow = typeof battlePerformances.$inferSelect;
export type BattleJudgementRow = typeof battleJudgements.$inferSelect;
export type BattleScoutingReportRow = typeof battleScoutingReports.$inferSelect;
