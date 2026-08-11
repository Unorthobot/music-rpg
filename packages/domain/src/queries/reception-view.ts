import { and, asc, desc, eq, gte } from "drizzle-orm";
import {
  audienceCohorts,
  careerMetricPressure,
  careers,
  gameEvents,
  receptionTicks,
  releaseCohortPerformance,
  releasePerformance,
  releases,
  tracks,
  type CareerRow,
  type Database,
} from "@music-rpg/database";
import { GameEventType } from "@music-rpg/events";
import {
  COHORT_RESPONSE_LABELS,
  DAY_BEAT_LINES,
  METRIC_MOVEMENT_LABELS,
  MOMENTUM_LABELS,
  classifyCohort,
  classifyDay,
  classifyMetricMovement,
  classifyMomentum,
  classifyTrajectory,
  cohortInsight,
  metricLevel,
  trajectoryDetail,
  trajectoryHeadline,
  type CohortResponse,
  type DayBeat,
  type MetricMovement,
  type MomentumState,
  type ReceptionFacts,
  type ReceptionTrajectory,
} from "@music-rpg/simulation";
import type { ReceptionTickResult } from "@music-rpg/shared";
import { DAYS } from "../internal/clock";

/**
 * Reception, as the player is allowed to see it.
 *
 * Separate from `queries/reception.ts` on purpose. That file is for World
 * Control and returns everything — fit, its components, the modifier
 * multipliers, the raw momentum, the seed, the simulator version. This file is
 * the other side of that line and returns none of it.
 *
 * What crosses: unique listeners, fans gained, engaged listeners, returners,
 * how each cohort responded, the shape of the trajectory, and where Fame,
 * Respect and Heat now stand. What does not: any coefficient, any weight, any
 * fractional pressure, any seed, and the momentum figure itself — momentum
 * leaves as a direction, never as 13.55.
 *
 * The rule is a boundary, not a formatting preference. A player reading
 * `fit = 0.706` is reading a spreadsheet about their own record.
 */

/* --- One release ---------------------------------------------------------- */

export type CohortReceptionView = {
  /** The cohort's name as the world seeded it, e.g. "Scene heads". */
  name: string;
  response: CohortResponse;
  responseLabel: string;
  uniqueListeners: number;
  fansGained: number;
  shares: number;
};

export type ReleaseDayView = {
  dayIndex: number;
  gameTime: Date;
  beat: DayBeat;
  line: string;
  /** People who heard it for the first time that day. */
  newListeners: number;
  fansGained: number;
  /** Running totals, which is what the player is actually tracking. */
  cumulativeListeners: number;
  cumulativeFans: number;
};

export type ReleaseReceptionView = {
  releaseId: string;
  trackId: string | null;
  title: string;
  releasedGameTime: Date;
  /** Whole days of reception simulated so far. */
  daysOut: number;
  trajectory: ReceptionTrajectory;
  headline: string;
  detail: string;
  /** The one thing worth saying about who is responding. Null when nothing is. */
  insight: string | null;
  uniqueListeners: number;
  fansGained: number;
  engagedListeners: number;
  returningListeners: number;
  /** Qualitative. The 0–100 figure behind it never leaves the simulator. */
  momentum: MomentumState;
  momentumLabel: string;
  cohorts: CohortReceptionView[];
  days: ReleaseDayView[];
};

function factsFrom(
  performance: { totalExposures: number; uniqueListeners: number; engagedListeners: number; repeatListeners: number; fanConversions: number; shares: number },
  cohorts: { slug: string; name: string; exposures: number; uniqueListeners: number; engagedListeners: number; fanConversions: number; shares: number }[],
): ReceptionFacts {
  return {
    totalExposures: performance.totalExposures,
    uniqueListeners: performance.uniqueListeners,
    engagedListeners: performance.engagedListeners,
    repeatListeners: performance.repeatListeners,
    fanConversions: performance.fanConversions,
    shares: performance.shares,
    cohorts,
  };
}

/**
 * How one record is landing.
 *
 * Null when the release has not been simulated: a record that is out and
 * unsimulated has no reception, which is a different statement from a reception
 * of zero and must not be rendered as one.
 */
