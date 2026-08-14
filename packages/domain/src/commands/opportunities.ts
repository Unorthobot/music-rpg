import { and, asc, eq, inArray, isNotNull, lte, notInArray, or } from "drizzle-orm";
import {
  artistAudience,
  audienceCohorts,
  calendarItems,
  characters,
  creativeSessions,
  opportunities,
  opportunityConflicts,
  opportunityDirectorRuns,
  relationshipMoments,
  relationships,
  releasePerformance,
  releases,
  scenes,
  tracks,
  type CareerRow,
  type CharacterRow,
  type OpportunityRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { direct, type ProducerProfile } from "@music-rpg/simulation";
import {
  OPPORTUNITY_DIRECTOR_VERSION,
  RELATIONSHIP_DIMENSIONS,
  err,
  formatMoney,
  ids,
  ok,
  type BattlerFacts,
  type CandidateAssessment,
  type CohortStandingFacts,
  type CommitmentFacts,
  type DirectorFacts,
  type DirectorTrace,
  type MomentKind,
  type OpportunityCandidate,
  type PersonFacts,
  type PromoterFacts,
  type RelationshipState,
  type Result,
} from "@music-rpg/shared";
import { contextNow, track as trackAnalytics, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import {
  bookProducerSession,
  loadProducer,
  producerProfileOfCharacter,
} from "../internal/book-session";
import { loadBattleFactsByCharacter } from "./battles";
import { loadOwnedCareer } from "../internal/career";
import { DAYS } from "../internal/clock";

/**
 * The Opportunity Director, wired into the world.
 *
 * This file orchestrates; it does not decide. Every judgement is made by the
 * pure director in `@music-rpg/simulation`, and everything here is about reading
 * the canonical projections the other systems own, writing the consequences and
 * the events that explain them inside one transaction, and refusing to do it
 * twice.
 *
 * Three rules bound the whole thing.
 *
 * 1. **Time creates, screens reveal.** New opportunities exist because a day
 *    passed. Nothing in a render path may call the director, and expiry is a
 *    sweep on the day advance rather than a check performed when somebody looks.
 * 2. **Consume the projections; do not rebuild them.** Reception is read from
 *    `release_performance` and `artist_audience`, relationships from
 *    `relationships`, open moments from `relationship_moments`, commitments from
 *    `calendar_items`. Nothing here re-simulates a record, re-derives a
 *    relationship, re-detects a moment or invents a metric.
 * 3. **An opportunity is a situation, not a reward.** Accepting one writes the
 *    row, the booking it implies, and canonical events. It does not move Fame,
 *    Respect, Heat or a single relationship dimension. What the player does next
 *    is what has consequences, and the systems that price those already exist.
 */

/* ------------------------------------------------------------------ reading */

function stateOf(row: Record<string, unknown>): RelationshipState {
  return Object.fromEntries(
    RELATIONSHIP_DIMENSIONS.map((dimension) => [dimension, Number(row[dimension] ?? 0)]),
  ) as RelationshipState;
}

function promoterFactsOf(preferences: Record<string, unknown> | null): PromoterFacts | null {
  const profile = (preferences as { promoter?: PromoterFacts } | null)?.promoter;
  return profile ?? null;
}

/** A rival's competitive profile, read structurally exactly as a promoter's is. */
function battlerFactsOf(preferences: Record<string, unknown> | null): BattlerFacts | null {
  const profile = (preferences as { battler?: BattlerFacts } | null)?.battler;
  return profile ?? null;
}

function sessionCostOf(preferences: Record<string, unknown> | null): number | null {
  const profile = (preferences as { producer?: { sessionCostMinor?: number } } | null)?.producer;
  return profile?.sessionCostMinor ?? null;
}

/**
 * Everything the director is allowed to know, gathered from the systems that own
 * it.
 *
 * Deliberately one function. A director that reached for a table mid-decision
 * could not be tested without a database, and worse, could not be shown to have
 * consumed only recorded facts.
 */
export async function loadDirectorFacts(
  ctx: CommandContext,
  career: CareerRow,
): Promise<DirectorFacts> {
  const [
    releaseRows,
    performanceRows,
    cohortRows,
    audienceRows,
    sceneRows,
    characterRows,
    relationshipRows,
    momentRows,
    calendarRows,
    sessionRows,
    opportunityRows,
    trackRows,
  ] = await Promise.all([
    ctx.db
      .select()
      .from(releases)
      .where(and(eq(releases.careerId, career.id), eq(releases.status, "RELEASED")))
      .orderBy(asc(releases.releasedGameTime)),
    ctx.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, career.id)),
    ctx.db
      .select()
      .from(audienceCohorts)
      .where(eq(audienceCohorts.worldId, career.worldId))
      .orderBy(asc(audienceCohorts.slug)),
    ctx.db.select().from(artistAudience).where(eq(artistAudience.careerId, career.id)),
    ctx.db
      .select()
      .from(scenes)
      .where(eq(scenes.worldId, career.worldId))
      .orderBy(asc(scenes.slug)),
    ctx.db
      .select()
      .from(characters)
      .where(eq(characters.worldId, career.worldId))
      .orderBy(asc(characters.slug)),
    ctx.db.select().from(relationships).where(eq(relationships.careerId, career.id)),
    ctx.db
      .select()
      .from(relationshipMoments)
      .where(
        and(eq(relationshipMoments.careerId, career.id), eq(relationshipMoments.status, "OPEN")),
      ),
    ctx.db
      .select()
      .from(calendarItems)
      .where(
        and(
          eq(calendarItems.careerId, career.id),
          /*
           * A commitment is something still owed. Two statuses are not:
           *
           * - `CANCELLED` — the booking was called off, so it never occupied
           *   the night at all.
           * - `COMPLETED` — it happened. A night you have already played is
           *   history rather than an obligation, and leaving it here would mean
           *   a career grew permanently less bookable every time it turned up
           *   to something.
           *
           * M8.5 is what made the second case reachable: until nights and
           * battles could complete, every commitment a career had was still
           * ahead of it, and the distinction had nothing to bite on.
           */
          notInArray(calendarItems.status, ["CANCELLED", "COMPLETED"]),
        ),
      ),
    ctx.db.select().from(creativeSessions).where(eq(creativeSessions.careerId, career.id)),
    // Everything, so identity can be checked across statuses as well as live ones.
    ctx.db.select().from(opportunities).where(eq(opportunities.careerId, career.id)),
    ctx.db.select().from(tracks).where(eq(tracks.careerId, career.id)),
  ]);

  const performanceFor = (releaseId: string) =>
    performanceRows.find((row) => row.releaseId === releaseId);

  const cohorts: CohortStandingFacts[] = cohortRows.map((cohort) => {
    const audience = audienceRows.find((row) => row.cohortId === cohort.id);
    return {
      slug: cohort.slug,
      name: cohort.name,
      size: cohort.size,
      // A cohort this artist has never reached has no row, which is zero rather
      // than missing: the audience is there and has not heard of you.
      fans: audience?.fans ?? 0,
      affinity: audience?.affinity ?? 0,
      priorExposure: audience?.priorExposure ?? 0,
      sceneAffinity: cohort.sceneAffinity,
    };
  });

  const momentsFor = (subjectId: string): MomentKind[] =>
    momentRows.filter((row) => row.subjectId === subjectId).map((row) => row.kind);

  /*
   * Competitive history, read from `battles` rather than inferred from offers.
   * An accepted battle that has not happened and an unanswered challenge are
   * different facts, and only the first should stop somebody calling you out.
   */
  const battleFacts = await loadBattleFactsByCharacter(ctx.db, career.id);

  const people: PersonFacts[] = characterRows.map((character) => {
    const relationship = relationshipRows.find((row) => row.subjectId === character.id);
    return {
      characterId: character.id,
      slug: character.slug,
      name: character.name,
      role: character.role,
      active: character.status === "ACTIVE",
      relationship: relationship ? stateOf(relationship) : null,
      interactionCount: relationship?.interactionCount ?? 0,
      openMomentKinds: momentsFor(character.id),
      sessionCostMinor: sessionCostOf(character.preferences),
      promoter: promoterFactsOf(character.preferences),
      battler: battlerFactsOf(character.preferences),
      // The general identity relation. Null for everybody who is not an artist.
      artistId: character.artistId,
      outstandingBattle: battleFacts.get(character.id)?.outstanding ?? false,
      battleCount: battleFacts.get(character.id)?.count ?? 0,
    };
  });

  const commitments: CommitmentFacts[] = calendarRows.map((item) => ({
    type: item.type,
    title: item.title,
    startGameTime: item.startGameTime,
    endGameTime: item.endGameTime,
  }));

  return {
    careerId: career.id,
    worldId: career.worldId,
    currentGameTime: career.currentGameDate,
    standing: {
      fame: career.fame,
      respect: career.respect,
      heat: career.heat,
      moneyBalance: career.moneyBalance,
      careerAct: career.careerAct,
    },
    releases: releaseRows.map((release) => {
      const performance = performanceFor(release.id);
      return {
        releaseId: release.id,
        title: trackRows.find((row) => row.id === release.trackId)?.title ?? null,
        releasedGameTime: release.releasedGameTime!,
        daysSimulated: performance?.daysSimulated ?? 0,
        uniqueListeners: performance?.uniqueListeners ?? 0,
        engagedListeners: performance?.engagedListeners ?? 0,
        repeatListeners: performance?.repeatListeners ?? 0,
        fanConversions: performance?.fanConversions ?? 0,
        shares: performance?.shares ?? 0,
        momentum: performance?.currentMomentum ?? 0,
      };
    }),
    cohorts,
    scenes: sceneRows.map((scene) => ({ id: scene.id, slug: scene.slug, name: scene.name })),
    people,
    commitments,
    liveOpportunities: opportunityRows
      .filter((row) => row.status === "AVAILABLE")
      .map((row) => ({
        opportunityId: row.id,
        identityKey: row.idempotencyKey,
        type: row.type,
        sourceEntityId: row.sourceEntityId,
        occupiesGameTime: occupiedNightOf(row),
      })),
    usedIdentityKeys: opportunityRows
      .map((row) => row.idempotencyKey)
      .filter((key): key is string => key !== null),
    midSession: sessionRows.some(
      (session) => !["COMPLETED", "CANCELLED"].includes(session.status),
    ),
  };
}

