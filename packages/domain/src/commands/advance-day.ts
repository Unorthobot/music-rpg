import { and, eq } from "drizzle-orm";
import { releases } from "@music-rpg/database";
import { err, ok, type Result } from "@music-rpg/shared";
import type { CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { simulateReceptionTick, type SimulateReceptionResult } from "./reception";
import { syncCareerRelationships } from "./relationships";
import { surfaceRelationshipMoments } from "./moments";
import { runOpportunityDirector, type RunDirectorResult } from "./opportunities";
import type { OpportunityRow, RelationshipMomentRow } from "@music-rpg/database";

/**
 * A day passing.
 *
 * The one place the career moves forward, and the order it moves in is the
 * causal chain the whole game is built on:
 *
 *     advance time → run the simulation that was due → derive what that did to
 *     the people involved → surface anything they now have to say → work out
 *     what the world could plausibly offer next
 *
 * Each step reads what the one before it wrote, which is why they are sequential
 * rather than concurrent. Reception cannot be derived from before it happened,
 * LEX cannot want to talk about a session whose consequences have not been folded
 * in yet, and the director cannot weigh an offer against a world that is still
 * half-written. "LEX wants to talk" is itself a fact an opportunity may key off,
 * which is why generation runs after moments rather than beside them.
 *
 * Moments and opportunities arrive *here* rather than on render, deliberately.
 * Opening a screen must not cause the world to decide something — time passing
 * creates the situation and the interface reveals what already happened. A player
 * who opens Home ten times before letting a day pass sees the same world ten
 * times.
 */
export type AdvanceDayResult = {
  /** Every release that moved forward, in the order they were simulated. */
  ticks: SimulateReceptionResult[];
  /** Anything that surfaced because of what the day did. */
  moments: RelationshipMomentRow[];
  /** What the world decided it could offer, now that the day is fully written. */
  opportunities: OpportunityRow[];
  /** Offers that lapsed because the world passed their date. */
  expired: OpportunityRow[];
  /** The director's full reasoning, including what it decided against. */
  director: RunDirectorResult | null;
  gameTime: Date;
};

export async function advanceCareerDay(
  ctx: CommandContext,
  input: {
    careerId: string;
    userId: string;
    /**
     * Reception's seed, honoured on a release's first tick only.
     *
     * The same affordance `simulateReceptionTick` has always exposed, forwarded
     * one level up so the whole chain can be run reproducibly. Left unset — as
     * every caller in the app leaves it — each release seeds from its own id, so
     * two careers never share a roll of the dice.
     */
    seed?: string;
  },
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
      ...(input.seed ? { seed: input.seed } : {}),
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

  /*
   * 4. What the world could plausibly offer, given everything above. Last,
   *    because it is the only step that reads all of the others — and because an
   *    offer weighed against a partly-written day would be explaining a world
   *    that never existed.
   *
   *    A director that cannot run must not undo a day that did: the reception,
   *    the relationships and the moments are already real, so a failure here is
   *    reported as "nothing was offered" rather than as the day not happening.
   */
  const directed = await runOpportunityDirector(ctx, {
    careerId: career.id,
    userId: input.userId,
  });

  const latest = ticks.reduce(
    (newest, tick) => (tick.gameTime > newest ? tick.gameTime : newest),
    ticks[0]!.gameTime,
  );

  return ok({
    ticks,
    moments: surfaced.value.surfaced,
    opportunities: directed.ok ? directed.value.created : [],
    expired: directed.ok ? directed.value.expired : [],
    director: directed.ok ? directed.value : null,
    gameTime: latest,
  });
}
