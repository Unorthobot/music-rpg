/**
 * M8.5 — Live Performance Resolution.
 *
 * One table, and the reason it is only one is the milestone's argument. Every
 * input a night needs was already recorded when the offer was accepted — the
 * night, the room, the promoter, the billing, the fee — so this adds the place
 * the *outcome* goes and nothing else. The calendar, the opportunity, the
 * ledger, the pressure accrual and the audience all already exist and are
 * written through their own owners.
 *
 * **Numbering.** `0014` because this ships before M9; M9's unshipped
 * `0014_m9_come_up` renumbers to `0015` when it resumes.
 *
 * **What is deliberately not here.**
 *
 * - **No transaction-category constraint change.** `transactions.category` has
 *   been a bare `text` column since `0003` with no CHECK, so `PERFORMANCE_FEE`
 *   is a vocabulary addition in `shared` and needs no DDL. Adding a constraint
 *   now would be a different milestone's tightening, applied to four existing
 *   categories this one has no business ruling on.
 * - **No `calendar_items.type` change.** `PERFORMANCE` has been in the
 *   vocabulary since M2 and `acceptOpportunity` has been writing it since M7.
 *   The type was never the gap; resolving it was.
 * - **No score column, anywhere.** Three named facts with CHECK constraints
 *   bounding each by the one above it, and no column a total could arrive
 *   through. This is the one thing the schema must not be able to store.
 * - **No promoter relationship.** The night keeps full promoter identity so a
 *   later M6 milestone can consume it, but creating the first non-studio
 *   relationship source needs M6's interaction semantics and is not smuggled
 *   in here as a generic delta.
 * - **No Legacy.** No column, and no term that could produce one.
 */
export const migration0014M85LivePerformances = {
  id: "0014_m8_5_live_performances",
  sql: /* sql */ `
/*
 * --- A night that happened -------------------------------------------------
 *
 * A row here means the night occurred. There is deliberately no SCHEDULED
 * state: the calendar already records what was agreed to, and a second copy of
 * that fact would let "we agreed to this" and "this occurred" drift apart.
 * Accepting a night writes a calendar item and nothing else; only the clock
 * reaching the night writes one of these.
 *
 * That asymmetry is what makes "a career that accepted a night it has not
 * reached has no performance evidence of any kind" a structural property of
 * the schema rather than a promise the application makes.
 */
CREATE TABLE IF NOT EXISTS performances (
  id                     text PRIMARY KEY,
  career_id              text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,

  /*
   * One accepted offer produces exactly one night. UNIQUE rather than merely
   * indexed: "one payout, one completion, one public event" is enforced at the
   * point a second resolution would have to insert, rather than trusted to an
   * application guard that a concurrent advance could race.
   */
  opportunity_id         text NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  calendar_item_id       text REFERENCES calendar_items(id) ON DELETE SET NULL,
  scene_id               text REFERENCES scenes(id) ON DELETE SET NULL,

  /*
   * Whose room it was. The character reference may go null if they leave the
   * world; the denormalised copies stay, so a night remains explicable without
   * the person who booked it still existing.
   */
  promoter_character_id  text REFERENCES characters(id) ON DELETE SET NULL,
  promoter_name          text,
  night_name             text,
  scene_slug             text,
  terms_line             text,

  billing                text NOT NULL CHECK (billing IN ('HEADLINE','SUPPORT')),
  capacity               integer NOT NULL CHECK (capacity > 0),

  /*
   * --- The three facts ----------------------------------------------------
   *
   * Each bounded by the one above it, and the bounds are kept here rather than
   * in the resolver. "A night may never affect more people than were in the
   * room" is the rule that stops a live system becoming a second reception
   * simulator, and a rule that load-bearing belongs in the database.
   *
   * Nothing sums them. There is no fourth column, and a night that went badly
   * is a night with a low won_over rather than a night with a bad grade.
   */
  attendance             integer NOT NULL DEFAULT 0 CHECK (attendance >= 0),
  won_over               integer NOT NULL DEFAULT 0 CHECK (won_over >= 0),
  word_left_the_room     integer NOT NULL DEFAULT 0 CHECK (word_left_the_room >= 0),

  /* Which recorded input contributed what, to each fact. The versioned half. */
  derivation             jsonb NOT NULL DEFAULT '[]'::jsonb,

  /*
   * The fee, exactly as agreed when the offer was accepted. Stored beside the
   * ledger row rather than instead of it: transactions is the money, this is
   * what the terms were.
   */
  fee_minor              bigint NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  transaction_id         text,

  /* Standing movement and audience touched, decomposed. Never Legacy. */
  consequences           jsonb NOT NULL DEFAULT '{}'::jsonb,

  /* Replay needs both, and the world as it stood needs the two after them. */
  simulator_version      text,
  seed                   text,
  momentum               real NOT NULL DEFAULT 0,
  scene_standing_value   real NOT NULL DEFAULT 0,

  /*
   * One state, because only one is ever observable. A row exists for a night
   * that happened and is written resolved inside a single transaction; there is
   * no moment at which anything could read a half-priced night. The two-step
   * shape that is real lives in the event log, not here.
   */
  status                 text NOT NULL DEFAULT 'RESOLVED'
                           CHECK (status = 'RESOLVED'),
  /* In-world: the night the clock reached, not when the row was written. */
  occurred_at_game_time  timestamptz NOT NULL,
  performed_at           timestamptz,
  resolved_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  /*
   * The bounds, as the milestone states them:
   *
   *   attendance         <= the room's capacity
   *   won_over           <= attendance
   *   word_left_the_room <= won_over
   *
   * Named constraints so a violation says which invariant broke rather than
   * which column it happened to be on.
   */
  CONSTRAINT performances_attendance_within_capacity CHECK (attendance <= capacity),
  CONSTRAINT performances_won_over_within_attendance CHECK (won_over <= attendance),
  CONSTRAINT performances_word_within_won_over       CHECK (word_left_the_room <= won_over)
);

CREATE UNIQUE INDEX IF NOT EXISTS performances_opportunity_key
  ON performances (opportunity_id);
CREATE INDEX IF NOT EXISTS performances_career_idx
  ON performances (career_id, occurred_at_game_time);
`,
};
