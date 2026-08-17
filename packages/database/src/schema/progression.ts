import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { careers } from "./career";

/**
 * When the world first started treating this career differently.
 *
 * The only state M9 adds, and it exists because one question cannot be answered
 * by folding current state: *when* did each recognition domain first become
 * true. Whether it is true now always can be, and is.
 *
 * Everything else the phase model reads is already owned and recorded by
 * somebody else — M5's fans and reception, M6's relationships, moments and crew,
 * the world's promoter standards, the event log's public record. The evidence
 * itself is a pure fold over those and is stored nowhere on purpose: it is
 * idempotent, it answers the same way whenever it runs, and a persisted copy
 * would be a second opinion about reception.
 *
 * One row per career, upserted at the end of every day advance, read by nothing
 * that decides anything else — `career_metric_pressure`'s precedent exactly.
 * It is not a score, it is never shown to a player, and there is no column here
 * that sums anything.
 */
export const careerProgressionObservations = pgTable("career_progression_observations", {
  careerId: text("career_id")
    .primaryKey()
    .references(() => careers.id, { onDelete: "cascade" }),

  /*
   * The in-world day each recognition domain was **first reached**.
   *
   * Set once and never cleared. This is history, not qualification state:
   * whether a career qualifies now is a pure fold over facts M5–M8.5 already
   * own and is recomputed on demand, but *when* the world first related to this
   * artist differently cannot be recovered from those facts afterwards.
   *
   * There is deliberately no `qualifying_since` column and no durability
   * window. Measurement showed no domain in this world can lapse, so a
   * continuity watermark would have been a timer wearing the word "durable".
   *
   * Three columns rather than one jsonb blob: the domains are a closed
   * vocabulary named in `shared/progression.ts`, and a fourth should cost a
   * migration and a conversation rather than a new key appearing at a call
   * site. The evidence *descriptors* are not stored at all — they are a pure
   * fold, and a persisted copy would be a second opinion about reception.
   */
  receptionFirstReachedGameTime: timestamp("reception_first_reached_game_time", {
    withTimezone: true,
  }),
  peerFirstReachedGameTime: timestamp("peer_first_reached_game_time", { withTimezone: true }),
  publicRecordFirstReachedGameTime: timestamp("public_record_first_reached_game_time", {
    withTimezone: true,
  }),

  lastEvaluatedGameTime: timestamp("last_evaluated_game_time", { withTimezone: true }),

  /** Which evaluator produced this. Rules change; recorded history must not. */
  evaluatorVersion: text("evaluator_version").notNull(),

  /* Wall-clock bookkeeping, deliberately outside the model. */
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CareerProgressionObservationRow =
  typeof careerProgressionObservations.$inferSelect;
