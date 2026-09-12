import { useEffect, useRef, useState } from "react";
import "../styles/index.css";
import { createPlayerStore } from "../core/store";
import type { VideoPayload } from "../core/types";
import { VideoEngine } from "../engine/VideoEngine";
import { ControlBar } from "./ControlBar";
import {
  PlayerStoreProvider,
  ReloadProvider,
  usePlayerStoreInstance,
} from "./context/PlayerStoreContext";
import { toggleFullscreen } from "./hooks/usePlayerState";
import { useAnalytics } from "./hooks/useAnalytics";
import { usePersistence } from "./hooks/usePersistence";
import { useVideoPayload } from "./hooks/useVideoPayload";
import { LoopOfferBanner } from "./LoopOfferBanner";
import { PracticeBadge } from "./PracticeBadge";
import { VideoSurface } from "./VideoSurface";
import styles from "./Player.module.css";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return matches;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

/** Themes ship in src/styles/themes/. Adding one is a CSS file, not a code change. */
export type AivpTheme = "pluranza" | "aivp";

export interface PlayerProps {
  /** Ready payload, for the local test bench. */
  initialVideo?: VideoPayload;
  /** Fetch the payload from the REST endpoint instead. */
  videoId?: number;
  restUrl?: string;
  /** Which token set to paint with. */
  theme?: AivpTheme;
}

/**
 * One store instance per <Player>, created once and handed down through
 * context: two players on the same page never share state.
 */
export function Player({
  initialVideo,
  videoId,
  restUrl,
  theme = "pluranza",
}: PlayerProps = {}) {
  const instance = useRef(createPlayerStore());

  const source =
    videoId !== undefined && restUrl !== undefined
      ? { videoId, restUrl }
      : undefined;
  const reload = useVideoPayload(instance.current, source);
  useAnalytics(instance.current, __AIVP_VERSION__);

  useEffect(() => {
    if (initialVideo) instance.current.playerStore.actions.loadVideo(initialVideo);
    // ponytail: only meant to seed the very first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PlayerStoreProvider value={instance.current}>
      <ReloadProvider value={source ? reload : null}>
        <PlayerInner theme={theme} />
      </ReloadProvider>
    </PlayerStoreProvider>
  );
}

function PlayerInner({ theme }: { theme: AivpTheme }) {
  const { playerStore } = usePlayerStoreInstance();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // ponytail: UI-only state, it reaches the store as setLoop on confirm
  const [loopDraft, setLoopDraft] = useState<number | null>(null);
  const { offer, acceptOffer, dismissOffer } = usePersistence();

  // landscape on a phone: fill the viewport without the fullscreen API,
  // which would need a user gesture and throws when called on rotation
  const theater = useMediaQuery("(max-height: 480px) and (orientation: landscape)");

  // ponytail: pointer activity, not hover, so controls stay up in fullscreen
  const [active, setActive] = useState(true);
  const idleTimer = useRef<number | undefined>(undefined);

  const wake = () => {
    setActive(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setActive(false), 2600);
  };

  useEffect(() => () => window.clearTimeout(idleTimer.current), []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const engine = new VideoEngine(el, playerStore);
    engine.attach();
    return () => engine.detach();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // A shortcut is a bare keypress. With a modifier the key belongs to the
      // browser or the OS: Cmd/Ctrl+R reloads, Cmd+F finds, Ctrl+L focuses the
      // address bar. Without this guard those combos fired the player action
      // as well, so a reload also left a loop behind. Shift is allowed so an
      // uppercase letter still works.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const actions = playerStore.actions;
      const state = playerStore.getState();
      switch (e.key) {
        case " ":
          if (e.target instanceof HTMLButtonElement) return;
          e.preventDefault();
          actions.togglePlay();
          break;
        case "ArrowLeft":
          e.preventDefault();
          actions.seekBy(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          actions.seekBy(5);
          break;
        case "ArrowUp":
          e.preventDefault();
          actions.setVolume(state.volume + 0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.setVolume(state.volume - 0.1);
          break;
        case "m":
        case "M":
          actions.toggleMute();
          break;
        case "f":
        case "F":
          toggleFullscreen(rootRef.current);
          break;
        case "l":
        case "L": {
          e.preventDefault();
          if (state.loop) {
            actions.clearLoop();
            setLoopDraft(null);
            break;
          }
          setLoopDraft((from) => {
            if (from === null) return state.currentTime;
            const start = Math.min(from, state.currentTime);
            const end = Math.max(from, state.currentTime);
            if (end - start >= 0.2) actions.setLoop(start, end);
            return null;
          });
          break;
        }
        // B, not R: Cmd/Ctrl+R reloads the page in every browser, and the
        // handler used to fire on the bare key regardless. B is unclaimed
        // (S saves, P prints, D bookmarks, T/N/W are tabs) and reads as
        // "bucle". A second press clears the loop, so one key undoes itself.
        case "b":
        case "B":
          e.preventDefault();
          if (state.loop) {
            actions.clearLoop();
            setLoopDraft(null);
            break;
          }
          actions.repeatSection();
          break;
        case "Escape":
          setLoopDraft(null);
          break;
        case "e":
        case "E":
          actions.toggleMirror();
          break;
        case ".":
          e.preventDefault();
          actions.nextSection();
          break;
        case ",":
          e.preventDefault();
          actions.previousSection();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // data-aivp-scheme stays "dark" in every theme: a light ground around video
  // shifts the perceived contrast and colour of the frame itself.
  return (
    <div
      className={`${styles.root} ${active ? "" : styles.idle} ${
        theater ? styles.theater : ""
      }`}
      ref={rootRef}
      data-aivp-theme={theme}
      data-aivp-scheme="dark"
      onPointerMove={wake}
      onPointerDown={wake}
      onPointerLeave={() => {
        window.clearTimeout(idleTimer.current);
        setActive(false);
      }}
    >
      <VideoSurface ref={videoRef} />
      <PracticeBadge />
      {offer ? (
        <LoopOfferBanner
          loop={offer.loop}
          onAccept={acceptOffer}
          onDismiss={dismissOffer}
        />
      ) : null}
      <ControlBar
        rootRef={rootRef}
        videoRef={videoRef}
        hover={active}
        loopDraft={loopDraft}
      />
    </div>
  );
}
