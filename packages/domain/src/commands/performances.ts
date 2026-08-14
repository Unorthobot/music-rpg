import { and, asc, eq, inArray, lte } from "drizzle-orm";
import {
  artistAudience,
  artistSkills,
  artists,
  audienceCohorts,
  calendarItems,
  careerMemories,
  careerMetricPressure,
  careers,
  characters,
  groups,
  opportunities,
  performances,
  releasePerformance,
  releases,
  scenes,
  type AudienceCohortRow,
  type CalendarItemRow,
  type CareerRow,
  type OpportunityRow,
  type PerformanceRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  AUDIENCE_SCALE,
  accrueMetric,
  distributeRoom,
  performanceStandingPressure,
  resolvePerformance,
  sceneStanding,
  type CohortRoomShare,
} from "@music-rpg/simulation";
import {
  PERFORMANCE_SIMULATOR_VERSION,
  clamp,
  err,
  ids,
  ok,
  roundTo,
  type CohortStandingFacts,
  type PerformanceDerivation,
  type PerformanceFacts,
  type Result,
  type ShowcaseBilling,
} from "@music-rpg/shared";
import { contextNow, track as trackAnalytics, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { applyMoneyMovement } from "../internal/money";

/**
 * A night, wired into the world.
 *
 * This file orchestrates; it does not decide. The three facts come from the
 * pure resolver in `@music-rpg/simulation`, the standing movement and the room's
 * distribution from pure pricing functions beside it, and everything here is
 * about reading the canonical state other systems own, writing the consequences
 * and the events that explain them inside one transaction, and refusing to do
 * any of it twice.
 *
 * Five rules bound the whole thing.
 *
 * 1. **Time causes the show; screens never do.** A night resolves because
 *    `advanceCareerDay` reached it. Nothing in a render path may create or
 *    resolve one, and none of the functions here are safe to call from one.
 * 2. **Accepting is not evidence.** A `performances` row exists only for a night
 *    the clock reached. An accepted showcase that has not come round has a
 *    calendar item and nothing else — no row, no fee, no standing movement, no
 *    public event.
 * 3. **Consume the projections; do not rebuild them.** Standing comes from M7's
 *    `sceneStanding()` over M5's cohort rows, momentum from
 *    `release_performance`, stagecraft from `artist_skills`, money through the
 *    ledger, pressure through M5's accrual. Nothing here re-derives any of it.
 * 4. **A night is not a release.** Nothing in this file writes
 *    `release_performance`, `release_cohort_performance`, `reception_ticks`,
 *    `career_audience.monthly_listeners` or `.reach`. A room is not a stream.
 * 5. **No new economy, and no Legacy.** The fee moves through the ledger every
 *    other cost goes through. There is no gig XP, no reputation token, and no
 *    column through which Legacy could arrive.
 *
 * **On what comes after.** This system emits `performance.resolved` as a
 * canonical `LOCAL_PUBLIC` fact and knows nothing else. It imports nothing from
 * progression, references no career act or evidence family, and would behave
 * identically if nothing ever consumed the event. A resolver that knew what a
 * night was worth to a later phase would be two systems in one file.
 */

type Tx = Parameters<Parameters<CommandContext["db"]["transaction"]>[0]>[0];

/* ------------------------------------------------------------------ reading */

/** What the offer recorded when its terms were agreed. Never re-negotiated. */
type ShowcaseTerms = {
  promoterName: string | null;
  nightName: string | null;
  sceneName: string | null;
  termsLine: string | null;
  billing: ShowcaseBilling;
  capacity: number;
  /** Already resolved to the correct one of payout / supportPayout at offer time. */
  payoutMinor: number;
  nightGameTime: string | null;
};

function termsOf(row: OpportunityRow): ShowcaseTerms {
  const payload = (row.payload ?? {}) as Record<string, unknown>;

  return {
    promoterName: (payload.promoterName as string) ?? null,
    nightName: (payload.nightName as string) ?? null,
    sceneName: (payload.sceneName as string) ?? null,
    termsLine: (payload.termsLine as string) ?? null,
    /*
     * A showcase without a billing is not a thing the director can produce, but
     * defaulting rather than throwing keeps a malformed row from stopping a day
     * that has already happened. SUPPORT is the conservative reading.
     */
    billing: payload.billing === "HEADLINE" ? "HEADLINE" : "SUPPORT",
    capacity: Math.max(1, Number(payload.capacity ?? 0) || 1),
    payoutMinor: Math.max(0, Number(payload.payoutMinor ?? 0) || 0),
    nightGameTime: (payload.nightGameTime as string) ?? null,
  };
}

/** Cohort standing for `sceneStanding`, which is M7's and is reused unchanged. */
async function loadCohortStanding(
  db: CommandContext["db"] | Tx,
  worldId: string,
  careerId: string,
): Promise<{ facts: CohortStandingFacts[]; cohorts: AudienceCohortRow[] }> {
  const [cohortRows, audienceRows] = await Promise.all([
    db.select().from(audienceCohorts).where(eq(audienceCohorts.worldId, worldId)),
    db.select().from(artistAudience).where(eq(artistAudience.careerId, careerId)),
  ]);

  return {
    cohorts: cohortRows,
    facts: cohortRows.map((cohort) => {
      const audience = audienceRows.find((row) => row.cohortId === cohort.id);
      return {
        slug: cohort.slug,
        name: cohort.name,
        size: cohort.size,
        // A cohort this artist has never reached has no row, which is zero
        // rather than missing: the people are there and have not heard of you.
        fans: audience?.fans ?? 0,
        affinity: audience?.affinity ?? 0,
        priorExposure: audience?.priorExposure ?? 0,
        sceneAffinity: cohort.sceneAffinity,
      };
    }),
  };
}

/**
 * Whether anything is actually moving around this artist right now.
 *
 * `current_momentum` on the best-moving release, read from M5's own projection.
 * Momentum decays, which is what makes a night booked off the back of a hot
 * record different from one played six weeks after everybody stopped talking.
 */
async function bestMomentum(
  db: CommandContext["db"] | Tx,
  careerId: string,
): Promise<number> {
  const releaseRows = await db
    .select({ id: releases.id })
    .from(releases)
    .where(eq(releases.careerId, careerId));

  if (releaseRows.length === 0) return 0;

  const performanceRows = await db
    .select()
    .from(releasePerformance)
    .where(
      inArray(
        releasePerformance.releaseId,
        releaseRows.map((row) => row.id),
      ),
    );

  return performanceRows.reduce(
    (highest, row) => Math.max(highest, row.currentMomentum),
    0,
  );
}

/** The one skill that has always meant this and has never had a consumer. */
async function stagecraftOf(
  db: CommandContext["db"] | Tx,
  artistId: string | null,
): Promise<number> {
  if (!artistId) return 0;
  const rows = await db
    .select({ performance: artistSkills.performance })
    .from(artistSkills)
    .where(eq(artistSkills.artistId, artistId))
    .limit(1);
  return rows[0]?.performance ?? 0;
}

/* ------------------------------------------------------------------ writing */

export type ResolvePerformanceResult = {
  performance: PerformanceRow;
  facts: PerformanceFacts;
  /** What moved, and why. The same shape battles' consequences have. */
  consequences: Record<string, unknown>;
  /** False when this night had already resolved and nothing changed. */
  ran: boolean;
};

/**
 * The night happens, is paid for, and its consequences land.
 *
 * One transaction, and deliberately one command rather than seven. The
 * performance row, the calendar completion, the opportunity resolution, the
 * ledger entry, the pressure accrual, the audience writes and the events commit
 * together or none of them do — because four different systems are being
 * written to, and a night that was paid but never completed, or completed but
 * never made public, is a world in a state nothing else knows how to read.
 *
 * **Idempotency, in three independent layers.** The calendar claim is the
 * arbiter: a concurrent or replayed advance finds the item already past
 * `SCHEDULED` and does nothing at all, before a single row has been written.
 * Beneath that, the unique index on `performances.opportunity_id` makes a second
 * night structurally impossible rather than merely refused, and every event and
 * the ledger movement carry idempotency keys. Repeated day advances cannot pay
 * twice, emit twice, move standing twice or touch the audience twice.
 */
export async function resolveScheduledPerformance(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    /** The commitment being discharged. The night, as the calendar recorded it. */
    calendarItemId: string;
    /**
     * The night's seed, honoured on the first resolution only.
     *
     * The same affordance reception and battles expose, for the same reason: two
     * careers built identically must be able to share a roll so a comparison
     * between them is a comparison of their decisions. Left unset — as every
     * caller in the app leaves it — the seed derives from the night's own
     * identity, so no two nights ever share one.
     */
    seed?: string;
  },
): Promise<Result<ResolvePerformanceResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const itemRows = await ctx.db
    .select()
    .from(calendarItems)
    .where(and(eq(calendarItems.id, input.calendarItemId), eq(calendarItems.careerId, career.id)))
    .limit(1);

  const item = itemRows[0];
  if (!item) return err(DomainErrors.invalidCareerState("That booking isn't yours."));
  if (item.type !== "PERFORMANCE") {
    return err(DomainErrors.invalidCareerState("That booking isn't a night."));
  }

  /* Already played. Hand back what exists rather than playing it again. */
  if (item.status === "COMPLETED") {
    const existing = await ctx.db
      .select()
      .from(performances)
      .where(eq(performances.calendarItemId, item.id))
      .limit(1);

    const row = existing[0];
    if (row) {
      return ok({
        performance: row,
        facts: factsOf(row),
        consequences: row.consequences,
        ran: false,
      });
    }
    return err(DomainErrors.invalidCareerState("That night is already behind you."));
  }

  if (item.status !== "SCHEDULED") {
    return err(DomainErrors.invalidCareerState("That night isn't going ahead."));
  }

  /*
   * A night cannot happen before the night it was set for. Time creates; a
   * command may not bring a commitment forward because somebody asked it to.
   */
  if (career.currentGameDate < item.startGameTime) {
    return err(DomainErrors.invalidCareerState("That night hasn't come round yet."));
  }

  if (item.relatedEntityType !== "OPPORTUNITY" || !item.relatedEntityId) {
    return err(DomainErrors.invalidCareerState("That night has no offer behind it."));
  }

  const offerRows = await ctx.db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, item.relatedEntityId),
        eq(opportunities.careerId, career.id),
      ),
    )
    .limit(1);

  const offer = offerRows[0];
  if (!offer) return err(DomainErrors.invalidCareerState("That offer no longer exists."));
  if (offer.type !== "SHOWCASE_SLOT") {
    return err(DomainErrors.invalidCareerState("That booking isn't a showcase."));
  }
  if (offer.status !== "ACCEPTED") {
    return err(DomainErrors.invalidCareerState("That night was never agreed to."));
  }

  const terms = termsOf(offer);

  /* --- The world as it stands on the night ------------------------------- */

  const [{ facts: cohortFacts, cohorts }, momentum, sceneRows, promoterRows] = await Promise.all([
    loadCohortStanding(ctx.db, career.worldId, career.id),
    bestMomentum(ctx.db, career.id),
    offer.sceneId
      ? ctx.db.select().from(scenes).where(eq(scenes.id, offer.sceneId)).limit(1)
      : Promise.resolve([]),
    offer.sourceEntityId
      ? ctx.db.select().from(characters).where(eq(characters.id, offer.sourceEntityId)).limit(1)
      : Promise.resolve([]),
  ]);

  const sceneSlug = sceneRows[0]?.slug ?? "braamfontein";
  const stagecraft = await stagecraftOf(ctx.db, career.playerArtistId);
  const standing = sceneStanding(sceneSlug, cohortFacts);

  /*
   * The seed. Built from the night's own identity and the engine version, so
   * the same night replays identically forever and two nights never share a
   * roll. No clock and no randomness anywhere in the chain below.
   */
  const seed = input.seed ?? `performance:${offer.id}:${PERFORMANCE_SIMULATOR_VERSION}`;

  const night = resolvePerformance({
    capacity: terms.capacity,
    billing: terms.billing,
    sceneStanding: standing.value,
    momentum,
    performanceSkill: stagecraft,
    seed,
  });

  const pressure = performanceStandingPressure(night.facts);
  const room = distributeRoom({ facts: night.facts, sceneSlug, cohorts: cohortFacts });
  const now = contextNow(ctx);

  const applied = await ctx.db.transaction(async (tx) => {
    /*
     * 1. What happened in the room — and the claim, which are the same write.
     *
     * The night is inserted **resolved**, because that is the only state a row
     * here is ever in: it exists for a night that happened, and nothing outside
     * this transaction can observe it half-priced. The consequences are folded
     * in below once the systems that own them have been written to, but the
     * status never changes.
     *
     * **The unique index on `opportunity_id` is the guard**, and it is a better
     * one than a status flag: "one accepted offer produces exactly one night" is
     * enforced structurally by the database rather than by a compare-and-set
     * this code has to remember to perform. A concurrent or replayed advance
     * conflicts here and does nothing at all — before a fee, a metric or an
     * audience row has been touched.
     */
    const performanceId = ids.generic();

    const claimed = await tx
      .insert(performances)
      .values({
        id: performanceId,
        careerId: career.id,
        opportunityId: offer.id,
        calendarItemId: item.id,
        sceneId: offer.sceneId ?? null,
        promoterCharacterId: promoterRows[0]?.id ?? null,
        promoterName: terms.promoterName,
        nightName: terms.nightName,
        sceneSlug,
        termsLine: terms.termsLine,
        billing: terms.billing,
        capacity: terms.capacity,
        attendance: night.facts.attendance,
        wonOver: night.facts.wonOver,
        wordLeftTheRoom: night.facts.wordLeftTheRoom,
        derivation: night.derivation,
        /* The agreed terms. The ledger row it becomes is written below. */
        feeMinor: terms.payoutMinor,
        simulatorVersion: night.simulatorVersion,
        seed,
        momentum: roundTo(momentum, 4),
        sceneStandingValue: standing.value,
        status: "RESOLVED",
        occurredAtGameTime: career.currentGameDate,
        performedAt: now,
        resolvedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: performances.opportunityId })
      .returning();

    if (!claimed[0]) return null;

    /*
     * 2. The fee settles.
     *
     * `payload.payoutMinor` exactly as agreed when the offer was accepted. A
     * night does not renegotiate itself: the terms were the promoter's and they
     * were recorded. Nothing scales this by how the night went, because nobody
     * in this world has ever been paid on results and inventing that would be
     * an economy rather than a repair.
     *
     * This is the first time money has moved *into* a career in this game.
     */
    let transactionId: string | null = null;

    if (terms.payoutMinor > 0) {
      const paid = await applyMoneyMovement(tx, {
        careerId: career.id,
        category: "PERFORMANCE_FEE",
        amountMinor: terms.payoutMinor,
        direction: "CREDIT",
        description: `${terms.nightName ?? "A night"}${
          terms.promoterName ? ` — ${terms.promoterName}` : ""
        }`,
        relatedEntityType: "PERFORMANCE",
        relatedEntityId: performanceId,
        // Keyed to the offer: one accepted night pays exactly once, forever.
        idempotencyKey: `performance:${offer.id}:fee`,
        occurredAt: career.currentGameDate,
      });

      if (paid.ok) transactionId = paid.transactionId;
    }

    /* 3. Standing, through M5's accrual. Bounded by attendance, never capacity. */
    const standingAfter = await applyPerformanceStanding(tx, { career, pressure, now });

    /* 4. The room, cohort by cohort, within capacity. */
    const audience = await applyRoomToAudience(tx, {
      career,
      cohorts,
      shares: room.shares,
      gameTime: career.currentGameDate,
      now,
    });

    const consequences = {
      pressure: {
        fame: pressure.fame,
        respect: pressure.respect,
        heat: pressure.heat,
        roomShare: pressure.roomShare,
        contributions: pressure.contributions,
      },
      standingAfter,
      audience: {
        totalAffected: room.totalAffected,
        capacity: terms.capacity,
        attendance: night.facts.attendance,
        cohorts: audience,
      },
      fee: {
        payoutMinor: terms.payoutMinor,
        transactionId,
        note: "The agreed terms. Never scaled by how the night went.",
      },
      /* Said out loud on the row, because they are invariants of the milestone. */
      legacy: "unchanged — nights have no path to Legacy",
      release: "none — a night is not a release and has no listeners",
    };

    /*
     * 5. What the night cost, folded onto the night.
     *
     * A second write to the same row and not a second state: the status was
     * RESOLVED when it was inserted and is RESOLVED now. This records what the
     * systems above did, so the row can explain itself without re-reading four
     * other tables.
     */
    const settled = await tx
      .update(performances)
      .set({ transactionId, consequences, updatedAt: now })
      .where(eq(performances.id, performanceId))
      .returning();

    /*
     * 6. The commitment is discharged.
     *
     * The night stops being something the career is waiting on, which is what
     * makes the window bookable again. Without this the booking sits in the
     * Calendar's upcoming list forever — a night that has already happened,
     * still presented as ahead.
     */
    await tx
      .update(calendarItems)
      .set({ status: "COMPLETED", updatedAt: now })
      .where(and(eq(calendarItems.id, item.id), eq(calendarItems.status, "SCHEDULED")));

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.CalendarItemCompleted,
      actorType: "SYSTEM",
      targetType: "CALENDAR_ITEM",
      targetId: item.id,
      visibility: "PRIVATE",
      importance: 30,
      occurredAt: career.currentGameDate,
      idempotencyKey: `calendar:${item.id}:completed`,
      payload: { type: "PERFORMANCE", opportunityId: offer.id, performanceId },
    });

    /*
     * 7. The offer reaches its ending.
     *
     * RESOLVED has meant "it happened" since M2 and no showcase has ever
     * reached it. M7's four endings finally have their fourth in use.
     */
    await tx
      .update(opportunities)
      .set({ status: "RESOLVED", resolvedAt: now, updatedAt: now })
      .where(and(eq(opportunities.id, offer.id), eq(opportunities.status, "ACCEPTED")));

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.OpportunityResolved,
      actorType: "SYSTEM",
      targetType: "OPPORTUNITY",
      targetId: offer.id,
      visibility: "PRIVATE",
      importance: 50,
      occurredAt: career.currentGameDate,
      idempotencyKey: `opportunity:${offer.id}:resolved`,
      payload: {
        type: offer.type,
        performanceId,
        billing: terms.billing,
        outcome: "The night happened.",
      },
    });

    /*
     * 8. The canonical events for the night itself.
     *
     * `performance.performed` is kept, and earns its place: it is the private
     * record that the night occurred, carrying the facts and the derivation
     * that produced them. That is a different fact from what the scene saw, and
     * the two have different audiences — which is the separation that is real,
     * as against the row state that was not.
     */
    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.PerformancePerformed,
      actorType: "SYSTEM",
      targetType: "PERFORMANCE",
      targetId: performanceId,
      visibility: "PRIVATE",
      importance: 45,
      occurredAt: career.currentGameDate,
      idempotencyKey: `performance:${offer.id}:performed`,
      payload: {
        opportunityId: offer.id,
        simulatorVersion: night.simulatorVersion,
        seed,
        billing: terms.billing,
        capacity: terms.capacity,
        facts: night.facts,
        derivation: night.derivation,
      },
    });

    /*
     * The public fact.
     *
     * The only LOCAL_PUBLIC event this milestone writes, and the one that
     * matters: it is what makes a night a thing the scene saw rather than a
     * thing a career privately did. A night that was agreed and never reached
     * never gets here.
     */
    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.PerformanceResolved,
      actorType: "SYSTEM",
      targetType: "PERFORMANCE",
      targetId: performanceId,
      visibility: "LOCAL_PUBLIC",
      importance: 65,
      occurredAt: career.currentGameDate,
      idempotencyKey: `performance:${offer.id}:resolved`,
      payload: {
        performanceId,
        opportunityId: offer.id,
        sceneSlug,
        nightName: terms.nightName,
        promoterName: terms.promoterName,
        promoterCharacterId: promoterRows[0]?.id ?? null,
        billing: terms.billing,
        capacity: terms.capacity,
        /* The three facts, as the scene saw them. Nothing sums them. */
        attendance: night.facts.attendance,
        wonOver: night.facts.wonOver,
        wordLeftTheRoom: night.facts.wordLeftTheRoom,
        simulatorVersion: night.simulatorVersion,
      },
    });

    /* 8. Standing and audience movement, with the facts that caused them. */
    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.PerformanceConsequencesApplied,
      actorType: "SYSTEM",
      targetType: "PERFORMANCE",
      targetId: performanceId,
      visibility: "PRIVATE",
      importance: 50,
      occurredAt: career.currentGameDate,
      idempotencyKey: `performance:${offer.id}:consequences`,
      payload: consequences,
    });

    /*
     * 9. Career history, in the shape everything else writes one, so
     *    `career-story.ts` can narrate a night from persisted rows without
     *    being taught anything new.
     */
    await tx.insert(careerMemories).values({
      id: ids.generic(),
      careerId: career.id,
      kind: "PERFORMANCE",
      summary: `Played ${terms.nightName ?? "a night"}${
        terms.sceneName ? ` in ${terms.sceneName}` : ""
      } to ${night.facts.attendance} people.`,
      relatedEntityType: "PERFORMANCE",
      relatedEntityId: performanceId,
      importance: 70,
      occurredAt: career.currentGameDate,
    });

    return { performance: settled[0]!, consequences };
  });

  if (!applied) {
    /* Somebody else got there first. Hand back what they wrote. */
    const settled = await ctx.db
      .select()
      .from(performances)
      .where(eq(performances.opportunityId, offer.id))
      .limit(1);

    const row = settled[0];
    if (!row) return err(DomainErrors.invalidCareerState("That night is already behind you."));

    return ok({
      performance: row,
      facts: factsOf(row),
      consequences: row.consequences,
      ran: false,
    });
  }

  await trackAnalytics(ctx, {
    name: "performance_resolved",
    userId: input.userId,
    careerId: career.id,
    properties: {
      performanceId: applied.performance.id,
      billing: terms.billing,
      capacity: terms.capacity,
      attendance: night.facts.attendance,
    },
  });

  return ok({
    performance: applied.performance,
    facts: night.facts,
    consequences: applied.consequences,
    ran: true,
  });
}

