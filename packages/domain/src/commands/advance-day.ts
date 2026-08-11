import { and, eq } from "drizzle-orm";
import { releases } from "@music-rpg/database";
import { err, ok, type Result } from "@music-rpg/shared";
import type { CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { simulateReceptionTick, type SimulateReceptionResult } from "./reception";
import { syncCareerRelationships } from "./relationships";
import { surfaceRelationshipMoments } from "./moments";
import type { RelationshipMomentRow } from "@music-rpg/database";

/**
 * A day passing.
 *
 * The one place the career moves forward, and the order it moves in is the
 * causal chain the whole game is built on:
 *
 *     advance time → run the simulation that was due → derive what that did to
 *     the people involved → surface anything they now have to say
 *
 * Each step reads what the one before it wrote, which is why they are sequential
 * rather than concurrent. Reception cannot be derived from before it happened,
 * and LEX cannot want to talk about a session whose consequences have not been
 * folded in yet.
 *
 * Moments surface *here* rather than on render, deliberately. Opening a screen
 * must not cause the world to decide something — time passing creates the
 * opportunity and the interface reveals what already happened. A player who
 * finishes a tense session, opens Crew immediately and finds nothing waiting is
 * seeing the truth; a day later, LEX wants to talk.
 */
export type AdvanceDayResult = {
  /** Every release that moved forward, in the order they were simulated. */
  ticks: SimulateReceptionResult[];
  /** Anything that surfaced because of what the day did. */
  moments: RelationshipMomentRow[];
  gameTime: Date;
};

export async function advanceCareerDay(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<AdvanceDayResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const releaseRows = await ctx.db
    .select()
    .from(releases)
    .where(and(eq(releases.careerId, career.id), eq(releases.status, "RELEASED")))
    .orderBy(releases.releasedGameTime);

  if (releaseRows.length === 0) {
    return err(
      DomainErrors.invalidCareerState("Nothing of yours is out yet, so there's nothing to wait on."),
    );
  }

  /* 1. Time moves, and the simulation that was due for it runs. */
  const ticks: SimulateReceptionResult[] = [];

  for (const release of releaseRows) {
    const tick = await simulateReceptionTick(ctx, {
      careerId: career.id,
      userId: input.userId,
      releaseId: release.id,
    });
    // One release refusing (nothing finished behind it, say) must not stop the
    // others: the day still happened.
    if (tick.ok) ticks.push(tick.value);
  }

  if (ticks.length === 0) {
    return err(DomainErrors.invalidCareerState("Nothing moved forward."));
  }

  /* 2. What the day did to the people involved. */
  const derived = await syncCareerRelationships(ctx, {
    careerId: career.id,
    userId: input.userId,
  });
  if (!derived.ok) return derived;

  /* 3. Anything they now have to say, written down so it cannot be rerolled. */
  const surfaced = await surfaceRelationshipMoments(ctx, {
    careerId: career.id,
    userId: input.userId,
  });
  if (!surfaced.ok) return surfaced;

  const latest = ticks.reduce(
    (newest, tick) => (tick.gameTime > newest ? tick.gameTime : newest),
    ticks[0]!.gameTime,
  );

  return ok({ ticks, moments: surfaced.value.surfaced, gameTime: latest });
}
