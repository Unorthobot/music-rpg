import { eq } from "drizzle-orm";
import { careers, groups, type CareerRow, type GroupRow } from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, ids, ok, uniqueSlug, type Result } from "@music-rpg/shared";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { isGroupSlugTaken, loadCareerGroup, loadOwnedCareer } from "../internal/career";
import { assignControlledEntity } from "./set-controlled-entity";

export type CreateGroupInput = {
  careerId: string;
  userId: string;
  name: string;
  creativeDirection?: string | null;
  biography?: string | null;
};

export type CreateGroupResult = {
  group: GroupRow;
  career: CareerRow;
  created: boolean;
};

/**
 * CreateGroup.
 *
 * The Group — not any individual member — is the controlled entity of a group
 * career. Members are Artists in their own right (see AddGroupMember), which is
 * what lets a member later leave, go solo, or be poached without special-casing.
 *
 * Group is not Crew: crew is the wider career network and gets its own tables
 * in a later milestone.
 */
export async function createGroup(
  ctx: CommandContext,
  input: CreateGroupInput,
): Promise<Result<CreateGroupResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  if (career.careerType !== "GROUP") {
    return err(DomainErrors.invalidCareerState("This career isn't a group career."));
  }
  if (career.status !== "ONBOARDING") {
    return err(DomainErrors.invalidCareerState("This career has already started."));
  }

  const verdict = await ctx.moderation.check(input.name, "GROUP_NAME");
  if (!verdict.allowed) {
    return err(DomainErrors.groupNameUnavailable(verdict.reason, { field: "name" }));
  }
  const name = verdict.value;

  const directionVerdict = input.creativeDirection
    ? await ctx.moderation.check(input.creativeDirection, "FREE_TEXT")
    : null;
  if (directionVerdict && !directionVerdict.allowed) {
    return err(DomainErrors.invalidInput(directionVerdict.reason, { field: "creativeDirection" }));
  }

  const now = contextNow(ctx);
  const existing = await loadCareerGroup(ctx.db, career);

  if (existing) {
    const updatedRows = await ctx.db
      .update(groups)
      .set({
        name,
        creativeDirection: directionVerdict ? directionVerdict.value : existing.creativeDirection,
        biography: input.biography?.trim() ?? existing.biography,
        updatedAt: now,
      })
      .where(eq(groups.id, existing.id))
      .returning();

    const group = updatedRows[0];
    if (!group) return err(DomainErrors.controlledEntityMissing());
    return ok({ group, career, created: false });
  }

  const slug = await uniqueSlug(
    name,
    (candidate) => isGroupSlugTaken(ctx.db, career.worldId, candidate),
    "unnamed-group",
  );

  const created = await ctx.db.transaction(async (tx) => {
    const insertedRows = await tx
      .insert(groups)
      .values({
        id: ids.group(),
        worldId: career.worldId,
        name,
        slug,
        creativeDirection: directionVerdict?.value ?? null,
        biography: input.biography?.trim() || null,
        status: "FORMING",
        foundedAt: now,
        isPublic: false,
      })
      .returning();

    const group = insertedRows[0];
    if (!group) return null;

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.GroupCreated,
      actorType: "USER",
      actorId: input.userId,
      targetType: "GROUP",
      targetId: group.id,
      visibility: "PRIVATE",
      importance: 70,
      idempotencyKey: `group:${group.id}:created`,
      payload: { name: group.name, slug: group.slug },
    });

    await assignControlledEntity(tx, {
      career,
      entityType: "GROUP",
      entityId: group.id,
      actorUserId: input.userId,
      now,
    });

    const advanced = await tx
      .update(careers)
      // Next the player authors themselves as a member of this group; Sound
      // Discovery comes after, once there is somebody to attach it to.
      .set({ onboardingState: "FOUNDING_ARTIST", lastActiveAt: now, updatedAt: now })
      .where(eq(careers.id, career.id))
      .returning();

    return { group, career: advanced[0] ?? career };
  });

  if (!created) return err(DomainErrors.invalidInput("We couldn't create that group."));

  await track(ctx, {
    name: "group_created",
    userId: input.userId,
    careerId: career.id,
    properties: { groupId: created.group.id, name: created.group.name },
  });

  return ok({ group: created.group, career: created.career, created: true });
}
