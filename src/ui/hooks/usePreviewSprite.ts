import { useEffect, useState } from "react";
import type { PreviewSource, SpritePreviewSource } from "../../core/types";
import { isSpritePreview } from "../../core/types";

/** One thumbnail: where it lives inside the sprite sheet. */
export interface PreviewCue {
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Set when this cue lives on a different sheet than `PreviewData.spriteUrl`. */
  spriteUrl?: string;
}

export interface PreviewData {
  spriteUrl: string;
  cues: PreviewCue[];
}

/**
 * Fallback geometry for sheets derived from a bare Bunny URL.
 *
 * Only the legacy path below uses these. When the payload carries a
 * `preview` block the numbers come from the server, which is what lets the
 * player serve any provider without knowing one.
 */
const BUNNY_COLS = 6;
const BUNNY_ROWS = 6;
const BUNNY_PER_SHEET = BUNNY_COLS * BUNNY_ROWS;

/**
 * Cue map for a declared sprite contract.
 *
 * Pure geometry: sheet `floor(i / perSheet)`, and inside it row
 * `floor((i % perSheet) / columns)` and column `(i % perSheet) % columns`.
 * Cell height is measured, not declared — it follows the video's aspect
 * ratio, so a portrait clip is ~300×533 and a landscape one ~300×169.
 */
export function spriteCues(
  preview: SpritePreviewSource,
  duration: number,
  cellW: number,
  cellH: number,
): PreviewCue[] {
  const { columns, rows, interval } = preview;
  const perSheet = columns * rows;

  if (duration <= 0 || cellW <= 0 || cellH <= 0) return [];
  if (columns <= 0 || rows <= 0 || interval <= 0) return [];

  const frames = Math.floor(duration / interval) + 1;
  const cues: PreviewCue[] = [];

  for (let i = 0; i < frames; i += 1) {
    const start = i * interval;
    if (start > duration) break;
    const slot = i % perSheet;
    cues.push({
      start,
      end: start + interval,
      x: (slot % columns) * cellW,
      y: Math.floor(slot / columns) * cellH,
      w: cellW,
      h: cellH,
      spriteUrl: `${preview.baseUrl}${Math.floor(i / perSheet)}${preview.extension}`,
    });
  }

  return cues;
}

/**
 * Library root of a Bunny Stream URL (`…/playlist.m3u8`, `…/thumbnail.jpg`).
 * Anything else returns null — local mocks stay on their VTT sprite.
 */
export function bunnyLibraryBase(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/^vz-[a-z0-9-]+\.b-cdn\.net$/i.test(parsed.hostname)) return null;
    const guid = parsed.pathname.split("/").filter(Boolean)[0];
    if (!guid) return null;
    return `${parsed.origin}/${guid}`;
  } catch {
    return null;
  }
}

/** Cue map for Bunny's `seek/_N.jpg` sheets. Cell size comes from the first sheet. */
export function bunnySeekCues(
  base: string,
  duration: number,
  cellW: number,
  cellH: number,
): PreviewCue[] {
  if (duration <= 0 || cellW <= 0 || cellH <= 0) return [];
  const interval = duration < 10 ? 1 : 2;
  const frames = Math.floor(duration / interval) + 1;
  const cues: PreviewCue[] = [];
  for (let i = 0; i < frames; i += 1) {
    const start = i * interval;
    if (start > duration) break;
    const slot = i % BUNNY_PER_SHEET;
    cues.push({
      start,
      end: start + interval,
      x: (slot % BUNNY_COLS) * cellW,
      y: Math.floor(slot / BUNNY_COLS) * cellH,
      w: cellW,
      h: cellH,
      spriteUrl: `${base}/seek/_${Math.floor(i / BUNNY_PER_SHEET)}.jpg`,
    });
  }
  return cues;
}

/** "00:01:02.500" | "01:02.500" -> seconds. */
function parseTimestamp(raw: string): number {
  const parts = raw.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return NaN;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if ([seconds, minutes, hours].some((n) => Number.isNaN(n))) return NaN;
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Parses the thumbnail flavour of WebVTT: each cue's payload is an image URL
 * carrying a media fragment, `sprite.jpg#xywh=0,0,160,90`.
 *
 * Written by hand rather than pulled from a library — it is one regex and a
 * split, and the player already ships enough bytes.
 */
export function parsePreviewVtt(text: string): PreviewCue[] {
  const cues: PreviewCue[] = [];
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const arrow = lines[i].indexOf("-->");
    if (arrow === -1) continue;

    const start = parseTimestamp(lines[i].slice(0, arrow));
    // a cue line may carry settings after the end stamp; the stamp is first
    const end = parseTimestamp(lines[i].slice(arrow + 3).trim().split(/\s+/)[0]);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    const payload = (lines[i + 1] ?? "").trim();
    if (!payload) continue;

    const hash = payload.indexOf("#xywh=");
    if (hash === -1) continue;

    const [x, y, w, h] = payload
      .slice(hash + 6)
      .split(",")
      .map(Number);
    if ([x, y, w, h].some((n) => Number.isNaN(n)) || w <= 0 || h <= 0) continue;

    cues.push({ start, end, x, y, w, h });
  }
  return cues;
}

