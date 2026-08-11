/**
 * M5 — Reception & Audience Simulation.
 *
 * What happens after a record is out. The shape of this milestone is one
 * distinction repeated in the schema:
 *
 * - `audience_cohorts` belong to the **world**. A cohort exists whether or not
 *   any particular artist has ever reached it, and two careers releasing into
 *   Johannesburg address the same populations.
 * - `artist_audience` is the **affinity** a cohort holds toward one artist or
 *   group. Listeners are transient; this is what persists.
 * - `release_performance` / `release_cohort_performance` are what one record
 *   did, in total and per cohort. Cohort rows always reconcile with the total.
 * - `reception_ticks` is the ledger of simulation runs. The unique key on
 *   (release, day) is what makes a tick impossible to apply twice.
 * - `career_metric_pressure` accrues Fame / Respect / Heat as reals. The career
 *   columns are integers, and an Underground first single moves them by
 *   fractions — without accrual the honest answer would round to nothing
 *   forever. There is deliberately **no legacy column**: Legacy cannot move in
 *   M5 because there is nowhere for it to accumulate.
 */
export const migration0006M5Reception = {
  id: "0006_m5_reception",
  sql: /* sql */ `
/*
 * Audiences are world population, not career state.
 * size is the addressable population — the ceiling on how many people in this
 * cohort a single release can ever reach.
 */
CREATE TABLE IF NOT EXISTS audience_cohorts (
  id                    text PRIMARY KEY,
  world_id              text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  slug                  text NOT NULL,
  name                  text NOT NULL,
  description           text NOT NULL,
  size                  integer NOT NULL DEFAULT 0 CHECK (size >= 0),
  /* What this cohort listens for: preferred sound region and what it weighs. */
  preferences           jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* How it behaves: discovery, attention, conversion resistance, sharing. */
  behavioural_weights   jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* Where in the world it is concentrated, by scene slug. */
  scene_affinity        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audience_cohorts_world_slug_key
  ON audience_cohorts (world_id, slug);

/*
 * A cohort's standing relationship with one artist or group.
 *
 * Polymorphic owner, like tracks and sound_profiles: a group career's
 * audience belongs to the Group, and career_id is carried alongside so the
 * projection can be read career-first without a join through the entity.
 *
 * fans is persistent affinity. It is never a copy of a listener count.
 */
CREATE TABLE IF NOT EXISTS artist_audience (
  id                  text PRIMARY KEY,
  cohort_id           text NOT NULL REFERENCES audience_cohorts(id) ON DELETE CASCADE,
  owner_type          text NOT NULL CHECK (owner_type IN ('ARTIST','GROUP')),
  owner_id            text NOT NULL,
  career_id           text REFERENCES careers(id) ON DELETE CASCADE,
  /* Persistent affinity. Fan tiers (casual/active/core/superfan) split this later. */
  fans                integer NOT NULL DEFAULT 0 CHECK (fans >= 0),
  /*
   * 0–1000: how warmly this cohort regards the artist, independent of any
   * release. Real rather than integer because it accumulates in fractions —
   * four engaged listeners out of ninety-four thousand is a real amount of
   * warmth, and rounding it away each day would mean a large cohort could
   * never warm to anyone at all.
   */
  affinity            real NOT NULL DEFAULT 0 CHECK (affinity >= 0 AND affinity <= 1000),
  /* 0–1000: how readily this cohort engages once it has listened. */
  engagement_tendency integer NOT NULL DEFAULT 0
                      CHECK (engagement_tendency >= 0 AND engagement_tendency <= 1000),
  /* 0–1000: what it now expects. Raised by strong work; unmet expectation costs later. */
  expectation         integer NOT NULL DEFAULT 0
                      CHECK (expectation >= 0 AND expectation <= 1000),
  /* Cumulative unique people in this cohort who have ever encountered the artist. */
  prior_exposure      integer NOT NULL DEFAULT 0 CHECK (prior_exposure >= 0),
  last_reached_game_time timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS artist_audience_owner_cohort_key
  ON artist_audience (cohort_id, owner_type, owner_id);
CREATE INDEX IF NOT EXISTS artist_audience_career_idx ON artist_audience (career_id);

/*
 * What one record did.
 *
 * Exposure is unique reach — the number of people given an opportunity to
 * encounter it — which is what makes "a cohort's population cannot be exceeded"
 * an enforceable invariant. Someone coming back is repeat_listeners, not
 * another exposure.
 *
 * simulator_version is persisted because the formulas will change and we must
 * never silently reinterpret a historical release with a newer model.
 */
CREATE TABLE IF NOT EXISTS release_performance (
  release_id             text PRIMARY KEY REFERENCES releases(id) ON DELETE CASCADE,
  career_id              text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id               text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  total_exposures        integer NOT NULL DEFAULT 0 CHECK (total_exposures >= 0),
  unique_listeners       integer NOT NULL DEFAULT 0 CHECK (unique_listeners >= 0),
  engaged_listeners      integer NOT NULL DEFAULT 0 CHECK (engaged_listeners >= 0),
  repeat_listeners       integer NOT NULL DEFAULT 0 CHECK (repeat_listeners >= 0),
  fan_conversions        integer NOT NULL DEFAULT 0 CHECK (fan_conversions >= 0),
  shares                 integer NOT NULL DEFAULT 0 CHECK (shares >= 0),
  /* Exposure this release's own word of mouth will create on the next tick. */
  word_of_mouth          integer NOT NULL DEFAULT 0 CHECK (word_of_mouth >= 0),
  /* 0–100 velocity around the record right now. Not a career stat, not Fame. */
  current_momentum       real NOT NULL DEFAULT 0,
  days_simulated         integer NOT NULL DEFAULT 0 CHECK (days_simulated >= 0),
  last_simulated_game_time timestamptz,
  simulation_seed        text NOT NULL,
  simulator_version      text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  /* Listening is a subset of exposure; engaging a subset of listening. */
  CHECK (unique_listeners <= total_exposures),
  CHECK (engaged_listeners <= unique_listeners),
  CHECK (repeat_listeners <= unique_listeners),
  CHECK (fan_conversions <= engaged_listeners)
);
CREATE INDEX IF NOT EXISTS release_performance_career_idx ON release_performance (career_id);

/*
 * The same record, per cohort. Scene heads and casual listeners answer
 * separately, and the totals above are the sum of these rows.
 */
CREATE TABLE IF NOT EXISTS release_cohort_performance (
  id                text PRIMARY KEY,
  release_id        text NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  cohort_id         text NOT NULL REFERENCES audience_cohorts(id) ON DELETE CASCADE,
  exposures         integer NOT NULL DEFAULT 0 CHECK (exposures >= 0),
  listeners         integer NOT NULL DEFAULT 0 CHECK (listeners >= 0),
  engaged_listeners integer NOT NULL DEFAULT 0 CHECK (engaged_listeners >= 0),
  repeat_listeners  integer NOT NULL DEFAULT 0 CHECK (repeat_listeners >= 0),
  fan_conversions   integer NOT NULL DEFAULT 0 CHECK (fan_conversions >= 0),
  shares            integer NOT NULL DEFAULT 0 CHECK (shares >= 0),
  word_of_mouth     integer NOT NULL DEFAULT 0 CHECK (word_of_mouth >= 0),
  /* The evaluation that produced the above: fit and its components. */
  evaluation        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (listeners <= exposures),
  CHECK (engaged_listeners <= listeners),
  CHECK (repeat_listeners <= listeners),
  CHECK (fan_conversions <= engaged_listeners)
);
CREATE UNIQUE INDEX IF NOT EXISTS release_cohort_performance_key
  ON release_cohort_performance (release_id, cohort_id);

/*
 * The ledger of simulation runs.
 *
 * The unique key is the idempotency guarantee: a day cannot be simulated twice
 * for a release, however many times the command is called or retried.
 */
CREATE TABLE IF NOT EXISTS reception_ticks (
  id                text PRIMARY KEY,
  release_id        text NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  career_id         text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  /* 1 = the first day the record is out. */
  day_index         integer NOT NULL CHECK (day_index >= 1),
  game_time         timestamptz NOT NULL,
  simulator_version text NOT NULL,
  simulation_seed   text NOT NULL,
  /* Inputs and results, kept explainable rather than dumped as a blob. */
  result            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS reception_ticks_release_day_key
  ON reception_ticks (release_id, day_index);
CREATE INDEX IF NOT EXISTS reception_ticks_career_idx ON reception_ticks (career_id, game_time);

/*
 * Fame / Respect / Heat as accrued pressure.
 *
 * The career columns stay integers — the player is never shown a fraction — but
 * reception produces fractional movement, and a first single that rounds to
 * zero forever would be a lie about a system that did work. The integer metric
 * is floor(accrued), so this table is the audit trail for every point.
 *
 * Legacy has no column here on purpose. It is a long-horizon measure and there
 * is nothing in M5 that may move it.
 */
CREATE TABLE IF NOT EXISTS career_metric_pressure (
  career_id       text PRIMARY KEY REFERENCES careers(id) ON DELETE CASCADE,
  fame_accrued    real NOT NULL DEFAULT 0 CHECK (fame_accrued >= 0),
  respect_accrued real NOT NULL DEFAULT 0 CHECK (respect_accrued >= 0),
  heat_accrued    real NOT NULL DEFAULT 0 CHECK (heat_accrued >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
`,
};
