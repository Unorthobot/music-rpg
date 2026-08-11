import { and, asc, desc, eq } from "drizzle-orm";
import {
  artistAudience,
  audienceCohorts,
  careerMetricPressure,
  receptionTicks,
  releaseCohortPerformance,
  releasePerformance,
  releases,
  tracks,
  type ArtistAudienceRow,
  type AudienceCohortRow,
  type CareerMetricPressureRow,
  type Database,
  type ReceptionTickRow,
  type ReleaseCohortPerformanceRow,
  type ReleasePerformanceRow,
  type ReleaseRow,
} from "@music-rpg/database";

/**
 * Reading reception.
 *
 * Every one of these is a projection of simulation state. Nothing computes a
 * number here that a tick did not produce — a query that invented a figure
 * would put the game back where M4 left it, asserting things it cannot justify.
 */

export type ReleasePerformanceView = {
  release: ReleaseRow;
  title: string | null;
  performance: ReleasePerformanceRow | null;
};

export async function getReleasePerformance(
  db: Database,
  releaseId: string,
): Promise<ReleasePerformanceView | null> {
  const releaseRows = await db.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
  const release = releaseRows[0];
  if (!release) return null;

  const [performanceRows, trackRows] = await Promise.all([
    db.select().from(releasePerformance).where(eq(releasePerformance.releaseId, releaseId)).limit(1),
    release.trackId
      ? db.select().from(tracks).where(eq(tracks.id, release.trackId)).limit(1)
      : Promise.resolve([]),
  ]);

  return {
    release,
    title: trackRows[0]?.title ?? null,
    // Null rather than zeros: a release nobody has simulated yet has no
    // performance, which is a different fact from a performance of nothing.
    performance: performanceRows[0] ?? null,
  };
}

export type CohortPerformanceView = {
  cohort: AudienceCohortRow;
  performance: ReleaseCohortPerformanceRow | null;
};

/**
 * How each cohort answered.
 *
 * Every cohort in the world is returned, including ones this record never
 * reached — "scene heads never heard it" is an answer, and hiding the row would
 * make it look like a question nobody asked.
 */
export async function getReleaseCohortPerformance(
  db: Database,
  releaseId: string,
): Promise<CohortPerformanceView[]> {
  const releaseRows = await db.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
  const release = releaseRows[0];
  if (!release) return [];

  const [cohorts, performances] = await Promise.all([
    db
      .select()
      .from(audienceCohorts)
      .where(eq(audienceCohorts.worldId, release.worldId))
      .orderBy(asc(audienceCohorts.slug)),
    db
      .select()
      .from(releaseCohortPerformance)
      .where(eq(releaseCohortPerformance.releaseId, releaseId)),
  ]);

  return cohorts.map((cohort) => ({
    cohort,
    performance: performances.find((row) => row.cohortId === cohort.id) ?? null,
  }));
}

export type ArtistAudienceView = {
  cohort: AudienceCohortRow;
  audience: ArtistAudienceRow | null;
};

/**
 * What each cohort in the world feels about one artist or group.
 *
 * Cohorts exist whether or not this artist has ever reached them, so a cohort
 * with no row is a real state: the audience is there, and they have not heard
 * of you.
 */
export async function getArtistAudience(
  db: Database,
  input: { worldId: string; ownerType: "ARTIST" | "GROUP"; ownerId: string },
): Promise<ArtistAudienceView[]> {
  const [cohorts, audience] = await Promise.all([
    db
      .select()
      .from(audienceCohorts)
      .where(eq(audienceCohorts.worldId, input.worldId))
      .orderBy(asc(audienceCohorts.slug)),
    db
      .select()
      .from(artistAudience)
      .where(
        and(
          eq(artistAudience.ownerType, input.ownerType),
          eq(artistAudience.ownerId, input.ownerId),
        ),
      ),
  ]);

  return cohorts.map((cohort) => ({
    cohort,
    audience: audience.find((row) => row.cohortId === cohort.id) ?? null,
  }));
}

/** Every simulated day for a release, in order. The trajectory, not the total. */
export async function getReceptionHistory(
  db: Database,
  releaseId: string,
): Promise<ReceptionTickRow[]> {
  return db
    .select()
    .from(receptionTicks)
    .where(eq(receptionTicks.releaseId, releaseId))
    .orderBy(asc(receptionTicks.dayIndex));
}

export type CareerReceptionView = {
  releases: { release: ReleaseRow; title: string | null; performance: ReleasePerformanceRow | null }[];
  pressure: CareerMetricPressureRow | null;
};

/**
 * A career's reception across everything it has put out.
 *
 * `pressure` is the fractional accrual behind the integer Fame / Respect / Heat
 * on the career — the audit trail for every point the player can see.
 */
export async function getCareerReception(
  db: Database,
  careerId: string,
): Promise<CareerReceptionView> {
  const [releaseRows, performances, pressureRows] = await Promise.all([
    db
      .select()
      .from(releases)
      .where(and(eq(releases.careerId, careerId), eq(releases.status, "RELEASED")))
      .orderBy(desc(releases.releasedGameTime)),
    db.select().from(releasePerformance).where(eq(releasePerformance.careerId, careerId)),
    db
      .select()
      .from(careerMetricPressure)
      .where(eq(careerMetricPressure.careerId, careerId))
      .limit(1),
  ]);

  const trackIds = releaseRows.map((release) => release.trackId).filter((id): id is string => !!id);
  const trackRows = trackIds.length
    ? await db.select().from(tracks).where(eq(tracks.careerId, careerId))
    : [];

  return {
    releases: releaseRows.map((release) => ({
      release,
      title: trackRows.find((row) => row.id === release.trackId)?.title ?? null,
      performance: performances.find((row) => row.releaseId === release.id) ?? null,
    })),
    pressure: pressureRows[0] ?? null,
  };
}
