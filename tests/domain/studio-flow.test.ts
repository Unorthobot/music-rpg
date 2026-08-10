import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  calendarItems,
  careerMemories,
  careers,
  characters,
  creativeDecisions,
  creativeSessions,
  eq,
  generationJobs,
  notifications,
  trackVersions,
  tracks,
  type UserRow,
} from "@music-rpg/database";
import { GameEventType, listCareerEvents } from "@music-rpg/events";
import {
  advanceGenerationJob,
  combineProducerProposals,
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createFirstContact,
  createSoloArtist,
  getCareerCounters,
  getCareerHome,
  interpretCreativeDirection,
  loadDiscoveryQuestions,
  rejectProducerProposals,
  renameTrack,
  requestMaster,
  requestRevision,
  runGenerationJobToCompletion,
  saveDiscoveryAnswer,
  saveTrackToCatalogue,
  selectCareerType,
  selectProducer,
  selectProducerProposal,
  setCreativeDirection,
  startCreativeSession,
} from "@music-rpg/domain";
import { unwrap, type CreativeDirection } from "@music-rpg/shared";
import { createTestContext, createTestUser, type TestContext } from "../helpers/context";

/**
 * The whole creative loop, headless.
 *
 * Direction → interpretation → decision → render → revision → master → save,
 * with the state machine refusing everything it should refuse along the way.
 * If this passes, the Studio screens are only a view of something that already
 * works.
 */
const DIRECTION: CreativeDirection = {
  intention: "story",
  moods: ["tense", "introspective"],
  energy: 38,
  risk: 70,
  audience: "scene",
  note: "Driving through Joburg at 2am. Empty city. I want the words to feel dangerous.",
};