/** The three facts as recorded on a night that has already happened. */
function factsOf(row: PerformanceRow): PerformanceFacts {
  return {
    attendance: row.attendance,
    wonOver: row.wonOver,
    wordLeftTheRoom: row.wordLeftTheRoom,
  };
}

/**
 * Standing, through the model that already owns it.
 *
 * `accrueMetric` and `career_metric_pressure` are M5's, and this writes them the
 * way reception and battles do — the accrual is the source, and both the
 * career's copy and the controlled entity's copy are written from it inside one
 * transaction so the two surfaces can never disagree.
 *
 * **Legacy is absent from `standing` and therefore cannot arrive here**, which
 * is the same discipline every consequence writer has held since M5. There is
 * no accrual column for it and no term producing one.
 */
async function applyPerformanceStanding(
  tx: Tx,
  input: {
    career: CareerRow;
    pressure: { fame: number; respect: number; heat: number };
    now: Date;
  },
): Promise<{ fame: number; respect: number; heat: number }> {
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

  return standing;
}

/**
 * What the room did to the audience — the single named function that writes it.
 *
 * > **A night may never affect more people than were in the room.**
 *
 * The distribution is decided by the pure `distributeRoom`, whose allocation
 * cannot hand out more than `attendance`; this function only applies it. Three
 * columns move and no others:
 *
 * - `prior_exposure` up by the attendees from that cohort, clamped by the
 *   cohort's own size. These people have now encountered this artist.
 * - `affinity` up by a small increment weighted by who was won over. Being in
 *   the room is a stronger encounter than hearing a track, and there are three
 *   orders of magnitude fewer people in it.
 * - `fans` up by at most a bounded fraction of the cohort's won-over.
 *
 * **What this must never write**, and does not: `release_performance` or
 * `release_cohort_performance` (a night is not a release and has no listeners),
 * `career_audience.monthly_listeners` or `.reach` (streaming-shaped, and a room
 * is not a stream), or anything that would make a `reception_ticks` row.
 *
 * **Why a second writer is safe here.** `writeArtistAudience` is incremental —
 * it reads the current row and adds to it, never recomputing from a watermark
 * or from the release history. So reception's next tick reads what a night
 * wrote as its own starting point, exactly as it reads what the previous tick
 * wrote. No M5 guarantee is bent and no second audience ontology is created.
 */
