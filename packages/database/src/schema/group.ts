import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ArchetypeKey,
  GroupMembershipStatus,
  GroupRole,
  GroupStatus,
} from "@music-rpg/shared";
import { artists } from "./artist";
import { worlds } from "./world";

/**
 * A Group is a creative unit made of Artists. It is NOT the Crew concept —
 * crew covers the wider career network (management, engineers, allies) and gets
 * its own tables in a later milestone.
 */
export const groups = pgTable(
  "groups",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    biography: text("biography"),
    /** Free-text creative direction captured during group onboarding. */
    creativeDirection: text("creative_direction"),
    /** The group's own words, from the free-text Sound Discovery question. */
    creativePhilosophy: text("creative_philosophy"),
    /** Set by Sound Discovery; groups have an archetype exactly like artists. */
    archetype: text("archetype").$type<ArchetypeKey>(),
    status: text("status").$type<GroupStatus>().notNull().default("FORMING"),
    fame: integer("fame").notNull().default(0),
    respect: integer("respect").notNull().default(0),
    heat: integer("heat").notNull().default(0),
    legacy: integer("legacy").notNull().default(0),
    moneyBalance: bigint("money_balance", { mode: "number" }).notNull().default(0),
    /**
     * Snapshot of member compatibility at formation. Real chemistry simulation
     * arrives later; the column exists now so it does not need backfilling.
     */
    chemistry: integer("chemistry").notNull().default(50),
    isPublic: boolean("is_public").notNull().default(false),
    foundedAt: timestamp("founded_at", { withTimezone: true }).notNull().defaultNow(),
    dissolvedAt: timestamp("dissolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    worldSlugIdx: uniqueIndex("groups_world_slug_key").on(table.worldId, table.slug),
    worldIdx: index("groups_world_id_idx").on(table.worldId),
  }),
);

/**
 * Membership carries the tension that later drives group simulation:
 * influence, satisfaction, commitment and solo ambition are persisted from day
 * one even though nothing reads them yet.
 */
export const groupMemberships = pgTable(
  "group_memberships",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    role: text("role").$type<GroupRole>().notNull().default("MULTI_ROLE"),
    influence: integer("influence").notNull().default(50),
    satisfaction: integer("satisfaction").notNull().default(50),
    commitment: integer("commitment").notNull().default(50),
    soloAmbition: integer("solo_ambition").notNull().default(50),
    /** The player-controlled artist inside a group career. */
    isFounder: boolean("is_founder").notNull().default(false),
    status: text("status").$type<GroupMembershipStatus>().notNull().default("ACTIVE"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => ({
    groupArtistIdx: uniqueIndex("group_memberships_group_artist_key").on(
      table.groupId,
      table.artistId,
    ),
    groupIdx: index("group_memberships_group_id_idx").on(table.groupId),
    artistIdx: index("group_memberships_artist_id_idx").on(table.artistId),
  }),
);

export type GroupRow = typeof groups.$inferSelect;
export type NewGroupRow = typeof groups.$inferInsert;
export type GroupMembershipRow = typeof groupMemberships.$inferSelect;
