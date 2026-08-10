import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  CareerAct,
  CareerStatus,
  CareerType,
  ControlledEntityType,
  OnboardingState,
} from "@music-rpg/shared";
import { users } from "./identity";
import { scenes, worlds } from "./world";

/**
 * A Career is the player's run inside a world. It is distinct from the User
 * (the human) and from the controlled entity (the fiction). Fame / Respect /
 * Heat / Legacy are four independent currencies and must never be collapsed
 * into a single score.
 */
export const careers = pgTable(
  "careers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").$type<CareerStatus>().notNull().default("ONBOARDING"),
    careerAct: text("career_act").$type<CareerAct>().notNull().default("UNDERGROUND"),
    /** Which onboarding path the player chose. Persisted the moment it is picked. */
    careerType: text("career_type").$type<CareerType>(),
    /**
     * Polymorphic pointer rather than two nullable FKs: later acts add
     * controlled entity types (labels, collectives) without a migration.
     */
    controlledEntityType: text("controlled_entity_type").$type<ControlledEntityType>(),
    controlledEntityId: text("controlled_entity_id"),
    onboardingState: text("onboarding_state")
      .$type<OnboardingState>()
      .notNull()
      .default("CAREER_TYPE"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    currentGameDate: timestamp("current_game_date", { withTimezone: true }).notNull(),
    fame: integer("fame").notNull().default(0),
    respect: integer("respect").notNull().default(0),
    heat: integer("heat").notNull().default(0),
    legacy: integer("legacy").notNull().default(0),
    /** Integer minor units (cents). Never store money as a float. */
    moneyBalance: bigint("money_balance", { mode: "number" }).notNull().default(0),
    primarySceneId: text("primary_scene_id").references(() => scenes.id, { onDelete: "set null" }),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /**
     * One career per user per world. This is what makes CreateCareer idempotent
     * under double-submit and back-button retries.
     */
    userWorldIdx: uniqueIndex("careers_user_world_key").on(table.userId, table.worldId),
    userIdx: index("careers_user_id_idx").on(table.userId),
    worldIdx: index("careers_world_id_idx").on(table.worldId),
  }),
);

export type CareerRow = typeof careers.$inferSelect;
export type NewCareerRow = typeof careers.$inferInsert;
