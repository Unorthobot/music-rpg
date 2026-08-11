import { and, eq, gte, inArray, sql } from "drizzle-orm";
import {
  artistAudience,
  artists,
  audienceCohorts,
  careerAudience,
  careerMetricPressure,
  careers,
  groups,
  receptionTicks,
  releaseCohortPerformance,
  releasePerformance,
  releases,
  soundProfiles,
  trackVersions,
  tracks,
  type ArtistAudienceRow,
  type AudienceCohortRow,
  type CareerRow,
  type ReleaseCohortPerformanceRow,
  type ReleasePerformanceRow,
  type ReleaseRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { accrueMetric, calculateReceptionTick, nextAudienceState } from "@music-rpg/simulation";
import {
  RECEPTION_SIMULATOR_VERSION,
  SOUND_DIMENSIONS,
  err,
  ids,
  ok,
  readAudienceModifiers,
  type CohortTickOutcome,
  type ReceptionCohortState,
  type ReceptionTickResult,
  type Result,
  type SoundProfileValues,
  type TrackCharacteristics,
} from "@music-rpg/shared";
import { contextNow, track as trackAnalytics, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { DAYS } from "../internal/clock";

/**
 * Reception — what happened when the music met the world.
 *
 * This file orchestrates; it does not calculate. Every number comes from
 * `@music-rpg/simulation`, which is pure, and everything here is about reading
 * the right state, writing the consequences and the canonical events that
 * explain them inside one transaction, and refusing to do it twice.
 *
 * Two rules bound the whole thing:
 *
 * 1. **The stored modifiers are the handoff.** M4 wrote `audience_modifiers`
 *    when the strategy was chosen. This reads exactly those. It never looks at
 *    `releases.strategy` to work out what they should have been — one source of
 *    truth, written where the decision was made.
 * 2. **The simulation produces facts.** Nothing here writes a number that a
 *    tick did not produce, and no narrative layer may write one later.
 */

/** How far back "monthly listeners" reaches, in game days. */
const LISTENER_WINDOW_DAYS = 30;

export type SimulateReceptionResult = {
  release: ReleaseRow;
  performance: ReleasePerformanceRow;
  cohorts: ReleaseCohortPerformanceRow[];
  result: ReceptionTickResult;
  dayIndex: number;
  gameTime: Date;
  /** True when this day had already been simulated and nothing changed. */
  alreadySimulated: boolean;
};

/* ------------------------------------------------------------- loading */

function soundValues(row: { [key: string]: unknown } | undefined): SoundProfileValues {
  const values = {} as SoundProfileValues;
  for (const axis of SOUND_DIMENSIONS) {
    values[axis] = typeof row?.[axis] === "number" ? (row[axis] as number) : 0;
  }
  return values;
}

/**
 * What the record actually is.
 *
 * Read from the master version the player finished in the Studio — the same
 * sound profile and quality read-out they saw there. Nothing is invented here
 * to give the simulator something to chew on.
 */
async function loadTrackCharacteristics(
  ctx: CommandContext,
  release: ReleaseRow,
): Promise<TrackCharacteristics | null> {
  if (!release.trackId) return null;

  const trackRows = await ctx.db.select().from(tracks).where(eq(tracks.id, release.trackId)).limit(1);
  const trackRow = trackRows[0];
  if (!trackRow?.currentMasterVersionId) return null;

  const versionRows = await ctx.db
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.id, trackRow.currentMasterVersionId))
    .limit(1);
  const version = versionRows[0];
  if (!version) return null;

  const metrics = version.qualityMetrics ?? {};

  return {
    sound: version.soundProfile ?? soundValues(undefined),
    focus: Number(metrics.focus ?? 50),
    distinctiveness: Number(metrics.distinctiveness ?? 50),
    immediacy: Number(metrics.immediacy ?? 50),
  };
}

/** The artist's own Sound DNA, which is not the same thing as this record's. */
async function loadOwnerSound(
  ctx: CommandContext,
  career: CareerRow,
): Promise<SoundProfileValues> {
  if (!career.controlledEntityType || !career.controlledEntityId) return soundValues(undefined);

  const rows = await ctx.db
    .select()
    .from(soundProfiles)
    .where(
      and(
        eq(soundProfiles.ownerType, career.controlledEntityType),
        eq(soundProfiles.ownerId, career.controlledEntityId),
      ),
    )
    .limit(1);

  return soundValues(rows[0] as Record<string, unknown> | undefined);
}

