/**
 * M2 — Career HQ.
 *
 * People, time, money and the first opportunity:
 *
 * - `characters` — NPCs as real world entities, not narrative props. Thabo and
 *   the producers live here and later systems (relationships, poaching, labels)
 *   read the same rows.
 * - `npc_conversations` / `npc_messages` — NPC messaging, deliberately separate
 *   from any future player-to-player messaging.
 * - `opportunities` — a small, first-purpose opportunity spine. This is not the
 *   mission system; it is what the mission system will later produce.
 * - `calendar_items` — the career exists in time.
 * - `transactions` — an auditable ledger. `careers.money_balance` remains the
 *   running balance, written in the same transaction as its ledger row, so a
 *   charge can never be half-applied.
 * - `career_memories` — one structured memory per significant moment, derived
 *   from canonical events. Not a retrieval engine.
 */
export const migration0003M2CareerHq = {
  id: "0003_m2_career_hq",
  sql: /* sql */ `
CREATE TABLE IF NOT EXISTS characters (
  id              text PRIMARY KEY,
  world_id        text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  slug            text NOT NULL,
  name            text NOT NULL,
  role            text NOT NULL,
  tier            text NOT NULL DEFAULT 'WORLD' CHECK (tier IN ('CORE','WORLD','BACKGROUND')),
  biography       text,
  /* Short line the character would actually say about themselves. */
  quote           text,
  origin          text,
  personality     jsonb NOT NULL DEFAULT '{}'::jsonb,
  motives         jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences     jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_goal    text,
  current_mood    text,
  status          text NOT NULL DEFAULT 'ACTIVE',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS characters_world_slug_key ON characters (world_id, slug);
CREATE INDEX IF NOT EXISTS characters_role_idx ON characters (role);

CREATE TABLE IF NOT EXISTS npc_conversations (
  id             text PRIMARY KEY,
  career_id      text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  character_id   text NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  last_message_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS npc_conversations_career_character_key
  ON npc_conversations (career_id, character_id);

CREATE TABLE IF NOT EXISTS npc_messages (
  id              text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES npc_conversations(id) ON DELETE CASCADE,
  sender_type     text NOT NULL CHECK (sender_type IN ('PLAYER','CHARACTER','SYSTEM_NARRATIVE')),
  content         text NOT NULL,
  source_event_id text,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS npc_messages_conversation_idx ON npc_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS opportunities (
  id                 text PRIMARY KEY,
  career_id          text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  type               text NOT NULL,
  source_entity_type text,
  source_entity_id   text,
  status             text NOT NULL DEFAULT 'AVAILABLE'
                     CHECK (status IN ('AVAILABLE','ACCEPTED','DECLINED','EXPIRED','RESOLVED')),
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  available_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  accepted_at        timestamptz,
  resolved_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS opportunities_career_status_idx ON opportunities (career_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_career_type_key
  ON opportunities (career_id, type);

CREATE TABLE IF NOT EXISTS calendar_items (
  id                  text PRIMARY KEY,
  career_id           text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  type                text NOT NULL
                      CHECK (type IN ('STUDIO','PERFORMANCE','RELEASE','MEETING','REHEARSAL','MEDIA','REST','OTHER')),
  title               text NOT NULL,
  description         text,
  start_game_time     timestamptz NOT NULL,
  end_game_time       timestamptz,
  related_entity_type text,
  related_entity_id   text,
  status              text NOT NULL DEFAULT 'SCHEDULED'
                      CHECK (status IN ('SCHEDULED','ACTIVE','COMPLETED','CANCELLED')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendar_items_career_start_idx ON calendar_items (career_id, start_game_time);
CREATE INDEX IF NOT EXISTS calendar_items_related_idx ON calendar_items (related_entity_type, related_entity_id);

/*
 * Money ledger. Every movement is a row; careers.money_balance is the running
 * total written in the same transaction. balance_after makes the ledger
 * self-checking, and idempotency_key makes a retried charge a no-op rather
 * than a second withdrawal.
 */
CREATE TABLE IF NOT EXISTS transactions (
  id                  text PRIMARY KEY,
  career_id           text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  category            text NOT NULL,
  direction           text NOT NULL CHECK (direction IN ('DEBIT','CREDIT')),
  /* Always positive; direction carries the sign. Integer minor units. */
  amount_minor        bigint NOT NULL CHECK (amount_minor >= 0),
  balance_after_minor bigint NOT NULL,
  description         text NOT NULL,
  related_entity_type text,
  related_entity_id   text,
  idempotency_key     text,
  occurred_at         timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key ON transactions (idempotency_key);
CREATE INDEX IF NOT EXISTS transactions_career_idx ON transactions (career_id, occurred_at);

CREATE TABLE IF NOT EXISTS career_memories (
  id                 text PRIMARY KEY,
  career_id          text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  kind               text NOT NULL,
  summary            text NOT NULL,
  /* Derived from the canonical event that caused it. */
  source_event_id    text,
  related_entity_type text,
  related_entity_id  text,
  importance         integer NOT NULL DEFAULT 50,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS career_memories_career_idx ON career_memories (career_id, occurred_at);
`,
};
