import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
  artistPsychology,
  artistSkills,
  artists,
  audienceCohorts,
  battleJudgements,
  battlePerformances,
  battleScoutingReports,
  battles,
  calendarItems,
  careerMetricPressure,
  careers,
  characters,
  groups,
  opportunities,
  relationships,
  type ArtistRow,
  type BattleRow,
  type CareerRow,
  type OpportunityRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  MAX_PREPARATION_SESSIONS,
  PREPARATION_SESSION_COST_MINOR,
  PREPARATION_SESSION_DAYS,
  accrueMetric,
  battleInteractionsFor,
  battleStandingPressure,
  contestMargin,
  convenePanel,
  deriveResult,
  performBattleRound,
  scoutOpponent,
  sceneStanding,
  strategyAptitude,
} from "@music-rpg/simulation";
import {
  BATTLE_JUDGE_ENGINE_VERSION,
  BATTLE_SIMULATOR_VERSION,
  BATTLE_STRATEGIES,
  NO_PREPARATION,
  err,
  ids,
  ok,
  type BattleCohortFacts,
  type BattlePreparation,
  type BattleResult,
  type BattleSide,
  type BattleStrategy,
  type CohortStandingFacts,
  type PsychologyValues,
  type Result,
  type ScoutingReport,
  type SkillValues,
} from "@music-rpg/shared";
import { contextNow, track as trackAnalytics, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { applyMoneyMovement } from "../internal/money";
import { DAYS } from "../internal/clock";

/**
 * Battles, wired into the world.
 *
 * This file orchestrates; it does not decide. Every judgement is made by the pure
 * engine in `@music-rpg/simulation`, and everything here is about reading the
 * canonical state other systems own, writing the consequences and the events that
 * explain them inside one transaction, and refusing to do any of it twice.
 *
 * Four rules bound the whole thing.
 *
 * 1. **Time creates, screens reveal.** A challenge exists because the director
 *    ran on a day advance. Nothing in a render path may create, schedule, judge
 *    or resolve a battle, and none of the functions here are safe to call from
 *    one.
 * 2. **The challenge and the battle are different facts.** The opportunity is the
 *    invitation and keeps M7's lifecycle; the `battles` row is the event and
 *    keeps its own. Accepting creates the second from the first.
 * 3. **Consume the projections; do not rebuild them.** Skills and psychology come
 *    from `artist_skills` and `artist_psychology`, the room from
 *    `audience_cohorts`, standing from M5's accrual, relationships from M6's
 *    fold. Nothing here re-derives any of it.
 * 4. **No new economy.** Preparation spends money through the ledger every other
 *    cost goes through and days on the calendar every other commitment goes
 *    through. There is no battle XP, no battle token and no battle currency, and
 *    Legacy is not written anywhere in this file.
 */

type Tx = Parameters<Parameters<CommandContext["db"]["transaction"]>[0]>[0];

/* ------------------------------------------------------------------ reading */

/** An artist, with everything a performance can be derived from. */
type Competitor = {
  artist: ArtistRow;
  skills: SkillValues;
  psychology: PsychologyValues;
};

async function loadCompetitor(
  db: CommandContext["db"] | Tx,
  artistId: string,
): Promise<Competitor | null> {
  const [artistRows, skillRows, psychRows] = await Promise.all([
    db.select().from(artists).where(eq(artists.id, artistId)).limit(1),
    db.select().from(artistSkills).where(eq(artistSkills.artistId, artistId)).limit(1),
    db.select().from(artistPsychology).where(eq(artistPsychology.artistId, artistId)).limit(1),
  ]);

  const artist = artistRows[0];
  const skills = skillRows[0];
  const psychology = psychRows[0];
  if (!artist || !skills || !psychology) return null;

  return {
    artist,
    skills: {
      lyricism: skills.lyricism,
      flow: skills.flow,
      melody: skills.melody,
      storytelling: skills.storytelling,
      performance: skills.performance,
      production: skills.production,
      experimentation: skills.experimentation,
      versatility: skills.versatility,
      battleIQ: skills.battleIq,
    },
    psychology: {
      confidence: psychology.confidence,
      discipline: psychology.discipline,
      ambition: psychology.ambition,
      resilience: psychology.resilience,
      ego: psychology.ego,
      patience: psychology.patience,
      adaptability: psychology.adaptability,
      riskTolerance: psychology.riskTolerance,
      competitiveness: psychology.competitiveness,
    },
  };
}

/**
 * The room, as M5 describes it.
 *
 * A narrowing of `audience_cohorts`, never a second description of who these
 * people are. `qualities` and `attention` are the cohort's own recorded values.
 */
export async function loadBattleCohorts(
  db: CommandContext["db"] | Tx,
  worldId: string,
): Promise<BattleCohortFacts[]> {
  const rows = await db
    .select()
    .from(audienceCohorts)
    .where(eq(audienceCohorts.worldId, worldId))
    .orderBy(asc(audienceCohorts.slug));

  return rows.map((cohort) => {
    const preferences = cohort.preferences as {
      qualities?: { focus: number; distinctiveness: number; immediacy: number };
    };
    const behaviour = cohort.behaviouralWeights as { attention?: number };

    return {
      slug: cohort.slug,
      name: cohort.name,
      size: cohort.size,
      sceneAffinity: cohort.sceneAffinity,
      qualities: preferences.qualities ?? { focus: 1 / 3, distinctiveness: 1 / 3, immediacy: 1 / 3 },
      attention: behaviour.attention ?? 0.5,
    };
  });
}

/** Cohort standing for `sceneStanding`, which is M7's and is reused unchanged. */
async function loadCohortStanding(
  db: CommandContext["db"] | Tx,
  worldId: string,
  careerId: string,
): Promise<CohortStandingFacts[]> {
  const { artistAudience } = await import("@music-rpg/database");

  const [cohortRows, audienceRows] = await Promise.all([
    db.select().from(audienceCohorts).where(eq(audienceCohorts.worldId, worldId)),
    db.select().from(artistAudience).where(eq(artistAudience.careerId, careerId)),
  ]);

  return cohortRows.map((cohort) => {
    const audience = audienceRows.find((row) => row.cohortId === cohort.id);
    return {
      slug: cohort.slug,
      name: cohort.name,
      size: cohort.size,
      fans: audience?.fans ?? 0,
      affinity: audience?.affinity ?? 0,
      priorExposure: audience?.priorExposure ?? 0,
      sceneAffinity: cohort.sceneAffinity,
    };
  });
}

/**
 * What the director needs to know about this career's competitive history.
 *
 * Read from `battles`, never inferred from opportunities. An accepted battle that
 * has not happened and an unanswered challenge are different facts, and only the
 * first should stop somebody calling you out again.
 */
export async function loadBattleFactsByCharacter(
  db: CommandContext["db"],
  careerId: string,
): Promise<Map<string, { outstanding: boolean; count: number }>> {
  const rows = await db.select().from(battles).where(eq(battles.careerId, careerId));

  /* Battles are keyed on artists; the director speaks in characters. */
  const opponentArtistIds = rows
    .map((row) => opponentArtistOf(row))
    .filter((id): id is string => id !== null);

  const characterRows = opponentArtistIds.length
    ? await db.select().from(characters).where(inArray(characters.artistId, opponentArtistIds))
    : [];

  const characterByArtist = new Map(
    characterRows.filter((row) => row.artistId).map((row) => [row.artistId!, row.id]),
  );

  const byCharacter = new Map<string, { outstanding: boolean; count: number }>();

  for (const row of rows) {
    const artistId = opponentArtistOf(row);
    if (!artistId) continue;
    const characterId = characterByArtist.get(artistId);
    if (!characterId) continue;

    const entry = byCharacter.get(characterId) ?? { outstanding: false, count: 0 };
    entry.count += 1;
    // Agreed and not yet finished. A resolved or declined battle is not outstanding.
    if (["ACCEPTED", "SCHEDULED", "PERFORMED", "JUDGED"].includes(row.status)) {
      entry.outstanding = true;
    }
    byCharacter.set(characterId, entry);
  }

  return byCharacter;
}

/** The artist on the other side from the career. */
function opponentArtistOf(row: BattleRow): string | null {
  return row.playerSide === "CHALLENGER" ? row.opponentId : row.challengerId;
}

/** The artist the career itself is. */
function playerArtistOf(row: BattleRow): string | null {
  return row.playerSide === "CHALLENGER" ? row.challengerId : row.opponentId;
}

/* ------------------------------------------------ accepting and declining */

export type AcceptChallengeResult = {
  battle: BattleRow;
  calendarItemId: string;
};

/**
 * Take a challenge.
 *
 * Creates the battle — the event — from the challenge — the invitation — and puts
 * the night on the calendar, which is where every other commitment in this game
 * lives. Nothing about standing, rivalry or relationships moves here: agreeing to
 * a battle is a situation, and what happens in the room is what has consequences.
 *
 * Idempotent on the opportunity: the unique index on
 * `(career_id, idempotency_key)` means a retried or concurrent accept collides
 * before a second battle can exist.
 */
export async function acceptBattleChallenge(
  ctx: CommandContext,
  input: { careerId: string; userId: string; opportunityId: string },
): Promise<Result<AcceptChallengeResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const loaded = await loadChallenge(ctx, career, input.opportunityId);
  if (!loaded.ok) return loaded;
  const { opportunity, rivalArtistId, payload } = loaded.value;

  if (!career.playerArtistId) {
    return err(
      DomainErrors.invalidCareerState("There is nobody in this career to put in a room."),
    );
  }

  const now = contextNow(ctx);
  const nightGameTime = new Date(String(payload.nightGameTime));
  const idempotencyKey = `challenge:${opportunity.id}`;

  const applied = await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(opportunities)
      .set({ status: "ACCEPTED", acceptedAt: now, updatedAt: now })
      .where(and(eq(opportunities.id, opportunity.id), eq(opportunities.status, "AVAILABLE")))
      .returning();

    if (!updated[0]) return null;

    const battleId = ids.generic();

    const inserted = await tx
      .insert(battles)
      .values({
        id: battleId,
        worldId: career.worldId,
        careerId: career.id,
        /* The rival called it, so they are the challenger. */
        challengerId: rivalArtistId,
        opponentId: career.playerArtistId!,
        playerSide: "OPPONENT",
        status: "ACCEPTED",
        idempotencyKey,
        opportunityId: opportunity.id,
        sceneId: opportunity.sceneId,
        challengedAtGameTime: opportunity.generatedAtGameTime ?? career.currentGameDate,
        scheduledGameTime: nightGameTime,
        challengeReason: opportunity.triggerReason,
        // The world as it stood when this was put to them. Never recomputed.
        challengeState: opportunity.triggerState,
        simulatorVersion: BATTLE_SIMULATOR_VERSION,
        acceptedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [battles.careerId, battles.idempotencyKey] })
      .returning();

    const battle = inserted[0];
    if (!battle) return null;

    const calendarItemId = ids.generic();
    await tx.insert(calendarItems).values({
      id: calendarItemId,
      careerId: career.id,
      type: "BATTLE",
      title: `${payload.rivalName ?? "A rival"} — ${payload.venueName ?? "a room"}`,
      description: (payload.termsLine as string) ?? null,
      startGameTime: nightGameTime,
      endGameTime: new Date(nightGameTime.getTime() + 4 * 60 * 60 * 1000),
      relatedEntityType: "BATTLE",
      relatedEntityId: battle.id,
      status: "SCHEDULED",
    });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattleChallengeAccepted,
      actorType: "USER",
      actorId: input.userId,
      /* The person, not the battle: this is what the relationship fold reads. */
      targetType: "CHARACTER",
      targetId: opportunity.sourceEntityId,
      visibility: "PRIVATE",
      importance: 60,
      occurredAt: career.currentGameDate,
      idempotencyKey: `battle:${battle.id}:accepted`,
      payload: {
        battleId: battle.id,
        opportunityId: opportunity.id,
        rivalName: payload.rivalName ?? null,
        venueName: payload.venueName ?? null,
        nightGameTime: nightGameTime.toISOString(),
      },
    });

    return { battle, calendarItemId };
  });

  if (!applied) {
    return err(DomainErrors.invalidCareerState("That challenge isn't yours to take any more."));
  }

  await trackAnalytics(ctx, {
    name: "battle_challenge_accepted",
    userId: input.userId,
    careerId: career.id,
    properties: { battleId: applied.battle.id },
  });

  return ok(applied);
}

