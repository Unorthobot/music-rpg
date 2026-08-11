/**
 * M6 — Crew.
 *
 * A standing arrangement, kept deliberately separate from the relationship it
 * grows out of. Working with somebody produces a relationship on its own;
 * nobody becomes crew without being asked, agreeing, and terms being recorded.
 *
 * That separation is what later systems need. Availability, compensation, who
 * turns up when the career gets bigger and who is merely somebody you once
 * booked are different questions, and a single "we have history" flag could not
 * answer any of them.
 *
 * Declines are kept rather than deleted. Being turned down is part of the
 * history between two people, and a row that vanished would let a player ask
 * again as though it never happened.
 */
export const migration0009M6Crew = {
  id: "0009_m6_crew",
  sql: /* sql */ `
CREATE TABLE IF NOT EXISTS crew_members (
  id            text PRIMARY KEY,
  career_id     text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id      text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  subject_type  text NOT NULL CHECK (subject_type IN ('CHARACTER','ARTIST','GROUP')),
  subject_id    text NOT NULL,
  /* Their part in the world, copied at the moment of joining. */
  role          text NOT NULL,
  status        text NOT NULL CHECK (status IN ('INVITED','ACTIVE','DECLINED','LEFT')),
  /* What was actually offered. Terms are part of the deal, so they are kept. */
  terms         jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* What they said, and the reasoning, for the inspector. */
  decision      jsonb NOT NULL DEFAULT '{}'::jsonb,
  asked_at_game_time   timestamptz,
  joined_at_game_time  timestamptz,
  left_at_game_time    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS crew_members_subject_key
  ON crew_members (career_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS crew_members_career_idx ON crew_members (career_id, status);
`,
};
