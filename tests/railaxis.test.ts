/*
 * One axis for the whole progress bar, verified with sections that leave HOLES.
 *
 * Every fixture in this repo used to tile its video exactly — the mock's
 * sections run 0-3, 3-13, 13-21.9 over a 21.9s video — so the two axes agreed
 * numerically and the bug was invisible in development. It only appeared with
 * real WordPress data, where nothing guarantees coverage.
 *
 * The failure: the rail shared its width by `flexGrow: span` over sections
 * only, so a video whose sections covered 40 of 60 seconds drew t=50 at 75% of
 * the bar, while the click-to-seek, the hover guide, the loop handles and the
 * section hitboxes all placed it at 83.3%. The user clicked a pixel and got a
 * different time — worst of all on the loop handles, the product's core
 * feature.
 *
 * The bar is now one rectangle on `time / duration`. These tests pin that
 * every consumer uses that axis, and every one of them uses holed sections
 * on purpose — fixtures that tile the video do not detect a covered-seconds
 * axis sneaking back in.
 */
import { describe, expect, it } from "vitest";
import { railSegments, sectionCoverage } from "../src/core/duration";
import { axisAt } from "../src/ui/HeatmapProgress";
import type { Section } from "../src/core/types";

const DURATION = 60;

/** 35 covered seconds of 60: a hole at the head, two in the middle, one at the tail. */
const holed: Section[] = [
  { id: "a", name: "Entrada", start: 5, end: 15 },
  { id: "b", name: "Centro", start: 25, end: 45 },
  { id: "c", name: "Final", start: 50, end: 55 },
];

/** What every consumer on the bar computes: a plain time/duration. */
const byTime = (t: number) => (t / DURATION) * 100;

function axisPct(t: number): number {
  return Number.parseFloat(axisAt(t, DURATION));
}

describe("railSegments fills the holes", () => {
  it("renders a segment for the head, middle and tail holes", () => {
    const rail = railSegments(holed, DURATION);

    expect(rail.map((s) => [s.start, s.end, s.gap])).toEqual([
      [0, 5, true],
      [5, 15, false],
      [15, 25, true],
      [25, 45, false],
      [45, 50, true],
      [50, 55, false],
      [55, 60, true],
    ]);
  });

  it("makes the summed spans equal the duration, which is the whole point", () => {
    const total = railSegments(holed, DURATION).reduce(
      (sum, s) => sum + (s.end - s.start),
      0,
    );
    expect(total).toBe(DURATION);
  });

  it("gives holes no name and never marks them as sections", () => {
    for (const seg of railSegments(holed, DURATION).filter((s) => s.gap)) {
      expect(seg.name).toBe("");
    }
  });

  it("covers a payload with no sections at all with one full-width hole", () => {
    expect(railSegments([], DURATION)).toEqual([
      { id: "gap:0", name: "", start: 0, end: DURATION, gap: true },
    ]);
  });

  it("absorbs a hole too thin to deserve its own segment", () => {
    const upTo21_9: Section[] = [
      { id: "a", name: "A", start: 0, end: 3 },
      { id: "b", name: "B", start: 3, end: 13 },
      { id: "c", name: "C", start: 13, end: 21.9 },
    ];
    // the real media is a hair longer than the payload claimed
    const rail = railSegments(upTo21_9, 21.94);

    expect(rail.some((s) => s.gap)).toBe(false);
    expect(rail).toHaveLength(3);
    // the last section takes the sliver, so the spans still total the duration
    expect(rail[2].end).toBeCloseTo(21.94, 6);
  });

  it("still totals the duration after absorbing a sliver", () => {
    const rail = railSegments(
      [
        { id: "a", name: "A", start: 0, end: 10 },
        { id: "b", name: "B", start: 10.1, end: 30 },
      ],
      30.05,
    );
    const total = rail.reduce((sum, s) => sum + (s.end - s.start), 0);
    expect(total).toBeCloseTo(30.05, 6);
  });

  it("pulls the first segment back when the sliver leads", () => {
    // a 0.2s hole at the head has no previous segment to absorb it
    const rail = railSegments(
      [{ id: "a", name: "A", start: 0.2, end: 60 }],
      DURATION,
    );
    expect(rail[0].start).toBe(0);
    expect(rail.some((s) => s.gap)).toBe(false);
  });

  it("keeps a hole that is genuinely wide enough to point at", () => {
    // half a second is the threshold; a 5s hole is unambiguously real
    const rail = railSegments(
      [
        { id: "a", name: "A", start: 0, end: 20 },
        { id: "b", name: "B", start: 25, end: 60 },
      ],
      DURATION,
    );
    expect(rail.filter((s) => s.gap)).toHaveLength(1);
    expect(rail.find((s) => s.gap)).toMatchObject({ start: 20, end: 25 });
  });

  it("adds nothing when the sections already tile the video", () => {
    const tiling: Section[] = [
      { id: "a", name: "A", start: 0, end: 30 },
      { id: "b", name: "B", start: 30, end: 60 },
    ];
    expect(railSegments(tiling, DURATION).some((s) => s.gap)).toBe(false);
  });

  it("orders the segments by time even if the payload does not", () => {
    const shuffled = [holed[2], holed[0], holed[1]];
    expect(railSegments(shuffled, DURATION)).toEqual(
      railSegments(holed, DURATION),
    );
  });
});

