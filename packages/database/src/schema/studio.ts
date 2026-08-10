import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  CreativeDecisionType,
  CreativeSessionPurpose,
  CreativeSessionStatus,
  MusicBriefShape,
  ProducerProposal,
  SessionParticipantRole,
  SoundProfileValues,
  TrackVersionContent,
} from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * A session in the studio.
 *
 * State, not a modal: a player can leave in the middle of one and come back to
 * the same room. `status` is a strict machine — commands refuse impossible
 * transitions rather than trusting the interface to hide the buttons.
 */
export const creativeSessions = pgTable(
  "creative_sessions",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    trackId: text("track_id"),
    purpose: text("purpose").$type<CreativeSessionPurpose>().notNull().default("TRACK"),
    status: text("status").$type<CreativeSessionStatus>().notNull().default("SCHEDULED"),
    /** What the player asked for, verbatim and structured. */
    creativeDirection: jsonb("creative_direction").$type<Record<string, unknown>>(),
    /** The producer's current proposals, regenerated on rejection. */
    proposals: jsonb("proposals").$type<ProducerProposal[]>().notNull().default([]),
    proposalRound: integer("proposal_round").notNull().default(0),
    costMinor: bigint("cost_minor", { mode: "number" }).notNull().default(0),
    /** The charge that paid for this session, for audit. */
    transactionId: text("transaction_id"),
    scheduledGameTime: timestamp("scheduled_game_time", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerIdx: index("creative_sessions_career_idx").on(table.careerId, table.status),
  }),
);

/**
 * Who was in the room.
 *
 * A group career credits the Group and the player's own artist separately, so
 * attribution survives a member leaving or the group dissolving.
 */
export const creativeSessionParticipants = pgTable(
  "creative_session_participants",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => creativeSessions.id, { onDelete: "cascade" }),
    entityType: text("entity_type").$type<"ARTIST" | "GROUP" | "CHARACTER">().notNull(),
    entityId: text("entity_id").notNull(),
    role: text("role").$type<SessionParticipantRole>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueIdx: uniqueIndex("creative_session_participants_key").on(
      table.sessionId,
      table.entityType,
      table.entityId,
      table.role,
    ),
  }),
);

/**
 * Every choice made in the room, in order, forever.
 *
 * This is the memory of the process — what was offered, what was refused, what
 * was combined. Nothing here is ever updated.
 */
export const creativeDecisions = pgTable(
  "creative_decisions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => creativeSessions.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    decisionType: text("decision_type").$type<CreativeDecisionType>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    relatedProposalId: text("related_proposal_id"),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("creative_decisions_session_idx").on(table.sessionId, table.sequence),
  }),
);

/**
 * The brief a version was made from.
 *
 * Derived from the player's identity, their Sound DNA, the producer, the
 * direction they gave and where their career is. A revision writes a new brief
 * pointing at the one it revised — briefs are never edited.
 */
export const musicBriefs = pgTable(
  "music_briefs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => creativeSessions.id, { onDelete: "cascade" }),
    trackId: text("track_id"),
    revisionOfId: text("revision_of_id"),
    purpose: text("purpose").notNull(),
    intention: text("intention").notNull(),
    mood: jsonb("mood").$type<string[]>().notNull().default([]),
    energy: integer("energy").notNull().default(50),
    risk: integer("risk").notNull().default(50),
    audience: text("audience").notNull(),
    soundDirection: jsonb("sound_direction").$type<Partial<SoundProfileValues>>().notNull().default({}),
    subject: text("subject"),
    structure: text("structure"),
    interpretation: jsonb("interpretation").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("music_briefs_session_idx").on(table.sessionId),
  }),
);

/**
 * An immutable take.
 *
 * Version 2 never replaces version 1 — both stay inspectable, which is what
 * makes "make it darker" a decision with a history rather than an edit.
 */
export const trackVersions = pgTable(
  "track_versions",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id").notNull(),
    sessionId: text("session_id").references(() => creativeSessions.id, { onDelete: "set null" }),
    versionNumber: integer("version_number").notNull(),
    musicBriefId: text("music_brief_id").references(() => musicBriefs.id, { onDelete: "set null" }),
    workingTitle: text("working_title"),
    /** Structured, deterministic work description. Never real audio. */
    content: jsonb("content").$type<TrackVersionContent>().notNull().default({} as TrackVersionContent),
    lyricsText: text("lyrics_text"),
    audioAssetId: text("audio_asset_id"),
    qualityMetrics: jsonb("quality_metrics").$type<Record<string, number>>().notNull().default({}),
    soundProfile: jsonb("sound_profile").$type<SoundProfileValues>(),
    generationJobId: text("generation_job_id"),
    isMaster: boolean("is_master").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    trackNumberIdx: uniqueIndex("track_versions_track_number_key").on(
      table.trackId,
      table.versionNumber,
    ),
    trackIdx: index("track_versions_track_idx").on(table.trackId),
  }),
);

export type CreativeSessionRow = typeof creativeSessions.$inferSelect;
export type CreativeSessionParticipantRow = typeof creativeSessionParticipants.$inferSelect;
export type CreativeDecisionRow = typeof creativeDecisions.$inferSelect;
export type MusicBriefRow = typeof musicBriefs.$inferSelect;
export type TrackVersionRow = typeof trackVersions.$inferSelect;
export type { MusicBriefShape };