/* --------------------------------------------------------------- the tick */

/**
 * Simulate one day of reception for a published release.
 *
 * Days run in order and exactly once. The day's game time is the release date
 * plus the day index, so a release that went out on the 6th has its first day
 * of reception on the 7th — nothing is resolved at the moment of publication.
 */
export async function simulateReceptionTick(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    releaseId: string;
    /** Defaults to the next unsimulated day. Passing an earlier one is a no-op. */
    dayIndex?: number;
    /** Honoured on the first tick only; afterwards the persisted seed is used. */
    seed?: string;
  },
): Promise<Result<SimulateReceptionResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const releaseRows = await ctx.db
    .select()
    .from(releases)
    .where(eq(releases.id, input.releaseId))
    .limit(1);
  const release = releaseRows[0];

  if (!release || release.careerId !== career.id) {
    return err(DomainErrors.invalidInput("That release doesn't exist."));
  }
  if (release.status !== "RELEASED" || !release.releasedGameTime) {
    return err(DomainErrors.invalidCareerState("Nothing can react to a record that isn't out."));
  }

  const cohortRows = await ctx.db
    .select()
    .from(audienceCohorts)
    .where(eq(audienceCohorts.worldId, release.worldId))
    .orderBy(audienceCohorts.slug);

  if (cohortRows.length === 0) {
    return err(DomainErrors.invalidCareerState("This world has no audience to react."));
  }

  const [performanceRows, cohortPerformanceRows] = await Promise.all([
    ctx.db
      .select()
      .from(releasePerformance)
      .where(eq(releasePerformance.releaseId, release.id))
      .limit(1),
    ctx.db
      .select()
      .from(releaseCohortPerformance)
      .where(eq(releaseCohortPerformance.releaseId, release.id)),
  ]);

  const existing = performanceRows[0];
  const dayIndex = input.dayIndex ?? (existing?.daysSimulated ?? 0) + 1;

  if (dayIndex < 1) {
    return err(DomainErrors.invalidInput("Reception starts on day one."));
  }
  if (dayIndex > (existing?.daysSimulated ?? 0) + 1) {
    return err(
      DomainErrors.invalidCareerState(
        "Days are simulated in order — you can't skip ahead of the reception.",
      ),
    );
  }

  const gameTime = new Date(release.releasedGameTime.getTime() + dayIndex * DAYS);

  // Already simulated: return what happened rather than doing it again.
  if (dayIndex <= (existing?.daysSimulated ?? 0)) {
    const priorRows = await ctx.db
      .select()
      .from(receptionTicks)
      .where(and(eq(receptionTicks.releaseId, release.id), eq(receptionTicks.dayIndex, dayIndex)))
      .limit(1);

    return ok({
      release,
      performance: existing!,
      cohorts: cohortPerformanceRows,
      result: priorRows[0]?.result as ReceptionTickResult,
      dayIndex,
      gameTime,
      alreadySimulated: true,
    });
  }

  const ownerType = career.controlledEntityType;
  const ownerId = career.controlledEntityId;
  if (!ownerType || !ownerId) {
    return err(DomainErrors.invalidCareerState("This career has nobody to have an audience."));
  }

  const characteristics = await loadTrackCharacteristics(ctx, release);
  if (!characteristics) {
    return err(DomainErrors.invalidCareerState("That release has no finished work behind it."));
  }

  const [artistSound, audienceRows] = await Promise.all([
    loadOwnerSound(ctx, career),
    ctx.db
      .select()
      .from(artistAudience)
      .where(
        and(
          eq(artistAudience.ownerType, ownerType),
          eq(artistAudience.ownerId, ownerId),
          inArray(
            artistAudience.cohortId,
            cohortRows.map((cohort) => cohort.id),
          ),
        ),
      ),
  ]);

  const audienceFor = (cohortId: string): ArtistAudienceRow | undefined =>
    audienceRows.find((row) => row.cohortId === cohortId);
  const performanceFor = (cohortId: string): ReleaseCohortPerformanceRow | undefined =>
    cohortPerformanceRows.find((row) => row.cohortId === cohortId);

  const states: ReceptionCohortState[] = cohortRows.map((cohort) => {
    const audience = audienceFor(cohort.id);
    const performance = performanceFor(cohort.id);

    return {
      slug: cohort.slug,
      size: cohort.size,
      preferences: cohort.preferences,
      behaviour: cohort.behaviouralWeights,
      fans: audience?.fans ?? 0,
      affinity: audience?.affinity ?? 0,
      priorExposure: audience?.priorExposure ?? 0,
      exposures: performance?.exposures ?? 0,
      uniqueListeners: performance?.uniqueListeners ?? 0,
      engagedListeners: performance?.engagedListeners ?? 0,
      repeatListeners: performance?.repeatListeners ?? 0,
      fanConversions: performance?.fanConversions ?? 0,
      // What the previous tick's sharing owes this cohort today.
      incomingWordOfMouth: performance?.wordOfMouth ?? 0,
    };
  });

  const seed = existing?.simulationSeed ?? input.seed ?? `release:${release.id}`;

  const result = calculateReceptionTick({
    dayIndex,
    seed,
    // The M4 handoff, read exactly as recorded. Never re-derived.
    audienceModifiers: readAudienceModifiers(release.audienceModifiers),
    format: release.format,
    careerAct: career.careerAct,
    track: characteristics,
    artistSound,
    momentum: existing?.currentMomentum ?? 0,
    cohorts: states,
  });

  const now = contextNow(ctx);
  const cohortBySlug = new Map(cohortRows.map((cohort) => [cohort.slug, cohort]));

  const applied = await ctx.db.transaction(async (tx) => {
    /*
     * The ledger row goes in first and carries a unique key on
     * (release, day). A concurrent or replayed tick collides here, before any
     * projection has moved, and the whole transaction is a no-op.
     */
    const tickRows = await tx
      .insert(receptionTicks)
      .values({
        id: ids.generic(),
        releaseId: release.id,
        careerId: career.id,
        dayIndex,
        gameTime,
        simulatorVersion: RECEPTION_SIMULATOR_VERSION,
        simulationSeed: seed,
        result,
      })
      .onConflictDoNothing({ target: [receptionTicks.releaseId, receptionTicks.dayIndex] })
      .returning();

    if (!tickRows[0]) return null;

    await writeCohortPerformance(tx, release.id, result.cohorts, cohortBySlug, now);

    const performance = await writeReleasePerformance(tx, {
      release,
      career,
      result,
      dayIndex,
      gameTime,
      seed,
      now,
    });

    await writeArtistAudience(tx, {
      career,
      ownerType,
      ownerId,
      result,
      cohortBySlug,
      existing: audienceRows,
      gameTime,
      now,
    });

    await writeCareerConsequences(tx, { career, result, gameTime, now });
    await recordReceptionEvents(tx, { release, career, result, dayIndex, gameTime });

    /*
     * The career's own clock follows its record. Only ever forwards — a tick
     * can never move a career backwards in time.
     */
    if (gameTime.getTime() > career.currentGameDate.getTime()) {
      await tx
        .update(careers)
        .set({ currentGameDate: gameTime, updatedAt: now })
        .where(eq(careers.id, career.id));
    }

    const cohorts = await tx
      .select()
      .from(releaseCohortPerformance)
      .where(eq(releaseCohortPerformance.releaseId, release.id));

    return { performance, cohorts };
  });

  // Lost the race: another caller simulated this day. Their result stands.
  if (!applied) {
    const [performanceRow, cohorts] = await Promise.all([
      ctx.db
        .select()
        .from(releasePerformance)
        .where(eq(releasePerformance.releaseId, release.id))
        .limit(1),
      ctx.db
        .select()
        .from(releaseCohortPerformance)
        .where(eq(releaseCohortPerformance.releaseId, release.id)),
    ]);

    return ok({
      release,
      performance: performanceRow[0]!,
      cohorts,
      result,
      dayIndex,
      gameTime,
      alreadySimulated: true,
    });
  }

  await trackAnalytics(ctx, {
    name: "reception_tick_simulated",
    userId: input.userId,
    careerId: career.id,
    properties: {
      releaseId: release.id,
      dayIndex,
      exposures: result.totals.newExposures,
      listeners: result.totals.newListeners,
      fanConversions: result.totals.fanConversions,
    },
  });

  return ok({
    release,
    performance: applied.performance,
    cohorts: applied.cohorts,
    result,
    dayIndex,
    gameTime,
    alreadySimulated: false,
  });
}

