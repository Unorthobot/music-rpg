import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  artists,
  calendarItems,
  careerMemories,
  careers,
  characters,
  creativeDecisions,
  creativeSessionParticipants,
  creativeSessions,
  generationJobs,
  musicBriefs,
  notifications,
  soundProfiles,
  trackVersions,
  tracks,
  type CreativeSessionRow,
  type DbClient,
  type GenerationJobRow,
  type TrackRow,
  type TrackVersionRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  canTransition,
  err,
  ids,
  ok,
  type CreativeDecisionType,
  type CreativeDirection,
  type CreativeSessionStatus,
  type MusicBriefShape,
  type ProducerProposal,
  type Result,
  type RevisionKindId,
  type SoundProfileValues,
} from "@music-rpg/shared";
import {
  applyRevision,
  buildMusicBrief,
  combineProposals,
  interpretDirection,
  masterVersionContent,
  masteredMetrics,
  qualityMetrics,
  renderVersionContent,
  suggestTitle,
  type ProducerProfile,
} from "@music-rpg/simulation";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { soundProfileValues } from "../internal/discovery";
import { HOURS } from "../internal/clock";

/**
 * The studio.
 *
 * Every command here does the same four things: refuse an impossible
 * transition, write transactionally, record what was decided, and emit the
 * canonical event that explains it. The session's `status` is the authority on
 * what can happen next — the interface never decides that, it only reflects it.
 *
 * Nothing is overwritten. Rejecting a set of proposals keeps the rejection;
 * revising a version keeps the version. What the player remembers is the
 * sequence, so the sequence is the thing we persist.
 */

/* ---------------------------------------------------------------- loading */

type SessionContext = {
  session: CreativeSessionRow;
  career: Awaited<ReturnType<typeof loadOwnedCareer>> extends Result<infer C, unknown> ? C : never;
  producer: { id: string; name: string; slug: string; profile: ProducerProfile };
};

async function loadSession(
  ctx: CommandContext,
  sessionId: string,
  userId: string,
): Promise<Result<SessionContext, DomainError>> {
  const rows = await ctx.db
    .select()
    .from(creativeSessions)
    .where(eq(creativeSessions.id, sessionId))
    .limit(1);

  const session = rows[0];
  if (!session) return err(DomainErrors.invalidInput("That session doesn't exist."));

  const careerResult = await loadOwnedCareer(ctx.db, session.careerId, userId);
  if (!careerResult.ok) return careerResult;

  const participantRows = await ctx.db
    .select()
    .from(creativeSessionParticipants)
    .where(
      and(
        eq(creativeSessionParticipants.sessionId, session.id),
        eq(creativeSessionParticipants.role, "PRODUCER"),
      ),
    )
    .limit(1);

  const producerId = participantRows[0]?.entityId;
  if (!producerId) return err(DomainErrors.invalidCareerState("This session has no producer."));

  const characterRows = await ctx.db
    .select()
    .from(characters)
    .where(eq(characters.id, producerId))
    .limit(1);

  const character = characterRows[0];
  const profile = (character?.preferences as { producer?: ProducerProfile })?.producer;
  if (!character || !profile) {
    return err(DomainErrors.invalidCareerState("This session's producer is unavailable."));
  }

  return ok({
    session,
    career: careerResult.value,
    producer: { id: character.id, name: character.name, slug: character.slug, profile },
  });
}

/** Refuses transitions the state machine doesn't allow. */
function requireTransition(
  session: CreativeSessionRow,
  to: CreativeSessionStatus,
): DomainError | null {
  if (session.status === to) return null;
  if (!canTransition(session.status, to)) {
    return DomainErrors.invalidCareerState(
      `You can't do that from here — the session is ${session.status.toLowerCase().replace(/_/g, " ")}.`,
    );
  }
  return null;
}

async function setStatus(
  tx: DbClient,
  sessionId: string,
  status: CreativeSessionStatus,
  extra: Partial<typeof creativeSessions.$inferInsert> = {},
): Promise<void> {
  await tx
    .update(creativeSessions)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(creativeSessions.id, sessionId));
}

async function recordDecision(
  tx: DbClient,
  input: {
    sessionId: string;
    actorType: string;
    actorId?: string | null;
    decisionType: CreativeDecisionType;
    payload?: Record<string, unknown>;
    relatedProposalId?: string | null;
    worldId: string;
    careerId: string;
    occurredAt: Date;
  },
): Promise<string> {
  const decisionId = ids.generic();

  await tx.insert(creativeDecisions).values({
    id: decisionId,
    sessionId: input.sessionId,
    actorType: input.actorType,
    actorId: input.actorId ?? null,
    decisionType: input.decisionType,
    payload: input.payload ?? {},
    relatedProposalId: input.relatedProposalId ?? null,
  });

  await recordEvent(tx, {
    worldId: input.worldId,
    careerId: input.careerId,
    eventType: GameEventType.CreativeDecisionRecorded,
    actorType: "USER",
    actorId: input.actorId ?? null,
    targetType: "CREATIVE_DECISION",
    targetId: decisionId,
    visibility: "PRIVATE",
    importance: 35,
    occurredAt: input.occurredAt,
    idempotencyKey: `decision:${decisionId}:recorded`,
    payload: { decisionType: input.decisionType, sessionId: input.sessionId },
  });

  return decisionId;
}

