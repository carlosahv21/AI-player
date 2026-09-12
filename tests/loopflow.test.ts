import { beforeEach, describe, expect, it } from "vitest";
import mockVideo from "../src/mock/dance-local.json";
import { createPlayerStore } from "../src/core/store";
import type { VideoPayload } from "../src/core/types";

const video = mockVideo as VideoPayload;
const { playerStore } = createPlayerStore();

/** Mirrors the two-press `L` flow wired in Player.tsx. */
function pressL(draft: number | null): number | null {
  const s = playerStore.getState();
  const a = playerStore.actions;
  if (s.loop) {
    a.clearLoop();
    return null;
  }
  if (draft === null) return s.currentTime;
  const start = Math.min(draft, s.currentTime);
  const end = Math.max(draft, s.currentTime);
  if (end - start >= 0.2) a.setLoop(start, end);
  return null;
}

describe("two-press loop definition", () => {
  beforeEach(() => playerStore.actions.loadVideo(video));

  it("defines a four-second loop in two presses", () => {
    playerStore.actions.seek(5);
    let draft = pressL(null);
    expect(draft).toBe(5);
    expect(playerStore.getState().loop).toBeNull();

    playerStore.actions.seek(9);
    draft = pressL(draft);
    expect(draft).toBeNull();
    expect(playerStore.getState().loop).toEqual({ start: 5, end: 9 });
    expect(playerStore.getState().repeatMode).toBe("infinite");
  });

  it("marks the range correctly when the second press is earlier", () => {
    playerStore.actions.seek(9);
    const draft = pressL(null);
    playerStore.actions.seek(5);
    pressL(draft);
    expect(playerStore.getState().loop).toEqual({ start: 5, end: 9 });
  });

  it("a third press clears the loop", () => {
    playerStore.actions.seek(5);
    let draft = pressL(null);
    playerStore.actions.seek(9);
    draft = pressL(draft);
    pressL(draft);
    expect(playerStore.getState().loop).toBeNull();
  });
});

describe("finite repeats", () => {
  beforeEach(() => playerStore.actions.loadVideo(video));

  it("counts repeats and clears the loop when done", () => {
    playerStore.actions.setLoop(4, 8);
    playerStore.actions.setRepeatMode(3);

    // pass 1 -> wraps, one repeat done
    playerStore.actions._onTimeUpdate(8);
    expect(playerStore.getState().repeatsDone).toBe(1);
    expect(playerStore.getState().currentTime).toBe(4);

    // pass 2 -> wraps again
    playerStore.actions._onTimeUpdate(8);
    expect(playerStore.getState().repeatsDone).toBe(2);

    // pass 3 -> quota met, loop released and playback continues
    playerStore.actions._onTimeUpdate(8);
    const state = playerStore.getState();
    expect(state.loop).toBeNull();
    expect(state.repeatMode).toBeNull();
    expect(state.repeatsDone).toBe(0);
    expect(state.currentTime).toBe(8);
  });
});

describe("loop without an explicit repeat mode", () => {
  beforeEach(() => playerStore.actions.loadVideo(video));

  it("still wraps, because setLoop defaults to infinite", () => {
    playerStore.actions.setLoop(4, 8);
    playerStore.actions._onTimeUpdate(8);
    expect(playerStore.getState().currentTime).toBe(4);
    expect(playerStore.getState().loop).toEqual({ start: 4, end: 8 });
  });
});

describe("unified loop + repeat cycle", () => {
  beforeEach(() => playerStore.actions.loadVideo(video));

  /** Mirrors cycleRepeat: OFF -> infinite -> x2 -> x3 -> OFF. */
  function cycle(): void {
    const s = playerStore.getState();
    if (!s.loop) {
      // toggleLoop path: section under the playhead, defaults to infinite
      const sec = video.sections.find((x) => x.id === s.activeSectionId);
      if (sec) playerStore.actions.setLoop(sec.start, sec.end);
      return;
    }
    const order = ["infinite", 2, 3] as const;
    const i = order.findIndex((m) => m === s.repeatMode);
    const next = order[i + 1];
    if (next === undefined) {
      playerStore.actions.clearLoop();
      return;
    }
    playerStore.actions.setRepeatMode(next);
  }

  it("walks OFF -> infinite -> x2 -> x3 -> OFF in four clicks", () => {
    playerStore.actions.seek(5);
    expect(playerStore.getState().loop).toBeNull();

    cycle();
    expect(playerStore.getState().loop).not.toBeNull();
    expect(playerStore.getState().repeatMode).toBe("infinite");

    cycle();
    expect(playerStore.getState().repeatMode).toBe(2);

    cycle();
    expect(playerStore.getState().repeatMode).toBe(3);

    cycle();
    expect(playerStore.getState().loop).toBeNull();
    expect(playerStore.getState().repeatMode).toBeNull();
  });
});
