import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import type {
  PlayerActions,
  PlayerError,
  PlayerFeatures,
  PlayerState,
  PlayerStatus,
  PlaybackRate,
  Perspective,
  QualityChoice,
  QualityLevel,
  RepeatMode,
  VideoPayload,
} from "./types";
import { ALLOWED_RATES } from "./types";

export type PlayerStore = PlayerState & PlayerActions;

const PLAYING_STATUSES: PlayerStatus[] = [
  "idle",
  "ready",
  "paused",
  "ended",
];

export const initialState: PlayerState = {
  video: null,
  status: "idle",
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  playbackRate: 1,
  error: null,
  mirrored: false,
  perspective: "front",
  activeSectionId: null,
  loop: null,
  repeatMode: null,
  repeatsDone: 0,
  subtitleLang: null,
  audioLang: null,
  qualityLevels: [],
  quality: "auto",
};

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

export function sectionIdAt(
  video: VideoPayload | null,
  time: number,
): string | null {
  if (!video) return null;
  const section = video.sections.find(
    (s) => s.start <= time && time < s.end,
  );
  return section?.id ?? null;
}

function isPlaybackRate(rate: number): rate is PlaybackRate {
  return (ALLOWED_RATES as readonly number[]).includes(rate);
}

function featureOn(
  video: VideoPayload | null,
  key: keyof PlayerFeatures,
): boolean {
  return Boolean(video?.features[key]);
}

function pickState(store: PlayerStore): PlayerState {
  return {
    video: store.video,
    status: store.status,
    currentTime: store.currentTime,
    duration: store.duration,
    buffered: store.buffered,
    volume: store.volume,
    muted: store.muted,
    playbackRate: store.playbackRate,
    error: store.error,
    mirrored: store.mirrored,
    perspective: store.perspective,
    activeSectionId: store.activeSectionId,
    loop: store.loop,
    repeatMode: store.repeatMode,
    repeatsDone: store.repeatsDone,
    subtitleLang: store.subtitleLang,
    audioLang: store.audioLang,
    qualityLevels: store.qualityLevels,
    quality: store.quality,
  };
}

export interface PlayerStoreInstance {
  useStore: UseBoundStore<StoreApi<PlayerStore>>;
  playerStore: {
    getState: () => PlayerState;
    subscribe: (listener: (state: PlayerState) => void) => () => void;
    actions: PlayerActions;
  };
}

/**
 * One store per player. Each call returns an independent Zustand instance
 * (state + actions) so two <Player /> on the same page never share state.
 */