/** The artist whose identity shapes the work: the player's own, always. */
async function loadArtistContext(ctx: CommandContext, playerArtistId: string | null) {
  if (!playerArtistId) return null;

  const [artistRows, profileRows] = await Promise.all([
    ctx.db.select().from(artists).where(eq(artists.id, playerArtistId)).limit(1),
    ctx.db.select().from(soundProfiles).where(eq(soundProfiles.ownerId, playerArtistId)).limit(1),
  ]);

  const artist = artistRows[0];
  if (!artist) return null;

  const profile = profileRows.find((row) => row.ownerType === "ARTIST");

  return {
    stageName: artist.stageName,
    archetype: artist.archetype,
    traits: [] as never[],
    soundDNA: (profile
      ? soundProfileValues(profile)
      : {
          darkBright: 0,
          rawPolished: 0,
          minimalDense: 0,
          organicElectronic: 0,
          classicFuturistic: 0,
          accessibleExperimental: 0,
          melodicRhythmic: 0,
          intimateAnthemic: 0,
        }) as SoundProfileValues,
  };
}

/* ------------------------------------------------------------ 1. start */

/**
 * StartCreativeSession — walking into the room.
 *
 * The session was booked and paid for when the producer was chosen; this is the
 * moment it becomes live. The calendar item follows the session's state so the
 * two never disagree.
 */
export async function startCreativeSession(
  ctx: CommandContext,
  input: { sessionId: string; userId: string },
): Promise<Result<CreativeSessionRow, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career } = loaded.value;

  // Already in the room: idempotent, so a refresh is not an error.
  if (session.status !== "SCHEDULED") return ok(session);

  const transitionError = requireTransition(session, "ACTIVE");
  if (transitionError) return err(transitionError);

  const now = contextNow(ctx);

  /*
   * Showing up moves the career's clock to the day of the session. Without
   * this, a career books a session for tomorrow, walks in today, and finishes
   * the work before it was scheduled — its own history out of order.
   */
  const arrivalGameTime =
    session.scheduledGameTime && session.scheduledGameTime > career.currentGameDate
      ? session.scheduledGameTime
      : career.currentGameDate;

  const updated = await ctx.db.transaction(async (tx) => {
    await setStatus(tx, session.id, "AWAITING_DIRECTION", { startedAt: now });

    await tx
      .update(careers)
      .set({ currentGameDate: arrivalGameTime, lastActiveAt: now, updatedAt: now })
      .where(eq(careers.id, career.id));

    await tx
      .update(calendarItems)
      .set({ status: "ACTIVE", updatedAt: now })
      .where(
        and(
          eq(calendarItems.relatedEntityType, "CREATIVE_SESSION"),
          eq(calendarItems.relatedEntityId, session.id),
        ),
      );

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.CreativeSessionStarted,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CREATIVE_SESSION",
      targetId: session.id,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: arrivalGameTime,
      idempotencyKey: `session:${session.id}:started`,
      payload: { producerId: loaded.value.producer.id },
    });

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);
    return rows[0]!;
  });

  await track(ctx, {
    name: "new_session_started",
    userId: input.userId,
    careerId: session.careerId,
    properties: { sessionId: session.id, producer: loaded.value.producer.slug },
  });

  return ok(updated);
}

/* -------------------------------------------------------- 2. direction */

export async function setCreativeDirection(
  ctx: CommandContext,
  input: { sessionId: string; userId: string; direction: CreativeDirection },
): Promise<Result<CreativeSessionRow, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career } = loaded.value;

  const transitionError = requireTransition(session, "AWAITING_INTERPRETATION");
  if (transitionError) return err(transitionError);

  const note = input.direction.note?.trim() ?? null;
  if (note) {
    const verdict = await ctx.moderation.check(note, "FREE_TEXT");
    if (!verdict.allowed) return err(DomainErrors.invalidInput(verdict.reason, { field: "note" }));
  }

  const direction: CreativeDirection = { ...input.direction, note };
  const now = contextNow(ctx);

  const updated = await ctx.db.transaction(async (tx) => {
    await setStatus(tx, session.id, "AWAITING_INTERPRETATION", { creativeDirection: direction });

    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "CREATIVE_DIRECTION_SET",
      payload: { ...direction },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.CreativeDirectionSet,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CREATIVE_SESSION",
      targetId: session.id,
      visibility: "PRIVATE",
      importance: 45,
      occurredAt: career.currentGameDate,
      payload: {
        intention: direction.intention,
        moods: direction.moods,
        energy: direction.energy,
        risk: direction.risk,
        audience: direction.audience,
        hasNote: Boolean(note),
      },
    });

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);
    return rows[0]!;
  });

  await track(ctx, {
    name: "creative_direction_submitted",
    userId: input.userId,
    careerId: session.careerId,
    properties: { intention: direction.intention, risk: direction.risk },
  });

  return ok(updated);
}

/* ----------------------------------------------------- 3. interpretation */

export type InterpretationResult = {
  session: CreativeSessionRow;
  proposals: ProducerProposal[];
  stance: string;
  opening: string;
  fit: number;
  producerName: string;
};

/**
 * The producer responds.
 *
 * Deterministic and contextual: same artist, same producer, same direction,
 * same round — same three proposals. Rejecting bumps the round, which is what
 * makes a regenerated set genuinely different rather than a reroll of the same
 * dice.
 */
