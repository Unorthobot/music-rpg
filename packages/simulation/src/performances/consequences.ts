import {
  clamp,
  roundTo,
  type CohortStandingFacts,
  type PerformanceFacts,
} from "@music-rpg/shared";
import {
  FAME_PER_FULL_ROOM,
  HEAT_PER_FULL_ROOM,
  HEAT_WORD_SHARE,
  RESPECT_PER_FULL_ROOM,
  ROOM_AFFINITY_PER_ATTENDEE,
  ROOM_AFFINITY_WON_OVER_MULTIPLIER,
  ROOM_FAN_SHARE,
  STANDING_ROOM_FULL,
} from "./constants";

/**
 * What a night did, priced from what the night was.
 *
 * Pure, like the resolver: these take the three recorded facts and produce the
 * movement, decomposed. Nothing here reads a database, a clock or a random
 * number, and nothing here knows what a night might later be worth to anything
 * downstream.
 */

/* --- Standing --------------------------------------------------------------- */

export type StandingContribution = {
  metric: "fame" | "respect" | "heat";
  /** The recorded fact this movement is grounded in. */
  from: "attendance" | "wonOver" | "wordLeftTheRoom";
  input: number;
  weight: number;
  contribution: number;
  note: string;
};

export type PerformanceStandingPressure = {
  fame: number;
  respect: number;
  heat: number;
  contributions: StandingContribution[];
  /**
   * The denominator every term above is a share of.
   *
   * Recorded because the proportionality rule is an invariant rather than a
   * preference, and an inspector should be able to see the number it was
   * applied against without re-deriving it.
   */
  roomShare: number;
};

/**
 * Fame, Respect and Heat, bounded by how many people were actually there.
 *
 * > **A night's standing movement is bounded by `attendance`, never by
 * > `capacity` and never by anything else.**
 *
 * That is the whole rule, and it is why `capacity` does not appear in this
 * function at all. Eighty people in a basement move a career less than three
 * hundred in Soweto, and a headline slot played to a half-empty room moves it
 * like a half-empty room — a promoter's optimism about their own venue is not
 * a fact about the artist.
 *
 * **Legacy is absent and unreachable.** There is no term producing one, no
 * accrual column for it to arrive through, and the same discipline has held
 * since M5.
 */
export function performanceStandingPressure(
  facts: PerformanceFacts,
): PerformanceStandingPressure {
  // Attendance, never capacity. This is the invariant, in one line.
  const roomShare = clamp(facts.attendance / STANDING_ROOM_FULL, 0, 1);
  const wonShare = facts.attendance > 0 ? facts.wonOver / facts.attendance : 0;
  const wordShare = clamp(facts.wordLeftTheRoom / STANDING_ROOM_FULL, 0, 1);

  const contributions: StandingContribution[] = [
    {
      metric: "fame",
      from: "attendance",
      input: roundTo(roomShare, 4),
      weight: FAME_PER_FULL_ROOM,
      contribution: roundTo(roomShare * FAME_PER_FULL_ROOM, 4),
      note: "Fame moves least: one night is not a broadcast.",
    },
    {
      metric: "respect",
      from: "wonOver",
      input: roundTo(roomShare * wonShare, 4),
      weight: RESPECT_PER_FULL_ROOM,
      contribution: roundTo(roomShare * wonShare * RESPECT_PER_FULL_ROOM, 4),
      note: "Respect is what a room that was actually won over gives you.",
    },
    {
      metric: "heat",
      from: "attendance",
      input: roundTo(roomShare, 4),
      weight: HEAT_PER_FULL_ROOM,
      contribution: roundTo(roomShare * HEAT_PER_FULL_ROOM, 4),
      note: "Heat is velocity, and a live room is exactly what should spike it.",
    },
    {
      metric: "heat",
      from: "wordLeftTheRoom",
      input: roundTo(wordShare, 4),
      weight: HEAT_WORD_SHARE,
      contribution: roundTo(wordShare * HEAT_WORD_SHARE, 4),
      note: "Word leaving the room is how a night outruns its own attendance.",
    },
  ];

  const sum = (metric: StandingContribution["metric"]) =>
    roundTo(
      contributions
        .filter((entry) => entry.metric === metric)
        .reduce((running, entry) => running + entry.contribution, 0),
      4,
    );

  return {
    fame: sum("fame"),
    respect: sum("respect"),
    heat: sum("heat"),
    contributions,
    roomShare: roundTo(roomShare, 4),
  };
}

/* --- The room, cohort by cohort --------------------------------------------- */

export type CohortRoomShare = {
  cohortSlug: string;
  cohortName: string;
  cohortSize: number;
  /** How concentrated that cohort is in this scene, 0–1. */
  sceneWeight: number;
  /** People from this cohort who were in the room. */
  attendees: number;
  /** Of those, how many left caring more. */
  wonOver: number;
  /** New fans, a bounded fraction of the cohort's won-over. */
  newFans: number;
  /** Warmth gained, on M5's own 0–1000 scale. */
  affinityGain: number;
};

