import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventQueue } from "../src/analytics/EventQueue";
import type { QueueDeps } from "../src/analytics/EventQueue";
import { Tracker, MILESTONES } from "../src/analytics/tracker";
import { createPlayerStore, initialState } from "../src/core/store";
import mockVideo from "../src/mock/dance-local.json";
import type { AnalyticsEvent, EventBatch } from "../src/analytics/types";
import type { VideoPayload } from "../src/core/types";

const video = mockVideo as VideoPayload;

function makeEvent(event = "test"): AnalyticsEvent {
  return {
    event,
    ts: 0,
    sessionId: "s1",
    userId: null,
    videoId: 1,
    playerVersion: "0.0.0",
    position: 0,
    payload: {},
  };
}

/** Collects batches and lets a test drive time and delivery by hand. */
function harness(overrides: Partial<QueueDeps> = {}) {
  const sent: EventBatch[] = [];
  const syncSent: EventBatch[] = [];
  const timers: Array<{ fn: () => void; ms: number }> = [];

  const deps: QueueDeps = {
    send: async (_url, batch) => {
      sent.push(batch);
      return true;
    },
    sendSync: (_url, batch) => {
      syncSent.push(batch);
      return true;
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length - 1;
    },
    clearTimeout: () => {},
    now: () => 0,
    ...overrides,
  };

  return {
    deps,
    sent,
    syncSent,
    timers,
    /** Runs every timer queued so far, as if the clock had advanced. */
    runTimers: async () => {
      const pending = timers.splice(0, timers.length);
      pending.forEach((t) => t.fn());
      await Promise.resolve();
    },
  };
}

describe("EventQueue", () => {
  it("flushes once the batch size is reached", async () => {
    const h = harness();
    const q = new EventQueue({ url: "/x", batchSize: 3, deps: h.deps });

    q.push(makeEvent("a"));
    q.push(makeEvent("b"));
    expect(h.sent).toHaveLength(0);

    q.push(makeEvent("c"));
    await Promise.resolve();

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.events.map((e) => e.event)).toEqual(["a", "b", "c"]);
    expect(h.sent[0]!.v).toBe(1);
    expect(q.size).toBe(0);
  });

  it("flushes on the timer when the batch never fills", async () => {
    const h = harness();
    const q = new EventQueue({
      url: "/x",
      batchSize: 50,
      flushIntervalMs: 10_000,
      deps: h.deps,
    });

    q.push(makeEvent("a"));
    expect(h.sent).toHaveLength(0);
    expect(h.timers[0]!.ms).toBe(10_000);

    await h.runTimers();
    await Promise.resolve();

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]!.events).toHaveLength(1);
  });

  it("caps the queue at maxQueue, dropping the oldest", () => {
    const h = harness();
    const q = new EventQueue({
      url: "/x",
      batchSize: 1000,
      maxQueue: 5,
      deps: h.deps,
    });

    for (let i = 0; i < 12; i += 1) q.push(makeEvent(`e${i}`));

    expect(q.size).toBe(5);
    expect(q.droppedCount).toBe(7);
  });

  it("retries then gives up without throwing", async () => {
    let attempts = 0;
    const h = harness({
      send: async () => {
        attempts += 1;
        return false;
      },
      // resolve backoff waits immediately
      setTimeout: (fn) => {
        fn();
        return 0;
      },
    });
    const q = new EventQueue({
      url: "/x",
      batchSize: 1,
      maxRetries: 3,
      deps: h.deps,
    });

    q.push(makeEvent("a"));
    await vi.waitFor(() => expect(attempts).toBe(4)); // first try + 3 retries

    // the batch is dropped rather than retried forever
    expect(q.size).toBe(0);
  });

  it("survives a transport that throws", async () => {
    const h = harness({
      send: async () => {
        throw new Error("network down");
      },
      setTimeout: (fn) => {
        fn();
        return 0;
      },
    });
    const q = new EventQueue({ url: "/x", batchSize: 1, deps: h.deps });

    expect(() => q.push(makeEvent("a"))).not.toThrow();
    await vi.waitFor(() => expect(q.size).toBe(0));
  });

  it("uses the synchronous transport for the final flush", () => {
    const h = harness();
    const q = new EventQueue({ url: "/x", batchSize: 50, deps: h.deps });

    q.push(makeEvent("a"));
    q.flushSync();

    expect(h.syncSent).toHaveLength(1);
    expect(h.sent).toHaveLength(0);
    expect(q.size).toBe(0);
  });
});

/** Drives a tracker off a real store, capturing what it queues. */
function trackerHarness() {
  const events: AnalyticsEvent[] = [];
  const queue = {
    push: (e: AnalyticsEvent) => void events.push(e),
    flushSync: () => {},
    stop: () => {},
  };
  const instance = createPlayerStore();
  const tracker = new Tracker(
    {
      eventsUrl: "/x",
      userId: 7,
      playerVersion: "1.0.0",
      enabled: true,
    },
    queue as unknown as EventQueue,
  );
  const detach = tracker.attach(instance.playerStore);
  return { events, instance, tracker, detach, names: () => events.map((e) => e.event) };
}

