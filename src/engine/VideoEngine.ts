import Hls, { ErrorTypes } from "hls.js";
import type { ErrorData } from "hls.js";
import type { PlayerActions, PlayerState } from "../core/types";
import {
  createHlsInstance,
  detectLoadMode,
  resolveUrls,
} from "./hlsLoader";
import {
  mapHlsError,
  mapMediaError,
  unsupportedError,
} from "./errorMap";

export type PlayerStore = {
  getState: () => PlayerState;
  subscribe: (listener: (state: PlayerState) => void) => () => void;
  actions: PlayerActions;
};

const MAX_RETRIES = 3;
const TIME_EPS = 0.08;

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (
    callback: (now: number, metadata: { mediaTime: number }) => void,
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

export class VideoEngine {
  // store → elemento: suscripción a playbackRate/volume/muted/perspective;
  // play/pause/seek vía cambios de status y currentTime (no métodos públicos).
  private readonly element: HTMLVideoElement;
  private readonly store: PlayerStore;
  private attached = false;
  private unsub: (() => void) | null = null;
  private hls: Hls | null = null;
  private retries = 0;
  private warned = new Set<string>();
  private prev: PlayerState;
  private lastPushedTime = 0;
  private restoringTime: number | null = null;
  private handlingLoop = false;
  private rvfcId: number | null = null;
  private rafId: number | null = null;
  private applying = false;

  constructor(element: HTMLVideoElement, store: PlayerStore) {
    this.element = element;
    this.store = store;
    this.prev = store.getState();
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.setupElement();
    this.bindMediaEvents();
    this.prev = this.store.getState();
    this.unsub = this.store.subscribe((state) => {
      const prev = this.prev;
      this.prev = state;
      this.onStoreChange(prev, state);
    });
    this.loadCurrentSource();
    this.scheduleFrame();
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.unsub?.();
    this.unsub = null;
    this.cancelFrame();
    this.unbindMediaEvents();
    this.destroyHls();
    this.element.removeAttribute("src");
    this.element.load();
  }

  private setupElement(): void {
    const el = this.element;
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.preload = "metadata";
  }

  private bindMediaEvents(): void {
    const el = this.element;
    el.addEventListener("loadedmetadata", this.onLoadedMetadata);
    el.addEventListener("canplay", this.onCanPlay);
    el.addEventListener("play", this.onPlay);
    el.addEventListener("playing", this.onPlaying);
    el.addEventListener("pause", this.onPause);
    el.addEventListener("ended", this.onEnded);
    el.addEventListener("timeupdate", this.onTimeUpdate);
    el.addEventListener("progress", this.onProgress);
    el.addEventListener("waiting", this.onWaiting);
    el.addEventListener("error", this.onNativeError);
    el.addEventListener("ratechange", this.onRateChange);
    el.addEventListener("volumechange", this.onVolumeChange);
  }

  private unbindMediaEvents(): void {
    const el = this.element;
    el.removeEventListener("loadedmetadata", this.onLoadedMetadata);
    el.removeEventListener("canplay", this.onCanPlay);
    el.removeEventListener("play", this.onPlay);
    el.removeEventListener("playing", this.onPlaying);
    el.removeEventListener("pause", this.onPause);
    el.removeEventListener("ended", this.onEnded);
    el.removeEventListener("timeupdate", this.onTimeUpdate);
    el.removeEventListener("progress", this.onProgress);
    el.removeEventListener("waiting", this.onWaiting);
    el.removeEventListener("error", this.onNativeError);
    el.removeEventListener("ratechange", this.onRateChange);
    el.removeEventListener("volumechange", this.onVolumeChange);
  }

  private onStoreChange(prev: PlayerState, next: PlayerState): void {
    if (!this.attached) return;

    const videoChanged = prev.video?.id !== next.video?.id;
    const perspectiveChanged = prev.perspective !== next.perspective;

    if (videoChanged) {
      this.restoringTime = null;
      this.loadCurrentSource();
      this.syncTransport(next);
      return;
    }

    if (perspectiveChanged) {
      this.restoringTime = this.element.currentTime;
      this.loadCurrentSource();
      return;
    }

    this.syncMediaProps(next);
    this.syncTransport(next);
    if (prev.quality !== next.quality) {
      this.applyQuality(next.quality);
    }
  }

  private syncMediaProps(state: PlayerState): void {
    this.applying = true;
    if (this.element.playbackRate !== state.playbackRate) {
      this.element.playbackRate = state.playbackRate;
    }
    if (this.element.volume !== state.volume) {
      this.element.volume = state.volume;
    }
    if (this.element.muted !== state.muted) {
      this.element.muted = state.muted;
    }
    this.applying = false;
  }

  private syncTransport(state: PlayerState): void {
    if (
      Math.abs(state.currentTime - this.element.currentTime) > TIME_EPS &&
      Math.abs(state.currentTime - this.lastPushedTime) > TIME_EPS
    ) {
      this.element.currentTime = state.currentTime;
    }

    // The status is what decides, and only one branch may run per pass.
    //
    // Replaying a finished video used to hit both: store.play() sets
    // currentTime 0 AND status "playing" in one set(), so this pass seeked to
    // 0 and called play() — then the element fired its own `ended`, the store
    // went back to "ended", and the next pass called pause() while that play()
    // was still resolving. The play() rejected with AbortError, the catch
    // below forced "paused", and the video sat at 0 refusing to start: the
    // play/pause flicker at the end of every video.
    //
    // `element.ended` is the guard: once the element has ended, a seek to 0 is
    // a replay in progress, so pausing it is wrong even while the store still
    // says "ended" for one more tick.
    if (state.status === "playing") {
      if (this.element.paused) this.playElement();
      return;
    }

    if (
      (state.status === "paused" || state.status === "ended") &&
      !this.element.paused
    ) {
      this.element.pause();
    }
  }

  private playElement(): void {
    void this.element.play().catch((err: unknown) => {
      // AbortError is the browser resolving a race — a pause() or a load()
      // landed while this play() was still pending. It says nothing about
      // whether playback can happen, and treating it as a failure is what
      // stranded a replayed video paused at 0. A real refusal (autoplay
      // policy, decode error) still reports itself.
      if (err instanceof DOMException && err.name === "AbortError") return;
      this.store.actions._onStatusChange("paused");
    });
  }

  private loadCurrentSource(): void {
    const state = this.store.getState();
    const payload = state.video;
    this.retries = 0;
    this.warned.clear();
    this.destroyHls();

    if (!payload) {
      this.element.removeAttribute("src");
      this.element.load();
      return;
    }

    this.store.actions._onStatusChange("loading");
    const urls = resolveUrls(payload, state.perspective);
    const mode = detectLoadMode(this.element, urls.hls, urls.mp4);

    if (mode === "hls.js" && urls.hls) {
      this.hls = createHlsInstance();
      this.hls.on(Hls.Events.ERROR, this.onHlsError);
      this.hls.on(Hls.Events.MANIFEST_PARSED, this.onManifestParsed);
      this.hls.loadSource(urls.hls);
      this.hls.attachMedia(this.element);
      return;
    }

    if (mode === "native-hls" && urls.hls) {
      this.element.src = urls.hls;
      return;
    }

    if (mode === "mp4" && urls.mp4) {
      this.element.src = urls.mp4;
      return;
    }

    this.store.actions.setError(unsupportedError);
  }

  private destroyHls(): void {
    if (!this.hls) return;
    this.hls.off(Hls.Events.ERROR, this.onHlsError);
    this.hls.off(Hls.Events.MANIFEST_PARSED, this.onManifestParsed);
    this.hls.destroy();
    this.hls = null;
  }

  private applyQuality(quality: PlayerState["quality"]): void {
    if (!this.hls) return;
    this.hls.currentLevel = quality === "auto" ? -1 : quality;
  }

  private onManifestParsed = (): void => {
    if (!this.hls) return;
    const levels = this.hls.levels.map((level, index) => ({
      index,
      height: level.height,
      bitrate: level.bitrate,
    }));
    this.store.actions._onQualityLevels(levels);
    this.applyQuality(this.store.getState().quality);
  };

  private applyAfterLoad(): void {
    const state = this.store.getState();
    this.syncMediaProps(state);
    if (this.restoringTime !== null) {
      this.element.currentTime = this.restoringTime;
      this.restoringTime = null;
    }
  }

  private pushTime(t: number): void {
    this.lastPushedTime = t;
    this.store.actions._onTimeUpdate(t);
  }

  private bufferedEnd(): number {
    const ranges = this.element.buffered;
    const t = this.element.currentTime;
    for (let i = 0; i < ranges.length; i += 1) {
      if (t >= ranges.start(i) && t <= ranges.end(i)) {
        return ranges.end(i);
      }
    }
    if (ranges.length === 0) return 0;
    return ranges.end(ranges.length - 1);
  }

  private reportBuffered(): void {
    this.store.actions._onBufferedChange(this.bufferedEnd());
  }

  private onLoadedMetadata = (): void => {
    this.store.actions._onDurationChange(this.element.duration || 0);
    this.applyAfterLoad();
    this.reportBuffered();
  };

  private onCanPlay = (): void => {
    const status = this.store.getState().status;
    if (status === "loading" && this.element.paused) {
      this.store.actions._onStatusChange("ready");
    }
  };

  private onPlay = (): void => {};

  private onPlaying = (): void => {
    this.retries = 0;
    this.store.actions._onStatusChange("playing");
  };

  private onPause = (): void => {
    if (this.element.ended) return;
    if (this.store.getState().status === "playing") {
      this.store.actions._onStatusChange("paused");
    }
  };

  private onEnded = (): void => {
    this.store.actions._onStatusChange("ended");
  };

  private onTimeUpdate = (): void => {
    if (this.handlingLoop) return;
    // No loop guard here any more. This used to bail out on
    // `currentTime >= loop.end` — the one moment the loop needs handling —
    // which left rVFC as the only thing that could wrap. Browsers stop
    // firing rVFC in a background tab, so the video ran past the loop end
    // unbounded (measured: 4s over in 6s of playback) and the store froze at
    // the end of the range. timeupdate keeps firing in a hidden tab, so it
    // is the safety net; handleFrame is idempotent and both paths share it.
    this.handleFrame(this.element.currentTime);
    this.reportBuffered();
  };

  private onProgress = (): void => {
    this.reportBuffered();
  };

  private onWaiting = (): void => {
    // only a stall during playback is a buffering state; a `waiting` while
    // paused or seeking is not something to show a spinner for
    if (this.store.getState().status === "playing") {
      this.store.actions._onStatusChange("loading");
    }
  };

  private onNativeError = (): void => {
    this.store.actions.setError(mapMediaError(this.element.error));
  };

  private onRateChange = (): void => {
    if (this.applying) return;
    const rate = this.store.getState().playbackRate;
    if (this.element.playbackRate !== rate) {
      this.applying = true;
      this.element.playbackRate = rate;
      this.applying = false;
    }
  };

  private onVolumeChange = (): void => {
    if (this.applying) return;
    const { volume, muted } = this.store.getState();
    this.applying = true;
    if (this.element.volume !== volume) this.element.volume = volume;
    if (this.element.muted !== muted) this.element.muted = muted;
    this.applying = false;
  };

  private onHlsError = (_event: string, data: ErrorData): void => {
    if (!data.fatal) {
      // ponytail: one line per distinct details, non-fatal errors repeat per fragment
      if (!this.warned.has(data.details)) {
        this.warned.add(data.details);
        console.debug("[hls]", data.type, data.details);
      }
      return;
    }

    if (this.retries >= MAX_RETRIES || !this.hls) {
      this.destroyHls();
      this.store.actions.setError(mapHlsError(data));
      return;
    }

    this.retries += 1;
    if (data.type === ErrorTypes.NETWORK_ERROR) {
      this.hls.startLoad();
      return;
    }
    if (data.type === ErrorTypes.MEDIA_ERROR) {
      this.hls.recoverMediaError();
      return;
    }

    this.destroyHls();
    this.store.actions.setError(mapHlsError(data));
  };

  /**
   * One time sample, from either the frame callback or timeupdate.
   *
   * When the sample lands past the loop end, the store decides where to go
   * (wrap to start, count a repeat, or release a finished finite loop) and
   * the element is seeked to whatever it decided. Safe to call twice for the
   * same crossing: after the first call the store has already moved
   * currentTime back inside the range, so the second sees no crossing.
   */
  private handleFrame = (mediaTime: number): void => {
    if (!this.attached) return;
    const loop = this.store.getState().loop;
    if (loop && mediaTime >= loop.end) {
      this.handlingLoop = true;
      this.pushTime(mediaTime);
      const next = this.store.getState().currentTime;
      if (Math.abs(this.element.currentTime - next) > TIME_EPS) {
        this.element.currentTime = next;
      }
      this.handlingLoop = false;
      return;
    }
    this.pushTime(mediaTime);
  };

  private scheduleFrame = (): void => {
    if (!this.attached) return;
    const video = this.element as VideoWithFrameCallback;
    if (typeof video.requestVideoFrameCallback === "function") {
      this.rvfcId = video.requestVideoFrameCallback((_now, meta) => {
        this.handleFrame(meta.mediaTime);
        this.scheduleFrame();
      });
      return;
    }
    this.rafId = requestAnimationFrame(() => {
      this.handleFrame(this.element.currentTime);
      this.scheduleFrame();
    });
  };

  private cancelFrame(): void {
    const video = this.element as VideoWithFrameCallback;
    if (this.rvfcId !== null && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(this.rvfcId);
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.rvfcId = null;
    this.rafId = null;
  }
}