export type RoomDistribution = {
  shares: CohortRoomShare[];
  /**
   * Everybody a night touched, across every cohort.
   *
   * Asserted rather than assumed: this can never exceed `attendance`, which can
   * never exceed the room's capacity. The allocation below guarantees it by
   * construction rather than by clamping afterwards.
   */
  totalAffected: number;
};

/**
 * Who was in the room, cohort by cohort.
 *
 * > **A night may never affect more people than were in the room.** Not more
 * > than the room's capacity, not more than `attendance`, not ever, under any
 * > composition of effects.
 *
 * `attendance` is distributed across M5's cohorts by each cohort's own recorded
 * `scene_affinity` for that scene — the same concentration weighting
 * `sceneStanding()` already uses, so the people in a Braamfontein room are the
 * people who are actually in Braamfontein. Nothing here invents a population.
 *
 * **Largest-remainder allocation, deterministically.** Integers are handed out
 * by whole share first and the remainder by largest fractional part, ties broken
 * on the cohort slug so the same night always fills the same way. The running
 * total is capped as it goes, which is what makes the invariant structural: the
 * sum cannot exceed `attendance` even by a rounding error, because there is
 * never a point at which more than `attendance` has been handed out.
 */
export function distributeRoom(input: {
  facts: PerformanceFacts;
  sceneSlug: string;
  cohorts: CohortStandingFacts[];
}): RoomDistribution {
  const weighted = input.cohorts
    .map((cohort) => ({
      cohort,
      // A cohort that is not in this scene was not in this room.
      weight: cohort.sceneAffinity[input.sceneSlug] ?? 0,
    }))
    .filter((entry) => entry.weight > 0 && entry.cohort.size > 0)
    .sort((a, b) => a.cohort.slug.localeCompare(b.cohort.slug));

  const totalWeight = weighted.reduce((running, entry) => running + entry.weight, 0);

  if (weighted.length === 0 || totalWeight <= 0) {
    return { shares: [], totalAffected: 0 };
  }

  const attendees = allocate(
    input.facts.attendance,
    weighted.map((entry) => ({
      key: entry.cohort.slug,
      share: entry.weight / totalWeight,
      // Nobody can send more people than they have.
      cap: entry.cohort.size,
    })),
  );

  /*
   * Who was won over, allocated across the same cohorts in proportion to who
   * actually turned up rather than to who lives in the scene. A cohort that
   * sent nobody cannot have been won over.
   */
  const attendedTotal = weighted.reduce(
    (running, entry) => running + (attendees.get(entry.cohort.slug) ?? 0),
    0,
  );

  const wonOver = allocate(
    Math.min(input.facts.wonOver, attendedTotal),
    weighted.map((entry) => {
      const here = attendees.get(entry.cohort.slug) ?? 0;
      return {
        key: entry.cohort.slug,
        share: attendedTotal > 0 ? here / attendedTotal : 0,
        cap: here,
      };
    }),
  );

  const shares: CohortRoomShare[] = weighted.map((entry) => {
    const here = attendees.get(entry.cohort.slug) ?? 0;
    const won = wonOver.get(entry.cohort.slug) ?? 0;

    return {
      cohortSlug: entry.cohort.slug,
      cohortName: entry.cohort.name,
      cohortSize: entry.cohort.size,
      sceneWeight: roundTo(entry.weight, 4),
      attendees: here,
      wonOver: won,
      // A room can make a handful of fans. It cannot make a thousand.
      newFans: Math.min(Math.floor(won * ROOM_FAN_SHARE), won),
      /*
       * Being in the room is a stronger encounter than hearing a track, and
       * there are three orders of magnitude fewer people in it — so this is
       * large per head and negligible in total, which is the shape a night
       * should have against a cohort of ninety-four thousand.
       */
      affinityGain: roundTo(
        ROOM_AFFINITY_PER_ATTENDEE *
          (here + won * (ROOM_AFFINITY_WON_OVER_MULTIPLIER - 1)),
        6,
      ),
    };
  });

  return {
    shares,
    totalAffected: shares.reduce((running, entry) => running + entry.attendees, 0),
  };
}

/**
 * Hand out `total` whole people across weighted buckets, never exceeding it.
 *
 * Whole shares first, remainder by largest fractional part, ties on the key so
 * the allocation is reproducible. Each bucket has its own cap, and the running
 * total is checked before every increment — so the sum is exactly
 * `min(total, sum of caps)` and can never drift above `total` through rounding.
 */
function allocate(
  total: number,
  buckets: { key: string; share: number; cap: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (total <= 0) {
    for (const bucket of buckets) out.set(bucket.key, 0);
    return out;
  }

  let handed = 0;

  const remainders = buckets.map((bucket) => {
    const exact = total * bucket.share;
    const whole = Math.min(Math.floor(exact), bucket.cap);
    out.set(bucket.key, whole);
    handed += whole;
    return { key: bucket.key, cap: bucket.cap, remainder: exact - Math.floor(exact) };
  });

  remainders.sort(
    (a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key),
  );

  for (const entry of remainders) {
    if (handed >= total) break;
    const current = out.get(entry.key) ?? 0;
    if (current >= entry.cap) continue;
    out.set(entry.key, current + 1);
    handed += 1;
  }

  return out;
}
