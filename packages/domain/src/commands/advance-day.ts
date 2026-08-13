import { and, eq, inArray } from "drizzle-orm";
import { releasePerformance, releases } from "@music-rpg/database";
import { err, ok, type Result } from "@music-rpg/shared";
import type { CommandContext } from "../context";
import { DomainErrors, type DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";
import { DAYS } from "../internal/clock";
import { simulateReceptionTick, type SimulateReceptionResult } from "./reception";
import { syncCareerRelationships } from "./relationships";
import { surfaceRelationshipMoments } from "./moments";
import { runOpportunityDirector, type RunDirectorResult } from "./opportunities";
import { communicateOpportunities } from "./opportunity-messages";
import {
  guardAcceptedBattles,
  resolveDueBattles,
  type ResolveBattleResult,
} from "./battles";
import type {
  CareerRow,
  OpportunityRow,
  ReleaseRow,
  RelationshipMomentRow,
} from "@music-rpg/database";

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
 *
 * M8 adds one step to that chain and one rule in front of it. The step is
 * **scheduled world events**, which resolve immediately after time moves and
 * before anything is allowed to react to them. The rule is that time may not
 * move *past* a commitment the player has already made and not finished
 * answering — see `guardAcceptedBattles`.
 */
export type AdvanceDayResult = {
  /** Every release that moved forward, in the order they were simulated. */
  ticks: SimulateReceptionResult[];
  /**
   * Scheduled events the world reached on this advance.
   *
   * Battles, and for now only battles — the first thing in this game that
   * happens on a date whether or not anybody is looking. Reported so a caller
   * can say what the day contained without asking a screen to find out.
   */
  battles: ResolveBattleResult[];
  /** Anything that surfaced because of what the day did. */
  moments: RelationshipMomentRow[];
  /** What the world decided it could offer, now that the day is fully written. */
  opportunities: OpportunityRow[];
  /** Offers that lapsed because the world passed their date. */
  expired: OpportunityRow[];
  /** The director's full reasoning, including what it decided against. */
  director: RunDirectorResult | null;
  /**
   * Offers somebody wrote to the player about on this advance.
   *
   * Reported separately from `opportunities` because they are different facts:
   * an offer exists whether or not anybody managed to mention it, and this is
   * the list of the ones that got mentioned.
   */
  communicated: string[];
  gameTime: Date;
};

/**
 * Where this advance would put the career's clock.
 *
 * Computed rather than assumed, and computed the way reception actually does it:
 * a tick lands on `releasedGameTime + dayIndex × a day`, the next `dayIndex` is
 * one past what the release has already simulated, and the career's date follows
 * whichever release reaches furthest. Nothing here writes or simulates — it
 * answers "if this day ran, what date would it be" from rows that already exist.
 *
 * The alternative was `currentGameDate + one day`, which is nearly always the
 * same answer and quietly wrong whenever it is not: a career whose releases are
 * at different points, or one that has been sitting on a date longer than a day,
 * would be guarded against a night it was not actually about to reach.
 */
async function nextGameTime(
  ctx: CommandContext,
  career: CareerRow,
  releaseRows: ReleaseRow[],
): Promise<Date> {
  const performanceRows = await ctx.db
    .select()
    .from(releasePerformance)
    .where(
      inArray(
        releasePerformance.releaseId,
        releaseRows.map((release) => release.id),
      ),
    );

  const simulatedBy = new Map(
    performanceRows.map((row) => [row.releaseId, row.daysSimulated]),
  );

  return releaseRows.reduce((furthest, release) => {
    if (!release.releasedGameTime) return furthest;

    const nextDayIndex = (simulatedBy.get(release.id) ?? 0) + 1;
    const lands = new Date(release.releasedGameTime.getTime() + nextDayIndex * DAYS);

    return lands > furthest ? lands : furthest;
  }, career.currentGameDate);
}

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

  /*
   * 0. Nothing moves past a commitment that is not ready.
   *
   *    A preflight, and deliberately before step 1 rather than inside it. The
   *    career's clock follows its records — a tick writes `currentGameDate` — so
   *    by the time a single release has ticked, the day has already happened and
   *    refusing afterwards would mean refusing a world that had already moved.
   *    Checked against where this advance *would* land, computed from the same
   *    rows the ticks are about to use.
   *
   *    A refusal here changes nothing at all: no reception, no relationships, no
   *    moments, no director, no messages, and the career date is exactly where it
   *    was.
   */
  const landingOn = await nextGameTime(ctx, career, releaseRows);
  const blocked = await guardAcceptedBattles(ctx, career, landingOn);
  if (blocked) return err(blocked);

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

  /*
   * 1.5. Scheduled world events the clock has now reached.
   *
   *      Positioned here for the same reason every other step is where it is:
   *      time has moved, so the night has happened, and everything below must be
   *      allowed to react to a world in which it did. Relationships fold the
   *      battle's interactions, moments can speak about it, and the director
   *      weighs its next offer against a career that just won or lost in front
   *      of a room.
   *
   *      Above reception it would be a battle fought before its own night; below
   *      relationships it would be a battle the world spent a day not knowing
   *      about.
   *
   *      This is the seam a second scheduled event type joins — beside this
   *      call, not inside it. There is deliberately no registry: one event type
   *      does not demonstrate the need for one, and the ordering is the part
   *      worth preserving.
   */
  const scheduled = await resolveDueBattles(ctx, {
    careerId: career.id,
    userId: input.userId,
    ...(input.seed ? { seed: input.seed } : {}),
  });

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

  /*
   * 5. The people involved say so.
   *
   *    Separate from step 4 on purpose, and outside its transaction. The
   *    director creates a world fact; this is somebody telling the player about
   *    one that already exists — so a message that cannot be written costs
   *    nothing. The offer is still real, Home still surfaces it, and the
   *    communication is retried on the next day advance from the same persisted
   *    facts, keyed per offer and per moment so it cannot be said twice.
   *
   *    It belongs here rather than to a render for the same reason the director
   *    does: it is a write, and screens do not write. A player who opens
   *    Messages ten times gets no new messages.
   */
  const spoken = await communicateOpportunities(ctx, {
    careerId: career.id,
    userId: input.userId,
  });

  const latest = ticks.reduce(
    (newest, tick) => (tick.gameTime > newest ? tick.gameTime : newest),
    ticks[0]!.gameTime,
  );

  return ok({
    ticks,
    battles: scheduled.ok ? scheduled.value : [],
    moments: surfaced.value.surfaced,
    opportunities: directed.ok ? directed.value.created : [],
    expired: directed.ok ? directed.value.expired : [],
    director: directed.ok ? directed.value : null,
    communicated: spoken.ok ? spoken.value.spokenAbout : [],
    gameTime: latest,
  });
}
