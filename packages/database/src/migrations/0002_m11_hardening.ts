/**
 * M1.1 — foundation hardening.
 *
 * Adds the structures four systems in M2+ will populate, and the two columns
 * that make a group career belong to a person rather than to a committee:
 *
 * - `careers.player_artist_id` — the artist the player *is*, independent of the
 *   entity their career controls. Solo careers point at the same artist twice;
 *   group careers point at their founding member. This is what makes a future
 *   break-up "what do you do next?" instead of "which NPC would you like to be?".
 * - `artists.authored_by_career_id` — marks artists a player wrote, so authored
 *   bandmates are distinguishable from seeded world NPCs forever.
 * - `career_audience`, `tracks`, `battles` — real projections that currently
 *   resolve to zero, so Home reads "0 because the simulation says 0".
 */
export const migration0002M11Hardening = {
  id: "0002_m11_hardening",
  sql: /* sql */ `
ALTER TABLE careers ADD COLUMN IF NOT EXISTS player_artist_id text;
CREATE INDEX IF NOT EXISTS careers_player_artist_id_idx ON careers (player_artist_id);

ALTER TABLE artists ADD COLUMN IF NOT EXISTS authored_by_career_id text;
CREATE INDEX IF NOT EXISTS artists_authored_by_career_id_idx ON artists (authored_by_career_id);

/*
 * Audience projection. One row per career, created with the career itself, so
 * the counter on Home is a persisted value rather than a literal in a template.
 * Audience simulation (M2+) becomes the writer; nothing else changes.
 */
CREATE TABLE IF NOT EXISTS career_audience (
  career_id          text PRIMARY KEY REFERENCES careers(id) ON DELETE CASCADE,
  fans               integer NOT NULL DEFAULT 0,
  monthly_listeners  integer NOT NULL DEFAULT 0,
  reach              integer NOT NULL DEFAULT 0,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

/*
 * Catalogue and battle records. Deliberately minimal: enough for an honest
 * count today, and the milestone that introduces them owns their real shape.
 */
CREATE TABLE IF NOT EXISTS tracks (
  id          text PRIMARY KEY,
  world_id    text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  career_id   text REFERENCES careers(id) ON DELETE CASCADE,
  owner_type  text NOT NULL CHECK (owner_type IN ('ARTIST','GROUP')),
  owner_id    text NOT NULL,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'DRAFT',
  released_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracks_career_id_idx ON tracks (career_id);
CREATE INDEX IF NOT EXISTS tracks_owner_idx ON tracks (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS battles (
  id                text PRIMARY KEY,
  world_id          text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  career_id         text REFERENCES careers(id) ON DELETE CASCADE,
  challenger_id     text NOT NULL,
  opponent_id       text,
  status            text NOT NULL DEFAULT 'SCHEDULED',
  outcome           text,
  occurred_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battles_career_id_idx ON battles (career_id);

/* Backfill: every existing solo career already is its own player artist. */
UPDATE careers
   SET player_artist_id = controlled_entity_id
 WHERE controlled_entity_type = 'ARTIST'
   AND controlled_entity_id IS NOT NULL
   AND player_artist_id IS NULL;

/* Backfill: audience projections for careers created before this migration. */
INSERT INTO career_audience (career_id)
SELECT id FROM careers
ON CONFLICT (career_id) DO NOTHING;
`,
};
