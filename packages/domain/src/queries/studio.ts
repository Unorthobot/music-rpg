import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import {
  calendarItems,
  characters,
  creativeDecisions,
  creativeSessionParticipants,
  creativeSessions,
  gameEvents,
  generationJobs,
  musicBriefs,
  trackVersions,
  tracks,
  type CareerRow,
  type CharacterRow,
  type CreativeDecisionRow,
  type CreativeSessionRow,
  type Database,
  type GenerationJobRow,
  type TrackRow,
  type TrackVersionRow,
} from "@music-rpg/database";
import { gameEventLabels } from "@music-rpg/events";
import type { CreativeDirection, ProducerProposal } from "@music-rpg/shared";

/**
 * Studio read models.
 *
 * The workspace is a view of a session, not a wizard holding its own state: the
 * session's status decides what the player can do, and everything on screen —
 * proposals, versions, decisions, the producer's last line — is read back from
 * what was persisted.
 */

export type StudioHome = {
  activeSession: (CreativeSessionRow & { producerName: string | null }) | null;
  recentSessions: (CreativeSessionRow & { producerName: string | null })[];
  tracks: (TrackRow & { versionCount: number })[];
  scheduledCount: number;
};

async function producerNameFor(db: Database, sessionId: string): Promise<string | null> {
  const rows = await db
    .select({ name: characters.name })
    .from(creativeSessionParticipants)
    .innerJoin(characters, eq(characters.id, creativeSessionParticipants.entityId))
    .where(
      and(
        eq(creativeSessionParticipants.sessionId, sessionId),
        eq(creativeSessionParticipants.role, "PRODUCER"),
      ),
    )
    .limit(1);

  return rows[0]?.name ?? null;
}

export async function getStudioHome(db: Database, career: CareerRow): Promise<StudioHome> {
  const sessions = await db
    .select()
    .from(creativeSessions)
    .where(eq(creativeSessions.careerId, career.id))
    .orderBy(desc(creativeSessions.createdAt));

  const withProducers = await Promise.all(
    sessions.map(async (session) => ({
      ...session,
      producerName: await producerNameFor(db, session.id),
    })),
  );

  const trackRows = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.careerId, career.id), ne(tracks.status, "SCRAPPED")))
    .orderBy(desc(tracks.createdAt));

  const trackIds = trackRows.map((row) => row.id);
  const versions = trackIds.length
    ? await db.select().from(trackVersions).where(inArray(trackVersions.trackId, trackIds))
    : [];

  return {
    activeSession:
      withProducers.find((session) => !["COMPLETED", "CANCELLED"].includes(session.status)) ?? null,
    recentSessions: withProducers.filter((session) => session.status === "COMPLETED").slice(0, 5),
    tracks: trackRows.map((row) => ({
      ...row,
      versionCount: versions.filter((version) => version.trackId === row.id).length,
    })),
    scheduledCount: withProducers.filter((session) => session.status === "SCHEDULED").length,
  };
}

export type SessionView = {
  session: CreativeSessionRow;
  producer: CharacterRow | null;
  producerLine: string | null;
  direction: CreativeDirection | null;
  proposals: ProducerProposal[];
  track: TrackRow | null;
  versions: (TrackVersionRow & { briefSubject: string | null })[];
  decisions: CreativeDecisionRow[];
  /** The render the workspace is waiting on, if any. */
  pendingJob: GenerationJobRow | null;
  participants: { role: string; name: string }[];
};