/** The night or date an offer wants, where it wants one. Read from its payload. */
function occupiedNightOf(row: OpportunityRow): Date | null {
  const payload = row.payload as { nightGameTime?: string; proposedGameTime?: string };
  const stamp = payload.nightGameTime ?? payload.proposedGameTime;
  return stamp ? new Date(stamp) : null;
}

/* ------------------------------------------------------------------ writing */

type Tx = Parameters<Parameters<CommandContext["db"]["transaction"]>[0]>[0];

export type RunDirectorResult = {
  /** Newly written offers, best-ranked first. */
  created: OpportunityRow[];
  /** Offers that lapsed on this day advance because the world passed their date. */
  expired: OpportunityRow[];
  /** Conflicts detected among everything now live. */
  conflicts: { opportunityId: string; otherOpportunityId: string; kind: string }[];
  /** The whole reasoning, including candidates that never became rows. */
  trace: DirectorTrace;
  /** False when this game day had already been directed and nothing changed. */
  ran: boolean;
};

/**
 * Run the director for one game day.
 *
 * Expiry happens first, deliberately. A promoter's night that has passed frees
 * the calendar, and a career whose backlog just lapsed has room for something
 * new — running generation first would judge both against a world that no longer
 * exists.
 *
 * Idempotent by the run ledger: the unique key on (career, game_time) means a
 * replayed or concurrent day collides before any offer is written, and the whole
 * transaction becomes a no-op.
 */
