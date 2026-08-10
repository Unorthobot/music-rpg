import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  battles,
  careerAudience,
  tracks,
  type CareerRow,
  type Database,
} from "@music-rpg/database";

/**
 * The numbers Home reports.
 *
 * Every one of these is read from a table. They are all zero today because the
 * systems that write them do not exist yet — which is exactly the point: a zero
 * here means the simulation says zero, not that a template says zero. When
 * audience simulation, the Studio and battles arrive, they become the writers
 * and this query is unchanged.
 */
export type CareerCounters = {
  fans: number;
  monthlyListeners: number;
  reach: number;
  catalogue: number;
  releases: number;
  battles: number;
};

async function countRows(
  db: Database,
  query: Promise<{ value: number }[]>,
): Promise<number> {
  const rows = await query;
  return rows[0]?.value ?? 0;
}

export async function getCareerCounters(
  db: Database,
  career: Pick<CareerRow, "id">,
): Promise<CareerCounters> {
  const [audienceRows, catalogue, releases, battleCount] = await Promise.all([
    db.select().from(careerAudience).where(eq(careerAudience.careerId, career.id)).limit(1),
    // Catalogue is everything that still exists as work; a scrapped idea is
    // not in your catalogue.
    countRows(
      db,
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(tracks)
        .where(and(eq(tracks.careerId, career.id), ne(tracks.status, "SCRAPPED"))),
    ),
    // Releases are a later milestone; a track is released when it has a
    // release date, not when it is finished.
    countRows(
      db,
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(tracks)
        .where(and(eq(tracks.careerId, career.id), isNotNull(tracks.releasedAt))),
    ),
    countRows(
      db,
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(battles)
        .where(eq(battles.careerId, career.id)),
    ),
  ]);

  const audience = audienceRows[0];

  return {
    // A career created before the audience projection existed reads as zero
    // rather than throwing; the migration backfills the row.
    fans: audience?.fans ?? 0,
    monthlyListeners: audience?.monthlyListeners ?? 0,
    reach: audience?.reach ?? 0,
    catalogue,
    releases,
    battles: battleCount,
  };
}
