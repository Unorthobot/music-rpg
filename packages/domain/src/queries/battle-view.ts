import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  artists,
  battleJudgements,
  battlePerformances,
  battleScoutingReports,
  battles,
  calendarItems,
  characters,
  npcConversations,
  opportunities,
  scenes,
  type ArtistRow,
  type BattleJudgementRow,
  type BattlePerformanceRow,
  type BattleRow,
  type BattleScoutingReportRow,
  type CalendarItemRow,
  type CareerRow,
  type CharacterRow,
  type Database,
  type OpportunityRow,
  type SceneRow,
} from "@music-rpg/database";
import {
  BATTLE_STAGE_LABELS,
  BATTLE_STRATEGY_INTENT,
  BATTLE_STRATEGY_LABELS,
  MAX_PREPARATION_SESSIONS,
  REQUIRED_BATTLE_PANEL,
  type BattleResult,
  type BattleSide,
  type BattleStrategy,
  type DeclinedChallenge,
  type JudgeDecision,
  type PlayerBattle,
  type PlayerBattleStage,
} from "@music-rpg/shared";
import {
  PREPARATION_SESSION_COST_MINOR,
  PREPARATION_SESSION_DAYS,
  decisionHeadline,
  describeAftermath,
  describeJudgePerspective,
  describePlayerRound,
  describeScouting,
  formatTally,
} from "@music-rpg/simulation";

/**
 * Battles, as the player is allowed to read them.
 *
 * The other half of `queries/battles.ts`, and the split is the entire point.
 * That file is World Control's: it hands back `BattleDossier` — whole rows,
 * whole derivations, whole judge decompositions, the seed and both engine
 * versions — because an inspector that cannot see the reasoning cannot inspect
 * anything, and it must keep doing exactly that. This file is the player's, and
 * it hands back `PlayerBattle`: a closed shape assembled field by field, with no
 * path from a component back to any row it came from.
 *
 * The distinction is structural rather than stylistic, and it is the same one
 * M7 drew for offers. `getCareerBattles` returns rows, so
 * `dossier.judgements[0].margin` typechecks. Nothing here returns a row, a fact,
 * a total, a weight or a contribution, so the same expression does not compile.
 * That is the only version of this boundary that survives contact with a
 * deadline — "the component does not render it" is a promise about today's
 * components.
 *
 * ## What crosses, and what does not
 *
 * Everything the engine used to decide a battle stays here: the seven
 * performance facts and every derivation shift behind them, `challengerTotal`,
 * `opponentTotal`, `margin`, every `JudgeContribution` with its inputs and
 * weights, the room's cohort composition, `strategyAptitude`, the skills and
 * psychology both artists brought, `seed`, `simulator_version`,
 * `engine_version`, the director's `triggerState`, and the whole
 * `battles.consequences` column — **which no function in this file reads**.
 *
 * What crosses is what somebody who was in the room would know: who called them
 * out, which night, what they decided to do about it, what three people made of
 * it, and what became true afterwards.
 *
 * ## Nothing here writes
 *
 * Every function is a read over persisted state. Opening a screen must not
 * create a battle, resolve one, judge one or apply a consequence — **and in
 * particular, reading a battle must never be what causes it to happen**. The
 * night resolves because game time reached it, on the day advance, and these
 * functions reveal what the world already decided. A player who never opens the
 * route still has the battle happen; a player who opens it a hundred times
 * before the night still has a battle that has not happened.
 */

/* ------------------------------------------------------------------ loading */

/** Everything a projection needs, loaded once for a whole page. */
type BattleContext = {
  now: Date;
  rivals: ArtistRow[];
  people: CharacterRow[];
  sceneRows: SceneRow[];
  conversations: { id: string; characterId: string }[];
  performances: BattlePerformanceRow[];
  judgements: BattleJudgementRow[];
  scouting: BattleScoutingReportRow[];
  bookings: CalendarItemRow[];
  challenges: OpportunityRow[];
};

