import { SCHEMA_VERSION } from "./types";
import type { AnalyticsEvent, EventBatch } from "./types";

export const BATCH_SIZE = 20;
export const FLUSH_INTERVAL_MS = 10_000;
export const MAX_QUEUE = 200;
export const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1_000;

/** Swappable so tests can drive time and transport without a browser. */
export interface QueueDeps {
  /** Returns true when the batch was accepted. Must not throw. */
  send: (url: string, batch: EventBatch) => Promise<boolean>;
  /** Fire-and-forget path for page teardown; sendBeacon in the browser. */
  sendSync: (url: string, batch: EventBatch) => boolean;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  now: () => number;
}

export interface EventQueueOptions {
  url: string;
  batchSize?: number;
  flushIntervalMs?: number;
  maxQueue?: number;
  maxRetries?: number;
  deps?: Partial<QueueDeps>;
}

function defaultDeps(): QueueDeps {
  return {
    send: async (url, batch) => {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
          credentials: "same-origin",
          keepalive: true,
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    sendSync: (url, batch) => {
      try {
        const body = JSON.stringify(batch);
        // sendBeacon is the only transport the browser guarantees during
        // teardown; keepalive fetch is the fallback where it is missing.
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          return navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        }
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    now: () => Date.now(),
  };
}

/**
 * Batches analytics events and ships them out.
 *
 * Every public method swallows its own errors: analytics must never be able
 * to interrupt playback, so nothing in here is allowed to throw at the
 * caller. Failures cost events, not the video.
 */
export class EventQueue {
  private readonly url: string;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly maxQueue: number;
  private readonly maxRetries: number;
  private readonly deps: QueueDeps;

  private queue: AnalyticsEvent[] = [];
  private timer: unknown = null;
  private sending = false;
  private stopped = false;
  /** Events dropped because the queue was full; useful when debugging. */
  private dropped = 0;

  constructor(options: EventQueueOptions) {
    this.url = options.url;
    this.batchSize = options.batchSize ?? BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.maxQueue = options.maxQueue ?? MAX_QUEUE;
    this.maxRetries = options.maxRetries ?? MAX_RETRIES;
    this.deps = { ...defaultDeps(), ...options.deps };
  }

  /** Queues one event. Never throws, never sends synchronously. */
  push(event: AnalyticsEvent): void {
    if (this.stopped) return;
    try {
      this.queue.push(event);
      // oldest first: a tab left open for hours must not grow without bound
      if (this.queue.length > this.maxQueue) {
        this.dropped += this.queue.length - this.maxQueue;
        this.queue = this.queue.slice(-this.maxQueue);
      }
      if (this.queue.length >= this.batchSize) {
        void this.flush();
        return;
      }
      this.scheduleFlush();
    } catch {
      // an analytics failure is never worth surfacing
    }
  }

  get size(): number {
    return this.queue.length;
  }

  get droppedCount(): number {
    return this.dropped;
  }

  /** Sends what is queued, retrying with exponential backoff. */
  async flush(): Promise<void> {
    if (this.sending || this.queue.length === 0) return;
    this.cancelTimer();
    this.sending = true;

    const batch = this.take();
    try {
      // deliver() already retried with backoff; if it still failed the batch
      // is dropped on purpose rather than retried forever
      await this.deliver(batch);
    } catch {
      // dropped for the same reason
    } finally {
      this.sending = false;
      if (this.queue.length > 0) this.scheduleFlush();
    }
  }

  /**
   * Last-chance flush for pagehide/visibilitychange: one synchronous attempt,
   * no retries, because the page is going away.
   */
  flushSync(): void {
    if (this.queue.length === 0) return;
    try {
      this.cancelTimer();
      const batch = this.take();
      this.deps.sendSync(this.url, batch);
    } catch {
      // nothing left to do, the page is closing
    }
  }

  /** Stops accepting events and drops the timer. */
  stop(): void {
    this.stopped = true;
    this.cancelTimer();
  }

  private take(): EventBatch {
    const events = this.queue;
    this.queue = [];
    return { v: SCHEMA_VERSION, events };
  }

  private async deliver(batch: EventBatch): Promise<boolean> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      let ok = false;
      try {
        ok = await this.deps.send(this.url, batch);
      } catch {
        ok = false;
      }
      if (ok) return true;
      if (attempt === this.maxRetries) break;
      await this.wait(RETRY_BASE_MS * 2 ** attempt);
    }
    // give up after the retries: the batch is dropped rather than kept
    // forever, which is what stops a dead endpoint from filling the queue
    return false;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.deps.setTimeout(() => resolve(), ms);
    });
  }

  private scheduleFlush(): void {
    if (this.timer !== null || this.stopped) return;
    this.timer = this.deps.setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.deps.clearTimeout(this.timer);
    this.timer = null;
  }
}
