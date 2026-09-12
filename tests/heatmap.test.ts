import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gapMask, heatArea, railPosition } from "../src/ui/HeatmapProgress";
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
  // shape down through the rail when a segment grows on hover (4px -> 9px).
  it("anchors above the rail by bottom, clearing the tallest segment", () => {
    const bottom = /bottom:\s*calc\(50%\s*\+\s*(\d+)px\)/.exec(css);
    expect(bottom, "the SVG must be anchored by bottom: calc(50% + Npx)").toBeTruthy();
    // half of the 9px hovered segment
    expect(Number(bottom![1])).toBeGreaterThanOrEqual(5);
    expect(css).not.toMatch(/^\s*top:/m);
  });

  it("stays inside .wrap's 44px so it never spills over the title row", () => {
    const offset = Number(/bottom:\s*calc\(50%\s*\+\s*(\d+)px\)/.exec(css)![1]);
    const height = Number(/height:\s*(\d+)px/.exec(css)![1]);
    expect(22 + offset + height).toBeLessThanOrEqual(44);
  });
});

// The rail is a flex row with a 2px gap, so its segments share
// `100% - (n-1)*2px`, not the full width. Positioning anything by a plain
// time/duration percentage drifts right by up to (n-1)*2px — which is exactly
// the playhead sitting past the blue edge, and the mask's cuts missing the
// rail's gaps.
describe("railPosition", () => {
  const four = [
    { start: 0, end: 25 },
    { start: 25, end: 50 },
    { start: 50, end: 75 },
    { start: 75, end: 100 },
  ];

  it("is a plain percentage when there are no gaps to account for", () => {
    expect(railPosition(50, 100, [])).toBe("50%");
    expect(railPosition(50, 100, [{ start: 0, end: 100 }])).toBe("50%");
  });

  it("subtracts the gaps from the track and adds back the ones passed", () => {
    // 50 is section 3's own start, so only ONE gap lies strictly left of it:
    // the gap that opens AT 50 is still ahead. 3 gaps total, hence the -6px.
    expect(railPosition(50, 100, four)).toBe("calc(50 * (100% - 6px) / 100 + 2px)");
    // mid-section, both earlier gaps are behind
    expect(railPosition(60, 100, four)).toBe("calc(60 * (100% - 6px) / 100 + 4px)");
  });

  it("starts at the origin and never overshoots the end", () => {
    expect(railPosition(0, 100, four)).toBe("calc(0 * (100% - 6px) / 100 + 0px)");
    // the last position is the full track plus every gap, i.e. exactly 100%
    expect(railPosition(100, 100, four)).toBe("calc(100 * (100% - 6px) / 100 + 6px)");
  });

  // A section's start sits at the CLOSING edge of the previous segment, before
  // the gap that follows. Counting that gap as already passed pushed every
  // boundary a full GAP_PX right — the heatmap's first cut landing clear of
  // the rail's first divider.
  it("puts a boundary before its own gap, not after it", () => {
    // section 2 starts at 25: one gap precedes it, and it is NOT yet passed
    expect(railPosition(25, 100, four)).toBe("calc(25 * (100% - 6px) / 100 + 0px)");
    // a hair later and that same gap is behind us
    expect(railPosition(25.001, 100, four)).toContain("+ 2px)");
  });

  // flexGrow is the span, so the share is of the summed spans, not of the
  // duration. Identical while the sections tile the video; drifts the moment
  // they leave a hole or stop short.
  it("shares the track by summed spans, the way flexGrow does", () => {
    const holed = [
      { start: 0, end: 10 },
      { start: 20, end: 40 },
      { start: 50, end: 60 },
    ];
    // 40s covered of a 60s video: the second boundary is 30/40 of the track
    expect(railPosition(50, 60, holed)).toBe("calc(75 * (100% - 4px) / 100 + 2px)");
    // and a time inside a hole counts only the seconds actually covered
    expect(railPosition(45, 60, holed)).toBe(railPosition(40, 60, holed));
  });

  it("ignores sections that carry no span at all", () => {
    expect(railPosition(5, 10, [{ start: 0, end: 0 }, { start: 0, end: 0 }])).toBe(
      "0px",
    );
  });

  it("clamps a time outside the video instead of running off the rail", () => {
    expect(railPosition(-10, 100, four)).toBe(railPosition(0, 100, four));
    expect(railPosition(999, 100, four)).toBe(railPosition(100, 100, four));
  });

  it("survives a duration of zero before metadata arrives", () => {
    expect(railPosition(0, 0, four)).toBe("0px");
  });

  // Both the curve and the rail start at the container's x=0: the SVG is
  // left:0/width:100% with no padding, and the path opens at M0. Nothing may
  // introduce an offset at the origin.
  it("puts the origin at a true zero, with no gap added in front", () => {
    expect(railPosition(0, 100, four)).toMatch(/\+ 0px\)$/);
    expect(heatArea([0.5, 0.5]).startsWith("M0,")).toBe(true);
    const css = readFileSync("src/ui/HeatmapProgress.module.css", "utf8");
    const svg = /\.svg\s*\{[^}]*\}/s.exec(css)![0];
    expect(svg).toMatch(/left:\s*0/);
    expect(svg).not.toMatch(/padding/);
  });
});

