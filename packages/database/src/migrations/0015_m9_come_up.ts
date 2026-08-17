/**
 * M9 — The Come Up.
 *
 * One table, and the argument for it is that "is this true now" and "has this
 * been true since" are different questions.
 *
 * Everything else the phase model reasons about is already persisted by
 * somebody else: fans and reception by M5, relationships, moments and crew by
 * M6, the promoters' own standards by the world seed, the public record by the
 * event log. The evidence is a pure fold over those and is deliberately stored
 * nowhere — it is idempotent, it returns the same answer whenever it runs, and
 * a second copy of it would be a second source of truth about reception.
 *
 * First-reached history is the exception, and it is the only one. A career cannot
 * transition because several families happen to be true for one instant, and
 * *how long they have been true* cannot be recovered from current state at any
 * price. So it is written down: one row per career, upserted on the day advance,
 * following `career_metric_pressure`'s precedent exactly — a per-career
 * accumulator, written by one step of one command, read by nothing that decides
 * anything else.
 *
 * **What is deliberately not here**, and each absence is load-bearing:
 *
 * - **No score, total, confidence or percentage column**, and no column that
 *   could become one. There is no progression number in M9 and no place for one
 *   to be stored. Five booleans and their watermarks is the entire state.
 * - **No new column on `careers`.** `career_act` already exists, is already
 *   causal through `ACT_REACH` and `availableFormats`, and is the phase. Adding
 *   a second opinion beside it would create the ambiguity the milestone exists
 *   to avoid.
 * - **No wall-clock column in the qualification path.** Every timestamp here is
 *   in-world, written from the career's own clock during an advance. A career
 *   left alone for a month of real time has not aged in world terms, and a
 *   model that re-derived from `now()` could not be replayed at all.
 * - **Nothing that writes Legacy.** `careers.legacy` has been immobile since M5
 *   by design and M9 introduces no pressure, no accrual and no column through
 *   which any could arrive. Coming up writes no legacy.
 */
export const migration0015M9ComeUp = {
  id: "0015_m9_come_up",
  sql: /* sql */ `
/*
 * --- The observation -------------------------------------------------------
 *
 * One row per career, keyed on the career itself rather than on a synthetic id,
 * exactly as career_metric_pressure and career_audience are. A four-hundred-day
 * career carries the same observation shape as a four-day one: this is an upsert,
 * never a log.
 *
 * The five family watermarks are real columns rather than a jsonb blob, for the
 * reason artist_skills is: they are a closed vocabulary, they are named in
 * shared/progression.ts before anything evaluates them, and a family that could
 * be added by writing a new key is a family nobody agreed to. If a sixth
 * evidence family is ever justified, it should cost a migration and a
 * conversation.
 *
 * Every column is nullable and null means one specific thing: this family is
 * currently false. A watermark is cleared the moment its family goes false and
 * there is nowhere for the old value to go — no banking, no resume, no paused
 * accumulator. The window starts again from the day it next holds.
 */
CREATE TABLE IF NOT EXISTS career_progression_observations (
  career_id                    text PRIMARY KEY
                               REFERENCES careers(id) ON DELETE CASCADE,

  /*
   * When each family first became true AND has been true continuously since.
   * In-world time, from the career's own clock during the advance that observed
   * it. Never now(), never created_at, never a server clock.
   */
  reception_first_reached_game_time      timestamptz,
  peer_first_reached_game_time           timestamptz,
  public_record_first_reached_game_time  timestamptz,

  /*
   * When breadth-and-anchor first held AND has held continuously since.
   *
   * Null whenever qualification is not currently met — including on the
   * evaluation where it lapses, which is what makes a break a reset. The
   * transition compares this against the career's current game date; nothing
   * compares it against anything else.
   */

  /* The game time of the most recent evaluation. Also in-world. */
  last_evaluated_game_time     timestamptz,

  /*
   * Which evaluator produced this. Rules change; history must not — the same
   * discipline release_performance.simulator_version and
   * relationships.engine_version already hold.
   */
  evaluator_version            text NOT NULL,

  /* Wall-clock, and deliberately outside the model: bookkeeping, not evidence. */
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);
`,
};