export async function runOpportunityDirector(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<RunDirectorResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const gameTime = career.currentGameDate;
  const now = contextNow(ctx);

  /* 1. Anything whose date has passed has lapsed. Because time moved, not a read. */
  const lapsed = await ctx.db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.careerId, career.id),
        eq(opportunities.status, "AVAILABLE"),
        isNotNull(opportunities.expiresAtGameTime),
        lte(opportunities.expiresAtGameTime, gameTime),
      ),
    );

  /* 2. What the world could offer, decided from what it has recorded. */
  const facts = await loadDirectorFacts(ctx, career);
  const lapsedIds = new Set(lapsed.map((row) => row.id));

  const decision = direct({
    ...facts,
    // Expiring rows are already gone as far as this run is concerned.
    liveOpportunities: facts.liveOpportunities.filter((live) => !lapsedIds.has(live.opportunityId)),
  });

  const trace: DirectorTrace = {
    directorVersion: decision.directorVersion,
    gameTime: gameTime.toISOString(),
    liveCap: decision.liveCap,
    liveBefore: decision.liveBefore,
    candidates: decision.assessments,
    expired: lapsed.map((row) => ({
      opportunityId: row.id,
      type: row.type,
      expiresAtGameTime: row.expiresAtGameTime!.toISOString(),
    })),
    inputs: directorInputSummary(facts),
  };

  const applied = await ctx.db.transaction(async (tx) => {
    /*
     * The run ledger goes in first and carries the unique key on (career, day).
     * A replayed or concurrent run collides here, before anything has been
     * written, and nothing happens.
     */
    const runRows = await tx
      .insert(opportunityDirectorRuns)
      .values({
        id: ids.generic(),
        careerId: career.id,
        worldId: career.worldId,
        gameTime,
        directorVersion: OPPORTUNITY_DIRECTOR_VERSION,
        trace,
        candidatesConsidered: decision.assessments.length,
        eligibleCount: decision.assessments.filter((entry) => entry.eligibility.eligible).length,
        createdCount: decision.toCreate.length,
        expiredCount: lapsed.length,
      })
      .onConflictDoNothing({
        target: [opportunityDirectorRuns.careerId, opportunityDirectorRuns.gameTime],
      })
      .returning();

    if (!runRows[0]) return null;

    const expired = await expireOpportunities(tx, { career, rows: lapsed, gameTime, now });
    const created = await createOpportunities(tx, {
      career,
      candidates: decision.toCreate,
      assessments: decision.assessments,
      gameTime,
      now,
    });

    const conflicts = await detectConflicts(tx, { career, gameTime });

    /*
     * The ledger row went in first because it is the idempotency arbiter, before
     * there was anything to say about outcomes. Now that the work is done, it is
     * rewritten with the trace as it finally stands — each surviving assessment
     * naming the row it became — and with counts that describe what actually
     * happened rather than what was intended.
     */
    await tx
      .update(opportunityDirectorRuns)
      .set({
        trace: { ...trace, candidates: decision.assessments },
        createdCount: created.length,
        expiredCount: expired.length,
      })
      .where(eq(opportunityDirectorRuns.id, runRows[0].id));

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.OpportunityDirectorRan,
      actorType: "SYSTEM",
      targetType: "CAREER",
      targetId: career.id,
      visibility: "PRIVATE",
      importance: 15,
      occurredAt: gameTime,
      idempotencyKey: `director:${career.id}:${gameTime.toISOString()}`,
      payload: {
        directorVersion: OPPORTUNITY_DIRECTOR_VERSION,
        considered: decision.assessments.length,
        eligible: trace.candidates.filter((entry) => entry.eligibility.eligible).length,
        created: created.length,
        expired: expired.length,
        liveCap: decision.liveCap,
      },
    });

    return { created, expired, conflicts };
  });

  if (!applied) {
    // This day was already directed. Its decisions stand.
    return ok({ created: [], expired: [], conflicts: [], trace, ran: false });
  }

  if (applied.created.length > 0 || applied.expired.length > 0) {
    await trackAnalytics(ctx, {
      name: "opportunity_director_ran",
      userId: input.userId,
      careerId: career.id,
      properties: {
        created: applied.created.length,
        expired: applied.expired.length,
        considered: decision.assessments.length,
      },
    });
  }

  return ok({ ...applied, trace, ran: true });
}

