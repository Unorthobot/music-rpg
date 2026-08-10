import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  calendarItems,
  careerMemories,
  releases,
  tracks,
  type CareerRow,
  type Database,
  type ReleaseRow,
  type TrackRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  RELEASE_STRATEGY_PROFILES,
  availableFormats,
  canReleaseTransition,
  err,
  ids,
  isProjectFormat,
  ok,
  type ReleaseFormat,
  type ReleaseStatus,
  type ReleaseStrategy,
  type Result,
} from "@music-rpg/shared";
import { contextNow, track as trackAnalytics, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { DAYS } from "../internal/clock";

/**
 * Releases.
 *
 * Deciding what happens to work, never making it. Nothing in this file creates
 * a track or a version; every command starts from work that already exists and
 * finished. That separation is the whole point of the milestone: the Studio is
 * where you make something, this is where you decide whether the world gets it.
 *
 * What a release is *worth* is not decided here either. Strategy modifiers are
 * recorded on the release for the audience simulator to read later — M4 says
 * how a record went out, M5 says what happened when it did.
 */

async function loadTrackForCareer(
  ctx: CommandContext,
  careerId: string,
  trackId: string,
): Promise<Result<TrackRow, DomainError>> {
  const rows = await ctx.db.select().from(tracks).where(eq(tracks.id, trackId)).limit(1);
  const trackRow = rows[0];

  if (!trackRow || trackRow.careerId !== careerId) {
    return err(DomainErrors.invalidInput("That track isn't in your catalogue."));
  }
  return ok(trackRow);
}

/** Only finished work can be released. A sketch is not a record. */
function requireReleasable(trackRow: TrackRow): DomainError | null {
  if (!trackRow.currentMasterVersionId) {
    return DomainErrors.invalidCareerState("Master a version before you release it.");
  }
  if (trackRow.status === "RELEASED") {
    return DomainErrors.invalidCareerState("That's already out.");
  }
  if (trackRow.status === "SCRAPPED") {
    return DomainErrors.invalidCareerState("That track was scrapped.");
  }
  return null;
}

async function catalogueSize(ctx: CommandContext, careerId: string): Promise<number> {
  const rows = await ctx.db
    .select({ value: sql<number>`count(*)::int` })
    .from(tracks)
    .where(and(eq(tracks.careerId, careerId), ne(tracks.status, "SCRAPPED")));
  return rows[0]?.value ?? 0;
}

function requireReleaseTransition(release: ReleaseRow, to: ReleaseStatus): DomainError | null {
  if (release.status === to) return null;
  if (!canReleaseTransition(release.status, to)) {
    return DomainErrors.invalidCareerState(
      `You can't do that — this release is ${release.status.toLowerCase()}.`,
    );
  }
  return null;
}

/* ------------------------------------------------------------ keep private */

/**
 * KeepPrivate.
 *
 * Deciding *not* to put something out is a decision, so it is recorded as one.
 * A track nobody released and a track deliberately kept back are different
 * facts about a career, and later systems will care which is which.
 */
export async function keepTrackPrivate(
  ctx: CommandContext,
  input: { careerId: string; userId: string; trackId: string },
): Promise<Result<TrackRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const trackResult = await loadTrackForCareer(ctx, career.id, input.trackId);
  if (!trackResult.ok) return trackResult;
  const trackRow = trackResult.value;

  if (trackRow.status === "RELEASED") {
    return err(DomainErrors.invalidCareerState("That's already out — you can't unrelease it."));
  }

  const now = contextNow(ctx);

  const updated = await ctx.db.transaction(async (tx) => {
    // A live plan is abandoned by choosing to keep the work back.
    await tx
      .update(releases)
      .set({ status: "CANCELLED", cancelledReason: "KEPT_PRIVATE", updatedAt: now })
      .where(and(eq(releases.trackId, trackRow.id), inArray(releases.status, ["PLANNED", "SCHEDULED"])));

    const rows = await tx
      .update(tracks)
      .set({ keptPrivateAt: now, status: "UNRELEASED", updatedAt: now })
      .where(eq(tracks.id, trackRow.id))
      .returning();

    await recordEvent(tx, {
      worldId: trackRow.worldId,
      careerId: career.id,
      eventType: GameEventType.TrackKeptPrivate,
      actorType: "USER",
      actorId: input.userId,
      targetType: "TRACK",
      targetId: trackRow.id,
      visibility: "PRIVATE",
      importance: 30,
      occurredAt: career.currentGameDate,
      payload: { title: trackRow.title },
    });

    return rows[0]!;
  });

  await trackAnalytics(ctx, {
    name: "track_kept_private",
    userId: input.userId,
    careerId: career.id,
    properties: { trackId: trackRow.id },
  });

  return ok(updated);
}