/**
 * Turn a challenge down.
 *
 * **A decision, and a complete one.** No battle row is created, because no battle
 * happened; the opportunity records the refusal, a canonical event records who
 * refused whom, and M6's fold prices it as `CHALLENGE_DECLINED` — an interaction
 * whose permitted dimensions are familiarity and tension and which **cannot move
 * respect in either direction**.
 *
 * Nothing here is a penalty. An artist who never battles is an artist who chose
 * not to, and the only thing that follows from refusing is that the person who
 * asked now knows it.
 */
export async function declineBattleChallenge(
  ctx: CommandContext,
  input: { careerId: string; userId: string; opportunityId: string },
): Promise<Result<OpportunityRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const loaded = await loadChallenge(ctx, career, input.opportunityId);
  if (!loaded.ok) return loaded;
  const { opportunity, payload } = loaded.value;

  const now = contextNow(ctx);

  const declined = await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(opportunities)
      .set({ status: "DECLINED", declinedAt: now, updatedAt: now })
      .where(and(eq(opportunities.id, opportunity.id), eq(opportunities.status, "AVAILABLE")))
      .returning();

    if (!updated[0]) return null;

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattleChallengeDeclined,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CHARACTER",
      targetId: opportunity.sourceEntityId,
      /*
       * Private. A completed battle is something the scene saw; a challenge
       * nobody accepted is not, and the world learns what happened rather than
       * what was proposed or refused.
       */
      visibility: "PRIVATE",
      importance: 40,
      occurredAt: career.currentGameDate,
      idempotencyKey: `challenge:${opportunity.id}:declined`,
      payload: {
        opportunityId: opportunity.id,
        rivalName: payload.rivalName ?? null,
        /* Stated on the row so nothing downstream has to infer it. */
        note: "Declining is not a loss and carries no respect penalty.",
      },
    });

    return updated[0];
  });

  if (!declined) {
    return err(DomainErrors.invalidCareerState("That challenge isn't yours to answer any more."));
  }

  await trackAnalytics(ctx, {
    name: "battle_challenge_declined",
    userId: input.userId,
    careerId: career.id,
    properties: { opportunityId: opportunity.id },
  });

  return ok(declined);
}

