export interface VideoPayload {
  id: number;
  title: string;
  instructor: string | null;
  duration: number;
  poster: string | null;
  sources: {
    hls: string | null;
    mp4: string | null;
    back: { hls: string | null; mp4: string | null } | null;
  };
  sections: Section[];
  features: PlayerFeatures;
  /**
   * Sprite sheet + WebVTT map for timeline thumbnails, as Bunny generates
   * them. Optional on purpose: when absent (or null) no preview is rendered
   * and everything else behaves identically. The player never depends on it.
   */
  preview?: PreviewSource | null;
  /**
   * Engagement samples in 0..1, spread evenly across the whole duration, for
   * the timeline heatmap. Optional like `preview`: absent means no curve is
   * drawn and the bar behaves identically. Two samples is the minimum.
   */
  heatmap?: number[] | null;
  tracks: {
    subtitles: SubtitleTrack[];
    audio: AudioTrack[];
  };
}

/** Where the thumbnail sprite and its cue map live. */
export interface PreviewSource {
  spriteUrl: string;
  vttUrl: string;
}

export interface Section {
  id: string;
  name: string;
  start: number;
  end: number;
  /** Optional finer steps inside a section; drives the landscape rail. */
  steps?: Step[];
}

export interface Step {
  id: string;
  name: string;
  start: number;
  end: number;
}

export interface PlayerFeatures {
  mirror: boolean;
  loop: boolean;
  speed: boolean;
  frontBack: boolean;
  quality: boolean;
  pip: boolean;
}

export interface SubtitleTrack {
  lang: string;
  label: string;
  url: string;
}

export interface AudioTrack {
  lang: string;
  label: string;
  url: string;
  isOriginal: boolean;
}

export type PlayerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error";

export type PlaybackRate =
  | 0.25
  | 0.5
  | 0.75
  | 1
  | 1.25
  | 1.5
  | 2
  /** Reachable only by the press-and-hold gesture, never from the menu. */
  | 2.5
  | 3
  | 3.5
  | 4;

export type Perspective = "front" | "back";

export type RepeatMode = 1 | 2 | 3 | "infinite" | null;

export interface PlayerError {
  code: string;
  message: string;
}

export interface QualityLevel {
  index: number;
  height: number;
  bitrate: number;
}

export type QualityChoice = number | "auto";

export interface PlayerState {
  video: VideoPayload | null;
  status: PlayerStatus;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  muted: boolean;
  playbackRate: PlaybackRate;
  error: PlayerError | null;
  mirrored: boolean;
  perspective: Perspective;
  activeSectionId: string | null;
  loop: { start: number; end: number } | null;
  repeatMode: RepeatMode;
  repeatsDone: number;
  subtitleLang: string | null;
  audioLang: string | null;
  qualityLevels: QualityLevel[];
  quality: QualityChoice;
}

export interface PlayerActions {
  loadVideo: (payload: VideoPayload) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (seconds: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  toggleMirror: () => void;
  setPerspective: (p: Perspective) => void;
  goToSection: (id: string) => void;
  nextSection: () => void;
  previousSection: () => void;
  setLoop: (start: number, end: number) => void;
  clearLoop: () => void;
  repeatSection: () => void;
  nudgeLoop: (edge: "start" | "end", delta: number) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setSubtitleLang: (lang: string | null) => void;
  setAudioLang: (lang: string | null) => void;
  setQuality: (q: QualityChoice) => void;
  setError: (err: PlayerError | null) => void;
  _onTimeUpdate: (t: number) => void;
  _onDurationChange: (d: number) => void;
  _onStatusChange: (s: PlayerStatus) => void;
  _onBufferedChange: (b: number) => void;
  _onQualityLevels: (levels: QualityLevel[]) => void;
}

/**
 * What the speed menu offers. Deliberately stops at 2x: the higher rates are
 * a transient gesture state, not something to park the player in.
 */
export const PLAYBACK_RATES: readonly PlaybackRate[] = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2,
];

/**
 * Every rate the store will accept. Wider than the menu so press-and-hold can
 * push past 2x, while `setPlaybackRate` still rejects arbitrary numbers.
 */
export const ALLOWED_RATES: readonly PlaybackRate[] = [
  ...PLAYBACK_RATES,
  2.5,
  3,
  3.5,
  4,
];

/** Ceiling for the press-and-hold gesture. */
export const MAX_HOLD_RATE = 4;