async function loadContext(
  db: Database,
  career: CareerRow,
  rows: BattleRow[],
): Promise<BattleContext> {
  const battleIds = rows.map((row) => row.id);
  const artistIds = [
    ...new Set(
      rows.flatMap((row) => [row.challengerId, row.opponentId].filter((id): id is string => !!id)),
    ),
  ];
  const opportunityIds = rows
    .map((row) => row.opportunityId)
    .filter((id): id is string => id !== null);

  const [
    rivals,
    people,
    sceneRows,
    conversations,
    performances,
    judgements,
    scouting,
    bookings,
    challenges,
  ] = await Promise.all([
    artistIds.length
      ? db.select().from(artists).where(inArray(artists.id, artistIds))
      : Promise.resolve([]),
    db.select().from(characters).where(eq(characters.worldId, career.worldId)),
    db.select().from(scenes).where(eq(scenes.worldId, career.worldId)),
    db
      .select({ id: npcConversations.id, characterId: npcConversations.characterId })
      .from(npcConversations)
      .where(eq(npcConversations.careerId, career.id)),
    battleIds.length
      ? db.select().from(battlePerformances).where(inArray(battlePerformances.battleId, battleIds))
      : Promise.resolve([]),
    battleIds.length
      ? db
          .select()
          .from(battleJudgements)
          .where(inArray(battleJudgements.battleId, battleIds))
          .orderBy(asc(battleJudgements.judge))
      : Promise.resolve([]),
    battleIds.length
      ? db
          .select()
          .from(battleScoutingReports)
          .where(inArray(battleScoutingReports.battleId, battleIds))
      : Promise.resolve([]),
    db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.careerId, career.id))
      .orderBy(asc(calendarItems.startGameTime)),
    opportunityIds.length
      ? db.select().from(opportunities).where(inArray(opportunities.id, opportunityIds))
      : Promise.resolve([]),
  ]);

  return {
    now: career.currentGameDate,
    rivals,
    people,
    sceneRows,
    conversations,
    performances,
    judgements,
    scouting,
    bookings,
    challenges,
  };
}

/**
 * What the challenge's payload is allowed to contain.
 *
 * Named explicitly rather than read as `Record<string, unknown>`, exactly as
 * M7's `ReadablePayload` is, so that a future director adding a diagnostic field
 * cannot have it forwarded to a screen. `rivalArtistId` is deliberately absent:
 * the projection resolves the person through the artist and character rows, and
 * an id a screen never needs is an id a screen never gets.
 */
type ReadableChallengePayload = {
  rivalName?: string;
  venueName?: string;
  sceneName?: string;
  capacity?: number;
  challengeLine?: string;
  termsLine?: string;
  nightGameTime?: string;
};

/* -------------------------------------------------------------- projecting */

/** Which artist the career is, and which one the other person is. */
function sidesOf(row: BattleRow): { playerArtistId: string | null; rivalArtistId: string | null } {
  return row.playerSide === "CHALLENGER"
    ? { playerArtistId: row.challengerId, rivalArtistId: row.opponentId }
    : { playerArtistId: row.opponentId, rivalArtistId: row.challengerId };
}

/**
 * The lifecycle, in the player's three states rather than the row's seven.
 *
 * `PERFORMED` and `JUDGED` exist for a few milliseconds inside one transaction
 * and are never a state anybody navigates to, so they read as decided — the
 * alternative is a screen rendering a half-finished night.
 */
function stageOf(row: BattleRow, hasStrategy: boolean): PlayerBattleStage {
  if (row.status === "RESOLVED" || row.status === "JUDGED" || row.status === "PERFORMED") {
    return "DECIDED";
  }
  return hasStrategy ? "READY" : "AGREED";
}

/**
 * The recorded verdicts, rebuilt for the describers and then thrown away.
 *
 * This is the one place the judge decomposition is handled, it happens on the
 * server inside this module, and **none of it is returned**. The describers
 * consume it and emit sentences; the numbers do not appear on `PlayerBattle` and
 * cannot be reached from one.
 */
