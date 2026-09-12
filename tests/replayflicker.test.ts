/*
 * Cover for the play/pause flicker at the end of a video (commit 3a239b9's
 * neighbour), which shipped without tests.
 *
 * The failure: replaying a finished video hit two branches of syncTransport in
 * one pass. store.play() sets currentTime 0 AND status "playing" in a single
 * set(), so the engine seeked to 0 and called play(); the element then fired
 * its own `ended`, the store went back to "ended", and the next pass called
 * pause() while that play() was still resolving. The play() rejected with
 * AbortError, the catch forced "paused", and the video sat at 0 refusing to
 * start.
 *
 * The fix ignores AbortError. The risk in that fix is the reason for the third
 * test: an ignored rejection must not swallow a REAL one. An autoplay refusal
 * has to still report itself and leave the player paused, or the play button
 * does nothing and nothing explains why.
 */
import { describe, expect, it, vi } from "vitest";
import mockVideo from "../src/mock/dance-local.json";
import { createPlayerStore } from "../src/core/store";
import { VideoEngine } from "../src/engine/VideoEngine";
import type { VideoPayload } from "../src/core/types";

const video = mockVideo as VideoPayload;

/** How the element answers play(); the whole point of these tests. */
type PlayBehaviour = "resolve" | "abort" | "reject-autoplay";

class FakeVideo {
  currentTime = 0;
  duration = 21.9;
  paused = true;
  ended = false;
  playbackRate = 1;
  volume = 1;
  muted = false;
  preload = "";
  playsInline = false;
  error = null;
  buffered = { length: 1, start: () => 0, end: () => 21.9 };
  playBehaviour: PlayBehaviour = "resolve";
  playCalls = 0;
  pauseCalls = 0;
  private listeners = new Map<string, Set<(e: unknown) => void>>();

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
  emit(t: string) {
    this.listeners.get(t)?.forEach((fn) => fn({ type: t }));
  }

  play(): Promise<void> {
    this.playCalls += 1;
    if (this.playBehaviour === "abort") {
      // the browser resolving a race, not a refusal
      return Promise.reject(
        new DOMException("The play() request was interrupted", "AbortError"),
      );
    }
    if (this.playBehaviour === "reject-autoplay") {
      return Promise.reject(
        new DOMException("play() failed because the user didn't interact", "NotAllowedError"),
      );
    }
    this.paused = false;
    this.ended = false;
    this.emit("play");
    this.emit("playing");
    return Promise.resolve();
  }

  pause() {
    this.pauseCalls += 1;
    this.paused = true;
    this.emit("pause");
  }

  /** Play to the very end, exactly as a browser reports it. */
  runToEnd() {
    this.currentTime = this.duration;
    this.emit("timeupdate");
    this.paused = true;
    this.ended = true;
    this.emit("ended");
  }

  requestVideoFrameCallback() {
    return 1;
  }
  cancelVideoFrameCallback() {}
}

function setup() {
  const { playerStore } = createPlayerStore();
  const el = new FakeVideo();
  const engine = new VideoEngine(el as unknown as HTMLVideoElement, playerStore);
  engine.attach();
  playerStore.actions.loadVideo(video);
  el.emit("loadedmetadata");
  return { store: playerStore, el, engine };
}

/** Lets the play() promise's catch run before asserting. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("replaying a finished video", () => {
  it("restarts from zero and stays playing", async () => {
    const { store, el } = setup();
    store.actions.play();
    await settle();

    el.runToEnd();
    expect(store.getState().status).toBe("ended");

    store.actions.play();
    await settle();

    expect(store.getState().currentTime).toBe(0);
    expect(store.getState().status).toBe("playing");
    expect(el.paused).toBe(false);
  });

  it("does not pause the element while the replay is starting", async () => {
    const { store, el } = setup();
    store.actions.play();
    await settle();
    el.runToEnd();

    const pausesBefore = el.pauseCalls;
    store.actions.play();
    await settle();

    // the flicker was exactly this: a pause() landing on the fresh play()
    expect(el.pauseCalls).toBe(pausesBefore);
    expect(el.paused).toBe(false);
  });

  it("survives a replay even when the element reports ended again", async () => {
    const { store, el } = setup();
    store.actions.play();
    await settle();
    el.runToEnd();

    store.actions.play();
    // the element's own late `ended` from the previous run
    el.ended = true;
    el.emit("ended");
    await settle();
    // and the replay proceeds
    el.ended = false;
    store.actions.play();
    await settle();

    expect(store.getState().status).toBe("playing");
  });
});

describe("play() rejections", () => {
  it("ignores AbortError and leaves the status alone", async () => {
    const { store, el } = setup();
    el.playBehaviour = "abort";

    store.actions.play();
    await settle();

    // AbortError says nothing about whether playback can happen, so the
    // status must not be forced to paused behind the user's back
    expect(store.getState().status).toBe("playing");
    expect(el.playCalls).toBe(1);
  });

  it("reports a real autoplay refusal and leaves the player paused", async () => {
    const { store, el } = setup();
    el.playBehaviour = "reject-autoplay";

    store.actions.play();
    await settle();

    // the important half: ignoring AbortError must not mask this
    expect(store.getState().status).toBe("paused");
  });

  it("tells the two apart on the same engine, in the same session", async () => {
    const { store, el } = setup();

    el.playBehaviour = "abort";
    store.actions.play();
    await settle();
    expect(store.getState().status).toBe("playing");

    el.playBehaviour = "reject-autoplay";
    store.actions.pause();
    store.actions.play();
    await settle();
    expect(store.getState().status).toBe("paused");
  });

  it("does not swallow a DOMException that merely mentions abort", async () => {
    const { store, el } = setup();
    // name is what the engine checks, never the message
    el.play = () =>
      Promise.reject(
        new DOMException("aborted by the user agent", "NotAllowedError"),
      );

    store.actions.play();
    await settle();

    expect(store.getState().status).toBe("paused");
  });
});

describe("onWaiting", () => {
  it("only shows buffering while the video is actually playing", async () => {
    const { store, el } = setup();
    store.actions.play();
    await settle();

    el.emit("waiting");
    expect(store.getState().status).toBe("loading");
  });

  it("ignores a waiting fired while paused", async () => {
    const { store, el } = setup();
    store.actions.play();
    await settle();
    store.actions.pause();

    el.emit("waiting");

    expect(store.getState().status).toBe("paused");
  });
});

describe("the preview contract", () => {
  it("loads a payload with preview null and leaves the bar working", () => {
    const { store } = setup();
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    store.actions.loadVideo({ ...video, preview: null });
    store.actions.seek(5);

    expect(store.getState().video!.preview).toBeNull();
    expect(store.getState().currentTime).toBe(5);
    expect(store.getState().duration).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
