import { clamp } from "@music-rpg/shared";

/**
 * Reading the simulation out loud.
 *
 * Facts first, narrative second — this is the second part, and it is still not
 * narrative. Every function here is a deterministic classification of numbers
 * the simulator already produced: same facts, same words, every time. Nothing
 * generates prose, nothing calls a model, and nothing here can change an
 * outcome. If the phrase says a record is finding its people, it is because the
 * cohort that engaged out of proportion to its exposure also produced most of
 * the fans.
 *
 * The other half of its job is a boundary. Fit, artist fit, quality fit,
 * engagement bias, share amplification, metric-pressure decimals, raw momentum,
 * the seed and the simulator version are all inputs *to* these functions and
 * none of them comes out the other side. What comes out is what happened and
 * what it means: outcomes and patterns, never the machinery.
 */

/* --- What is happening to a record ---------------------------------------- */

export const RECEPTION_TRAJECTORIES = [
  /** Out, but nothing has come back yet. */
  "TOO_EARLY",
  /** One audience took it up out of proportion, and kept it. */
  "FINDING_ITS_PEOPLE",
  /** Sharing is carrying it into rooms it did not start in. */
  "TRAVELLING",
  /** The people who heard it keep returning to it. */
  "COMING_BACK",
  /** One audience is strongly for it while another is strongly not. */
  "DIVIDING",
  /** Plenty of people heard it. Almost nobody stayed. */
  "PASSED_OVER",
  /** Barely anything moved at all. */
  "QUIET",
  /** Moving, without a shape yet. */
  "STEADY",
] as const;
export type ReceptionTrajectory = (typeof RECEPTION_TRAJECTORIES)[number];

/** A cohort's own answer, as a phrase rather than a rate. */
export const COHORT_RESPONSES = [
  "UNREACHED",
  "STRONG",
  "WARM",
  "WEAK",
  "INDIFFERENT",
  "SMALL_REACH_HIGH_SHARING",
] as const;
export type CohortResponse = (typeof COHORT_RESPONSES)[number];

export const COHORT_RESPONSE_LABELS: Record<CohortResponse, string> = {
  UNREACHED: "Hasn't reached them",
  STRONG: "Strong response",
  WARM: "Warm response",
  WEAK: "Weak response",
  INDIFFERENT: "Barely registered",
  SMALL_REACH_HIGH_SHARING: "Small reach, high sharing",
};

/** What a single day of a record's life was. */
export const DAY_BEATS = [
  "DISCOVERED",
  "PASSED_AROUND",
  "COMING_BACK",
  "PATTERN",
  "STEADY",
  "QUIET",
] as const;
export type DayBeat = (typeof DAY_BEATS)[number];

export const DAY_BEAT_LINES: Record<DayBeat, string> = {
  DISCOVERED: "People are starting to find it.",
  PASSED_AROUND: "It's being passed around.",
  COMING_BACK: "People are coming back to it.",
  PATTERN: "The first pattern is emerging.",
  STEADY: "It's still moving.",
  QUIET: "Nothing moved.",
};

/** Momentum as a state. The number behind it is never shown. */
export const MOMENTUM_STATES = ["NONE", "FADING", "HOLDING", "BUILDING", "SURGING"] as const;
export type MomentumState = (typeof MOMENTUM_STATES)[number];

export const MOMENTUM_LABELS: Record<MomentumState, string> = {
  NONE: "Nothing moving",
  FADING: "Fading",
  HOLDING: "Holding steady",
  BUILDING: "Still building",
  SURGING: "Picking up fast",
};

/* --- Thresholds ----------------------------------------------------------- */

/** Below this share of listeners engaging, a record was heard and dismissed. */
const PASSED_OVER_ENGAGEMENT = 0.2;
const PASSED_OVER_CONVERSION = 0.05;
/**
 * How far a cohort must engage beyond its share of exposure to count as *its*
 * record.
 *
 * Engagement proportional to reach puts every cohort at 1.0, so this is "a
 * quarter more engagement than the reach predicted". Set with a wide margin
 * above 1.0 on purpose: a phrase that flips because the jitter went the other
 * way is describing the seed rather than the record.
 */
