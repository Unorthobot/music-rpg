import {
  boolean,
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
  ArchetypeKey,
  ArtistStatus,
  ArtistType,
  GroupRole,
  PsychologyValues,
  SkillValues,
  SoundProfileValues,
  TraitKey,
} from "@music-rpg/shared";
import { worlds } from "./world";

/**
 * An Artist is a person in the fiction. Player artists, core NPCs and
 * procedurally generated candidates all live here so that every later system
 * (battles, collaborations, group churn) can treat them uniformly.
 */
export const artists = pgTable(
  "artists",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    stageName: text("stage_name").notNull(),
    slug: text("slug").notNull(),
    origin: text("origin"),
    biography: text("biography"),
    artistType: text("artist_type").$type<ArtistType>().notNull().default("PLAYER"),
    status: text("status").$type<ArtistStatus>().notNull().default("ACTIVE"),
    archetype: text("archetype").$type<ArchetypeKey>(),
    creativePhilosophy: text("creative_philosophy"),
    /** Palette / imagery direction. Kept as JSON until asset generation exists. */
    visualIdentity: jsonb("visual_identity").$type<Record<string, unknown>>(),
    currentGroupId: text("current_group_id"),
    /**
     * Set when a player wrote this artist — their own founding member, or a
     * bandmate they created rather than recruited from the world. Keeps
     * authored people distinguishable from seeded NPCs permanently.
     */
    authoredByCareerId: text("authored_by_career_id"),
    /** Role an NPC candidate would take in a group. Null for most player artists. */
    preferredRole: text("preferred_role").$type<GroupRole>(),
    fame: integer("fame").notNull().default(0),
    respect: integer("respect").notNull().default(0),
    heat: integer("heat").notNull().default(0),
    legacy: integer("legacy").notNull().default(0),
    /** Public profile routes exist from M1 but stay closed until this flips. */
    isPublic: boolean("is_public").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    worldSlugIdx: uniqueIndex("artists_world_slug_key").on(table.worldId, table.slug),
    worldIdx: index("artists_world_id_idx").on(table.worldId),
    groupIdx: index("artists_current_group_id_idx").on(table.currentGroupId),
    typeIdx: index("artists_artist_type_idx").on(table.artistType),
  }),
);

/** Craft ability, 0–100. Not all of it is surfaced to the player in M1. */
export const artistSkills = pgTable("artist_skills", {
  artistId: text("artist_id")
    .primaryKey()
    .references(() => artists.id, { onDelete: "cascade" }),
  lyricism: integer("lyricism").notNull().default(0),
  flow: integer("flow").notNull().default(0),
  melody: integer("melody").notNull().default(0),
  storytelling: integer("storytelling").notNull().default(0),
  performance: integer("performance").notNull().default(0),
  production: integer("production").notNull().default(0),
  experimentation: integer("experimentation").notNull().default(0),
  versatility: integer("versatility").notNull().default(0),
  battleIq: integer("battle_iq").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Hidden temperament, 0–100. Drives later NPC/group simulation. */
export const artistPsychology = pgTable("artist_psychology", {
  artistId: text("artist_id")
    .primaryKey()
    .references(() => artists.id, { onDelete: "cascade" }),
  confidence: integer("confidence").notNull().default(50),
  discipline: integer("discipline").notNull().default(50),
  ambition: integer("ambition").notNull().default(50),
  resilience: integer("resilience").notNull().default(50),
  ego: integer("ego").notNull().default(50),
  patience: integer("patience").notNull().default(50),
  adaptability: integer("adaptability").notNull().default(50),
  riskTolerance: integer("risk_tolerance").notNull().default(50),
  competitiveness: integer("competitiveness").notNull().default(50),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Reusable trait catalogue, seeded rather than hardcoded in the UI. */
export const traitDefinitions = pgTable("trait_definitions", {
  key: text("key").primaryKey().$type<TraitKey>(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const artistTraits = pgTable(
  "artist_traits",
  {
    id: text("id").primaryKey(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    traitKey: text("trait_key").$type<TraitKey>().notNull(),
    /** Where the trait came from — discovery inference, an event, staff action. */
    source: text("source").notNull().default("DISCOVERY"),
    strength: integer("strength").notNull().default(50),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    artistTraitIdx: uniqueIndex("artist_traits_artist_trait_key").on(table.artistId, table.traitKey),
    artistIdx: index("artist_traits_artist_id_idx").on(table.artistId),
  }),
);

/** Seeded archetype catalogue. Archetype describes identity; it never locks a class. */
export const archetypeDefinitions = pgTable("archetype_definitions", {
  key: text("key").primaryKey().$type<ArchetypeKey>(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull(),
  /** Sound axes this archetype leans toward; used to score discovery output. */
  soundBias: jsonb("sound_bias").$type<Partial<SoundProfileValues>>().notNull(),
  skillBias: jsonb("skill_bias").$type<Partial<SkillValues>>().notNull(),
  psychologyBias: jsonb("psychology_bias").$type<Partial<PsychologyValues>>().notNull(),
});

/**
 * Sound DNA as first-class data, owned polymorphically by an artist or a group.
 * Axes are continuous in [-1, 1]; the player never sees raw sliders in M1.
 */
export const soundProfiles = pgTable(
  "sound_profiles",
  {
    id: text("id").primaryKey(),
    ownerType: text("owner_type").$type<"ARTIST" | "GROUP">().notNull(),
    ownerId: text("owner_id").notNull(),
    darkBright: real("dark_bright").notNull().default(0),
    rawPolished: real("raw_polished").notNull().default(0),
    minimalDense: real("minimal_dense").notNull().default(0),
    organicElectronic: real("organic_electronic").notNull().default(0),
    classicFuturistic: real("classic_futuristic").notNull().default(0),
    accessibleExperimental: real("accessible_experimental").notNull().default(0),
    melodicRhythmic: real("melodic_rhythmic").notNull().default(0),
    intimateAnthemic: real("intimate_anthemic").notNull().default(0),
    /** Human-readable summary derived from the axes. */
    summary: text("summary"),
    /** Provenance: which inference version and which answers produced this. */
    derivedFrom: jsonb("derived_from").$type<Record<string, unknown>>(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIdx: uniqueIndex("sound_profiles_owner_key").on(table.ownerType, table.ownerId),
  }),
);

export type ArtistRow = typeof artists.$inferSelect;
export type NewArtistRow = typeof artists.$inferInsert;
export type ArtistSkillsRow = typeof artistSkills.$inferSelect;
export type ArtistPsychologyRow = typeof artistPsychology.$inferSelect;
export type ArtistTraitRow = typeof artistTraits.$inferSelect;
export type SoundProfileRow = typeof soundProfiles.$inferSelect;
export type ArchetypeDefinitionRow = typeof archetypeDefinitions.$inferSelect;
export type TraitDefinitionRow = typeof traitDefinitions.$inferSelect;
