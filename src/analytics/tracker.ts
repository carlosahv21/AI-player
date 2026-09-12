import { EventQueue } from "./EventQueue";
import { getSessionId, doNotTrackEnabled } from "./session";
import type { AnalyticsEvent } from "./types";
import type { PlayerState } from "../core/types";

export const MILESTONES = [25, 50, 75, 90] as const;
/** A jump larger than this is a seek, not ordinary playback drift. */
const SEEK_THRESHOLD = 1.5;

/** How often a playing video reports where it is. */
export const HEARTBEAT_MS = 15_000;

/**
 * Laps reported one by one before going quiet.
 *
 * An infinite loop would otherwise emit a row every few seconds for as long
 * as someone drills a passage. The total still reaches the server, once, in
 * loop_ended.
 */
export const MAX_REPORTED_LAPS = 5;

export interface TrackerConfig {
  eventsUrl: string;
  userId: number | null;
  playerVersion: string;
  enabled: boolean;
}

export interface PlayerStoreLike {
  getState: () => PlayerState;
  subscribe: (listener: (state: PlayerState) => void) => () => void;
}

/**
 * Turns store transitions into analytics events.
 *
 * It listens to the store rather than to the <video> element on purpose: the
 * spec forbids emitting synchronously inside media handlers, and every fact
 * worth reporting is already reflected in player state.
 */
export class Tracker {
  private readonly queue: EventQueue;
  private readonly config: TrackerConfig;
  private readonly sessionId: string;

  private prev: PlayerState | null = null;
  private unsubscribe: (() => void) | null = null;
  private teardown: Array<() => void> = [];

  /** Milestones already reported, per video: a rewind must not re-fire them. */
  private milestonesSeen = new Map<number, Set<number>>();
  private startedVideos = new Set<number>();
  private completedVideos = new Set<number>();
  private bufferingSince: number | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  /** Session totals, for the one summary row sent at teardown. */
  private sessionStartedAt = Date.now();
  private loopsCreated = 0;
  private sectionsVisited = new Set<string>();
  private maxPosition = 0;
  private summarySent = false;

  constructor(config: TrackerConfig, queue?: EventQueue) {
    this.config = config;
    this.sessionId = getSessionId();
    this.queue = queue ?? new EventQueue({ url: config.eventsUrl });
  }

  /** Starts observing. Returns a stop function. */
  attach(store: PlayerStoreLike): () => void {
    this.prev = store.getState();
    this.unsubscribe = store.subscribe((state) => {
      try {
        this.onStateChange(this.prev, state);
      } catch {
        // analytics must never break playback
      }
      this.prev = state;
    });

    this.bindLifecycle();
    return () => this.detach();
  }

  detach(): void {
    try {
      this.stopHeartbeat();
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.teardown.forEach((fn) => fn());
      this.teardown = [];
      this.sendSummary();
      this.queue.flushSync();
      this.queue.stop();
    } catch {
      // nothing useful to do while tearing down
    }
  }

  /** Queues one event; public so the mount layer can report load failures. */
  emit(event: string, state: PlayerState, payload: Record<string, unknown> = {}): void {
    const entry: AnalyticsEvent = {
      event,
      ts: Date.now(),
      sessionId: this.sessionId,
      userId: this.config.userId,
      videoId: state.video?.id ?? 0,
      playerVersion: this.config.playerVersion,
      position: Number(state.currentTime.toFixed(3)),
      payload,
    };
    this.queue.push(entry);
  }

