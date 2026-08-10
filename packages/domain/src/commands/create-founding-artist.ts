import { and, eq } from "drizzle-orm";
import {
  artistPsychology,
  artistSkills,
  artists,
  careers,
  groupMemberships,
  type ArtistRow,
  type CareerRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, gameConfig, ids, ok, uniqueSlug, type GroupRole, type Result } from "@music-rpg/shared";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { isArtistSlugTaken, loadCareerGroup, loadOwnedCareer } from "../internal/career";

export type CreateFoundingArtistInput = {
  careerId: string;
  userId: string;
  stageName: string;
  origin?: string | null;
  role?: GroupRole;
};

export type CreateFoundingArtistResult = {
  artist: ArtistRow;
  career: CareerRow;
  created: boolean;
};

/**
 * CreateFoundingArtist — the player's own member of their group.
 *
 * A group career controls the Group, but the player still *is* somebody: this
 * command creates that person as a `PLAYER` artist, attaches them to the career
 * as `playerArtistId`, and seats them in the group as a founding member.
 *
 * That separation is what makes later systems sane. When the group splits, a
 * member is poached, individual fame diverges or a solo offer arrives, the
 * player already has a persistent musician of their own — the game never has to
 * ask which NPC they would like to become.
 *
 * Solo careers get the same pointer set at artist creation, so
 * `playerArtistId` is always present on a career that has an identity.
 */
export async function createFoundingArtist(
  ctx: CommandContext,
  input: CreateFoundingArtistInput,
): Promise<Result<CreateFoundingArtistResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (career.careerType !== "GROUP") {
    return err(DomainErrors.invalidCareerState("Only group careers have a founding member."));
  }
  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState("This career has already started."));
  }

  const group = await loadCareerGroup(ctx.db, career);
  if (!group) return err(DomainErrors.controlledEntityMissing());

  const verdict = await ctx.moderation.check(input.stageName, "STAGE_NAME");
  if (!verdict.allowed) {
    return err(DomainErrors.artistNameUnavailable(verdict.reason, { field: "stageName" }));
  }
  const stageName = verdict.value;
  const role: GroupRole = input.role ?? "LEAD_MC";
  const now = contextNow(ctx);

  // Resume path: the player already authored themselves, so rename in place.
  if (career.playerArtistId) {
    const rows = await ctx.db
      .update(artists)
      .set({
        stageName,
        origin: input.origin?.trim() ?? null,
        updatedAt: now,
      })
      .where(eq(artists.id, career.playerArtistId))
      .returning();

    const artist = rows[0];
    if (!artist) return err(DomainErrors.controlledEntityMissing());

    await ctx.db
      .update(groupMemberships)
      .set({ role })
      .where(
        and(
          eq(groupMemberships.groupId, group.id),
          eq(groupMemberships.artistId, career.playerArtistId),
        ),
      );

    return ok({ artist, career, created: false });
  }

  const slug = await uniqueSlug(
    stageName,
    (candidate) => isArtistSlugTaken(ctx.db, career.worldId, candidate),
    "unnamed-artist",
  );

  const created = await ctx.db.transaction(async (tx) => {
    const insertedRows = await tx
      .insert(artists)
      .values({
        id: ids.artist(),
        worldId: career.worldId,
        stageName,
        slug,
        origin: input.origin?.trim() || null,
        artistType: "PLAYER",
        status: "ACTIVE",
        currentGroupId: group.id,
        preferredRole: role,
        authoredByCareerId: career.id,
        isPublic: false,
      })
      .returning();

    const artist = insertedRows[0];
    if (!artist) return null;

    // Neutral rows until Sound Discovery derives the real values.
    await tx.insert(artistSkills).values({ artistId: artist.id });
    await tx.insert(artistPsychology).values({ artistId: artist.id });

    await tx.insert(groupMemberships).values({
      id: ids.membership(),
      groupId: group.id,
      artistId: artist.id,
      role,
      influence: gameConfig.group.founderInfluence,
      satisfaction: gameConfig.group.founderSatisfaction,
      commitment: gameConfig.group.founderCommitment,
      soloAmbition: gameConfig.group.founderSoloAmbition,
      isFounder: true,
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
      importance: 70,
      idempotencyKey: `artist:${artist.id}:created`,
      payload: { stageName, slug, role, playerArtist: true, authored: true },
    });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.PlayerArtistAssigned,
      actorType: "USER",
      actorId: input.userId,
      targetType: "ARTIST",
      targetId: artist.id,
      visibility: "PRIVATE",
      importance: 65,
      idempotencyKey: `career:${career.id}:player_artist:${artist.id}`,
      payload: { controlledEntityType: "GROUP", groupId: group.id, role },
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
      payload: { stageName, role, isFounder: true, playerArtist: true },
    });

    const advanced = await tx
      .update(careers)
      .set({
        playerArtistId: artist.id,
        onboardingState: "SOUND_DISCOVERY",
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(careers.id, career.id))
      .returning();

    return { artist, career: advanced[0] ?? career };
  });

  if (!created) return err(DomainErrors.invalidInput("We couldn't create that artist."));

  await track(ctx, {
    name: "founding_artist_created",
    userId: input.userId,
    careerId: career.id,
    properties: { artistId: created.artist.id, role },
  });

  return ok({ artist: created.artist, career: created.career, created: true });
}
