import { and, eq } from "drizzle-orm";
import {
  careerAudience,
  careers,
  scenes,
  users,
  worlds,
  type CareerRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { err, gameConfig, ids, ok, type Result } from "@music-rpg/shared";
import { contextNow, track, type CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { resolveDefaultWorld } from "../internal/career";

export type CreateCareerInput = {
  userId: string;
  /** Defaults to the first active world (Johannesburg in development). */
  worldId?: string;
  /** Career name. Defaults to the player's display name. */
  name?: string;
};

export type CreateCareerResult = {
  career: CareerRow;
  /** False when an existing in-progress career was returned instead. */
  created: boolean;
};

/**
 * CreateCareer.
 *
 * Idempotent by design: a double-submitted "Start career" button, a refresh
 * mid-flow or a back-navigation must never produce a second career. The unique
 * (user_id, world_id) index is the enforcement; this command reads it first so
 * the player gets their existing career back rather than an error.
 */
export async function createCareer(
  ctx: CommandContext,
  input: CreateCareerInput,
): Promise<Result<CreateCareerResult, DomainError>> {
  const now = contextNow(ctx);

  const world = input.worldId
    ? (await ctx.db.select().from(worlds).where(eq(worlds.id, input.worldId)).limit(1))[0]
    : await resolveDefaultWorld(ctx.db);

  if (!world) return err(DomainErrors.worldNotFound());

  const existingRows = await ctx.db
    .select()
    .from(careers)
    .where(and(eq(careers.userId, input.userId), eq(careers.worldId, world.id)))
    .limit(1);

  const existing = existingRows[0];
  if (existing) {
    return ok({ career: existing, created: false });
  }

  const userRows = await ctx.db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  const user = userRows[0];
  if (!user) return err(DomainErrors.invalidInput("We couldn't find your account."));

  const sceneRows = await ctx.db
    .select()
    .from(scenes)
    .where(eq(scenes.worldId, world.id))
    .orderBy(scenes.name)
    .limit(1);

  const result = await ctx.db.transaction(async (tx) => {
    const inserted = await tx
      .insert(careers)
      .values({
        id: ids.career(),
        userId: input.userId,
        worldId: world.id,
        name: (input.name ?? user.displayName).trim(),
        status: "ONBOARDING",
        careerAct: gameConfig.career.startingAct,
        onboardingState: "CAREER_TYPE",
        startedAt: now,
        currentGameDate: world.currentGameTime,
        fame: gameConfig.career.startingFame,
        respect: gameConfig.career.startingRespect,
        heat: gameConfig.career.startingHeat,
        legacy: gameConfig.career.startingLegacy,
        moneyBalance: gameConfig.career.startingMoneyMinor,
        primarySceneId: sceneRows[0]?.id ?? null,
        lastActiveAt: now,
      })
      // Concurrent double-submit: the loser of the race gets nothing back here
      // and re-reads below.
      .onConflictDoNothing({ target: [careers.userId, careers.worldId] })
      .returning();

    const career = inserted[0];
    if (!career) return null;

    // The audience projection exists from the first moment of the career, so
    // every fan count the player ever sees is a persisted value.
    await tx.insert(careerAudience).values({ careerId: career.id }).onConflictDoNothing();

    await tx
      .update(users)
      .set({ onboardingState: "CAREER_TYPE", updatedAt: now })
      .where(eq(users.id, input.userId));

    await recordEvent(tx, {
      worldId: world.id,
      careerId: career.id,
      eventType: GameEventType.CareerCreated,
      actorType: "USER",
      actorId: input.userId,
      targetType: "CAREER",
      targetId: career.id,
      visibility: "PRIVATE",
      importance: 60,
      occurredAt: world.currentGameTime,
      idempotencyKey: `career:${career.id}:created`,
      payload: {
        worldName: world.name,
        startingMoneyMinor: gameConfig.career.startingMoneyMinor,
        careerAct: gameConfig.career.startingAct,
      },
    });

    return career;
  });

  if (!result) {
    // Lost the race — return the career the other request created.
    const rows = await ctx.db
      .select()
      .from(careers)
      .where(and(eq(careers.userId, input.userId), eq(careers.worldId, world.id)))
      .limit(1);
    const career = rows[0];
    if (!career) return err(DomainErrors.careerAlreadyExists());
    return ok({ career, created: false });
  }

  await track(ctx, {
    name: "career_creation_started",
    userId: input.userId,
    careerId: result.id,
    properties: { worldId: world.id, worldName: world.name },
  });

  return ok({ career: result, created: true });
}
