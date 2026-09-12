import { autoMount, mount, unmount } from "./mount";
import type { AivpGlobal } from "./mount";

/** Bumped by the build from package.json. */
export const version = __AIVP_VERSION__;

const AIVP: AivpGlobal = { mount, unmount, version };

// The IIFE build assigns window.AIVP itself rather than relying on the
// bundle's global name, so the surface is exactly mount/unmount/version.
if (typeof window !== "undefined") {
  window.AIVP = AIVP;
  autoMount();
}

export { mount, unmount, mountAll } from "./mount";
export type { AivpGlobal, Instance, MountOptions } from "./mount";
export { createPlayerStore, initialState } from "./core/store";
export type { PlayerStoreInstance } from "./core/store";
export {
  PlayerStoreProvider,
  usePlayerStoreInstance,
} from "./ui/context/PlayerStoreContext";
export { VideoEngine } from "./engine/VideoEngine";
export type { PlayerStore as EngineStore } from "./engine/VideoEngine";
export {
  selectActiveSection,
  selectActiveSectionIndex,
  selectCanGoNext,
  selectCanGoPrevious,
  selectHasLoop,
} from "./core/selectors";
export { PLAYBACK_RATES } from "./core/types";
export type {
  VideoPayload,
  Section,
  PlayerFeatures,
  SubtitleTrack,
  AudioTrack,
  PlayerState,
  PlayerActions,
  PlayerStatus,
  PlaybackRate,
  Perspective,
  RepeatMode,
  PlayerError,
  QualityLevel,
  QualityChoice,
} from "./core/types";
export { Player } from "./ui/Player";
export type { AivpTheme, PlayerProps } from "./ui/Player";
