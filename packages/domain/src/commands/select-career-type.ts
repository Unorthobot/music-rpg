import { eq } from "drizzle-orm";
import { careers, soundDiscoverySessions, type CareerRow } from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, ids, ok, type CareerType, type Result } from "@music-rpg/shared";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

export type SelectCareerTypeInput = {
  careerId: string;
  userId: string;
  careerType: CareerType;
};

/**
 * CareerTypeSelected.
 *
 * The choice is persisted the moment it is made — a player who closes the tab
 * on this screen returns to the identity step, not to the fork.
 *
 * Changing the answer is allowed while onboarding has not yet produced a
 * controlled entity; once an artist or group exists, switching paths would
 * orphan it, so it is refused.
 */
export async function selectCareerType(
  ctx: CommandContext,
  input: SelectCareerTypeInput,
): Promise<Result<CareerRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState("This career has already started."));
  }

  if (career.controlledEntityId && career.careerType !== input.careerType) {
    return err(
      DomainErrors.invalidCareerState(
        "You've already started building an identity for this career. Finish it, or start over from settings.",
      ),
    );
  }

  const now = contextNow(ctx);
  const subjectType = input.careerType === "SOLO" ? "ARTIST" : "GROUP";

  const updated = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(careers)
      .set({
        careerType: input.careerType,
        onboardingState: career.onboardingState === "CAREER_TYPE" ? "IDENTITY" : career.onboardingState,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(careers.id, career.id))
      .returning();

    // The discovery session is created here so answers can be saved from the
    // very first question without another round-trip.
    await tx
      .insert(soundDiscoverySessions)
      .values({
        id: ids.discovery(),
        careerId: career.id,
        subjectType,
        status: "IN_PROGRESS",
        responses: {},
      })
      .onConflictDoUpdate({
        target: soundDiscoverySessions.careerId,
        set: { subjectType, updatedAt: now },
      });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.CareerTypeSelected,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CAREER",
      targetId: career.id,
      visibility: "PRIVATE",
      importance: 40,
      idempotencyKey: `career:${career.id}:type:${input.careerType}`,
      payload: { careerType: input.careerType },
    });

    return rows[0];
  });

  if (!updated) return err(DomainErrors.careerNotFound());

  await track(ctx, {
    name: "career_type_selected",
    userId: input.userId,
    careerId: career.id,
    properties: { careerType: input.careerType },
  });

  await track(ctx, {
    name: input.careerType === "SOLO" ? "artist_creation_started" : "group_creation_started",
    userId: input.userId,
    careerId: career.id,
  });

  return ok(updated);
}
