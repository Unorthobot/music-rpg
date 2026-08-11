import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { creativeDecisions, eq, type UserRow } from "@music-rpg/database";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";
import { makeFinishedTrack } from "../helpers/studio";

/**
 * The history M6 reasons from.
 *
 * Before anything derives a relationship, the record it derives *from* has to
 * be real. This pins what each creative path actually leaves behind, because
 * the whole milestone rests on the claim that the difference between two
 * careers is already written down.
 */
describe("what a session leaves behind", () => {
  let test: TestContext;
  let user: UserRow;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");
  });

  afterAll(async () => {
    await test.close();
  });

  const decisionsFor = async (sessionId: string): Promise<string[]> => {
    const rows = await test.handle.db
      .select()
      .from(creativeDecisions)
      .where(eq(creativeDecisions.sessionId, sessionId))
      .orderBy(creativeDecisions.sequence);
    return rows.map((row) => row.decisionType);
  };

  it("records a clean path as a career in which nobody disagreed", async () => {
    const made = await makeFinishedTrack(test, user, "CLEAN");
    const decisions = await decisionsFor(made.sessionId);

    expect(decisions).toEqual([
      "CREATIVE_DIRECTION_SET",
      "PRODUCER_PROPOSAL_ACCEPTED",
      "TRACK_VERSION_REQUESTED",
      "MASTER_REQUESTED",
      "TRACK_SAVED",
    ]);

    // Nothing was refused and nothing was reworked. There is no friction here
    // to derive a relationship from, which is exactly why M6 needs the path
    // below as its primary case.
    expect(decisions).not.toContain("PRODUCER_PROPOSAL_REJECTED");
    expect(decisions).not.toContain("REVISION_REQUESTED");
  });

  it("records a friction path as an argument that was worked through", async () => {
    const other = await createTestUser(test, "Friction");
    const made = await makeFinishedTrack(test, other, "FRICTION", {
      stageName: "NOKX",
      friction: true,
    });
    const decisions = await decisionsFor(made.sessionId);

    expect(decisions).toEqual([
      "CREATIVE_DIRECTION_SET",
      "PRODUCER_PROPOSAL_REJECTED",
      "PRODUCER_PROPOSAL_ACCEPTED",
      "TRACK_VERSION_REQUESTED",
      "REVISION_REQUESTED",
      "MASTER_REQUESTED",
      "TRACK_SAVED",
    ]);

    const rows = await test.handle.db
      .select()
      .from(creativeDecisions)
      .where(eq(creativeDecisions.sessionId, made.sessionId))
      .orderBy(creativeDecisions.sequence);

    // The refusal names what was refused, and which pass it was — so a later
    // reading can tell "rejected their opening read" from "rejected them twice".
    const rejection = rows.find((row) => row.decisionType === "PRODUCER_PROPOSAL_REJECTED")!;
    const payload = rejection.payload as { round: number; rejected: string[]; reason: string | null };
    expect(payload.round).toBe(0);
    expect(payload.rejected.length).toBeGreaterThan(0);
    expect(payload.reason).toBe("None of these are it.");

    // What was taken was taken on the second pass, and the producer's feeling
    // about it at the time is on the row — the material for "you refused
    // someone who was enthusiastic" versus "someone who was already cautious".
    const accepted = rows.find((row) => row.decisionType === "PRODUCER_PROPOSAL_ACCEPTED")!;
    const acceptedPayload = accepted.payload as { round: number; stance: string };
    expect(acceptedPayload.round).toBe(1);
    expect(acceptedPayload.stance).toBeTruthy();
  });
});