describe("Tracker", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {},
      },
    });
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", undefined);
  });

  it("reports each milestone once, even after rewinding past it", () => {
    const h = trackerHarness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);

    const at = (percent: number) =>
      a._onTimeUpdate((video.duration * percent) / 100);

    at(30);
    at(60);
    // back before 25% and forward again: no milestone may repeat
    at(10);
    at(60);

    const milestones = h.events
      .filter((e) => e.event === "milestone")
      .map((e) => e.payload.percent);

    expect(milestones).toEqual([25, 50]);
    expect(MILESTONES).toContain(25);
  });

  it("emits loop_created once and loop_repeated per repetition", () => {
    const h = trackerHarness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);

    a.setLoop(4, 8);
    a.setRepeatMode(3);
    a._onTimeUpdate(8); // first repeat
    a._onTimeUpdate(8); // second repeat

    const created = h.events.filter((e) => e.event === "loop_created");
    const repeated = h.events.filter((e) => e.event === "loop_repeated");

    expect(created).toHaveLength(1);
    expect(created[0]!.payload).toMatchObject({ start: 4, end: 8, duration: 4 });
    expect(repeated.map((e) => e.payload.repetition)).toEqual([1, 2]);
  });

  it("reports a lap of an infinite loop, which the store never counts", () => {
    const h = trackerHarness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);

    a.setLoop(4, 8);
    a.setRepeatMode("infinite");
    a._onTimeUpdate(8); // wraps back to 4
    a._onTimeUpdate(8); // and again

    const repeated = h.events.filter((e) => e.event === "loop_repeated");
    expect(repeated.map((e) => e.payload.repetition)).toEqual([1, 2]);
    // the store counts laps for infinite loops too; the badge shows "∞" and
    // ignores the number, analytics is what consumes it
    expect(h.instance.playerStore.getState().repeatsDone).toBe(2);
  });

  it("reports the learning events a practice session produces", () => {
    const h = trackerHarness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);

    a.play();
    a.setPlaybackRate(0.5);
    a.toggleMirror();
    a.pause();

    const names = h.names();
    expect(names).toContain("video_started");
    expect(names).toContain("video_played");
    expect(names).toContain("speed_changed");
    expect(names).toContain("mirror_toggled");
    expect(names).toContain("video_paused");

    const speed = h.events.find((e) => e.event === "speed_changed")!;
    expect(speed.payload).toEqual({ from: 1, to: 0.5 });
    // identity travels as an id and nothing else
    expect(speed.userId).toBe(7);
    expect(Object.keys(speed)).not.toContain("email");
  });

  it("emits video_started only on the first play", () => {
    const h = trackerHarness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);

    a.play();
    a.pause();
    a.play();

    const started = h.events.filter((e) => e.event === "video_started");
    expect(started).toHaveLength(1);
  });

  it("does not report a play for every rebuffer", () => {
    const h = trackerHarness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);

    a.play();
    // a stall: playing -> loading -> playing, which is not a user resuming
    a._onStatusChange("loading");
    a._onStatusChange("playing");
    a._onStatusChange("loading");
    a._onStatusChange("playing");

    const played = h.events.filter((e) => e.event === "video_played");
    expect(played).toHaveLength(1);
    // the stalls are still visible as technical events
    expect(h.names().filter((n) => n === "buffer_started")).toHaveLength(2);
  });

  it("reports a seek with from and to", () => {
    const h = trackerHarness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);

    a.seek(12);

    const seeked = h.events.find((e) => e.event === "video_seeked");
    expect(seeked).toBeDefined();
    expect(seeked!.payload.from).toBe(0);
    expect(seeked!.payload.to).toBe(12);
  });
});

describe("createTracker", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, setItem: () => {} },
    });
  });

  it("builds nothing when analytics are disabled", async () => {
    vi.stubGlobal("navigator", {});
    const { createTracker } = await import("../src/analytics/tracker");

    expect(
      createTracker({
        eventsUrl: "/x",
        userId: null,
        playerVersion: "1",
        enabled: false,
      }),
    ).toBeNull();
  });

  it("builds nothing when the visitor signalled Do Not Track", async () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    const { createTracker } = await import("../src/analytics/tracker");

    expect(
      createTracker({
        eventsUrl: "/x",
        userId: null,
        playerVersion: "1",
        enabled: true,
      }),
    ).toBeNull();
  });
});

describe("playback is never affected by analytics", () => {
  it("keeps the store working when every send fails", async () => {
    const h = harness({
      send: async () => {
        throw new Error("ingest is down");
      },
      sendSync: () => {
        throw new Error("ingest is down");
      },
      setTimeout: (fn) => {
        fn();
        return 0;
      },
    });
    const queue = new EventQueue({ url: "/x", batchSize: 1, deps: h.deps });
    const instance = createPlayerStore();
    const tracker = new Tracker(
      { eventsUrl: "/x", userId: null, playerVersion: "1", enabled: true },
      queue,
    );
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, setItem: () => {} },
    });
    vi.stubGlobal("document", undefined);
    tracker.attach(instance.playerStore);

    const a = instance.playerStore.actions;
    expect(() => {
      a.loadVideo(video);
      a.play();
      a.seek(10);
      a.setLoop(2, 6);
      a.pause();
    }).not.toThrow();

    // the player state is exactly what it would be with no analytics at all
    const state = instance.playerStore.getState();
    expect(state.status).toBe("paused");
    expect(state.loop).toEqual({ start: 2, end: 6 });
    expect(state.currentTime).toBe(10);
    expect(initialState.status).toBe("idle");

    expect(() => tracker.detach()).not.toThrow();
  });
});
