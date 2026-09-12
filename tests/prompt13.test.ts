/*
 * The behaviour changes from the Prompt 13 client review.
 */
import { describe, expect, it, vi } from "vitest";
import mockVideo from "../src/mock/dance-local.json";
import { createPlayerStore } from "../src/core/store";
import {
  ALLOWED_RATES,
  MAX_HOLD_RATE,
  PLAYBACK_RATES,
} from "../src/core/types";
import type { PlaybackRate, VideoPayload } from "../src/core/types";
import { parsePreviewVtt, cueAt } from "../src/ui/hooks/usePreviewSprite";
import { loadPrefs, savePrefs } from "../src/core/persistence";
import { initialState } from "../src/core/store";

const video = mockVideo as VideoPayload;

/** Same in-memory storage the persistence suite uses. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function fresh() {
  const { playerStore } = createPlayerStore();
  playerStore.actions.loadVideo(video);
  return playerStore;
}

describe("loop needs no confirmation", () => {
  it("a defined range is live immediately, with no extra step", () => {
    const store = fresh();
    store.actions.seek(5);
    store.actions.setLoop(5, 9);
    expect(store.getState().loop).toEqual({ start: 5, end: 9 });
  });

  it("stays playing when the loop is set mid-playback", () => {
    const store = fresh();
    store.actions.play();
    store.actions.seek(5);
    store.actions.setLoop(5, 9);
    // defining a loop must not pause or wait for a confirmation
    expect(store.getState().status).toBe("playing");
    expect(store.getState().loop).toEqual({ start: 5, end: 9 });
  });
});

describe("speeds above 2x", () => {
  it("are not reachable from the menu", () => {
    expect(PLAYBACK_RATES).not.toContain(3 as PlaybackRate);
    expect(PLAYBACK_RATES).not.toContain(4 as PlaybackRate);
    expect(Math.max(...PLAYBACK_RATES)).toBe(2);
  });

  it("are accepted by the store, for the hold gesture", () => {
    const store = fresh();
    store.actions.setPlaybackRate(4);
    expect(store.getState().playbackRate).toBe(4);
    expect(ALLOWED_RATES).toContain(MAX_HOLD_RATE as PlaybackRate);
  });

  it("stops at 4x", () => {
    const store = fresh();
    store.actions.setPlaybackRate(8);
    // rejected, so the previous rate stands
    expect(store.getState().playbackRate).not.toBe(8);
    expect(Math.max(...ALLOWED_RATES)).toBe(MAX_HOLD_RATE);
  });

  it("never come back as the saved preference", () => {
    vi.stubGlobal("window", { localStorage: memoryStorage() });

    // even if a 4x somehow reaches storage, it is not restored: the gesture
    // rate is transient and must not survive into the next visit
    savePrefs({ ...initialState, playbackRate: 4 as PlaybackRate });
    expect(loadPrefs().playbackRate).toBeUndefined();

    savePrefs({ ...initialState, playbackRate: 1.5 });
    expect(loadPrefs().playbackRate).toBe(1.5);
    vi.unstubAllGlobals();
  });
});

describe("payload without preview", () => {
  it("loads and works with the preview field absent", () => {
    // built here rather than read off the mock: the dev bench carries a
    // sprite so the preview can be seen, and this test is about payloads
    // that do not
    const { preview: _dropped, ...withoutPreview } = video as VideoPayload & {
      preview?: unknown;
    };
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(withoutPreview as VideoPayload);

    expect(playerStore.getState().video?.preview ?? null).toBeNull();

    // everything else behaves identically
    playerStore.actions.seek(4);
    playerStore.actions.setLoop(4, 8);
    expect(playerStore.getState().loop).toEqual({ start: 4, end: 8 });
  });

  it("parses a Bunny-style sprite VTT", () => {
    const vtt = [
      "WEBVTT",
      "",
      "00:00.000 --> 00:10.000",
      "sprite.jpg#xywh=0,0,160,90",
      "",
      "00:10.000 --> 00:20.000",
      "sprite.jpg#xywh=160,0,160,90",
    ].join("\n");

    const cues = parsePreviewVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[1]).toMatchObject({ start: 10, end: 20, x: 160, y: 0 });
    expect(cueAt(cues, 12)?.x).toBe(160);
    expect(cueAt(cues, 3)?.x).toBe(0);
  });

  it("survives junk instead of a VTT", () => {
    expect(parsePreviewVtt("not a vtt at all")).toEqual([]);
    expect(cueAt([], 5)).toBeNull();
  });
});
