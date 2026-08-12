/**
 * M7 — the player experience.
 *
 * One column, for one reason: communication has to be retryable without
 * inventing anything.
 *
 * The director creates an offer; a separate step tells the player about it in
 * the voice of the person offering. Those two must not share a transaction —
 * a conversation row that fails to write must never cost a promoter their night
 * — which means the messaging step can find itself running again over offers it
 * has already spoken about. Without an identity it would say the same thing
 * twice on every day advance.
 *
 * `npc_messages` had no such identity because until now every message was
 * written inside the transaction of the thing it reported, so retrying the
 * transaction retried the message with it. Presentation split from world fact is
 * exactly the case that assumption does not cover.
 *
 * The key is per opportunity *and moment* — `opportunity:{id}:OFFER`,
 * `:ACCEPTED`, `:EXPIRED` — because one offer is legitimately spoken about more
 * than once, and each thing that became true is said exactly once. Nulls are
 * distinct in a unique index, so every message written before this migration,
 * and every conversational message that has no world fact behind it, coexists
 * untouched.
 */
export const migration0012M7PlayerExperience = {
  id: "0012_m7_player_experience",
  sql: /* sql */ `
ALTER TABLE npc_messages
  ADD COLUMN IF NOT EXISTS idempotency_key text;

/*
 * Unique across the whole table rather than per conversation: the key already
 * names the opportunity, and an opportunity belongs to one career and one
 * source, so there is no second conversation the same moment could belong to.
 */
CREATE UNIQUE INDEX IF NOT EXISTS npc_messages_idempotency_key
  ON npc_messages (idempotency_key);
`,
};