/* ------------------------------------------------------------ advance a day */

export type AdvanceDayResult = {
  /** Every release that moved forward, in the order they were simulated. */
  ticks: SimulateReceptionResult[];
  gameTime: Date;
};

/**
 * Move the career forward one in-world day.
 *
 * This is the player-facing shape of a tick: reception is something that
 * happens *over time*, and a record whose whole life resolved the moment it was
 * published would have no trajectory to watch. One press, one day, for every
 * record currently out.
 *
 * Idempotent per release-day by the same ledger key the tick uses, so a
 * double-submitted form advances the world once.
 */
export async function advanceCareerDay(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<AdvanceDayResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const releaseRows = await ctx.db
    .select()
    .from(releases)
    .where(and(eq(releases.careerId, career.id), eq(releases.status, "RELEASED")))
    .orderBy(releases.releasedGameTime);

  if (releaseRows.length === 0) {
    return err(
      DomainErrors.invalidCareerState("Nothing of yours is out yet, so there's nothing to wait on."),
    );
  }

  const ticks: SimulateReceptionResult[] = [];

  for (const release of releaseRows) {
    const tick = await simulateReceptionTick(ctx, {
      careerId: career.id,
      userId: input.userId,
      releaseId: release.id,
    });
    // One release refusing (nothing finished behind it, say) must not stop the
    // others: the day still happened.
    if (tick.ok) ticks.push(tick.value);
  }

  if (ticks.length === 0) {
    return err(DomainErrors.invalidCareerState("Nothing moved forward."));
  }

  const latest = ticks.reduce(
    (newest, tick) => (tick.gameTime > newest ? tick.gameTime : newest),
    ticks[0]!.gameTime,
  );

  return ok({ ticks, gameTime: latest });
}

