import { eq } from "drizzle-orm";
import { careers, type CareerRow, type DbClient } from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, ok, type ControlledEntityType, type Result } from "@music-rpg/shared";
import { contextNow, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

export type AssignControlledEntityInput = {
  career: CareerRow;
  entityType: ControlledEntityType;
  entityId: string;
  actorUserId: string;
  now: Date;
};

/**
 * Attaches the thing the player actually controls to their career.
 *
 * Runs inside the caller's transaction: an artist that exists without being
 * attached to a career — or a career pointing at an artist that failed to
 * insert — is a state we never want to be reachable.
 */
export async function assignControlledEntity(
  tx: DbClient,
  input: AssignControlledEntityInput,
): Promise<CareerRow | undefined> {
  const rows = await tx
    .update(careers)
    .set({
      controlledEntityType: input.entityType,
      controlledEntityId: input.entityId,
      lastActiveAt: input.now,
      updatedAt: input.now,
    })
    .where(eq(careers.id, input.career.id))
    .returning();

  await recordEvent(tx, {
    worldId: input.career.worldId,
    careerId: input.career.id,
    eventType: GameEventType.ControlledEntityAssigned,
    actorType: "USER",
    actorId: input.actorUserId,
    targetType: input.entityType,
    targetId: input.entityId,
    visibility: "PRIVATE",
    importance: 50,
    idempotencyKey: `career:${input.career.id}:controls:${input.entityType}:${input.entityId}`,
    payload: { entityType: input.entityType, entityId: input.entityId },
  });

  return rows[0];
}

/** Public command form, for later flows that hand control to a new entity. */
export async function setControlledEntity(
  ctx: CommandContext,
  input: { careerId: string; userId: string; entityType: ControlledEntityType; entityId: string },
): Promise<Result<CareerRow, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;

  const now = contextNow(ctx);
  const updated = await ctx.db.transaction((tx) =>
    assignControlledEntity(tx, {
      career: careerResult.value,
      entityType: input.entityType,
      entityId: input.entityId,
      actorUserId: input.userId,
      now,
    }),
  );

  if (!updated) return err(DomainErrors.careerNotFound());
  return ok(updated);
}
