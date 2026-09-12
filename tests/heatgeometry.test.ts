/*
 * The geometric contract: a known heatmap in, known coordinates out.
 *
 * This bug class is invisible without checking numbers. The curve rendered
 * perfectly happily while its peaks sat in the wrong place — nothing threw,
 * nothing logged, and on a smooth real-world curve a shifted peak looks
 * exactly like a peak. The only way it stays fixed is by pinning the
 * arithmetic, so these assert exact X coordinates rather than "it renders".
 *
 * Measured failure being fixed here: `sanitizeHeatmap` used to `filter()` out
 * non-finite samples, which COMPACTS the array. Since a sample's X is its
 * index — `heatArea` spreads the array evenly across the viewBox — dropping a
 * bucket slides every later sample left. With ten bad values at the head of a
 * 101-bucket curve, peaks authored at 25/50/75% were drawn at 16.7/44.4/72.2%.
 */
import { describe, expect, it, vi } from "vitest";
import { heatArea } from "../src/ui/HeatmapProgress";
import { sanitizeHeatmap } from "../src/ui/hooks/useVideoPayload";
import type { VideoPayload } from "../src/core/types";

const base = { id: 1, duration: 100 } as VideoPayload;

/** The sample vertices of the path: each `Q`'s endpoint, as {x, height}. */
function vertices(d: string): { x: number; height: number }[] {
  const first = d.match(/^M0,([\d.-]+)/);
  const out = first ? [{ x: 0, height: 100 - Number(first[1]) }] : [];
  for (const m of d.matchAll(/Q[\d.-]+,[\d.-]+ ([\d.-]+),([\d.-]+)/g)) {
    out.push({ x: Number(m[1]), height: 100 - Number(m[2]) });
  }
  return out;
}

/** Where the curve actually rises, at the precision a reader would judge by. */
function peaksOf(points: readonly number[], min = 1) {
  return vertices(heatArea(points))
    .filter((v) => v.height > min)
    .map((v) => ({ x: Number(v.x.toFixed(2)), height: Number(v.height.toFixed(1)) }));
}

/** 101 buckets, so bucket i sits at exactly i% of the width. */
function withPeaks(peaks: Record<number, number>): number[] {
  const points = Array.from({ length: 101 }, () => 0);
  for (const [at, value] of Object.entries(peaks)) points[Number(at)] = value;
  return points;
}

function sanitized(heatmap: unknown[]): number[] {
  const out = sanitizeHeatmap({ ...base, heatmap: heatmap as number[] });
  return (out.heatmap ?? []) as number[];
}

describe("a known heatmap lands on known coordinates", () => {
  it("puts peaks exactly where the buckets say, with nothing else touched", () => {
    // the reference case: 100 at 25%, 50 at 50%, 100 at 75%
    const points = withPeaks({ 25: 100, 50: 50, 75: 100 });

    expect(peaksOf(sanitized(points))).toEqual([
      { x: 25, height: 100 },
      { x: 50, height: 50 },
      { x: 75, height: 100 },
    ]);
  });

  it("scales height against the set's own peak, not a fixed ceiling", () => {
    // same shape, ten times the counts: the curve is relative interest, so it
    // must be identical — an absolute scale would flatten a low-traffic video
    const small = withPeaks({ 25: 10, 50: 5, 75: 10 });
    const large = withPeaks({ 25: 100, 50: 50, 75: 100 });

    expect(peaksOf(sanitized(small))).toEqual(peaksOf(sanitized(large)));
  });

  it("spreads N buckets evenly from 0 to 100, whatever N is", () => {
    for (const n of [2, 5, 24, 101]) {
      const xs = vertices(heatArea(Array.from({ length: n }, () => 0.5))).map(
        (v) => v.x,
      );
      expect(xs[0]).toBe(0);
      expect(xs.at(-1)).toBeCloseTo(100, 6);
      expect(xs).toHaveLength(n);
    }
  });

  it("closes the area along the baseline so the fill has a floor", () => {
    expect(heatArea([0, 1, 0])).toMatch(/ L100,100 L0,100 Z$/);
  });
});

describe("a damaged bucket does not move its neighbours", () => {
  it("keeps every peak in place when a hole sits before them", () => {
    const points: unknown[] = withPeaks({ 25: 100, 50: 50, 75: 100 });
    // ten dead buckets at the head — the exact case that shifted the curve
    for (let i = 0; i < 10; i += 1) points[i] = null;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const out = sanitized(points);

    // length preserved is what preserves the axis
    expect(out).toHaveLength(101);
    expect(peaksOf(out)).toEqual([
      { x: 25, height: 100 },
      { x: 50, height: 50 },
      { x: 75, height: 100 },
    ]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("holds the line for every junk value the wire can carry", () => {
    for (const junk of [null, "", "abc", NaN, Infinity, -Infinity, undefined, {}]) {
      const points: unknown[] = withPeaks({ 25: 100, 50: 50, 75: 100 });
      points[10] = junk;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      expect(sanitized(points)).toHaveLength(101);
      expect(peaksOf(sanitized(points))).toEqual([
        { x: 25, height: 100 },
        { x: 50, height: 50 },
        { x: 75, height: 100 },
      ]);
      warn.mockRestore();
    }
  });

  it("bridges a hole from its neighbours instead of inventing a valley", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // a hole inside a plateau must not read as a dip nobody measured
    const out = sanitized([100, 100, null, 100, 100]);

    expect(out).toEqual([1, 1, 1, 1, 1]);
    warn.mockRestore();
  });

  it("interpolates a run of holes linearly across the gap", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // two holes of six: under the majority threshold, so the curve survives
    const out = sanitized([0, null, null, 75, 100, 50]);

    // the run is bridged 0 -> 25 -> 50 -> 75, then the real samples follow
    expect(out).toEqual([0, 0.25, 0.5, 0.75, 1, 0.5]);
    warn.mockRestore();
  });

  it("carries the nearest value flat when a run sits at either end", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(sanitized([null, null, 50, 100])).toEqual([0.5, 0.5, 0.5, 1]);
    expect(sanitized([100, 50, null, null])).toEqual([1, 0.5, 0.5, 0.5]);
    warn.mockRestore();
  });

  it("still refuses a curve that is mostly junk", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const mostlyJunk = [10, "x", null, Infinity, NaN, 20] as unknown[];

    expect(sanitizeHeatmap({ ...base, heatmap: mostlyJunk as number[] }).heatmap)
      .toBeNull();
    error.mockRestore();
  });
});

describe("the curve reads as authored", () => {
  it("does not turn distinct peaks into a monotonic ramp", () => {
    // the visual symptom that started this: a ramp means the values were
    // accumulated somewhere. Peaks in must stay peaks out.
    const heights = peaksOf(sanitized(withPeaks({ 25: 100, 50: 50, 75: 100 })))
      .map((p) => p.height);

    const rising = heights.every((h, i) => i === 0 || h >= heights[i - 1]);
    expect(rising).toBe(false);
    expect(heights).toEqual([100, 50, 100]);
  });

  it("draws a genuinely cumulative array as the ramp it is", () => {
    // the counter-check: if the payload really is accumulated, the player
    // renders that faithfully — the fix for it belongs in the aggregator, and
    // this test is what tells the two apart
    const cumulative = [0, 0, 5, 45, 48, 50, 110, 114, 115, 115, 145, 147];
    const heights = vertices(heatArea(sanitized(cumulative))).map((v) => v.height);

    expect(heights.every((h, i) => i === 0 || h >= heights[i - 1] - 1e-9)).toBe(true);
  });
});
