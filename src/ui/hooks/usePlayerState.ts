import type { PlayerStore } from "../../core/store";
import type { RepeatMode } from "../../core/types";
import { useReload, usePlayerStoreInstance } from "../context/PlayerStoreContext";

/** Reads from the nearest <PlayerStoreProvider>'s store, not a module-level one. */
export function usePlayerState<T>(selector: (state: PlayerStore) => T): T {
  const { useStore } = usePlayerStoreInstance();
  return useStore(selector);
}

export function useToggleLoop(): () => void {
  const { useStore } = usePlayerStoreInstance();
  return () => {
    const state = useStore.getState();
    if (!state.video?.features.loop) return;
    if (state.loop) {
      state.clearLoop();
      return;
    }
    const section = state.video.sections.find(
      (item) => item.id === state.activeSectionId,
    );
    if (section) {
      state.setLoop(section.start, section.end);
    } else {
      const start = state.currentTime;
      const end = Math.min(state.duration, start + 8);
      if (end - start >= 0.5) {
        state.setLoop(start, end);
      } else if (state.duration > 0) {
        const from = Math.max(0, state.duration - 8);
        state.setLoop(from, state.duration);
      }
    }
    if (useStore.getState().loop && !state.repeatMode) {
      state.setRepeatMode("infinite");
    }
  };
}

/**
 * One control for one concept: loop and repeat count were always coupled
 * (each toggle switched the other on), so they cycle together.
 * OFF -> infinite -> x2 -> x3 -> OFF
 */
export function useCycleRepeat(): () => void {
  const { useStore } = usePlayerStoreInstance();
  const toggleLoop = useToggleLoop();
  return () => {
    const state = useStore.getState();
    if (!state.video?.features.loop) return;

    if (!state.loop) {
      toggleLoop(); // creates the range and defaults to infinite
      return;
    }

    const order: RepeatMode[] = ["infinite", 2, 3];
    const index = order.findIndex((item) => item === state.repeatMode);
    const next = order[index + 1];
    if (next === undefined) {
      state.clearLoop();
      return;
    }
    state.setRepeatMode(next);
  };
}

export function toggleFullscreen(root: HTMLElement | null): void {
  if (!root) return;
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const el = root as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const current = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  if (current) {
    if (doc.exitFullscreen) void doc.exitFullscreen();
    else doc.webkitExitFullscreen?.();
    return;
  }
  if (el.requestFullscreen) void el.requestFullscreen();
  else el.webkitRequestFullscreen?.();
}

export function useRetryLoad(): () => void {
  const { useStore } = usePlayerStoreInstance();
  const reload = useReload();
  return () => {
    // a remote player refetches; a locally-seeded one re-loads what it has
    if (reload) {
      reload();
      return;
    }
    const { video, loadVideo } = useStore.getState();
    if (video) loadVideo(video);
  };
}
