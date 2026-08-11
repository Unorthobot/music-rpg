import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  CalendarItemStatus,
  CalendarItemType,
  EligibilityResult,
  OpportunityOrigin,
  OpportunityStatus,
  OpportunityType,
  RankingResult,
  TransactionCategory,
} from "@music-rpg/shared";
import { careers } from "./career";
import { scenes } from "./world";

/**
 * Something the world offers the player.
 *
 * A world fact with a lifetime. Written once, when it is generated, and never
 * recomputed on read — the rule M6's moments established, applied to everything
 * the director produces. Screens may reveal, rank, explain, accept, decline or
 * act on these rows. They must never create one.
 *
 * The reasoning travels with the fact. `trigger_state` is the world as it stood,
 * `eligibility` is which named conditions passed and what they were applied to,
 * and `ranking` is the score decomposed into named contributions. All three are
 * kept so that months later, under a newer director, the inspector can still say
 * why this appeared rather than asserting that it should have.
 *
 * Identity is per opportunity, not per type: `idempotency_key` is built from the
 * source and the trigger, so two promoters can independently offer you a night
 * and neither collapses onto the other, while the same promoter offering the
 * same night twice does.
 */
export const opportunities = pgTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    type: text("type").$type<OpportunityType>().notNull(),
    /** Authored or generated. Same kind of fact; different things go wrong. */
    origin: text("origin").$type<OpportunityOrigin>().notNull().default("AUTHORED"),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: text("source_entity_id"),
    /** Where it is, when it has a place. */
    sceneId: text("scene_id").references(() => scenes.id, { onDelete: "set null" }),
    status: text("status").$type<OpportunityStatus>().notNull().default("AVAILABLE"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /** What replaced the unique index on (career, type). Source + trigger. */
    idempotencyKey: text("idempotency_key"),
    /** The state this was generated from. Kept, not recomputed. */
    triggerState: jsonb("trigger_state").$type<Record<string, unknown>>().notNull().default({}),
    triggerReason: text("trigger_reason"),
    eligibility: jsonb("eligibility")
      .$type<EligibilityResult | Record<string, never>>()
      .notNull()
      .default({}),
    ranking: jsonb("ranking").$type<RankingResult | Record<string, never>>().notNull().default({}),
    directorVersion: text("director_version"),
    /* Wall-clock, from M2. Left alone; the lifecycle does not read these. */
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /* In-world time. This is what expiry is measured against. */
    availableAtGameTime: timestamp("available_at_game_time", { withTimezone: true }),
    expiresAtGameTime: timestamp("expires_at_game_time", { withTimezone: true }),
    generatedAtGameTime: timestamp("generated_at_game_time", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** Turning something down. A choice. */
    declinedAt: timestamp("declined_at", { withTimezone: true }),
    /** Letting it lapse. A different choice, and kept separately. */
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    /** Made impossible by something incompatible being accepted. */
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnForOpportunityId: text("withdrawn_for_opportunity_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerStatusIdx: index("opportunities_career_status_idx").on(table.careerId, table.status),
    /*
     * What replaced `opportunities_career_type_key`. Nulls are distinct in a
     * unique index, so the M2 rows that predate the key coexist happily while
     * every keyed offer is written at most once.
     */
    identityIdx: uniqueIndex("opportunities_identity_key").on(
      table.careerId,
      table.idempotencyKey,
    ),
  }),
);

/**
 * The career in time.
 *
 * Times are in-world, never wall-clock: a session sits on the career's calendar
 * at a game date, and the game clock advances through domain actions.
 */
export const calendarItems = pgTable(
  "calendar_items",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    type: text("type").$type<CalendarItemType>().notNull(),
    title: text("title").notNull(),
    description: text("description"),
    startGameTime: timestamp("start_game_time", { withTimezone: true }).notNull(),
    endGameTime: timestamp("end_game_time", { withTimezone: true }),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),
    status: text("status").$type<CalendarItemStatus>().notNull().default("SCHEDULED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerStartIdx: index("calendar_items_career_start_idx").on(table.careerId, table.startGameTime),
    relatedIdx: index("calendar_items_related_idx").on(
      table.relatedEntityType,
      table.relatedEntityId,
    ),
  }),
);

/**
 * The money ledger.
 *
 * `careers.money_balance` stays the running balance so every read is cheap, but
 * it is only ever written alongside a row here, inside one transaction. Nothing
 * in the codebase does `moneyBalance -= x` on its own.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    category: text("category").$type<TransactionCategory>().notNull(),
    direction: text("direction").$type<"DEBIT" | "CREDIT">().notNull(),
    /** Always positive; `direction` carries the sign. Integer minor units. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    balanceAfterMinor: bigint("balance_after_minor", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),
    /** A retried charge collapses onto the original row instead of charging twice. */
    idempotencyKey: text("idempotency_key"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    idempotencyIdx: uniqueIndex("transactions_idempotency_key").on(table.idempotencyKey),
    careerIdx: index("transactions_career_idx").on(table.careerId, table.occurredAt),
  }),
);

/**
 * Career memory.
 *
 * One structured row per moment worth remembering, derived from the canonical
 * event that caused it. This is the substrate a real memory engine will read;
 * it is not a retrieval system, and nothing generates prose into it.
 */
export const careerMemories = pgTable(
  "career_memories",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    sourceEventId: text("source_event_id"),
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: text("related_entity_id"),
    importance: integer("importance").notNull().default(50),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("career_memories_career_idx").on(table.careerId, table.occurredAt),
  }),
);

export type OpportunityRow = typeof opportunities.$inferSelect;
export type CalendarItemRow = typeof calendarItems.$inferSelect;
export type TransactionRow = typeof transactions.$inferSelect;
export type CareerMemoryRow = typeof careerMemories.$inferSelect;
