import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  debounce,
  loadPrefs,
  loadVideoState,
  resumePosition,
  savePrefs,
  saveVideoState,
} from "../src/core/persistence";
import { initialState } from "../src/core/store";
import type { PlayerState } from "../src/core/types";

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

function stub(storage: Storage | (() => never)): void {
  vi.stubGlobal("window", { localStorage: storage });
}

describe("persistence", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stub(memoryStorage());
  });

  it("round-trips global preferences", () => {
    const state: PlayerState = {
      ...initialState,
      playbackRate: 0.5,
      mirrored: true,
      volume: 0.3,
      muted: true,
      subtitleLang: "es",
    };
    savePrefs(state);

    expect(loadPrefs()).toEqual({
      playbackRate: 0.5,
      mirrored: true,
      volume: 0.3,
      muted: true,
      subtitleLang: "es",
    });
  });

  it("ignores stored values that are out of range or malformed", () => {
    window.localStorage.setItem(
      "aivp:prefs",
      JSON.stringify({ playbackRate: 3, volume: 5, mirrored: "yes" }),
    );
    expect(loadPrefs()).toEqual({});
  });

  it("round-trips per-video position and loop", () => {
    saveVideoState(7, 42, { start: 4, end: 8 });
    expect(loadVideoState(7)).toEqual({
      lastPosition: 42,
      loop: { start: 4, end: 8 },
    });
  });

  it("drops a loop whose range is inverted", () => {
    window.localStorage.setItem(
      "aivp:video:7",
      JSON.stringify({ lastPosition: 20, loop: { start: 9, end: 2 } }),
    );
    expect(loadVideoState(7)!.loop).toBeNull();
  });

  it("discards lastPosition within 10s of the start", () => {
    expect(resumePosition(9.9, 300)).toBe(0);
    expect(resumePosition(10.1, 300)).toBe(10.1);
  });

  it("discards lastPosition within 30s of the end", () => {
    expect(resumePosition(271, 300)).toBe(0);
    expect(resumePosition(269, 300)).toBe(269);
  });

  it("survives localStorage throwing, as in Safari private mode", () => {
    const blocked = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    stub(blocked);

    expect(() => savePrefs(initialState)).not.toThrow();
    expect(loadPrefs()).toEqual({});
    expect(() => saveVideoState(1, 5, null)).not.toThrow();
    expect(loadVideoState(1)).toBeNull();
  });
});

describe("debounced writes", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    stub(memoryStorage());
    vi.useFakeTimers();
  });

  it("writes once for a burst of updates", () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 1000);

    for (let i = 0; i < 50; i += 1) debounced(i);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(49);

    vi.useRealTimers();
  });

  it("cancel prevents a pending write", () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 1000);
    debounced(1);
    debounced.cancel();
    vi.advanceTimersByTime(2000);
    expect(spy).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
