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
  loop: { start: number; end: number };
}

/**
 * Restores global prefs on mount, per-video position on load, and writes
 * both back with a 1s debounce. Returns a stored loop to *offer*, never
 * applied on its own: restoring it silently would surprise the user.
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
      const at = resumePosition(stored.lastPosition, duration);
      if (at > 0) useStore.getState().seek(at);
      // A loop saved against a longer cut of this video points at time the
      // current one does not have, and setLoop rejects `end > duration`
      // outright — so the offer would appear and then quietly do nothing when
      // accepted. Trimmed to what exists, or not offered at all.
      const loop = fitRange(stored.loop, duration);
      if (loop) setOffer({ videoId: id, loop });
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
      // trimmed again here: the offer may have been built while `duration` was
      // still the payload's estimate, before loadedmetadata corrected it
      const loop = fitRange(offer.loop, useStore.getState().duration);
      if (loop) useStore.getState().setLoop(loop.start, loop.end);
      setOffer(null);
    },
    dismissOffer: () => setOffer(null),
  };
}
