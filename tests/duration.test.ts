/*
 * The payload's `duration` is an estimate and the media's metadata is the
 * truth, but sections are authored against the estimate. When they disagree
 * the player used to keep both: a real 20s video with sections describing 60s,
 * every position computed against a timeline nobody would ever reach, and not
 * a word in the console.
 *
 * These fix the reconciliation at `loadedmetadata` and the coverage
 * measurement that says how much of the video the sections actually describe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  coverageGaps,
  fitRange,
  fitSections,
  sectionCoverage,
} from "../src/core/duration";
import { createPlayerStore } from "../src/core/store";
import {
  selectCoverageGaps,
  selectSectionCoverage,
} from "../src/core/selectors";
import type { Section, VideoPayload } from "../src/core/types";

const sections: Section[] = [
  { id: "a", name: "Entrada", start: 0, end: 10 },
  { id: "b", name: "Centro", start: 10, end: 20 },
  { id: "c", name: "Final", start: 20, end: 30 },
];

function payload(over: Partial<VideoPayload> = {}): VideoPayload {
  return {
    id: 7,
    title: "Clase",
    instructor: null,
    duration: 30,
    poster: null,
    sources: { hls: null, mp4: "/v.mp4", back: null },
    sections,
    features: {
      mirror: true,
      loop: true,
      speed: true,
      frontBack: false,
      quality: false,
      pip: false,
    },
    preview: null,
    heatmap: null,
    tracks: { subtitles: [], audio: [] },
    ...over,
  };
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fitSections", () => {
  it("truncates a section that overruns the real duration", () => {
    const fit = fitSections(sections, 25);
    expect(fit.sections.map((s) => [s.start, s.end])).toEqual([
      [0, 10],
      [10, 20],
      [20, 25],
    ]);
    expect(fit.adjustments).toEqual([
      {
        id: "c",
        name: "Final",
        kind: "truncated",
        was: { start: 20, end: 30 },
        now: { start: 20, end: 25 },
      },
    ]);
  });

  it("drops a section that starts after the video ends", () => {
    const fit = fitSections(sections, 15);
    expect(fit.sections.map((s) => s.id)).toEqual(["a", "b"]);
    expect(fit.adjustments).toEqual([
      {
        id: "b",
        name: "Centro",
        kind: "truncated",
        was: { start: 10, end: 20 },
        now: { start: 10, end: 15 },
      },
      {
        id: "c",
        name: "Final",
        kind: "dropped",
        was: { start: 20, end: 30 },
      },
    ]);
  });

  it("returns the same array when everything already fits", () => {
    const fit = fitSections(sections, 30);
    expect(fit.sections).toBe(sections);
    expect(fit.adjustments).toEqual([]);
  });

  it("cuts a truncated section's steps down with it", () => {
    const withSteps: Section[] = [
      {
        id: "a",
        name: "Entrada",
        start: 0,
        end: 30,
        steps: [
          { id: "s1", name: "uno", start: 0, end: 10 },
          { id: "s2", name: "dos", start: 10, end: 25 },
          { id: "s3", name: "tres", start: 25, end: 30 },
        ],
      },
    ];
    const fit = fitSections(withSteps, 20);
    expect(fit.sections[0].steps?.map((s) => [s.start, s.end])).toEqual([
      [0, 10],
      [10, 20],
    ]);
  });

  it("leaves everything alone when the duration is not usable yet", () => {
    expect(fitSections(sections, 0).sections).toBe(sections);
    expect(fitSections(sections, NaN).sections).toBe(sections);
  });
});

describe("fitRange", () => {
  it("truncates a loop that overruns the real duration", () => {
    expect(fitRange({ start: 10, end: 40 }, 25)).toEqual({ start: 10, end: 25 });
  });

  it("drops a loop that starts past the end", () => {
    expect(fitRange({ start: 50, end: 60 }, 25)).toBeNull();
  });

  it("drops a loop trimmed down to less than the minimum length", () => {
    expect(fitRange({ start: 24.9, end: 40 }, 25)).toBeNull();
  });

  it("passes a loop already inside the duration through untouched", () => {
    const loop = { start: 5, end: 10 };
    expect(fitRange(loop, 25)).toBe(loop);
  });
});

describe("sectionCoverage", () => {
  it("reports full coverage when the sections tile the video", () => {
    expect(sectionCoverage(sections, 30)).toBe(1);
  });

  it("reports the fraction covered when they stop short", () => {
    expect(sectionCoverage(sections, 60)).toBeCloseTo(0.5, 5);
  });

  it("never exceeds 1 when sections overlap", () => {
    const overlapping = [
      { start: 0, end: 20 },
      { start: 10, end: 30 },
    ];
    expect(sectionCoverage(overlapping, 30)).toBe(1);
  });

  it("finds the holes between sections", () => {
    const holed = [
      { start: 0, end: 10 },
      { start: 20, end: 30 },
    ];
    expect(coverageGaps(holed, 40)).toEqual([
      { start: 10, end: 20 },
      { start: 30, end: 40 },
    ]);
  });

  it("finds no holes in a tiling set", () => {
    expect(coverageGaps(sections, 30)).toEqual([]);
  });
});

describe("the media's duration is the authority", () => {
  it("trims the sections when the real video is shorter", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());

    playerStore.actions._onDurationChange(22);

    const state = playerStore.getState();
    expect(state.duration).toBe(22);
    expect(state.video!.sections.map((s) => [s.start, s.end])).toEqual([
      [0, 10],
      [10, 20],
      [20, 22],
    ]);
  });

  it("logs what it cut, with the expected and the real value", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());

    playerStore.actions._onDurationChange(22);

    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("payload 30.00s");
    expect(logged).toContain("real 22.00s");
    expect(logged).toContain("Final");
  });

  it("says nothing when the payload already agreed with the media", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());

    playerStore.actions._onDurationChange(30);

    expect(warn).not.toHaveBeenCalled();
  });

  it("trims a live loop that no longer fits", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());
    playerStore.actions.setLoop(10, 28);

    playerStore.actions._onDurationChange(22);

    expect(playerStore.getState().loop).toEqual({ start: 10, end: 22 });
  });

  it("clears a loop left entirely outside the real duration", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());
    playerStore.actions.setLoop(24, 29);

    playerStore.actions._onDurationChange(22);

    expect(playerStore.getState().loop).toBeNull();
  });

  it("pulls currentTime back inside and re-reads the active section", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());
    playerStore.actions.seek(28);

    playerStore.actions._onDurationChange(22);

    const state = playerStore.getState();
    expect(state.currentTime).toBe(22);
    // 22 is the truncated end of "c", and a section's end is exclusive
    expect(state.activeSectionId).toBeNull();
  });

  it("warns about the holes the sections leave in the real duration", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());

    playerStore.actions._onDurationChange(60);

    const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("50%");
    expect(logged).toContain("hueco");
  });

  it("exposes coverage as a derived selector, never as stored state", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());
    playerStore.actions._onDurationChange(60);

    expect(selectSectionCoverage(playerStore.getState())).toBeCloseTo(0.5, 5);
    expect(selectCoverageGaps(playerStore.getState())).toEqual([
      { start: 30, end: 60 },
    ]);
    // no filler: the hole stays a hole
    expect(playerStore.getState().video!.sections).toHaveLength(3);
  });

  it("invents nothing when the real video is longer than the payload said", () => {
    const { playerStore } = createPlayerStore();
    playerStore.actions.loadVideo(payload());

    playerStore.actions._onDurationChange(60);

    expect(playerStore.getState().video!.sections).toEqual(sections);
    expect(playerStore.getState().duration).toBe(60);
  });
});
