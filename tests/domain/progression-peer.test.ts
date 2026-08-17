import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { careers, opportunities, relationshipMoments, eq } from "@music-rpg/database";
import {
  acceptOpportunity, advanceCareerDay, declineOpportunity, getOpenMoments,
  interpretCreativeDirection, loadEvidenceFacts, loadProgressionObservation, planRelease,
  publishRelease, renameTrack, requestMaster, respondToMoment, runGenerationJobToCompletion,
  saveTrackToCatalogue, scheduleRelease, selectProducerProposal, setCreativeDirection,
  setReleaseStrategy, startCreativeSession,
} from "@music-rpg/domain";
import { decidePhase } from "@music-rpg/simulation";
import { unwrap } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makePublishedRelease } from "../helpers/release";

/**
 * Answering somebody does not un-happen their decision.
 *
 * The bug this pins: PEER read *currently open* moments, so responding to a
 * producer who asked to get back in the room deleted the evidence that they had
 * asked. A career could lose a recognition domain by doing the one thing the
 * moment exists to invite.
 */

let T: TestContext;
beforeAll(async () => { T = await createTestContext(); }, 120_000);
afterAll(async () => { await T?.close(); });

const DIR2 = { intention: "story", moods: ["tense"], energy: 40, risk: 68, audience: "scene", note: "2nd" };

describe("PEER survives being answered", () => {
  it("stays true once somebody came back, open or answered", async () => {
    const u = await createTestUser(T, "Peer Regression");
    const { careerId } = await makePublishedRelease(T, u, "FIRST", { stageName: "PEERREG" });
    const db = T.handle.db;

    const domains = async () => {
      const row = (await db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
      return decidePhase(await loadEvidenceFacts(T.ctx, row), await loadProgressionObservation(T.ctx, careerId))
        .evidence.satisfiedDomains;
    };
    const peerCheck = async () => {
      const row = (await db.select().from(careers).where(eq(careers.id, careerId)))[0]!;
      const d = decidePhase(await loadEvidenceFacts(T.ctx, row), await loadProgressionObservation(T.ctx, careerId));
      return d.evidence.checks.find((c: { descriptor: string }) => c.descriptor === "PEOPLE_WHO_CAME_BACK")!;
    };

    let second = false, openedOn: number | null = null, answeredOn: number | null = null;

    for (let d = 1; d <= 30; d++) {
      await advanceCareerDay(T.ctx, { careerId, userId: u.id, seed: "peer-reg" });
      const live = (await db.select().from(opportunities).where(eq(opportunities.careerId, careerId)))
        .filter((o) => o.status === "AVAILABLE");
      for (const o of live) {
        if (o.type === "SESSION_INVITE" && !second) {
          const r = await acceptOpportunity(T.ctx, { careerId, userId: u.id, opportunityId: o.id });
          if (r.ok && (r.value as { sessionId?: string }).sessionId) {
            const sid = (r.value as { sessionId: string }).sessionId;
            unwrap(await startCreativeSession(T.ctx, { sessionId: sid, userId: u.id }));
            unwrap(await setCreativeDirection(T.ctx, { sessionId: sid, userId: u.id, direction: DIR2 as never }));
            const { proposals } = unwrap(await interpretCreativeDirection(T.ctx, { sessionId: sid, userId: u.id }));
            const ch = unwrap(await selectProducerProposal(T.ctx, { sessionId: sid, userId: u.id, proposalId: proposals[0]!.id }));
            const rd = unwrap(await runGenerationJobToCompletion(T.ctx, { jobId: ch.jobId, userId: u.id }));
            const ms = unwrap(await requestMaster(T.ctx, { sessionId: sid, userId: u.id, versionId: rd.version!.id }));
            unwrap(await runGenerationJobToCompletion(T.ctx, { jobId: ms.jobId, userId: u.id }));
            unwrap(await renameTrack(T.ctx, { sessionId: sid, userId: u.id, title: "SECOND" }));
            const tr = unwrap(await saveTrackToCatalogue(T.ctx, { sessionId: sid, userId: u.id })).track.id;
            const pl = unwrap(await planRelease(T.ctx, { careerId, userId: u.id, trackId: tr, format: "SINGLE" }));
            unwrap(await setReleaseStrategy(T.ctx, { careerId, userId: u.id, releaseId: pl.release.id, strategy: "DROP" }));
            unwrap(await scheduleRelease(T.ctx, { careerId, userId: u.id, releaseId: pl.release.id }));
            unwrap(await publishRelease(T.ctx, { careerId, userId: u.id, releaseId: pl.release.id }));
            second = true;
          }
          continue;
        }
        await declineOpportunity(T.ctx, { careerId, userId: u.id, opportunityId: o.id });
      }

      const open = await getOpenMoments(T.ctx, careerId);
      const wants = open.find((m) => m.kind === "WANTS_ANOTHER_SESSION");

      if (wants && openedOn === null) {
        openedOn = d;
        /* 1. The moment is open, and PEER is true. */
        expect(await domains(), "PEER should hold while the moment is open").toContain("PEER");

        /* 2. The player answers it. */
        const before = await peerCheck();
        unwrap(await respondToMoment(T.ctx, {
          careerId, userId: u.id, momentId: wants.id,
          response: wants.options[0]!.response,
        }));
        answeredOn = d;

        /* 3. PEER still holds — the decision happened, and stays happened. */
        expect(await domains(), "answering must not erase the decision").toContain("PEER");

        /* 4. No duplicate recognition: one person who came back, not two. */
        const after = await peerCheck();
        expect(after.observed.wantsAnotherSession).toBe(before.observed.wantsAnotherSession);
        expect(after.observed.wantsAnotherStillOpen).toBe(0);
        break;
      }
    }

    expect(openedOn, "the world never raised WANTS_ANOTHER_SESSION").not.toBeNull();
    expect(answeredOn).toBe(openedOn);

    /* The moment really is closed — PEER is reading history, not a live flag. */
    const rows = await db.select().from(relationshipMoments).where(eq(relationshipMoments.careerId, careerId));
    expect(rows.some((r) => r.kind === "WANTS_ANOTHER_SESSION" && r.status !== "OPEN")).toBe(true);

    /* And it stays true as the world moves on. */
    for (let i = 0; i < 5; i++) {
      await advanceCareerDay(T.ctx, { careerId, userId: u.id, seed: "peer-reg" });
    }
    expect(await domains()).toContain("PEER");
  }, 600_000);
});
