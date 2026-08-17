import { and, asc, eq, inArray } from "drizzle-orm";
import {
  artistAudience,
  artists,
  audienceCohorts,
  careerProgressionObservations,
  careers,
  characters,
  crewMembers,
  gameEvents,
  groups,
  relationshipMoments,
  relationships,
  releasePerformance,
  releases,
  type CareerProgressionObservationRow,
  type CareerRow,
} from "@music-rpg/database";
import { GameEventType, recordEvent } from "@music-rpg/events";
import { decidePhase } from "@music-rpg/simulation";
import {
  PROGRESSION_EVALUATOR_VERSION,
  SCENE_WITNESSED_EVENT_TYPES,
  ok,
  type CohortStandingFacts,
  type EvidenceFacts,
  type MomentKind,
  type PersonReturnFacts,
  type PhaseDecision,
  type ProgressionObservation,
  type ReleaseReceptionFacts,
  type Result,
  type SceneStandardFacts,
  type WitnessedFacts,
} from "@music-rpg/shared";
import type { CommandContext } from "../context";
import type { DomainError } from "../errors";
import { loadOwnedCareer } from "../internal/career";

/**
 * When a career stops being Underground.
 *
 * This file orchestrates; it does not decide. Every judgement is made by the
 * pure evaluator in `@music-rpg/simulation`, and everything here is about
 * reading the canonical projections the other systems own, writing the
 * progression observation and — on the one day it happens — the transition and
 * the event that explains it, inside one transaction.
 *
 * Three rules bound the whole thing, and they are M7's three with a phase in
 * place of an offer.
 *
 * 1. **Time concludes, screens reveal.** A phase changes because a day passed.
 *    Nothing in a render path may call this. A player who opens Home ten times
 *    before letting a day pass is in the same act ten times.
 * 2. **Consume the projections; do not rebuild them.** Fans and reception are
 *    read from `artist_audience` and `release_performance`, relationships from
 *    `relationships`, open moments from `relationship_moments`, crew from
 *    `crew_members`, the public record from `game_events`, and scene standing
 *    from M7's own `sceneStanding` — *called*, never reimplemented. Nothing here
 *    re-simulates a record, re-derives a relationship, re-detects a moment or
 *    re-ranks an opportunity.
 * 3. **The transition is a fact about the world from now on.** It is never a new
 *    lens over what already happened. No row written before it is touched by it:
 *    a record that reached people as an Underground record reached them as one,
 *    and the new act applies from the next simulation boundary onward.
 */

/* ------------------------------------------------------------------ reading */

/**
 * The bars the world seeded, read off the promoters who hold them.
 *
 * Read from `characters.preferences` rather than from the seed module, so the
 * evaluator sees the standards *this world* actually has. A world whose
 * promoters were edited is a world whose scene bar moved, and the phase model
 * should follow it rather than a constant compiled in beside it.
 */
function sceneStandardsOf(characterRows: { slug: string; name: string; preferences: unknown }[]) {
  const standards: SceneStandardFacts[] = [];

  for (const row of characterRows) {
    const profile = (row.preferences as { promoter?: Record<string, unknown> } | null)?.promoter;
    if (!profile) continue;

    standards.push({
      sceneSlug: String(profile.sceneSlug ?? ""),
      promoterSlug: row.slug,
      promoterName: row.name,
      nightName: String(profile.nightName ?? ""),
      standard: Number(profile.standard ?? 0),
      supportStandard: Number(profile.supportStandard ?? 0),
    });
  }

  // Stable ordering on a recorded key, so two evaluations of one world agree.
  return standards.sort((a, b) => a.promoterSlug.localeCompare(b.promoterSlug));
}

/**
 * Everything the phase model is allowed to know, gathered from the systems that
 * own it.
 *
 * Deliberately one function, for `loadDirectorFacts`' reason: an evaluator that
 * reached for a table mid-decision could not be tested without a database and,
 * worse, could not be *shown* to have consumed only recorded facts.
 */
