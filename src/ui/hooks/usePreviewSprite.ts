import { useEffect, useState } from "react";
import type { PreviewSource } from "../../core/types";

/** One thumbnail: where it lives inside the sprite sheet. */
export interface PreviewCue {
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreviewData {
  spriteUrl: string;
  cues: PreviewCue[];
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

/**
 * Loads the sprite map once per payload.
 *
 * Returns null whenever previews are unavailable — no `preview` field, a
 * fetch that failed, an unparseable VTT — and every caller treats null as
 * "render no preview". A missing sprite must never break the timeline.
 */
export function usePreviewSprite(
  preview: PreviewSource | null | undefined,
): PreviewData | null {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    if (!preview?.spriteUrl || !preview?.vttUrl) {
      setData(null);
      return;
    }

    let cancelled = false;
    fetch(preview.vttUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (cancelled) return;
        const cues = parsePreviewVtt(text);
        setData(cues.length > 0 ? { spriteUrl: preview.spriteUrl, cues } : null);
      })
      // a broken sprite is a missing nicety, not an error worth surfacing
      .catch(() => {
        if (!cancelled) setData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [preview?.spriteUrl, preview?.vttUrl]);

  return data;
}
