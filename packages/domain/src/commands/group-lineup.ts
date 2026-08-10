import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  artistPsychology,
  artists,
  careers,
  groupMemberships,
  groups,
  soundProfiles,
  type ArtistRow,
  type DbClient,
  type GroupMembershipRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  PSYCHOLOGY_KEYS,
  err,
  gameConfig,
  ids,
  ok,
  type GroupRole,
  type PsychologyValues,
  type Result,
} from "@music-rpg/shared";
import { computeChemistry, type ChemistryResult } from "@music-rpg/simulation";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadCareerGroup, loadOwnedCareer } from "../internal/career";
import { soundProfileValues } from "../internal/discovery";

export type LineupMember = {
  membership: GroupMembershipRow;
  artist: ArtistRow;
};

export type LineupResult = {
  members: LineupMember[];
  chemistry: ChemistryResult;
};

/** Recomputes chemistry from the current line-up and persists the score. */
async function refreshLineup(tx: DbClient, groupId: string, now: Date): Promise<LineupResult> {
  const rows = await tx
    .select({ membership: groupMemberships, artist: artists })
    .from(groupMemberships)
    .innerJoin(artists, eq(artists.id, groupMemberships.artistId))
    .where(and(eq(groupMemberships.groupId, groupId), eq(groupMemberships.status, "ACTIVE")))
    .orderBy(groupMemberships.joinedAt);

  const artistIds = rows.map((row) => row.artist.id);

  const profiles = artistIds.length
    ? await tx.select().from(soundProfiles).where(inArray(soundProfiles.ownerId, artistIds))
    : [];
  const psychologies = artistIds.length
    ? await tx.select().from(artistPsychology).where(inArray(artistPsychology.artistId, artistIds))
    : [];

  const chemistry = computeChemistry(
    rows.map((row) => {
      const profile = profiles.find(
        (candidate) => candidate.ownerId === row.artist.id && candidate.ownerType === "ARTIST",
      );
      const psychologyRow = psychologies.find((candidate) => candidate.artistId === row.artist.id);

      // Psychology keys map 1:1 onto the row's columns; a missing row means an
      // NPC that predates psychology seeding, so fall back to the neutral 50.
      const psychology = Object.fromEntries(
        PSYCHOLOGY_KEYS.map((key) => [
          key,
          psychologyRow ? (psychologyRow[key as keyof typeof psychologyRow] as number) : 50,
        ]),
      ) as PsychologyValues;

      return {
        sound: profile
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
            },
        psychology,
      };
    }),
  );

  await tx
    .update(groups)
    .set({ chemistry: chemistry.score, updatedAt: now })
    .where(eq(groups.id, groupId));

  return { members: rows, chemistry };
}

export type AddGroupMemberInput = {
  careerId: string;
  userId: string;
  artistId: string;
  role?: GroupRole;
};

/**
 * AddGroupMember.
 *
 * Members are ordinary Artists in the world — the same rows NPC simulation will
 * later drive — so joining a group is a relationship, not a copy. The
 * membership row carries the tension fields (influence, satisfaction,
 * commitment, solo ambition) that group simulation reads in a later milestone.
 */