async function applyRoomToAudience(
  tx: Tx,
  input: {
    career: CareerRow;
    cohorts: AudienceCohortRow[];
    shares: CohortRoomShare[];
    gameTime: Date;
    now: Date;
  },
): Promise<Record<string, unknown>[]> {
  const ownerType = input.career.controlledEntityType === "GROUP" ? "GROUP" : "ARTIST";
  const ownerId = input.career.controlledEntityId;
  if (!ownerId) return [];

  const applied: Record<string, unknown>[] = [];

  for (const share of input.shares) {
    if (share.attendees <= 0) continue;

    const cohort = input.cohorts.find((row) => row.slug === share.cohortSlug);
    if (!cohort) continue;

    const existing = await tx
      .select()
      .from(artistAudience)
      .where(
        and(
          eq(artistAudience.cohortId, cohort.id),
          eq(artistAudience.ownerType, ownerType),
          eq(artistAudience.ownerId, ownerId),
        ),
      )
      .limit(1);

    const current = existing[0];

    // Nobody can be exposed twice, and never more of a cohort than exists.
    const priorExposure = clamp(
      (current?.priorExposure ?? 0) + share.attendees,
      0,
      cohort.size,
    );
    const affinity = roundTo(
      clamp((current?.affinity ?? 0) + share.affinityGain, 0, AUDIENCE_SCALE),
      4,
    );
    const fans = Math.max(0, (current?.fans ?? 0) + share.newFans);

    await tx
      .insert(artistAudience)
      .values({
        id: ids.generic(),
        cohortId: cohort.id,
        ownerType,
        ownerId,
        careerId: input.career.id,
        fans,
        affinity,
        // Untouched by a night: they are reception's to move, and a room says
        // nothing about how readily somebody streams or what they expect next.
        engagementTendency: current?.engagementTendency ?? 0,
        expectation: current?.expectation ?? 0,
        priorExposure,
        lastReachedGameTime: input.gameTime,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [artistAudience.cohortId, artistAudience.ownerType, artistAudience.ownerId],
        set: {
          fans,
          affinity,
          priorExposure,
          lastReachedGameTime: input.gameTime,
          updatedAt: input.now,
        },
      });

    applied.push({
      cohortSlug: share.cohortSlug,
      cohortName: share.cohortName,
      sceneWeight: share.sceneWeight,
      attendees: share.attendees,
      wonOver: share.wonOver,
      newFans: share.newFans,
      affinityGain: share.affinityGain,
      priorExposureAfter: priorExposure,
    });
  }

  return applied;
}

