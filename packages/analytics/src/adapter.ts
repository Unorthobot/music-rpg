import type { AnalyticsEvent } from "./events";

/**
 * Vendor-neutral analytics port.
 *
 * Swapping in Segment/PostHog/etc. means writing one adapter; no product code
 * changes. Adapters must never throw into caller code — analytics failing is
 * not a reason for a player's career command to fail.
 */
export interface AnalyticsAdapter {
  track(event: AnalyticsEvent): Promise<void>;
  flush?(): Promise<void>;
}

export class NoopAnalyticsAdapter implements AnalyticsAdapter {
  async track(): Promise<void> {
    // intentionally empty
  }
}

export class ConsoleAnalyticsAdapter implements AnalyticsAdapter {
  constructor(private readonly log: (...args: unknown[]) => void = console.info) {}

  async track(event: AnalyticsEvent): Promise<void> {
    this.log(`[analytics] ${event.name}`, {
      userId: event.userId ?? null,
      careerId: event.careerId ?? null,
      ...event.properties,
    });
  }
}

/** Used by tests and by the world-control funnel view. */
export class MemoryAnalyticsAdapter implements AnalyticsAdapter {
  readonly events: AnalyticsEvent[] = [];

  async track(event: AnalyticsEvent): Promise<void> {
    this.events.push(event);
  }

  names(): string[] {
    return this.events.map((event) => event.name);
  }

  clear(): void {
    this.events.length = 0;
  }
}

/**
 * Fans out to several adapters (e.g. console in dev + database sink) and
 * swallows individual failures.
 */
export class MultiAnalyticsAdapter implements AnalyticsAdapter {
  constructor(private readonly adapters: AnalyticsAdapter[]) {}

  async track(event: AnalyticsEvent): Promise<void> {
    await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          await adapter.track(event);
        } catch (error) {
          console.warn("[analytics] adapter failed", error);
        }
      }),
    );
  }

  async flush(): Promise<void> {
    await Promise.all(this.adapters.map((adapter) => adapter.flush?.()));
  }
}
