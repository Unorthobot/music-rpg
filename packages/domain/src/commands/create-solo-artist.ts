import { eq } from "drizzle-orm";
import {
  artistPsychology,
  artistSkills,
  artists,
  careers,
  type ArtistRow,
  type CareerRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, ids, ok, uniqueSlug, type Result } from "@music-rpg/shared";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { isArtistSlugTaken, loadCareerArtist, loadOwnedCareer } from "../internal/career";
import { assignControlledEntity } from "./set-controlled-entity";

export type CreateSoloArtistInput = {
  careerId: string;
  userId: string;
  stageName: string;
  origin?: string | null;
  biography?: string | null;
};

export type CreateSoloArtistResult = {
  artist: ArtistRow;
  career: CareerRow;
  created: boolean;
};

/**
 * CreateSoloArtist.
 *
 * Creates the artist at the identity step — before Sound Discovery — so a
 * player who leaves mid-flow comes back to an artist that already exists rather
 * than an empty form. Skills, psychology and Sound DNA stay at neutral defaults
 * until discovery completes and writes the derived values.
 *
 * Re-running with a different name renames the existing artist instead of
 * creating a second one; this is what makes the back button safe.
 */
export async function createSoloArtist(
  ctx: CommandContext,
  input: CreateSoloArtistInput,
): Promise<Result<CreateSoloArtistResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (career.careerType !== "SOLO") {
    return err(DomainErrors.invalidCareerState("This career isn't a solo career."));
  }
  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState("This career has already started."));
  }

  const verdict = await ctx.moderation.check(input.stageName, "STAGE_NAME");
  if (!verdict.allowed) {
    return err(DomainErrors.artistNameUnavailable(verdict.reason, { field: "stageName" }));
  }
  const stageName = verdict.value;

  const biographyVerdict = input.biography
    ? await ctx.moderation.check(input.biography, "BIOGRAPHY")
    : null;
  if (biographyVerdict && !biographyVerdict.allowed) {
    return err(DomainErrors.invalidInput(biographyVerdict.reason, { field: "biography" }));
  }

  const now = contextNow(ctx);
  const existing = await loadCareerArtist(ctx.db, career);

  const slug = await uniqueSlug(
    stageName,
    (candidate) => isArtistSlugTaken(ctx.db, career.worldId, candidate, existing?.id),
    "unnamed-artist",
  );

  if (existing) {
    const updatedRows = await ctx.db
      .update(artists)
      .set({
        stageName,
        // Keep the original slug once the artist has one: it is the public
        // identity and later becomes a shared link.
        slug: existing.slug,
        origin: input.origin?.trim() ?? existing.origin,
        biography: biographyVerdict ? biographyVerdict.value : existing.biography,
        updatedAt: now,
      })
      .where(eq(artists.id, existing.id))
      .returning();

    const artist = updatedRows[0];
    if (!artist) return err(DomainErrors.controlledEntityMissing());

    return ok({ artist, career, created: false });
  }

  const created = await ctx.db.transaction(async (tx) => {
    const insertedRows = await tx
      .insert(artists)
      .values({
        id: ids.artist(),
        worldId: career.worldId,
        stageName,
        slug,
        origin: input.origin?.trim() || null,
        biography: biographyVerdict?.value ?? null,
        artistType: "PLAYER",
        status: "ACTIVE",
        authoredByCareerId: career.id,
        isPublic: false,
      })
      .returning();

    const artist = insertedRows[0];
    if (!artist) return null;

    // Neutral starting rows: real values arrive from Sound Discovery.
    await tx.insert(artistSkills).values({ artistId: artist.id });
    await tx.insert(artistPsychology).values({ artistId: artist.id });

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
      payload: {
        stageName: artist.stageName,
        slug: artist.slug,
        origin: artist.origin,
        playerArtist: true,
        authored: true,
      },
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
      payload: { controlledEntityType: "ARTIST" },
    });

    const updatedCareer = await assignControlledEntity(tx, {
      career,
      entityType: "ARTIST",
      entityId: artist.id,
      actorUserId: input.userId,
      now,
    });

    const advanced = await tx
      .update(careers)
      .set({
        // A solo career controls the same artist it *is*.
        playerArtistId: artist.id,
        onboardingState: "SOUND_DISCOVERY",
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(careers.id, career.id))
      .returning();

    return { artist, career: advanced[0] ?? updatedCareer ?? career };
  });

  if (!created) return err(DomainErrors.invalidInput("We couldn't create that artist."));

  await track(ctx, {
    name: "artist_created",
    userId: input.userId,
    careerId: career.id,
    properties: { artistId: created.artist.id, stageName: created.artist.stageName },
  });

  return ok({ artist: created.artist, career: created.career, created: true });
}