/** The career facts the run reasoned from, small enough to read at a glance. */
function directorInputSummary(facts: DirectorFacts): Record<string, unknown> {
  return {
    fame: facts.standing.fame,
    respect: facts.standing.respect,
    heat: facts.standing.heat,
    careerAct: facts.standing.careerAct,
    releasesOut: facts.releases.length,
    bestMomentum: facts.releases.reduce(
      (highest, release) => Math.max(highest, release.momentum),
      0,
    ),
    cohorts: facts.cohorts.map((cohort) => ({
      slug: cohort.slug,
      fans: cohort.fans,
      affinity: cohort.affinity,
    })),
    relationships: facts.people
      .filter((person) => person.interactionCount > 0)
      .map((person) => ({
        slug: person.slug,
        respect: person.relationship?.respect ?? 0,
        trust: person.relationship?.trust ?? 0,
        chemistry: person.relationship?.creativeChemistry ?? 0,
        tension: person.relationship?.tension ?? 0,
        openMoments: person.openMomentKinds,
      })),
    commitments: facts.commitments.map((item) => ({
      type: item.type,
      startGameTime: item.startGameTime.toISOString(),
    })),
    midSession: facts.midSession,
  };
}

/**
 * Offers nobody answered.
 *
 * Lapsing is its own historical fact, kept apart from being declined. Turning
 * something down is a choice; letting it rot is a different one, and the person
 * who offered may well care which.
 */
async function expireOpportunities(
  tx: Tx,
  input: { career: CareerRow; rows: OpportunityRow[]; gameTime: Date; now: Date },
): Promise<OpportunityRow[]> {
  const expired: OpportunityRow[] = [];

  for (const row of input.rows) {
    const updated = await tx
      .update(opportunities)
      .set({
        status: "EXPIRED",
        expiredAt: input.now,
        updatedAt: input.now,
      })
      .where(and(eq(opportunities.id, row.id), eq(opportunities.status, "AVAILABLE")))
      .returning();

    if (!updated[0]) continue;

    await recordEvent(tx, {
      worldId: input.career.worldId,
      careerId: input.career.id,
      eventType: GameEventType.OpportunityExpired,
      actorType: "SYSTEM",
      targetType: "OPPORTUNITY",
      targetId: row.id,
      visibility: "PRIVATE",
      importance: 35,
      occurredAt: input.gameTime,
      idempotencyKey: `opportunity:${row.id}:expired`,
      payload: {
        type: row.type,
        origin: row.origin,
        // Why now: the date it was given, and the day the world reached.
        expiresAtGameTime: row.expiresAtGameTime?.toISOString() ?? null,
        gameTime: input.gameTime.toISOString(),
      },
    });

    expired.push(updated[0]);
  }

  return expired;
}

