import { and, eq } from "drizzle-orm";
import {
  artists,
  careers,
  groups,
  worlds,
  type ArtistRow,
  type CareerRow,
  type DbClient,
  type GroupRow,
  type WorldRow,
} from "@music-rpg/database";
import { err, ok, type Result } from "@music-rpg/shared";
import { DomainErrors, type DomainError } from "../errors";

/**
 * Shared loaders used by every command.
 *
 * Ownership is checked here, once, so no command can accidentally act on
 * another player's career.
 */
export async function loadOwnedCareer(
  db: DbClient,
  careerId: string,
  userId: string,
): Promise<Result<CareerRow, DomainError>> {
  const rows = await db.select().from(careers).where(eq(careers.id, careerId)).limit(1);
  const career = rows[0];

  if (!career) return err(DomainErrors.careerNotFound());
  if (career.userId !== userId) return err(DomainErrors.unauthorizedCareerAccess());

  return ok(career);
}

export async function loadWorld(
  db: DbClient,
  worldId: string,
): Promise<Result<WorldRow, DomainError>> {
  const rows = await db.select().from(worlds).where(eq(worlds.id, worldId)).limit(1);
  const world = rows[0];
  if (!world) return err(DomainErrors.worldNotFound());
  return ok(world);
}

/** Resolves the world a new career should start in. */
export async function resolveDefaultWorld(db: DbClient): Promise<WorldRow | undefined> {
  const rows = await db
    .select()
    .from(worlds)
    .where(eq(worlds.status, "ACTIVE"))
    .orderBy(worlds.createdAt)
    .limit(1);
  return rows[0];
}

export async function loadCareerArtist(
  db: DbClient,
  career: CareerRow,
): Promise<ArtistRow | undefined> {
  if (career.controlledEntityType !== "ARTIST" || !career.controlledEntityId) return undefined;
  const rows = await db.select().from(artists).where(eq(artists.id, career.controlledEntityId)).limit(1);
  return rows[0];
}

export async function loadCareerGroup(
  db: DbClient,
  career: CareerRow,
): Promise<GroupRow | undefined> {
  if (career.controlledEntityType !== "GROUP" || !career.controlledEntityId) return undefined;
  const rows = await db.select().from(groups).where(eq(groups.id, career.controlledEntityId)).limit(1);
  return rows[0];
}

export async function isArtistSlugTaken(
  db: DbClient,
  worldId: string,
  slug: string,
  exceptArtistId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: artists.id })
    .from(artists)
    .where(and(eq(artists.worldId, worldId), eq(artists.slug, slug)))
    .limit(1);
  const found = rows[0];
  if (!found) return false;
  return found.id !== exceptArtistId;
}

export async function isGroupSlugTaken(
  db: DbClient,
  worldId: string,
  slug: string,
  exceptGroupId?: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.worldId, worldId), eq(groups.slug, slug)))
    .limit(1);
  const found = rows[0];
  if (!found) return false;
  return found.id !== exceptGroupId;
}