function resultFrom(row: BattleRow, judgementRows: BattleJudgementRow[]): BattleResult | null {
  if (!row.decision || !row.winnerArtistId) return null;

  const judgements: JudgeDecision[] = judgementRows.map((entry) => ({
    judge: entry.judge,
    panelRole: entry.panelRole,
    /* The question text lives in shared constants and is not persisted. */
    question: "",
    verdict: entry.verdictSide,
    challengerTotal: entry.challengerTotal,
    opponentTotal: entry.opponentTotal,
    margin: entry.margin,
    contributions: entry.contributions,
    irrelevant: entry.irrelevant,
    engineVersion: entry.engineVersion,
  }));

  const winner: BattleSide = row.winnerArtistId === row.challengerId ? "CHALLENGER" : "OPPONENT";

  return {
    winner,
    loser: winner === "CHALLENGER" ? "OPPONENT" : "CHALLENGER",
    winnerArtistId: row.winnerArtistId,
    loserArtistId: row.loserArtistId ?? "",
    decision: row.decision,
    judgements,
    split: !row.decision.endsWith("-0"),
    engineVersion: "",
  };
}

/**
 * How near the night is, said the way a person would say it.
 *
 * Only ever used for the one line the world acts on — the angle that has not
 * been declared yet — because that is the only place a date needs urgency
 * attached to it. Everywhere else the night is a date and reads as one.
 */
function awaitingAngleLine(night: Date, now: Date): string {
  const days = Math.round((startOfDay(night) - startOfDay(now)) / DAY);

  if (days <= 0) return "You battle tonight. You still need to decide how you're going in.";
  if (days === 1) return "You battle tomorrow. You still need to decide how you're going in.";
  return `You battle in ${days} days. You still need to decide how you're going in.`;
}

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * One battle, assembled field by field.
 *
 * Deliberately an explicit construction rather than a spread with deletions. A
 * spread would mean every new column on `battles` is player-facing by default
 * and private only if somebody remembers to remove it; this way the default is
 * that nothing crosses. On a table holding seven performance quantities and
 * three judge decompositions, that default is the whole boundary.
 */
function projectBattle(row: BattleRow, context: BattleContext): PlayerBattle {
  const { playerArtistId, rivalArtistId } = sidesOf(row);

  const rivalArtist = context.rivals.find((artist) => artist.id === rivalArtistId) ?? null;
  const rivalCharacter =
    context.people.find((person) => person.artistId === rivalArtistId) ?? null;

  const challenge = context.challenges.find((entry) => entry.id === row.opportunityId) ?? null;
  const payload = (challenge?.payload ?? {}) as ReadableChallengePayload;

  const scene = context.sceneRows.find((entry) => entry.id === row.sceneId) ?? null;
  const rivalName = rivalArtist?.stageName ?? payload.rivalName ?? "Someone";

  const performance =
    context.performances.find(
      (entry) => entry.battleId === row.id && entry.artistId === playerArtistId,
    ) ?? null;

  const strategy = (performance?.strategy ?? null) as BattleStrategy | null;
  const stage = stageOf(row, strategy !== null);

  const night = row.scheduledGameTime ?? new Date(payload.nightGameTime ?? row.createdAt);
  const awaitingAngle = stage === "AGREED";

  const booking =
    context.bookings.find(
      (item) =>
        item.relatedEntityType === "BATTLE" &&
        item.relatedEntityId === row.id &&
        item.type === "BATTLE",
    ) ?? null;

  const sessions = performance?.preparationSessions ?? 0;

  return {
    id: row.id,
    rival: {
      name: rivalName,
      origin: rivalArtist?.origin ?? null,
      conversationId:
        context.conversations.find((entry) => entry.characterId === rivalCharacter?.id)?.id ??
        null,
    },
    night: {
      at: night,
      venueName: payload.venueName ?? null,
      sceneName: payload.sceneName ?? scene?.name ?? null,
      capacity: payload.capacity ?? null,
    },
    stage,
    stageLabel: BATTLE_STAGE_LABELS[stage],
    awaitingAngle,
    awaitingAngleLine: awaitingAngle ? awaitingAngleLine(night, context.now) : null,
    challengeLine: payload.challengeLine ?? null,
    termsLine: payload.termsLine ?? null,
    strategy,
    strategyLabel: strategy ? BATTLE_STRATEGY_LABELS[strategy] : null,
    strategyIntent: strategy ? BATTLE_STRATEGY_INTENT[strategy] : null,
    preparation: {
      sessions,
      maxSessions: MAX_PREPARATION_SESSIONS,
      spendMinor: performance?.preparationSpendMinor ?? 0,
      daysCommitted: sessions * PREPARATION_SESSION_DAYS,
      nextSessionCostMinor:
        stage === "DECIDED" || sessions >= MAX_PREPARATION_SESSIONS
          ? null
          : PREPARATION_SESSION_COST_MINOR,
    },
    scouting: projectScouting(row, context, rivalName),
    decision: projectDecision(row, context, rivalName),
    calendarItemId: booking?.id ?? null,
    href: `/battles/${row.id}`,
    agreedAt: row.acceptedAt ?? row.createdAt,
  };
}

