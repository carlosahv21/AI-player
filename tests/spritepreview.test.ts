/*
 * The `preview` block describes sheet geometry instead of listing frames, so
 * the player computes positions without knowing which provider produced
 * them. These pin the arithmetic, especially the boundaries between sheets:
 * an off-by-one there shows the wrong frame, which looks like a seek bug.
 */
import { describe, expect, it } from "vitest";
import { spriteCues, cueAt } from "../src/ui/hooks/usePreviewSprite";
import { isSpritePreview } from "../src/core/types";
import type { SpritePreviewSource } from "../src/core/types";

const sprite: SpritePreviewSource = {
  type: "sprite",
  baseUrl: "https://cdn.test/abc/seek/_",
  extension: ".jpg",
  interval: 2,
  columns: 6,
  rows: 6,
  frameWidth: 300,
  sheetWidth: 1800,
};

/** 1800×3198 is the real portrait sheet: 300×533 cells. */
const CELL_W = 300;
const CELL_H = 533;

/** Which sheet/row/column the cue covering `time` points at. */
function locate(time: number, duration = 317) {
  const cues = spriteCues(sprite, duration, CELL_W, CELL_H);
  const cue = cueAt(cues, time);
  if (!cue) return null;
  const sheet = Number(
    cue.spriteUrl!.replace("https://cdn.test/abc/seek/_", "").replace(".jpg", ""),
  );
  return { sheet, row: cue.y / CELL_H, column: cue.x / CELL_W };
}

describe("sprite geometry", () => {
  it("maps the first frames across the top row", () => {
    expect(locate(0)).toEqual({ sheet: 0, row: 0, column: 0 });
    expect(locate(1.9)).toEqual({ sheet: 0, row: 0, column: 0 });
    expect(locate(2)).toEqual({ sheet: 0, row: 0, column: 1 });
    expect(locate(10)).toEqual({ sheet: 0, row: 0, column: 5 });
  });

  it("wraps to the next row after six columns", () => {
    expect(locate(12)).toEqual({ sheet: 0, row: 1, column: 0 });
    expect(locate(24)).toEqual({ sheet: 0, row: 2, column: 0 });
  });

  // The boundary that actually breaks: frame 35 ends a sheet, 36 opens the next.
  it("crosses from one sheet to the next", () => {
    expect(locate(70)).toEqual({ sheet: 0, row: 5, column: 5 });
    expect(locate(72)).toEqual({ sheet: 1, row: 0, column: 0 });
    expect(locate(74)).toEqual({ sheet: 1, row: 0, column: 1 });
  });

  it("crosses the second boundary too", () => {
    expect(locate(142)).toEqual({ sheet: 1, row: 5, column: 5 });
    expect(locate(144)).toEqual({ sheet: 2, row: 0, column: 0 });
  });

  it("places the last frame of a 317s video on the fifth sheet", () => {
    // 317 / 2 = 158 frames; 158 / 36 = sheet 4, slot 14 → row 2, column 2.
    expect(locate(316)).toEqual({ sheet: 4, row: 2, column: 2 });
  });

  it("honours a one-second interval for short videos", () => {
    const short = { ...sprite, interval: 1 };
    const cues = spriteCues(short, 9, CELL_W, CELL_H);
    expect(cues[0].start).toBe(0);
    expect(cues[1].start).toBe(1);
    expect(cues[6].y).toBe(CELL_H);
  });

  it("covers the whole duration without gaps", () => {
    const cues = spriteCues(sprite, 317, CELL_W, CELL_H);
    for (let t = 0; t < 317; t += 1) {
      expect(cueAt(cues, t), `no cue covers t=${t}`).not.toBeNull();
    }
  });

  it("builds sheet urls from baseUrl and extension", () => {
    const cues = spriteCues(sprite, 317, CELL_W, CELL_H);
    expect(cues[0].spriteUrl).toBe("https://cdn.test/abc/seek/_0.jpg");
    expect(cues[36].spriteUrl).toBe("https://cdn.test/abc/seek/_1.jpg");
  });

  // Bad geometry must yield no cues rather than NaN positions, which would
  // render a torn tile instead of degrading to no preview.
  it("returns nothing for unusable geometry", () => {
    expect(spriteCues(sprite, 0, CELL_W, CELL_H)).toEqual([]);
    expect(spriteCues(sprite, 317, 0, CELL_H)).toEqual([]);
    expect(spriteCues({ ...sprite, interval: 0 }, 317, CELL_W, CELL_H)).toEqual([]);
    expect(spriteCues({ ...sprite, columns: 0 }, 317, CELL_W, CELL_H)).toEqual([]);
  });
});

describe("preview contract", () => {
  it("tells the two preview flavours apart", () => {
    expect(isSpritePreview(sprite)).toBe(true);
    expect(isSpritePreview({ spriteUrl: "/s.png", vttUrl: "/s.vtt" })).toBe(false);
    expect(isSpritePreview(null)).toBe(false);
    expect(isSpritePreview(undefined)).toBe(false);
  });
});