export async function interpretCreativeDirection(
  ctx: CommandContext,
  input: { sessionId: string; userId: string },
): Promise<Result<InterpretationResult, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career, producer } = loaded.value;

  const direction = session.creativeDirection as CreativeDirection | null;
  if (!direction) {
    return err(DomainErrors.invalidCareerState("Give the room a direction first."));
  }

  const transitionError = requireTransition(session, "AWAITING_DECISION");
  if (transitionError) return err(transitionError);

  const artist = await loadArtistContext(ctx, career.playerArtistId);
  if (!artist) return err(DomainErrors.controlledEntityMissing());

  const interpretation = interpretDirection({
    producer: { name: producer.name, slug: producer.slug, profile: producer.profile },
    artist,
    direction,
    careerAct: career.careerAct,
    round: session.proposalRound,
  });

  const now = contextNow(ctx);

  const updated = await ctx.db.transaction(async (tx) => {
    await setStatus(tx, session.id, "AWAITING_DECISION", {
      proposals: interpretation.proposals,
    });

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.ProducerInterpretationCreated,
      actorType: "SYSTEM",
      actorId: producer.id,
      targetType: "CREATIVE_SESSION",
      targetId: session.id,
      visibility: "PRIVATE",
      importance: 50,
      occurredAt: career.currentGameDate,
      idempotencyKey: `session:${session.id}:interpretation:${session.proposalRound}`,
      payload: {
        producerName: producer.name,
        stance: interpretation.stance,
        fit: interpretation.fit,
        round: session.proposalRound,
        titles: interpretation.proposals.map((proposal) => proposal.title),
      },
    });

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);
    return rows[0]!;
  });

  await track(ctx, {
    name: "producer_interpretation_viewed",
    userId: input.userId,
    careerId: session.careerId,
    properties: { stance: interpretation.stance, fit: interpretation.fit, round: session.proposalRound },
  });

  return ok({
    session: updated,
    proposals: interpretation.proposals,
    stance: interpretation.stance,
    opening: interpretation.opening,
    fit: interpretation.fit,
    producerName: producer.name,
  });
}

/* ------------------------------------------------------ 4. the decision */

async function ensureTrack(
  tx: DbClient,
  session: CreativeSessionRow,
  career: { controlledEntityType: string | null; controlledEntityId: string | null; playerArtistId: string | null },
  occurredAt: Date,
  userId: string,
): Promise<TrackRow> {
  if (session.trackId) {
    const rows = await tx.select().from(tracks).where(eq(tracks.id, session.trackId)).limit(1);
    if (rows[0]) return rows[0];
  }

  const trackId = ids.generic();
  const ownerType = career.controlledEntityType === "GROUP" ? "GROUP" : "ARTIST";
  const ownerId =
    career.controlledEntityType === "GROUP"
      ? career.controlledEntityId!
      : (career.playerArtistId ?? career.controlledEntityId!);

  const inserted = await tx
    .insert(tracks)
    .values({
      id: trackId,
      worldId: session.worldId,
      careerId: session.careerId,
      ownerType,
      ownerId,
      // A group's track belongs to the group and still names the player.
      primaryArtistId: career.playerArtistId,
      status: "IN_PROGRESS",
      purpose: "TRACK",
      sessionId: session.id,
    })
    .returning();

  const trackRow = inserted[0]!;

  await tx
    .update(creativeSessions)
    .set({ trackId: trackRow.id, updatedAt: new Date() })
    .where(eq(creativeSessions.id, session.id));

  await recordEvent(tx, {
    worldId: session.worldId,
    careerId: session.careerId,
    eventType: GameEventType.TrackCreated,
    actorType: "USER",
    actorId: userId,
    targetType: "TRACK",
    targetId: trackRow.id,
    visibility: "PRIVATE",
    importance: 60,
    occurredAt,
    idempotencyKey: `track:${trackRow.id}:created`,
    payload: { ownerType, ownerId, sessionId: session.id },
  });

  return trackRow;
}

/** Writes a brief and queues the render that will realise it. */
async function requestRender(
  tx: DbClient,
  input: {
    session: CreativeSessionRow;
    brief: MusicBriefShape;
    trackId: string;
    revisionOfId?: string | null;
    userId: string;
    occurredAt: Date;
    jobType: "QUICK_RENDER" | "MASTER";
    sourceVersionId?: string | null;
  },
): Promise<{ briefId: string; jobId: string }> {
  const briefId = ids.generic();

  await tx.insert(musicBriefs).values({
    id: briefId,
    sessionId: input.session.id,
    trackId: input.trackId,
    revisionOfId: input.revisionOfId ?? null,
    purpose: input.brief.purpose,
    intention: input.brief.intention,
    mood: input.brief.mood,
    energy: input.brief.energy,
    risk: input.brief.risk,
    audience: input.brief.audience,
    soundDirection: input.brief.soundDirection,
    subject: input.brief.subject,
    structure: input.brief.structure,
    interpretation: input.brief.interpretation,
  });

  const jobId = ids.generic();

  await tx.insert(generationJobs).values({
    id: jobId,
    worldId: input.session.worldId,
    careerId: input.session.careerId,
    sessionId: input.session.id,
    jobType: input.jobType,
    // The state machine starts at REQUESTED even though the development
    // provider is instant: the architecture is the contract, not the provider.
    status: "REQUESTED",
    provider: "development",
    payload: {
      briefId,
      trackId: input.trackId,
      sourceVersionId: input.sourceVersionId ?? null,
    },
    idempotencyKey: `${input.jobType.toLowerCase()}:${briefId}`,
  });

  await recordEvent(tx, {
    worldId: input.session.worldId,
    careerId: input.session.careerId,
    eventType: GameEventType.GenerationRequested,
    actorType: "USER",
    actorId: input.userId,
    targetType: "GENERATION_JOB",
    targetId: jobId,
    visibility: "PRIVATE",
    importance: 30,
    occurredAt: input.occurredAt,
    idempotencyKey: `job:${jobId}:requested`,
    payload: { jobType: input.jobType, sessionId: input.session.id },
  });

  return { briefId, jobId };
}

