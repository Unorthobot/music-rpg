import {
  careers, crewMembers, opportunities, relationships, eq,
  type UserRow,
} from "@music-rpg/database";
import {
  acceptBattleChallenge, acceptOpportunity, advanceCareerDay, declareBattleStrategy,
  declineOpportunity, getCrewEligibility, interpretCreativeDirection, inviteToCrew,
  loadEvidenceFacts, loadProgressionObservation, planRelease, publishRelease, renameTrack,
  requestMaster, runGenerationJobToCompletion, saveTrackToCatalogue, scheduleRelease,
  selectProducerProposal, setCreativeDirection, setReleaseStrategy, startCreativeSession,
} from "@music-rpg/domain";
import { decidePhase } from "@music-rpg/simulation";
import { unwrap, type CreativeDirection, type RecognitionDomain } from "@music-rpg/shared";
import type { TestContext } from "./context";
import { makePublishedRelease } from "./release";

/**
 * The golden histories, built through real commands only.
 *
 * Nothing here inserts a row to manufacture a qualifying career. Every domain
 * these careers reach was produced by the world reacting to something the
 * player actually did, which is the only way a progression proof means
 * anything.
 */
export type GoldenMode = "A" | "B" | "C" | "D" | "E" | "F";

/** A second record, aimed where the first one was. */
const SECOND: CreativeDirection = {
  intention: "story", moods: ["tense", "introspective"], energy: 40, risk: 68,
  audience: "scene", note: "The follow-up.",
} as CreativeDirection;

/** A record aimed at nobody: the direction family measured never to land. */
export const WEAK: CreativeDirection = {
  intention: "introduce", moods: ["warm"], energy: 55, risk: 30,
  audience: "general", note: "Aimed at everybody.",
} as CreativeDirection;

export async function domainsOf(t: TestContext, careerId: string): Promise<RecognitionDomain[]> {
  const row = (await t.handle.db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
  const facts = await loadEvidenceFacts(t.ctx, row);
  const obs = await loadProgressionObservation(t.ctx, careerId);
  return decidePhase(facts, obs).evidence.satisfiedDomains;
}

export async function decisionOf(t: TestContext, careerId: string) {
  const row = (await t.handle.db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
  return decidePhase(await loadEvidenceFacts(t.ctx, row), await loadProgressionObservation(t.ctx, careerId));
}

async function driveSecondRecord(t: TestContext, userId: string, careerId: string, sessionId: string) {
  unwrap(await startCreativeSession(t.ctx, { sessionId, userId }));
  unwrap(await setCreativeDirection(t.ctx, { sessionId, userId, direction: SECOND }));
  const { proposals } = unwrap(await interpretCreativeDirection(t.ctx, { sessionId, userId }));
  const chosen = unwrap(await selectProducerProposal(t.ctx, { sessionId, userId, proposalId: proposals[0]!.id }));
  const rendered = unwrap(await runGenerationJobToCompletion(t.ctx, { jobId: chosen.jobId, userId }));
  const master = unwrap(await requestMaster(t.ctx, { sessionId, userId, versionId: rendered.version!.id }));
  unwrap(await runGenerationJobToCompletion(t.ctx, { jobId: master.jobId, userId }));
  unwrap(await renameTrack(t.ctx, { sessionId, userId, title: "SECOND" }));
  const trackId = unwrap(await saveTrackToCatalogue(t.ctx, { sessionId, userId })).track.id;
  const planned = unwrap(await planRelease(t.ctx, { careerId, userId, trackId, format: "SINGLE" }));
  const releaseId = planned.release.id;
  unwrap(await setReleaseStrategy(t.ctx, { careerId, userId, releaseId, strategy: "DROP" }));
  unwrap(await scheduleRelease(t.ctx, { careerId, userId, releaseId }));
  unwrap(await publishRelease(t.ctx, { careerId, userId, releaseId }));
}

export type GoldenRun = {
  careerId: string;
  /** The day each domain was first observed true. */
  firstDomain: Partial<Record<RecognitionDomain, number>>;
  /** The day the career actually transitioned, if it did. */
  transitionDay: number | null;
};

/**
 * Live one of the golden histories for `days` in-world days.
 *
 * The career answers offers according to its mode and nothing else. F declines
 * everything forever, which is what makes it the anti-grind proof.
 */
export async function liveGolden(
  t: TestContext,
  user: Pick<UserRow, "id">,
  mode: GoldenMode,
  days = 40,
): Promise<GoldenRun> {
  const { careerId } = await makePublishedRelease(t, user, "FIRST", {
    stageName: `GOLD${mode}`,
    ...(mode === "E" ? { direction: WEAK } : {}),
  });
  const db = t.handle.db;
  let second = false, crewDone = false, battleDone = false;
  const firstDomain: Partial<Record<RecognitionDomain, number>> = {};
  let transitionDay: number | null = null;

  for (let day = 1; day <= days; day += 1) {
    await advanceCareerDay(t.ctx, { careerId, userId: user.id, seed: "golden" });

    const live = (await db.select().from(opportunities).where(eq(opportunities.careerId, careerId)))
      .filter((row) => row.status === "AVAILABLE");

    for (const offer of live) {
      if (mode === "C" && offer.type === "BATTLE_CHALLENGE" && !battleDone) {
        const accepted = await acceptBattleChallenge(t.ctx, { careerId, userId: user.id, opportunityId: offer.id });
        if (accepted.ok) {
          await declareBattleStrategy(t.ctx, {
            careerId, userId: user.id, battleId: accepted.value.battle.id, strategy: "TAKE_THEM_APART",
          });
          battleDone = true;
        }
        continue;
      }

      const wanted =
        (mode === "A" && offer.type === "SESSION_INVITE" && !second) ||
        (mode === "D" && offer.type === "SHOWCASE_SLOT");

      if (!wanted) {
        await declineOpportunity(t.ctx, { careerId, userId: user.id, opportunityId: offer.id });
        continue;
      }

      const taken = await acceptOpportunity(t.ctx, { careerId, userId: user.id, opportunityId: offer.id });
      if (taken.ok && mode === "A" && (taken.value as { sessionId?: string }).sessionId) {
        await driveSecondRecord(t, user.id, careerId, (taken.value as { sessionId: string }).sessionId);
        second = true;
      }
    }

    if (mode === "B" && !crewDone) {
      const rels = await db.select().from(relationships).where(eq(relationships.careerId, careerId));
      for (const rel of rels) {
        const eligible = await getCrewEligibility(t.ctx, { careerId, subjectId: rel.subjectId });
        if (!eligible.eligible) continue;
        const invited = await inviteToCrew(t.ctx, {
          careerId, userId: user.id, subjectId: rel.subjectId, arrangement: "SESSION_RATE",
        });
        if (invited.ok && invited.value.accepted) crewDone = true;
        break;
      }
    }

    for (const domain of await domainsOf(t, careerId)) {
      if (firstDomain[domain] === undefined) firstDomain[domain] = day;
    }

    const row = (await db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
    if (row.careerAct === "COME_UP" && transitionDay === null) transitionDay = day;
  }

  return { careerId, firstDomain, transitionDay };
}

export async function activeCrew(t: TestContext, careerId: string) {
  return (await t.handle.db.select().from(crewMembers).where(eq(crewMembers.careerId, careerId)))
    .filter((row) => row.status === "ACTIVE");
}