export async function loadEvidenceFacts(
  ctx: CommandContext,
  career: CareerRow,
): Promise<EvidenceFacts> {
  const [
    cohortRows,
    audienceRows,
    releaseRows,
    performanceRows,
    characterRows,
    relationshipRows,
    momentRows,
    crewRows,
    witnessedRows,
  ] = await Promise.all([
    ctx.db
      .select()
      .from(audienceCohorts)
      .where(eq(audienceCohorts.worldId, career.worldId))
      .orderBy(asc(audienceCohorts.slug)),
    ctx.db.select().from(artistAudience).where(eq(artistAudience.careerId, career.id)),
    ctx.db
      .select()
      .from(releases)
      .where(and(eq(releases.careerId, career.id), eq(releases.status, "RELEASED")))
      .orderBy(asc(releases.releasedGameTime)),
    ctx.db.select().from(releasePerformance).where(eq(releasePerformance.careerId, career.id)),
    ctx.db
      .select()
      .from(characters)
      .where(eq(characters.worldId, career.worldId))
      .orderBy(asc(characters.slug)),
    ctx.db.select().from(relationships).where(eq(relationships.careerId, career.id)),
    ctx.db
      .select()
      /*
       * Every moment, at every status. PEER asks whether somebody ever decided
       * they wanted more, which is a historical fact; the open subset is
       * derived below and kept only for explanation.
       */
      .from(relationshipMoments)
      .where(eq(relationshipMoments.careerId, career.id)),
    ctx.db.select().from(crewMembers).where(eq(crewMembers.careerId, career.id)),
    /*
     * The public record, through the existing `(career_id)` and `(event_type)`
     * indexes and filtered to the allow-list in SQL rather than in memory. This
     * is what keeps a four-hundred-day career evaluable in the time a four-day
     * one takes: the evaluator reads counts, never the log replayed.
     */
    ctx.db
      .select({ eventType: gameEvents.eventType })
      .from(gameEvents)
      .where(
        and(
          eq(gameEvents.careerId, career.id),
          inArray(gameEvents.eventType, [...SCENE_WITNESSED_EVENT_TYPES]),
        ),
      ),
  ]);

  const cohorts: CohortStandingFacts[] = cohortRows.map((cohort) => {
    const audience = audienceRows.find((row) => row.cohortId === cohort.id);
    // A cohort this artist has never reached has no row, which is zero rather
    // than missing: the audience is there and has not heard of you.
    return {
      slug: cohort.slug,
      name: cohort.name,
      size: cohort.size,
      fans: audience?.fans ?? 0,
      affinity: audience?.affinity ?? 0,
      priorExposure: audience?.priorExposure ?? 0,
      sceneAffinity: cohort.sceneAffinity,
    };
  });

  const performanceFor = (releaseId: string) =>
    performanceRows.find((row) => row.releaseId === releaseId);

  /*
   * Releases that have actually been simulated. A record published today has a
   * performance row full of zeroes, and counting it as a record that failed to
   * land would be reading the future.
   */
  const releaseFacts: ReleaseReceptionFacts[] = releaseRows
    .map((release) => {
      const performance = performanceFor(release.id);
      return {
        releaseId: release.id,
        daysSimulated: performance?.daysSimulated ?? 0,
        uniqueListeners: performance?.uniqueListeners ?? 0,
        engagedListeners: performance?.engagedListeners ?? 0,
        repeatListeners: performance?.repeatListeners ?? 0,
        fanConversions: performance?.fanConversions ?? 0,
      };
    })
    .filter((release) => release.daysSimulated > 0);

  const crewIds = new Set(
    crewRows.filter((row) => row.status === "ACTIVE").map((row) => row.subjectId),
  );

  /**
   * Every moment kind this person ever raised, and the still-open subset.
   *
   * Deduplicated, so a producer who has asked to get back in the room three
   * times is one person who came back rather than three — PEER asks whether
   * anybody decided, never how often.
   */
  const everMomentsFor = (subjectId: string): MomentKind[] => [
    ...new Set(momentRows.filter((row) => row.subjectId === subjectId).map((row) => row.kind)),
  ];

  const openMomentsFor = (subjectId: string): MomentKind[] => [
    ...new Set(
      momentRows
        .filter((row) => row.subjectId === subjectId && row.status === "OPEN")
        .map((row) => row.kind),
    ),
  ];

  /*
   * Only people this career has actually met. Somebody the career has never
   * worked with has no relationship row, which is a correct state rather than a
   * missing one — and a person with nothing between them and the career cannot
   * have decided they want more.
   */
  const people: PersonReturnFacts[] = characterRows.flatMap((character) => {
    const relationship = relationshipRows.find((row) => row.subjectId === character.id);
    if (!relationship) return [];

    return [
      {
        characterId: character.id,
        name: character.name,
        role: character.role,
        respect: relationship.respect,
        creativeChemistry: relationship.creativeChemistry,
        interactionCount: relationship.interactionCount,
        openMomentKinds: openMomentsFor(character.id),
        returnedMomentKinds: everMomentsFor(character.id),
        isCrew: crewIds.has(character.id),
      },
    ];
  });

  const witnessed: WitnessedFacts[] = SCENE_WITNESSED_EVENT_TYPES.map((eventType) => ({
    eventType,
    count: witnessedRows.filter((row) => row.eventType === eventType).length,
  }));

  return {
    careerId: career.id,
    worldId: career.worldId,
    currentGameTime: career.currentGameDate,
    careerAct: career.careerAct,
    cohorts,
    sceneStandards: sceneStandardsOf(characterRows),
    releases: releaseFacts,
    people,
    witnessed,
  };
}