export type ProposalDecisionResult = {
  session: CreativeSessionRow;
  trackId: string;
  jobId: string;
};

/**
 * SelectProducerProposal — "make this one".
 *
 * Accepting a proposal is also the render request: it records the decision,
 * creates the track if this is the first version, writes the brief and queues
 * the job. One player action, one intention.
 */
export async function selectProducerProposal(
  ctx: CommandContext,
  input: { sessionId: string; userId: string; proposalId: string },
): Promise<Result<ProposalDecisionResult, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career, producer } = loaded.value;

  const transitionError = requireTransition(session, "CREATING_VERSION");
  if (transitionError) return err(transitionError);

  const proposal = session.proposals.find((candidate) => candidate.id === input.proposalId);
  if (!proposal) return err(DomainErrors.invalidInput("That idea isn't on the table."));

  const direction = session.creativeDirection as CreativeDirection | null;
  if (!direction) return err(DomainErrors.invalidCareerState("This session has no direction yet."));

  const brief = buildMusicBrief({
    direction,
    proposal,
    interpretation: { stance: proposal.stance, opening: proposal.line },
    producerName: producer.name,
    purpose: "TRACK",
  });

  const now = contextNow(ctx);

  const outcome = await ctx.db.transaction(async (tx) => {
    const trackRow = await ensureTrack(tx, session, career, career.currentGameDate, input.userId);

    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "PRODUCER_PROPOSAL_ACCEPTED",
      relatedProposalId: proposal.id,
      payload: { title: proposal.title, stance: proposal.stance, round: session.proposalRound },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    const { jobId } = await requestRender(tx, {
      session,
      brief,
      trackId: trackRow.id,
      userId: input.userId,
      occurredAt: career.currentGameDate,
      jobType: "QUICK_RENDER",
    });

    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "TRACK_VERSION_REQUESTED",
      relatedProposalId: proposal.id,
      payload: { jobId },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    await setStatus(tx, session.id, "CREATING_VERSION");

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);

    return { session: rows[0]!, trackId: trackRow.id, jobId };
  });

  await track(ctx, {
    name: "producer_proposal_selected",
    userId: input.userId,
    careerId: session.careerId,
    properties: { proposalId: proposal.id, stance: proposal.stance },
  });
  await track(ctx, {
    name: "quick_render_requested",
    userId: input.userId,
    careerId: session.careerId,
    properties: { jobId: outcome.jobId },
  });

  return ok(outcome);
}

/** Rejecting the whole set sends the producer back to think again. */
export async function rejectProducerProposals(
  ctx: CommandContext,
  input: { sessionId: string; userId: string; reason?: string | null },
): Promise<Result<CreativeSessionRow, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career } = loaded.value;

  const transitionError = requireTransition(session, "AWAITING_INTERPRETATION");
  if (transitionError) return err(transitionError);

  const updated = await ctx.db.transaction(async (tx) => {
    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "PRODUCER_PROPOSAL_REJECTED",
      payload: {
        round: session.proposalRound,
        rejected: session.proposals.map((proposal) => proposal.title),
        reason: input.reason ?? null,
      },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    // The round is what makes the next set different.
    await setStatus(tx, session.id, "AWAITING_INTERPRETATION", {
      proposalRound: session.proposalRound + 1,
      proposals: [],
    });

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);
    return rows[0]!;
  });

  await track(ctx, {
    name: "producer_proposal_rejected",
    userId: input.userId,
    careerId: session.careerId,
    properties: { round: session.proposalRound },
  });

  return ok(updated);
}