/** The offers that survived both gates, written with the reasoning that made them. */
async function createOpportunities(
  tx: Tx,
  input: {
    career: CareerRow;
    candidates: OpportunityCandidate[];
    assessments: CandidateAssessment[];
    gameTime: Date;
    now: Date;
  },
): Promise<OpportunityRow[]> {
  const created: OpportunityRow[] = [];

  for (const candidate of input.candidates) {
    const assessment = input.assessments.find(
      (entry) => entry.identityKey === candidate.identityKey,
    );

    const inserted = await tx
      .insert(opportunities)
      .values({
        id: ids.generic(),
        careerId: input.career.id,
        type: candidate.type,
        origin: candidate.origin,
        sourceEntityType: candidate.sourceEntityType,
        sourceEntityId: candidate.sourceEntityId,
        sceneId: candidate.sceneId,
        status: "AVAILABLE",
        idempotencyKey: candidate.identityKey,
        triggerReason: candidate.triggerReason,
        triggerState: candidate.triggerState,
        eligibility: assessment?.eligibility ?? {},
        ranking: assessment?.ranking ?? {},
        directorVersion: OPPORTUNITY_DIRECTOR_VERSION,
        payload: candidate.payload,
        availableAt: input.now,
        availableAtGameTime: candidate.availableAtGameTime,
        expiresAtGameTime: candidate.expiresAtGameTime,
        generatedAtGameTime: input.gameTime,
      })
      // The replacement for type-level uniqueness: same source, same trigger,
      // one row, however many times this day is processed.
      .onConflictDoNothing({
        target: [opportunities.careerId, opportunities.idempotencyKey],
      })
      .returning();

    const opportunity = inserted[0];
    if (!opportunity) {
      /*
       * The identity index refused it. `NOT_ALREADY_OFFERED` should have caught
       * this first, so recording it keeps a director that claims to have created
       * something it did not from doing so quietly.
       */
      if (assessment) {
        assessment.created = false;
        assessment.suppressedBy = "ALREADY_RECORDED";
      }
      continue;
    }

    if (assessment) assessment.opportunityId = opportunity.id;

    await recordEvent(tx, {
      worldId: input.career.worldId,
      careerId: input.career.id,
      eventType: GameEventType.OpportunityCreated,
      actorType: "SYSTEM",
      actorId: candidate.sourceEntityId,
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: input.gameTime,
      idempotencyKey: `opportunity:${opportunity.id}:created`,
      payload: {
        type: candidate.type,
        origin: candidate.origin,
        scene: candidate.sceneSlug,
        triggerReason: candidate.triggerReason,
        // The score that put it here, decomposed. Never a bare number.
        score: assessment?.ranking?.score ?? null,
        rank: assessment?.rank ?? null,
        expiresAtGameTime: candidate.expiresAtGameTime?.toISOString() ?? null,
      },
    });

    /*
     * A challenge is a thing one person did to another, not only an offer that
     * appeared. The opportunity event above records that the world produced
     * something; this records that somebody decided the player was worth
     * measuring themselves against, which is what M6's fold reads to move
     * rivalry for the first time in the game's history.
     */
    if (candidate.type === "BATTLE_CHALLENGE") {
      await recordEvent(tx, {
        worldId: input.career.worldId,
        careerId: input.career.id,
        eventType: GameEventType.BattleChallengeIssued,
        actorType: "SYSTEM",
        actorId: candidate.sourceEntityId,
        /* The person. This is the fold's key. */
        targetType: "CHARACTER",
        targetId: candidate.sourceEntityId,
        /*
         * Private. A challenge nobody has answered is not something the scene
         * knows about — only a completed battle reaches the world.
         */
        visibility: "PRIVATE",
        importance: 50,
        occurredAt: input.gameTime,
        idempotencyKey: `challenge:${opportunity.id}:issued`,
        payload: {
          opportunityId: opportunity.id,
          rivalName: candidate.payload.rivalName ?? null,
          venueName: candidate.payload.venueName ?? null,
          scene: candidate.sceneSlug,
          nightGameTime: candidate.payload.nightGameTime ?? null,
        },
      });
    }

    created.push(opportunity);
  }

  return created;
}

/**
 * Two live offers that cannot both happen.
 *
 * Only clashes over a night are detected, which is the whole of M7's
 * requirement. Recording the relationship is what lets accepting one resolve the
 * other for a stated reason later, instead of the loser quietly vanishing.
 */
async function detectConflicts(
  tx: Tx,
  input: { career: CareerRow; gameTime: Date },
): Promise<{ opportunityId: string; otherOpportunityId: string; kind: string }[]> {
  const live = await tx
    .select()
    .from(opportunities)
    .where(and(eq(opportunities.careerId, input.career.id), eq(opportunities.status, "AVAILABLE")))
    .orderBy(asc(opportunities.id));

  const found: { opportunityId: string; otherOpportunityId: string; kind: string }[] = [];

  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const first = live[i]!;
      const second = live[j]!;

      const firstNight = occupiedNightOf(first);
      const secondNight = occupiedNightOf(second);
      if (!firstNight || !secondNight) continue;
      // The same day, in game time. Two promoters wanting the same Friday.
      if (firstNight.toISOString().slice(0, 10) !== secondNight.toISOString().slice(0, 10)) {
        continue;
      }

      // Ordered by id so the pair is stored exactly once however it is found.
      const [low, high] = first.id < second.id ? [first, second] : [second, first];

      const inserted = await tx
        .insert(opportunityConflicts)
        .values({
          id: ids.generic(),
          careerId: input.career.id,
          opportunityId: low.id,
          otherOpportunityId: high.id,
          kind: "CALENDAR_SLOT",
          detail: {
            night: firstNight.toISOString(),
            types: [low.type, high.type],
          },
          detectedAtGameTime: input.gameTime,
        })
        .onConflictDoNothing({
          target: [opportunityConflicts.opportunityId, opportunityConflicts.otherOpportunityId],
        })
        .returning();

      if (!inserted[0]) continue;

      await recordEvent(tx, {
        worldId: input.career.worldId,
        careerId: input.career.id,
        eventType: GameEventType.OpportunityConflictDetected,
        actorType: "SYSTEM",
        targetType: "OPPORTUNITY",
        targetId: low.id,
        visibility: "PRIVATE",
        importance: 30,
        occurredAt: input.gameTime,
        idempotencyKey: `conflict:${low.id}:${high.id}`,
        payload: {
          kind: "CALENDAR_SLOT",
          night: firstNight.toISOString(),
          otherOpportunityId: high.id,
        },
      });

      found.push({ opportunityId: low.id, otherOpportunityId: high.id, kind: "CALENDAR_SLOT" });
    }
  }

  return found;
}