async function loadChallenge(
  ctx: CommandContext,
  career: CareerRow,
  opportunityId: string,
): Promise<
  Result<
    { opportunity: OpportunityRow; rivalArtistId: string; payload: Record<string, unknown> },
    DomainError
  >
> {
  const rows = await ctx.db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .limit(1);

  const opportunity = rows[0];
  if (!opportunity || opportunity.careerId !== career.id) {
    return err(DomainErrors.invalidInput("That challenge doesn't exist."));
  }
  if (opportunity.type !== "BATTLE_CHALLENGE") {
    return err(DomainErrors.invalidInput("That offer isn't a challenge."));
  }
  if (opportunity.status !== "AVAILABLE") {
    return err(
      DomainErrors.invalidCareerState(
        opportunity.status === "EXPIRED"
          ? "That one lapsed."
          : "That challenge isn't yours to answer any more.",
      ),
    );
  }

  const payload = opportunity.payload as Record<string, unknown>;
  const rivalArtistId = payload.rivalArtistId as string | undefined;
  if (!rivalArtistId) {
    return err(DomainErrors.invalidCareerState("There is nobody on the other side of that."));
  }

  return ok({ opportunity, rivalArtistId, payload });
}

/* ------------------------------------------------------------------ scouting */

/**
 * Look into somebody.
 *
 * Reveals recorded facts and changes nothing else. The report is persisted so
 * that what was knowable *then* stays knowable, and it is written to its own
 * table — no judge and no performance derivation can reach it.
 *
 * Idempotent per battle and subject: looking twice is looking once.
 */