describe("gapMask", () => {
  it("is skipped entirely when there is no interior boundary", () => {
    expect(gapMask([])).toBeUndefined();
  });

  // Flex puts the gap AFTER the segment, so the cut starts at the edge and
  // runs right. Centring it on the edge would sit 1px left of the rail's gap.
  it("cuts from the edge rightward, not centred on it", () => {
    const mask = gapMask(["25%"], 2);
    expect(mask).toContain("#000 25%");
    expect(mask).toContain("transparent 25%");
    expect(mask).toContain("transparent calc(25% + 2px)");
    expect(mask).toContain("#000 calc(25% + 2px)");
    // the old centred form would have shifted the cut half a gap left
    expect(mask).not.toContain("1px)");
  });

  it("takes the corrected lengths railPosition produces", () => {
    const edge = railPosition(50, 100, [
      { start: 0, end: 50 },
      { start: 50, end: 100 },
    ]);
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

  // The fix for the micro-drift: flex rounds each segment's box its own way,
  // so ANY position computed in .wrap's coordinates — however correct the
  // arithmetic — lands a fraction off the fill's edge. Sharing the parent and
  // the expression is what makes them the same pixel.
  it("rides the segment and reuses the fill's own expression", () => {
    expect(block, "the rule belongs with the rail, not the curve").toBeTruthy();
    // the needle is placed by the very call that sizes the fill
    expect(tsx).toMatch(/styles\.playhead/);
    expect(tsx).toMatch(/left:\s*local\(shown\)/);
    // .played is sized by the very same call
    expect(tsx).toMatch(/styles\.played\}\s*style=\{\{\s*width:\s*local\(shown\)/);
  });

  it("is not positioned in .wrap by a calc() that re-derives flex's maths", () => {
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

  it("draws once, in the segment holding the current time", () => {
    // both bounds, or a needle appears in every segment after the playhead
    expect(tsx).toMatch(/shown >= seg\.start/);
    expect(tsx).toMatch(/shown < seg\.end/);
    // and the final frame still shows one: shown === duration is nobody's < end
    expect(tsx).toMatch(/seg === segments\[segments\.length - 1\]/);
  });

  // .segment animates 4px -> 9px on hover. A needle anchored to that box's
  // EDGE slid 2.5px up with it while the curve, which lives in .wrap, stayed
  // put — the one element meant to tie the two together drifting between them.
  // The centre is the only line a height change cannot move.
  it("takes its vertical anchor from the segment's centre, not its edge", () => {
    expect(block).toMatch(/bottom:\s*50%/);
    // the edge-anchored form, not the margin that offsets from the centre
    expect(block).not.toMatch(/(^|[^-])\bbottom:\s*-?\d+px/m);
    // half the 4px rail, so the foot rests on the rail's underside
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

  // Requirement: the section divisions must survive at any progress. They do
  // because each fill is clamped inside its own segment and .track's gap
  // between segments is never painted.
  it("is clamped per segment so the track gap stays unpainted", () => {
    const tsx = readFileSync("src/ui/ProgressBar.tsx", "utf8");
    expect(tsx).toMatch(/styles\.played\}\s*style=\{\{\s*width:\s*local\(shown\)/);
    expect(css).toMatch(/\.track\s*\{[^}]*gap:\s*2px/s);
  });
});

// The samples cross a trust boundary: WordPress serves them, and a filter or a
// hand-edited meta can put anything in the array. One NaN reaches the `d`
// attribute and blanks the entire curve with no error anywhere.
describe("sanitizeHeatmap", () => {
  const base = { duration: 100 } as VideoPayload;

  it("scales to 0..1 against the array's own peak", () => {
    const out = sanitizeHeatmap({ ...base, heatmap: [10, 40, 20] });
    expect(out.heatmap).toEqual([0.25, 1, 0.5]);
  });

  it("drops non-finite values instead of passing NaN to the path", () => {
    const dirty = [10, "x", null, Infinity, NaN, 20] as unknown as number[];
    expect(sanitizeHeatmap({ ...base, heatmap: dirty }).heatmap).toEqual([0.5, 1]);
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
