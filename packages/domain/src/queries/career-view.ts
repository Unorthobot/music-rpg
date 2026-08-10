import { and, desc, eq, inArray } from "drizzle-orm";
import {
  artistPsychology,
  artistSkills,
  artistTraits,
  artists,
  careers,
  groupMemberships,
  groups,
  scenes,
  soundProfiles,
  worlds,
  type ArtistRow,
  type CareerRow,
  type Database,
  type GroupMembershipRow,
  type GroupRow,
  type SceneRow,
  type WorldRow,
} from "@music-rpg/database";
import {
  PSYCHOLOGY_KEYS,
  SKILL_KEYS,
  type ArchetypeKey,
  type PsychologyValues,
  type SkillValues,
  type SoundProfileValues,
  type TraitKey,
} from "@music-rpg/shared";
import { archetypeByKey, traitByKey, type ArchetypeDefinition } from "@music-rpg/simulation";
import { soundProfileValues } from "../internal/discovery";

/**
 * Read models.
 *
 * Every player-facing screen reads real persisted state through these
 * functions — no screen invents a number, and nothing here writes.
 */

export type TraitView = { key: TraitKey; name: string; description: string; strength: number };

export type MemberView = {
  artist: ArtistRow;
  membership: GroupMembershipRow;
  sound: SoundProfileValues | null;
  psychology: PsychologyValues | null;
};

export type ControlledEntityView =
  | {
      type: "ARTIST";
      artist: ArtistRow;
      skills: SkillValues;
      psychology: PsychologyValues;
      traits: TraitView[];
      sound: SoundProfileValues | null;
      soundSummary: string | null;
    }
  | {
      type: "GROUP";
      group: GroupRow;
      members: MemberView[];
      sound: SoundProfileValues | null;
      soundSummary: string | null;
    };

export type ArtistDetail = Extract<ControlledEntityView, { type: "ARTIST" }>;

export type CareerView = {
  career: CareerRow;
  world: WorldRow;
  scene: SceneRow | null;
  entity: ControlledEntityView | null;
  /**
   * The player's own musician. For a solo career this is the controlled entity;
   * for a group career it is their founding member inside the group. Screens
   * that need to say "you" read this, never the members list.
   */
  playerArtist: ArtistDetail | null;
  archetype: ArchetypeDefinition | null;
  /** Stage name or group name — what the player calls themselves. */
  displayName: string;
};

function emptySkills(): SkillValues {
  return Object.fromEntries(SKILL_KEYS.map((key) => [key, 0])) as SkillValues;
}

function emptyPsychology(): PsychologyValues {
  return Object.fromEntries(PSYCHOLOGY_KEYS.map((key) => [key, 50])) as PsychologyValues;
}

async function loadArtistDetail(
  db: Database,
  artist: ArtistRow,
): Promise<Extract<ControlledEntityView, { type: "ARTIST" }>> {
  const [skillRows, psychologyRows, traitRows, profileRows] = await Promise.all([
    db.select().from(artistSkills).where(eq(artistSkills.artistId, artist.id)).limit(1),
    db.select().from(artistPsychology).where(eq(artistPsychology.artistId, artist.id)).limit(1),
    db.select().from(artistTraits).where(eq(artistTraits.artistId, artist.id)),
    db.select().from(soundProfiles).where(eq(soundProfiles.ownerId, artist.id)).limit(1),
  ]);

  const skillRow = skillRows[0];
  const psychologyRow = psychologyRows[0];
  const profile = profileRows.find((row) => row.ownerType === "ARTIST");

  const skills = skillRow
    ? ({
        lyricism: skillRow.lyricism,
        flow: skillRow.flow,
        melody: skillRow.melody,
        storytelling: skillRow.storytelling,
        performance: skillRow.performance,
        production: skillRow.production,
        experimentation: skillRow.experimentation,
        versatility: skillRow.versatility,
        battleIQ: skillRow.battleIq,
      } satisfies SkillValues)
    : emptySkills();

  const psychology = psychologyRow
    ? ({
        confidence: psychologyRow.confidence,
        discipline: psychologyRow.discipline,
        ambition: psychologyRow.ambition,
        resilience: psychologyRow.resilience,
        ego: psychologyRow.ego,
        patience: psychologyRow.patience,
        adaptability: psychologyRow.adaptability,
        riskTolerance: psychologyRow.riskTolerance,
        competitiveness: psychologyRow.competitiveness,
      } satisfies PsychologyValues)
    : emptyPsychology();

  const traits: TraitView[] = traitRows
    .map((row) => {
      const definition = traitByKey[row.traitKey];
      return {
        key: row.traitKey,
        name: definition?.name ?? row.traitKey,
        description: definition?.description ?? "",
        strength: row.strength,
      };
    })
    .sort((a, b) => b.strength - a.strength || a.key.localeCompare(b.key));

  return {
    type: "ARTIST",
    artist,
    skills,
    psychology,
    traits,
    sound: profile ? soundProfileValues(profile) : null,
    soundSummary: profile?.summary ?? null,
  };
}

