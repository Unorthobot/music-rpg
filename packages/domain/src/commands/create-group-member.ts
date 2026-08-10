import { and, eq } from "drizzle-orm";
import {
  artists,
  groupMemberships,
  type ArtistRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  err,
  ids,
  ok,
  uniqueSlug,
  type GroupRole,
  type Result,
} from "@music-rpg/shared";
import {
  inferMemberIdentity,
  isMemberChoiceValid,
  memberPersonalities,
  memberTendencies,
} from "@music-rpg/simulation";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { isArtistSlugTaken, loadCareerGroup, loadOwnedCareer } from "../internal/career";
import {
  replaceArtistTraits,
  writeArtistPsychology,
  writeArtistSkills,
} from "../internal/artist-writes";
import { writeSoundProfile } from "../internal/discovery";
import { refreshGroupLineup, type LineupResult } from "./group-lineup";

export type CreateGroupMemberInput = {
  careerId: string;
  userId: string;
  stageName: string;
  role: GroupRole;
  tendencyId: string;
  personalityId: string;
  visualId?: string | null;
  origin?: string | null;
};

/**
 * CreateGroupMember — writing a bandmate instead of recruiting one.
 *
 * The spec's group flow is "choose **or create** initial members", and creating
 * is the half that makes a group feel like yours. Four choices — role, creative
 * tendency, personality, look — are enough to picture somebody; skills,
 * psychology, Sound DNA, archetype and traits are derived deterministically
 * from them by the same engine that handles the player's own identity.
 *
 * Authored members are `CORE_NPC`, not `PLAYER`: they are people the player
 * wrote, not people the player is. `authoredByCareerId` keeps them
 * distinguishable from seeded world NPCs forever, which later systems (poaching,
 * solo careers, break-ups) will care about.
 */
export async function createGroupMember(
  ctx: CommandContext,
  input: CreateGroupMemberInput,
): Promise<Result<LineupResult & { artist: ArtistRow }, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const group = await loadCareerGroup(ctx.db, career);
  if (!group) return err(DomainErrors.controlledEntityMissing());
  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState("This line-up is already locked in."));
  }

  if (!isMemberChoiceValid({
    role: input.role,
    tendencyId: input.tendencyId,
    personalityId: input.personalityId,
  })) {
    return err(DomainErrors.invalidInput("Pick a role, a tendency and a personality."));
  }

  const verdict = await ctx.moderation.check(input.stageName, "STAGE_NAME");
  if (!verdict.allowed) {
    return err(DomainErrors.artistNameUnavailable(verdict.reason, { field: "stageName" }));
  }
  const stageName = verdict.value;

  const activeMembers = await ctx.db
    .select({ id: groupMemberships.id })
    .from(groupMemberships)
    .where(and(eq(groupMemberships.groupId, group.id), eq(groupMemberships.status, "ACTIVE")));

  if (activeMembers.length >= 4) {
    return err(DomainErrors.lineupInvalid("A founding line-up tops out at 4 members."));
  }

  const identity = inferMemberIdentity({
    role: input.role,
    tendencyId: input.tendencyId,
    personalityId: input.personalityId,
    visualId: input.visualId ?? null,
  });

  const tendency = memberTendencies.find((entry) => entry.id === input.tendencyId);
  const personality = memberPersonalities.find((entry) => entry.id === input.personalityId);

  const slug = await uniqueSlug(
    stageName,
    (candidate) => isArtistSlugTaken(ctx.db, career.worldId, candidate),
    "unnamed-artist",
  );

  const now = contextNow(ctx);

  const created = await ctx.db.transaction(async (tx) => {
    const insertedRows = await tx
      .insert(artists)
      .values({
        id: ids.artist(),
        worldId: career.worldId,
        stageName,
        slug,
        origin: input.origin?.trim() || null,
        biography: [tendency?.detail, personality?.detail].filter(Boolean).join(" "),
        // Authored by a player, so not a world NPC and not the player either.
        artistType: "CORE_NPC",
        status: "ACTIVE",
        archetype: identity.archetype,
        creativePhilosophy: tendency ? `${tendency.label}. ${tendency.detail}` : null,
        visualIdentity: identity.visual ?? undefined,
        currentGroupId: group.id,
        preferredRole: input.role,
        authoredByCareerId: career.id,
        isPublic: false,
      })
      .returning();

    const artist = insertedRows[0];
    if (!artist) return null;

    await writeArtistSkills(tx, artist.id, identity.skills, now, "insert");
    await writeArtistPsychology(tx, artist.id, identity.psychology, now, "insert");
    await replaceArtistTraits(
      tx,
      artist.id,
      identity.traits.map((key) => ({ key, strength: 58 })),
      "AUTHORED",
      now,
    );

    await writeSoundProfile(tx, {
      ownerType: "ARTIST",
      ownerId: artist.id,
      values: identity.sound,
      summary: identity.soundSummary,
      derivedFrom: identity.provenance,
      now,
    });

    await tx.insert(groupMemberships).values({
      id: ids.membership(),
      groupId: group.id,
      artistId: artist.id,
      role: input.role,
      influence: 50,
      satisfaction: 70,
      commitment: 70,
      soloAmbition: 40,
      isFounder: false,
      status: "ACTIVE",
      joinedAt: now,
    });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.ArtistCreated,
      actorType: "USER",
      actorId: input.userId,
      targetType: "ARTIST",
      targetId: artist.id,
      visibility: "PRIVATE",
      importance: 45,
      idempotencyKey: `artist:${artist.id}:created`,
      payload: { stageName, slug, role: input.role, authored: true, playerArtist: false },
    });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.GroupMemberCreated,
      actorType: "USER",
      actorId: input.userId,
      targetType: "ARTIST",
      targetId: artist.id,
      visibility: "CREW",
      importance: 50,
      idempotencyKey: `group:${group.id}:member:${artist.id}:created`,
      payload: {
        stageName,
        role: input.role,
        tendency: input.tendencyId,
        personality: input.personalityId,
        archetype: identity.archetype,
      },
    });

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
      payload: { stageName, role: input.role, isFounder: false, authored: true },
    });

    const lineup = await refreshGroupLineup(tx, group.id, now);
    return { artist, lineup };
  });

  if (!created) return err(DomainErrors.invalidInput("We couldn't create that member."));

  await track(ctx, {
    name: "group_member_created",
    userId: input.userId,
    careerId: career.id,
    properties: {
      artistId: created.artist.id,
      role: input.role,
      tendency: input.tendencyId,
      personality: input.personalityId,
    },
  });

  return ok({ ...created.lineup, artist: created.artist });
}
