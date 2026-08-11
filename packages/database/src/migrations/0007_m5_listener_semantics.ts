/**
 * M5 — one word for one thing.
 *
 * `release_performance.unique_listeners` and `release_cohort_performance.
 * listeners` were the same measure under two names, and the totals table is the
 * sum of the cohort table. From M5 the number reaches players, so the two
 * columns now read identically:
 *
 *   unique_listeners — every distinct person who has played this record, ever,
 *   counted once each. Not plays, not a daily figure, not a window.
 *
 * Appended rather than folded into 0006, which has been tagged: a migration
 * that has been recorded anywhere is never edited, only followed.
 */
export const migration0007M5ListenerSemantics = {
  id: "0007_m5_listener_semantics",
  sql: /* sql */ `
/*
 * Guarded like every other migration here, so re-running against a database
 * that has already been renamed is a no-op rather than an error. Postgres
 * rewrites the CHECK constraints that reference the column on its own.
 */
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'release_cohort_performance' AND column_name = 'listeners'
  ) THEN
    ALTER TABLE release_cohort_performance RENAME COLUMN listeners TO unique_listeners;
  END IF;
END $$;
`,
};