/* --------------------------------------------------------------- lifecycle */

export type AcceptOpportunityResult = {
  opportunity: OpportunityRow;
  /** The booking it produced, where the offer was one. */
  calendarItemId: string | null;
  /** The studio session it produced, where the offer was an invitation. */
  sessionId: string | null;
  /** Offers this made impossible, resolved for that stated reason. */
  withdrawn: OpportunityRow[];
};

/**
 * Take an offer.
 *
 * What this writes: the opportunity's own state, the commitment the offer
 * actually is — a night on the calendar, or a booked session in the studio — the
 * canonical events, and the withdrawal of anything it made impossible. What this
 * deliberately does not write: Fame, Respect, Heat, a relationship dimension, or
 * any other downstream number. A showcase that goes well should move Heat and
 * scene Respect through reception's existing pressure model when it is performed
 * — not through a mission-shaped reward handed out at the moment of saying yes.
 *
 * **A session invitation books a real session.** Accepting one goes through the
 * same `bookProducerSession` the producer introduction uses: the fee is charged
 * through the ledger, the `creative_session` is created, the producer and the
 * player are seated, and the room is on the calendar. It is the milestone's most
 * consequential line, because booking a session has been gated on the one-time
 * introduction since M3 — which quietly made the whole game a beautifully
 * simulated *first* record. A career can now keep making things, and it gets
 * there because somebody who rated the last one asked for another.
 */