/** Two ideas, folded together. */
export async function combineProducerProposals(
  ctx: CommandContext,
  input: { sessionId: string; userId: string; proposalIds: [string, string] },
): Promise<Result<ProposalDecisionResult, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career, producer } = loaded.value;

  const transitionError = requireTransition(session, "CREATING_VERSION");
  if (transitionError) return err(transitionError);

  const [firstId, secondId] = input.proposalIds;
  const first = session.proposals.find((proposal) => proposal.id === firstId);
  const second = session.proposals.find((proposal) => proposal.id === secondId);

  if (!first || !second || first.id === second.id) {
    return err(DomainErrors.invalidInput("Pick two different ideas to combine."));
  }

  const combined = combineProposals(first, second, {
    name: producer.name,
    profile: producer.profile,
  });

  const direction = session.creativeDirection as CreativeDirection | null;
  if (!direction) return err(DomainErrors.invalidCareerState("This session has no direction yet."));

  const brief = buildMusicBrief({
    direction,
    proposal: combined,
    interpretation: { stance: combined.stance, opening: combined.line },
    producerName: producer.name,
    purpose: "TRACK",
  });

  const outcome = await ctx.db.transaction(async (tx) => {
    const trackRow = await ensureTrack(tx, session, career, career.currentGameDate, input.userId);

    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "PRODUCER_PROPOSALS_COMBINED",
      relatedProposalId: combined.id,
      payload: { combined: [first.title, second.title], title: combined.title },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    const { jobId } = await requestRender(tx, {
      session,
      brief,
      trackId: trackRow.id,
      userId: input.userId,
      occurredAt: career.currentGameDate,
      jobType: "QUICK_RENDER",
    });

    await setStatus(tx, session.id, "CREATING_VERSION");

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);

    return { session: rows[0]!, trackId: trackRow.id, jobId };
  });

  await track(ctx, {
    name: "producer_proposals_combined",
    userId: input.userId,
    careerId: session.careerId,
    properties: { proposals: [first.id, second.id] },
  });

  return ok(outcome);
}

/* ------------------------------------------------------- 5. generation */

const JOB_SEQUENCE = ["REQUESTED", "QUEUED", "GENERATING", "EVALUATING", "COMPLETE"] as const;

export type JobAdvanceResult = {
  job: GenerationJobRow;
  version: TrackVersionRow | null;
  done: boolean;
};

/**
 * AdvanceGenerationJob — one step of the render.
 *
 * The development provider is instant, but the job still walks
 * REQUESTED → QUEUED → GENERATING → EVALUATING → COMPLETE, and the interface
 * still observes it. When a real audio provider arrives it replaces the work
 * done at the COMPLETE step and nothing else changes.
 *
 * Idempotent at the end: completing an already-complete job returns the version
 * it produced instead of making a second one.
 */