const LEADING_COHORT_INDEX = 1.25;
/** A cohort responding this much harder than another is a visible difference. */
const CLEAR_LEAD_RATIO = 1.8;
const SOME_LEAD_RATIO = 1.3;
/** Enough people to compare cohorts honestly. */
const COMPARABLE_LISTENERS = 5;
/** Sharing this heavy alongside a split response means people are arguing. */
const DIVIDING_SHARES_PER_ENGAGED = 0.45;
/** Word of mouth carrying this share of a day's exposure is the story of the day. */
const PASSED_AROUND_SHARE = 0.15;
/** Returners at this share of new arrivals mean it stuck. */
const COMING_BACK_DAY_SHARE = 0.3;
const COMING_BACK_TOTAL_SHARE = 0.25;
/** Fewer listeners than this and the honest word is "quiet". */
const QUIET_LISTENERS = 20;
/** A cohort reaching this little next to the biggest one has small reach. */
const SMALL_REACH_SHARE = 0.4;
const HIGH_SHARING_PER_ENGAGED = 0.5;
const STRONG_ENGAGEMENT = 0.45;
const WARM_ENGAGEMENT = 0.3;
const WEAK_ENGAGEMENT = 0.15;

/* --- Inputs --------------------------------------------------------------- */

export type CohortFacts = {
  slug: string;
  /** Display name as the world seeded it, e.g. "Scene heads". */
  name: string;
  exposures: number;
  uniqueListeners: number;
  engagedListeners: number;
  fanConversions: number;
  shares: number;
};

export type ReceptionFacts = {
  totalExposures: number;
  uniqueListeners: number;
  engagedListeners: number;
  repeatListeners: number;
  fanConversions: number;
  shares: number;
  cohorts: CohortFacts[];
};

const rate = (part: number, whole: number): number => (whole > 0 ? part / whole : 0);

/* --- Cohorts -------------------------------------------------------------- */

export function classifyCohort(cohort: CohortFacts, facts: ReceptionFacts): CohortResponse {
  if (cohort.uniqueListeners === 0) return "UNREACHED";

  const engagement = rate(cohort.engagedListeners, cohort.uniqueListeners);
  const sharing = rate(cohort.shares, cohort.engagedListeners);
  const largest = Math.max(...facts.cohorts.map((entry) => entry.uniqueListeners), 1);

  // Few people, but the few who heard it told everyone. This is what a
  // tastemaker response looks like, and calling it "weak reach" would miss it.
  if (
    cohort.uniqueListeners <= largest * SMALL_REACH_SHARE &&
    sharing >= HIGH_SHARING_PER_ENGAGED
  ) {
    return "SMALL_REACH_HIGH_SHARING";
  }

  if (engagement >= STRONG_ENGAGEMENT) return "STRONG";
  if (engagement >= WARM_ENGAGEMENT) return "WARM";
  if (engagement >= WEAK_ENGAGEMENT) return "WEAK";
  return "INDIFFERENT";
}

/** Cohorts with enough listeners that comparing them says something. */
function comparable(facts: ReceptionFacts): CohortFacts[] {
  return facts.cohorts.filter((cohort) => cohort.uniqueListeners >= COMPARABLE_LISTENERS);
}

function byEngagement(cohorts: CohortFacts[]): CohortFacts[] {
  return [...cohorts].sort(
    (a, b) =>
      rate(b.engagedListeners, b.uniqueListeners) - rate(a.engagedListeners, a.uniqueListeners),
  );
}

/**
 * The one line worth saying about who is responding.
 *
 * Null when the cohorts are not far enough apart to claim a difference — an
 * insight that is true of every record is not an insight.
 */
