import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  axisAt,
  gapMask,
  heatArea,
  sectionCuts,
} from "../src/ui/HeatmapProgress";
import { sanitizeHeatmap } from "../src/ui/hooks/useVideoPayload";
import type { VideoPayload } from "../src/core/types";

const points = [0.1, 0.8, 0.3, 1, 0.45];

describe("heatArea", () => {
  it("spans the full 0..100 X axis whatever the sample count", () => {
    for (const n of [2, 5, 37]) {
      const d = heatArea(Array.from({ length: n }, (_, i) => i / n));
      expect(d.startsWith("M0,")).toBe(true);
      // last curve lands on x=100, and the area closes across the full width
      expect(d).toContain(" 100,");
      expect(d.endsWith(" L100,100 L0,100 Z")).toBe(true);
    }
  });

  it("clamps samples outside 0..1 instead of drawing off-canvas", () => {
    const d = heatArea([-5, 2]);
    expect(d).toBe("M0,100 Q50,100 100,0 L100,100 L0,100 Z");
  });

  it("is stable — the same points always give the same geometry", () => {
    expect(heatArea(points)).toBe(heatArea([...points]));
  });
});

describe("heatmap placement", () => {
  const css = readFileSync("src/ui/HeatmapProgress.module.css", "utf8");

  // The curve owns the band ABOVE the rail, where .played used to sit, and it
  // grows upward from the rail's top edge. Anchoring by `top` would push the
  // shape down through the rail when the bar grows on hover (4px -> 8px).
  it("anchors above the rail by bottom, clearing the tallest bar", () => {
    const bottom = /bottom:\s*calc\(50%\s*\+\s*(\d+)px\)/.exec(css);
    expect(bottom, "the SVG must be anchored by bottom: calc(50% + Npx)").toBeTruthy();
    // half of the 8px hovered bar
    expect(Number(bottom![1])).toBeGreaterThanOrEqual(4);
    expect(css).not.toMatch(/^\s*top:/m);
  });

  it("stays inside .wrap's 44px so it never spills over the title row", () => {
    const offset = Number(/bottom:\s*calc\(50%\s*\+\s*(\d+)px\)/.exec(css)![1]);
    const height = Number(/height:\s*(\d+)px/.exec(css)![1]);
    expect(22 + offset + height).toBeLessThanOrEqual(44);
  });
});

// One rectangle, one axis. A time's pixel is time/duration of the wrap —
// the same number the fill, the playhead, the clip, the seek and the handles
// all use. Marks sit on that axis; they do not take width out of it.
describe("axisAt", () => {
  it("is time/duration as a percentage", () => {
    expect(axisAt(50, 100)).toBe("50%");
    expect(axisAt(50, 60)).toBe(`${(50 / 60) * 100}%`);
  });

  it("does not care how many sections there are", () => {
    // the old translator shifted by (n-1)*2px; this one cannot
    expect(axisAt(50, 100)).toBe("50%");
    expect(axisAt(0, 100)).toBe("0%");
    expect(axisAt(100, 100)).toBe("100%");
  });

  it("advances through a hole instead of stalling in it", () => {
    expect(axisAt(45, 60)).not.toBe(axisAt(40, 60));
    expect(Number.parseFloat(axisAt(45, 60))).toBeGreaterThan(
      Number.parseFloat(axisAt(40, 60)),
    );
  });

  it("clamps a time outside the video instead of running off the rail", () => {
    expect(axisAt(-10, 100)).toBe(axisAt(0, 100));
    expect(axisAt(999, 100)).toBe(axisAt(100, 100));
  });

  it("survives a duration of zero before metadata arrives", () => {
    expect(axisAt(0, 0)).toBe("0%");
    expect(axisAt(5, 0)).toBe("0%");
  });

  // Both the curve and the rail start at the container's x=0: the SVG is
  // left:0/width:100% with no padding, and the path opens at M0. Nothing may
  // introduce an offset at the origin.
  it("puts the origin at a true zero, with no gap added in front", () => {
    expect(axisAt(0, 100)).toBe("0%");
    expect(heatArea([0.5, 0.5]).startsWith("M0,")).toBe(true);
    const css = readFileSync("src/ui/HeatmapProgress.module.css", "utf8");
    const svg = /\.svg\s*\{[^}]*\}/s.exec(css)![0];
    expect(svg).toMatch(/left:\s*0/);
    expect(svg).not.toMatch(/padding/);
  });
});

describe("sectionCuts", () => {
  it("marks only the joints between touching named sections", () => {
    expect(
      sectionCuts(
        [
          { start: 0, end: 10 },
          { start: 10, end: 30 },
          { start: 30, end: 60 },
        ],
        60,
      ),
    ).toEqual([axisAt(10, 60), axisAt(30, 60)]);
  });

  it("skips a hole — an absence is not a joint", () => {
    expect(
      sectionCuts(
        [
          { start: 0, end: 10 },
          { start: 20, end: 40 },
        ],
        60,
      ),
    ).toEqual([]);
  });
});