export async function getCreativeSession(
  db: Database,
  careerId: string,
  sessionId: string,
): Promise<SessionView | null> {
  const rows = await db
    .select()
    .from(creativeSessions)
    .where(and(eq(creativeSessions.id, sessionId), eq(creativeSessions.careerId, careerId)))
    .limit(1);

  const session = rows[0];
  if (!session) return null;

  const participantRows = await db
    .select({ participant: creativeSessionParticipants, character: characters })
    .from(creativeSessionParticipants)
    .leftJoin(characters, eq(characters.id, creativeSessionParticipants.entityId))
    .where(eq(creativeSessionParticipants.sessionId, sessionId));

  const producerRow = participantRows.find((row) => row.participant.role === "PRODUCER");
  const producer = producerRow?.character ?? null;

  const [trackRows, versionRows, decisionRows, jobRows] = await Promise.all([
    session.trackId
      ? db.select().from(tracks).where(eq(tracks.id, session.trackId)).limit(1)
      : Promise.resolve([]),
    session.trackId
      ? db
          .select()
          .from(trackVersions)
          .where(eq(trackVersions.trackId, session.trackId))
          .orderBy(asc(trackVersions.versionNumber))
      : Promise.resolve([]),
    db
      .select()
      .from(creativeDecisions)
      .where(eq(creativeDecisions.sessionId, sessionId))
      .orderBy(asc(creativeDecisions.sequence)),
    db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.sessionId, sessionId))
      .orderBy(desc(generationJobs.createdAt)),
  ]);

  const briefIds = versionRows.map((version) => version.musicBriefId).filter(Boolean) as string[];
  const briefs = briefIds.length
    ? await db.select().from(musicBriefs).where(inArray(musicBriefs.id, briefIds))
    : [];

  const pendingJob = jobRows.find((job) => !["COMPLETE", "FAILED", "CANCELLED"].includes(job.status));

  // What the producer said most recently — their presence in the room.
  const lastDecision = [...decisionRows].reverse().find((decision) =>
    ["PRODUCER_PROPOSAL_ACCEPTED", "REVISION_REQUESTED", "MASTER_REQUESTED"].includes(
      decision.decisionType,
    ),
  );

  return {
    session,
    producer,
    producerLine:
      (session.proposals[0]?.line as string | undefined) ??
      ((lastDecision?.payload as { line?: string })?.line ?? null),
    direction: (session.creativeDirection as CreativeDirection | null) ?? null,
    proposals: session.proposals,
    track: trackRows[0] ?? null,
    versions: versionRows.map((version) => ({
      ...version,
      briefSubject: briefs.find((brief) => brief.id === version.musicBriefId)?.subject ?? null,
    })),
    decisions: decisionRows,
    pendingJob: pendingJob ?? null,
    participants: participantRows.map((row) => ({
      role: row.participant.role,
      name: row.character?.name ?? row.participant.entityId,
    })),
  };
}

/* --- Timeline ------------------------------------------------------------- */

export type TimelineEntry = {
  id: string;
  label: string;
  detail: string;
  occurredAt: Date;
  importance: number;
};

/**
 * The career timeline, derived from canonical events.
 *
 * Not a separately authored narrative: these are the things that actually
 * happened, read back in the player's language, in the order they happened.
 */
const TIMELINE_TYPES: Record<string, (payload: Record<string, string | number>) => string> = {
  "career.entered_underground": () => "Started with nothing and five thousand rand.",
  "character.first_contact_created": (payload) => `${payload.characterName ?? "Someone"} got in touch.`,
  "producer.selected": (payload) => `Chose ${payload.producerName} for a first session.`,
  "creative_session.started": () => "Walked into the studio.",
  "creative_direction.set": (payload) => `Asked for something ${String(payload.intention)}.`,
  "producer.interpretation_created": (payload) =>
    `${payload.producerName ?? "The producer"} came back with three ideas.`,
  "track_version.created": (payload) => `Version ${payload.versionNumber} — "${payload.workingTitle}".`,
  "track_version.mastered": (payload) => `Mastered version ${payload.versionNumber}.`,
  "track.saved_to_catalogue": (payload) => `Saved "${payload.title}".`,
  "creative_session.completed": () => "Session finished.",
};

export async function getCareerTimeline(
  db: Database,
  careerId: string,
  limit = 40,
): Promise<TimelineEntry[]> {
  const rows = await db
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.careerId, careerId))
    .orderBy(desc(gameEvents.sequence))
    .limit(200);

  const entries: TimelineEntry[] = [];

  for (const event of rows) {
    const describe = TIMELINE_TYPES[event.eventType];
    if (!describe) continue;

    entries.push({
      id: event.id,
      label: gameEventLabels[event.eventType as keyof typeof gameEventLabels] ?? event.eventType,
      detail: describe(event.payload as Record<string, string | number>),
      occurredAt: event.occurredAt,
      importance: event.importance,
    });
  }

  return entries.slice(0, limit);
}

/** Calendar item bound to a session, for completing it alongside. */
export async function getSessionCalendarItem(db: Database, sessionId: string) {
  const rows = await db
    .select()
    .from(calendarItems)
    .where(
      and(
        eq(calendarItems.relatedEntityType, "CREATIVE_SESSION"),
        eq(calendarItems.relatedEntityId, sessionId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