export function cohortInsight(facts: ReceptionFacts): string | null {
  const candidates = comparable(facts);
  if (candidates.length < 2) return null;

  /*
   * The leader is the audience carrying the record, not the one with the
   * showiest ratio. Ranking on rate alone lets a ten-person cohort beat a
   * thirty-five-person one on a single extra engaged listener, and the sentence
   * then changes who it is about from one run to the next while the record
   * underneath it has not moved at all.
   */
  const leader = leadingCohort(facts) ?? byEngagement(candidates)[0]!;

  // The contrast worth drawing is the audience that had real reach and did not
  // take it — weakest response first, and among equals the biggest room.
  const laggard = candidates
    .filter((cohort) => cohort.slug !== leader.slug)
    .sort(
      (a, b) =>
        rate(a.engagedListeners, a.uniqueListeners) -
          rate(b.engagedListeners, b.uniqueListeners) ||
        b.uniqueListeners - a.uniqueListeners,
    )[0];

  if (!laggard) return null;

  const leadRate = rate(leader.engagedListeners, leader.uniqueListeners);
  const lagRate = rate(laggard.engagedListeners, laggard.uniqueListeners);
  if (leadRate <= lagRate) return null;
  if (lagRate <= 0) {
    return `${leader.name} are responding. ${lowerFirst(laggard.name)} aren't.`;
  }

  const ratio = leadRate / lagRate;
  if (ratio >= CLEAR_LEAD_RATIO) {
    return `${leader.name} are responding much more strongly than ${lowerFirst(laggard.name)}.`;
  }
  if (ratio >= SOME_LEAD_RATIO) {
    return `${leader.name} are responding more strongly than ${lowerFirst(laggard.name)}.`;
  }
  return null;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/** Whether one audience has separated from the others enough to name. */
export function hasClearLeadingCohort(facts: ReceptionFacts): boolean {
  const ranked = byEngagement(comparable(facts));
  if (ranked.length < 2) return false;

  const leadRate = rate(ranked[0]!.engagedListeners, ranked[0]!.uniqueListeners);
  const lagRate = rate(
    ranked[ranked.length - 1]!.engagedListeners,
    ranked[ranked.length - 1]!.uniqueListeners,
  );

  return lagRate <= 0 ? leadRate > 0 : leadRate / lagRate >= CLEAR_LEAD_RATIO;
}

/**
 * The cohort a record belongs to, if it has found one.
 *
 * Two conditions, and the order they are applied in matters. First, which
 * audiences engaged beyond their share of the reach — that is what "its people"
 * means, and a cohort can only qualify by punching above the exposure it got.
 * Then, among those, the one actually carrying the record: the one keeping the
 * people, with depth of engagement as the tie-break.
 *
 * Ranking by the index alone would hand this to the smallest audience in the
 * world every time. Tastemakers are four hundred people against ninety-four
 * thousand, so a handful of them engaging out-indexes everybody — while the
 * scene quietly takes every fan the record earned.
 */
function leadingCohort(facts: ReceptionFacts): CohortFacts | null {
  if (facts.engagedListeners === 0 || facts.totalExposures === 0) return null;

  const punchingAbove = facts.cohorts
    .map((cohort) => {
      const exposureShare = rate(cohort.exposures, facts.totalExposures);
      if (exposureShare <= 0) return null;
      const engagedShare = rate(cohort.engagedListeners, facts.engagedListeners);
      return { cohort, index: engagedShare / exposureShare };
    })
    .filter(
      (entry): entry is { cohort: CohortFacts; index: number } =>
        entry !== null && entry.index >= LEADING_COHORT_INDEX,
    );

  if (punchingAbove.length === 0) return null;

  punchingAbove.sort(
    (a, b) =>
      b.cohort.fanConversions - a.cohort.fanConversions ||
      b.cohort.engagedListeners - a.cohort.engagedListeners,
  );

  return punchingAbove[0]!.cohort;
}

/* --- The record's trajectory ---------------------------------------------- */

export function classifyTrajectory(facts: ReceptionFacts): ReceptionTrajectory {
  if (facts.uniqueListeners === 0) return "TOO_EARLY";

  const engagement = rate(facts.engagedListeners, facts.uniqueListeners);
  const conversion = rate(facts.fanConversions, facts.engagedListeners);
  const sharing = rate(facts.shares, facts.engagedListeners);
  const returning = rate(facts.repeatListeners, facts.uniqueListeners);
  const leader = leadingCohort(facts);

  // Heard and dismissed. Checked first: nothing else is worth saying about a
  // record nobody engaged with.
  if (engagement < PASSED_OVER_ENGAGEMENT && conversion < PASSED_OVER_CONVERSION) {
    return "PASSED_OVER";
  }

  // Strongly for it in one room, strongly against it in another, and enough
  // talking to suggest people are arguing about which.
  if (leader && sharing >= DIVIDING_SHARES_PER_ENGAGED && hasClearLeadingCohort(facts)) {
    return "DIVIDING";
  }

  // Its people: engaged out of proportion, and kept most of the fans.
  if (leader && leader.fanConversions * 2 >= facts.fanConversions && facts.fanConversions > 0) {
    return "FINDING_ITS_PEOPLE";
  }

  if (sharing >= DIVIDING_SHARES_PER_ENGAGED) return "TRAVELLING";
  if (returning >= COMING_BACK_TOTAL_SHARE) return "COMING_BACK";
  if (facts.uniqueListeners < QUIET_LISTENERS) return "QUIET";
  return "STEADY";
}

const TRAJECTORY_HEADLINES: Record<ReceptionTrajectory, (title: string) => string> = {
  TOO_EARLY: (title) => `${title} is out. Nobody knows what happens next.`,
  FINDING_ITS_PEOPLE: (title) => `${title} is finding its people.`,
  TRAVELLING: (title) => `${title} is travelling.`,
  COMING_BACK: (title) => `People keep coming back to ${title}.`,
  DIVIDING: (title) => `${title} is dividing people.`,
  PASSED_OVER: (title) => `People are finding ${title}. Most aren't staying.`,
  QUIET: (title) => `${title} is out. Very little is moving.`,
  STEADY: (title) => `${title} is out and moving.`,
};

const TRAJECTORY_DETAILS: Record<ReceptionTrajectory, string> = {
  TOO_EARLY: "Nothing has come back yet.",
  FINDING_ITS_PEOPLE: "One audience has taken it up, and they're staying.",
  TRAVELLING: "People who heard it are putting it in front of people who haven't.",
  COMING_BACK: "The people who heard it are returning to it.",
  DIVIDING: "One audience is well in on it. Another isn't, at all.",
  PASSED_OVER: "The reach is there. The response isn't.",
  QUIET: "Almost nobody has come across it.",
  STEADY: "It's being heard, without a clear shape to it yet.",
};

export function trajectoryHeadline(trajectory: ReceptionTrajectory, title: string): string {
  return TRAJECTORY_HEADLINES[trajectory](title);
}

export function trajectoryDetail(trajectory: ReceptionTrajectory): string {
  return TRAJECTORY_DETAILS[trajectory];
}

/* --- A single day --------------------------------------------------------- */

export type DayFacts = {
  dayIndex: number;
  newExposures: number;
  wordOfMouthExposures: number;
  newListeners: number;
  newRepeatListeners: number;
  fanConversions: number;
};

/**
 * What a day was, in the order the answers matter.
 *
 * The first day is always discovery — nobody could have passed it on yet. After
 * that the day is named by whatever actually dominated it, and once there is
 * enough history for a shape, the shape is the news.
 */
export function classifyDay(day: DayFacts, facts: ReceptionFacts): DayBeat {
  if (day.newListeners === 0 && day.newExposures === 0) return "QUIET";
  if (day.dayIndex === 1) return "DISCOVERED";
  if (day.dayIndex >= 3 && hasClearLeadingCohort(facts)) return "PATTERN";
  if (day.newRepeatListeners >= day.newListeners * COMING_BACK_DAY_SHARE) return "COMING_BACK";
  if (day.wordOfMouthExposures >= day.newExposures * PASSED_AROUND_SHARE) return "PASSED_AROUND";
  return "STEADY";
}

/* --- Momentum ------------------------------------------------------------- */

/** Momentum as a direction. The 0–100 figure behind it stays internal. */
export function classifyMomentum(current: number, previous: number): MomentumState {
  if (current <= 0.5) return "NONE";
  if (previous <= 0.5) return "BUILDING";

  const change = current / previous;
  if (change >= 1.5) return "SURGING";
  if (change >= 1.15) return "BUILDING";
  if (change <= 0.85) return "FADING";
  return "HOLDING";
}

/* --- Career metrics ------------------------------------------------------- */

export const METRIC_MOVEMENTS = ["UNCHANGED", "EMERGING", "RISING", "CLIMBING"] as const;
export type MetricMovement = (typeof METRIC_MOVEMENTS)[number];

export const METRIC_MOVEMENT_LABELS: Record<MetricMovement, string> = {
  UNCHANGED: "Unchanged",
  EMERGING: "Emerging",
  RISING: "Rising",
  CLIMBING: "Climbing",
};

/**
 * How a metric moved over a period.
 *
 * First blood is its own word: nought to one is a different event from four to
 * five, and calling both "rising" would waste the only moment Fame ever becomes
 * a thing that exists.
 */
export function classifyMetricMovement(delta: number): MetricMovement {
  if (delta <= 0) return "UNCHANGED";
  if (delta <= 1) return "EMERGING";
  if (delta < 8) return "RISING";
  return "CLIMBING";
}

const LEVEL_BANDS: Record<"FAME" | "RESPECT" | "HEAT" | "LEGACY", [number, string][]> = {
  // Ordered ascending; the last band whose floor is met wins.
  FAME: [
    [0, "Unknown"],
    [1, "Emerging"],
    [10, "Known locally"],
    [25, "Widely known"],
    [50, "Famous"],
    [75, "Household name"],
  ],
  RESPECT: [
    [0, "Unearned"],
    [1, "Noticed"],
    [10, "Taken seriously"],
    [25, "Respected"],
    [50, "Revered"],
    [75, "Untouchable"],
  ],
  HEAT: [
    [0, "Cold"],
    [1, "Flickering"],
    [10, "Warm"],
    [25, "Hot"],
    [50, "On fire"],
  ],
  LEGACY: [
    [0, "Not written"],
    [1, "Beginning"],
    [25, "Substantial"],
    [50, "Lasting"],
    [75, "Permanent"],
  ],
};

/** What a metric's current value means, in words, without the number. */
export function metricLevel(metric: keyof typeof LEVEL_BANDS, value: number): string {
  const bands = LEVEL_BANDS[metric];
  const level = clamp(value, 0, 100);
  let label = bands[0]![1];
  for (const [floor, name] of bands) {
    if (level >= floor) label = name;
  }
  return label;
}