export async function advanceGenerationJob(
  ctx: CommandContext,
  input: { jobId: string; userId: string },
): Promise<Result<JobAdvanceResult, DomainError>> {
  const jobRows = await ctx.db
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.id, input.jobId))
    .limit(1);

  const job = jobRows[0];
  if (!job) return err(DomainErrors.invalidInput("That render doesn't exist."));
  if (!job.sessionId) return err(DomainErrors.invalidInput("That render isn't part of a session."));

  const loaded = await loadSession(ctx, job.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career, producer } = loaded.value;

  if (job.status === "COMPLETE") {
    const existing = job.trackVersionId
      ? await ctx.db
          .select()
          .from(trackVersions)
          .where(eq(trackVersions.id, job.trackVersionId))
          .limit(1)
      : [];
    return ok({ job, version: existing[0] ?? null, done: true });
  }

  if (job.status === "FAILED" || job.status === "CANCELLED") {
    return err(DomainErrors.invalidCareerState("That render stopped. Your session is safe."));
  }

  const currentIndex = JOB_SEQUENCE.indexOf(job.status as (typeof JOB_SEQUENCE)[number]);
  const nextStatus = JOB_SEQUENCE[Math.min(currentIndex + 1, JOB_SEQUENCE.length - 1)]!;
  const now = contextNow(ctx);

  // Intermediate steps only move the machine.
  if (nextStatus !== "COMPLETE") {
    const updated = await ctx.db
      .update(generationJobs)
      .set({
        status: nextStatus,
        startedAt: job.startedAt ?? (nextStatus === "GENERATING" ? now : null),
        attempts: job.attempts + (nextStatus === "GENERATING" ? 1 : 0),
        updatedAt: now,
      })
      .where(eq(generationJobs.id, job.id))
      .returning();

    return ok({ job: updated[0]!, version: null, done: false });
  }

  // COMPLETE: this is where a real provider's output would land.
  const payload = job.payload as { briefId: string; trackId: string; sourceVersionId?: string | null };

  const briefRows = await ctx.db
    .select()
    .from(musicBriefs)
    .where(eq(musicBriefs.id, payload.briefId))
    .limit(1);

  const briefRow = briefRows[0];
  if (!briefRow) return err(DomainErrors.invalidInput("That render lost its brief."));

  const brief: MusicBriefShape = {
    purpose: briefRow.purpose,
    intention: briefRow.intention,
    mood: briefRow.mood,
    energy: briefRow.energy,
    risk: briefRow.risk,
    audience: briefRow.audience,
    soundDirection: briefRow.soundDirection,
    subject: briefRow.subject,
    structure: briefRow.structure ?? "",
    interpretation: briefRow.interpretation as MusicBriefShape["interpretation"],
  };

  const artist = await loadArtistContext(ctx, career.playerArtistId);
  const isMaster = job.jobType === "MASTER";

  const outcome = await ctx.db.transaction(async (tx) => {
    const numbering = await tx
      .select({ value: sql<number>`coalesce(max(version_number), 0)::int` })
      .from(trackVersions)
      .where(eq(trackVersions.trackId, payload.trackId));

    const versionNumber = (numbering[0]?.value ?? 0) + 1;

    let content = renderVersionContent({
      brief,
      artistName: artist?.stageName ?? "Unknown",
      producerName: producer.name,
      versionNumber,
      seedSalt: briefRow.id,
    });

    let metrics = qualityMetrics(brief);

    if (isMaster) {
      content = masterVersionContent(content, producer.name);
      metrics = masteredMetrics(metrics);
    }

    const versionId = ids.generic();

    await tx.insert(trackVersions).values({
      id: versionId,
      trackId: payload.trackId,
      sessionId: session.id,
      versionNumber,
      musicBriefId: briefRow.id,
      workingTitle: content.workingTitle,
      content,
      qualityMetrics: metrics,
      soundProfile: brief.soundDirection as SoundProfileValues,
      generationJobId: job.id,
      isMaster,
    });

    const updatedJob = await tx
      .update(generationJobs)
      .set({
        status: "COMPLETE",
        trackVersionId: versionId,
        finishedAt: now,
        result: { versionId, versionNumber },
        updatedAt: now,
      })
      .where(eq(generationJobs.id, job.id))
      .returning();

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.GenerationCompleted,
      actorType: "SYSTEM",
      actorId: producer.id,
      targetType: "GENERATION_JOB",
      targetId: job.id,
      visibility: "PRIVATE",
      importance: 35,
      occurredAt: career.currentGameDate,
      idempotencyKey: `job:${job.id}:completed`,
      payload: { versionId, versionNumber, jobType: job.jobType },
    });

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.TrackVersionCreated,
      actorType: "SYSTEM",
      actorId: producer.id,
      targetType: "TRACK_VERSION",
      targetId: versionId,
      visibility: "PRIVATE",
      importance: 55,
      occurredAt: career.currentGameDate,
      idempotencyKey: `version:${versionId}:created`,
      payload: { versionNumber, trackId: payload.trackId, workingTitle: content.workingTitle },
    });

    if (isMaster) {
      await tx
        .update(tracks)
        .set({ currentMasterVersionId: versionId, status: "COMPLETE", updatedAt: now })
        .where(eq(tracks.id, payload.trackId));

      await recordEvent(tx, {
        worldId: session.worldId,
        careerId: session.careerId,
        eventType: GameEventType.TrackVersionMastered,
        actorType: "SYSTEM",
        actorId: producer.id,
        targetType: "TRACK_VERSION",
        targetId: versionId,
        visibility: "PRIVATE",
        importance: 65,
        occurredAt: career.currentGameDate,
        idempotencyKey: `version:${versionId}:mastered`,
        payload: { trackId: payload.trackId, versionNumber },
      });
    }

    await setStatus(tx, session.id, "REVIEW");

    // The player is allowed to leave while this runs, so completion has to
    // reach them somewhere other than the screen they were on.
    await tx.insert(notifications).values({
      id: ids.generic(),
      userId: career.userId,
      careerId: session.careerId,
      kind: isMaster ? "MASTER_COMPLETE" : "RENDER_COMPLETE",
      title: isMaster
        ? `${producer.name} finished the master`
        : `${producer.name} finished the sketch`,
      body: content.workingTitle,
      payload: { sessionId: session.id, versionId, versionNumber },
    });

    const versionRows = await tx
      .select()
      .from(trackVersions)
      .where(eq(trackVersions.id, versionId))
      .limit(1);

    return { job: updatedJob[0]!, version: versionRows[0]! };
  });

  await track(ctx, {
    name: isMaster ? "master_completed" : "quick_render_completed",
    userId: input.userId,
    careerId: session.careerId,
    properties: { jobId: job.id, versionNumber: outcome.version.versionNumber },
  });

  return ok({ job: outcome.job, version: outcome.version, done: true });
}

/** Runs a job to completion. Used by tests and by the polling route. */
export async function runGenerationJobToCompletion(
  ctx: CommandContext,
  input: { jobId: string; userId: string },
): Promise<Result<JobAdvanceResult, DomainError>> {
  let last: JobAdvanceResult | null = null;

  for (let step = 0; step < JOB_SEQUENCE.length + 1; step += 1) {
    const result = await advanceGenerationJob(ctx, input);
    if (!result.ok) return result;
    last = result.value;
    if (result.value.done) break;
  }

  if (!last) return err(DomainErrors.invalidInput("That render didn't start."));
  return ok(last);
}

/* -------------------------------------------------------- 6. revision */

