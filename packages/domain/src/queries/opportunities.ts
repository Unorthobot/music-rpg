import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  characters,
  gameEvents,
  opportunities,
  opportunityConflicts,
  opportunityDirectorRuns,
  scenes,
  type CharacterRow,
  type Database,
  type GameEventRow,
  type OpportunityConflictRow,
  type OpportunityDirectorRunRow,
  type OpportunityRow,
} from "@music-rpg/database";
import type { DirectorTrace } from "@music-rpg/shared";

/**
 * Reading the director.
 *
 * The inspector's half, and it is deliberately raw. Two questions have to be
 * answerable here before any of this reaches a player:
 *
 *     Why did this opportunity exist?
 *     Why did this one outrank that one?
 *
 * The first is answered by an opportunity's own row — the state it was generated
 * from, the conditions it passed, its origin, its lifecycle and the events it
 * produced. The second can only be answered by the run that produced it, because
 * ranking is comparative: it needs the candidates that lost, including the ones
 * that were never written down.
 *
 * None of this is player-facing. Rule names, weights, scores and thresholds are
 * for World Control; a player is told what happened and what it means, never the
 * machinery that decided it.
 */

export type OpportunityWithSource = {
  opportunity: OpportunityRow;
  /** Who offered it. */
  source: CharacterRow | null;
  sceneName: string | null;
  /** Offers this one cannot coexist with. */
  conflicts: OpportunityConflictRow[];
  /** Its whole lifecycle, in the order it happened. */
  events: GameEventRow[];
};

/** Every offer a career has ever had, newest first, with its causal chain. */
export async function getCareerOpportunities(
  db: Database,
  careerId: string,
): Promise<OpportunityWithSource[]> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.careerId, careerId))
    .orderBy(desc(opportunities.createdAt));

  if (rows.length === 0) return [];

  const sourceIds = rows
    .map((row) => row.sourceEntityId)
    .filter((id): id is string => id !== null);
  const sceneIds = rows.map((row) => row.sceneId).filter((id): id is string => id !== null);

  const [sourceRows, sceneRows, conflictRows, eventRows] = await Promise.all([
    sourceIds.length
      ? db.select().from(characters).where(inArray(characters.id, sourceIds))
      : Promise.resolve([]),
    sceneIds.length ? db.select().from(scenes).where(inArray(scenes.id, sceneIds)) : Promise.resolve([]),
    db.select().from(opportunityConflicts).where(eq(opportunityConflicts.careerId, careerId)),
    db
      .select()
      .from(gameEvents)
      .where(and(eq(gameEvents.careerId, careerId), eq(gameEvents.targetType, "OPPORTUNITY")))
      .orderBy(asc(gameEvents.sequence)),
  ]);

  return rows.map((opportunity) => ({
    opportunity,
    source: sourceRows.find((row) => row.id === opportunity.sourceEntityId) ?? null,
    sceneName: sceneRows.find((row) => row.id === opportunity.sceneId)?.name ?? null,
    conflicts: conflictRows.filter(
      (row) =>
        row.opportunityId === opportunity.id || row.otherOpportunityId === opportunity.id,
    ),
    events: eventRows.filter((row) => row.targetId === opportunity.id),
  }));
}

/**
 * Every run of the director for a career, newest first.
 *
 * This is where "why did this one outrank that one" is actually answerable. The
 * opportunity rows can only ever describe themselves; a comparison needs the
 * losers, and the ones suppressed by the cap exist nowhere else — by design,
 * since they must not become player-facing rows.
 */
export async function getDirectorRuns(
  db: Database,
  careerId: string,
  limit = 30,
): Promise<OpportunityDirectorRunRow[]> {
  return db
    .select()
    .from(opportunityDirectorRuns)
    .where(eq(opportunityDirectorRuns.careerId, careerId))
    .orderBy(desc(opportunityDirectorRuns.gameTime))
    .limit(limit);
}

/** The trace of one run, typed. Null for a row written by an older director. */
export function traceOf(run: OpportunityDirectorRunRow): DirectorTrace | null {
  const trace = run.trace as Partial<DirectorTrace>;
  return Array.isArray(trace.candidates) ? (trace as DirectorTrace) : null;
}