/* ------------------------------------------- performances as scheduled events */

/**
 * A night the world has reached.
 *
 * The **second scheduled world event**, and deliberately a sibling of
 * `resolveDueBattles` rather than a branch inside it or a generalised scheduler
 * replacing both. M8 left this seam with an instruction, and it is followed
 * literally: one more event type still does not demonstrate the need for a
 * registry, and the ordering is the part worth preserving.
 *
 * **The rule that outranks everything else here:** the night exists because game
 * time reached it. Never because somebody opened a screen. A player who accepts
 * a night, forgets about it and comes back a week later finds that it happened,
 * that they were paid, and that the scene knows.
 *
 * **One simplification versus battles.** `guardAcceptedBattles` stops time
 * crossing an accepted battle whose angle has not been declared, because
 * `resolveBattle` genuinely cannot run without one. **A performance has no
 * required pre-event decision**, so it needs no guard and gets none. The night
 * simply happens. A player who accepts a night and then ignores the game
 * entirely still played it, which is both correct and the whole point of a
 * scheduled world event.
 */
export async function resolveDuePerformances(
  ctx: CommandContext,
  input: { careerId: string; userId: string; seed?: string },
): Promise<Result<ResolvePerformanceResult[], DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  /* `resolveDueBattles`' query shape, deliberately: only due, ordered ascending. */
  const due: CalendarItemRow[] = await ctx.db
    .select()
    .from(calendarItems)
    .where(
      and(
        eq(calendarItems.careerId, career.id),
        eq(calendarItems.type, "PERFORMANCE"),
        eq(calendarItems.status, "SCHEDULED"),
        lte(calendarItems.startGameTime, career.currentGameDate),
      ),
    )
    .orderBy(asc(calendarItems.startGameTime));

  const resolved: ResolvePerformanceResult[] = [];

  for (const item of due) {
    const outcome = await resolveScheduledPerformance(ctx, {
      careerId: career.id,
      userId: input.userId,
      calendarItemId: item.id,
      ...(input.seed ? { seed: input.seed } : {}),
    });

    /*
     * A night that cannot resolve must not undo a day that already happened —
     * the reception is written and the clock has moved. The same tolerance the
     * director and `resolveDueBattles` get, for the same reason: this reports
     * what the night produced, not whether the day was allowed to occur. It is
     * retried on the next advance from the same persisted facts.
     */
    if (outcome.ok && outcome.value.ran) resolved.push(outcome.value);
  }

  return ok(resolved);
}