describe("studio: the first track", () => {
  let test: TestContext;
  let user: UserRow;
  let careerId: string;
  let sessionId: string;
  let trackId: string;
  let version1Id: string;
  let version2Id: string;

  beforeAll(async () => {
    test = await createTestContext();
    user = await createTestUser(test, "Kamo");

    const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
    careerId = career.career.id;
    unwrap(await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "SOLO" }));
    unwrap(await createSoloArtist(test.ctx, { careerId, userId: user.id, stageName: "KXMO" }));

    const answers: Record<string, string> = {
      q_aux: "listen",
      q_matters: "story",
      q_challenged: "devastating",
      q_environment: "bedroom",
      q_statement: "hear what I left out",
    };
    for (const question of await loadDiscoveryQuestions(test.handle.db, "SOLO")) {
      const answer = answers[question.id];
      if (answer) {
        unwrap(
          await saveDiscoveryAnswer(test.ctx, {
            careerId,
            userId: user.id,
            questionId: question.id,
            value: answer,
          }),
        );
      }
    }
    unwrap(await completeSoundDiscovery(test.ctx, { careerId, userId: user.id }));
    unwrap(await completeCareerOnboarding(test.ctx, { careerId, userId: user.id }));
    unwrap(await createFirstContact(test.ctx, { careerId, userId: user.id }));

    const [lex] = await test.handle.db.select().from(characters).where(eq(characters.slug, "lex"));
    const selection = unwrap(
      await selectProducer(test.ctx, { careerId, userId: user.id, producerId: lex!.id }),
    );
    sessionId = selection.session.id;
  });

  afterAll(async () => {
    await test.close();
  });

  it("refuses to master a session that hasn't produced anything", async () => {
    const result = await requestMaster(test.ctx, {
      sessionId,
      userId: user.id,
      versionId: "does-not-exist",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CAREER_STATE");
  });

  it("refuses interpretation before a direction exists", async () => {
    const result = await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CAREER_STATE");
  });

  it("starts the session and asks for a direction", async () => {
    const session = unwrap(await startCreativeSession(test.ctx, { sessionId, userId: user.id }));

    expect(session.status).toBe("AWAITING_DIRECTION");
    expect(session.startedAt).toBeTruthy();

    const [item] = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.relatedEntityId, sessionId));
    expect(item!.status).toBe("ACTIVE");
  });

  it("is idempotent about walking into the room", async () => {
    const again = unwrap(await startCreativeSession(test.ctx, { sessionId, userId: user.id }));
    expect(again.status).toBe("AWAITING_DIRECTION");
  });

  it("persists the creative direction the player gave", async () => {
    const session = unwrap(
      await setCreativeDirection(test.ctx, { sessionId, userId: user.id, direction: DIRECTION }),
    );

    expect(session.status).toBe("AWAITING_INTERPRETATION");
    expect((session.creativeDirection as CreativeDirection).intention).toBe("story");
    expect((session.creativeDirection as CreativeDirection).note).toContain("Joburg");

    const decisions = await test.handle.db
      .select()
      .from(creativeDecisions)
      .where(eq(creativeDecisions.sessionId, sessionId));
    expect(decisions.map((decision) => decision.decisionType)).toContain("CREATIVE_DIRECTION_SET");
  });

  it("produces three contextual proposals, deterministically", async () => {
    const first = unwrap(await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }));

    expect(first.proposals).toHaveLength(3);
    expect(first.producerName).toBe("LEX");
    for (const proposal of first.proposals) {
      expect(proposal.title.length).toBeGreaterThan(0);
      expect(proposal.rationale.length).toBeGreaterThan(0);
      expect(proposal.structure.length).toBeGreaterThan(0);
      expect(proposal.line.length).toBeGreaterThan(0);
    }

    // Re-running the same round gives the same three ideas.
    const again = unwrap(await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }));
    expect(again.proposals.map((proposal) => proposal.title)).toEqual(
      first.proposals.map((proposal) => proposal.title),
    );
  });

  it("lets a producer disagree rather than approving everything", async () => {
    const { proposals } = unwrap(
      await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
    );

    const stances = new Set(proposals.map((proposal) => proposal.stance));
    // LEX has low agreeableness and high standards: the counter is an argument.
    expect(stances.size).toBeGreaterThan(1);
    expect(proposals.some((proposal) => proposal.stance === "PUSHING_BACK")).toBe(true);
  });

  it("rejecting the set brings back a different set", async () => {
    const before = unwrap(
      await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
    );

    const session = unwrap(
      await rejectProducerProposals(test.ctx, {
        sessionId,
        userId: user.id,
        reason: "None of these are it.",
      }),
    );

    expect(session.status).toBe("AWAITING_INTERPRETATION");
    expect(session.proposalRound).toBe(1);

    const after = unwrap(await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }));
    expect(after.proposals.map((proposal) => proposal.title)).not.toEqual(
      before.proposals.map((proposal) => proposal.title),
    );

    const decisions = await test.handle.db
      .select()
      .from(creativeDecisions)
      .where(eq(creativeDecisions.sessionId, sessionId));
    expect(decisions.map((decision) => decision.decisionType)).toContain(
      "PRODUCER_PROPOSAL_REJECTED",
    );
  });

  it("choosing an idea creates the track and queues the render", async () => {
    const { proposals } = unwrap(
      await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
    );

    const result = unwrap(
      await selectProducerProposal(test.ctx, {
        sessionId,
        userId: user.id,
        proposalId: proposals[0]!.id,
      }),
    );

    trackId = result.trackId;

    expect(result.session.status).toBe("CREATING_VERSION");

    const [job] = await test.handle.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, result.jobId));
    expect(job!.status).toBe("REQUESTED");
    expect(job!.jobType).toBe("QUICK_RENDER");

    const [trackRow] = await test.handle.db.select().from(tracks).where(eq(tracks.id, trackId));
    expect(trackRow!.status).toBe("IN_PROGRESS");
    expect(trackRow!.title).toBeNull();
    expect(trackRow!.primaryArtistId).toBeTruthy();
  });

  it("walks the render through the whole job state machine", async () => {
    const [job] = await test.handle.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.sessionId, sessionId));

    const seen: string[] = [job!.status];

    for (let step = 0; step < 6; step += 1) {
      const result = unwrap(
        await advanceGenerationJob(test.ctx, { jobId: job!.id, userId: user.id }),
      );
      seen.push(result.job.status);
      if (result.done) {
        version1Id = result.version!.id;
        break;
      }
    }

    expect(seen).toEqual(["REQUESTED", "QUEUED", "GENERATING", "EVALUATING", "COMPLETE"]);

    const [version] = await test.handle.db
      .select()
      .from(trackVersions)
      .where(eq(trackVersions.id, version1Id));

    expect(version!.versionNumber).toBe(1);
    expect(version!.isMaster).toBe(false);
    expect(version!.content.developmentPreview).toBe(true);
    expect(version!.content.structure.length).toBeGreaterThan(0);
    expect(version!.workingTitle).toBeTruthy();

    const [session] = await test.handle.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, sessionId));
    expect(session!.status).toBe("REVIEW");
  });

  it("tells the player when the sketch is done, wherever they are", async () => {
    const rows = await test.handle.db
      .select()
      .from(notifications)
      .where(eq(notifications.careerId, careerId));

    expect(rows.some((row) => row.kind === "RENDER_COMPLETE")).toBe(true);
  });

  it("completing a finished job again returns the same version", async () => {
    const [job] = await test.handle.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.trackVersionId, version1Id));

    const result = unwrap(await advanceGenerationJob(test.ctx, { jobId: job!.id, userId: user.id }));

    expect(result.done).toBe(true);
    expect(result.version!.id).toBe(version1Id);

    const versions = await test.handle.db
      .select()
      .from(trackVersions)
      .where(eq(trackVersions.trackId, trackId));
    expect(versions).toHaveLength(1);
  });

  it("a revision creates version 2 and leaves version 1 untouched", async () => {
    const before = (
      await test.handle.db.select().from(trackVersions).where(eq(trackVersions.id, version1Id))
    )[0]!;

    const revision = unwrap(
      await requestRevision(test.ctx, { sessionId, userId: user.id, kind: "darker" }),
    );

    const completed = unwrap(
      await runGenerationJobToCompletion(test.ctx, { jobId: revision.jobId, userId: user.id }),
    );

    version2Id = completed.version!.id;

    expect(completed.version!.versionNumber).toBe(2);

    const after = (
      await test.handle.db.select().from(trackVersions).where(eq(trackVersions.id, version1Id))
    )[0]!;

    // Version 1 is immutable.
    expect(after.content).toEqual(before.content);
    expect(after.soundProfile).toEqual(before.soundProfile);

    // …and version 2 is genuinely darker.
    expect(completed.version!.soundProfile!.darkBright).toBeLessThan(
      before.soundProfile!.darkBright,
    );

    const versions = await test.handle.db
      .select()
      .from(trackVersions)
      .where(eq(trackVersions.trackId, trackId));
    expect(versions).toHaveLength(2);
  });

  it("refuses to save before anything is mastered", async () => {
    const result = await saveTrackToCatalogue(test.ctx, { sessionId, userId: user.id });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/master/i);
  });

  it("masters the chosen version without destroying the others", async () => {
    const master = unwrap(
      await requestMaster(test.ctx, { sessionId, userId: user.id, versionId: version2Id }),
    );

    const [session] = await test.handle.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, sessionId));
    expect(session!.status).toBe("MASTERING");

    const completed = unwrap(
      await runGenerationJobToCompletion(test.ctx, { jobId: master.jobId, userId: user.id }),
    );

    expect(completed.version!.isMaster).toBe(true);
    expect(completed.version!.versionNumber).toBe(3);

    const [trackRow] = await test.handle.db.select().from(tracks).where(eq(tracks.id, trackId));
    expect(trackRow!.currentMasterVersionId).toBe(completed.version!.id);
    expect(trackRow!.status).toBe("COMPLETE");

    const versions = await test.handle.db
      .select()
      .from(trackVersions)
      .where(eq(trackVersions.trackId, trackId));
    expect(versions).toHaveLength(3);
  });

  it("names the track", async () => {
    const renamed = unwrap(
      await renameTrack(test.ctx, { sessionId, userId: user.id, title: "NO RECEPTION" }),
    );
    expect(renamed.title).toBe("NO RECEPTION");
  });

  it("saves to the catalogue and closes the session", async () => {
    const saved = unwrap(await saveTrackToCatalogue(test.ctx, { sessionId, userId: user.id }));

    expect(saved.title).toBe("NO RECEPTION");
    expect(saved.track.status).toBe("UNRELEASED");
    expect(saved.session.status).toBe("COMPLETED");
    expect(saved.session.endedAt).toBeTruthy();

    const [item] = await test.handle.db
      .select()
      .from(calendarItems)
      .where(eq(calendarItems.relatedEntityId, sessionId));
    expect(item!.status).toBe("COMPLETED");

    const memories = await test.handle.db
      .select()
      .from(careerMemories)
      .where(eq(careerMemories.careerId, careerId));
    expect(memories).toHaveLength(1);
    expect(memories[0]!.summary).toContain("NO RECEPTION");
    expect(memories[0]!.summary).toContain("LEX");
    expect(memories[0]!.sourceEventId).toBeTruthy();
  });

  it("moves the in-world clock — you show up on the day, and it takes an evening", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const [session] = await test.handle.db
      .select()
      .from(creativeSessions)
      .where(eq(creativeSessions.id, sessionId));

    const scheduled = session!.scheduledGameTime!.getTime();

    // Arrived on the scheduled day, then spent six in-world hours working.
    expect(career!.currentGameDate.getTime()).toBe(scheduled + 6 * 60 * 60 * 1000);
  });

  it("makes the catalogue count real", async () => {
    const counters = await getCareerCounters(test.handle.db, { id: careerId });
    expect(counters.catalogue).toBe(1);
    expect(counters.releases).toBe(0);
  });

  it("changes Home", async () => {
    const [career] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const home = await getCareerHome(test.handle.db, career!);

    expect(home.rightNow.kind).toBe("TRACK_COMPLETE");
    expect(home.pulse.tracksCreated).toBe(1);
    expect(home.pulse.sessionsCompleted).toBe(1);
    expect(home.pulse.spentMinor).toBe(150_000);
    expect(home.story.some((card) => card.title === "Track saved to catalogue")).toBe(true);
  });

  it("saving twice does not duplicate history", async () => {
    const again = unwrap(await saveTrackToCatalogue(test.ctx, { sessionId, userId: user.id }));
    expect(again.session.status).toBe("COMPLETED");

    const events = await listCareerEvents(test.handle.db, careerId);
    const saves = events.filter((event) => event.eventType === GameEventType.TrackSavedToCatalogue);
    expect(saves).toHaveLength(1);

    const memories = await test.handle.db
      .select()
      .from(careerMemories)
      .where(eq(careerMemories.careerId, careerId));
    expect(memories).toHaveLength(1);
  });

  it("refuses to keep working on a finished session", async () => {
    const revision = await requestRevision(test.ctx, {
      sessionId,
      userId: user.id,
      kind: "brighter",
    });
    expect(revision.ok).toBe(false);

    const direction = await setCreativeDirection(test.ctx, {
      sessionId,
      userId: user.id,
      direction: DIRECTION,
    });
    expect(direction.ok).toBe(false);
  });

  it("records the whole chain, in order, in the canonical log", async () => {
    const events = await listCareerEvents(test.handle.db, careerId);
    const types = events.map((event) => event.eventType);

    const expected = [
      GameEventType.ProducerSelected,
      GameEventType.CreativeSessionCreated,
      GameEventType.CreativeSessionStarted,
      GameEventType.CreativeDirectionSet,
      GameEventType.ProducerInterpretationCreated,
      GameEventType.CreativeDecisionRecorded,
      GameEventType.TrackCreated,
      GameEventType.GenerationRequested,
      GameEventType.GenerationCompleted,
      GameEventType.TrackVersionCreated,
      GameEventType.TrackVersionMastered,
      GameEventType.TrackSavedToCatalogue,
      GameEventType.CreativeSessionCompleted,
    ];

    for (const type of expected) expect(types).toContain(type);

    // Causality: the session was started before a direction was set, and the
    // track was saved after it was mastered.
    const indexOf = (type: string) => types.indexOf(type);
    expect(indexOf(GameEventType.CreativeSessionStarted)).toBeLessThan(
      indexOf(GameEventType.CreativeDirectionSet),
    );
    expect(indexOf(GameEventType.TrackVersionMastered)).toBeLessThan(
      indexOf(GameEventType.TrackSavedToCatalogue),
    );
  });

  it("fires the studio analytics funnel", async () => {
    const names = test.analytics.names();

    for (const name of [
      "new_session_started",
      "creative_direction_submitted",
      "producer_interpretation_viewed",
      "producer_proposal_rejected",
      "producer_proposal_selected",
      "quick_render_requested",
      "quick_render_completed",
      "revision_requested",
      "master_requested",
      "master_completed",
      "track_saved",
      "studio_session_completed",
    ]) {
      expect(names).toContain(name);
    }
  });
});