describe("gapMask", () => {
  it("is skipped entirely when there is no interior boundary", () => {
    expect(gapMask([])).toBeUndefined();
  });

  // The mark starts at the joint and runs right. Centring it would sit 1px
  // left of the rail's own cut.
  it("cuts from the edge rightward, not centred on it", () => {
    const mask = gapMask(["25%"], 2);
    expect(mask).toContain("#000 25%");
    expect(mask).toContain("transparent 25%");
    expect(mask).toContain("transparent calc(25% + 2px)");
    expect(mask).toContain("#000 calc(25% + 2px)");
    // the old centred form would have shifted the cut half a gap left
    expect(mask).not.toContain("1px)");
  });

  it("takes the same axis percentages the rail uses", () => {
    const edge = axisAt(50, 100);
    const mask = gapMask([edge])!;
    expect(mask).toContain(`transparent ${edge}`);
    expect(mask).toContain(`transparent calc(${edge} + 2px)`);
  });

  it("stays opaque at both ends whatever the boundaries", () => {
    const mask = gapMask(["25%", "60%"])!;
    expect(mask.startsWith("linear-gradient(to right, #000 0%")).toBe(true);
    expect(mask.endsWith("#000 100%)")).toBe(true);
  });

  it("cuts once per boundary", () => {
    const mask = gapMask(["20%", "40%", "80%"])!;
    expect(mask.match(/transparent /g)).toHaveLength(6);
  });
});

describe("playhead", () => {
  const css = readFileSync("src/ui/ProgressBar.module.css", "utf8");
  const tsx = readFileSync("src/ui/ProgressBar.tsx", "utf8");
  const block = /\.playhead\s*\{[^}]*\}/s.exec(css)?.[0] ?? "";

  // One rectangle: the needle and the fill both take axisAt(shown). There is
  // no flex box to round against, so sharing the expression is enough.
  it("reuses the fill's own axis expression", () => {
    expect(block, "the rule belongs with the rail, not the curve").toBeTruthy();
    expect(tsx).toMatch(/styles\.playhead/);
    expect(tsx).toMatch(/left:\s*at\(shown\)/);
    expect(tsx).toMatch(/styles\.played\}\s*style=\{\{\s*width:\s*at\(shown\)/);
  });

  it("is not drawn by the heatmap", () => {
    const heatmap = readFileSync("src/ui/HeatmapProgress.tsx", "utf8");
    expect(heatmap).not.toMatch(/styles\.playhead/);
    expect(heatmap).not.toMatch(/<rect[\s/>]/);
  });

  // `left` is where the fill ENDS, so the needle's right edge must land on it.
  // Centring leaves half the needle past the blue, which reads as the needle
  // running ahead of the fill — the very drift being fixed.
  it("hangs its full width left so its right edge is the fill's edge", () => {
    const w = Number(/width:\s*(\d+)px/.exec(block)![1]);
    expect(w).toBeGreaterThanOrEqual(1);
    expect(w).toBeLessThanOrEqual(2);
    expect(block).toMatch(new RegExp(`margin-left:\\s*-${w}px`));
  });

  // That same pull would put the needle outside the rail near x=0 — the one
  // thing in the bar crossing the origin, which makes the curve beside it look
  // shifted right by its width. The clip is geometric, so it holds at 0.04s
  // (where metadata usually parks the video) as well as at an exact 0, which a
  // `currentTime === 0` check in JS silently missed.
  it("cannot overhang the rail's left edge, at any currentTime", () => {
    const track = /\.track\s*\{[^}]*\}/s.exec(css)![0];
    const clip = /clip-path:\s*inset\(\s*(-?\d+)px\s+0\s+(-?\d+)px\s+0\s*\)/.exec(track);
    expect(clip, "the track must clip its X axis").toBeTruthy();
    // vertical bounds stay open: the crests and the needle rise above this box
    expect(Number(clip![1])).toBeLessThan(-20);
    expect(Number(clip![2])).toBeLessThan(-20);
    // and no JS special-case is left behind pretending to do the same job
    expect(tsx).not.toMatch(/atOrigin/);
  });

  it("draws once", () => {
    expect(tsx.match(/styles\.playhead/g)).toHaveLength(1);
  });

  // .track is a 12px box that never changes height. A needle anchored to
  // .bar's EDGE would slide when the bar grows on hover; the track centre
  // cannot move.
  it("takes its vertical anchor from the track's centre, not the bar's edge", () => {
    expect(block).toMatch(/bottom:\s*50%/);
    expect(block).not.toMatch(/(^|[^-])\bbottom:\s*-?\d+px/m);
    expect(block).toMatch(/margin-bottom:\s*-2px/);
  });

  it("reaches the crest, deriving its height from the same offsets", () => {
    const height = /height:\s*calc\(2px \+ 5px \+ 17px\)/.exec(block);
    expect(height, "height must derive from the rail and SVG offsets").toBeTruthy();
    // 2px below centre + 5px clearance + the curve's 17px band = its full span
    const svgCss = readFileSync("src/ui/HeatmapProgress.module.css", "utf8");
    const svg = /\.svg\s*\{[^}]*\}/s.exec(svgCss)![0];
    expect(svg).toMatch(/bottom:\s*calc\(50% \+ 5px\)/);
    expect(svg).toMatch(/height:\s*17px/);
  });
});

