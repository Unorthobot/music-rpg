/**
 * The three-day reception report.
 *
 * Builds a real career through the real commands — no fixtures inserted behind
 * the domain's back — publishes one Underground single, simulates three days
 * and prints what actually happened, cohort by cohort.
 *
 * This exists because the milestone's own instruction is to look at the
 * simulation's output before designing anything around it. Run it with:
 *
 *     npx tsx scripts/reception-report.ts
 */
import { MemoryAnalyticsAdapter } from "@music-rpg/analytics";
import { CredentialsAuthService } from "@music-rpg/auth";
import {
  artistAudience,
  audienceCohorts,
  careerMetricPressure,
  careers,
  characters,
  createDatabase,
  eq,
  releaseCohortPerformance,
  releasePerformance,
  releases,
  runMigrations,
  seedDatabase,
  soundProfiles,
  trackVersions,
  tracks,
  type Database,
} from "@music-rpg/database";
import {
  completeCareerOnboarding,
  completeSoundDiscovery,
  createCareer,
  createFirstContact,
  createSoloArtist,
  getCareerCounters,
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
  simulateReceptionTick,
  startCreativeSession,
  type CommandContext,
} from "@music-rpg/domain";
import { DevelopmentModerationService } from "@music-rpg/moderation";
import {
  unwrap,
  type CreativeDirection,
  type ReceptionTickResult,
  type ReleaseStrategy,
} from "@music-rpg/shared";

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

