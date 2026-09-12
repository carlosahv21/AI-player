import type { PlaybackRate, PlayerState } from "./types";
import { PLAYBACK_RATES } from "./types";

const PREFS_KEY = "aivp:prefs";
const VIDEO_KEY = (id: number) => `aivp:video:${id}`;

// lastPosition is pointless near either end of the video
const RESUME_MIN_START = 10;
const RESUME_MIN_END = 30;

export interface StoredPrefs {
  playbackRate: PlaybackRate;
  mirrored: boolean;
  volume: number;
  muted: boolean;
  subtitleLang: string | null;
}

export interface StoredVideo {
  lastPosition: number;
  loop: { start: number; end: number } | null;
}

// ponytail: Safari private mode throws on access, not just on write
function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or storage blocked, practice tools still work
  }
}

/*
 * Deliberately the menu list, not ALLOWED_RATES: the rates above 2x exist
 * only while press-and-hold is held down, and must never be restored as a
 * saved preference on the next visit.
 */
function isRate(v: unknown): v is PlaybackRate {
  return (PLAYBACK_RATES as readonly number[]).includes(v as number);
}

function isRange(v: unknown): v is { start: number; end: number } {
  if (!v || typeof v !== "object") return false;
  const r = v as { start?: unknown; end?: unknown };
  return (
    typeof r.start === "number" &&
    typeof r.end === "number" &&
    Number.isFinite(r.start) &&
    Number.isFinite(r.end) &&
    r.start < r.end
  );
}

export function loadPrefs(): Partial<StoredPrefs> {
  const raw = read(PREFS_KEY);
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<StoredPrefs> = {};
  if (isRate(o.playbackRate)) out.playbackRate = o.playbackRate;
  if (typeof o.mirrored === "boolean") out.mirrored = o.mirrored;
  if (typeof o.volume === "number" && o.volume >= 0 && o.volume <= 1) {
    out.volume = o.volume;
  }
  if (typeof o.muted === "boolean") out.muted = o.muted;
  if (typeof o.subtitleLang === "string" || o.subtitleLang === null) {
    out.subtitleLang = o.subtitleLang as string | null;
  }
  return out;
}

export function savePrefs(state: PlayerState): void {
  write(PREFS_KEY, {
    playbackRate: state.playbackRate,
    mirrored: state.mirrored,
    volume: state.volume,
    muted: state.muted,
    subtitleLang: state.subtitleLang,
  } satisfies StoredPrefs);
}

export function loadVideoState(id: number): StoredVideo | null {
  const raw = read(VIDEO_KEY(id));
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    lastPosition: typeof o.lastPosition === "number" ? o.lastPosition : 0,
    loop: isRange(o.loop) ? o.loop : null,
  };
}

export function saveVideoState(
  id: number,
  lastPosition: number,
  loop: { start: number; end: number } | null,
): void {
  write(VIDEO_KEY(id), { lastPosition, loop } satisfies StoredVideo);
}

/** A stored position is only worth restoring away from both ends. */
export function resumePosition(
  stored: number,
  duration: number,
): number {
  if (!Number.isFinite(stored) || !Number.isFinite(duration)) return 0;
  if (stored < RESUME_MIN_START) return 0;
  if (stored > duration - RESUME_MIN_END) return 0;
  return stored;
}

/** Fires `run` at most once per `wait` ms, trailing edge. */
export function debounce<T extends unknown[]>(
  run: (...args: T) => void,
  wait: number,
): ((...args: T) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => run(...args), wait);
  };
  wrapped.cancel = () => clearTimeout(timer);
  return wrapped;
}
