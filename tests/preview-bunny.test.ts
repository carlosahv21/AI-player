import { describe, expect, it } from "vitest";
import {
  bunnyLibraryBase,
  bunnySeekCues,
  cueAt,
} from "../src/ui/hooks/usePreviewSprite";
import { thumbSize } from "../src/ui/PreviewThumb";

const BASE =
  "https://vz-07b7e659-3fa.b-cdn.net/afe9b042-78df-46b8-ad42-cf16c922c487";

describe("bunnyLibraryBase", () => {
  it("reads the library root off an HLS URL", () => {
    expect(bunnyLibraryBase(`${BASE}/playlist.m3u8`)).toBe(BASE);
  });

  it("reads it off the poster too", () => {
    expect(bunnyLibraryBase(`${BASE}/thumbnail.jpg`)).toBe(BASE);
  });

  it("ignores local and non-Bunny URLs", () => {
    expect(bunnyLibraryBase("/sprite.png")).toBeNull();
    expect(bunnyLibraryBase("https://cdn.example.com/vid/playlist.m3u8")).toBeNull();
    expect(bunnyLibraryBase(null)).toBeNull();
  });
});

describe("bunnySeekCues", () => {
  it("builds a 6×6 map at 2s for a long video", () => {
    const cues = bunnySeekCues(BASE, 317, 300, 533);
    expect(cues).toHaveLength(159);
    expect(cues[0]).toMatchObject({
      start: 0,
      end: 2,
      x: 0,
      y: 0,
      w: 300,
      h: 533,
      spriteUrl: `${BASE}/seek/_0.jpg`,
    });
    // frame 5 is the last cell of row 0
    expect(cues[5]).toMatchObject({ x: 1500, y: 0, spriteUrl: `${BASE}/seek/_0.jpg` });
    // frame 6 starts row 1
    expect(cues[6]).toMatchObject({ x: 0, y: 533, start: 12 });
    // sheet 1 starts at frame 36 = 72s
    expect(cues[36]).toMatchObject({
      start: 72,
      x: 0,
      y: 0,
      spriteUrl: `${BASE}/seek/_1.jpg`,
    });
    expect(cueAt(cues, 3)?.start).toBe(2);
    expect(cueAt(cues, 73)?.spriteUrl).toBe(`${BASE}/seek/_1.jpg`);
  });

  it("uses 1s steps under 10s", () => {
    const cues = bunnySeekCues(BASE, 8, 300, 169);
    expect(cues).toHaveLength(9);
    expect(cues[1]).toMatchObject({ start: 1, end: 2 });
  });

  it("returns nothing for a broken sheet or duration", () => {
    expect(bunnySeekCues(BASE, 0, 300, 533)).toEqual([]);
    expect(bunnySeekCues(BASE, 20, 0, 533)).toEqual([]);
  });
});

describe("thumbSize", () => {
  it("keeps landscape at the requested width", () => {
    const box = thumbSize({ w: 300, h: 169 }, 160);
    expect(box.w).toBeCloseTo(160);
    expect(box.h).toBeCloseTo(90.13, 1);
  });

  it("fits portrait on the same long side, not a 160-wide tower", () => {
    const box = thumbSize({ w: 300, h: 533 }, 160);
    expect(box.h).toBeCloseTo(160);
    expect(box.w).toBeCloseTo(90.06, 1);
  });
});