export async function requestRevision(
  ctx: CommandContext,
  input: {
    sessionId: string;
    userId: string;
    kind: RevisionKindId;
    note?: string | null;
    versionId?: string;
  },
): Promise<Result<ProposalDecisionResult, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career } = loaded.value;

  const transitionError = requireTransition(session, "CREATING_VERSION");
  if (transitionError) return err(transitionError);
  if (!session.trackId) return err(DomainErrors.invalidCareerState("There's nothing to revise yet."));

  const latest = await ctx.db
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.trackId, session.trackId))
    .orderBy(desc(trackVersions.versionNumber))
    .limit(1);

  const source = input.versionId
    ? (await ctx.db.select().from(trackVersions).where(eq(trackVersions.id, input.versionId)).limit(1))[0]
    : latest[0];

  if (!source) return err(DomainErrors.invalidCareerState("There's nothing to revise yet."));
  if (!source.musicBriefId) return err(DomainErrors.invalidInput("That version has no brief."));

  const briefRows = await ctx.db
    .select()
    .from(musicBriefs)
    .where(eq(musicBriefs.id, source.musicBriefId))
    .limit(1);

  const parent = briefRows[0];
  if (!parent) return err(DomainErrors.invalidInput("That version has no brief."));

  const note = input.note?.trim() || null;
  if (note) {
    const verdict = await ctx.moderation.check(note, "FREE_TEXT");
    if (!verdict.allowed) return err(DomainErrors.invalidInput(verdict.reason, { field: "note" }));
  }

  const revised = applyRevision(
    {
      purpose: parent.purpose,
      intention: parent.intention,
      mood: parent.mood,
      energy: parent.energy,
      risk: parent.risk,
      audience: parent.audience,
      soundDirection: parent.soundDirection,
      subject: parent.subject,
      structure: parent.structure ?? "",
      interpretation: parent.interpretation as MusicBriefShape["interpretation"],
    },
    input.kind,
    note,
  );

  const outcome = await ctx.db.transaction(async (tx) => {
    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "REVISION_REQUESTED",
      payload: { kind: input.kind, note, fromVersion: source.versionNumber },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    const { jobId } = await requestRender(tx, {
      session,
      brief: revised,
      trackId: session.trackId!,
      revisionOfId: parent.id,
      userId: input.userId,
      occurredAt: career.currentGameDate,
      jobType: "QUICK_RENDER",
      sourceVersionId: source.id,
    });

    await setStatus(tx, session.id, "CREATING_VERSION");

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);

    return { session: rows[0]!, trackId: session.trackId!, jobId };
  });

  await track(ctx, {
    name: "revision_requested",
    userId: input.userId,
    careerId: session.careerId,
    properties: { kind: input.kind, hasNote: Boolean(note) },
  });

  return ok(outcome);
}

/* --------------------------------------------------------- 7. mastering */

export async function requestMaster(
  ctx: CommandContext,
  input: { sessionId: string; userId: string; versionId: string },
): Promise<Result<{ session: CreativeSessionRow; jobId: string }, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career, producer } = loaded.value;

  const transitionError = requireTransition(session, "MASTERING");
  if (transitionError) return err(transitionError);

  const versionRows = await ctx.db
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.id, input.versionId))
    .limit(1);

  const version = versionRows[0];
  // You cannot master something that doesn't exist.
  if (!version || version.trackId !== session.trackId) {
    return err(DomainErrors.invalidCareerState("There's no version to master."));
  }
  if (!version.musicBriefId) return err(DomainErrors.invalidInput("That version has no brief."));

  const briefRows = await ctx.db
    .select()
    .from(musicBriefs)
    .where(eq(musicBriefs.id, version.musicBriefId))
    .limit(1);

  const parent = briefRows[0]!;

  const brief: MusicBriefShape = {
    purpose: parent.purpose,
    intention: parent.intention,
    mood: parent.mood,
    energy: parent.energy,
    risk: parent.risk,
    audience: parent.audience,
    soundDirection: parent.soundDirection,
    subject: parent.subject,
    structure: parent.structure ?? "",
    interpretation: parent.interpretation as MusicBriefShape["interpretation"],
  };

  const outcome = await ctx.db.transaction(async (tx) => {
    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "MASTER_REQUESTED",
      payload: { versionId: version.id, versionNumber: version.versionNumber },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    const { jobId } = await requestRender(tx, {
      session,
      brief,
      trackId: session.trackId!,
      revisionOfId: parent.id,
      userId: input.userId,
      occurredAt: career.currentGameDate,
      jobType: "MASTER",
      sourceVersionId: version.id,
    });

    await setStatus(tx, session.id, "MASTERING");

    const rows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);

    return { session: rows[0]!, jobId };
  });

  await track(ctx, {
    name: "master_requested",
    userId: input.userId,
    careerId: session.careerId,
    properties: { versionId: version.id, producer: producer.slug },
  });

  return ok(outcome);
}

/* ------------------------------------------------------------ 8. saving */

export async function renameTrack(
  ctx: CommandContext,
  input: { sessionId: string; userId: string; title: string },
): Promise<Result<TrackRow, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career } = loaded.value;

  if (!session.trackId) return err(DomainErrors.invalidCareerState("There's no track to name."));

  const verdict = await ctx.moderation.check(input.title, "STAGE_NAME");
  if (!verdict.allowed) return err(DomainErrors.invalidInput(verdict.reason, { field: "title" }));

  const now = contextNow(ctx);

  const updated = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(tracks)
      .set({ title: verdict.value, updatedAt: now })
      .where(eq(tracks.id, session.trackId!))
      .returning();

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.TrackRenamed,
      actorType: "USER",
      actorId: input.userId,
      targetType: "TRACK",
      targetId: session.trackId!,
      visibility: "PRIVATE",
      importance: 25,
      occurredAt: career.currentGameDate,
      payload: { title: verdict.value },
    });

    return rows[0]!;
  });

  return ok(updated);
}

export type SaveTrackResult = {
  track: TrackRow;
  session: CreativeSessionRow;
  title: string;
};

/**
 * SaveTrackToCatalogue — the end of the session and the start of a catalogue.
 *
 * Requires a master: a track cannot be saved from a sketch. Completing here
 * closes the session, completes the calendar item, writes the career's first
 * structured memory and moves the in-world clock — the session took an evening.
 */
