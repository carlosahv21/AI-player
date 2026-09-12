import { describe, expect, it } from "vitest";
import { clamp } from "../src/core/store";

const DURATION = 21.9;

/** Mirrors moveWindow() in LoopPanel: slide, keep the length, stay in bounds. */
function moveWindow(
  range: { start: number; end: number },
  pointerTime: number,
  grabOffset: number,
) {
  const span = range.end - range.start;
  const start = clamp(pointerTime - grabOffset, 0, DURATION - span);
  return { start, end: start + span };
}

describe("dragging the whole loop window", () => {
  const range = { start: 4, end: 7 }; // a 3s window
  const grab = 1.5; // grabbed in the middle

  it("keeps the window length while sliding", () => {
    const moved = moveWindow(range, 12, grab);
    expect(moved.end - moved.start).toBeCloseTo(3);
    expect(moved.start).toBeCloseTo(10.5);
  });

  it("stops at the start instead of going negative", () => {
    const moved = moveWindow(range, 0.2, grab);
    expect(moved.start).toBe(0);
    expect(moved.end).toBeCloseTo(3);
  });

  it("stops at the end instead of running past the duration", () => {
    const moved = moveWindow(range, DURATION + 5, grab);
    expect(moved.end).toBeCloseTo(DURATION);
    expect(moved.start).toBeCloseTo(DURATION - 3);
  });

  it("holds the grab point under the pointer while in range", () => {
    const moved = moveWindow(range, 9, grab);
    expect(moved.start + grab).toBeCloseTo(9);
  });
});
