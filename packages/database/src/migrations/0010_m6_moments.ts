/**
 * M6 — Relationship moments.
 *
 * A moment is an invitation to a decision, not the decision's consequence.
 * "LEX wants to talk" surfaces because the state between two people crossed a
 * condition; it changes nothing on its own and waits for an answer.
 *
 * Persisted the instant it surfaces, along with the state that produced it.
 * This is the whole point of the table: a moment computed at read time would be
 * rerolled by a refresh, and relationship gameplay that flickers depending on
 * when you looked at it is not gameplay. `trigger_state` is kept so World
 * Control can say why this appeared, months later, under a newer engine.
 *
 * One open moment per person at a time — a screen listing three unresolved
 * things from the same producer is noise, not drama.
 */
export const migration0010M6Moments = {
  id: "0010_m6_moments",
  sql: /* sql */ `
CREATE TABLE IF NOT EXISTS relationship_moments (
  id             text PRIMARY KEY,
  career_id      text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id       text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  subject_type   text NOT NULL CHECK (subject_type IN ('CHARACTER','ARTIST','GROUP')),
  subject_id     text NOT NULL,
  kind           text NOT NULL
                 CHECK (kind IN ('WANTS_TO_TALK','GONE_QUIET','WANTS_ANOTHER_SESSION')),
  status         text NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN','RESOLVED','EXPIRED')),
  /* The relationship as it stood when this surfaced. Never recomputed. */
  trigger_state  jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* Which condition fired, in words. */
  trigger_reason text NOT NULL,
  /* Where the history stood, so the moment can be placed in the timeline. */
  triggered_at_sequence bigint NOT NULL DEFAULT 0,
  engine_version text NOT NULL,
  response       text,
  surfaced_at_game_time timestamptz NOT NULL,
  resolved_at_game_time timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
/* At most one unresolved thing per person. */
CREATE UNIQUE INDEX IF NOT EXISTS relationship_moments_open_key
  ON relationship_moments (career_id, subject_type, subject_id)
  WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS relationship_moments_career_idx
  ON relationship_moments (career_id, status);
`,
};