/* --------------------------------------------------------------- writers */

type Tx = Parameters<Parameters<CommandContext["db"]["transaction"]>[0]>[0];

/**
 * Cohort performance.
 *
 * Counts accumulate; `wordOfMouth` does not. It is the exposure this cohort's
 * sharing owes the *next* tick, so it is replaced each day rather than summed —
 * yesterday's talking has already been spent.
 */
async function writeCohortPerformance(
  tx: Tx,
  releaseId: string,
  outcomes: CohortTickOutcome[],
  cohortBySlug: Map<string, AudienceCohortRow>,
  now: Date,
): Promise<void> {
  for (const outcome of outcomes) {
    const cohort = cohortBySlug.get(outcome.cohortSlug);
    if (!cohort) continue;

    await tx
      .insert(releaseCohortPerformance)
      .values({
        id: ids.generic(),
        releaseId,
        cohortId: cohort.id,
        exposures: outcome.newExposures,
        uniqueListeners: outcome.newListeners,
        engagedListeners: outcome.newEngagedListeners,
        repeatListeners: outcome.newRepeatListeners,
        fanConversions: outcome.fanConversions,
        shares: outcome.shares,
        wordOfMouth: outcome.wordOfMouth,
        evaluation: outcome.evaluation,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [releaseCohortPerformance.releaseId, releaseCohortPerformance.cohortId],
        set: {
          exposures: sql`${releaseCohortPerformance.exposures} + ${outcome.newExposures}`,
          uniqueListeners: sql`${releaseCohortPerformance.uniqueListeners} + ${outcome.newListeners}`,
          engagedListeners: sql`${releaseCohortPerformance.engagedListeners} + ${outcome.newEngagedListeners}`,
          repeatListeners: sql`${releaseCohortPerformance.repeatListeners} + ${outcome.newRepeatListeners}`,
          fanConversions: sql`${releaseCohortPerformance.fanConversions} + ${outcome.fanConversions}`,
          shares: sql`${releaseCohortPerformance.shares} + ${outcome.shares}`,
          wordOfMouth: outcome.wordOfMouth,
          evaluation: outcome.evaluation,
          updatedAt: now,
        },
      });
  }
}