/**
 * What was knowable, translated.
 *
 * `findings[].observed` — the recorded values each finding was established from
 * — is read by the describer and does not appear on the returned shape. There is
 * no path from a screen to it, which is the requirement: the describer reads it,
 * the screen does not.
 */
function projectScouting(row: BattleRow, context: BattleContext, rivalName: string) {
  const report = context.scouting.find((entry) => entry.battleId === row.id);
  if (!report) return null;

  const described = describeScouting({
    findings: report.findings,
    unknowns: report.unknowns,
    rivalName,
  });

  return { sections: described.sections, unknowns: described.unknowns };
}

/**
 * What three people made of it.
 *
 * The perspectives are built in the panel's own stable order and each is given
 * only its own judgement, because the one thing this screen must never do is
 * aggregate them. Three perspectives that can be summed are one score with three
 * labels on it, and the judging model was built specifically so that a 2-1 is a
 * real 2-1.
 */
function projectDecision(row: BattleRow, context: BattleContext, rivalName: string) {
  const judgementRows = context.judgements.filter((entry) => entry.battleId === row.id);
  const result = resultFrom(row, judgementRows);
  if (!result) return null;

  const playerSide: BattleSide = row.playerSide ?? "OPPONENT";
  const { playerArtistId } = sidesOf(row);

  const performance =
    context.performances.find(
      (entry) => entry.battleId === row.id && entry.artistId === playerArtistId,
    ) ?? null;

  return {
    headline: decisionHeadline({ result, playerSide, rivalName }),
    tally: formatTally(result.decision),
    split: result.split,
    wonByPlayer: result.winner === playerSide,
    /*
     * Panel order — the writing, the plan, the room — and never the order the
     * rows came back in. `battle_judgements` is read alphabetically, which puts
     * the room first and the writing last: correct for an inspector scanning a
     * table, wrong for a screen, because the sequence three perspectives are read
     * in is part of how the night reads.
     */
    perspectives: REQUIRED_BATTLE_PANEL.flatMap((judge) => {
      const judgement = result.judgements.find(
        (entry) => entry.judge === judge && entry.panelRole === "REQUIRED",
      );
      return judgement ? [describeJudgePerspective({ judgement, playerSide, rivalName })] : [];
    }),
    yourRound: performance
      ? describePlayerRound({
          strategy: performance.strategy,
          judgements: result.judgements,
          playerSide,
        })
      : "",
    aftermath: describeAftermath({ result, playerSide, rivalName }),
  };
}

/* ----------------------------------------------------------------- querying */