export async function getReleaseReception(
  db: Database,
  releaseId: string,
): Promise<ReleaseReceptionView | null> {
  const releaseRows = await db.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
  const release = releaseRows[0];
  if (!release || release.status !== "RELEASED" || !release.releasedGameTime) return null;

  const [performanceRows, cohortRows, cohortPerformance, trackRows, history] = await Promise.all([
    db.select().from(releasePerformance).where(eq(releasePerformance.releaseId, releaseId)).limit(1),
    db
      .select()
      .from(audienceCohorts)
      .where(eq(audienceCohorts.worldId, release.worldId))
      .orderBy(asc(audienceCohorts.slug)),
    db
      .select()
      .from(releaseCohortPerformance)
      .where(eq(releaseCohortPerformance.releaseId, releaseId)),
    release.trackId
      ? db.select().from(tracks).where(eq(tracks.id, release.trackId)).limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(receptionTicks)
      .where(eq(receptionTicks.releaseId, releaseId))
      .orderBy(asc(receptionTicks.dayIndex)),
  ]);

  const performance = performanceRows[0];
  if (!performance || history.length === 0) return null;

  const title = trackRows[0]?.title ?? "Untitled";

  const cohorts = cohortRows.map((cohort) => {
    const row = cohortPerformance.find((entry) => entry.cohortId === cohort.id);
    return {
      slug: cohort.slug,
      name: cohort.name,
      exposures: row?.exposures ?? 0,
      uniqueListeners: row?.uniqueListeners ?? 0,
      engagedListeners: row?.engagedListeners ?? 0,
      fanConversions: row?.fanConversions ?? 0,
      shares: row?.shares ?? 0,
    };
  });

  const facts = factsFrom(performance, cohorts);
  const trajectory = classifyTrajectory(facts);

  // Running totals, day by day. The daily figures are arrivals and the sets are
  // disjoint, so this addition is the whole relationship between the two.
  let cumulativeListeners = 0;
  let cumulativeFans = 0;

  const days: ReleaseDayView[] = history.map((tick) => {
    const result = tick.result as ReceptionTickResult;
    const totals = result.totals;

    cumulativeListeners += totals.newListeners;
    cumulativeFans += totals.fanConversions;

    const wordOfMouthExposures = result.cohorts.reduce(
      (sum, cohort) => sum + cohort.wordOfMouthExposures,
      0,
    );

    const beat = classifyDay(
      {
        dayIndex: tick.dayIndex,
        newExposures: totals.newExposures,
        wordOfMouthExposures,
        newListeners: totals.newListeners,
        newRepeatListeners: totals.newRepeatListeners,
        fanConversions: totals.fanConversions,
      },
      facts,
    );

    return {
      dayIndex: tick.dayIndex,
      gameTime: tick.gameTime,
      beat,
      line: DAY_BEAT_LINES[beat],
      newListeners: totals.newListeners,
      fansGained: totals.fanConversions,
      cumulativeListeners,
      cumulativeFans,
    };
  });

  const last = history[history.length - 1]!.result as ReceptionTickResult;
  const momentum = classifyMomentum(last.momentumAfter, last.momentumBefore);

  return {
    releaseId: release.id,
    trackId: release.trackId,
    title,
    releasedGameTime: release.releasedGameTime,
    daysOut: performance.daysSimulated,
    trajectory,
    headline: trajectoryHeadline(trajectory, title),
    detail: trajectoryDetail(trajectory),
    insight: cohortInsight(facts),
    uniqueListeners: performance.uniqueListeners,
    fansGained: performance.fanConversions,
    engagedListeners: performance.engagedListeners,
    returningListeners: performance.repeatListeners,
    momentum,
    momentumLabel: MOMENTUM_LABELS[momentum],
    /*
     * Ordered by who actually carried the record — fans first, then reach.
     * The storage order is alphabetical by slug, which would open this list
     * with whichever audience ignored the record hardest.
     */
    cohorts: cohorts
      .map((cohort) => {
        const response = classifyCohort(cohort, facts);
        return {
          name: cohort.name,
          response,
          responseLabel: COHORT_RESPONSE_LABELS[response],
          uniqueListeners: cohort.uniqueListeners,
          fansGained: cohort.fanConversions,
          shares: cohort.shares,
        };
      })
      .sort(
        (a, b) =>
          b.fansGained - a.fansGained ||
          b.uniqueListeners - a.uniqueListeners ||
          a.name.localeCompare(b.name),
      ),
    days,
  };
}

/* --- Home ----------------------------------------------------------------- */

export type HomeReceptionView = {
  /** The release the player most needs to know about right now. */
  release: ReleaseReceptionView;
  /** True while the record is out but has no simulated day yet. */
  awaitingFirstDay: boolean;
};

/**
 * What Home leads with.
 *
 * The most recent release, because that is the one whose consequences are
 * still arriving. A record that is out and unsimulated still gets a card —
 * "nobody knows what happens next" is the honest state and the invitation to
 * advance a day.
 */
export async function getHomeReception(
  db: Database,
  career: Pick<CareerRow, "id">,
): Promise<HomeReceptionView | null> {
  const releaseRows = await db
    .select()
    .from(releases)
    .where(and(eq(releases.careerId, career.id), eq(releases.status, "RELEASED")))
    .orderBy(desc(releases.releasedGameTime))
    .limit(1);

  const release = releaseRows[0];
  if (!release) return null;

  const view = await getReleaseReception(db, release.id);

  if (!view) {
    const trackRows = release.trackId
      ? await db.select().from(tracks).where(eq(tracks.id, release.trackId)).limit(1)
      : [];
    const title = trackRows[0]?.title ?? "Untitled";

    return {
      awaitingFirstDay: true,
      release: {
        releaseId: release.id,
        trackId: release.trackId,
        title,
        releasedGameTime: release.releasedGameTime!,
        daysOut: 0,
        trajectory: "TOO_EARLY",
        headline: trajectoryHeadline("TOO_EARLY", title),
        detail: trajectoryDetail("TOO_EARLY"),
        insight: null,
        uniqueListeners: 0,
        fansGained: 0,
        engagedListeners: 0,
        returningListeners: 0,
        momentum: "NONE",
        momentumLabel: MOMENTUM_LABELS.NONE,
        cohorts: [],
        days: [],
      },
    };
  }

  return { release: view, awaitingFirstDay: false };
}