/* -------------------------------------------------------------- plan it */

export type PlanReleaseResult = { release: ReleaseRow; created: boolean };

/**
 * PlanRelease.
 *
 * Opens the decision without committing to it. Format defaults to whatever the
 * career can actually do — a one-track Underground career is offered a loose
 * track or a single, never an album.
 */
export async function planRelease(
  ctx: CommandContext,
  input: { careerId: string; userId: string; trackId: string; format?: ReleaseFormat },
): Promise<Result<PlanReleaseResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const trackResult = await loadTrackForCareer(ctx, career.id, input.trackId);
  if (!trackResult.ok) return trackResult;
  const trackRow = trackResult.value;

  const releasable = requireReleasable(trackRow);
  if (releasable) return err(releasable);

  // Planning twice returns the plan that exists rather than opening a second.
  const existing = await ctx.db
    .select()
    .from(releases)
    .where(and(eq(releases.trackId, trackRow.id), inArray(releases.status, ["PLANNED", "SCHEDULED"])))
    .limit(1);

  if (existing[0]) return ok({ release: existing[0], created: false });

  const formats = availableFormats({
    careerAct: career.careerAct,
    catalogueSize: await catalogueSize(ctx, career.id),
  });

  const requested = input.format ?? "SINGLE";
  const chosen = formats.find((entry) => entry.format === requested);

  if (!chosen || !chosen.available) {
    return err(
      DomainErrors.invalidInput(chosen?.lockedReason ?? "That format isn't available yet.", {
        field: "format",
      }),
    );
  }
  if (isProjectFormat(chosen.format)) {
    return err(DomainErrors.invalidInput("That format needs a project, not a single track."));
  }

  const now = contextNow(ctx);

  const created = await ctx.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(releases)
      .values({
        id: ids.generic(),
        careerId: career.id,
        worldId: trackRow.worldId,
        trackId: trackRow.id,
        format: chosen.format,
        strategy: "DROP",
        status: "PLANNED",
        audienceModifiers: RELEASE_STRATEGY_PROFILES.DROP.audienceModifiers,
      })
      .returning();

    const release = inserted[0];
    if (!release) return null;

    await tx
      .update(tracks)
      .set({ releaseId: release.id, keptPrivateAt: null, updatedAt: now })
      .where(eq(tracks.id, trackRow.id));

    await recordEvent(tx, {
      worldId: trackRow.worldId,
      careerId: career.id,
      eventType: GameEventType.ReleasePlanned,
      actorType: "USER",
      actorId: input.userId,
      targetType: "RELEASE",
      targetId: release.id,
      visibility: "PRIVATE",
      importance: 50,
      occurredAt: career.currentGameDate,
      idempotencyKey: `release:${release.id}:planned`,
      payload: { trackId: trackRow.id, title: trackRow.title, format: chosen.format },
    });

    return release;
  });

  if (!created) return err(DomainErrors.invalidInput("We couldn't start that release."));

  await trackAnalytics(ctx, {
    name: "release_planning_started",
    userId: input.userId,
    careerId: career.id,
    properties: { trackId: trackRow.id, format: chosen.format },
  });

  return ok({ release: created, created: true });
}

/* ------------------------------------------------------- format & strategy */

async function loadPlan(
  ctx: CommandContext,
  careerId: string,
  releaseId: string,
): Promise<Result<ReleaseRow, DomainError>> {
  const rows = await ctx.db.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
  const release = rows[0];

  if (!release || release.careerId !== careerId) {
    return err(DomainErrors.invalidInput("That release doesn't exist."));
  }
  return ok(release);
}