/** Release totals. Always the sum of the cohort rows written above. */
async function writeReleasePerformance(
  tx: Tx,
  input: {
    release: ReleaseRow;
    career: CareerRow;
    result: ReceptionTickResult;
    dayIndex: number;
    gameTime: Date;
    seed: string;
    now: Date;
  },
): Promise<ReleasePerformanceRow> {
  const { totals } = input.result;

  const rows = await tx
    .insert(releasePerformance)
    .values({
      releaseId: input.release.id,
      careerId: input.career.id,
      worldId: input.release.worldId,
      totalExposures: totals.newExposures,
      uniqueListeners: totals.newListeners,
      engagedListeners: totals.newEngagedListeners,
      repeatListeners: totals.newRepeatListeners,
      fanConversions: totals.fanConversions,
      shares: totals.shares,
      wordOfMouth: totals.wordOfMouth,
      currentMomentum: input.result.momentumAfter,
      daysSimulated: input.dayIndex,
      lastSimulatedGameTime: input.gameTime,
      simulationSeed: input.seed,
      simulatorVersion: input.result.simulatorVersion,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: releasePerformance.releaseId,
      set: {
        totalExposures: sql`${releasePerformance.totalExposures} + ${totals.newExposures}`,
        uniqueListeners: sql`${releasePerformance.uniqueListeners} + ${totals.newListeners}`,
        engagedListeners: sql`${releasePerformance.engagedListeners} + ${totals.newEngagedListeners}`,
        repeatListeners: sql`${releasePerformance.repeatListeners} + ${totals.newRepeatListeners}`,
        fanConversions: sql`${releasePerformance.fanConversions} + ${totals.fanConversions}`,
        shares: sql`${releasePerformance.shares} + ${totals.shares}`,
        wordOfMouth: totals.wordOfMouth,
        currentMomentum: input.result.momentumAfter,
        daysSimulated: input.dayIndex,
        lastSimulatedGameTime: input.gameTime,
        updatedAt: input.now,
      },
    })
    .returning();

  return rows[0]!;
}

/** The artist's standing with each cohort — the part that outlives the record. */
async function writeArtistAudience(
  tx: Tx,
  input: {
    career: CareerRow;
    ownerType: "ARTIST" | "GROUP";
    ownerId: string;
    result: ReceptionTickResult;
    cohortBySlug: Map<string, AudienceCohortRow>;
    existing: ArtistAudienceRow[];
    gameTime: Date;
    now: Date;
  },
): Promise<void> {
  for (const outcome of input.result.cohorts) {
    const cohort = input.cohortBySlug.get(outcome.cohortSlug);
    if (!cohort) continue;

    const current = input.existing.find((row) => row.cohortId === cohort.id);

    const next = nextAudienceState({
      cohortSize: cohort.size,
      outcome,
      current: {
        fans: current?.fans ?? 0,
        affinity: current?.affinity ?? 0,
        expectation: current?.expectation ?? 0,
        engagementTendency: current?.engagementTendency ?? 0,
        priorExposure: current?.priorExposure ?? 0,
      },
    });

    await tx
      .insert(artistAudience)
      .values({
        id: ids.generic(),
        cohortId: cohort.id,
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        careerId: input.career.id,
        fans: next.fans,
        affinity: next.affinity,
        engagementTendency: next.engagementTendency,
        expectation: next.expectation,
        priorExposure: next.priorExposure,
        lastReachedGameTime: outcome.newExposures > 0 ? input.gameTime : null,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [artistAudience.cohortId, artistAudience.ownerType, artistAudience.ownerId],
        set: {
          fans: next.fans,
          affinity: next.affinity,
          engagementTendency: next.engagementTendency,
          expectation: next.expectation,
          priorExposure: next.priorExposure,
          ...(outcome.newExposures > 0 ? { lastReachedGameTime: input.gameTime } : {}),
          updatedAt: input.now,
        },
      });
  }
}

