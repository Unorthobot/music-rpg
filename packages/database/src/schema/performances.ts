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
  PerformanceDerivation,
  PerformanceStatus,
  ShowcaseBilling,
} from "@music-rpg/shared";
import { careers } from "./career";
import { calendarItems, opportunities } from "./career-life";
import { characters } from "./characters";
import { scenes } from "./world";

/**
 * A night that happened.
 *
 * The point at which a booked showcase stops being a commitment and becomes a
 * world fact — reached by the same argument that turned `battles` from a
 * projection into a system. A night has participants, terms and consequences,
 * and none of those can be honestly re-derived on read once the world has moved
 * on: the promoter's terms were agreed months ago, the scene has changed, and
 * the record that was moving has stopped. So it is stored.
 *
 * **A row here means the night happened.** There is no `SCHEDULED` performance,
 * because the calendar already owns that fact and a second copy of it would let
 * "we agreed to this" and "this occurred" drift apart. Accepting a night writes
 * a `calendar_items` row and nothing else; only the clock reaching the night
 * writes one of these. That asymmetry is deliberate and load-bearing —
 * *"a career that accepted a night it has not reached has no performance
 * evidence of any kind"* is an invariant this table's existence enforces
 * structurally rather than by convention.
 *
 * **There is no score column.** Three named observable facts, each bounded by
 * the one above it, and no fourth number that already knew the answer. The
 * bounds are CHECK constraints rather than application promises, because
 * *"a night may never affect more people than were in the room"* is the rule
 * that stops this becoming a second reception simulator, and a rule that
 * important should be kept by the database.
 *
 * **The promoter is kept in full.** Identity and context both, because a night
 * is a legitimate source of relationship history with the person whose room it
 * was — and M6 has no non-studio relationship source yet. Recording everything
 * a later milestone would need is not the same as creating that relationship
 * here, and this milestone deliberately does not.
 */
export const performances = pgTable(
  "performances",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),

    /**
     * The offer this night was, and the reason one accepted offer can produce
     * exactly one night. Unique rather than merely indexed: "one payout, one
     * completion, one public event" is enforced here, at the point a second
     * resolution would have to insert a row, rather than trusted to a guard.
     */
    opportunityId: text("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    /** The commitment it discharged. Null only if the booking was removed. */
    calendarItemId: text("calendar_item_id").references(() => calendarItems.id, {
      onDelete: "set null",
    }),
    sceneId: text("scene_id").references(() => scenes.id, { onDelete: "set null" }),

    /* --- Whose room it was, as recorded when the terms were agreed --------- */
    promoterCharacterId: text("promoter_character_id").references(() => characters.id, {
      onDelete: "set null",
    }),
    /** Denormalised on purpose: the night should stay explicable if they leave. */
    promoterName: text("promoter_name"),
    nightName: text("night_name"),
    sceneSlug: text("scene_slug"),
    termsLine: text("terms_line"),

    /** Carrying the night or opening it. Different rooms, different numbers. */
    billing: text("billing").$type<ShowcaseBilling>().notNull(),
    /** The promoter's room. The ceiling on everything below. */
    capacity: integer("capacity").notNull(),

    /* --- The three facts -------------------------------------------------- */
    /** People who were in the room. `<= capacity`, kept by the database. */
    attendance: integer("attendance").notNull().default(0),
    /** Of those, how many left caring more. `<= attendance`. */
    wonOver: integer("won_over").notNull().default(0),
    /** Of those, how many told somebody who was not there. `<= won_over`. */
    wordLeftTheRoom: integer("word_left_the_room").notNull().default(0),

    /** Which recorded input contributed what, to each fact. The versioned half. */
    derivation: jsonb("derivation").$type<PerformanceDerivation[]>().notNull().default([]),

    /* --- What the night was worth, and what it did ------------------------ */
    /**
     * The fee, exactly as agreed when the offer was accepted.
     *
     * Stored beside the ledger row rather than instead of it. `transactions` is
     * the money; this is what the night's terms *were*, which stays true even
     * if the credit is inspected years later against a balance that has moved.
     */
    feeMinor: bigint("fee_minor", { mode: "number" }).notNull().default(0),
    /** The ledger row the fee became. The audit trail, in one hop. */
    transactionId: text("transaction_id"),

    /**
     * Fame / Respect / Heat movement and the audience it touched, decomposed.
     *
     * The same shape `battles.consequences` holds: named contributions with the
     * facts that caused them. Legacy is absent, and there is no term that could
     * produce one.
     */
    consequences: jsonb("consequences").$type<Record<string, unknown>>().notNull().default({}),

    /* --- Replay ----------------------------------------------------------- */
    /** Which engine, and the seed it decided from. Replay needs both. */
    simulatorVersion: text("simulator_version"),
    seed: text("seed"),
    /** How much was moving around this artist on the night. Recorded, not re-read. */
    momentum: real("momentum").notNull().default(0),
    /** How well the scene knew the name on the night, through `sceneStanding`. */
    sceneStandingValue: real("scene_standing_value").notNull().default(0),

    /**
     * One state, because only one is ever observable.
     *
     * A row is inserted resolved and stays resolved. There is no `SCHEDULED`
     * (the calendar owns what was agreed to) and no `PERFORMED` — the whole
     * night commits in a single transaction, so nothing could ever read one
     * half-priced, and an enum value nothing can see is a claim the schema
     * cannot keep. The two-step shape that is real lives in the event log.
     */
    status: text("status").$type<PerformanceStatus>().notNull().default("RESOLVED"),
    /** In-world: the night the clock reached. Not when the row was written. */
    occurredAtGameTime: timestamp("occurred_at_game_time", { withTimezone: true }).notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    opportunityIdx: uniqueIndex("performances_opportunity_key").on(table.opportunityId),
    careerIdx: index("performances_career_idx").on(table.careerId, table.occurredAtGameTime),
  }),
);

export type PerformanceRow = typeof performances.$inferSelect;