describe("every consumer sits on time/duration", () => {
  // Each of these computes `ratio * duration` or `time / duration * 100%` in
  // ProgressBar.tsx. The assertion is that axisAt is that same number —
  // including inside the holes, where a covered-seconds axis would stall.
  const probes = [0, 2.5, 5, 10, 15, 20, 30, 45, 47.5, 50, 55, 58, 60];

  it("click-to-seek: the pixel clicked is the time received", () => {
    for (const t of probes) {
      expect(axisPct(t)).toBeCloseTo(byTime(t), 6);
    }
  });

  it("hover guide: the label's time matches the position under the pointer", () => {
    for (const t of probes) {
      expect(axisPct(t)).toBeCloseTo(byTime(t), 6);
    }
  });

  it("loop handles: a handle at a position fixes the time at that position", () => {
    for (const edge of [12, 30, 47, 52]) {
      expect(axisPct(edge)).toBeCloseTo(byTime(edge), 6);
    }
  });

  it("section hitboxes: each box sits over the time it names", () => {
    for (const section of holed) {
      expect(axisPct(section.start)).toBeCloseTo(byTime(section.start), 6);
      expect(axisPct(section.end)).toBeCloseTo(byTime(section.end), 6);
    }
  });

  it("heatmap: the curve lands on the same coordinates as the fill", () => {
    for (const t of probes) {
      expect(axisPct(t)).toBeCloseTo(byTime(t), 6);
    }
  });

  it("advances through a hole instead of stalling in it", () => {
    expect(axisPct(16)).toBeLessThan(axisPct(20));
    expect(axisPct(20)).toBeLessThan(axisPct(24));
  });

  it("still clamps outside the video", () => {
    expect(axisPct(-10)).toBe(0);
    expect(axisPct(999)).toBeCloseTo(100, 6);
  });
});

describe("rendering the holes does not fake coverage", () => {
  it("keeps reporting the real covered fraction", () => {
    // 35 of 60 seconds are described by a section (10 + 20 + 5); drawing the
    // other 25 as neutral segments must not turn that into 100%
    expect(sectionCoverage(holed, DURATION)).toBeCloseTo(35 / 60, 6);
  });

  it("does not count the rendered holes as sections", () => {
    const rail = railSegments(holed, DURATION);
    const asSections = rail.filter((s) => !s.gap);
    expect(asSections).toHaveLength(holed.length);
    expect(sectionCoverage(asSections, DURATION)).toBeCloseTo(35 / 60, 6);
  });
});
