import { eq } from "drizzle-orm";
import { artists, groups, soundProfiles } from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import {
  clampAxis,
  err,
  gameConfig,
  ok,
  type Result,
  type SoundProfileValues,
} from "@music-rpg/shared";
import { TUNABLE_SOUND_AXES, describeSound, type TunableSoundAxis } from "@music-rpg/simulation";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { soundProfileValues, writeSoundProfile } from "../internal/discovery";

export type TuneIdentityInput = {
  careerId: string;
  userId: string;
  stageName?: string;
  origin?: string | null;
  creativePhilosophy?: string | null;
  /** Only the tunable subset of axes may be set directly. */
  sound?: Partial<Record<TunableSoundAxis, number>>;
};

export type TuneIdentityResult = {
  sound: SoundProfileValues;
  soundSummary: string;
  name: string;
};

/**
 * TUNE IT.
 *
 * Lets a player adjust what they can see of their identity — the name, where
 * they're from, their own words, and four audible sound characteristics —
 * without ever exposing skills, psychology or the derived axes underneath.
 * The adjustment is recorded as an event, so world-control can always tell a
 * tuned identity from an inferred one.
 */
export async function tuneIdentity(
  ctx: CommandContext,
  input: TuneIdentityInput,
): Promise<Result<TuneIdentityResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (!career.controlledEntityId || !career.controlledEntityType) {
    return err(DomainErrors.controlledEntityMissing());
  }

  const isArtist = career.controlledEntityType === "ARTIST";
  const entityId = career.controlledEntityId;

  let name: string | undefined;
  if (input.stageName !== undefined) {
    const verdict = await ctx.moderation.check(input.stageName, isArtist ? "STAGE_NAME" : "GROUP_NAME");
    if (!verdict.allowed) {
      return err(
        isArtist
          ? DomainErrors.artistNameUnavailable(verdict.reason, { field: "stageName" })
          : DomainErrors.groupNameUnavailable(verdict.reason, { field: "stageName" }),
      );
    }
    name = verdict.value;
  }

  let philosophy: string | null | undefined;
  if (input.creativePhilosophy !== undefined) {
    if (input.creativePhilosophy === null) {
      philosophy = null;
    } else {
      const verdict = await ctx.moderation.check(input.creativePhilosophy, "FREE_TEXT");
      if (!verdict.allowed) {
        return err(DomainErrors.invalidInput(verdict.reason, { field: "creativePhilosophy" }));
      }
      philosophy = verdict.value.slice(0, gameConfig.identity.maxFreeTextLength);
    }
  }

  const profileRows = await ctx.db
    .select()
    .from(soundProfiles)
    .where(eq(soundProfiles.ownerId, entityId))
    .limit(1);

  const existingProfile = profileRows.find((row) => row.ownerType === (isArtist ? "ARTIST" : "GROUP"));
  if (!existingProfile) {
    return err(DomainErrors.invalidSoundDiscovery("Finish Sound Discovery before tuning."));
  }

  const sound = soundProfileValues(existingProfile);
  const changedAxes: Record<string, { from: number; to: number }> = {};

  for (const axis of TUNABLE_SOUND_AXES) {
    const requested = input.sound?.[axis];
    if (requested === undefined) continue;
    const next = clampAxis(requested);
    if (next !== sound[axis]) {
      changedAxes[axis] = { from: sound[axis], to: next };
      sound[axis] = next;
    }
  }

  const summary = describeSound(sound);
  const now = contextNow(ctx);

  const finalName = await ctx.db.transaction(async (tx) => {
    let currentName: string;

    if (isArtist) {
      const rows = await tx
        .update(artists)
        .set({
          ...(name ? { stageName: name } : {}),
          ...(input.origin !== undefined ? { origin: input.origin?.trim() || null } : {}),
          ...(philosophy !== undefined ? { creativePhilosophy: philosophy } : {}),
          updatedAt: now,
        })
        .where(eq(artists.id, entityId))
        .returning();
      currentName = rows[0]?.stageName ?? name ?? "";
    } else {
      const rows = await tx
        .update(groups)
        .set({
          ...(name ? { name } : {}),
          ...(philosophy !== undefined ? { creativePhilosophy: philosophy } : {}),
          updatedAt: now,
        })
        .where(eq(groups.id, entityId))
        .returning();
      currentName = rows[0]?.name ?? name ?? "";
    }

    await writeSoundProfile(tx, {
      ownerType: isArtist ? "ARTIST" : "GROUP",
      ownerId: entityId,
      values: sound,
      summary,
      derivedFrom: {
        ...(existingProfile.derivedFrom ?? {}),
        tunedAt: now.toISOString(),
        tunedAxes: Object.keys(changedAxes),
      },
      now,
    });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.ArtistIdentityTuned,
      actorType: "USER",
      actorId: input.userId,
      targetType: career.controlledEntityType,
      targetId: entityId,
      visibility: "PRIVATE",
      importance: 35,
      payload: {
        changedAxes,
        renamed: Boolean(name),
        philosophyChanged: philosophy !== undefined,
      },
    });

    return currentName;
  });

  await track(ctx, {
    name: "artist_tuned",
    userId: input.userId,
    careerId: career.id,
    properties: {
      axes: Object.keys(changedAxes),
      renamed: Boolean(name),
      entityType: career.controlledEntityType,
    },
  });

  return ok({ sound, soundSummary: summary, name: finalName });
}
