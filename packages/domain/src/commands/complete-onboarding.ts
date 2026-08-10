import { and, eq } from "drizzle-orm";
import {
  careers,
  groupMemberships,
  groups,
  users,
  type CareerRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, gameConfig, ok, type Result } from "@music-rpg/shared";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { loadDiscoverySession } from "../internal/discovery";

/**
 * CompleteCareerOnboarding — "ENTER THE UNDERGROUND".
 *
 * The gate that turns a half-built onboarding record into a live career. It
 * refuses to pass unless the career actually has everything the rest of the
 * simulation assumes: a controlled entity, completed Sound Discovery, and (for
 * groups) at least one member.
 *
 * Starting state was written at creation and is not re-applied here — money,
 * act and metrics are real persisted values from the moment the career exists,
 * not something conjured at the end of a flow.
 */
export async function completeCareerOnboarding(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<CareerRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (career.status === "ACTIVE" && career.onboardingState === "COMPLETE") {
    // Idempotent: refreshing the reveal screen after entering must not emit a
    // second "entered the underground".
    return ok(career);
  }
  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState());
  }
  if (!career.controlledEntityId || !career.controlledEntityType) {
    return err(DomainErrors.controlledEntityMissing());
  }
  /*
   * Every career belongs to a musician, including group careers: without a
   * player artist there is nobody for the player to be when the group changes
   * shape later.
   */
  if (!career.playerArtistId) {
    return err(
      DomainErrors.controlledEntityMissing("This career doesn't have your own artist yet."),
    );
  }

  const session = await loadDiscoverySession(ctx.db, career.id);
  if (!session || session.status !== "COMPLETED") {
    return err(DomainErrors.invalidSoundDiscovery("Finish Sound Discovery first."));
  }

  if (career.controlledEntityType === "GROUP") {
    const members = await ctx.db
      .select({ id: groupMemberships.id })
      .from(groupMemberships)
      .where(
        and(
          eq(groupMemberships.groupId, career.controlledEntityId),
          eq(groupMemberships.status, "ACTIVE"),
        ),
      );

    if (members.length < gameConfig.group.minFoundingMembers) {
      return err(DomainErrors.lineupInvalid());
    }
  }

  const now = contextNow(ctx);

  const updated = await ctx.db.transaction(async (tx) => {
    const rows = await tx
      .update(careers)
      .set({
        status: "ACTIVE",
        careerAct: "UNDERGROUND",
        onboardingState: "COMPLETE",
        onboardingCompletedAt: now,
        lastActiveAt: now,
        updatedAt: now,
      })
      .where(eq(careers.id, career.id))
      .returning();

    if (career.controlledEntityType === "GROUP" && career.controlledEntityId) {
      await tx
        .update(groups)
        .set({ status: "ACTIVE", updatedAt: now })
        .where(eq(groups.id, career.controlledEntityId));
    }

    await tx
      .update(users)
      .set({ onboardingState: "COMPLETE", updatedAt: now })
      .where(eq(users.id, input.userId));

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.CareerOnboardingCompleted,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CAREER",
      targetId: career.id,
      visibility: "PRIVATE",
      importance: 85,
      idempotencyKey: `career:${career.id}:onboarding_completed`,
      payload: {
        controlledEntityType: career.controlledEntityType,
        controlledEntityId: career.controlledEntityId,
        playerArtistId: career.playerArtistId,
      },
    });

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.CareerEnteredUnderground,
      actorType: "CAREER",
      actorId: career.id,
      targetType: "WORLD",
      targetId: career.worldId,
      // The scene notices a new name, even if nobody is paying attention yet.
      visibility: "LOCAL_PUBLIC",
      importance: 90,
      idempotencyKey: `career:${career.id}:entered_underground`,
      payload: {
        careerAct: "UNDERGROUND",
        moneyBalance: career.moneyBalance,
        fame: career.fame,
        respect: career.respect,
        heat: career.heat,
        legacy: career.legacy,
      },
    });

    return rows[0];
  });

  if (!updated) return err(DomainErrors.careerNotFound());

  await track(ctx, {
    name: "career_onboarding_completed",
    userId: input.userId,
    careerId: career.id,
    properties: {
      careerType: career.careerType,
      controlledEntityType: career.controlledEntityType,
    },
  });

  return ok(updated);
}
