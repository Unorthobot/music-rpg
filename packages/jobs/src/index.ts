/**
 * Asynchronous work port.
 *
 * M0/M1 enqueue nothing meaningful, but every later system (audio generation,
 * artwork, world ticks, audience simulation) is asynchronous, so the boundary
 * exists now. The development queue runs handlers in-process on the next tick;
 * a hosted implementation (SQS, QStash, pg-boss) implements the same interface.
 */
export type JobPayload = Record<string, unknown>;

export type Job<T extends JobPayload = JobPayload> = {
  id: string;
  type: string;
  payload: T;
  /** Delay in milliseconds before the job becomes runnable. */
  delayMs?: number;
};

export type JobHandler<T extends JobPayload = JobPayload> = (job: Job<T>) => Promise<void>;

export interface JobQueue {
  enqueue<T extends JobPayload>(type: string, payload: T, options?: { delayMs?: number }): Promise<string>;
  register<T extends JobPayload>(type: string, handler: JobHandler<T>): void;
  /** Test/dev helper: resolves once the queue is idle. */
  drain(): Promise<void>;
}

export class DevelopmentJobQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler<any>>();
  private readonly running = new Set<Promise<void>>();
  private counter = 0;

  async enqueue<T extends JobPayload>(
    type: string,
    payload: T,
    options: { delayMs?: number } = {},
  ): Promise<string> {
    this.counter += 1;
    const id = `job_${this.counter}`;
    const handler = this.handlers.get(type);

    if (!handler) {
      console.warn(`[jobs] no handler registered for "${type}" — job ${id} dropped`);
      return id;
    }

    const task = (async () => {
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      try {
        await handler({ id, type, payload });
      } catch (error) {
        console.error(`[jobs] handler for "${type}" failed`, error);
      }
    })();

    this.running.add(task);
    void task.finally(() => this.running.delete(task));
    return id;
  }

  register<T extends JobPayload>(type: string, handler: JobHandler<T>): void {
    this.handlers.set(type, handler as JobHandler<any>);
  }

  async drain(): Promise<void> {
    while (this.running.size > 0) {
      await Promise.all([...this.running]);
    }
  }
}
