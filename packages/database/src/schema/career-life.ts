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
  OpportunityStatus,
  OpportunityType,
  TransactionCategory,
} from "@music-rpg/shared";
import { careers } from "./career";

/**
 * Something the world offers the player.
 *
 * Kept deliberately small: this is the spine a mission system will later
 * produce into, not the mission system itself. One row per career per type for
 * now, which is what makes "Thabo introduces you to producers" happen exactly
 * once no matter how many times the page is refreshed.
 */
export const opportunities = pgTable(
  "opportunities",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    type: text("type").$type<OpportunityType>().notNull(),
    sourceEntityType: text("source_entity_type"),
    sourceEntityId: text("source_entity_id"),
    status: text("status").$type<OpportunityStatus>().notNull().default("AVAILABLE"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerStatusIdx: index("opportunities_career_status_idx").on(table.careerId, table.status),
    careerTypeIdx: uniqueIndex("opportunities_career_type_key").on(table.careerId, table.type),
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
