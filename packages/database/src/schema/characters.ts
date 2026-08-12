import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CharacterRole, CharacterTier } from "@music-rpg/shared";
import { careers } from "./career";
import { worlds } from "./world";

/**
 * People who are not the player.
 *
 * Characters are world entities, not narrative props: the producer a player
 * works with in Act I is the same row that later systems will give goals,
 * moods, grudges and prices. Personality, motives and preferences are stored as
 * JSON because the simulation reads them structurally — they are inputs to
 * deterministic engines, not decoration.
 */
export const characters = pgTable(
  "characters",
  {
    id: text("id").primaryKey(),
    worldId: text("world_id")
      .notNull()
      .references(() => worlds.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<CharacterRole>().notNull(),
    tier: text("tier").$type<CharacterTier>().notNull().default("WORLD"),
    biography: text("biography"),
    /** Something they would actually say. Shown on their card. */
    quote: text("quote"),
    origin: text("origin"),
    personality: jsonb("personality").$type<Record<string, number>>().notNull().default({}),
    motives: jsonb("motives").$type<Record<string, unknown>>().notNull().default({}),
    preferences: jsonb("preferences").$type<Record<string, unknown>>().notNull().default({}),
    currentGoal: text("current_goal"),
    currentMood: text("current_mood"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    worldSlugIdx: uniqueIndex("characters_world_slug_key").on(table.worldId, table.slug),
    roleIdx: index("characters_role_idx").on(table.role),
  }),
);

/**
 * NPC messaging.
 *
 * Deliberately its own pair of tables: player-to-player messaging is a
 * different product with different moderation, delivery and privacy rules, and
 * conflating them now would make both harder later.
 */
export const npcConversations = pgTable(
  "npc_conversations",
  {
    id: text("id").primaryKey(),
    careerId: text("career_id")
      .notNull()
      .references(() => careers.id, { onDelete: "cascade" }),
    characterId: text("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    careerCharacterIdx: uniqueIndex("npc_conversations_career_character_key").on(
      table.careerId,
      table.characterId,
    ),
  }),
);

export const npcMessages = pgTable(
  "npc_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => npcConversations.id, { onDelete: "cascade" }),
    senderType: text("sender_type")
      .$type<"PLAYER" | "CHARACTER" | "SYSTEM_NARRATIVE">()
      .notNull(),
    content: text("content").notNull(),
    /** The canonical event this message reports, when it reports one. */
    sourceEventId: text("source_event_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    /**
     * Identity for a message that reports a world fact, so telling somebody
     * about it twice is impossible.
     *
     * Needed because presentation is deliberately split from the fact it
     * presents: an offer's message is written outside the transaction that
     * created the offer, so a failed write is retried on a later day advance and
     * must not produce a second copy. Keyed per opportunity *and moment* — one
     * night is legitimately spoken about when it is offered, and again when it
     * is answered. Null for ordinary conversation, and nulls are distinct.
     */
    idempotencyKey: text("idempotency_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdx: index("npc_messages_conversation_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    idempotencyIdx: uniqueIndex("npc_messages_idempotency_key").on(table.idempotencyKey),
  }),
);

export type CharacterRow = typeof characters.$inferSelect;
export type NpcConversationRow = typeof npcConversations.$inferSelect;
export type NpcMessageRow = typeof npcMessages.$inferSelect;