/**
 * A second career proves the parts the first one couldn't: combining two ideas,
 * and a group's attribution surviving into the work.
 */
describe("studio: combining ideas in a group career", () => {
  let test: TestContext;

  beforeAll(async () => {
    test = await createTestContext();
  });

  afterAll(async () => {
    await test.close();
  });

  it("folds two proposals into one brief and credits the group and the player", async () => {
    const {
      createFoundingArtist,
      createGroup,
      addGroupMember,
      completeGroupLineup,
      getCandidateViews,
    } = await import("@music-rpg/domain");

    const user = await createTestUser(test, "Group");
    const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
    const careerId = career.career.id;

    unwrap(await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "GROUP" }));
    unwrap(await createGroup(test.ctx, { careerId, userId: user.id, name: "THE LONG WAY" }));
    unwrap(
      await createFoundingArtist(test.ctx, {
        careerId,
        userId: user.id,
        stageName: "KXMO",
        role: "LEAD_MC",
      }),
    );

    for (const question of await loadDiscoveryQuestions(test.handle.db, "GROUP")) {
      const answers: Record<string, string> = {
        q_aux: "move",
        q_matters: "hook",
        q_challenged: "hit",
        q_environment: "rehearsal",
        q_group_decisions: "vote",
        q_group_edge: "stage",
        q_statement_group: "move before they think",
      };
      const answer = answers[question.id];
      if (answer) {
        unwrap(
          await saveDiscoveryAnswer(test.ctx, {
            careerId,
            userId: user.id,
            questionId: question.id,
            value: answer,
          }),
        );
      }
    }
    unwrap(await completeSoundDiscovery(test.ctx, { careerId, userId: user.id }));

    const [world] = await test.handle.db.select().from(careers).where(eq(careers.id, careerId));
    const candidates = await getCandidateViews(test.handle.db, world!.worldId, null);
    unwrap(
      await addGroupMember(test.ctx, {
        careerId,
        userId: user.id,
        artistId: candidates[0]!.artist.id,
      }),
    );
    unwrap(await completeGroupLineup(test.ctx, { careerId, userId: user.id }));
    unwrap(await completeCareerOnboarding(test.ctx, { careerId, userId: user.id }));
    unwrap(await createFirstContact(test.ctx, { careerId, userId: user.id }));

    const [zero] = await test.handle.db
      .select()
      .from(characters)
      .where(eq(characters.slug, "producer-zero"));

    const selection = unwrap(
      await selectProducer(test.ctx, { careerId, userId: user.id, producerId: zero!.id }),
    );
    const sessionId = selection.session.id;

    unwrap(await startCreativeSession(test.ctx, { sessionId, userId: user.id }));
    unwrap(
      await setCreativeDirection(test.ctx, {
        sessionId,
        userId: user.id,
        direction: { ...DIRECTION, intention: "move", risk: 30 },
      }),
    );

    const { proposals } = unwrap(
      await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
    );

    const combined = unwrap(
      await combineProducerProposals(test.ctx, {
        sessionId,
        userId: user.id,
        proposalIds: [proposals[0]!.id, proposals[2]!.id],
      }),
    );

    const rendered = unwrap(
      await runGenerationJobToCompletion(test.ctx, { jobId: combined.jobId, userId: user.id }),
    );
    expect(rendered.version!.versionNumber).toBe(1);

    const decisions = await test.handle.db
      .select()
      .from(creativeDecisions)
      .where(eq(creativeDecisions.sessionId, sessionId));
    expect(decisions.map((decision) => decision.decisionType)).toContain(
      "PRODUCER_PROPOSALS_COMBINED",
    );

    // The track belongs to the group, and still names the player's artist.
    const [trackRow] = await test.handle.db
      .select()
      .from(tracks)
      .where(eq(tracks.id, combined.trackId));

    expect(trackRow!.ownerType).toBe("GROUP");
    expect(trackRow!.ownerId).toBe(world!.controlledEntityId);
    expect(trackRow!.primaryArtistId).toBe(world!.playerArtistId);
  });
});
