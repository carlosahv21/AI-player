/*
 * Regression cover for the loop bug found in the Prompt 13 review.
 *
 * The failure: requestVideoFrameCallback does not fire in a background tab,
 * and onTimeUpdate bailed out on `currentTime >= loop.end` — exactly the
 * sample that means "wrap now". So nothing wrapped: the element ran past the
 * loop end without bound (4s over in 6s of playback) while the store froze at
 * the end of the range.
 *
 * These tests drive the real VideoEngine against a fake element, so they
 * cover the engine/store wiring rather than the store alone.
 */
import { describe, expect, it } from "vitest";
import mockVideo from "../src/mock/dance-local.json";
import { createPlayerStore } from "../src/core/store";
import { VideoEngine } from "../src/engine/VideoEngine";
import type { VideoPayload } from "../src/core/types";

const video = mockVideo as VideoPayload;

/** Only the surface VideoEngine touches. */
class FakeVideo {
  currentTime = 0;
  duration = 60;
  paused = true;
  ended = false;
  playbackRate = 1;
  volume = 1;
  muted = false;
  preload = "";
  playsInline = false;
  error = null;
  buffered = { length: 1, start: () => 0, end: () => 60 };
  /** false simulates a background tab: the frame callback never runs. */
  rvfcEnabled = true;
  private listeners = new Map<string, Set<(e: unknown) => void>>();
  private pendingFrame:
    | ((now: number, meta: { mediaTime: number }) => void)
    | null = null;

  addEventListener(t: string, fn: (e: unknown) => void) {
    if (!this.listeners.has(t)) this.listeners.set(t, new Set());
    this.listeners.get(t)!.add(fn);
  }
  removeEventListener(t: string, fn: (e: unknown) => void) {
    this.listeners.get(t)?.delete(fn);
  }
  setAttribute() {}
  removeAttribute() {}
  load() {}
  play() {
    this.paused = false;
    this.emit("play");
    this.emit("playing");
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
    this.emit("pause");
  }
  emit(t: string) {
    this.listeners.get(t)?.forEach((fn) => fn({ type: t }));
  }
  requestVideoFrameCallback(
    cb: (now: number, meta: { mediaTime: number }) => void,
  ) {
    if (!this.rvfcEnabled) return 1;
    this.pendingFrame = cb;
    return 1;
  }
  cancelVideoFrameCallback() {
    this.pendingFrame = null;
  }

  /** Advance playback, firing the callbacks a real browser would. */
  advance(dt: number, { frames = true } = {}) {
    this.currentTime = Math.min(this.currentTime + dt, this.duration);
    if (frames && this.pendingFrame) {
      const cb = this.pendingFrame;
      this.pendingFrame = null;
      cb(0, { mediaTime: this.currentTime });
    }
    this.emit("timeupdate");
  }
}

function setup() {
  const { playerStore } = createPlayerStore();
  const el = new FakeVideo();
  const engine = new VideoEngine(el as unknown as HTMLVideoElement, playerStore);
  engine.attach();
  playerStore.actions.loadVideo(video);
  el.emit("loadedmetadata");
  return { store: playerStore, el };
}

/** Puts a playing loop over [start,end] with the element at start. */
function loopAt(start: number, end: number) {
  const { store, el } = setup();
  store.actions.seek(start);
  el.currentTime = start;
  store.actions.setLoop(start, end);
  store.actions.play();
  void el.play();
  return { store, el };
}

describe("loop holds the range", () => {
  it("wraps in a background tab, where the frame callback never fires", () => {
    const { store, el } = loopAt(10, 12);
    el.rvfcEnabled = false;

    for (let i = 0; i < 60; i++) el.advance(0.1, { frames: false });

    // before the fix: element ran to 16s and repeatsDone stayed at 0
    expect(el.currentTime).toBeLessThanOrEqual(12.2);
    expect(store.getState().repeatsDone).toBeGreaterThan(0);
  });

  it("seeks the element back, not just the store", () => {
    const { store, el } = loopAt(10, 12);
    el.rvfcEnabled = false;
    el.currentTime = 11.9;

    el.advance(0.2, { frames: false });

    expect(store.getState().repeatsDone).toBe(1);
    expect(el.currentTime).toBeCloseTo(10, 1);
  });

  it("still wraps on the frame callback when the tab is visible", () => {
    const { store, el } = loopAt(10, 12);
    for (let i = 0; i < 40; i++) el.advance(0.1);
    expect(el.currentTime).toBeLessThanOrEqual(12.2);
    expect(store.getState().repeatsDone).toBeGreaterThan(0);
  });

  it("holds the range at a rate other than 1x", () => {
    const { el } = loopAt(10, 12);
    el.playbackRate = 2;
    for (let i = 0; i < 30; i++) el.advance(0.2);
    expect(el.currentTime).toBeLessThanOrEqual(12.4);
  });

  it("holds a range that ends near the end of the video", () => {
    const { store, el } = loopAt(58, 59.9);
    for (let i = 0; i < 40; i++) el.advance(0.1);
    expect(el.currentTime).toBeLessThanOrEqual(60);
    expect(store.getState().status).not.toBe("ended");
  });

  it("switches to a second loop without leaking the first", () => {
    const { store, el } = loopAt(10, 12);
    for (let i = 0; i < 15; i++) el.advance(0.1);

    store.actions.setLoop(20, 22);
    el.currentTime = 20;
    for (let i = 0; i < 40; i++) el.advance(0.1);

    expect(store.getState().loop).toEqual({ start: 20, end: 22 });
    expect(el.currentTime).toBeLessThanOrEqual(22.2);
  });

  it("releases a finite loop once the repeats are done", () => {
    const { store, el } = loopAt(10, 12);
    store.actions.setRepeatMode(3);
    for (let i = 0; i < 120; i++) el.advance(0.1);
    expect(store.getState().loop).toBeNull();
    expect(store.getState().repeatMode).toBeNull();
  });
});
