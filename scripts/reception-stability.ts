/**
 * Is the story stable?
 *
 * The simulator's jitter is deliberately small, and the phrase a player reads
 * should describe the record rather than the seed. This runs the same career and
 * the same record under many seeds and reports which trajectory each produces.
 *
 * A healthy result is one dominant classification. A spread means the
 * classifier is sitting on a threshold rather than describing anything.
 *
 *     npx tsx scripts/reception-stability.ts [runs]
 */
import { MemoryAnalyticsAdapter } from "@music-rpg/analytics";
import { CredentialsAuthService } from "@music-rpg/auth";
import {
  createDatabase,
  runMigrations,
  seedDatabase,
  releasePerformance,
  releaseCohortPerformance,
  audienceCohorts,
  eq,
} from "@music-rpg/database";
import {
  getReleaseReception,
  simulateReceptionTick,
  type CommandContext,
} from "@music-rpg/domain";
import { DevelopmentModerationService } from "@music-rpg/moderation";
import { unwrap } from "@music-rpg/shared";
import { buildPublishedRelease } from "./reception-fixture";

async function run(seed: string) {
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
      email: `stability-${seed}@example.test`,
      password: "correct horse battery",
      displayName: "Kamo",
    }),
  );

  const ids = await buildPublishedRelease(ctx, handle.db, user.id);

  for (let day = 1; day <= 3; day += 1) {
    unwrap(
      await simulateReceptionTick(ctx, {
        careerId: ids.careerId,
        userId: user.id,
        releaseId: ids.releaseId,
        seed,
      }),
    );
  }

  const view = (await getReleaseReception(handle.db, ids.releaseId))!;
  const [performance] = await handle.db
    .select()
    .from(releasePerformance)
    .where(eq(releasePerformance.releaseId, ids.releaseId));
  const cohorts = await handle.db
    .select()
    .from(releaseCohortPerformance)
    .where(eq(releaseCohortPerformance.releaseId, ids.releaseId));
  const definitions = await handle.db.select().from(audienceCohorts);

  const scene = cohorts.find(
    (row) => definitions.find((entry) => entry.id === row.cohortId)?.slug === "SCENE_HEADS",
  )!;

  await handle.close();

  return {
    seed,
    trajectory: view.trajectory,
    listeners: performance!.uniqueListeners,
    engaged: performance!.engagedListeners,
    fans: performance!.fanConversions,
    sceneEngagedShare: scene.engagedListeners / Math.max(1, performance!.engagedListeners),
    sceneExposureShare: scene.exposures / Math.max(1, performance!.totalExposures),
    sceneFans: scene.fanConversions,
    lastDay: view.days[view.days.length - 1]!.line,
    insight: view.insight,
  };
}

async function main() {
  const runs = Number(process.argv[2] ?? 12);
  const results = [];

  for (let index = 0; index < runs; index += 1) {
    results.push(await run(`stability-${index}`));
  }

  console.log(
    "seed            trajectory           listeners  engaged  fans  sceneIdx  sceneFans",
  );
  for (const result of results) {
    const index = result.sceneEngagedShare / Math.max(0.0001, result.sceneExposureShare);
    console.log(
      `${result.seed.padEnd(16)}${result.trajectory.padEnd(21)}${String(result.listeners).padStart(9)}${String(result.engaged).padStart(9)}${String(result.fans).padStart(6)}${index.toFixed(3).padStart(10)}${String(result.sceneFans).padStart(11)}`,
    );
  }

  const tallyOf = (pick: (result: (typeof results)[number]) => string) => {
    const tally = new Map<string, number>();
    for (const result of results) tally.set(pick(result), (tally.get(pick(result)) ?? 0) + 1);
    return [...tally].sort((a, b) => b[1] - a[1]);
  };

  console.log("\ntrajectory");
  for (const [value, count] of tallyOf((result) => result.trajectory)) {
    console.log(`  ${value.padEnd(40)} ${count}/${runs}`);
  }

  console.log("\nfinal day's line");
  for (const [value, count] of tallyOf((result) => result.lastDay)) {
    console.log(`  ${value.padEnd(40)} ${count}/${runs}`);
  }

  console.log("\ninsight");
  for (const [value, count] of tallyOf((result) => result.insight ?? "(none)")) {
    console.log(`  ${value.padEnd(60)} ${count}/${runs}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
