import { characters, eq } from "@music-rpg/database";
import {
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createFirstContact,
  createSoloArtist,
  interpretCreativeDirection,
  loadDiscoveryQuestions,
  renameTrack,
  requestMaster,
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

export async function makeFinishedTrack(
  test: TestContext,
  user: Pick<UserRow, "id">,
  title: string,
  options: { producerSlug?: string; stageName?: string } = {},
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
  unwrap(await setCreativeDirection(test.ctx, { sessionId, userId: user.id, direction: DIRECTION }));

  const { proposals } = unwrap(
    await interpretCreativeDirection(test.ctx, { sessionId, userId: user.id }),
  );

  const chosen = unwrap(
    await selectProducerProposal(test.ctx, {
      sessionId,
      userId: user.id,
      proposalId: proposals[0]!.id,
    }),
  );

  const rendered = unwrap(
    await runGenerationJobToCompletion(test.ctx, { jobId: chosen.jobId, userId: user.id }),
  );

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
