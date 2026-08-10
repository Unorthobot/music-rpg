import { and, eq } from "drizzle-orm";
import {
  artistTraits,
  artists,
  careers,
  groupMemberships,
  groups,
  soundProfiles,
  worlds,
  type Database,
} from "@music-rpg/database";
import { archetypeByKey, traitByKey, type ArchetypeDefinition } from "@music-rpg/simulation";
import type { SoundProfileValues } from "@music-rpg/shared";
import { soundProfileValues } from "../internal/discovery";

/**
 * Public identity, resolved through the world.
 *
 * Slugs are unique per world, never globally, so every public lookup takes a
 * world slug and resolves inside it. A one-world deployment can hide the
 * segment in its routing, but nothing below ever resolves an artist without
 * knowing which world it is in — that ambiguity is a bug waiting for the second
 * world, and links outlive schemas.
 *
 * Profiles stay closed until `is_public` flips; the owner sees a preview.
 * Nothing here exposes the account behind an artist, and no hidden simulation
 * value leaves.
 */
export type PublicProfileAccess = "PUBLIC" | "OWNER_PREVIEW" | "HIDDEN";

export type PublicArtistProfile = {
  kind: "ARTIST";
  access: PublicProfileAccess;
  stageName: string;
  slug: string;
  worldSlug: string;
  worldName: string;
  origin: string | null;
  biography: string | null;
  creativePhilosophy: string | null;
  archetype: ArchetypeDefinition | null;
  soundSummary: string | null;
  sound: SoundProfileValues | null;
  traits: { key: string; name: string; description: string }[];
  group: { name: string; slug: string } | null;
  fame: number;
  respect: number;
};

export type PublicGroupProfile = {
  kind: "GROUP";
  access: PublicProfileAccess;
  name: string;
  slug: string;
  worldSlug: string;
  worldName: string;
  biography: string | null;
  creativePhilosophy: string | null;
  archetype: ArchetypeDefinition | null;
  soundSummary: string | null;
  sound: SoundProfileValues | null;
  members: { stageName: string; slug: string; role: string; isFounder: boolean }[];
  fame: number;
  respect: number;
};

async function loadWorldBySlug(db: Database, worldSlug: string) {
  const rows = await db.select().from(worlds).where(eq(worlds.slug, worldSlug)).limit(1);
  return rows[0];
}

async function resolveAccess(
  db: Database,
  entityType: "ARTIST" | "GROUP",
  entityId: string,
  isPublic: boolean,
  viewerUserId: string | null,
): Promise<PublicProfileAccess> {
  if (isPublic) return "PUBLIC";
  if (!viewerUserId) return "HIDDEN";

  // Owner preview covers both the entity a career controls and, for group
  // careers, the player's own artist inside it.
  const owned = await db
    .select({ id: careers.id })
    .from(careers)
    .where(eq(careers.userId, viewerUserId));

  const isOwner = owned.length
    ? (
        await db
          .select({ id: careers.id })
          .from(careers)
          .where(
            and(
              eq(careers.userId, viewerUserId),
              entityType === "ARTIST"
                ? eq(careers.playerArtistId, entityId)
                : eq(careers.controlledEntityId, entityId),
            ),
          )
          .limit(1)
      ).length > 0
    : false;

  if (isOwner) return "OWNER_PREVIEW";

  // An authored bandmate belongs to the career that wrote them.
  if (entityType === "ARTIST") {
    const authored = await db
      .select({ id: artists.id })
      .from(artists)
      .innerJoin(careers, eq(careers.id, artists.authoredByCareerId))
      .where(and(eq(artists.id, entityId), eq(careers.userId, viewerUserId)))
      .limit(1);
    if (authored[0]) return "OWNER_PREVIEW";
  }

  return "HIDDEN";
}