export async function chooseReleaseFormat(
  ctx: CommandContext,
  input: { careerId: string; userId: string; releaseId: string; format: ReleaseFormat },
): Promise<Result<ReleaseRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const planResult = await loadPlan(ctx, career.id, input.releaseId);
  if (!planResult.ok) return planResult;
  const release = planResult.value;

  if (release.status !== "PLANNED" && release.status !== "SCHEDULED") {
    return err(DomainErrors.invalidCareerState("That release has already gone out."));
  }

  const formats = availableFormats({
    careerAct: career.careerAct,
    catalogueSize: await catalogueSize(ctx, career.id),
  });
  const chosen = formats.find((entry) => entry.format === input.format);

  if (!chosen || !chosen.available) {
    return err(
      DomainErrors.invalidInput(chosen?.lockedReason ?? "That format isn't available yet.", {
        field: "format",
      }),
    );
  }
  if (release.trackId && isProjectFormat(chosen.format)) {
    return err(DomainErrors.invalidInput("That format needs a project, not a single track."));
  }

  const updated = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(releases)
      .set({ format: chosen.format, updatedAt: new Date() })
      .where(eq(releases.id, release.id))
      .returning();

    await recordEvent(tx, {
      worldId: release.worldId,
      careerId: career.id,
      eventType: GameEventType.ReleaseFormatChosen,
      actorType: "USER",
      actorId: input.userId,
      targetType: "RELEASE",
      targetId: release.id,
      visibility: "PRIVATE",
      importance: 30,
      occurredAt: career.currentGameDate,
      payload: { format: chosen.format },
    });

    return rows[0]!;
  });

  await trackAnalytics(ctx, {
    name: "release_format_selected",
    userId: input.userId,
    careerId: career.id,
    properties: { format: chosen.format },
  });

  return ok(updated);
}

/**
 * SetReleaseStrategy.
 *
 * How the record goes out. The strategy's modifiers are copied onto the release
 * so the audience simulator can read them later — recorded, not applied. A
 * strategy the career can't support yet (no venue, no contacts) is refused with
 * the reason rather than silently downgraded.
 */
export async function setReleaseStrategy(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    releaseId: string;
    strategy: ReleaseStrategy;
    /** What the career can currently support. M5 will derive this from the world. */
    capabilities?: ("VENUE" | "CONTACTS")[];
  },
): Promise<Result<ReleaseRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const planResult = await loadPlan(ctx, career.id, input.releaseId);
  if (!planResult.ok) return planResult;
  const release = planResult.value;

  if (release.status === "RELEASED" || release.status === "CANCELLED") {
    return err(DomainErrors.invalidCareerState("That release is finished."));
  }

  const profile = RELEASE_STRATEGY_PROFILES[input.strategy];
  const capabilities = input.capabilities ?? [];
  const missing = profile.requires.filter((requirement) => !capabilities.includes(requirement));

  if (missing.length > 0) {
    return err(
      DomainErrors.invalidInput(
        missing.includes("VENUE")
          ? "You don't have a room to play it in yet."
          : "You don't know anyone to send it to yet.",
        { field: "strategy" },
      ),
    );
  }

  if (profile.costMinor > career.moneyBalance) {
    return err(DomainErrors.invalidInput("You can't afford that approach."));
  }

  const updated = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(releases)
      .set({
        strategy: profile.id,
        // Recorded for M5. Nothing in M4 reads these to change state.
        audienceModifiers: profile.audienceModifiers,
        costMinor: profile.costMinor,
        updatedAt: new Date(),
      })
      .where(eq(releases.id, release.id))
      .returning();

    await recordEvent(tx, {
      worldId: release.worldId,
      careerId: career.id,
      eventType: GameEventType.ReleaseStrategySet,
      actorType: "USER",
      actorId: input.userId,
      targetType: "RELEASE",
      targetId: release.id,
      visibility: "PRIVATE",
      importance: 40,
      occurredAt: career.currentGameDate,
      payload: { strategy: profile.id, leadDays: profile.leadDays },
    });

    return rows[0]!;
  });

  await trackAnalytics(ctx, {
    name: "release_strategy_selected",
    userId: input.userId,
    careerId: career.id,
    properties: { strategy: profile.id },
  });

  return ok(updated);
}

/* ---------------------------------------------------------------- schedule */

/**
 * ScheduleRelease.
 *
 * Commits to a date. The strategy's lead time is a floor, not a suggestion:
 * you cannot tease something tomorrow and call it anticipation.
 */