export async function acceptOpportunity(
  ctx: CommandContext,
  input: { careerId: string; userId: string; opportunityId: string },
): Promise<Result<AcceptOpportunityResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const rows = await ctx.db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, input.opportunityId))
    .limit(1);

  const opportunity = rows[0];
  if (!opportunity || opportunity.careerId !== career.id) {
    return err(DomainErrors.invalidInput("That offer doesn't exist."));
  }

  /*
   * A challenge is not answered here.
   *
   * Accepting one has to create a `battles` row, book the night and record who
   * agreed to face whom — none of which this command knows how to do. Left
   * unguarded it would happily flip the opportunity to `ACCEPTED` and stop,
   * producing a challenge that has been taken, has no battle behind it, and can
   * never be taken again because `acceptBattleChallenge` requires an offer that
   * is still `AVAILABLE`. That is an unrecoverable state reachable from a screen
   * that looks exactly like every other offer screen.
   *
   * Refused structurally rather than fixed by routing, so no future caller can
   * reintroduce it by pointing a new surface at the generic command.
   */
  if (opportunity.type === "BATTLE_CHALLENGE") {
    return err(
      DomainErrors.invalidCareerState(
        "A challenge is answered where the battle is, not here.",
        { meta: { opportunityId: opportunity.id, use: "acceptBattleChallenge" } },
      ),
    );
  }

  if (opportunity.status === "ACCEPTED" || opportunity.status === "RESOLVED") {
    // Already taken: hand back what exists rather than booking twice.
    const settled = opportunity.payload as { sessionId?: string };
    return ok({
      opportunity,
      calendarItemId: null,
      sessionId: settled.sessionId ?? null,
      withdrawn: [],
    });
  }
  if (opportunity.status !== "AVAILABLE") {
    return err(
      DomainErrors.invalidCareerState(
        opportunity.status === "EXPIRED"
          ? "That one lapsed."
          : "That offer isn't yours to take any more.",
      ),
    );
  }

  const now = contextNow(ctx);
  const payload = opportunity.payload as {
    nightGameTime?: string;
    nightName?: string;
    promoterName?: string;
    sceneName?: string;
    termsLine?: string;
    producerName?: string;
    sessionCostMinor?: number;
    proposedGameTime?: string;
  };

  /*
   * An invitation the career cannot pay for is refused before anything is
   * written, and refused in the offer's own terms rather than as a generic
   * failure. Hiding an unaffordable offer would be the dishonest alternative:
   * the world thinking you are worth another record is a real fact about the
   * career, and it stays true whether or not the balance covers it.
   */
  let producer: CharacterRow | null = null;
  let producerProfile: ProducerProfile | null = null;

  if (opportunity.type === "SESSION_INVITE") {
    if (!opportunity.sourceEntityId) {
      return err(DomainErrors.invalidCareerState("Nobody is offering that session."));
    }

    producer = await loadProducer(ctx.db, career.worldId, opportunity.sourceEntityId);
    producerProfile = producer ? producerProfileOfCharacter(producer) : null;

    if (!producer || !producerProfile) {
      return err(DomainErrors.invalidCareerState("They aren't taking sessions."));
    }

    const costMinor = payload.sessionCostMinor ?? producerProfile.sessionCostMinor;

    if (career.moneyBalance < costMinor) {
      return err(
        DomainErrors.invalidInput(
          `A session with ${producer.name} costs ${formatMoney(costMinor)}. You have ${formatMoney(
            career.moneyBalance,
          )}.`,
        ),
      );
    }
  }

  const applied = await ctx.db.transaction(async (tx) => {
    const updated = await tx
      .update(opportunities)
      .set({ status: "ACCEPTED", acceptedAt: now, updatedAt: now })
      .where(and(eq(opportunities.id, opportunity.id), eq(opportunities.status, "AVAILABLE")))
      .returning();

    if (!updated[0]) return null;

    /*
     * A booking, where the offer was one. This is the offer becoming a
     * commitment in the world the calendar already models — not a new parallel
     * notion of "an accepted mission".
     */
    let calendarItemId: string | null = null;

    if (opportunity.type === "SHOWCASE_SLOT" && payload.nightGameTime) {
      const start = new Date(payload.nightGameTime);
      calendarItemId = ids.generic();

      await tx.insert(calendarItems).values({
        id: calendarItemId,
        careerId: career.id,
        type: "PERFORMANCE",
        title: `${payload.nightName ?? "A night"} — ${payload.sceneName ?? ""}`.trim(),
        description: payload.termsLine ?? null,
        startGameTime: start,
        endGameTime: new Date(start.getTime() + 5 * 60 * 60 * 1000),
        relatedEntityType: "OPPORTUNITY",
        relatedEntityId: opportunity.id,
        status: "SCHEDULED",
      });

      await recordEvent(tx, {
        worldId: career.worldId,
        careerId: career.id,
        eventType: GameEventType.CalendarItemCreated,
        actorType: "CAREER",
        actorId: career.id,
        targetType: "CALENDAR_ITEM",
        targetId: calendarItemId,
        visibility: "PRIVATE",
        importance: 35,
        occurredAt: career.currentGameDate,
        idempotencyKey: `calendar:${calendarItemId}:created`,
        payload: { type: "PERFORMANCE", startGameTime: start.toISOString() },
      });
    }

    /*
     * An invitation becomes an actual session, through M3's path rather than
     * beside it. The room, the fee, the seats and the calendar entry are all
     * `bookProducerSession`'s — the same function the producer introduction
     * calls — so there is exactly one kind of studio session in this game and it
     * is resumable however it was booked.
     */
    let sessionId: string | null = null;

    if (opportunity.type === "SESSION_INVITE" && producer && producerProfile) {
      const costMinor = payload.sessionCostMinor ?? producerProfile.sessionCostMinor;
      const scheduled = payload.proposedGameTime
        ? new Date(payload.proposedGameTime)
        : new Date(career.currentGameDate.getTime() + 1 * DAYS);

      const booked = await bookProducerSession(tx, {
        career,
        producer,
        profile: producerProfile,
        costMinor,
        scheduledGameTime: scheduled,
        now,
        // Keyed to the offer, not the producer: going back in with the same
        // person is a second booking, and must charge a second time.
        idempotencyKey: `opportunity:${opportunity.id}:session`,
        title: `Studio session with ${producer.name}`,
      });

      if ("failed" in booked) return { failed: booked.failed } as const;

      sessionId = booked.session.id;
      calendarItemId = booked.calendarItem.id;

      /*
       * The session recorded on the offer, so every surface can walk from the
       * offer to the room it became — and so the calendar entry, which points at
       * the session, can be traced back to the night it was asked for.
       */
      await tx
        .update(opportunities)
        .set({
          payload: { ...opportunity.payload, sessionId },
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(opportunities.id, opportunity.id));
    }

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.OpportunityAccepted,
      actorType: "USER",
      actorId: input.userId,
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      visibility: "PRIVATE",
      importance: 60,
      occurredAt: career.currentGameDate,
      idempotencyKey: `opportunity:${opportunity.id}:accepted`,
      payload: {
        type: opportunity.type,
        origin: opportunity.origin,
        sourceEntityId: opportunity.sourceEntityId,
        sourceName: producer?.name ?? payload.promoterName ?? null,
        nightName: payload.nightName ?? null,
        sceneName: payload.sceneName ?? null,
        billing: (opportunity.payload as { billing?: string }).billing ?? null,
        calendarItemId,
        sessionId,
      },
    });

    /*
     * Anything this made impossible resolves *because of the conflict*, pointing
     * at what caused it. Not declined — the player never refused it — and not
     * expired, because no time passed.
     */
    const withdrawn = await withdrawConflicting(tx, {
      career,
      opportunity: updated[0],
      now,
    });

    return { opportunity: updated[0], calendarItemId, sessionId, withdrawn };
  });

  if (!applied) {
    return err(DomainErrors.invalidCareerState("That offer isn't yours to take any more."));
  }

  if ("failed" in applied) {
    // Nothing was written, so nothing was charged, and saying so is the honest
    // half of refusing.
    return err(
      applied.failed === "INSUFFICIENT_FUNDS"
        ? DomainErrors.invalidInput("You can't afford that session.")
        : DomainErrors.invalidInput(
            "We couldn't book the session. You haven't been charged.",
          ),
    );
  }

  await trackAnalytics(ctx, {
    name: "opportunity_accepted",
    userId: input.userId,
    careerId: career.id,
    properties: {
      type: opportunity.type,
      origin: opportunity.origin,
      withdrew: applied.withdrawn.length,
      bookedSession: applied.sessionId !== null,
    },
  });

  return ok(applied);
}