/* --- The observation, in both directions ---------------------------------- */

function observationFromRow(
  careerId: string,
  row: CareerProgressionObservationRow | undefined,
): ProgressionObservation {
  if (!row) {
    return {
      careerId,
      domainFirstReached: {},
      lastEvaluatedGameTime: null,
      evaluatorVersion: PROGRESSION_EVALUATOR_VERSION,
    };
  }

  return {
    careerId,
    domainFirstReached: {
      RECEPTION: row.receptionFirstReachedGameTime,
      PEER: row.peerFirstReachedGameTime,
      PUBLIC_RECORD: row.publicRecordFirstReachedGameTime,
    },
    lastEvaluatedGameTime: row.lastEvaluatedGameTime,
    evaluatorVersion: row.evaluatorVersion,
  };
}

function observationValues(observation: ProgressionObservation) {
  return {
    careerId: observation.careerId,
    receptionFirstReachedGameTime: observation.domainFirstReached.RECEPTION ?? null,
    peerFirstReachedGameTime: observation.domainFirstReached.PEER ?? null,
    publicRecordFirstReachedGameTime: observation.domainFirstReached.PUBLIC_RECORD ?? null,
    lastEvaluatedGameTime: observation.lastEvaluatedGameTime,
    evaluatorVersion: observation.evaluatorVersion,
  };
}

/** The observation as it currently stands. Reads only — safe anywhere. */
export async function loadProgressionObservation(
  ctx: CommandContext,
  careerId: string,
): Promise<ProgressionObservation> {
  const rows = await ctx.db
    .select()
    .from(careerProgressionObservations)
    .where(eq(careerProgressionObservations.careerId, careerId))
    .limit(1);

  return observationFromRow(careerId, rows[0]);
}

/* ------------------------------------------------------------------ writing */

export type ProgressionResult = {
  /** The full argument: descriptors, domains, window, and what followed. */
  decision: PhaseDecision;
  /** True only on the single advance that moved the act. */
  transitioned: boolean;
};

/**
 * Step 6 of the day advance: the world draws a conclusion.
 *
 * **After** the director and after the messages, and the position is the
 * argument. The act is an input to reception through `ACT_REACH`, so a phase
 * that changed before the ticks would apply a Come Up's reach to a day the
 * career only qualified at the end of — the day that qualified a career is
 * simulated under the act the career held while living it. The world decides at
 * the close of the day and treats the artist differently *from tomorrow*, which
 * is also the honest fiction.
 *
 * A failure here must not undo the day. The reception, the relationships, the
 * moments and the offers are already real; a phase that could not be evaluated
 * is reported as no transition, and the next advance evaluates the same facts
 * again.
 */