/**
 * Fame, Respect, Heat — and the audience projection Home reads.
 *
 * Pressure accrues as fractions and the visible metric is the floor of it.
 * Legacy is not touched, and there is no accrual column for it to arrive
 * through: one Underground single does not create a legacy.
 *
 * **Where standing lives.** There is one computation and two readers. The
 * accrual in `career_metric_pressure` is the source; from it, this writes both
 * the career's copy (the player's run — Home, Career) and the controlled
 * entity's copy (the fiction — public profiles, the world). They are written
 * together, in this transaction, from the same number, so the two surfaces can
 * never disagree about how famous somebody is.
 *
 * This is not the same as duplicating the metric. The career and the entity are
 * different subjects and will legitimately diverge later: a group career makes
 * the *Group* famous, and the individual standing of the player's own artist
 * inside it is its own question, which is why `careers.player_artist_id` exists
 * and why nothing here writes to it. Until a milestone gives a member their own
 * pressure, an individual in a group is exactly as known as they have earned:
 * not at all.
 */
async function writeCareerConsequences(
  tx: Tx,
  input: { career: CareerRow; result: ReceptionTickResult; gameTime: Date; now: Date },
): Promise<void> {
  const pressureRows = await tx
    .select()
    .from(careerMetricPressure)
    .where(eq(careerMetricPressure.careerId, input.career.id))
    .limit(1);
  const current = pressureRows[0];

  const fame = accrueMetric(current?.fameAccrued ?? 0, input.result.pressure.fame);
  const respect = accrueMetric(current?.respectAccrued ?? 0, input.result.pressure.respect);
  const heat = accrueMetric(current?.heatAccrued ?? 0, input.result.pressure.heat);

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

  // The same number, on the entity the world actually knows by name. Legacy is
  // absent from `standing`, so it cannot arrive here either.
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

  /*
   * The projection Home reads is a roll-up of what the simulation produced —
   * never a number written directly.
   *
   * `fans` is persistent affinity summed across cohorts: a total, with no
   * window, because a fan does not lapse in this milestone.
   *
   * `monthlyListeners` is the one windowed figure in the game, and it is summed
   * from the *ticks* rather than from release totals — people who first heard
   * something of this career's within the last thirty game days. Summing
   * `release_performance.unique_listeners` instead would count a two-year-old
   * record's entire lifetime the moment one late tick touched it.
   *
   * `reach` is lifetime unique exposure across everything released.
   */
  const since = new Date(input.gameTime.getTime() - LISTENER_WINDOW_DAYS * DAYS);

  const [fanRows, windowRows, reachRows] = await Promise.all([
    tx
      .select({ value: sql<number>`coalesce(sum(${artistAudience.fans}), 0)::int` })
      .from(artistAudience)
      .where(eq(artistAudience.careerId, input.career.id)),
    tx
      .select({
        value: sql<number>`coalesce(sum((${receptionTicks.result} -> 'totals' ->> 'newListeners')::int), 0)::int`,
      })
      .from(receptionTicks)
      .where(
        and(eq(receptionTicks.careerId, input.career.id), gte(receptionTicks.gameTime, since)),
      ),
    tx
      .select({
        value: sql<number>`coalesce(sum(${releasePerformance.totalExposures}), 0)::int`,
      })
      .from(releasePerformance)
      .where(eq(releasePerformance.careerId, input.career.id)),
  ]);

  await tx
    .insert(careerAudience)
    .values({
      careerId: input.career.id,
      fans: fanRows[0]?.value ?? 0,
      monthlyListeners: windowRows[0]?.value ?? 0,
      reach: reachRows[0]?.value ?? 0,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: careerAudience.careerId,
      set: {
        fans: fanRows[0]?.value ?? 0,
        monthlyListeners: windowRows[0]?.value ?? 0,
        reach: reachRows[0]?.value ?? 0,
        updatedAt: input.now,
      },
    });
}

/**
 * The canonical record of what happened.
 *
 * Written in the same transaction as the projections, so a number can never
 * exist without the history that produced it. Events that would assert nothing
 * — no engagement, no conversion, no sharing — are not written: an empty event
 * is noise, and the tick itself already records that the day was simulated.
 */