export async function scoutBattleOpponent(
  ctx: CommandContext,
  input: { careerId: string; userId: string; battleId: string },
): Promise<Result<ScoutingReport, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const battle = await loadBattle(ctx, career, input.battleId);
  if (!battle.ok) return battle;
  const row = battle.value;

  const rivalArtistId = opponentArtistOf(row);
  if (!rivalArtistId) return err(DomainErrors.invalidCareerState("Nobody to scout."));

  const existing = await ctx.db
    .select()
    .from(battleScoutingReports)
    .where(
      and(
        eq(battleScoutingReports.battleId, row.id),
        eq(battleScoutingReports.subjectArtistId, rivalArtistId),
      ),
    )
    .limit(1);

  if (existing[0]) {
    // Already looked. The recorded report stands rather than being re-derived.
    return ok({
      subjectArtistId: rivalArtistId,
      findings: existing[0].findings,
      unknowns: existing[0].unknowns,
      scoutedAtGameTime: existing[0].scoutedAtGameTime.toISOString(),
    });
  }

  const rival = await loadCompetitor(ctx.db, rivalArtistId);
  if (!rival) return err(DomainErrors.invalidCareerState("Nobody to scout."));

  const [characterRows, relationshipRows, cohortStanding, priorRows] = await Promise.all([
    ctx.db.select().from(characters).where(eq(characters.artistId, rivalArtistId)).limit(1),
    ctx.db.select().from(relationships).where(eq(relationships.careerId, career.id)),
    loadCohortStanding(ctx.db, career.worldId, career.id),
    ctx.db.select().from(battles).where(eq(battles.careerId, career.id)),
  ]);

  const character = characterRows[0];
  const relationship = character
    ? relationshipRows.find((entry) => entry.subjectId === character.id)
    : undefined;

  const profile = (character?.preferences as { battler?: { sceneSlug: string } } | undefined)
    ?.battler;
  const sceneSlug = profile?.sceneSlug ?? "braamfontein";

  const settled = priorRows.filter(
    (entry) => entry.status === "RESOLVED" && opponentArtistOf(entry) === rivalArtistId,
  );

  const report = scoutOpponent({
    subjectArtistId: rivalArtistId,
    subjectName: rival.artist.stageName,
    fame: rival.artist.fame,
    respect: rival.artist.respect,
    sceneSlug,
    sceneStanding: sceneStanding(sceneSlug, cohortStanding).value,
    relationship: relationship
      ? {
          rivalry: relationship.rivalry,
          respect: relationship.respect,
          tension: relationship.tension,
        }
      : null,
    interactionCount: relationship?.interactionCount ?? 0,
    priorBattles: {
      won: settled.filter((entry) => entry.winnerArtistId === playerArtistOf(entry)).length,
      lost: settled.filter((entry) => entry.loserArtistId === playerArtistOf(entry)).length,
    },
    /* Nobody declares an angle in advance. Guessing would not be scouting. */
    knownStrategy: null,
    scoutedAtGameTime: career.currentGameDate,
  });

  await ctx.db.transaction(async (tx) => {
    const written = await tx
      .insert(battleScoutingReports)
      .values({
        id: ids.generic(),
        battleId: row.id,
        careerId: career.id,
        subjectArtistId: rivalArtistId,
        findings: report.findings,
        unknowns: report.unknowns,
        scoutedAtGameTime: career.currentGameDate,
      })
      .onConflictDoNothing({
        target: [battleScoutingReports.battleId, battleScoutingReports.subjectArtistId],
      })
      .returning();

    if (!written[0]) return;

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattleOpponentScouted,
      actorType: "USER",
      actorId: input.userId,
      targetType: "BATTLE",
      targetId: row.id,
      visibility: "PRIVATE",
      importance: 20,
      occurredAt: career.currentGameDate,
      idempotencyKey: `battle:${row.id}:scouted:${rivalArtistId}`,
      payload: {
        subjectArtistId: rivalArtistId,
        findings: report.findings.length,
        unknowns: report.unknowns.length,
        /* Stated, because it is the property that matters about scouting. */
        note: "Scouting reveals recorded facts. It is not an input to any judge.",
      },
    });
  });

  return ok(report);
}

/* ------------------------------------------------- strategy and preparation */

/**
 * Declare the angle.
 *
 * Before preparation and never after, because preparing for a plan you have not
 * chosen is not preparation. The declaration is written to the performance row
 * ahead of the round existing, which is what lets the Strategic judge later ask
 * whether what happened matched what was said.
 */
export async function declareBattleStrategy(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    battleId: string;
    strategy: BattleStrategy;
  },
): Promise<Result<BattleRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (!BATTLE_STRATEGIES.includes(input.strategy)) {
    return err(DomainErrors.invalidInput("That isn't an angle you can take."));
  }

  const loaded = await loadBattle(ctx, career, input.battleId);
  if (!loaded.ok) return loaded;
  const row = loaded.value;

  if (!["ACCEPTED", "SCHEDULED"].includes(row.status)) {
    return err(
      DomainErrors.invalidCareerState(
        row.status === "RESOLVED" || row.status === "JUDGED"
          ? "That one has already been decided."
          : "You can't choose an angle for that.",
      ),
    );
  }

  const playerArtistId = playerArtistOf(row);
  if (!playerArtistId) return err(DomainErrors.invalidCareerState("Nobody to declare for."));

  const now = contextNow(ctx);

  const updated = await ctx.db.transaction(async (tx) => {
    const values = {
      strategy: input.strategy,
      strategyDeclaredAtGameTime: career.currentGameDate,
      updatedAt: now,
    };

    await tx
      .insert(battlePerformances)
      .values({
        id: ids.generic(),
        battleId: row.id,
        artistId: playerArtistId,
        side: row.playerSide ?? "OPPONENT",
        ...values,
      })
      .onConflictDoUpdate({
        target: [battlePerformances.battleId, battlePerformances.side],
        /* Re-declaring before the night is allowed; the last word stands. */
        set: values,
      });

    const battleRows = await tx
      .update(battles)
      .set({ status: "SCHEDULED", updatedAt: now })
      .where(eq(battles.id, row.id))
      .returning();

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattleStrategyDeclared,
      actorType: "USER",
      actorId: input.userId,
      targetType: "BATTLE",
      targetId: row.id,
      visibility: "PRIVATE",
      importance: 35,
      occurredAt: career.currentGameDate,
      /* Keyed on the angle, so changing your mind is its own recorded fact. */
      idempotencyKey: `battle:${row.id}:strategy:${input.strategy}`,
      payload: { battleId: row.id, strategy: input.strategy },
    });

    return battleRows[0]!;
  });

  return ok(updated);
}

/**
 * Prepare.
 *
 * **Preparation costs something scarce, and the something is not new.** It spends
 * money through the same ledger a studio session spends it through, and it
 * occupies days on the same calendar every other commitment occupies — which is
 * the point: the days are days a record could have had, so entering a battle
 * becomes a decision about the career rather than only about the battle.
 *
 * It raises the ceiling and does not guarantee the floor. The lift is
 * proportional to what the artist can already do (see `preparationLift`), is
 * bounded at `MAX_PREPARATION_SESSIONS`, and cannot lift anybody past somebody
 * genuinely better — a prepared artist can and does still lose.
 *
 * There is no battle XP here, no token, and no currency of any kind.
 */