export function createPlayerStore(): PlayerStoreInstance {
  const useStore = create<PlayerStore>((set, get) => ({
  ...initialState,

  loadVideo: (payload) => {
    set({
      ...initialState,
      video: payload,
      duration: payload.duration,
      activeSectionId: sectionIdAt(payload, 0),
    });
  },

  play: () => {
    const { video, status } = get();
    if (!video) return;
    if (status === "ended") {
      set({
        status: "playing",
        currentTime: 0,
        activeSectionId: sectionIdAt(video, 0),
      });
      return;
    }
    set({ status: "playing" });
  },

  pause: () => {
    if (!get().video) return;
    set({ status: "paused" });
  },

  togglePlay: () => {
    const { video, status, play, pause } = get();
    if (!video) return;
    if (status === "playing") {
      pause();
      return;
    }
    if (PLAYING_STATUSES.includes(status)) {
      play();
    }
  },

  seek: (seconds) => {
    const { video, duration } = get();
    if (!video) return;
    const currentTime = clamp(seconds, 0, duration);
    set({
      currentTime,
      activeSectionId: sectionIdAt(video, currentTime),
    });
  },

  seekBy: (delta) => {
    const { currentTime, seek } = get();
    seek(currentTime + delta);
  },

  setVolume: (v) => {
    if (!get().video) return;
    set({ volume: clamp(v, 0, 1) });
  },

  toggleMute: () => {
    if (!get().video) return;
    set({ muted: !get().muted });
  },

  setPlaybackRate: (rate) => {
    const { video } = get();
    if (!video || !featureOn(video, "speed")) return;
    if (!isPlaybackRate(rate)) return;
    set({ playbackRate: rate });
  },

  toggleMirror: () => {
    const { video } = get();
    if (!video || !featureOn(video, "mirror")) return;
    set({ mirrored: !get().mirrored });
  },

  setPerspective: (p) => {
    const { video } = get();
    if (!video || !featureOn(video, "frontBack")) return;
    // ponytail: only the source swaps, currentTime/rate/loop carry over
    set({ perspective: p });
  },

  goToSection: (id) => {
    const { video, seek } = get();
    if (!video) return;
    const section = video.sections.find((s) => s.id === id);
    if (!section) return;
    seek(section.start);
  },

  nextSection: () => {
    const { video, activeSectionId, goToSection } = get();
    if (!video || !activeSectionId) return;
    const index = video.sections.findIndex((s) => s.id === activeSectionId);
    const next = video.sections[index + 1];
    if (!next) return;
    goToSection(next.id);
  },

  previousSection: () => {
    const { video, activeSectionId, goToSection } = get();
    if (!video || !activeSectionId) return;
    const index = video.sections.findIndex((s) => s.id === activeSectionId);
    const prev = video.sections[index - 1];
    if (!prev) return;
    goToSection(prev.id);
  },

  setLoop: (start, end) => {
    const { video, duration, repeatMode } = get();
    if (!video || !featureOn(video, "loop")) return;
    if (start >= end) return;
    if (start < 0 || end > duration) return;
    // practice default: repeat until told otherwise
    set({
      loop: { start, end },
      repeatsDone: 0,
      repeatMode: repeatMode ?? "infinite",
    });
  },

  repeatSection: () => {
    const { video, activeSectionId, setLoop, seek } = get();
    if (!video || !featureOn(video, "loop") || !activeSectionId) return;
    const section = video.sections.find((s) => s.id === activeSectionId);
    if (!section) return;
    setLoop(section.start, section.end);
    seek(section.start);
  },

  nudgeLoop: (edge, delta) => {
    const { video, loop, duration, seek } = get();
    if (!video || !featureOn(video, "loop") || !loop) return;
    const MIN = 0.5;
    if (edge === "start") {
      const start = clamp(loop.start + delta, 0, loop.end - MIN);
      set({ loop: { start, end: loop.end }, repeatsDone: 0 });
      seek(start);
      return;
    }
    const end = clamp(loop.end + delta, loop.start + MIN, duration);
    set({ loop: { start: loop.start, end }, repeatsDone: 0 });
    seek(end);
  },

  clearLoop: () => {
    const { video } = get();
    if (!video || !featureOn(video, "loop")) return;
    set({ loop: null, repeatMode: null, repeatsDone: 0 });
  },

  setRepeatMode: (mode) => {
    const { video } = get();
    if (!video || !featureOn(video, "loop")) return;
    set({ repeatMode: mode, repeatsDone: 0 });
  },

  setSubtitleLang: (lang) => {
    if (!get().video) return;
    set({ subtitleLang: lang });
  },

  setAudioLang: (lang) => {
    if (!get().video) return;
    set({ audioLang: lang });
  },

  setQuality: (q) => {
    const { video, qualityLevels } = get();
    if (!video || !featureOn(video, "quality")) return;
    if (q !== "auto" && !qualityLevels.some((level) => level.index === q)) {
      return;
    }
    set({ quality: q });
  },

  setError: (err: PlayerError | null) => {
    set({
      error: err,
      status: err ? "error" : get().status === "error" ? "idle" : get().status,
    });
  },

  _onTimeUpdate: (t) => {
    const state = get();
    const { video, duration, loop, repeatMode } = state;
    if (!video) return;

    let time = clamp(t, 0, duration);

    if (loop && time >= loop.end) {
      if (repeatMode === "infinite") {
        time = loop.start;
        set({
          currentTime: time,
          activeSectionId: sectionIdAt(video, time),
          // counted here too, even though an infinite loop has no target to
          // count towards: the badge shows "∞" and ignores it, but it is the
          // only record of how many times a passage was actually drilled
          repeatsDone: state.repeatsDone + 1,
        });
        return;
      }
      if (typeof repeatMode === "number") {
        const done = state.repeatsDone + 1;
        if (done < repeatMode) {
          time = loop.start;
          set({
            currentTime: time,
            activeSectionId: sectionIdAt(video, time),
            repeatsDone: done,
          });
          return;
        }
        // ponytail: same release as clearLoop, repeatMode must go too
        set({
          currentTime: time,
          activeSectionId: sectionIdAt(video, time),
          loop: null,
          repeatMode: null,
          repeatsDone: 0,
        });
        return;
      }
    }

    set({
      currentTime: time,
      activeSectionId: sectionIdAt(video, time),
    });
  },

  _onDurationChange: (d) => {
    if (!get().video) return;
    set({ duration: Math.max(0, d) });
  },

  _onStatusChange: (s) => {
    if (!get().video) return;
    set({ status: s });
  },

  _onBufferedChange: (b) => {
    if (!get().video) return;
    set({ buffered: clamp(b, 0, get().duration) });
  },

  _onQualityLevels: (levels) => {
    if (!get().video) return;
    set({ qualityLevels: levels });
  },
  }));

  const playerStore = {
    getState: (): PlayerState => pickState(useStore.getState()),
    subscribe: (listener: (state: PlayerState) => void) =>
      useStore.subscribe((store) => listener(pickState(store))),
    actions: {
      loadVideo: (payload: VideoPayload) =>
        useStore.getState().loadVideo(payload),
      play: () => useStore.getState().play(),
      pause: () => useStore.getState().pause(),
      togglePlay: () => useStore.getState().togglePlay(),
      seek: (seconds: number) => useStore.getState().seek(seconds),
      seekBy: (delta: number) => useStore.getState().seekBy(delta),
      setVolume: (v: number) => useStore.getState().setVolume(v),
      toggleMute: () => useStore.getState().toggleMute(),
      setPlaybackRate: (rate: number) =>
        useStore.getState().setPlaybackRate(rate),
      toggleMirror: () => useStore.getState().toggleMirror(),
      setPerspective: (p: Perspective) =>
        useStore.getState().setPerspective(p),
      goToSection: (id: string) => useStore.getState().goToSection(id),
      nextSection: () => useStore.getState().nextSection(),
      previousSection: () => useStore.getState().previousSection(),
      setLoop: (start: number, end: number) =>
        useStore.getState().setLoop(start, end),
      clearLoop: () => useStore.getState().clearLoop(),
      repeatSection: () => useStore.getState().repeatSection(),
      nudgeLoop: (edge: "start" | "end", delta: number) =>
        useStore.getState().nudgeLoop(edge, delta),
      setRepeatMode: (mode: RepeatMode) =>
        useStore.getState().setRepeatMode(mode),
      setSubtitleLang: (lang: string | null) =>
        useStore.getState().setSubtitleLang(lang),
      setAudioLang: (lang: string | null) =>
        useStore.getState().setAudioLang(lang),
      setQuality: (q: QualityChoice) => useStore.getState().setQuality(q),
      setError: (err: PlayerError | null) => useStore.getState().setError(err),
      _onTimeUpdate: (t: number) => useStore.getState()._onTimeUpdate(t),
      _onDurationChange: (d: number) =>
        useStore.getState()._onDurationChange(d),
      _onStatusChange: (s: PlayerStatus) =>
        useStore.getState()._onStatusChange(s),
      _onBufferedChange: (b: number) =>
        useStore.getState()._onBufferedChange(b),
      _onQualityLevels: (levels: QualityLevel[]) =>
        useStore.getState()._onQualityLevels(levels),
    },
  };

  return { useStore, playerStore };
}
