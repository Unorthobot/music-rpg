/**
 * M7 — Missions & the Opportunity Director.
 *
 * The table this milestone needs was built in M2 and has been waiting since.
 * What it lacked was everything that makes an offer a world fact with a life of
 * its own, and three changes here are the substance of the milestone:
 *
 * 1. **The unique index on `(career_id, type)` goes.** It was correct for its
 *    one purpose — Thabo's introduction happening exactly once however many
 *    times Home was refreshed — but it made two live opportunities of the same
 *    kind impossible, and two promoters must be able to want you at once. The
 *    idempotency it was providing is re-established per *opportunity* rather
 *    than per type, keyed on the source and the trigger.
 * 2. **Expiry becomes real.** `expires_at` existed and was never written, and
 *    nothing ever became `EXPIRED`. The lifetime is now kept in game time, in
 *    its own columns, because the M2 pair are written with wall-clock `now()`
 *    and quietly redefining a shipped column's frame is how two surfaces end up
 *    disagreeing about when something lapsed.
 * 3. **The reasoning is kept with the fact.** The state an offer was generated
 *    from, which conditions passed, and what its score decomposed into, so that
 *    months later and under a newer director the inspector can still say why
 *    this appeared and why it outranked something else.
 *
 * `WITHDRAWN` is the one status M7 adds. When accepting one offer makes another
 * impossible, the second is not declined (the player never refused it), not
 * expired (no time passed) and not resolved (nothing happened) — so it is none
 * of the five, and collapsing it into any of them would lose the distinction
 * the whole conflict model exists to preserve.
 */
export const migration0011M7Opportunities = {
  id: "0011_m7_opportunities",
  sql: /* sql */ `
/*
 * Two promoters may independently want you. Type-level uniqueness cannot
 * survive that, and per-opportunity identity replaces it below.
 */
DROP INDEX IF EXISTS opportunities_career_type_key;

ALTER TABLE opportunities
  /* Same kind of fact either way. Recorded because the two debug differently. */
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'AUTHORED',
  /*
   * Per-opportunity identity: source + trigger, never the kind. This is what
   * makes repeated processing of the same day a no-op while leaving two
   * legitimately different offers of the same type free to coexist.
   */
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS scene_id text REFERENCES scenes(id) ON DELETE SET NULL,
  /* The world as it stood when this was generated. Never recomputed on read. */
  ADD COLUMN IF NOT EXISTS trigger_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS trigger_reason text,
  /* Which named conditions passed, with the values they were applied to. */
  ADD COLUMN IF NOT EXISTS eligibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* The score, decomposed. No opaque weight is ever stored on its own. */
  ADD COLUMN IF NOT EXISTS ranking jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS director_version text,
  /*
   * Game time, not wall-clock. The M2 columns above (available_at, expires_at)
   * are wall-clock and are left exactly as they are; the lifecycle reads only
   * these.
   */
  ADD COLUMN IF NOT EXISTS available_at_game_time timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_game_time timestamptz,
  ADD COLUMN IF NOT EXISTS generated_at_game_time timestamptz,
  /* Turning something down and letting it rot are different facts. Both kept. */
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  /* Why it became impossible. A conflict resolves honestly or not at all. */
  ADD COLUMN IF NOT EXISTS withdrawn_for_opportunity_id text;

ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_origin_check
  CHECK (origin IN ('AUTHORED','GENERATED'));

/* The five M2 statuses plus conflict-driven withdrawal. */
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_status_check;
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_status_check
  CHECK (status IN ('AVAILABLE','ACCEPTED','DECLINED','EXPIRED','RESOLVED','WITHDRAWN'));

/*
 * The replacement guarantee.
 *
 * Not partial, deliberately. Postgres treats nulls as distinct in a unique
 * index, so rows written before this migration — which have no key — never
 * collide with each other or with anything else, and a total index can still
 * serve as an ON CONFLICT arbiter. A partial one cannot without repeating its
 * predicate at every call site.
 */
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_identity_key
  ON opportunities (career_id, idempotency_key);

/* Expiry is a sweep over live offers whose game date has passed. */
CREATE INDEX IF NOT EXISTS opportunities_expiry_idx
  ON opportunities (career_id, expires_at_game_time)
  WHERE status = 'AVAILABLE';

/*
 * Conflict as an explicit relationship between two offers.
 *
 * Detecting that two things want the same night is the whole requirement. This
 * is not a scheduling economy and must not grow into one here: it exists so
 * that accepting one offer can resolve the other for a stated reason instead of
 * leaving a stale row lying around.
 */
CREATE TABLE IF NOT EXISTS opportunity_conflicts (
  id               text PRIMARY KEY,
  career_id        text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  /* Ordered by id at write time so the pair is stored exactly once. */
  opportunity_id   text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  other_opportunity_id text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('CALENDAR_SLOT','SAME_RESOURCE')),
  /* What they are competing for, in recorded values. */
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at_game_time timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (opportunity_id <> other_opportunity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_conflicts_pair_key
  ON opportunity_conflicts (opportunity_id, other_opportunity_id);
CREATE INDEX IF NOT EXISTS opportunity_conflicts_career_idx
  ON opportunity_conflicts (career_id);

/*
 * One row per run of the director.
 *
 * The reception_ticks shape, for the same two reasons. The unique key on
 * (career, game_time) is what makes a day impossible to direct twice, and the
 * trace holds the whole reasoning rather than only its outcome — including
 * candidates that were eligible and did not make the cap, which are the only
 * evidence that "something better came up" is a true answer rather than a
 * guess.
 */
CREATE TABLE IF NOT EXISTS opportunity_director_runs (
  id               text PRIMARY KEY,
  career_id        text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  world_id         text NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  game_time        timestamptz NOT NULL,
  director_version text NOT NULL,
  /* Candidates considered, eligibility, ranking, suppression, expiries. */
  trace            jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidates_considered integer NOT NULL DEFAULT 0,
  eligible_count   integer NOT NULL DEFAULT 0,
  created_count    integer NOT NULL DEFAULT 0,
  expired_count    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_director_runs_day_key
  ON opportunity_director_runs (career_id, game_time);
CREATE INDEX IF NOT EXISTS opportunity_director_runs_career_idx
  ON opportunity_director_runs (career_id, game_time);
`,
};