export async function prepareForBattle(
  ctx: CommandContext,
  input: { careerId: string; userId: string; battleId: string; sessions: number },
): Promise<Result<{ battle: BattleRow; preparation: BattlePreparation }, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const loaded = await loadBattle(ctx, career, input.battleId);
  if (!loaded.ok) return loaded;
  const row = loaded.value;

  if (!["ACCEPTED", "SCHEDULED"].includes(row.status)) {
    return err(DomainErrors.invalidCareerState("There's nothing left to prepare for."));
  }

  const sessions = Math.floor(input.sessions);
  if (sessions < 1 || sessions > MAX_PREPARATION_SESSIONS) {
    return err(
      DomainErrors.invalidInput(
        `You can put between one and ${MAX_PREPARATION_SESSIONS} sessions into it.`,
      ),
    );
  }

  const playerArtistId = playerArtistOf(row);
  if (!playerArtistId) return err(DomainErrors.invalidCareerState("Nobody to prepare."));

  const performanceRows = await ctx.db
    .select()
    .from(battlePerformances)
    .where(
      and(
        eq(battlePerformances.battleId, row.id),
        eq(battlePerformances.artistId, playerArtistId),
      ),
    )
    .limit(1);

  const existing = performanceRows[0];
  if (!existing) {
    /* The angle first. Preparing for a plan you have not chosen is not a plan. */
    return err(
      DomainErrors.invalidCareerState("Choose your angle before you start working on it."),
    );
  }

  const alreadyDone = existing.preparationSessions;
  const remaining = MAX_PREPARATION_SESSIONS - alreadyDone;
  if (remaining <= 0) {
    return err(DomainErrors.invalidCareerState("You've done as much as this is going to give."));
  }

  const doing = Math.min(sessions, remaining);
  const costMinor = doing * PREPARATION_SESSION_COST_MINOR;

  if (career.moneyBalance < costMinor) {
    return err(DomainErrors.invalidInput("You can't afford that much studio time."));
  }

  const now = contextNow(ctx);

  const applied = await ctx.db.transaction(async (tx) => {
    const charged = await applyMoneyMovement(tx, {
      careerId: career.id,
      direction: "DEBIT",
      amountMinor: costMinor,
      category: "STUDIO_COST",
      description: `Preparing for a battle — ${doing} session${doing === 1 ? "" : "s"}`,
      relatedEntityType: "BATTLE",
      relatedEntityId: row.id,
      // Keyed per battle and per cumulative total, so a retry cannot charge twice.
      idempotencyKey: `battle:${row.id}:prep:${alreadyDone + doing}`,
      occurredAt: now,
    });

    if (!charged.ok) return { failed: charged.reason } as const;

    const totalSessions = alreadyDone + doing;

    /*
     * The days. Booked as REHEARSAL — which the calendar has meant since M2 —
     * rather than as a battle-specific type, and they occupy the run-up to the
     * night, so preparation genuinely competes with anything else wanting those
     * days.
     */
    const night = row.scheduledGameTime ?? career.currentGameDate;
    for (let index = 0; index < doing; index += 1) {
      const day = new Date(
        night.getTime() - (alreadyDone + index + 1) * PREPARATION_SESSION_DAYS * DAYS,
      );

      await tx.insert(calendarItems).values({
        id: ids.generic(),
        careerId: career.id,
        type: "REHEARSAL",
        title: "Working on the round",
        startGameTime: day,
        endGameTime: new Date(day.getTime() + 4 * 60 * 60 * 1000),
        relatedEntityType: "BATTLE",
        relatedEntityId: row.id,
        status: "SCHEDULED",
      });
    }

    const preparation: BattlePreparation = {
      sessions: totalSessions,
      spendMinor: existing.preparationSpendMinor + costMinor,
      daysCommitted: totalSessions * PREPARATION_SESSION_DAYS,
    };

    await tx
      .update(battlePerformances)
      .set({
        preparationSessions: totalSessions,
        preparationSpendMinor: preparation.spendMinor,
        preparation,
        updatedAt: now,
      })
      .where(eq(battlePerformances.id, existing.id));

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattlePreparationCompleted,
      actorType: "USER",
      actorId: input.userId,
      targetType: "BATTLE",
      targetId: row.id,
      visibility: "PRIVATE",
      importance: 30,
      occurredAt: career.currentGameDate,
      idempotencyKey: `battle:${row.id}:prep:${totalSessions}`,
      payload: {
        battleId: row.id,
        sessionsAdded: doing,
        sessionsTotal: totalSessions,
        spentMinor: costMinor,
        daysCommitted: preparation.daysCommitted,
      },
    });

    return { preparation };
  });

  if ("failed" in applied) {
    return err(DomainErrors.invalidInput("You can't afford that much studio time."));
  }

  return ok({ battle: row, preparation: applied.preparation });
}

async function loadBattle(
  ctx: CommandContext,
  career: CareerRow,
  battleId: string,
): Promise<Result<BattleRow, DomainError>> {
  const rows = await ctx.db.select().from(battles).where(eq(battles.id, battleId)).limit(1);
  const row = rows[0];
  if (!row || row.careerId !== career.id) {
    return err(DomainErrors.invalidInput("That battle doesn't exist."));
  }
  return ok(row);
}

export { MAX_PREPARATION_SESSIONS, PREPARATION_SESSION_COST_MINOR };

/* ----------------------------------------------------------- the night itself */

export type ResolveBattleResult = {
  battle: BattleRow;
  result: BattleResult;
  /** What moved, and why. The same shape reception's pressure has. */
  consequences: Record<string, unknown>;
  /** False when this battle had already been resolved and nothing changed. */
  ran: boolean;
};

/**
 * Which angle a rival takes.
 *
 * Deterministic and explainable: they take the one they are best at. That is
 * both what a competent competitor does and the only choice that can be
 * reconstructed months later — an NPC that rolled for its plan would make its own
 * battle inexplicable. No `Math.random`, no clock, and nothing that reads the
 * player's declaration, because nobody announces an angle in advance.
 */
