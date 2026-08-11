import { characters, eq } from "@music-rpg/database";
import {
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createFirstContact,
  createSoloArtist,
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
import type { UserRow } from "@music-rpg/database";
import type { TestContext } from "./context";

/**
 * Everything M3 produces, in one call.
 *
 * Milestones after the Studio start from a career that already has finished
 * work, so they shouldn't each re-type the whole creative loop. This walks the
 * real commands — no fixtures inserted behind the domain's back — so what later
 * suites start from is exactly what a player would have.
 */
const DIRECTION: CreativeDirection = {
  intention: "story",
  moods: ["tense", "introspective"],
  energy: 38,
  risk: 70,
  audience: "scene",
  note: "Driving through Joburg at 2am. Empty city.",
};

const ANSWERS: Record<string, string> = {
  q_aux: "listen",
  q_matters: "story",
  q_challenged: "devastating",
  q_environment: "bedroom",
  q_statement: "hear what I left out",
};

export type FinishedTrackOptions = {
  producerSlug?: string;
  stageName?: string;
  /**
   * What the player asked for in the room.
   *
   * The default is a scene-facing, high-risk brief. Overriding it is how a
   * suite builds a career that made a *materially different record* rather than
   * the same record with a different producer — an accessible, low-risk brief
   * aimed at everybody produces a track the scene heads have no use for, and
   * that difference is supposed to reach all the way through to what the world
   * later offers.
   */
  direction?: Partial<CreativeDirection>;
  /**
   * Put friction in the history.
   *
   * The clean path takes the producer's first read and ships it, which is a
   * career in which nobody ever disagreed about anything. Milestones that
   * reason about *what happened between two people* need a session with real
   * shape to it: a set refused, a second pass taken, a revision asked for.
   *
   * Every step still goes through the real commands, so what gets recorded is
   * exactly what a player doing the same thing would leave behind.
   */
  friction?: boolean;
};

export async function makeFinishedTrack(
  test: TestContext,
  user: Pick<UserRow, "id">,
  title: string,
  options: FinishedTrackOptions = {},
): Promise<{ careerId: string; trackId: string; sessionId: string }> {
  const career = unwrap(await createCareer(test.ctx, { userId: user.id }));
  const careerId = career.career.id;

  unwrap(await selectCareerType(test.ctx, { careerId, userId: user.id, careerType: "SOLO" }));
  unwrap(
    await createSoloArtist(test.ctx, {
      careerId,
      userId: user.id,
      stageName: options.stageName ?? "KXMO",
    }),
  );

  for (const question of await loadDiscoveryQuestions(test.handle.db, "SOLO")) {
    const answer = ANSWERS[question.id];
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

  const [producer] = await test.handle.db
    .select()
    .from(characters)
    .where(eq(characters.slug, options.producerSlug ?? "lex"));

  const selection = unwrap(
    await selectProducer(test.ctx, { careerId, userId: user.id, producerId: producer!.id }),
  );
  const sessionId = selection.session.id;

  unwrap(await startCreativeSession(test.ctx, { sessionId, userId: user.id }));
  unwrap(
    await setCreativeDirection(test.ctx, {
      sessionId,
      userId: user.id,
      direction: { ...DIRECTION, ...(options.direction ?? {}) },
    }),
  );

  let { proposals } = unwrap(
    await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
  );

  if (options.friction) {
    // Refuse the whole set. The producer goes away and comes back with a
    // different read — the round is what makes the second pass different.
    unwrap(
      await rejectProducerProposals(test.ctx, {
        sessionId,
        userId: user.id,
        reason: "None of these are it.",
      }),
    );
    proposals = unwrap(
      await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
    ).proposals;
  }

  const chosen = unwrap(
    await selectProducerProposal(test.ctx, {
      sessionId,
      userId: user.id,
      // On the second pass, take their angle rather than the literal ask.
      proposalId: (options.friction ? proposals[1] ?? proposals[0] : proposals[0])!.id,
    }),
  );

  let rendered = unwrap(
    await runGenerationJobToCompletion(test.ctx, { jobId: chosen.jobId, userId: user.id }),
  );

  if (options.friction) {
    // Take it, then ask for it to be different anyway.
    const revision = unwrap(
      await requestRevision(test.ctx, {
        sessionId,
        userId: user.id,
        kind: "sparser",
        note: "Strip it back further.",
        versionId: rendered.version!.id,
      }),
    );
    rendered = unwrap(
      await runGenerationJobToCompletion(test.ctx, { jobId: revision.jobId, userId: user.id }),
    );
  }

  const master = unwrap(
    await requestMaster(test.ctx, {
      sessionId,
      userId: user.id,
      versionId: rendered.version!.id,
    }),
  );
  unwrap(await runGenerationJobToCompletion(test.ctx, { jobId: master.jobId, userId: user.id }));

  unwrap(await renameTrack(test.ctx, { sessionId, userId: user.id, title }));
  const saved = unwrap(await saveTrackToCatalogue(test.ctx, { sessionId, userId: user.id }));

  return { careerId, trackId: saved.track.id, sessionId };
}
