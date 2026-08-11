/**
 * M6 — Crew & Relationships.
 *
 * What the people around you make of what you are doing.
 *
 * One table, because the dimensions are person-to-person and mean the same
 * thing about a producer, a bandmate or a rival. The subject is polymorphic —
 * the same convention `tracks` and `sound_profiles` already use — so rivals and
 * members join without a migration. Group membership keeps its own four
 * columns where they are: influence, satisfaction, commitment and solo
 * ambition describe standing with the band as an institution, which is not the
 * same question as what one person thinks of another.
 *
 * `derived_through_sequence` is the whole of the third bounding rule. A career
 * that predates this milestone is reconstructed by folding every creative
 * decision it ever made; afterwards the same fold resumes from the watermark
 * and consumes only what is new. Reconstructibility without a read path that
 * gets slower every session the player plays.
 */
export const migration0008M6Relationships = {
  id: "0008_m6_relationships",
  sql: /* sql */ `
CREATE TABLE IF NOT EXISTS relationships (
  id                 text PRIMARY KEY,
  career_id          text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id           text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  subject_type       text NOT NULL CHECK (subject_type IN ('CHARACTER','ARTIST','GROUP')),
  subject_id         text NOT NULL,
  kind               text NOT NULL DEFAULT 'CONTACT'
                     CHECK (kind IN ('CREATIVE_PARTNER','CONTACT','BANDMATE','RIVAL')),

  /*
   * 0-100, real. The player is never shown a number; the fractions are kept
   * because a single session moves some of these by less than a point, and
   * rounding that away each time would mean nothing ever accumulates.
   *
   * Longitudinal by nature: one session cannot buy either of these.
   */
  familiarity        real NOT NULL DEFAULT 0 CHECK (familiarity BETWEEN 0 AND 100),
  loyalty            real NOT NULL DEFAULT 0 CHECK (loyalty BETWEEN 0 AND 100),

  respect            real NOT NULL DEFAULT 0 CHECK (respect BETWEEN 0 AND 100),
  trust              real NOT NULL DEFAULT 0 CHECK (trust BETWEEN 0 AND 100),
  creative_chemistry real NOT NULL DEFAULT 0 CHECK (creative_chemistry BETWEEN 0 AND 100),
  /*
   * Not a penalty, and not the inverse of trust. A relationship can be
   * high-trust, high-respect, high-chemistry and high-tension at once — that
   * is where the interesting creative partnerships live.
   */
  tension            real NOT NULL DEFAULT 0 CHECK (tension BETWEEN 0 AND 100),
  rivalry            real NOT NULL DEFAULT 0 CHECK (rivalry BETWEEN 0 AND 100),

  /* How many things have actually passed between these two. */
  interaction_count  integer NOT NULL DEFAULT 0 CHECK (interaction_count >= 0),
  /* High-water mark in the career's canonical history. */
  derived_through_sequence bigint NOT NULL DEFAULT 0,
  engine_version     text NOT NULL,
  first_met_at       timestamptz,
  last_interaction_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS relationships_subject_key
  ON relationships (career_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS relationships_career_idx ON relationships (career_id, kind);
`,
};
