import { describe, expect, it } from "vitest";

/** Mirrors labelShift() in ProgressBar: keeps the tooltip inside the bar. */
function labelShift(guide: number, labelW: number, barW: number): number {
  if (labelW <= 0 || barW <= 0) return -50;
  const halfBar = (labelW / 2 / barW) * 100;
  const overLeft = Math.max(0, halfBar - guide * 100);
  const overRight = Math.max(0, halfBar - (1 - guide) * 100);
  return -50 + (overLeft - overRight) * (barW / labelW);
}

/** Left edge of the tooltip in px, given where the pointer is. */
function leftPx(guide: number, labelW: number, barW: number): number {
  return guide * barW + (labelShift(guide, labelW, barW) / 100) * labelW;
}

describe("guide tooltip clamp", () => {
  const BAR = 600;

  it("centres the label away from the edges", () => {
    expect(labelShift(0.5, 176, BAR)).toBeCloseTo(-50);
  });

  it("never lets the label leave the bar, at any pointer position", () => {
    for (const labelW of [132, 176]) {
      for (let i = 0; i <= 100; i += 1) {
        const g = i / 100;
        const left = leftPx(g, labelW, BAR);
        expect(left).toBeGreaterThanOrEqual(-0.5);
        expect(left + labelW).toBeLessThanOrEqual(BAR + 0.5);
      }
    }
  });

  it("moves continuously, with no jump between neighbouring positions", () => {
    let prev = leftPx(0, 176, BAR);
    for (let i = 1; i <= 200; i += 1) {
      const left = leftPx(i / 200, 176, BAR);
      // a 0.5% step of a 600px bar can move the label at most 3px
      expect(Math.abs(left - prev)).toBeLessThanOrEqual(3.01);
      prev = left;
    }
  });

  it("falls back to centred when nothing is measured yet", () => {
    expect(labelShift(0.3, 0, BAR)).toBe(-50);
    expect(labelShift(0.3, 176, 0)).toBe(-50);
  });
});