function rivalStrategy(competitor: Competitor): BattleStrategy {
  const ranked = [...BATTLE_STRATEGIES].sort((a, b) => {
    const difference =
      strategyAptitude(b, competitor.skills, competitor.psychology) -
      strategyAptitude(a, competitor.skills, competitor.psychology);
    // Ties break on the name, so the same rival always makes the same choice.
    return difference !== 0 ? difference : a.localeCompare(b);
  });
  return ranked[0]!;
}

/**
 * The battle happens, is judged, and its consequences land.
 *
 * One transaction, and deliberately one command rather than four. Performing,
 * judging and resolving are separable in the *lifecycle* — and the row records
 * each of them — but they must not be separately retryable, because a battle that
 * was performed and not judged, or judged and not priced, is a world in a state
 * nothing else knows how to read.
 *
 * **Idempotency, in three independent layers.** The status guard means a resolved
 * battle is a no-op; the unique indexes on `(battle_id, side)` and
 * `(battle_id, judge)` make a second performance or a second vote impossible
 * rather than merely refused; and every event carries a key, so consequences
 * cannot be applied twice even if this were called concurrently.
 *
 * **Nothing here decides anything.** The performances come from the pure
 * simulator, the verdicts from three pure judges, the result from counting their
 * votes, and the standing movement from a pure pricing function. This function
 * reads, writes and records.
 */
