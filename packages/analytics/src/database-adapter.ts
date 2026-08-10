import { analyticsEvents, type DbClient } from "@music-rpg/database";
import { ids } from "@music-rpg/shared";
import type { AnalyticsAdapter } from "./adapter";
import type { AnalyticsEvent } from "./events";

/**
 * Development sink: writes to its own table, never to `game_events`.
 * Deliberately fire-and-forget — a failed analytics write must not surface to
 * the player or roll back a command.
 */
export class DatabaseAnalyticsAdapter implements AnalyticsAdapter {
  constructor(private readonly db: DbClient) {}

  async track(event: AnalyticsEvent): Promise<void> {
    try {
      await this.db.insert(analyticsEvents).values({
        id: ids.generic(),
        name: event.name,
        userId: event.userId ?? null,
        careerId: event.careerId ?? null,
        anonymousId: event.anonymousId ?? null,
        properties: event.properties ?? {},
        ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
      });
    } catch (error) {
      console.warn("[analytics] database sink failed", error);
    }
  }
}