async function buildPublishedRelease(
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

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function printDay(result: ReceptionTickResult): void {
  console.log(`\n  DAY ${result.dayIndex}`);
  console.log(
    "  cohort              fit   pop'n    expo  (wom)  listen  engaged  repeat  fans  shares  wom→",
  );
  for (const outcome of result.cohorts) {
    console.log(
      `  ${outcome.cohortSlug.padEnd(18)}${pad(outcome.evaluation.fit.toFixed(2), 5)}${pad(
        outcome.addressablePopulation,
        8,
      )}${pad(outcome.exposures, 8)}${pad(`(${outcome.wordOfMouthExposures})`, 7)}${pad(
        outcome.listeners,
        8,
      )}${pad(outcome.engagedListeners, 9)}${pad(outcome.repeatListeners, 8)}${pad(
        outcome.fanConversions,
        6,
      )}${pad(outcome.shares, 8)}${pad(outcome.wordOfMouth, 6)}`,
    );
  }
  const t = result.totals;
  console.log(
    `  ${"TOTAL".padEnd(18)}${pad("", 5)}${pad("", 8)}${pad(t.exposures, 8)}${pad("", 7)}${pad(
      t.listeners,
      8,
    )}${pad(t.engagedListeners, 9)}${pad(t.repeatListeners, 8)}${pad(t.fanConversions, 6)}${pad(
      t.shares,
      8,
    )}${pad(t.wordOfMouth, 6)}`,
  );
  console.log(
    `  momentum ${result.momentumBefore.toFixed(2)} → ${result.momentumAfter.toFixed(2)}  ·  pressure  fame +${result.pressure.fame.toFixed(4)}  respect +${result.pressure.respect.toFixed(4)}  heat +${result.pressure.heat.toFixed(4)}`,
  );
}

/**
 * The same three days from a fresh world, with one input changed.
 *
 * Determinism alone proves nothing — a simulator that ignored its inputs would
 * pass it. These runs are how we check that a changed input moves the outcome,
 * and moves it where it should.
 */
async function runVariant(
  label: string,
  mutate?: (db: Database, ids: { careerId: string; releaseId: string }) => Promise<void>,
): Promise<{
  label: string;
  days: ReceptionTickResult[];
  fame: number;
  respect: number;
  heat: number;
}> {
  const handle = await createDatabase({ dataDir: "memory://" });
  await runMigrations(handle);
  await seedDatabase(handle.db);

  const ctx: CommandContext = {
    db: handle.db,
    analytics: new MemoryAnalyticsAdapter(),
    moderation: new DevelopmentModerationService(),
  };

  const auth = new CredentialsAuthService(handle.db);
  const user = unwrap(
    await auth.register({
      email: `variant-${label.replace(/\W+/g, "-")}@example.test`,
      password: "correct horse battery",
      displayName: "Kamo",
    }),
  );

  const ids = await buildPublishedRelease(ctx, handle.db, user.id);
  if (mutate) await mutate(handle.db, ids);

  const days: ReceptionTickResult[] = [];
  for (let day = 1; day <= 3; day += 1) {
    const tick = unwrap(
      await simulateReceptionTick(ctx, {
        careerId: ids.careerId,
        userId: user.id,
        releaseId: ids.releaseId,
        seed: "golden-m5",
      }),
    );
    days.push(tick.result);
  }

  const [pressure] = await handle.db
    .select()
    .from(careerMetricPressure)
    .where(eq(careerMetricPressure.careerId, ids.careerId));

  await handle.close();

  return {
    label,
    days,
    fame: pressure!.fameAccrued,
    respect: pressure!.respectAccrued,
    heat: pressure!.heatAccrued,
  };
}

function totalFor(days: ReceptionTickResult[], slug: string, key: "exposures" | "engagedListeners" | "fanConversions"): number {
  return days.reduce(
    (sum, day) => sum + (day.cohorts.find((cohort) => cohort.cohortSlug === slug)?.[key] ?? 0),
    0,
  );
}

async function main() {
  /*
   * Throwaway by default. `--persist <dir>` writes to a real PGlite directory
   * instead, which is how the World Control reception view gets something to
   * inspect without a UI existing yet to produce it.
   */
  const persistAt = process.argv.includes("--persist")
    ? process.argv[process.argv.indexOf("--persist") + 1]
    : undefined;
  const email = process.argv.includes("--email")
    ? process.argv[process.argv.indexOf("--email") + 1]!
    : "report@example.test";

  const handle = await createDatabase({ dataDir: persistAt ?? "memory://" });
  await runMigrations(handle);
  await seedDatabase(handle.db);

  const ctx: CommandContext = {
    db: handle.db,
    analytics: new MemoryAnalyticsAdapter(),
    moderation: new DevelopmentModerationService(),
  };

  const auth = new CredentialsAuthService(handle.db);
  const user = unwrap(
    await auth.register({ email, password: "correct horse battery", displayName: "Kamo" }),
  );

  const { careerId, releaseId, trackId } = await buildPublishedRelease(ctx, handle.db, user.id);

  const [trackRow] = await handle.db.select().from(tracks).where(eq(tracks.id, trackId));
  const [version] = await handle.db
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.id, trackRow!.currentMasterVersionId!));

  console.log("=".repeat(104));
  console.log("KXMO — NO RECEPTION — Johannesburg — The Underground — SINGLE — DROP");
  console.log("=".repeat(104));
  console.log("\nTHE RECORD");
  console.log(`  quality       ${JSON.stringify(version!.qualityMetrics)}`);
  console.log(`  sound         ${JSON.stringify(version!.soundProfile)}`);

  const cohorts = await handle.db.select().from(audienceCohorts);
  console.log("\nTHE WORLD'S AUDIENCES");
  for (const cohort of cohorts) {
    console.log(`  ${cohort.slug.padEnd(18)} population ${pad(cohort.size, 7)}`);
  }

  const atPublication = await getCareerCounters(handle.db, { id: careerId });
  const [beforeCareer] = await handle.db.select().from(careers).where(eq(careers.id, careerId));
  console.log("\nIMMEDIATELY AFTER PUBLICATION");
  console.log(
    `  listeners ${atPublication.monthlyListeners} · fans ${atPublication.fans} · fame ${beforeCareer!.fame} · respect ${beforeCareer!.respect} · heat ${beforeCareer!.heat} · legacy ${beforeCareer!.legacy}`,
  );

  for (const day of [1, 2, 3]) {
    // The same seed the golden test uses, so the report and the suite describe
    // the same three days.
    const tick = unwrap(
      await simulateReceptionTick(ctx, { careerId, userId: user.id, releaseId, seed: "golden-m5" }),
    );
    printDay(tick.result);
    if (tick.dayIndex !== day) throw new Error("unexpected day");
  }

  const [performance] = await handle.db
    .select()
    .from(releasePerformance)
    .where(eq(releasePerformance.releaseId, releaseId));
  const cohortRows = await handle.db
    .select()
    .from(releaseCohortPerformance)
    .where(eq(releaseCohortPerformance.releaseId, releaseId));
  const audience = await handle.db
    .select()
    .from(artistAudience)
    .where(eq(artistAudience.careerId, careerId));
  const [pressure] = await handle.db
    .select()
    .from(careerMetricPressure)
    .where(eq(careerMetricPressure.careerId, careerId));
  const [career] = await handle.db.select().from(careers).where(eq(careers.id, careerId));
  const counters = await getCareerCounters(handle.db, { id: careerId });

  console.log("\n" + "=".repeat(104));
  console.log("AFTER THREE DAYS");
  console.log("=".repeat(104));
  console.log("\nRELEASE TOTALS");
  console.log(
    `  exposure ${performance!.totalExposures} · listeners ${performance!.uniqueListeners} · engaged ${performance!.engagedListeners} · repeat ${performance!.repeatListeners} · fans ${performance!.fanConversions} · shares ${performance!.shares} · momentum ${performance!.currentMomentum.toFixed(2)}`,
  );

  console.log("\nBY COHORT");
  for (const row of cohortRows) {
    const cohort = cohorts.find((entry) => entry.id === row.cohortId)!;
    const standing = audience.find((entry) => entry.cohortId === row.cohortId);
    console.log(
      `  ${cohort.slug.padEnd(18)} expo ${pad(row.exposures, 5)} · listen ${pad(row.listeners, 5)} · engaged ${pad(row.engagedListeners, 4)} · repeat ${pad(row.repeatListeners, 4)} · fans ${pad(row.fanConversions, 3)} · shares ${pad(row.shares, 3)} · affinity ${pad(standing?.affinity ?? 0, 4)} · expectation ${pad(standing?.expectation ?? 0, 4)}`,
    );
  }

  console.log("\nCAREER");
  console.log(
    `  listeners ${counters.monthlyListeners} · fans ${counters.fans} · reach ${counters.reach}`,
  );
  console.log(
    `  fame ${career!.fame} · respect ${career!.respect} · heat ${career!.heat} · legacy ${career!.legacy}`,
  );
  console.log(
    `  accrued: fame ${pressure!.fameAccrued.toFixed(4)} · respect ${pressure!.respectAccrued.toFixed(4)} · heat ${pressure!.heatAccrued.toFixed(4)}`,
  );

  if (persistAt) {
    console.log(`\n  career id: ${careerId}`);
    console.log(`  persisted to ${persistAt} — inspect at /world-control/careers/${careerId}`);
  }

  await handle.close();

  if (process.argv.includes("--no-compare")) return;

  /* --- One input at a time ---------------------------------------------- */

  const [base, reachier, sceneward] = await Promise.all([
    runVariant("baseline"),
    // The stored reach modifier. Nothing else moves.
    runVariant("reach 0 → 60", async (db, { releaseId }) => {
      await db
        .update(releases)
        .set({ audienceModifiers: { anticipation: 0, reach: 60, credibility: 0 } })
        .where(eq(releases.id, releaseId));
    }),
    // The artist's own Sound DNA, moved onto the scene heads' region.
    runVariant("Sound DNA → scene", async (db, { careerId: id }) => {
      const [career] = await db.select().from(careers).where(eq(careers.id, id));
      await db
        .update(soundProfiles)
        .set({
          rawPolished: -0.45,
          accessibleExperimental: 0.4,
          darkBright: -0.25,
          intimateAnthemic: -0.2,
        })
        .where(eq(soundProfiles.ownerId, career!.controlledEntityId!));
    }),
  ]);

  console.log("\n" + "=".repeat(104));
  console.log("SENSITIVITY — the same three days with one input changed");
  console.log("=".repeat(104));

  for (const variant of [base, reachier, sceneward]) {
    const day1 = variant.days[0]!;
    console.log(`\n  ${variant.label}`);
    console.log(
      "  cohort              fit  artistFit  reach×   3d expo  3d engaged  3d fans",
    );
    for (const slug of ["SCENE_HEADS", "CASUAL_LISTENERS", "TASTEMAKERS"]) {
      const outcome = day1.cohorts.find((cohort) => cohort.cohortSlug === slug)!;
      console.log(
        `  ${slug.padEnd(18)}${pad(outcome.evaluation.fit.toFixed(3), 5)}${pad(
          outcome.evaluation.artistFit.toFixed(3),
          11,
        )}${pad(outcome.evaluation.reachBoost.toFixed(3), 8)}${pad(
          totalFor(variant.days, slug, "exposures"),
          10,
        )}${pad(totalFor(variant.days, slug, "engagedListeners"), 12)}${pad(
          totalFor(variant.days, slug, "fanConversions"),
          9,
        )}`,
      );
    }
    console.log(
      `  → fame ${variant.fame.toFixed(4)} · respect ${variant.respect.toFixed(4)} · heat ${variant.heat.toFixed(4)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