export async function resolveBattle(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    battleId: string;
    /**
     * The night's seed, honoured on the first resolution only.
     *
     * The same affordance `simulateReceptionTick` has exposed since M5, for the
     * same reason: two careers built identically must be able to share a roll so
     * that a comparison between them is a comparison of their *decisions*. Left
     * unset — as every caller in the app leaves it — the seed is derived from the
     * battle's own identity, so no two battles ever share one.
     */
    seed?: string;
  },
): Promise<Result<ResolveBattleResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const loaded = await loadBattle(ctx, career, input.battleId);
  if (!loaded.ok) return loaded;
  const row = loaded.value;

  if (row.status === "RESOLVED") {
    /* Already fought. Hand back what exists rather than fighting it again. */
    const existing = await readResolved(ctx, row);
    return ok({ battle: row, result: existing, consequences: row.consequences, ran: false });
  }
  if (row.status === "DECLINED") {
    return err(DomainErrors.invalidCareerState("You turned that one down."));
  }
  if (!["ACCEPTED", "SCHEDULED"].includes(row.status)) {
    return err(DomainErrors.invalidCareerState("That battle isn't ready to happen."));
  }

  /*
   * A battle cannot be fought before the night it was set for. Time creates; a
   * command may not bring a commitment forward because somebody asked it to.
   */
  if (row.scheduledGameTime && career.currentGameDate < row.scheduledGameTime) {
    return err(DomainErrors.invalidCareerState("That night hasn't come round yet."));
  }

  const playerArtistId = playerArtistOf(row);
  const rivalArtistId = opponentArtistOf(row);
  if (!playerArtistId || !rivalArtistId) {
    return err(DomainErrors.invalidCareerState("That battle is missing somebody."));
  }

  const [player, rival, cohorts, cohortStanding, performanceRows, sceneRows] = await Promise.all([
    loadCompetitor(ctx.db, playerArtistId),
    loadCompetitor(ctx.db, rivalArtistId),
    loadBattleCohorts(ctx.db, career.worldId),
    loadCohortStanding(ctx.db, career.worldId, career.id),
    ctx.db.select().from(battlePerformances).where(eq(battlePerformances.battleId, row.id)),
    row.sceneId
      ? ctx.db
          .select()
          .from((await import("@music-rpg/database")).scenes)
          .where(eq((await import("@music-rpg/database")).scenes.id, row.sceneId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  if (!player || !rival) {
    return err(DomainErrors.invalidCareerState("Somebody in that battle no longer exists."));
  }

  const declared = performanceRows.find((entry) => entry.artistId === playerArtistId);
  if (!declared) {
    return err(DomainErrors.invalidCareerState("You haven't said how you're going into this."));
  }

  const sceneSlug = sceneRows[0]?.slug ?? "braamfontein";
  const playerSide: BattleSide = row.playerSide ?? "OPPONENT";
  const rivalSide: BattleSide = playerSide === "CHALLENGER" ? "OPPONENT" : "CHALLENGER";

  /*
   * The seed. Built from the battle's own id and the engine version, so the same
   * battle replays identically forever and two battles never share a night's
   * nerves. No clock and no randomness anywhere in the chain below.
   */
  const seed = row.seed ?? input.seed ?? `battle:${row.id}:${BATTLE_SIMULATOR_VERSION}`;

  const playerPreparation: BattlePreparation = {
    sessions: declared.preparationSessions,
    spendMinor: declared.preparationSpendMinor,
    daysCommitted: declared.preparationSessions * PREPARATION_SESSION_DAYS,
  };

  const playerPerformance = performBattleRound({
    side: playerSide,
    artistId: playerArtistId,
    skills: player.skills,
    psychology: player.psychology,
    strategy: declared.strategy,
    preparation: playerPreparation,
    /*
     * Keyed on the *side* rather than on the artist. The default seed already
     * carries the battle's own id, so two battles never share a night's nerves —
     * and keying the rest on a stable role is what lets an explicit seed make two
     * separately-built careers genuinely comparable, exactly as reception's does.
     */
    seed: `${seed}:${playerSide}`,
  });

  const rivalPerformance = performBattleRound({
    side: rivalSide,
    artistId: rivalArtistId,
    skills: rival.skills,
    psychology: rival.psychology,
    strategy: rivalStrategy(rival),
    /* Rivals do not spend the player's scarce things. They arrive as they are. */
    preparation: NO_PREPARATION,
    seed: `${seed}:${rivalSide}`,
  });

  const bySide = {
    [playerSide]: { performance: playerPerformance, competitor: player },
    [rivalSide]: { performance: rivalPerformance, competitor: rival },
  } as Record<BattleSide, { performance: typeof playerPerformance; competitor: Competitor }>;

  const playerStanding = sceneStanding(sceneSlug, cohortStanding).value;
  /*
   * The rival's standing in their own scene, from the world's record of them
   * rather than from a second reception model. A rival with a reputation is a
   * fact the world already holds on the artist row.
   */
  const rivalStanding = rival.artist.respect;

  const judgements = convenePanel({
    challenger: {
      performance: bySide.CHALLENGER.performance,
      skills: bySide.CHALLENGER.competitor.skills,
      psychology: bySide.CHALLENGER.competitor.psychology,
      sceneStanding: playerSide === "CHALLENGER" ? playerStanding : rivalStanding,
    },
    opponent: {
      performance: bySide.OPPONENT.performance,
      skills: bySide.OPPONENT.competitor.skills,
      psychology: bySide.OPPONENT.competitor.psychology,
      sceneStanding: playerSide === "OPPONENT" ? playerStanding : rivalStanding,
    },
    sceneSlug,
    cohorts,
  });

  const result = deriveResult({
    judgements,
    challengerArtistId: bySide.CHALLENGER.performance.artistId,
    opponentArtistId: bySide.OPPONENT.performance.artistId,
  });

  const capacity = Number(
    (row.challengeState as { capacity?: number }).capacity ??
      (await capacityOf(ctx, rivalArtistId)) ??
      120,
  );

  const pressure = battleStandingPressure({ result, playerSide, capacity });
  const interactions = battleInteractionsFor({ result, playerSide });
  const now = contextNow(ctx);

  const applied = await ctx.db.transaction(async (tx) => {
    /*
     * The status guard is the arbiter. A concurrent or replayed call finds the
     * battle already past SCHEDULED and does nothing at all — before a single
     * performance, vote or metric has been written.
     */
    const claimed = await tx
      .update(battles)
      .set({ status: "PERFORMED", performedAt: now, seed, updatedAt: now })
      .where(and(eq(battles.id, row.id), inArray(battles.status, ["ACCEPTED", "SCHEDULED"])))
      .returning();

    if (!claimed[0]) return null;

    /* 1. What each of them actually did. Canonical facts, before any judging. */
    for (const performance of [playerPerformance, rivalPerformance]) {
      const facts = performance.facts;
      const values = {
        ...facts,
        derivation: performance.derivation,
        simulatorVersion: performance.simulatorVersion,
        submittedAtGameTime: career.currentGameDate,
        updatedAt: now,
      };

      await tx
        .insert(battlePerformances)
        .values({
          id: ids.generic(),
          battleId: row.id,
          artistId: performance.artistId,
          side: performance.side,
          strategy: performance.strategy,
          ...values,
        })
        .onConflictDoUpdate({
          target: [battlePerformances.battleId, battlePerformances.side],
          // The declared angle and the preparation already on the row stand.
          set: values,
        });
    }

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattlePerformed,
      actorType: "SYSTEM",
      targetType: "BATTLE",
      targetId: row.id,
      visibility: "PRIVATE",
      importance: 45,
      occurredAt: career.currentGameDate,
      idempotencyKey: `battle:${row.id}:performed`,
      payload: {
        simulatorVersion: BATTLE_SIMULATOR_VERSION,
        seed,
        challengerStrategy: bySide.CHALLENGER.performance.strategy,
        opponentStrategy: bySide.OPPONENT.performance.strategy,
        challengerFacts: bySide.CHALLENGER.performance.facts,
        opponentFacts: bySide.OPPONENT.performance.facts,
      },
    });

    /* 2. Each judge, independently, with its own decomposition. */
    for (const decision of judgements) {
      await tx
        .insert(battleJudgements)
        .values({
          id: ids.generic(),
          battleId: row.id,
          judge: decision.judge,
          panelRole: decision.panelRole,
          verdictSide: decision.verdict,
          verdictArtistId: bySide[decision.verdict].performance.artistId,
          challengerTotal: decision.challengerTotal,
          opponentTotal: decision.opponentTotal,
          margin: decision.margin,
          contributions: decision.contributions,
          irrelevant: decision.irrelevant,
          engineVersion: decision.engineVersion,
          judgedAtGameTime: career.currentGameDate,
        })
        // Each judge votes exactly once. Structural, not merely refused.
        .onConflictDoNothing({ target: [battleJudgements.battleId, battleJudgements.judge] });

      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.BattleJudged,
        actorType: "SYSTEM",
        targetType: "BATTLE",
        targetId: row.id,
        visibility: "PRIVATE",
        importance: 40,
        occurredAt: career.currentGameDate,
        idempotencyKey: `battle:${row.id}:judged:${decision.judge}`,
        payload: {
          judge: decision.judge,
          question: decision.question,
          verdict: decision.verdict,
          challengerTotal: decision.challengerTotal,
          opponentTotal: decision.opponentTotal,
          margin: decision.margin,
          // The argument, not the number. This is what makes it answerable.
          contributions: decision.contributions,
          irrelevant: decision.irrelevant,
        },
      });
    }

    /* 3. The panel's agreement. Derived from the votes and nothing else. */
    const playerWon = result.winner === playerSide;

    const consequences = {
      pressure,
      interactions,
      contestMargin: contestMargin(result),
      decision: result.decision,
      split: result.split,
      capacity,
      /* Said out loud on the row, because it is an invariant of the milestone. */
      legacy: "unchanged — battles have no path to Legacy",
    };

    const resolved = await tx
      .update(battles)
      .set({
        status: "RESOLVED",
        outcome: playerWon ? "WON" : "LOST",
        winnerArtistId: result.winnerArtistId,
        loserArtistId: result.loserArtistId,
        decision: result.decision,
        consequences,
        occurredAt: career.currentGameDate,
        judgedAt: now,
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(battles.id, row.id))
      .returning();

    /*
     * The public fact. The only LOCAL_PUBLIC event in this file, and the reason
     * is the brief's: the scene learns what *happened*, not what was proposed. A
     * challenge nobody accepted never reaches the world.
     */
    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattleResolved,
      actorType: "SYSTEM",
      targetType: "BATTLE",
      targetId: row.id,
      visibility: "LOCAL_PUBLIC",
      importance: 70,
      occurredAt: career.currentGameDate,
      idempotencyKey: `battle:${row.id}:resolved`,
      payload: {
        battleId: row.id,
        sceneSlug,
        winnerArtistId: result.winnerArtistId,
        loserArtistId: result.loserArtistId,
        decision: result.decision,
        split: result.split,
        engineVersion: BATTLE_JUDGE_ENGINE_VERSION,
        votes: judgements.map((entry) => ({ judge: entry.judge, verdict: entry.verdict })),
      },
    });

    /* 4. Standing, through M5's accrual. The same two readers, the same numbers. */
    await applyBattleStanding(tx, { career, pressure, now });

    /*
     * 5. What happened between the two people, as named interactions.
     *
     * Written to the event rather than to `relationships` directly: M6's fold
     * owns that table, reads this event on the next sync, and prices these
     * exactly as it prices a refused idea. Nothing here touches a dimension.
     */
    const rivalCharacter = await tx
      .select()
      .from(characters)
      .where(eq(characters.artistId, rivalArtistId))
      .limit(1);

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.BattleConsequencesApplied,
      actorType: "SYSTEM",
      targetType: "CHARACTER",
      targetId: rivalCharacter[0]?.id ?? null,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: career.currentGameDate,
      idempotencyKey: `battle:${row.id}:consequences`,
      payload: {
        battleId: row.id,
        /* The semantic vocabulary. M6 folds these; it does not re-derive them. */
        interactions,
        pressure,
        decision: result.decision,
        note: "Legacy is not written by battles.",
      },
    });

    return { battle: resolved[0]!, consequences };
  });

  if (!applied) {
    const settled = await loadBattle(ctx, career, input.battleId);
    if (!settled.ok) return settled;
    return ok({
      battle: settled.value,
      result: await readResolved(ctx, settled.value),
      consequences: settled.value.consequences,
      ran: false,
    });
  }

  await trackAnalytics(ctx, {
    name: "battle_resolved",
    userId: input.userId,
    careerId: career.id,
    properties: {
      battleId: row.id,
      decision: result.decision,
      split: result.split,
      won: result.winner === playerSide,
    },
  });

  return ok({
    battle: applied.battle,
    result,
    consequences: applied.consequences,
    ran: true,
  });
}

