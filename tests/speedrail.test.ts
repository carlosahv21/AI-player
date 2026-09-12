import { describe, expect, it } from "vitest";
import { PLAYBACK_RATES } from "../src/core/types";

/** Mirrors rateAt() in SpeedPanel: pointer ratio -> nearest stop. */
function rateAt(ratio: number) {
  const last = PLAYBACK_RATES.length - 1;
  const i = Math.round(Math.min(1, Math.max(0, ratio)) * last);
  return PLAYBACK_RATES[i];
}

describe("speed rail drag", () => {
  it("snaps the ends to the first and last rate", () => {
    expect(rateAt(0)).toBe(PLAYBACK_RATES[0]);
    expect(rateAt(1)).toBe(PLAYBACK_RATES[PLAYBACK_RATES.length - 1]);
  });

  it("clamps a pointer dragged past either edge", () => {
    expect(rateAt(-0.4)).toBe(PLAYBACK_RATES[0]);
    expect(rateAt(1.6)).toBe(PLAYBACK_RATES[PLAYBACK_RATES.length - 1]);
  });

  it("lands on every stop across the rail", () => {
    const last = PLAYBACK_RATES.length - 1;
    PLAYBACK_RATES.forEach((rate, i) => {
      expect(rateAt(i / last)).toBe(rate);
    });
  });

  it("rounds to the nearer stop, not the lower one", () => {
    const last = PLAYBACK_RATES.length - 1;
    const step = 1 / last;
    // just past halfway between stop 0 and 1 -> stop 1
    expect(rateAt(step * 0.51)).toBe(PLAYBACK_RATES[1]);
    expect(rateAt(step * 0.49)).toBe(PLAYBACK_RATES[0]);
  });
});
