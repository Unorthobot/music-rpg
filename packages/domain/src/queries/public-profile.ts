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
import { traitByKey, type ArchetypeDefinition } from "@music-rpg/simulation";
import { archetypeByKey } from "@music-rpg/simulation";
import type { SoundProfileValues } from "@music-rpg/shared";
import { soundProfileValues } from "../internal/discovery";

/**
 * Public identity.
 *
 * Slug routes exist from M1, but profiles stay closed until `is_public` flips.
 * The owner can always see their own; everyone else gets the "not public yet"
 * state. Nothing here exposes the real account behind an artist — no email, no
 * username, no user id — and the hidden simulation values never leave.
 */
export type PublicProfileAccess = "PUBLIC" | "OWNER_PREVIEW" | "HIDDEN";

export type PublicArtistProfile = {
  kind: "ARTIST";
  access: PublicProfileAccess;
  stageName: string;
  slug: string;
  origin: string | null;
  biography: string | null;
  creativePhilosophy: string | null;
  archetype: ArchetypeDefinition | null;
  soundSummary: string | null;
  sound: SoundProfileValues | null;
  traits: { key: string; name: string; description: string }[];
  worldName: string;
  fame: number;
  respect: number;
};

export type PublicGroupProfile = {
  kind: "GROUP";
  access: PublicProfileAccess;
  name: string;
  slug: string;
  biography: string | null;
  creativePhilosophy: string | null;
  archetype: ArchetypeDefinition | null;
  soundSummary: string | null;
  sound: SoundProfileValues | null;
  members: { stageName: string; slug: string; role: string }[];
  worldName: string;
  fame: number;
  respect: number;
};

async function resolveAccess(
  db: Database,
  entityType: "ARTIST" | "GROUP",
  entityId: string,
  isPublic: boolean,
  viewerUserId: string | null,
): Promise<PublicProfileAccess> {
  if (isPublic) return "PUBLIC";
  if (!viewerUserId) return "HIDDEN";

  const owner = await db
    .select({ id: careers.id })
    .from(careers)
    .where(
      and(
        eq(careers.userId, viewerUserId),
        eq(careers.controlledEntityType, entityType),
        eq(careers.controlledEntityId, entityId),
      ),
    )
    .limit(1);

  return owner[0] ? "OWNER_PREVIEW" : "HIDDEN";
}

export async function getPublicArtistProfile(
  db: Database,
  slug: string,
  viewerUserId: string | null,
): Promise<PublicArtistProfile | null> {
  const rows = await db.select().from(artists).where(eq(artists.slug, slug)).limit(1);
  const artist = rows[0];
  if (!artist) return null;

  const access = await resolveAccess(db, "ARTIST", artist.id, artist.isPublic, viewerUserId);

  const [profileRows, traitRows, worldRows] = await Promise.all([
    db.select().from(soundProfiles).where(eq(soundProfiles.ownerId, artist.id)).limit(1),
    db.select().from(artistTraits).where(eq(artistTraits.artistId, artist.id)),
    db.select().from(worlds).where(eq(worlds.id, artist.worldId)).limit(1),
  ]);

  const profile = profileRows.find((row) => row.ownerType === "ARTIST");

  return {
    kind: "ARTIST",
    access,
    stageName: artist.stageName,
    slug: artist.slug,
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
    worldName: worldRows[0]?.name ?? "",
    fame: artist.fame,
    respect: artist.respect,
  };
}

export async function getPublicGroupProfile(
  db: Database,
  slug: string,
  viewerUserId: string | null,
): Promise<PublicGroupProfile | null> {
  const rows = await db.select().from(groups).where(eq(groups.slug, slug)).limit(1);
  const group = rows[0];
  if (!group) return null;

  const access = await resolveAccess(db, "GROUP", group.id, group.isPublic, viewerUserId);

  const [profileRows, memberRows, worldRows] = await Promise.all([
    db.select().from(soundProfiles).where(eq(soundProfiles.ownerId, group.id)).limit(1),
    db
      .select({ artist: artists, membership: groupMemberships })
      .from(groupMemberships)
      .innerJoin(artists, eq(artists.id, groupMemberships.artistId))
      .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.status, "ACTIVE"))),
    db.select().from(worlds).where(eq(worlds.id, group.worldId)).limit(1),
  ]);

  const profile = profileRows.find((row) => row.ownerType === "GROUP");

  return {
    kind: "GROUP",
    access,
    name: group.name,
    slug: group.slug,
    biography: group.biography,
    creativePhilosophy: group.creativePhilosophy,
    archetype: group.archetype ? (archetypeByKey[group.archetype] ?? null) : null,
    soundSummary: profile?.summary ?? null,
    sound: profile ? soundProfileValues(profile) : null,
    members: memberRows.map((row) => ({
      stageName: row.artist.stageName,
      slug: row.artist.slug,
      role: row.membership.role,
    })),
    worldName: worldRows[0]?.name ?? "",
    fame: group.fame,
    respect: group.respect,
  };
}