export async function scheduleRelease(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    releaseId: string;
    /** In-world date. Defaults to the earliest the strategy allows. */
    scheduledGameTime?: Date;
  },
): Promise<Result<{ release: ReleaseRow; calendarItemId: string }, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const planResult = await loadPlan(ctx, career.id, input.releaseId);
  if (!planResult.ok) return planResult;
  const release = planResult.value;

  const transitionError = requireReleaseTransition(release, "SCHEDULED");
  if (transitionError) return err(transitionError);

  const profile = RELEASE_STRATEGY_PROFILES[release.strategy];
  const earliest = new Date(career.currentGameDate.getTime() + profile.leadDays * DAYS);
  const scheduled = input.scheduledGameTime ?? earliest;

  if (scheduled.getTime() < earliest.getTime()) {
    return err(
      DomainErrors.invalidInput(
        profile.leadDays === 0
          ? "That date is in the past."
          : `${profile.label} needs ${profile.leadDays} days before the release.`,
        { field: "scheduledGameTime" },
      ),
    );
  }

  const trackRow = release.trackId
    ? (await ctx.db.select().from(tracks).where(eq(tracks.id, release.trackId)).limit(1))[0]
    : undefined;

  const now = contextNow(ctx);

  const outcome = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(releases)
      .set({ status: "SCHEDULED", scheduledGameTime: scheduled, updatedAt: now })
      .where(eq(releases.id, release.id))
      .returning();

    if (trackRow) {
      await tx
        .update(tracks)
        .set({ status: "SCHEDULED", updatedAt: now })
        .where(eq(tracks.id, trackRow.id));
    }

    const calendarItemId = ids.generic();

    await tx.insert(calendarItems).values({
      id: calendarItemId,
      careerId: career.id,
      type: "RELEASE",
      title: `Release: ${trackRow?.title ?? "Untitled"}`,
      description: profile.label,
      startGameTime: scheduled,
      relatedEntityType: "RELEASE",
      relatedEntityId: release.id,
      status: "SCHEDULED",
    });

    await recordEvent(tx, {
      worldId: release.worldId,
      careerId: career.id,
      eventType: GameEventType.ReleaseScheduled,
      actorType: "USER",
      actorId: input.userId,
      targetType: "RELEASE",
      targetId: release.id,
      visibility: "PRIVATE",
      importance: 60,
      occurredAt: career.currentGameDate,
      idempotencyKey: `release:${release.id}:scheduled`,
      payload: {
        scheduledGameTime: scheduled.toISOString(),
        strategy: release.strategy,
        format: release.format,
      },
    });

    await recordEvent(tx, {
      worldId: release.worldId,
      careerId: career.id,
      eventType: GameEventType.CalendarItemCreated,
      actorType: "CAREER",
      actorId: career.id,
      targetType: "CALENDAR_ITEM",
      targetId: calendarItemId,
      visibility: "PRIVATE",
      importance: 30,
      occurredAt: career.currentGameDate,
      payload: { type: "RELEASE", releaseId: release.id },
    });

    return { release: rows[0]!, calendarItemId };
  });

  await trackAnalytics(ctx, {
    name: "release_scheduled",
    userId: input.userId,
    careerId: career.id,
    properties: { strategy: release.strategy, format: release.format },
  });

  return ok(outcome);
}

export async function cancelRelease(
  ctx: CommandContext,
  input: { careerId: string; userId: string; releaseId: string; reason?: string | null },
): Promise<Result<ReleaseRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const planResult = await loadPlan(ctx, career.id, input.releaseId);
  if (!planResult.ok) return planResult;
  const release = planResult.value;

  const transitionError = requireReleaseTransition(release, "CANCELLED");
  if (transitionError) return err(transitionError);

  const now = contextNow(ctx);

  const updated = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(releases)
      .set({ status: "CANCELLED", cancelledReason: input.reason ?? null, updatedAt: now })
      .where(eq(releases.id, release.id))
      .returning();

    if (release.trackId) {
      // The work goes back to being finished and unreleased — not scrapped.
      await tx
        .update(tracks)
        .set({ status: "UNRELEASED", releaseId: null, updatedAt: now })
        .where(eq(tracks.id, release.trackId));
    }

    await tx
      .update(calendarItems)
      .set({ status: "CANCELLED", updatedAt: now })
      .where(
        and(
          eq(calendarItems.relatedEntityType, "RELEASE"),
          eq(calendarItems.relatedEntityId, release.id),
        ),
      );

    await recordEvent(tx, {
      worldId: release.worldId,
      careerId: career.id,
      eventType: GameEventType.ReleaseCancelled,
      actorType: "USER",
      actorId: input.userId,
      targetType: "RELEASE",
      targetId: release.id,
      visibility: "PRIVATE",
      importance: 40,
      occurredAt: career.currentGameDate,
      payload: { reason: input.reason ?? null },
    });

    return rows[0]!;
  });

  return ok(updated);
}

/* --------------------------------------------------------------- publish */

export type PublishReleaseResult = {
  release: ReleaseRow;
  track: TrackRow | null;
  alreadyPublished: boolean;
};

/**
 * PublishRelease — the record enters the world.
 *
 * What this does: flips the work to released, makes it publicly visible, puts
 * the event in the world where the scene can eventually notice it, and writes
 * the career's memory of it.
 *
 * What this deliberately does not do: touch fans, fame, respect, heat or
 * legacy. After a release the honest state is that it is out and nobody has
 * reacted yet. Reaction is M5's to simulate, and inventing it here would be the
 * fake state we've refused everywhere else.
 */