export async function saveTrackToCatalogue(
  ctx: CommandContext,
  input: { sessionId: string; userId: string; title?: string | null },
): Promise<Result<SaveTrackResult, DomainError>> {
  const loaded = await loadSession(ctx, input.sessionId, input.userId);
  if (!loaded.ok) return loaded;
  const { session, career, producer } = loaded.value;

  if (session.status === "COMPLETED") {
    const rows = await ctx.db.select().from(tracks).where(eq(tracks.id, session.trackId!)).limit(1);
    return ok({ track: rows[0]!, session, title: rows[0]?.title ?? "" });
  }

  const transitionError = requireTransition(session, "COMPLETED");
  if (transitionError) return err(transitionError);
  if (!session.trackId) return err(DomainErrors.invalidCareerState("There's no track to save."));

  const trackRows = await ctx.db
    .select()
    .from(tracks)
    .where(eq(tracks.id, session.trackId))
    .limit(1);

  const trackRow = trackRows[0];
  if (!trackRow) return err(DomainErrors.invalidCareerState("There's no track to save."));

  // Saving without mastering would put an unfinished sketch in the catalogue.
  if (!trackRow.currentMasterVersionId) {
    return err(DomainErrors.invalidCareerState("Master a version before saving it."));
  }

  const masterRows = await ctx.db
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.id, trackRow.currentMasterVersionId))
    .limit(1);

  const master = masterRows[0];
  const proposedTitle = input.title?.trim() || trackRow.title || master?.workingTitle || "Untitled";

  const verdict = await ctx.moderation.check(proposedTitle, "STAGE_NAME");
  if (!verdict.allowed) return err(DomainErrors.invalidInput(verdict.reason, { field: "title" }));

  const title = verdict.value;
  const now = contextNow(ctx);
  // An evening in the studio.
  const nextGameDate = new Date(career.currentGameDate.getTime() + 6 * HOURS);

  const outcome = await ctx.db.transaction(async (tx) => {
    const updatedTrack = await tx
      .update(tracks)
      .set({ title, status: "UNRELEASED", updatedAt: now })
      .where(eq(tracks.id, trackRow.id))
      .returning();

    await recordDecision(tx, {
      sessionId: session.id,
      actorType: "USER",
      actorId: input.userId,
      decisionType: "TRACK_SAVED",
      payload: { title, trackId: trackRow.id },
      worldId: session.worldId,
      careerId: session.careerId,
      occurredAt: career.currentGameDate,
    });

    await setStatus(tx, session.id, "COMPLETED", { endedAt: now });

    await tx
      .update(calendarItems)
      .set({ status: "COMPLETED", updatedAt: now })
      .where(
        and(
          eq(calendarItems.relatedEntityType, "CREATIVE_SESSION"),
          eq(calendarItems.relatedEntityId, session.id),
        ),
      );

    await tx
      .update(careers)
      .set({ currentGameDate: nextGameDate, lastActiveAt: now, updatedAt: now })
      .where(eq(careers.id, career.id));

    const savedEvent = await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.TrackSavedToCatalogue,
      actorType: "USER",
      actorId: input.userId,
      targetType: "TRACK",
      targetId: trackRow.id,
      // The scene can eventually notice a record exists.
      visibility: "LOCAL_PUBLIC",
      importance: 85,
      occurredAt: career.currentGameDate,
      idempotencyKey: `track:${trackRow.id}:saved`,
      payload: { title, producerName: producer.name, sessionId: session.id },
    });

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.CreativeSessionCompleted,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CREATIVE_SESSION",
      targetId: session.id,
      visibility: "PRIVATE",
      importance: 60,
      occurredAt: career.currentGameDate,
      idempotencyKey: `session:${session.id}:completed`,
      payload: { trackId: trackRow.id, title },
    });

    await recordEvent(tx, {
      worldId: session.worldId,
      careerId: session.careerId,
      eventType: GameEventType.CalendarItemCompleted,
      actorType: "CAREER",
      actorId: career.id,
      targetType: "CREATIVE_SESSION",
      targetId: session.id,
      visibility: "PRIVATE",
      importance: 25,
      occurredAt: career.currentGameDate,
      payload: { sessionId: session.id },
    });

    // The first structured memory this career will keep.
    await tx.insert(careerMemories).values({
      id: ids.generic(),
      careerId: career.id,
      kind: "FIRST_TRACK",
      summary: `Made "${title}" with ${producer.name}.`,
      sourceEventId: savedEvent.id,
      relatedEntityType: "TRACK",
      relatedEntityId: trackRow.id,
      importance: 85,
      occurredAt: career.currentGameDate,
    });

    const sessionRows = await tx
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, session.id))
      .limit(1);

    return { track: updatedTrack[0]!, session: sessionRows[0]! };
  });

  await track(ctx, {
    name: "track_saved",
    userId: input.userId,
    careerId: session.careerId,
    properties: { trackId: trackRow.id, title },
  });
  await track(ctx, {
    name: "studio_session_completed",
    userId: input.userId,
    careerId: session.careerId,
    properties: { sessionId: session.id },
  });

  return ok({ track: outcome.track, session: outcome.session, title });
}

/* -------------------------------------------------------- read helpers */

export async function listSessionDecisions(ctx: CommandContext, sessionId: string) {
  return ctx.db
    .select()
    .from(creativeDecisions)
    .where(eq(creativeDecisions.sessionId, sessionId))
    .orderBy(asc(creativeDecisions.sequence));
}
