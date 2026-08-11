import {
  planRelease,
  publishRelease,
  scheduleRelease,
  setReleaseStrategy,
} from "@music-rpg/domain";
import { unwrap, type CreativeDirection, type ReleaseStrategy } from "@music-rpg/shared";
import type { UserRow } from "@music-rpg/database";
import type { TestContext } from "./context";
import { makeFinishedTrack } from "./studio";

/**
 * A record that is actually out.
 *
 * Walks the real M4 path — plan, strategy, schedule, publish — on top of the
 * real M3 path, because a reception suite that inserted a released track
 * directly would be simulating something the game cannot produce.
 */
export async function makePublishedRelease(
  test: TestContext,
  user: Pick<UserRow, "id">,
  title: string,
  options: {
    strategy?: ReleaseStrategy;
    stageName?: string;
    friction?: boolean;
    /** Who was in the room. Different producers make materially different records. */
    producerSlug?: string;
    /** What was asked for in the room. See `FinishedTrackOptions.direction`. */
    direction?: Partial<CreativeDirection>;
  } = {},
): Promise<{ careerId: string; trackId: string; releaseId: string }> {
  const made = await makeFinishedTrack(test, user, title, {
    ...(options.stageName ? { stageName: options.stageName } : {}),
    ...(options.friction ? { friction: true } : {}),
    ...(options.producerSlug ? { producerSlug: options.producerSlug } : {}),
    ...(options.direction ? { direction: options.direction } : {}),
  });

  const planned = unwrap(
    await planRelease(test.ctx, {
      careerId: made.careerId,
      userId: user.id,
      trackId: made.trackId,
      format: "SINGLE",
    }),
  );
  const releaseId = planned.release.id;

  unwrap(
    await setReleaseStrategy(test.ctx, {
      careerId: made.careerId,
      userId: user.id,
      releaseId,
      strategy: options.strategy ?? "DROP",
    }),
  );
  unwrap(await scheduleRelease(test.ctx, { careerId: made.careerId, userId: user.id, releaseId }));
  unwrap(await publishRelease(test.ctx, { careerId: made.careerId, userId: user.id, releaseId }));

  return { careerId: made.careerId, trackId: made.trackId, releaseId };
}
