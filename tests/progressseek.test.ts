import { describe, expect, it } from "vitest";
import mockVideo from "../src/mock/dance-local.json";
import { createPlayerStore } from "../src/core/store";
import type { VideoPayload } from "../src/core/types";

const video = mockVideo as VideoPayload;

/**
 * The seek the bar commits for a pointer landing at `ratio`.
 *
 * Mirrors ProgressBar's onPointerUp. The regression it guards: the section
 * hit layer spans the whole track, so every click landed on a <button>. The
 * handler used to defer to that button's onClick, which called goToSection()
 * and jumped to the START of the section instead of the point clicked, so
 * clicking inside the section you were already in appeared to do nothing.
 */
function timeFromClick(ratio: number, duration: number): number {
  return ratio * duration;
}

describe("clicking the timeline", () => {
  const { playerStore } = createPlayerStore();

  it("seeks to the exact point clicked, not to the section start", () => {
    playerStore.actions.loadVideo(video);
    const { duration } = playerStore.getState();
    const sections = video.sections;
    expect(sections.length).toBeGreaterThan(1);

    // A point clearly inside the second section, away from its start.
    const target = sections[1].start + (sections[1].end - sections[1].start) / 2;
    playerStore.actions.seek(timeFromClick(target / duration, duration));

    expect(playerStore.getState().currentTime).toBeCloseTo(target, 3);
    expect(playerStore.getState().currentTime).not.toBeCloseTo(sections[1].start, 3);
  });

  it("still moves when the click lands in the section already playing", () => {
    playerStore.actions.loadVideo(video);
    const { duration } = playerStore.getState();
    const section = video.sections[0];

    playerStore.actions.seek(section.start + 1);
    const before = playerStore.getState().currentTime;

    const target = section.start + (section.end - section.start) * 0.8;
    playerStore.actions.seek(timeFromClick(target / duration, duration));

    expect(playerStore.getState().currentTime).toBeCloseTo(target, 3);
    expect(playerStore.getState().currentTime).not.toBeCloseTo(before, 3);
  });

  it("goToSection still jumps to the section start, for keyboard", () => {
    playerStore.actions.loadVideo(video);
    const section = video.sections[1];

    playerStore.actions.seek(0);
    playerStore.actions.goToSection(section.id);

    expect(playerStore.getState().currentTime).toBeCloseTo(section.start, 3);
  });
});
