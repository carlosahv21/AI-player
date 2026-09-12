import { beforeEach, describe, expect, it } from "vitest";
import mockVideo from "../src/mock/dance-local.json";
import { createPlayerStore, initialState } from "../src/core/store";
import type { VideoPayload } from "../src/core/types";

const video = mockVideo as VideoPayload;
const { playerStore } = createPlayerStore();

// derived from the fixture so section edits don't break every assertion
const [S1, S2, S3] = video.sections;
const MID = (s: { start: number; end: number }) => (s.start + s.end) / 2;

function payloadWith(
  features: Partial<VideoPayload["features"]>,
): VideoPayload {
  return {
    ...video,
    features: { ...video.features, ...features },
  };
}

describe("player store", () => {
  beforeEach(() => {
    playerStore.actions.loadVideo(video);
  });

  it("clamps seek to 0 and duration", () => {
    playerStore.actions.seek(-10);
    expect(playerStore.getState().currentTime).toBe(0);

    playerStore.actions.seek(video.duration + 40);
    expect(playerStore.getState().currentTime).toBe(video.duration);
  });

  it("clamps seekBy at both ends", () => {
    playerStore.actions.seekBy(-5);
    expect(playerStore.getState().currentTime).toBe(0);

    playerStore.actions.seek(video.duration);
    playerStore.actions.seekBy(8);
    expect(playerStore.getState().currentTime).toBe(video.duration);
  });

  it("ignores invalid playback rates and accepts allowed ones", () => {
    playerStore.actions.setPlaybackRate(1.5);
    expect(playerStore.getState().playbackRate).toBe(1.5);

    playerStore.actions.setPlaybackRate(1.1);
    expect(playerStore.getState().playbackRate).toBe(1.5);
  });

  it("assigns activeSectionId to the next section on an exact boundary", () => {
    playerStore.actions._onTimeUpdate(S2!.start - 0.1);
    expect(playerStore.getState().activeSectionId).toBe(S1!.id);

    playerStore.actions._onTimeUpdate(S2!.start);
    expect(playerStore.getState().activeSectionId).toBe(S2!.id);
  });

  it("rejects invalid loops", () => {
    playerStore.actions.setLoop(20, 10);
    expect(playerStore.getState().loop).toBeNull();

    playerStore.actions.setLoop(10, 10);
    expect(playerStore.getState().loop).toBeNull();

    playerStore.actions.setLoop(-1, 10);
    expect(playerStore.getState().loop).toBeNull();

    playerStore.actions.setLoop(10, video.duration + 1);
    expect(playerStore.getState().loop).toBeNull();
  });

  it("plays a finite loop N times then clears it", () => {
    playerStore.actions.setLoop(10, 20);
    playerStore.actions.setRepeatMode(2);
    playerStore.actions._onTimeUpdate(10);

    playerStore.actions._onTimeUpdate(20);
    expect(playerStore.getState().currentTime).toBe(10);
    expect(playerStore.getState().repeatsDone).toBe(1);
    expect(playerStore.getState().loop).toEqual({ start: 10, end: 20 });

    playerStore.actions._onTimeUpdate(20);
    expect(playerStore.getState().loop).toBeNull();
    expect(playerStore.getState().repeatsDone).toBe(0);
    expect(playerStore.getState().currentTime).toBe(20);
  });

  it("keeps an infinite loop active", () => {
    playerStore.actions.setLoop(10, 20);
    playerStore.actions.setRepeatMode("infinite");

    playerStore.actions._onTimeUpdate(20);
    expect(playerStore.getState().currentTime).toBe(10);
    expect(playerStore.getState().loop).toEqual({ start: 10, end: 20 });

    playerStore.actions._onTimeUpdate(20.4);
    expect(playerStore.getState().currentTime).toBe(10);
    expect(playerStore.getState().loop).toEqual({ start: 10, end: 20 });
  });

  it("is a no-op when the matching feature is disabled", () => {
    playerStore.actions.loadVideo(
      payloadWith({
        mirror: false,
        speed: false,
        frontBack: false,
        loop: false,
      }),
    );

    playerStore.actions.toggleMirror();
    expect(playerStore.getState().mirrored).toBe(false);

    playerStore.actions.setPlaybackRate(0.5);
    expect(playerStore.getState().playbackRate).toBe(1);

    playerStore.actions.setPerspective("back");
    expect(playerStore.getState().perspective).toBe("front");

    playerStore.actions.setLoop(5, 15);
    expect(playerStore.getState().loop).toBeNull();
  });

  it("creates a loop from the active section", () => {
    playerStore.actions.seek(MID(S2!));
    playerStore.actions.repeatSection();
    const state = playerStore.getState();
    expect(state.loop).toEqual({ start: S2!.start, end: S2!.end });
    expect(state.currentTime).toBe(S2!.start);
    // practice default
    expect(state.repeatMode).toBe("infinite");
  });

  it("does not repeat a section when none is active", () => {
    playerStore.actions.loadVideo({ ...video, sections: [] });
    playerStore.actions.repeatSection();
    expect(playerStore.getState().loop).toBeNull();
  });

  it("keeps the loop, time and rate across a perspective change", () => {
    const withBack = payloadWith({ frontBack: true });
    playerStore.actions.loadVideo({
      ...withBack,
      sources: { ...withBack.sources, back: { hls: null, mp4: "/back.mp4" } },
    });
    playerStore.actions.setLoop(4, 8);
    playerStore.actions.setPlaybackRate(0.5);
    playerStore.actions.seek(6);

    playerStore.actions.setPerspective("back");

    const state = playerStore.getState();
    expect(state.perspective).toBe("back");
    expect(state.loop).toEqual({ start: 4, end: 8 });
    expect(state.currentTime).toBe(6);
    expect(state.playbackRate).toBe(0.5);
  });

  it("nudges each loop edge without crossing the other", () => {
    playerStore.actions.setLoop(4, 8);
    playerStore.actions.nudgeLoop("start", 0.5);
    expect(playerStore.getState().loop).toEqual({ start: 4.5, end: 8 });

    playerStore.actions.nudgeLoop("end", -0.5);
    expect(playerStore.getState().loop).toEqual({ start: 4.5, end: 7.5 });

    // a nudge past the far edge stops at the minimum length
    playerStore.actions.nudgeLoop("start", 99);
    expect(playerStore.getState().loop!.start).toBe(7);
  });

  it("clears repeatMode when loop is cleared", () => {
    playerStore.actions.loadVideo(video);
    playerStore.actions.setLoop(10, 20);
    playerStore.actions.setRepeatMode(3);
    playerStore.actions.clearLoop();
    const state = playerStore.getState();
    expect(state.loop).toBeNull();
    expect(state.repeatMode).toBeNull();
  });

  it("resets previous state on loadVideo", () => {
    playerStore.actions.seek(44);
    playerStore.actions.toggleMirror();
    playerStore.actions.setLoop(10, 20);
    playerStore.actions.setRepeatMode(2);
    playerStore.actions.setVolume(0.2);
    playerStore.actions.setError({ code: "x", message: "fail" });

    playerStore.actions.loadVideo(video);

    const state = playerStore.getState();
    expect(state.currentTime).toBe(0);
    expect(state.mirrored).toBe(false);
    expect(state.loop).toBeNull();
    expect(state.repeatMode).toBeNull();
    expect(state.repeatsDone).toBe(0);
    expect(state.volume).toBe(initialState.volume);
    expect(state.error).toBeNull();
    expect(state.status).toBe("idle");
    expect(state.video?.id).toBe(video.id);
    expect(state.duration).toBe(video.duration);
    expect(state.activeSectionId).toBe(S1!.id);
  });

  it("does nothing for an unknown section id or next at the last section", () => {
    playerStore.actions.goToSection("missing");
    expect(playerStore.getState().currentTime).toBe(0);

    playerStore.actions.goToSection(S3!.id);
    playerStore.actions.nextSection();
    expect(playerStore.getState().currentTime).toBe(S3!.start);
    expect(playerStore.getState().activeSectionId).toBe(S3!.id);
  });
});