/** The cue covering `time`, or null. Cues are ordered, so a scan is enough. */
export function cueAt(cues: PreviewCue[], time: number): PreviewCue | null {
  for (const cue of cues) {
    if (time >= cue.start && time < cue.end) return cue;
  }
  return cues.length > 0 && time >= cues[cues.length - 1].end
    ? cues[cues.length - 1]
    : null;
}

export interface PreviewMedia {
  hls?: string | null;
  poster?: string | null;
  duration: number;
}

/**
 * Loads the sprite map once per payload.
 *
 * An explicit `preview` (sprite + VTT) wins. When the plugin sends null —
 * WordPress today, and the HLS mock — Bunny Stream still publishes
 * `seek/_N.jpg` sheets, so those are derived from the HLS/poster URL.
 * Anything else stays null: a missing sprite must never break the timeline.
 */
export function usePreviewSprite(
  preview: PreviewSource | null | undefined,
  media?: PreviewMedia,
): PreviewData | null {
  const [data, setData] = useState<PreviewData | null>(null);

  const sprite = isSpritePreview(preview) ? preview : null;
  const vtt = preview && !isSpritePreview(preview) ? preview : null;

  useEffect(() => {
    let cancelled = false;

    /*
     * Declared sprite geometry: the server said how the sheets are laid
     * out, so nothing here needs to know which provider made them. Only
     * the cell height is measured, since it follows the video's aspect.
     */
    if (sprite) {
      const duration = media?.duration ?? 0;
      if (duration <= 0) {
        setData(null);
        return;
      }

      const firstSheet = `${sprite.baseUrl}0${sprite.extension}`;
      const img = new Image();

      img.onload = () => {
        if (cancelled) return;
        const cellW = img.naturalWidth / sprite.columns;
        const cellH = img.naturalHeight / sprite.rows;
        const cues = spriteCues(sprite, duration, cellW, cellH);
        setData(cues.length > 0 ? { spriteUrl: firstSheet, cues } : null);
      };

      // A sheet that will not load degrades to no preview. The bar, its
      // scrubbing and the loop panel all work without thumbnails, so this
      // must never reach the store's error state.
      img.onerror = () => {
        if (cancelled) return;
        console.warn(
          `[aivp] no se pudo cargar la hoja de miniaturas (${firstSheet}); ` +
            `se continúa sin vista previa.`,
        );
        setData(null);
      };

      img.src = firstSheet;

      return () => {
        cancelled = true;
      };
    }

    if (vtt && vtt.spriteUrl && vtt.vttUrl) {
      const preview = vtt;
      fetch(preview.vttUrl)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((text) => {
          if (cancelled) return;
          const cues = parsePreviewVtt(text);
          if (cues.length === 0) {
            console.warn(
              `[aivp] el VTT de miniaturas (${preview.vttUrl}) no tiene cues ` +
                `válidos; se continúa sin vista previa.`,
            );
            setData(null);
            return;
          }
          setData({ spriteUrl: preview.spriteUrl, cues });
        })
        // Degrading, not failing: the timeline, its scrubbing and the loop panel
        // all work without thumbnails, so a missing sprite must never reach the
        // store's error state and blank the player. Logged, because a 404 here
        // is a plugin misconfiguration someone can fix.
        .catch((error: unknown) => {
          if (cancelled) return;
          console.warn(
            `[aivp] no se pudieron cargar las miniaturas (${preview.vttUrl}):`,
            error,
          );
          setData(null);
        });
      return () => {
        cancelled = true;
      };
    }

    const base =
      bunnyLibraryBase(media?.hls) ?? bunnyLibraryBase(media?.poster);
    const duration = media?.duration ?? 0;
    if (!base || duration <= 0) {
      setData(null);
      return;
    }

    // Cell size follows the first sheet: portrait videos are ~300×533,
    // landscape ~300×169. Hardcoding either crops the other.
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const cellW = img.naturalWidth / BUNNY_COLS;
      const cellH = img.naturalHeight / BUNNY_ROWS;
      const cues = bunnySeekCues(base, duration, cellW, cellH);
      setData(cues.length > 0 ? { spriteUrl: `${base}/seek/_0.jpg`, cues } : null);
    };
    img.onerror = () => {
      if (cancelled) return;
      setData(null);
    };
    img.src = `${base}/seek/_0.jpg`;

    return () => {
      cancelled = true;
    };
  }, [
    sprite,
    vtt?.spriteUrl,
    vtt?.vttUrl,
    media?.hls,
    media?.poster,
    media?.duration,
  ]);

  return data;
}