export async function addGroupMember(
  ctx: CommandContext,
  input: AddGroupMemberInput,
): Promise<Result<LineupResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const group = await loadCareerGroup(ctx.db, career);
  if (!group) return err(DomainErrors.controlledEntityMissing());
  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState("This line-up is already locked in."));
  }

  const artistRows = await ctx.db.select().from(artists).where(eq(artists.id, input.artistId)).limit(1);
  const artist = artistRows[0];

  if (!artist || artist.worldId !== career.worldId) {
    return err(DomainErrors.memberUnavailable());
  }
  if (artist.currentGroupId && artist.currentGroupId !== group.id) {
    return err(DomainErrors.memberUnavailable(`${artist.stageName} is already in a group.`));
  }

  const currentRows = await ctx.db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.status, "ACTIVE")));

  if (currentRows.length >= gameConfig.group.maxFoundingMembers) {
    return err(
      DomainErrors.lineupInvalid(
        `A founding line-up tops out at ${gameConfig.group.maxFoundingMembers} members.`,
      ),
    );
  }

  const now = contextNow(ctx);
  const isFounder = currentRows.length === 0;

  const lineup = await ctx.db.transaction(async (tx) => {
    await tx
      .insert(groupMemberships)
      .values({
        id: ids.membership(),
        groupId: group.id,
        artistId: artist.id,
        role: input.role ?? artist.preferredRole ?? "MULTI_ROLE",
        influence: isFounder ? gameConfig.group.founderInfluence : 50,
        satisfaction: gameConfig.group.founderSatisfaction,
        commitment: gameConfig.group.founderCommitment,
        soloAmbition: gameConfig.group.founderSoloAmbition,
        isFounder,
        status: "ACTIVE",
        joinedAt: now,
      })
      // Double-click on a candidate card must not add them twice.
      .onConflictDoNothing({ target: [groupMemberships.groupId, groupMemberships.artistId] });

    await tx
      .update(artists)
      .set({ currentGroupId: group.id, updatedAt: now })
      .where(eq(artists.id, artist.id));

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.GroupMemberAdded,
      actorType: "GROUP",
      actorId: group.id,
      targetType: "ARTIST",
      targetId: artist.id,
      visibility: "CREW",
      importance: 55,
      idempotencyKey: `group:${group.id}:member:${artist.id}:added`,
      payload: {
        stageName: artist.stageName,
        role: input.role ?? artist.preferredRole ?? "MULTI_ROLE",
        isFounder,
      },
    });

    return refreshLineup(tx, group.id, now);
  });

  return ok(lineup);
}

export async function removeGroupMember(
  ctx: CommandContext,
  input: { careerId: string; userId: string; artistId: string },
): Promise<Result<LineupResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const group = await loadCareerGroup(ctx.db, career);
  if (!group) return err(DomainErrors.controlledEntityMissing());
  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState("This line-up is already locked in."));
  }

  const now = contextNow(ctx);

  const lineup = await ctx.db.transaction(async (tx) => {
    await tx
      .delete(groupMemberships)
      .where(
        and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.artistId, input.artistId)),
      );

    await tx
      .update(artists)
      .set({ currentGroupId: null, updatedAt: now })
      .where(eq(artists.id, input.artistId));

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.GroupMemberRemoved,
      actorType: "GROUP",
      actorId: group.id,
      targetType: "ARTIST",
      targetId: input.artistId,
      visibility: "CREW",
      importance: 30,
      payload: { during: "ONBOARDING" },
    });

    return refreshLineup(tx, group.id, now);
  });

  return ok(lineup);
}

/** Locks the founding line-up in and moves the career to the reveal. */
export async function completeGroupLineup(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<LineupResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const group = await loadCareerGroup(ctx.db, career);
  if (!group) return err(DomainErrors.controlledEntityMissing());

  const now = contextNow(ctx);

  const lineup = await ctx.db.transaction(async (tx) => {
    const result = await refreshLineup(tx, group.id, now);
    if (result.members.length < gameConfig.group.minFoundingMembers) return null;

    await tx
      .update(careers)
      .set({ onboardingState: "REVEAL", lastActiveAt: now, updatedAt: now })
      .where(eq(careers.id, career.id));

    return result;
  });

  if (!lineup) {
    return err(
      DomainErrors.lineupInvalid(
        `Pick at least ${gameConfig.group.minFoundingMembers} member to move forward.`,
      ),
    );
  }

  await track(ctx, {
    name: "group_created",
    userId: input.userId,
    careerId: career.id,
    properties: { groupId: group.id, members: lineup.members.length, chemistry: lineup.chemistry.score },
  });

  return ok(lineup);
}

/** Candidates available to join: world NPCs in this world who are unattached. */
export async function listCandidateMembers(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<ArtistRow[], DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const group = await loadCareerGroup(ctx.db, career);

  const rows = await ctx.db
    .select()
    .from(artists)
    .where(
      and(
        eq(artists.worldId, career.worldId),
        inArray(artists.artistType, ["WORLD_NPC", "CORE_NPC", "PROCEDURAL"]),
        eq(artists.status, "ACTIVE"),
        // Unavailable candidates are never offered.
        group
          ? or(isNull(artists.currentGroupId), eq(artists.currentGroupId, group.id))
          : isNull(artists.currentGroupId),
      ),
    )
    .orderBy(artists.stageName);

  return ok(rows);
}