// The played fill came back, but INSIDE the rail — not as the floating bar in
// its own row above it, whose band the heatmap curve now owns. Two blue shapes
// stacked in that band read as one broken bar, which is why it was removed.
describe("the played fill", () => {
  const css = readFileSync("src/ui/ProgressBar.module.css", "utf8");
  const block = /\.played\s*\{[^}]*\}/s.exec(css)?.[0] ?? "";

  it("fills the rail's own box, not a row above it", () => {
    expect(block).toBeTruthy();
    // the floating version's signature: lifted clear of the segment by `bottom`
    expect(block).not.toMatch(/bottom:\s*calc\(100%/);
    expect(block).not.toMatch(/top:\s*auto/);
  });

  it("stays flat — the curve above it is what carries the gradient", () => {
    expect(block).not.toMatch(/linear-gradient/);
  });

  // Section joints are a mask on the one rectangle, not a flex gap that
  // steals width. The fill can be continuous underneath; the marks punch
  // through at the same percentages the curve uses.
  it("cuts joints with a mask, not a flex gap", () => {
    const tsx = readFileSync("src/ui/ProgressBar.tsx", "utf8");
    expect(tsx).toMatch(/gapMask\(sectionCuts/);
    expect(tsx).toMatch(/styles\.played\}\s*style=\{\{\s*width:\s*at\(shown\)/);
    expect(css).not.toMatch(/\.track\s*\{[^}]*gap:/s);
  });
});

// The samples cross a trust boundary: WordPress serves them, and a filter or a
// hand-edited meta can put anything in the array. One NaN reaching the `d`
// attribute blanks the entire curve, so bad samples are mended in place and
// logged; only a majority-invalid array voids the curve outright. In place and
// not filtered out, because a sample's index is its X coordinate.
describe("sanitizeHeatmap", () => {
  const base = { duration: 100 } as VideoPayload;

  it("scales to 0..1 against the array's own peak", () => {
    const out = sanitizeHeatmap({ ...base, heatmap: [10, 40, 20] });
    expect(out.heatmap).toEqual([0.25, 1, 0.5]);
  });

  it("mends non-finite values instead of passing NaN to the path", () => {
    // one bad sample in six: the curve survives on the rest, which is the
    // whole point — a single NaN used to void every good sample with it.
    // The hole keeps its slot, bridged from 20 and 30, because the index IS
    // the time axis; see tests/heatgeometry.test.ts.
    const dirty = [10, 20, NaN, 30, 40, 20] as unknown as number[];
    expect(sanitizeHeatmap({ ...base, heatmap: dirty }).heatmap).toEqual([
      0.25, 0.5, 0.625, 0.75, 1, 0.5,
    ]);
  });

  it("keeps the good samples with mixed junk, up to half the array", () => {
    const dirty = [10, "x", null, 20] as unknown as number[];
    const out = sanitizeHeatmap({ ...base, heatmap: dirty }).heatmap!;
    // the two holes are bridged between 10 and 20, keeping all four slots
    expect(out).toHaveLength(4);
    [0.5, 2 / 3, 5 / 6, 1].forEach((want, i) => {
      expect(out[i]).toBeCloseTo(want, 10);
    });
  });

  it("discards the whole curve when more than half is invalid", () => {
    // 4 of 6 unusable: what is left is a shape nobody measured, so drawing it
    // would be worse than drawing nothing
    const mostlyJunk = [10, "x", null, Infinity, NaN, 20] as unknown as number[];
    expect(sanitizeHeatmap({ ...base, heatmap: mostlyJunk }).heatmap).toBeNull();
  });

  it("nulls the field when fewer than two samples survive", () => {
    expect(sanitizeHeatmap({ ...base, heatmap: [5] }).heatmap).toBeNull();
    expect(
      sanitizeHeatmap({ ...base, heatmap: ["a"] as unknown as number[] }).heatmap,
    ).toBeNull();
  });

  it("survives an all-zero video with no views yet", () => {
    expect(sanitizeHeatmap({ ...base, heatmap: [0, 0, 0] }).heatmap).toEqual([0, 0, 0]);
  });

  it("leaves a payload without a heatmap untouched", () => {
    const out = sanitizeHeatmap(base);
    expect(out).toBe(base);
  });
});
