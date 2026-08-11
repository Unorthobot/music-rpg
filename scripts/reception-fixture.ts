/**
 * One published Underground single, built the way a player would build it.
 *
 * Shared by the report and the stability check so both start from exactly the
 * same career: same stage name, same discovery answers, same producer, same
 * creative direction. Everything downstream of that is deterministic, so the
 * only thing left varying between runs is whatever the caller chooses to vary.
 */
import {
  characters,
  eq,
  type Database,
} from "@music-rpg/database";
import {
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createFirstContact,
  createSoloArtist,
  interpretCreativeDirection,
  loadDiscoveryQuestions,
  planRelease,
  publishRelease,
  renameTrack,
  requestMaster,
  runGenerationJobToCompletion,
  saveDiscoveryAnswer,
  saveTrackToCatalogue,
  scheduleRelease,
  selectCareerType,
  selectProducer,
  selectProducerProposal,
  setCreativeDirection,
  setReleaseStrategy,
  startCreativeSession,
  type CommandContext,
} from "@music-rpg/domain";
import { unwrap, type CreativeDirection, type ReleaseStrategy } from "@music-rpg/shared";

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

export async function buildPublishedRelease(
  ctx: CommandContext,
  db: Database,
  userId: string,
  options: { strategy?: ReleaseStrategy } = {},
) {
  const created = unwrap(await createCareer(ctx, { userId }));
  const careerId = created.career.id;

  unwrap(await selectCareerType(ctx, { careerId, userId, careerType: "SOLO" }));
  unwrap(await createSoloArtist(ctx, { careerId, userId, stageName: "KXMO" }));

  for (const question of await loadDiscoveryQuestions(db, "SOLO")) {
    const value = ANSWERS[question.id];
    if (value) {
      unwrap(await saveDiscoveryAnswer(ctx, { careerId, userId, questionId: question.id, value }));
    }
  }

  unwrap(await completeSoundDiscovery(ctx, { careerId, userId }));
  unwrap(await completeCareerOnboarding(ctx, { careerId, userId }));
  unwrap(await createFirstContact(ctx, { careerId, userId }));

  const [producer] = await db.select().from(characters).where(eq(characters.slug, "lex"));
  const selection = unwrap(await selectProducer(ctx, { careerId, userId, producerId: producer!.id }));
  const sessionId = selection.session.id;

  unwrap(await startCreativeSession(ctx, { sessionId, userId }));
  unwrap(await setCreativeDirection(ctx, { sessionId, userId, direction: DIRECTION }));

  const { proposals } = unwrap(await interpretCreativeDirection(ctx, { sessionId, userId }));
  const chosen = unwrap(
    await selectProducerProposal(ctx, { sessionId, userId, proposalId: proposals[0]!.id }),
  );
  const rendered = unwrap(await runGenerationJobToCompletion(ctx, { jobId: chosen.jobId, userId }));
  const master = unwrap(
    await requestMaster(ctx, { sessionId, userId, versionId: rendered.version!.id }),
  );
  unwrap(await runGenerationJobToCompletion(ctx, { jobId: master.jobId, userId }));

  unwrap(await renameTrack(ctx, { sessionId, userId, title: "NO RECEPTION" }));
  const saved = unwrap(await saveTrackToCatalogue(ctx, { sessionId, userId }));

  const planned = unwrap(
    await planRelease(ctx, { careerId, userId, trackId: saved.track.id, format: "SINGLE" }),
  );
  const releaseId = planned.release.id;

  unwrap(
    await setReleaseStrategy(ctx, {
      careerId,
      userId,
      releaseId,
      strategy: options.strategy ?? "DROP",
    }),
  );
  unwrap(await scheduleRelease(ctx, { careerId, userId, releaseId }));
  unwrap(await publishRelease(ctx, { careerId, userId, releaseId }));

  return { careerId, releaseId, trackId: saved.track.id };
}