async function recordReceptionEvents(
  tx: Tx,
  input: {
    release: ReleaseRow;
    career: CareerRow;
    result: ReceptionTickResult;
    dayIndex: number;
    gameTime: Date;
  },
): Promise<void> {
  const { release, career, result, dayIndex, gameTime } = input;

  const base = {
    worldId: release.worldId,
    careerId: career.id,
    actorType: "WORLD" as const,
    actorId: release.worldId,
    targetType: "RELEASE",
    targetId: release.id,
    visibility: "PRIVATE" as const,
    occurredAt: gameTime,
  };

  for (const outcome of result.cohorts) {
    const key = `reception:${release.id}:d${dayIndex}:${outcome.cohortSlug}`;

    if (outcome.newExposures > 0) {
      await recordEvent(tx, {
        ...base,
        eventType: GameEventType.ReceptionExposureOccurred,
        importance: 25,
        idempotencyKey: `${key}:exposure`,
        payload: {
          cohort: outcome.cohortSlug,
          dayIndex,
          newExposures: outcome.newExposures,
          fromWordOfMouth: outcome.wordOfMouthExposures,
          addressablePopulation: outcome.addressablePopulation,
          // Why this cohort, this much: the evaluation that produced it.
          evaluation: outcome.evaluation,
        },
      });
    }

    if (outcome.newListeners > 0) {
      await recordEvent(tx, {
        ...base,
        eventType: GameEventType.ReceptionEngagementOccurred,
        importance: 30,
        idempotencyKey: `${key}:engagement`,
        payload: {
          cohort: outcome.cohortSlug,
          dayIndex,
          newListeners: outcome.newListeners,
          newEngagedListeners: outcome.newEngagedListeners,
          newRepeatListeners: outcome.newRepeatListeners,
          fit: outcome.evaluation.fit,
        },
      });
    }

    if (outcome.fanConversions > 0) {
      await recordEvent(tx, {
        ...base,
        eventType: GameEventType.ReceptionFanConversionOccurred,
        importance: 55,
        idempotencyKey: `${key}:conversion`,
        payload: {
          cohort: outcome.cohortSlug,
          dayIndex,
          fanConversions: outcome.fanConversions,
          fromEngaged: outcome.newEngagedListeners,
          fit: outcome.evaluation.fit,
        },
      });
    }

    if (outcome.shares > 0) {
      await recordEvent(tx, {
        ...base,
        eventType: GameEventType.ReceptionWordOfMouthOccurred,
        importance: 40,
        idempotencyKey: `${key}:word_of_mouth`,
        payload: {
          cohort: outcome.cohortSlug,
          dayIndex,
          shares: outcome.shares,
          // Exposure this creates on the next tick, after routing.
          exposureCreated: outcome.wordOfMouth,
        },
      });
    }
  }

  const { pressure } = result;
  if (pressure.fame > 0 || pressure.respect > 0 || pressure.heat > 0) {
    await recordEvent(tx, {
      ...base,
      eventType: GameEventType.ReceptionMetricPressureApplied,
      actorType: "SYSTEM",
      actorId: null,
      importance: 60,
      idempotencyKey: `reception:${release.id}:d${dayIndex}:pressure`,
      payload: {
        dayIndex,
        fame: pressure.fame,
        respect: pressure.respect,
        heat: pressure.heat,
        // The facts that caused it, so the movement can be argued with.
        newExposures: result.totals.newExposures,
        newEngagedListeners: result.totals.newEngagedListeners,
        shares: result.totals.shares,
        momentumBefore: result.momentumBefore,
        momentumAfter: result.momentumAfter,
      },
    });
  }

  await recordEvent(tx, {
    ...base,
    eventType: GameEventType.ReceptionTickCompleted,
    actorType: "SYSTEM",
    actorId: null,
    importance: 20,
    idempotencyKey: `reception:${release.id}:d${dayIndex}:tick`,
    payload: {
      dayIndex,
      simulatorVersion: result.simulatorVersion,
      seed: result.seed,
      // Echoed so the log alone shows which modifiers the tick consumed.
      audienceModifiers: result.audienceModifiers,
      totals: result.totals,
      momentumAfter: result.momentumAfter,
    },
  });
}
