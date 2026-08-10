import type { AnalyticsAdapter } from "@music-rpg/analytics";
import type { Database } from "@music-rpg/database";
import type { ModerationService } from "@music-rpg/moderation";
import type { AiProvider } from "@music-rpg/ai";

/**
 * Everything a command is allowed to touch.
 *
 * Commands receive their dependencies rather than reaching for singletons, so
 * tests run against an in-memory analytics adapter and a throwaway database
 * without any global state.
 */
export type CommandContext = {
  db: Database;
  analytics: AnalyticsAdapter;
  moderation: ModerationService;
  /** Optional: the deterministic simulation never requires a model. */
  ai?: AiProvider;
  /** Injectable clock — deterministic tests, and later, world time control. */
  now?: () => Date;
};

export function contextNow(ctx: CommandContext): Date {
  return ctx.now ? ctx.now() : new Date();
}

/**
 * Analytics must never break a command. A vendor outage is not a reason a
 * player cannot create their artist.
 */
export async function track(
  ctx: CommandContext,
  event: Parameters<AnalyticsAdapter["track"]>[0],
): Promise<void> {
  try {
    await ctx.analytics.track(event);
  } catch (error) {
    console.warn("[analytics] track failed", error);
  }
}