/** Everything that competed with an accepted offer, resolved for that reason. */
async function withdrawConflicting(
  tx: Tx,
  input: { career: CareerRow; opportunity: OpportunityRow; now: Date },
): Promise<OpportunityRow[]> {
  const pairs = await tx
    .select()
    .from(opportunityConflicts)
    .where(
      and(
        eq(opportunityConflicts.careerId, input.career.id),
        or(
          eq(opportunityConflicts.opportunityId, input.opportunity.id),
          eq(opportunityConflicts.otherOpportunityId, input.opportunity.id),
        ),
      ),
    );

  const otherIds = pairs
    .map((pair) =>
      pair.opportunityId === input.opportunity.id ? pair.otherOpportunityId : pair.opportunityId,
    )
    .filter((id) => id !== input.opportunity.id);

  if (otherIds.length === 0) return [];

  const withdrawn = await tx
    .update(opportunities)
    .set({
      status: "WITHDRAWN",
      withdrawnAt: input.now,
      withdrawnForOpportunityId: input.opportunity.id,
      updatedAt: input.now,
    })
    .where(
      and(
        inArray(opportunities.id, otherIds),
        // Only things still waiting. An offer already answered stays answered.
        eq(opportunities.status, "AVAILABLE"),
      ),
    )
    .returning();

  for (const row of withdrawn) {
    await recordEvent(tx, {
      worldId: input.career.worldId,
      careerId: input.career.id,
      eventType: GameEventType.OpportunityWithdrawn,
      actorType: "SYSTEM",
      targetType: "OPPORTUNITY",
      targetId: row.id,
      visibility: "PRIVATE",
      importance: 40,
      occurredAt: input.career.currentGameDate,
      idempotencyKey: `opportunity:${row.id}:withdrawn`,
      payload: {
        type: row.type,
        // The offer that made this one impossible, named.
        withdrawnFor: input.opportunity.id,
        withdrawnForType: input.opportunity.type,
        reason: "CALENDAR_SLOT",
      },
    });
  }

  return withdrawn;
}

/**
 * Turn an offer down.
 *
 * A choice, and recorded as one. Nothing here touches the relationship with the
 * person who offered: the canonical event is written, and if a promoter turned
 * down twice should mean something, M6's derivation is where that gets priced —
 * not here, and not twice.
 */
export async function declineOpportunity(
  ctx: CommandContext,
  input: { careerId: string; userId: string; opportunityId: string },
): Promise<Result<OpportunityRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const rows = await ctx.db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, input.opportunityId))
    .limit(1);

  const opportunity = rows[0];
  if (!opportunity || opportunity.careerId !== career.id) {
    return err(DomainErrors.invalidInput("That offer doesn't exist."));
  }
  if (opportunity.status === "DECLINED") return ok(opportunity);
  if (opportunity.status !== "AVAILABLE") {
    return err(DomainErrors.invalidCareerState("That offer isn't yours to answer any more."));
  }

  /*
   * Nor is a challenge refused here, for the mirror of the reason it is not
   * accepted here. Turning somebody down is a thing that happens *between two
   * people*: `declineBattleChallenge` records who refused whom, which is what
   * M6's fold prices as `CHALLENGE_DECLINED` and what lets the rival write back.
   * This command would flip the status and tell nobody, which is the one way a
   * refusal can be got wrong — not by penalising it, but by making it silent.
   */
  if (opportunity.type === "BATTLE_CHALLENGE") {
    return err(
      DomainErrors.invalidCareerState(
        "A challenge is answered where the battle is, not here.",
        { meta: { opportunityId: opportunity.id, use: "declineBattleChallenge" } },
      ),
    );
  }

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
      eventType: GameEventType.OpportunityDeclined,
      actorType: "USER",
      actorId: input.userId,
      targetType: "OPPORTUNITY",
      targetId: opportunity.id,
      visibility: "PRIVATE",
      importance: 40,
      occurredAt: career.currentGameDate,
      idempotencyKey: `opportunity:${opportunity.id}:declined`,
      payload: {
        type: opportunity.type,
        origin: opportunity.origin,
        sourceEntityId: opportunity.sourceEntityId,
      },
    });

    return updated[0];
  });

  if (!declined) {
    return err(DomainErrors.invalidCareerState("That offer isn't yours to answer any more."));
  }

  await trackAnalytics(ctx, {
    name: "opportunity_declined",
    userId: input.userId,
    careerId: career.id,
    properties: { type: opportunity.type, origin: opportunity.origin },
  });

  return ok(declined);
}
