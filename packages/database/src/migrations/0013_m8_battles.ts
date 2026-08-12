/**
 * M8 — Battles.
 *
 * Four changes, and the ordering of them is the milestone's argument.
 *
 * 1. **A character may also be an artist.** The world has kept two ontologies
 *    since M1 and both are right: `characters` are people the career deals with
 *    — they message you, they offer you things, they form an opinion of you —
 *    and `artists` are people who make music, with skills, psychology and a
 *    sound. Nobody needed to be both until now. `characters.artist_id` is that
 *    relation, and it is deliberately *not* a battle column: it says this person
 *    in the world is also an artist in the world, which is a fact a collaboration,
 *    a feature, a signing or a group recruitment will want long after M8. The
 *    first consumer does not get to name it.
 * 2. **A battle is a commitment.** `calendar_items.type` gains `BATTLE`, because
 *    a night you have agreed to is the calendar's business and M7 already
 *    established that accepting an offer books the thing it actually is.
 *    Preparation deliberately adds nothing: it books `REHEARSAL`, which has been
 *    in the vocabulary since M2 and means exactly what preparation is.
 * 3. **The `battles` stub becomes a battle.** What M7's `0011` did to
 *    `opportunities`: keep the row, add the lifetime, the reasoning and the
 *    identity. `challenger_id` and `opponent_id` have been bare `text` with no
 *    foreign keys since M1 hardening; they become real references here, which is
 *    the point at which "battle participants must exist" stops being a promise
 *    the application makes and becomes one the database keeps.
 * 4. **Judging is rows, not columns.** Three judges are M8's required panel, and
 *    a schema that encoded *three* would have to be migrated the first time a
 *    fourth perspective is worth having. One row per judge per battle, with a
 *    `panel_role` that separates the judges a result is derived from
 *    (`REQUIRED`) from ones that may later observe without deciding
 *    (`ADVISORY`). The canonical result still derives from the required panel;
 *    the shape simply stops asserting how large that panel is.
 *
 * **What is not here.** No battle score column, anywhere. The result is derived
 * from judge decisions that each keep their own decomposition, and a single
 * number that already knew the answer is the one thing this milestone must not
 * be able to store. There is also no Legacy movement and no column through which
 * any could arrive — the same discipline `career_metric_pressure` has held since
 * M5.
 */
