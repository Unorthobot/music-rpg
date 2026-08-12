import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  artists,
  battleJudgements,
  battlePerformances,
  battleScoutingReports,
  battles,
  gameEvents,
  scenes,
  type ArtistRow,
  type BattleJudgementRow,
  type BattlePerformanceRow,
  type BattleRow,
  type BattleScoutingReportRow,
  type Database,
  type GameEventRow,
} from "@music-rpg/database";

/**
 * Reading a battle.
 *
 * The inspector's half, and deliberately raw. Two questions have to be
 * answerable from these rows before any of this reaches a player:
 *
 *     Why did KXMO beat this opponent?
 *     Why did the Technical judge disagree with the Audience judge?
 *
 * The first is answered by walking the whole chain — the challenge that started
 * it, the state it was generated from, the angles declared, the preparation
 * spent, what each artist actually did, and what each judge made of it. The
 * second can only be answered by the judgement rows, because it is a question
 * about *different mandates reading different facts*, and a result on its own
 * cannot give it.
 *
 * None of this is player-facing. Fact values, judge totals, contribution weights
 * and engine versions are for World Control; a player is eventually told what
 * happened and what it meant, never the machinery that decided it.
 */

export type BattleDossier = {
  battle: BattleRow;
  sceneName: string | null;
  /** Both artists, by side, so a decomposition can be read with names on it. */
  challenger: ArtistRow | null;
  opponent: ArtistRow | null;
  /** What each of them actually did, with the derivation of every fact. */
  performances: BattlePerformanceRow[];
  /** One row per judge, each with its own argument. */
  judgements: BattleJudgementRow[];
  /** What was knowable beforehand. Never an input to any of the above. */
  scouting: BattleScoutingReportRow[];
  /** The whole lifecycle, in the order it happened. */
  events: GameEventRow[];
};

/** Every battle a career has been in, newest first, with its causal chain. */
export async function getCareerBattles(
  db: Database,
  careerId: string,
): Promise<BattleDossier[]> {
  const rows = await db
    .select()
    .from(battles)
    .where(eq(battles.careerId, careerId))
    .orderBy(desc(battles.createdAt));

  if (rows.length === 0) return [];

  const battleIds = rows.map((row) => row.id);
  const artistIds = [
    ...new Set(
      rows.flatMap((row) => [row.challengerId, row.opponentId].filter((id): id is string => !!id)),
    ),
  ];
  const sceneIds = [
    ...new Set(rows.map((row) => row.sceneId).filter((id): id is string => id !== null)),
  ];

  const [performanceRows, judgementRows, scoutingRows, artistRows, sceneRows, eventRows] =
    await Promise.all([
      db
        .select()
        .from(battlePerformances)
        .where(inArray(battlePerformances.battleId, battleIds))
        .orderBy(asc(battlePerformances.side)),
      db
        .select()
        .from(battleJudgements)
        .where(inArray(battleJudgements.battleId, battleIds))
        .orderBy(asc(battleJudgements.judge)),
      db
        .select()
        .from(battleScoutingReports)
        .where(inArray(battleScoutingReports.battleId, battleIds)),
      artistIds.length
        ? db.select().from(artists).where(inArray(artists.id, artistIds))
        : Promise.resolve([]),
      sceneIds.length
        ? db.select().from(scenes).where(inArray(scenes.id, sceneIds))
        : Promise.resolve([]),
      /*
       * Every event this career has that targets one of these battles. Read
       * broadly and filtered below rather than queried per battle, because the
       * chain the inspector needs is the whole ordered lifecycle and not a
       * per-step lookup.
       */
      db
        .select()
        .from(gameEvents)
        .where(eq(gameEvents.careerId, careerId))
        .orderBy(asc(gameEvents.sequence)),
    ]);

  const artistById = new Map(artistRows.map((row) => [row.id, row]));
  const sceneById = new Map(sceneRows.map((row) => [row.id, row]));

  return rows.map((battle) => ({
    battle,
    sceneName: battle.sceneId ? (sceneById.get(battle.sceneId)?.name ?? null) : null,
    challenger: artistById.get(battle.challengerId) ?? null,
    opponent: battle.opponentId ? (artistById.get(battle.opponentId) ?? null) : null,
    performances: performanceRows.filter((row) => row.battleId === battle.id),
    judgements: judgementRows.filter((row) => row.battleId === battle.id),
    scouting: scoutingRows.filter((row) => row.battleId === battle.id),
    events: eventRows.filter(
      (row) =>
        row.targetId === battle.id ||
        // The challenge that produced it, and the consequences it produced.
        (row.payload as { battleId?: string }).battleId === battle.id ||
        row.targetId === battle.opportunityId,
    ),
  }));
}
