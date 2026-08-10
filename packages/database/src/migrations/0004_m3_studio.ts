/**
 * M3 — Studio.
 *
 * The creative process as durable state:
 *
 * - `creative_sessions` — a session is a real thing with a state machine, not a
 *   modal. It survives leaving the page.
 * - `creative_session_participants` — who was in the room. A group career
 *   credits the Group *and* the player's own artist; flattening that would lose
 *   attribution the moment a member leaves.
 * - `creative_decisions` — the append-only record of what was chosen, rejected
 *   and combined. This is the part a player remembers, so it is the part we
 *   never overwrite.
 * - `music_briefs` — the structured brief a version was made from. Revisions
 *   create a new brief rather than editing one.
 * - `track_versions` — immutable. Version 1 still exists after version 2.
 *
 * `tracks` and `generation_jobs` are extended, not replaced.
 */
export const migration0004M3Studio = {
  id: "0004_m3_studio",
  sql: /* sql */ `
CREATE TABLE IF NOT EXISTS creative_sessions (
  id                text PRIMARY KEY,
  career_id         text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id          text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  track_id          text,
  purpose           text NOT NULL DEFAULT 'TRACK'
                    CHECK (purpose IN ('TRACK','BATTLE','FREESTYLE','PROJECT','COLLAB')),
  status            text NOT NULL DEFAULT 'SCHEDULED'
                    CHECK (status IN ('SCHEDULED','ACTIVE','AWAITING_DIRECTION','AWAITING_INTERPRETATION',
                                      'AWAITING_DECISION','CREATING_VERSION','REVIEW','MASTERING',
                                      'COMPLETED','CANCELLED')),
  creative_direction jsonb,
  proposals          jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposal_round     integer NOT NULL DEFAULT 0,
  cost_minor         bigint NOT NULL DEFAULT 0,
  transaction_id     text,
  scheduled_game_time timestamptz,
  started_at        timestamptz,
  ended_at          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creative_sessions_career_idx ON creative_sessions (career_id, status);

CREATE TABLE IF NOT EXISTS creative_session_participants (
  id           text PRIMARY KEY,
  session_id   text NOT NULL REFERENCES creative_sessions(id) ON DELETE CASCADE,
  entity_type  text NOT NULL CHECK (entity_type IN ('ARTIST','GROUP','CHARACTER')),
  entity_id    text NOT NULL,
  role         text NOT NULL CHECK (role IN ('PRIMARY_ARTIST','GROUP','PRODUCER')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS creative_session_participants_key
  ON creative_session_participants (session_id, entity_type, entity_id, role);

CREATE TABLE IF NOT EXISTS creative_decisions (
  id                  text PRIMARY KEY,
  session_id          text NOT NULL REFERENCES creative_sessions(id) ON DELETE CASCADE,
  actor_type          text NOT NULL,
  actor_id            text,
  decision_type       text NOT NULL,
  payload             jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_proposal_id text,
  sequence            bigserial NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS creative_decisions_session_idx ON creative_decisions (session_id, sequence);

CREATE TABLE IF NOT EXISTS music_briefs (
  id              text PRIMARY KEY,
  session_id      text NOT NULL REFERENCES creative_sessions(id) ON DELETE CASCADE,
  track_id        text,
  revision_of_id  text,
  purpose         text NOT NULL,
  intention       text NOT NULL,
  mood            jsonb NOT NULL DEFAULT '[]'::jsonb,
  energy          integer NOT NULL DEFAULT 50,
  risk            integer NOT NULL DEFAULT 50,
  audience        text NOT NULL,
  sound_direction jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject         text,
  structure       text,
  /* What the producer made of it: their stance, their reading, their words. */
  interpretation  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS music_briefs_session_idx ON music_briefs (session_id);

CREATE TABLE IF NOT EXISTS track_versions (
  id                 text PRIMARY KEY,
  track_id           text NOT NULL,
  session_id         text REFERENCES creative_sessions(id) ON DELETE SET NULL,
  version_number     integer NOT NULL,
  music_brief_id     text REFERENCES music_briefs(id) ON DELETE SET NULL,
  working_title      text,
  /* Structured, deterministic representation of the work. Never real audio. */
  content            jsonb NOT NULL DEFAULT '{}'::jsonb,
  lyrics_text        text,
  audio_asset_id     text,
  quality_metrics    jsonb NOT NULL DEFAULT '{}'::jsonb,
  sound_profile      jsonb,
  generation_job_id  text,
  is_master          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS track_versions_track_number_key ON track_versions (track_id, version_number);
CREATE INDEX IF NOT EXISTS track_versions_track_idx ON track_versions (track_id);

/* --- Extend the M1.1 track spine ---------------------------------------- */

ALTER TABLE tracks ADD COLUMN IF NOT EXISTS primary_artist_id text;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'TRACK';
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS current_master_version_id text;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE tracks ALTER COLUMN title DROP NOT NULL;

/*
 * The M1.1 spine used DRAFT/RELEASED/SHELVED, which predates the creative
 * lifecycle. Map the old values onto the real ones; nothing writes tracks yet,
 * so this is a rename rather than a data migration.
 */
UPDATE tracks SET status = 'IDEA' WHERE status = 'DRAFT';
UPDATE tracks SET status = 'UNRELEASED' WHERE status = 'RELEASED';
UPDATE tracks SET status = 'SCRAPPED' WHERE status = 'SHELVED';

/* --- Extend generation jobs --------------------------------------------- */

ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS track_version_id text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'development';
CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_idempotency_key ON generation_jobs (idempotency_key);
CREATE INDEX IF NOT EXISTS generation_jobs_session_idx ON generation_jobs (session_id);

/* SUCCEEDED/RUNNING predate the real job state machine. */
UPDATE generation_jobs SET status = 'COMPLETE' WHERE status = 'SUCCEEDED';
UPDATE generation_jobs SET status = 'GENERATING' WHERE status = 'RUNNING';
`,
};