  private bindLifecycle(): void {
    if (typeof document === "undefined") return;

    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      // A hidden tab is not watching: stop the beat before flushing, or the
      // next beat would claim fifteen seconds nobody saw.
      this.stopHeartbeat();
      this.queue.flushSync();
    };
    const onPageHide = () => {
      this.stopHeartbeat();
      // Queued before the flush so it rides the same sendBeacon.
      this.sendSummary();
      this.queue.flushSync();
    };

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    this.teardown.push(() => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
    });
  }

  private onStateChange(prev: PlayerState | null, next: PlayerState): void {
    if (!prev || !next.video) return;

    // a new video resets everything that is scoped to one
    if (prev.video?.id !== next.video.id) {
      this.bufferingSince = null;
      return;
    }

    this.trackPlayback(prev, next);
    this.trackProgress(next);
    this.trackLearning(prev, next);
    this.trackTechnical(prev, next);
    this.syncHeartbeat(next);
  }

  /**
   * Runs the heartbeat only while the video is actually playing.
   *
   * Paused, buffering ("loading") and a hidden tab all stop it: a beat is a
   * claim that someone watched fifteen seconds, and none of those three are
   * watching. That is what lets practice time be counted instead of guessed.
   */
  private syncHeartbeat(state: PlayerState): void {
    const shouldRun =
      state.status === "playing" &&
      (typeof document === "undefined" || document.visibilityState !== "hidden");

    if (shouldRun) {
      this.startHeartbeat();
      return;
    }
    this.stopHeartbeat();
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer !== null) return;
    this.heartbeatTimer = setInterval(() => {
      try {
        this.beat();
      } catch {
        // analytics must never break playback
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer === null) return;
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /** Emits one heartbeat for the current state. */
  private beat(): void {
    const state = this.prev;
    if (!state || !state.video) return;
    if (state.status !== "playing") {
      this.stopHeartbeat();
      return;
    }
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      this.stopHeartbeat();
      return;
    }

    this.emit("heartbeat", state, {
      // Everything a time metric needs, so none of them require extra events.
      speed: state.playbackRate,
      mirrored: state.mirrored,
      inLoop: state.loop !== null,
      sectionId: state.activeSectionId,
      seconds: HEARTBEAT_MS / 1000,
    });
  }

  /**
   * One row per session, sent with the final beacon.
   *
   * Deliberately redundant with the individual events: it turns "group a few
   * hundred thousand rows" into "read one row per session" for the questions
   * that only need session-level totals.
   */
  private sendSummary(): void {
    const state = this.prev;
    if (this.summarySent || !state || !state.video) return;
    this.summarySent = true;

    this.emit("session_summary", state, {
      durationMs: Date.now() - this.sessionStartedAt,
      loopsCreated: this.loopsCreated,
      sectionsVisited: this.sectionsVisited.size,
      maxPosition: Number(this.maxPosition.toFixed(3)),
    });
  }

  private trackPlayback(prev: PlayerState, next: PlayerState): void {
    const videoId = next.video!.id;

    // "resumed from a stop", not "finished buffering": rebuffering bounces
    // through loading and would otherwise emit a play on every stall
    const resumed =
      next.status === "playing" &&
      (prev.status === "paused" || prev.status === "ready" ||
        prev.status === "idle" || prev.status === "ended");

    if (resumed) {
      if (!this.startedVideos.has(videoId)) {
        this.startedVideos.add(videoId);
        this.emit("video_started", next);
      }
      this.emit("video_played", next);
    }

    if (prev.status === "playing" && next.status === "paused") {
      this.emit("video_paused", next);
    }

    if (prev.status !== "ended" && next.status === "ended") {
      this.emit("video_ended", next);
    }

    // a seek shows up as a jump the clock could not have produced
    const delta = next.currentTime - prev.currentTime;
    const looped =
      next.loop !== null && prev.currentTime >= next.loop.end - SEEK_THRESHOLD;
    if (Math.abs(delta) > SEEK_THRESHOLD && !looped) {
      this.emit("video_seeked", next, {
        from: Number(prev.currentTime.toFixed(3)),
        to: Number(next.currentTime.toFixed(3)),
      });
    }
  }

  private trackProgress(next: PlayerState): void {
    const videoId = next.video!.id;
    const duration = next.duration;
    this.maxPosition = Math.max(this.maxPosition, next.currentTime);
    if (duration <= 0) return;

    const percent = (next.currentTime / duration) * 100;
    let seen = this.milestonesSeen.get(videoId);
    if (!seen) {
      seen = new Set();
      this.milestonesSeen.set(videoId, seen);
    }

    for (const milestone of MILESTONES) {
      if (percent >= milestone && !seen.has(milestone)) {
        seen.add(milestone);
        this.emit("milestone", next, { percent: milestone });
      }
    }

    // "completed" is watching essentially all of it, once per video; the 90%
    // milestone measures reach, this measures finishing
    if (percent >= 98 && !this.completedVideos.has(videoId)) {
      this.completedVideos.add(videoId);
      this.emit("video_completed", next);
    }
  }

  private trackLearning(prev: PlayerState, next: PlayerState): void {
    if (prev.activeSectionId !== next.activeSectionId && next.activeSectionId) {
      const section = next.video!.sections.find(
        (s) => s.id === next.activeSectionId,
      );
      this.sectionsVisited.add(next.activeSectionId);
      this.emit("section_started", next, {
        sectionId: next.activeSectionId,
        name: section?.name ?? null,
      });
    }

    const prevLoop = prev.loop;
    const nextLoop = next.loop;

    if (nextLoop && (!prevLoop || prevLoop.start !== nextLoop.start || prevLoop.end !== nextLoop.end)) {
      this.loopsCreated += 1;
      this.emit("loop_created", next, {
        start: nextLoop.start,
        end: nextLoop.end,
        duration: Number((nextLoop.end - nextLoop.start).toFixed(3)),
        repeatMode: next.repeatMode,
      });
    }

    if (prevLoop && !nextLoop) {
      // The lap total lands here, once, so an infinite loop never needs to
      // report every single lap.
      this.emit("loop_ended", next, {
        total: prev.repeatsDone,
        start: prevLoop.start,
        end: prevLoop.end,
        duration: Number((prevLoop.end - prevLoop.start).toFixed(3)),
      });
      this.emit("loop_cleared", next);
    }

    // The store counts laps for both finite and infinite loops, so a lap is
    // simply repeatsDone moving. This is what shows how many times a passage
    // was actually drilled, which is the point of the whole module.
    if (next.repeatsDone > prev.repeatsDone) {
      // Only the first few laps get a row each; past that the count still
      // reaches the server in loop_ended, without a row every few seconds.
      if (next.repeatsDone <= MAX_REPORTED_LAPS) {
        this.emit("loop_repeated", next, { repetition: next.repeatsDone });
      }
    }

    if (prev.playbackRate !== next.playbackRate) {
      this.emit("speed_changed", next, {
        from: prev.playbackRate,
        to: next.playbackRate,
      });
    }

    if (prev.mirrored !== next.mirrored) {
      this.emit("mirror_toggled", next, { mirrored: next.mirrored });
    }

    if (prev.perspective !== next.perspective) {
      this.emit("perspective_changed", next, {
        from: prev.perspective,
        to: next.perspective,
      });
    }

    if (prev.subtitleLang !== next.subtitleLang) {
      this.emit("language_changed", next, {
        kind: "subtitles",
        from: prev.subtitleLang,
        to: next.subtitleLang,
      });
    }

    if (prev.audioLang !== next.audioLang) {
      this.emit("language_changed", next, {
        kind: "audio",
        from: prev.audioLang,
        to: next.audioLang,
      });
    }
  }

  private trackTechnical(prev: PlayerState, next: PlayerState): void {
    if (prev.status !== "loading" && next.status === "loading") {
      this.bufferingSince = Date.now();
      this.emit("buffer_started", next);
    }

    if (prev.status === "loading" && next.status !== "loading") {
      const startedAt = this.bufferingSince;
      this.bufferingSince = null;
      this.emit("buffer_ended", next, {
        durationMs: startedAt === null ? null : Date.now() - startedAt,
      });
    }

    if (prev.error?.code !== next.error?.code && next.error) {
      this.emit("video_error", next, {
        code: next.error.code,
        message: next.error.message,
      });
    }

    if (prev.quality !== next.quality) {
      const level =
        next.quality === "auto"
          ? null
          : next.qualityLevels.find((l) => l.index === next.quality) ?? null;
      this.emit("quality_changed", next, {
        level: next.quality,
        height: level?.height ?? null,
      });
    }
  }
}

/**
 * Builds a tracker, or nothing at all.
 *
 * Returns null when analytics are switched off in the plugin settings or the
 * visitor signalled Do Not Track: in that case no queue is ever instantiated,
 * so there is nothing to accidentally send.
 */
export function createTracker(config: TrackerConfig): Tracker | null {
  if (!config.enabled) return null;
  if (!config.eventsUrl) return null;
  if (doNotTrackEnabled()) return null;
  return new Tracker(config);
}
