/**
 * M4 — Releases.
 *
 * The decision to put work into the world, kept strictly separate from the work
 * itself. A release points at a track (or later a project); it never copies one,
 * and nothing here can create a version.
 *
 * `projects` and `project_tracks` exist as entities from day one so that a
 * career with enough music can be offered an EP later without a migration —
 * but nothing in M4 opens that capability for a one-track career.
 */
export const migration0005M4Releases = {
  id: "0005_m4_releases",
  sql: /* sql */ `
CREATE TABLE IF NOT EXISTS projects (
  id          text PRIMARY KEY,
  career_id   text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id    text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('EP','MIXTAPE','ALBUM','COLLABORATIVE')),
  title       text,
  status      text NOT NULL DEFAULT 'DRAFT'
              CHECK (status IN ('DRAFT','IN_PROGRESS','COMPLETE','RELEASED','ABANDONED')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_career_idx ON projects (career_id, status);

CREATE TABLE IF NOT EXISTS project_tracks (
  id         text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  track_id   text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_tracks_key ON project_tracks (project_id, track_id);

/*
 * A release is a plan that becomes an event. It carries how the work goes out
 * (format, strategy, timing) and the modifiers the audience simulator will read
 * in M5 — recorded here, applied there, never both.
 */
CREATE TABLE IF NOT EXISTS releases (
  id                  text PRIMARY KEY,
  career_id           text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id            text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  track_id            text,
  project_id          text REFERENCES projects(id) ON DELETE CASCADE,
  format              text NOT NULL
                      CHECK (format IN ('LOOSE_TRACK','SINGLE','EP','MIXTAPE','ALBUM','COLLABORATIVE')),
  strategy            text NOT NULL DEFAULT 'DROP'
                      CHECK (strategy IN ('DROP','TEASE','PERFORM_FIRST','SEND_AROUND')),
  status              text NOT NULL DEFAULT 'PLANNED'
                      CHECK (status IN ('PLANNED','SCHEDULED','RELEASED','CANCELLED')),
  scheduled_game_time timestamptz,
  released_game_time  timestamptz,
  /* Strategy progress: teaser posted, performed, sent to whom. */
  strategy_state      jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* Read by M5's audience simulator. Nothing in M4 acts on these. */
  audience_modifiers  jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_minor          bigint NOT NULL DEFAULT 0,
  transaction_id      text,
  cancelled_reason    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  /* Exactly one subject. */
  CHECK ((track_id IS NOT NULL) <> (project_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS releases_career_idx ON releases (career_id, status);
CREATE INDEX IF NOT EXISTS releases_track_idx ON releases (track_id);
/* One live release per track: planning again returns the plan that exists. */
CREATE UNIQUE INDEX IF NOT EXISTS releases_track_live_key
  ON releases (track_id) WHERE status IN ('PLANNED','SCHEDULED');

/*
 * Keeping a track private is a decision the player made, not the absence of
 * one, so it is recorded on the track rather than inferred from silence.
 */
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS kept_private_at timestamptz;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS release_id text;
CREATE INDEX IF NOT EXISTS tracks_status_idx ON tracks (status);
`,
};