/* --- Career pulse --------------------------------------------------------- */

export type PulseMetric = {
  key: "FAME" | "RESPECT" | "HEAT" | "LEGACY";
  label: string;
  /** Where it stands, in words. */
  level: string;
  /** How it moved over the window. */
  movement: MetricMovement;
  movementLabel: string;
};

export type CareerPulseView = {
  /** In-world days the pulse covers. */
  windowDays: number;
  fansGained: number;
  newListeners: number;
  metrics: PulseMetric[];
  /** True when nothing at all moved in the window. */
  quiet: boolean;
};

const PULSE_WINDOW_DAYS = 7;

/**
 * What the last stretch did to the career.
 *
 * The movement is computed from the metric-pressure events inside the window
 * rather than from a stored snapshot: the integer the player sees is the floor
 * of accrued pressure, so subtracting the window's pressure and taking the
 * floor again gives exactly what the number was before — no separate history
 * table, and no chance of the two disagreeing.
 *
 * Legacy is here to be reported as unchanged. That restraint is the point of
 * it, and a pulse that quietly omitted it would lose the statement.
 */
export async function getCareerPulse(
  db: Database,
  career: Pick<CareerRow, "id" | "currentGameDate">,
  options: { windowDays?: number } = {},
): Promise<CareerPulseView> {
  const windowDays = options.windowDays ?? PULSE_WINDOW_DAYS;
  const since = new Date(career.currentGameDate.getTime() - windowDays * DAYS);

  const [careerRows, pressureRows, pressureEvents, ticks] = await Promise.all([
    db.select().from(careers).where(eq(careers.id, career.id)).limit(1),
    db
      .select()
      .from(careerMetricPressure)
      .where(eq(careerMetricPressure.careerId, career.id))
      .limit(1),
    db
      .select()
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.careerId, career.id),
          eq(gameEvents.eventType, GameEventType.ReceptionMetricPressureApplied),
          gte(gameEvents.occurredAt, since),
        ),
      ),
    db
      .select()
      .from(receptionTicks)
      .where(and(eq(receptionTicks.careerId, career.id), gte(receptionTicks.gameTime, since))),
  ]);

  const current = careerRows[0];
  const accrued = pressureRows[0];

  const windowPressure = pressureEvents.reduce(
    (sum, event) => {
      const payload = event.payload as { fame?: number; respect?: number; heat?: number };
      return {
        fame: sum.fame + Number(payload.fame ?? 0),
        respect: sum.respect + Number(payload.respect ?? 0),
        heat: sum.heat + Number(payload.heat ?? 0),
      };
    },
    { fame: 0, respect: 0, heat: 0 },
  );

  const movementOf = (accruedTotal: number, inWindow: number, now: number): MetricMovement => {
    const before = Math.max(0, Math.floor(Math.max(0, accruedTotal - inWindow)));
    return classifyMetricMovement(now - before);
  };

  const fame = current?.fame ?? 0;
  const respect = current?.respect ?? 0;
  const heat = current?.heat ?? 0;
  const legacy = current?.legacy ?? 0;

  const windowTotals = ticks.reduce(
    (sum, tick) => {
      const result = tick.result as ReceptionTickResult;
      return {
        listeners: sum.listeners + (result.totals?.newListeners ?? 0),
        fans: sum.fans + (result.totals?.fanConversions ?? 0),
      };
    },
    { listeners: 0, fans: 0 },
  );

  const metrics: PulseMetric[] = ([
    {
      key: "FAME",
      label: "Fame",
      level: metricLevel("FAME", fame),
      movement: movementOf(accrued?.fameAccrued ?? 0, windowPressure.fame, fame),
      movementLabel: "",
    },
    {
      key: "RESPECT",
      label: "Respect",
      level: metricLevel("RESPECT", respect),
      movement: movementOf(accrued?.respectAccrued ?? 0, windowPressure.respect, respect),
      movementLabel: "",
    },
    {
      key: "HEAT",
      label: "Heat",
      level: metricLevel("HEAT", heat),
      movement: movementOf(accrued?.heatAccrued ?? 0, windowPressure.heat, heat),
      movementLabel: "",
    },
    {
      // Nothing accrues Legacy, so it reports unchanged by construction.
      key: "LEGACY",
      label: "Legacy",
      level: metricLevel("LEGACY", legacy),
      movement: "UNCHANGED",
      movementLabel: "",
    },
  ] satisfies PulseMetric[]).map((metric) => ({
    ...metric,
    movementLabel: METRIC_MOVEMENT_LABELS[metric.movement],
  }));

  return {
    windowDays,
    fansGained: windowTotals.fans,
    newListeners: windowTotals.listeners,
    metrics,
    quiet: windowTotals.listeners === 0 && windowTotals.fans === 0,
  };
}