/**
 * Standing, through the model that already owns it.
 *
 * `accrueMetric` and `career_metric_pressure` are M5's, and this writes them the
 * way reception does — the accrual is the source, and both the career's copy and
 * the controlled entity's copy are written from it inside one transaction so the
 * two surfaces can never disagree.
 *
 * **Legacy is absent from `standing` and therefore cannot arrive here**, which is
 * the same discipline `writeCareerConsequences` has held since M5. There is no
 * accrual column for it and no term producing one.
 */
async function applyBattleStanding(
  tx: Tx,
  input: {
    career: CareerRow;
    pressure: { fame: number; respect: number; heat: number };
    now: Date;
  },
): Promise<void> {
  const rows = await tx
    .select()
    .from(careerMetricPressure)
    .where(eq(careerMetricPressure.careerId, input.career.id))
    .limit(1);
  const current = rows[0];

  const fame = accrueMetric(current?.fameAccrued ?? 0, input.pressure.fame);
  const respect = accrueMetric(current?.respectAccrued ?? 0, input.pressure.respect);
  const heat = accrueMetric(current?.heatAccrued ?? 0, input.pressure.heat);

  await tx
    .insert(careerMetricPressure)
    .values({
      careerId: input.career.id,
      fameAccrued: fame.accrued,
      respectAccrued: respect.accrued,
      heatAccrued: heat.accrued,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: careerMetricPressure.careerId,
      set: {
        fameAccrued: fame.accrued,
        respectAccrued: respect.accrued,
        heatAccrued: heat.accrued,
        updatedAt: input.now,
      },
    });

  const standing = { fame: fame.value, respect: respect.value, heat: heat.value };

  await tx
    .update(careers)
    .set({ ...standing, updatedAt: input.now })
    .where(eq(careers.id, input.career.id));

  if (input.career.controlledEntityType === "ARTIST" && input.career.controlledEntityId) {
    await tx
      .update(artists)
      .set({ ...standing, updatedAt: input.now })
      .where(eq(artists.id, input.career.controlledEntityId));
  } else if (input.career.controlledEntityType === "GROUP" && input.career.controlledEntityId) {
    await tx
      .update(groups)
      .set({ ...standing, updatedAt: input.now })
      .where(eq(groups.id, input.career.controlledEntityId));
  }
}

/** The recorded verdicts of a battle that has already been decided. */
async function readResolved(ctx: CommandContext, row: BattleRow): Promise<BattleResult> {
  const judgementRows = await ctx.db
    .select()
    .from(battleJudgements)
    .where(eq(battleJudgements.battleId, row.id))
    .orderBy(asc(battleJudgements.judge));

  const judgements = judgementRows.map((entry) => ({
    judge: entry.judge,
    panelRole: entry.panelRole,
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
    winnerArtistId: row.winnerArtistId ?? "",
    loserArtistId: row.loserArtistId ?? "",
    decision: row.decision ?? "",
    judgements,
    split: !row.decision?.endsWith("-0"),
    engineVersion: BATTLE_JUDGE_ENGINE_VERSION,
  };
}

/** The room, from the rival's own profile. Fame reads it and nothing else does. */
async function capacityOf(ctx: CommandContext, rivalArtistId: string): Promise<number | null> {
  const rows = await ctx.db
    .select()
    .from(characters)
    .where(eq(characters.artistId, rivalArtistId))
    .limit(1);

  const profile = (rows[0]?.preferences as { battler?: { capacity?: number } } | undefined)
    ?.battler;
  return profile?.capacity ?? null;
}
