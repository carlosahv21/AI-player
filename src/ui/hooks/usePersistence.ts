import { useEffect, useRef, useState } from "react";
import { usePlayerStoreInstance } from "../context/PlayerStoreContext";
import {
  debounce,
  loadPrefs,
  loadVideoState,
  resumePosition,
  savePrefs,
  saveVideoState,
} from "../../core/persistence";
import { fitRange } from "../../core/duration";

export interface LoopOffer {
  videoId: number;
  /** Saved loop, when there is one to resume. */
  loop: { start: number; end: number } | null;
  /** Saved position, when it is far enough from either end to matter. */
  resumeAt: number | null;
}

/**
 * Restores global prefs on mount and writes state back with a 1s debounce.
 *
 * Saved per-video state is *offered*, never applied on its own. The loop
 * always worked that way; the position did not, and a video that opened
 * halfway through with no explanation read as a bug rather than a feature —
 * there was no way back to the start short of dragging the bar.
 */
export function usePersistence(): {
  offer: LoopOffer | null;
  acceptOffer: () => void;
  dismissOffer: () => void;
} {
  const { useStore } = usePlayerStoreInstance();
  const [offer, setOffer] = useState<LoopOffer | null>(null);
  const lastVideoId = useRef<number | null>(null);

  // global prefs, once
  useEffect(() => {
    const prefs = loadPrefs();
    const s = useStore.getState();
    // ponytail: set directly, the actions guard on video being loaded
    useStore.setState({
      playbackRate: prefs.playbackRate ?? s.playbackRate,
      mirrored: prefs.mirrored ?? s.mirrored,
      volume: prefs.volume ?? s.volume,
      muted: prefs.muted ?? s.muted,
      subtitleLang: prefs.subtitleLang ?? s.subtitleLang,
    });
  }, [useStore]);

  // per-video state, on every video change
  useEffect(() => {
    const apply = (id: number, duration: number) => {
      if (lastVideoId.current === id) return;
      lastVideoId.current = id;
      setOffer(null);
      const stored = loadVideoState(id);
      if (!stored) return;

      // Near either end there is nothing worth resuming, and resumePosition
      // already returns 0 for those.
      const at = resumePosition(stored.lastPosition, duration);
      // A loop saved against a longer cut of this video points at time the
      // current one does not have, and setLoop rejects `end > duration`
      // outright — so the offer would appear and then quietly do nothing when
      // accepted. Trimmed to what exists, or not offered at all.
      const loop = fitRange(stored.loop, duration);

      if (at > 0 || loop) {
        setOffer({ videoId: id, loop, resumeAt: at > 0 ? at : null });
      }
    };

    const s = useStore.getState();
    if (s.video) apply(s.video.id, s.duration);

    return useStore.subscribe((state) => {
      if (state.video) apply(state.video.id, state.duration);
    });
  }, [useStore]);

  // debounced writes
  useEffect(() => {
    const writePrefs = debounce(savePrefs, 1000);
    const writeVideo = debounce(saveVideoState, 1000);

    const unsub = useStore.subscribe((state) => {
      writePrefs(state);
      if (state.video) {
        writeVideo(state.video.id, state.currentTime, state.loop);
      }
    });

    return () => {
      unsub();
      writePrefs.cancel();
      writeVideo.cancel();
    };
  }, [useStore]);

  return {
    offer,
    acceptOffer: () => {
      if (!offer) return;
      const state = useStore.getState();
      // trimmed again here: the offer may have been built while `duration` was
      // still the payload's estimate, before loadedmetadata corrected it
      const loop = fitRange(offer.loop, state.duration);
      if (loop) state.setLoop(loop.start, loop.end);
      // Seek after the loop: setLoop moves playback to the loop's start, so
      // seeking first would be undone by it.
      if (offer.resumeAt !== null && !loop) state.seek(offer.resumeAt);
      setOffer(null);
    },
    dismissOffer: () => setOffer(null),
  };
}
