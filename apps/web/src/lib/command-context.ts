import "server-only";
import {
  ConsoleAnalyticsAdapter,
  DatabaseAnalyticsAdapter,
  MultiAnalyticsAdapter,
  NoopAnalyticsAdapter,
  type AnalyticsAdapter,
} from "@music-rpg/analytics";
import { createAiProvider } from "@music-rpg/ai";
import { DevelopmentModerationService } from "@music-rpg/moderation";
import type { Database } from "@music-rpg/database";
import type { CommandContext } from "@music-rpg/domain";
import { getAppDb } from "./db";

/**
 * Builds the dependency bundle domain commands run against.
 *
 * The analytics adapter is chosen by environment, never by feature code — this
 * is the swap point for a vendor SDK.
 */
function createAnalytics(db: Database): AnalyticsAdapter {
  const adapters: AnalyticsAdapter[] = [new DatabaseAnalyticsAdapter(db)];

  switch (process.env.ANALYTICS_ADAPTER) {
    case "noop":
      return new NoopAnalyticsAdapter();
    case "console":
    default:
      adapters.push(new ConsoleAnalyticsAdapter());
  }

  return new MultiAnalyticsAdapter(adapters);
}

export async function createCommandContext(): Promise<CommandContext> {
  const db = await getAppDb();

  return {
    db,
    analytics: createAnalytics(db),
    moderation: new DevelopmentModerationService(),
    ai: createAiProvider(),
  };
}