export async function getPublicArtistProfile(
  db: Database,
  worldSlug: string,
  slug: string,
  viewerUserId: string | null,
): Promise<PublicArtistProfile | null> {
  const world = await loadWorldBySlug(db, worldSlug);
  if (!world) return null;

  const rows = await db
    .select()
    .from(artists)
    .where(and(eq(artists.worldId, world.id), eq(artists.slug, slug)))
    .limit(1);

  const artist = rows[0];
  if (!artist) return null;

  const access = await resolveAccess(db, "ARTIST", artist.id, artist.isPublic, viewerUserId);

  const [profileRows, traitRows, groupRows] = await Promise.all([
    db.select().from(soundProfiles).where(eq(soundProfiles.ownerId, artist.id)).limit(1),
    db.select().from(artistTraits).where(eq(artistTraits.artistId, artist.id)),
    artist.currentGroupId
      ? db.select().from(groups).where(eq(groups.id, artist.currentGroupId)).limit(1)
      : Promise.resolve([]),
  ]);

  const profile = profileRows.find((row) => row.ownerType === "ARTIST");
  const group = groupRows[0];

  return {
    kind: "ARTIST",
    access,
    stageName: artist.stageName,
    slug: artist.slug,
    worldSlug: world.slug,
    worldName: world.name,
    origin: artist.origin,
    biography: artist.biography,
    creativePhilosophy: artist.creativePhilosophy,
    archetype: artist.archetype ? (archetypeByKey[artist.archetype] ?? null) : null,
    soundSummary: profile?.summary ?? null,
    sound: profile ? soundProfileValues(profile) : null,
    traits: traitRows.map((row) => ({
      key: row.traitKey,
      name: traitByKey[row.traitKey]?.name ?? row.traitKey,
      description: traitByKey[row.traitKey]?.description ?? "",
    })),
    group: group ? { name: group.name, slug: group.slug } : null,
    fame: artist.fame,
    respect: artist.respect,
  };
}

export async function getPublicGroupProfile(
  db: Database,
  worldSlug: string,
  slug: string,
  viewerUserId: string | null,
): Promise<PublicGroupProfile | null> {
  const world = await loadWorldBySlug(db, worldSlug);
  if (!world) return null;

  const rows = await db
    .select()
    .from(groups)
    .where(and(eq(groups.worldId, world.id), eq(groups.slug, slug)))
    .limit(1);

  const group = rows[0];
  if (!group) return null;

  const access = await resolveAccess(db, "GROUP", group.id, group.isPublic, viewerUserId);

  const [profileRows, memberRows] = await Promise.all([
    db.select().from(soundProfiles).where(eq(soundProfiles.ownerId, group.id)).limit(1),
    db
      .select({ artist: artists, membership: groupMemberships })
      .from(groupMemberships)
      .innerJoin(artists, eq(artists.id, groupMemberships.artistId))
      .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.status, "ACTIVE")))
      .orderBy(groupMemberships.joinedAt),
  ]);

  const profile = profileRows.find((row) => row.ownerType === "GROUP");

  return {
    kind: "GROUP",
    access,
    name: group.name,
    slug: group.slug,
    worldSlug: world.slug,
    worldName: world.name,
    biography: group.biography,
    creativePhilosophy: group.creativePhilosophy,
    archetype: group.archetype ? (archetypeByKey[group.archetype] ?? null) : null,
    soundSummary: profile?.summary ?? null,
    sound: profile ? soundProfileValues(profile) : null,
    members: memberRows.map((row) => ({
      stageName: row.artist.stageName,
      slug: row.artist.slug,
      role: row.membership.role,
      isFounder: row.membership.isFounder,
    })),
    fame: group.fame,
    respect: group.respect,
  };
}

/**
 * Legacy world-less links.
 *
 * Returns every world a slug exists in so a route can redirect when there is
 * exactly one and refuse when there is more than one. It never guesses — that
 * is the whole reason this function exists.
 */
export async function findWorldsForSlug(
  db: Database,
  kind: "ARTIST" | "GROUP",
  slug: string,
): Promise<{ worldSlug: string; worldName: string }[]> {
  const rows =
    kind === "ARTIST"
      ? await db
          .select({ worldSlug: worlds.slug, worldName: worlds.name })
          .from(artists)
          .innerJoin(worlds, eq(worlds.id, artists.worldId))
          .where(eq(artists.slug, slug))
      : await db
          .select({ worldSlug: worlds.slug, worldName: worlds.name })
          .from(groups)
          .innerJoin(worlds, eq(worlds.id, groups.worldId))
          .where(eq(groups.slug, slug));

  return rows;
}