export const migration0013M8Battles = {
  id: "0013_m8_battles",
  sql: /* sql */ `
/*
 * --- 1. A person in the world who is also an artist in the world ---------
 *
 * General, not battle-specific. Nullable because almost nobody is both: a
 * promoter is not an artist, and a group-member candidate is an artist nobody
 * has a social relationship with yet. Unique because the relation is one-to-one
 * in that direction — one artist has at most one social face — and Postgres
 * treats nulls as distinct, so every character who is not an artist coexists
 * happily.
 *
 * ON DELETE SET NULL rather than CASCADE: removing an artist from the world
 * should not silently delete the person, their conversation history or the
 * relationship a career has with them.
 */
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS artist_id text REFERENCES artists(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS characters_artist_key ON characters (artist_id);

/*
 * --- 2. A night you agreed to ---------------------------------------------
 *
 * The eight M2 types plus this one. Preparation is not here on purpose:
 * rehearsing for a battle is rehearsing, and REHEARSAL has meant that since
 * the calendar existed.
 */
ALTER TABLE calendar_items DROP CONSTRAINT IF EXISTS calendar_items_type_check;
ALTER TABLE calendar_items
  ADD CONSTRAINT calendar_items_type_check
  CHECK (type IN ('STUDIO','PERFORMANCE','RELEASE','MEETING','REHEARSAL','MEDIA','REST','OTHER','BATTLE'));

/*
 * --- 3. The battle ---------------------------------------------------------
 *
 * The M1 spine kept, and everything that makes a competitive event a world fact
 * with a life of its own added around it.
 */
ALTER TABLE battles
  /*
   * Who issued it and who was asked, as roles rather than as "the player and
   * the other one". A challenge the player eventually issues themselves is the
   * same row with the sides swapped, and player_side is what lets every
   * reader tell which half of it the career is without inferring it from
   * career_id.
   */
  ADD COLUMN IF NOT EXISTS player_side text,
  /* Source and trigger, never the kind. M7's identity discipline, applied. */
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  /* The challenge this came from. A battle without one would have no origin. */
  ADD COLUMN IF NOT EXISTS opportunity_id text REFERENCES opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scene_id text REFERENCES scenes(id) ON DELETE SET NULL,
  /* In game time, like every other commitment. Never wall-clock. */
  ADD COLUMN IF NOT EXISTS challenged_at_game_time timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_game_time timestamptz,
  /* Why this challenge existed at all, and the recorded state it came from. */
  ADD COLUMN IF NOT EXISTS challenge_reason text,
  ADD COLUMN IF NOT EXISTS challenge_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* Which engine decided it, and the seed it decided from. Replay needs both. */
  ADD COLUMN IF NOT EXISTS simulator_version text,
  ADD COLUMN IF NOT EXISTS seed text,
  /*
   * The verdict, as entities rather than as a score. decision is the shape of
   * the panel's agreement — "2-1" — and is derived from the judgement rows
   * below rather than being an independent opinion.
   */
  ADD COLUMN IF NOT EXISTS winner_artist_id text REFERENCES artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loser_artist_id text REFERENCES artists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision text,
  /*
   * What followed, decomposed. Respect, Heat, Fame and rivalry movement with the
   * facts that caused each, so "why did my standing move" is answerable from the
   * row and not from a re-run of the engine that moved it.
   */
  ADD COLUMN IF NOT EXISTS consequences jsonb NOT NULL DEFAULT '{}'::jsonb,
  /*
   * Each ending is its own fact, as M7 established for offers. Declining is not
   * losing, and a battle that resolved is not one that was merely judged.
   */
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS declined_at timestamptz,
  ADD COLUMN IF NOT EXISTS performed_at timestamptz,
  ADD COLUMN IF NOT EXISTS judged_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

/*
 * Participants must exist.
 *
 * These columns have been unconstrained text since M1 hardening, when there was
 * nothing to point them at. There is now, and an unenforced reference is the
 * kind of thing that stays true until the first time it does not.
 */
ALTER TABLE battles
  ADD CONSTRAINT battles_challenger_fk
  FOREIGN KEY (challenger_id) REFERENCES artists(id) ON DELETE CASCADE;
ALTER TABLE battles
  ADD CONSTRAINT battles_opponent_fk
  FOREIGN KEY (opponent_id) REFERENCES artists(id) ON DELETE CASCADE;

ALTER TABLE battles
  ADD CONSTRAINT battles_player_side_check
  CHECK (player_side IS NULL OR player_side IN ('CHALLENGER','OPPONENT'));

/*
 * The lifecycle.
 *
 * SCHEDULED survives from the M1 stub and still means what it meant. The rest
 * are M8's, and they are separate states rather than one because each is a
 * different thing that happened: being asked, agreeing, refusing, performing,
 * being judged, and the consequences landing. DECLINED in particular is a
 * terminal state that is emphatically not a loss.
 */
ALTER TABLE battles DROP CONSTRAINT IF EXISTS battles_status_check;
ALTER TABLE battles
  ADD CONSTRAINT battles_status_check
  CHECK (status IN ('CHALLENGED','ACCEPTED','DECLINED','SCHEDULED','PERFORMED','JUDGED','RESOLVED'));

/* Nobody battles themselves. */
ALTER TABLE battles
  ADD CONSTRAINT battles_distinct_participants_check
  CHECK (opponent_id IS NULL OR challenger_id <> opponent_id);

/*
 * A result is a pair or it is nothing, and it cannot exist before the judging
 * that produced it. Structural truths, so the database keeps them rather than
 * the application promising to.
 */
ALTER TABLE battles
  ADD CONSTRAINT battles_result_pair_check
  CHECK ((winner_artist_id IS NULL) = (loser_artist_id IS NULL));
ALTER TABLE battles
  ADD CONSTRAINT battles_distinct_result_check
  CHECK (winner_artist_id IS NULL OR winner_artist_id <> loser_artist_id);
ALTER TABLE battles
  ADD CONSTRAINT battles_result_requires_judging_check
  CHECK (winner_artist_id IS NULL OR status IN ('JUDGED','RESOLVED'));

/*
 * One battle per challenge, however many times a day is processed. The same
 * total-index reasoning as opportunities_identity_key: nulls are distinct, so
 * the M1 rows that predate this never collide, and a total index can still
 * arbitrate ON CONFLICT.
 */
CREATE UNIQUE INDEX IF NOT EXISTS battles_identity_key
  ON battles (career_id, idempotency_key);
CREATE INDEX IF NOT EXISTS battles_career_status_idx ON battles (career_id, status);
CREATE INDEX IF NOT EXISTS battles_scheduled_idx
  ON battles (career_id, scheduled_game_time)
  WHERE status IN ('ACCEPTED','SCHEDULED');

/*
 * --- 4. What each artist actually did -------------------------------------
 *
 * A track has versions, briefs and decisions; a verse had nothing. This is the
 * smallest honest representation that lets a judge evaluate without pretending
 * bars exist.
 *
 * The seven facts are real columns rather than a JSON blob, for the same reason
 * artist_skills is: they are a closed craft vocabulary, they are bounded, and
 * a bound the database enforces cannot drift. derivation beside them is the
 * versioned part — how each fact was arrived at from skills, psychology,
 * strategy and preparation — because *that* is what a newer engine will change.
 *
 * strategy is stored apart from the facts deliberately. What you set out to do
 * and what you actually did are different things, and the Strategic judge exists
 * precisely because they can disagree.
 */
CREATE TABLE IF NOT EXISTS battle_performances (
  id                text PRIMARY KEY,
  battle_id         text NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  artist_id         text NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  side              text NOT NULL CHECK (side IN ('CHALLENGER','OPPONENT')),

  /* The angle. Declared before preparation, never after. */
  strategy          text NOT NULL,
  strategy_declared_at_game_time timestamptz,

  /*
   * What preparation cost and what it bought, itemised. Bounded by a check
   * rather than by convention so no amount of preparing can become a guarantee.
   */
  preparation_sessions integer NOT NULL DEFAULT 0
                       CHECK (preparation_sessions BETWEEN 0 AND 3),
  preparation_spend_minor bigint NOT NULL DEFAULT 0
                       CHECK (preparation_spend_minor >= 0),
  preparation       jsonb NOT NULL DEFAULT '{}'::jsonb,

  /*
   * The performance, as facts. 0-100 each, and none of them is a total: there
   * is deliberately no column here that sums the others.
   */
  writing           real NOT NULL DEFAULT 0 CHECK (writing BETWEEN 0 AND 100),
  flow              real NOT NULL DEFAULT 0 CHECK (flow BETWEEN 0 AND 100),
  structure         real NOT NULL DEFAULT 0 CHECK (structure BETWEEN 0 AND 100),
  originality       real NOT NULL DEFAULT 0 CHECK (originality BETWEEN 0 AND 100),
  rebuttal          real NOT NULL DEFAULT 0 CHECK (rebuttal BETWEEN 0 AND 100),
  delivery          real NOT NULL DEFAULT 0 CHECK (delivery BETWEEN 0 AND 100),
  crowd_work        real NOT NULL DEFAULT 0 CHECK (crowd_work BETWEEN 0 AND 100),

  /* How each of the above was arrived at. The versioned half. */
  derivation        jsonb NOT NULL DEFAULT '{}'::jsonb,
  simulator_version text,
  submitted_at_game_time timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
/* One performance per side. Submitting twice is impossible, not merely refused. */
CREATE UNIQUE INDEX IF NOT EXISTS battle_performances_side_key
  ON battle_performances (battle_id, side);
CREATE UNIQUE INDEX IF NOT EXISTS battle_performances_artist_key
  ON battle_performances (battle_id, artist_id);

/*
 * --- 5. What each judge made of it ----------------------------------------
 *
 * One row per judge, which is the whole reason this is a table. M8's panel is
 * Technical, Strategic and Audience; judge is deliberately not constrained to
 * those three, because the next perspective worth having should be a row rather
 * than a migration.
 *
 * panel_role is what makes that safe. A result is derived from the REQUIRED
 * judges only, so an ADVISORY perspective — a community vote, a promoter's
 * opinion — can be recorded against a battle without retroactively changing what
 * the battle decided.
 *
 * contributions is the named decomposition, in the shape RankingResult
 * already uses everywhere else in this codebase. The two totals are kept beside
 * it because a judge comparing two performances genuinely has two numbers; they
 * are that judge's, they never leave it, and nothing anywhere sums them across
 * judges.
 */
CREATE TABLE IF NOT EXISTS battle_judgements (
  id                text PRIMARY KEY,
  battle_id         text NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  judge             text NOT NULL,
  panel_role        text NOT NULL DEFAULT 'REQUIRED'
                    CHECK (panel_role IN ('REQUIRED','ADVISORY')),

  /* Who this judge gave it to, as a side and as the artist that side was. */
  verdict_side      text NOT NULL CHECK (verdict_side IN ('CHALLENGER','OPPONENT')),
  verdict_artist_id text NOT NULL REFERENCES artists(id) ON DELETE CASCADE,

  /* This judge's own reading of each side. Never comparable across judges. */
  challenger_total  real NOT NULL,
  opponent_total    real NOT NULL,
  /* How close it was, for this judge. A near-tie is a real fact about a battle. */
  margin            real NOT NULL,

  /* The argument: named contributions, the inputs they came from, and why. */
  contributions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  /* Facts this judge does not consider. "That was irrelevant" is an answer. */
  irrelevant        jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine_version    text NOT NULL,
  judged_at_game_time timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
/* Each judge votes exactly once. At most once is structural; exactly is domain. */
CREATE UNIQUE INDEX IF NOT EXISTS battle_judgements_judge_key
  ON battle_judgements (battle_id, judge);
CREATE INDEX IF NOT EXISTS battle_judgements_battle_idx ON battle_judgements (battle_id);

/*
 * --- 6. What was knowable about them --------------------------------------
 *
 * Scouting reveals; it does not improve. The report is persisted rather than
 * recomputed on read for M6's reason and M7's: what the world knew on the day
 * you looked is a fact, and re-deriving it later would quietly answer a
 * different question with a newer world.
 *
 * Nothing in here is an input to judging. That is the point of it being its own
 * table rather than a column on the performance — a scouting report cannot
 * become a modifier by accident if no judge is given the row.
 */
CREATE TABLE IF NOT EXISTS battle_scouting_reports (
  id                text PRIMARY KEY,
  battle_id         text NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  career_id         text NOT NULL REFERENCES careers(id) ON DELETE CASCADE,
  /* Who was scouted. */
  subject_artist_id text NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  /* What the world already recorded, as it stood when it was asked for. */
  findings          jsonb NOT NULL DEFAULT '{}'::jsonb,
  /* Which named things could not be known, and why. Absence is information. */
  unknowns          jsonb NOT NULL DEFAULT '[]'::jsonb,
  scouted_at_game_time timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
/* Looking twice is looking once. Scouting is idempotent per battle. */
CREATE UNIQUE INDEX IF NOT EXISTS battle_scouting_reports_key
  ON battle_scouting_reports (battle_id, subject_artist_id);
`,
};