async function loadGroupDetail(
  db: Database,
  group: GroupRow,
): Promise<Extract<ControlledEntityView, { type: "GROUP" }>> {
  const memberRows = await db
    .select({ artist: artists, membership: groupMemberships })
    .from(groupMemberships)
    .innerJoin(artists, eq(artists.id, groupMemberships.artistId))
    .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.status, "ACTIVE")))
    .orderBy(groupMemberships.joinedAt);

  const memberIds = memberRows.map((row) => row.artist.id);
  const ownerIds = [group.id, ...memberIds];

  const [profiles, psychologies] = await Promise.all([
    db.select().from(soundProfiles).where(inArray(soundProfiles.ownerId, ownerIds)),
    memberIds.length
      ? db.select().from(artistPsychology).where(inArray(artistPsychology.artistId, memberIds))
      : Promise.resolve([]),
  ]);

  const groupProfile = profiles.find((row) => row.ownerType === "GROUP" && row.ownerId === group.id);

  const members: MemberView[] = memberRows.map((row) => {
    const profile = profiles.find(
      (candidate) => candidate.ownerType === "ARTIST" && candidate.ownerId === row.artist.id,
    );
    const psychologyRow = psychologies.find((candidate) => candidate.artistId === row.artist.id);

    return {
      artist: row.artist,
      membership: row.membership,
      sound: profile ? soundProfileValues(profile) : null,
      psychology: psychologyRow
        ? {
            confidence: psychologyRow.confidence,
            discipline: psychologyRow.discipline,
            ambition: psychologyRow.ambition,
            resilience: psychologyRow.resilience,
            ego: psychologyRow.ego,
            patience: psychologyRow.patience,
            adaptability: psychologyRow.adaptability,
            riskTolerance: psychologyRow.riskTolerance,
            competitiveness: psychologyRow.competitiveness,
          }
        : null,
    };
  });

  return {
    type: "GROUP",
    group,
    members,
    sound: groupProfile ? soundProfileValues(groupProfile) : null,
    soundSummary: groupProfile?.summary ?? null,
  };
}

/** The career a player is currently living in. One per user per world today. */
export async function getActiveCareer(db: Database, userId: string): Promise<CareerRow | null> {
  const rows = await db
    .select()
    .from(careers)
    .where(eq(careers.userId, userId))
    .orderBy(desc(careers.lastActiveAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCareerView(db: Database, careerId: string): Promise<CareerView | null> {
  const careerRows = await db.select().from(careers).where(eq(careers.id, careerId)).limit(1);
  const career = careerRows[0];
  if (!career) return null;

  const [worldRows, sceneRows] = await Promise.all([
    db.select().from(worlds).where(eq(worlds.id, career.worldId)).limit(1),
    career.primarySceneId
      ? db.select().from(scenes).where(eq(scenes.id, career.primarySceneId)).limit(1)
      : Promise.resolve([]),
  ]);

  const world = worldRows[0];
  if (!world) return null;

  let entity: ControlledEntityView | null = null;

  if (career.controlledEntityType === "ARTIST" && career.controlledEntityId) {
    const rows = await db.select().from(artists).where(eq(artists.id, career.controlledEntityId)).limit(1);
    const artist = rows[0];
    if (artist) entity = await loadArtistDetail(db, artist);
  } else if (career.controlledEntityType === "GROUP" && career.controlledEntityId) {
    const rows = await db.select().from(groups).where(eq(groups.id, career.controlledEntityId)).limit(1);
    const group = rows[0];
    if (group) entity = await loadGroupDetail(db, group);
  }

  const archetypeKey: ArchetypeKey | null =
    entity?.type === "ARTIST" ? entity.artist.archetype : (entity?.group.archetype ?? null);

  let playerArtist: ArtistDetail | null = null;
  if (career.playerArtistId) {
    if (entity?.type === "ARTIST" && entity.artist.id === career.playerArtistId) {
      // Solo: the controlled entity and the player's artist are the same row.
      playerArtist = entity;
    } else {
      const rows = await db.select().from(artists).where(eq(artists.id, career.playerArtistId)).limit(1);
      const artist = rows[0];
      if (artist) playerArtist = await loadArtistDetail(db, artist);
    }
  }

  return {
    career,
    world,
    scene: sceneRows[0] ?? null,
    entity,
    playerArtist,
    archetype: archetypeKey ? (archetypeByKey[archetypeKey] ?? null) : null,
    displayName:
      entity?.type === "ARTIST"
        ? entity.artist.stageName
        : (entity?.group.name ?? career.name),
  };
}

export async function getCareerViewForUser(
  db: Database,
  userId: string,
): Promise<CareerView | null> {
  const career = await getActiveCareer(db, userId);
  if (!career) return null;
  return getCareerView(db, career.id);
}
