import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventQueue } from "../src/analytics/EventQueue";
import {
  Tracker,
  HEARTBEAT_MS,
  MAX_REPORTED_LAPS,
} from "../src/analytics/tracker";
import { createPlayerStore } from "../src/core/store";
import mockVideo from "../src/mock/dance-local.json";
import type { AnalyticsEvent } from "../src/analytics/types";
import type { VideoPayload } from "../src/core/types";

const video = mockVideo as VideoPayload;

/** Lets a test set what document.visibilityState reports. */
let visibility = "visible";

function harness() {
  const events: AnalyticsEvent[] = [];
  const queue = {
    push: (e: AnalyticsEvent) => void events.push(e),
    flushSync: () => {},
    stop: () => {},
  };
  const instance = createPlayerStore();
  const tracker = new Tracker(
    { eventsUrl: "/x", userId: null, playerVersion: "1.0.0", enabled: true },
    queue as unknown as EventQueue,
  );
  const detach = tracker.attach(instance.playerStore);
  return {
    events,
    instance,
    tracker,
    detach,
    beats: () => events.filter((e) => e.event === "heartbeat"),
    named: (n: string) => events.filter((e) => e.event === n),
  };
}

describe("heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibility = "visible";
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibility;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("beats every 15s while playing", () => {
    const h = harness();
    h.instance.playerStore.actions.loadVideo(video);
    h.instance.playerStore.actions._onStatusChange("playing");

    vi.advanceTimersByTime(HEARTBEAT_MS * 3);

    expect(h.beats()).toHaveLength(3);
  });

  it("does not beat while paused", () => {
    const h = harness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);
    a._onStatusChange("playing");
    vi.advanceTimersByTime(HEARTBEAT_MS);
    const whilePlaying = h.beats().length;

    a._onStatusChange("paused");
    vi.advanceTimersByTime(HEARTBEAT_MS * 5);

    // A paused video is not being watched: no beat may claim otherwise.
    expect(h.beats()).toHaveLength(whilePlaying);
  });

  it("does not beat while buffering", () => {
    const h = harness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);
    a._onStatusChange("playing");
    a._onStatusChange("loading");

    vi.advanceTimersByTime(HEARTBEAT_MS * 4);

    expect(h.beats()).toHaveLength(0);
  });

  it("does not beat while the tab is hidden", () => {
    const h = harness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);
    a._onStatusChange("playing");
    vi.advanceTimersByTime(HEARTBEAT_MS);
    const before = h.beats().length;

    visibility = "hidden";
    vi.advanceTimersByTime(HEARTBEAT_MS * 5);

    expect(h.beats()).toHaveLength(before);
  });

  it("carries what the time metrics need", () => {
    const h = harness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);
    a.setPlaybackRate(0.5);
    a.toggleMirror();
    a.setLoop(5, 10);
    a._onStatusChange("playing");

    vi.advanceTimersByTime(HEARTBEAT_MS);

    const beat = h.beats()[0];
    expect(beat.payload.speed).toBe(0.5);
    expect(beat.payload.mirrored).toBe(true);
    expect(beat.payload.inLoop).toBe(true);
    expect(beat.payload.seconds).toBe(HEARTBEAT_MS / 1000);
    expect(beat.payload).toHaveProperty("sectionId");
  });
});

describe("loop_repeated cap", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, setItem: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reports only the first five laps", () => {
    const h = harness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);
    a.setLoop(5, 10);
    for (let lap = 1; lap <= 12; lap++) {
      a._onTimeUpdate(10);
    }

    expect(h.named("loop_repeated").length).toBeLessThanOrEqual(
      MAX_REPORTED_LAPS,
    );
  });

  it("reports the full total in loop_ended", () => {
    const h = harness();
    const a = h.instance.playerStore.actions;
    a.loadVideo(video);
    a.setLoop(5, 10);
    for (let lap = 1; lap <= 9; lap++) {
      a._onTimeUpdate(10);
    }
    // Read before clearing: clearLoop() resets the counter.
    const laps = h.instance.playerStore.getState().repeatsDone;
    expect(laps).toBeGreaterThan(MAX_REPORTED_LAPS);

    a.clearLoop();

    const ended = h.named("loop_ended");
    expect(ended).toHaveLength(1);
    // The cap hides rows, never the count.
    expect(ended[0].payload.total).toBe(laps);
  });
});
