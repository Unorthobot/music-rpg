import { eq } from "drizzle-orm";
import { careers, worlds, type DbClient } from "@music-rpg/database";

/**
 * The game clock.
 *
 * In-world time is not wall-clock time. A career sits at a game date that moves
 * when the player does something that takes time — booking a session, working
 * in the studio — never because a server happened to be running. Background
 * world ticks arrive later and will advance world time through the same port.
 *
 * Everything that schedules or timestamps *fiction* reads from here.
 * `createdAt` columns still record wall-clock time, for operators.
 */
export const HOURS = 60 * 60 * 1000;
export const DAYS = 24 * HOURS;

export type GameClock = {
  worldTime(worldId: string): Promise<Date>;
  careerTime(careerId: string): Promise<Date>;
  /** Moves a career's in-world date forward. Never backwards. */
  advanceCareerTime(careerId: string, milliseconds: number): Promise<Date>;
};

export function createGameClock(db: DbClient): GameClock {
  return {
    async worldTime(worldId) {
      const rows = await db
        .select({ time: worlds.currentGameTime })
        .from(worlds)
        .where(eq(worlds.id, worldId))
        .limit(1);
      return rows[0]?.time ?? new Date();
    },

    async careerTime(careerId) {
      const rows = await db
        .select({ time: careers.currentGameDate })
        .from(careers)
        .where(eq(careers.id, careerId))
        .limit(1);
      return rows[0]?.time ?? new Date();
    },

    async advanceCareerTime(careerId, milliseconds) {
      const current = await this.careerTime(careerId);
      const next = new Date(current.getTime() + Math.max(0, milliseconds));

      await db
        .update(careers)
        .set({ currentGameDate: next, updatedAt: new Date() })
        .where(eq(careers.id, careerId));

      return next;
    },
  };
}

/** Advances a career's clock inside a caller's transaction. */
export async function advanceCareerTimeInTx(
  tx: DbClient,
  careerId: string,
  from: Date,
  milliseconds: number,
): Promise<Date> {
  const next = new Date(from.getTime() + Math.max(0, milliseconds));
  await tx
    .update(careers)
    .set({ currentGameDate: next, updatedAt: new Date() })
    .where(eq(careers.id, careerId));
  return next;
}