/** One battle, whatever became of it. Null when it is not this career's. */
export async function getPlayerBattle(
  db: Database,
  career: CareerRow,
  battleId: string,
): Promise<PlayerBattle | null> {
  const rows = await db
    .select()
    .from(battles)
    .where(and(eq(battles.id, battleId), eq(battles.careerId, career.id)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return projectBattle(row, await loadContext(db, career, [row]));
}

/**
 * Every battle this career has agreed to, newest first.
 *
 * Declined challenges are absent because **declining creates no battle** — there
 * is no row to find, which is the model being honest rather than the query
 * filtering. A career that refused everything has an empty list here and nothing
 * anywhere that counts what it refused.
 */
export async function getCareerBattleHistory(
  db: Database,
  career: CareerRow,
): Promise<PlayerBattle[]> {
  const rows = await db
    .select()
    .from(battles)
    .where(eq(battles.careerId, career.id))
    .orderBy(desc(battles.createdAt));

  if (rows.length === 0) return [];

  const context = await loadContext(db, career, rows);
  return rows.map((row) => projectBattle(row, context));
}

/**
 * The battle the career is currently in, if it is in one.
 *
 * At most one is live at a time — the director will not issue a second challenge
 * while something is unsettled — so this is a single answer rather than a list.
 * There is deliberately **no battle list and no navigation item**: a battle is a
 * situation a career is in, not a section of the game.
 */
export async function getActiveBattle(
  db: Database,
  career: CareerRow,
): Promise<PlayerBattle | null> {
  const rows = await db
    .select()
    .from(battles)
    .where(and(eq(battles.careerId, career.id), inArray(battles.status, ["ACCEPTED", "SCHEDULED"])))
    .orderBy(asc(battles.scheduledGameTime))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return projectBattle(row, await loadContext(db, career, [row]));
}

/**
 * The battle whose night game time cannot pass until an angle is declared.
 *
 * Read by Home, so the player is told what is outstanding where they already
 * look — and read by nothing that writes. The rule this supports lives in the
 * day advance and is stated there.
 */
export async function getBattleAwaitingAngle(
  db: Database,
  career: CareerRow,
): Promise<PlayerBattle | null> {
  const active = await getActiveBattle(db, career);
  return active?.awaitingAngle ? active : null;
}

/**
 * Challenges this career turned down.
 *
 * Read from the opportunity, because that is the only thing a refusal leaves.
 * Kept legible for the same reason M7 keeps a lapsed offer legible: a player who
 * said no did something, and something they did should not vanish. It is
 * recorded in the same neutral register as a declined booking, and nothing
 * counts them.
 */
export async function getDeclinedChallenges(
  db: Database,
  career: CareerRow,
): Promise<DeclinedChallenge[]> {
  const rows = await db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.careerId, career.id),
        eq(opportunities.type, "BATTLE_CHALLENGE"),
        eq(opportunities.status, "DECLINED"),
      ),
    )
    .orderBy(desc(opportunities.updatedAt));

  return rows.map((row) => {
    const payload = row.payload as ReadableChallengePayload;

    return {
      id: row.id,
      rivalName: payload.rivalName ?? "Someone",
      night: payload.nightGameTime ? new Date(payload.nightGameTime) : null,
      sceneName: payload.sceneName ?? null,
      line: `You turned down ${payload.rivalName ?? "a challenge"}.`,
      declinedAt: row.declinedAt ?? row.updatedAt,
    };
  });
}

/**
 * The battle behind each calendar entry, keyed by calendar item.
 *
 * The same arrow M7 draws from a booking back to the offer it came from, so the
 * Calendar can name what a night is without inventing its own description of it.
 */
export async function getCalendarBattles(
  db: Database,
  career: CareerRow,
): Promise<Map<string, PlayerBattle>> {
  const rows = await db.select().from(battles).where(eq(battles.careerId, career.id));
  if (rows.length === 0) return new Map();

  const context = await loadContext(db, career, rows);
  const byItem = new Map<string, PlayerBattle>();

  for (const row of rows) {
    const projected = projectBattle(row, context);
    if (projected.calendarItemId) byItem.set(projected.calendarItemId, projected);
  }

  return byItem;
}

/** Used by the leakage tests: the exact key set a player-facing battle may carry. */
export const PLAYER_BATTLE_KEYS = [
  "id",
  "rival",
  "night",
  "stage",
  "stageLabel",
  "awaitingAngle",
  "awaitingAngleLine",
  "challengeLine",
  "termsLine",
  "strategy",
  "strategyLabel",
  "strategyIntent",
  "preparation",
  "scouting",
  "decision",
  "calendarItemId",
  "href",
  "agreedAt",
] as const;