export async function evaluateCareerProgression(
  ctx: CommandContext,
  input: { careerId: string; userId: string },
): Promise<Result<ProgressionResult, DomainError>> {
  const careerResult = await loadOwnedCareer(ctx.db, input.careerId, input.userId);
  if (!careerResult.ok) return careerResult;
  const career = careerResult.value;

  const [facts, previous] = await Promise.all([
    loadEvidenceFacts(ctx, career),
    loadProgressionObservation(ctx, career.id),
  ]);

  const decision = decidePhase(facts, previous);

  /*
   * The observation is written on every advance, including advances that change
   * nothing and advances for careers already past the Underground. It is the
   * record of what was observed and when — "we looked, and it was not true yet"
   * is information, and a table that only recorded successes could not answer
   * "why has this career not come up".
   */
  const transitioned = await ctx.db.transaction(async (tx) => {
    await tx
      .insert(careerProgressionObservations)
      .values(observationValues(decision.observation.observation))
      .onConflictDoUpdate({
        target: careerProgressionObservations.careerId,
        set: {
          ...observationValues(decision.observation.observation),
          updatedAt: new Date(),
        },
      });

    if (!decision.transitions) return false;

    /*
     * The whole transition, in one transaction with the observation that
     * justified it. Idempotency is structural rather than promised: the act is
     * updated only where it is still `UNDERGROUND`, so a replayed advance
     * updates nothing, and the event's idempotency key collapses a second write
     * onto the original row.
     */
    const updated = await tx
      .update(careers)
      .set({ careerAct: "COME_UP", updatedAt: new Date() })
      .where(and(eq(careers.id, career.id), eq(careers.careerAct, "UNDERGROUND")))
      .returning({ id: careers.id });

    if (updated.length === 0) return false;

    /*
     * The profile opens.
     *
     * The controlled entity becomes a public fact — the artist for a solo
     * career, the group for a group one, which is what the career *is* to the
     * world. A group career's player artist deliberately stays closed: the
     * public thing is the group, individual members are not separately known to
     * the scene because the group came up, and `careers.player_artist_id` exists
     * precisely so those two do not have to be the same entity.
     *
     * The route, the world-scoped slug resolution and the
     * `PUBLIC / OWNER_PREVIEW / HIDDEN` access model are all built and proven.
     * This is the first cause the flip has ever had.
     */
    if (career.controlledEntityType === "ARTIST" && career.controlledEntityId) {
      await tx
        .update(artists)
        .set({ isPublic: true, updatedAt: new Date() })
        .where(eq(artists.id, career.controlledEntityId));
    } else if (career.controlledEntityType === "GROUP" && career.controlledEntityId) {
      await tx
        .update(groups)
        .set({ isPublic: true, updatedAt: new Date() })
        .where(eq(groups.id, career.controlledEntityId));
    }

    await recordEvent(tx, {
      worldId: career.worldId,
      careerId: career.id,
      eventType: GameEventType.CareerEnteredComeUp,
      actorType: "CAREER",
      actorId: career.id,
      targetType: "WORLD",
      targetId: career.worldId,
      // The scene learns this where it learns everything else.
      visibility: "LOCAL_PUBLIC",
      importance: 90,
      occurredAt: career.currentGameDate,
      idempotencyKey: `career:${career.id}:entered_come_up`,
      /*
       * The evidence as it stood, and nothing more. Enough to reconstruct why
       * this happened under a newer evaluator; no internal score, because there
       * is none; and not a dump of every fact, because the projections it was
       * read from are still here.
       */
      payload: {
        careerAct: "COME_UP",
        evaluatorVersion: decision.evidence.evaluatorVersion,
        domains: decision.evidence.satisfiedDomains,
        descriptors: decision.evidence.satisfied,
        domainsFirstReached: Object.fromEntries(
          Object.entries(decision.observation.observation.domainFirstReached).map(
            ([domain, at]) => [domain, at?.toISOString() ?? null],
          ),
        ),
        transitionedAtGameTime: career.currentGameDate.toISOString(),
      },
    });

    return true;
  });

  return ok({ decision, transitioned });
}