export async function publishRelease(
  ctx: CommandContext,
  input: { careerId: string; userId: string; releaseId: string },
): Promise<Result<PublishReleaseResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const planResult = await loadPlan(ctx, career.id, input.releaseId);
  if (!planResult.ok) return planResult;
  const release = planResult.value;

  // Idempotent: publishing twice is one release, one event, one memory.
  if (release.status === "RELEASED") {
    const trackRow = release.trackId
      ? (await ctx.db.select().from(tracks).where(eq(tracks.id, release.trackId)).limit(1))[0]
      : undefined;
    return ok({ release, track: trackRow ?? null, alreadyPublished: true });
  }

  const transitionError = requireReleaseTransition(release, "RELEASED");
  if (transitionError) return err(transitionError);

  const trackResult = release.trackId
    ? await loadTrackForCareer(ctx, career.id, release.trackId)
    : null;

  if (trackResult && !trackResult.ok) return trackResult;
  const trackRow = trackResult?.value ?? null;

  if (trackRow) {
    const releasable = requireReleasable(trackRow);
    if (releasable) return err(releasable);
  }

  const now = contextNow(ctx);
  const releasedGameTime = release.scheduledGameTime ?? career.currentGameDate;

  const outcome = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(releases)
      .set({ status: "RELEASED", releasedGameTime, updatedAt: now })
      .where(eq(releases.id, release.id))
      .returning();

    // Return the row as it is *after* publication: a caller that renders the
    // stale one would tell the player their record is still unreleased.
    let publishedTrack: TrackRow | null = null;

    if (trackRow) {
      const updatedTrack = await tx
        .update(tracks)
        .set({
          status: "RELEASED",
          // `released_at` is what the catalogue counts, and it is set once.
          releasedAt: releasedGameTime,
          releaseId: release.id,
          updatedAt: now,
        })
        .where(eq(tracks.id, trackRow.id))
        .returning();
      publishedTrack = updatedTrack[0] ?? null;
    }

    await tx
      .update(calendarItems)
      .set({ status: "COMPLETED", updatedAt: now })
      .where(
        and(
          eq(calendarItems.relatedEntityType, "RELEASE"),
          eq(calendarItems.relatedEntityId, release.id),
        ),
      );

    const publishedEvent = await recordEvent(tx, {
      worldId: release.worldId,
      careerId: career.id,
      eventType: GameEventType.ReleasePublished,
      actorType: "CAREER",
      actorId: career.id,
      targetType: trackRow ? "TRACK" : "PROJECT",
      targetId: trackRow?.id ?? release.projectId!,
      // The first thing this career has done that the world can see.
      visibility: "LOCAL_PUBLIC",
      importance: 90,
      occurredAt: releasedGameTime,
      idempotencyKey: `release:${release.id}:published`,
      payload: {
        title: trackRow?.title ?? null,
        format: release.format,
        strategy: release.strategy,
        // Carried for M5. Recording is not applying.
        audienceModifiers: release.audienceModifiers,
      },
    });

    await tx.insert(careerMemories).values({
      id: ids.generic(),
      careerId: career.id,
      kind: "FIRST_RELEASE",
      summary: `Released "${trackRow?.title ?? "Untitled"}".`,
      sourceEventId: publishedEvent.id,
      relatedEntityType: "RELEASE",
      relatedEntityId: release.id,
      importance: 90,
      occurredAt: releasedGameTime,
    });

    return { release: rows[0]!, track: publishedTrack };
  });

  await trackAnalytics(ctx, {
    name: "release_published",
    userId: input.userId,
    careerId: career.id,
    properties: {
      format: release.format,
      strategy: release.strategy,
      trackId: trackRow?.id ?? null,
    },
  });

  return ok({ release: outcome.release, track: outcome.track, alreadyPublished: false });
}

/** Everything the catalogue screen needs, including what is locked and why. */
export async function getCatalogue(db: Database, career: CareerRow) {
  const [trackRows, releaseRows] = await Promise.all([
    db
      .select()
      .from(tracks)
      .where(and(eq(tracks.careerId, career.id), ne(tracks.status, "SCRAPPED")))
      .orderBy(tracks.createdAt),
    db.select().from(releases).where(eq(releases.careerId, career.id)),
  ]);

  return {
    tracks: trackRows.map((trackRow) => ({
      track: trackRow,
      release: releaseRows.find(
        (release) => release.trackId === trackRow.id && release.status !== "CANCELLED",
      ) ?? null,
    })),
    formats: availableFormats({
      careerAct: career.careerAct,
      catalogueSize: trackRows.length,
    }),
    releasedCount: trackRows.filter((trackRow) => trackRow.releasedAt).length,
  };
}
