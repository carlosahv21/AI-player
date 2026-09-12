import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { MAX_HOLD_RATE } from "../../core/types";
import type { PlaybackRate } from "../../core/types";

/**
 * Wait for a possible second tap, in the side zones only.
 *
 * 250ms was too tight for a real finger: two taps measured 251ms apart on a
 * phone, so the first tap's timer had already fired play/pause and the second
 * one toggled it straight back — a double tap that paused instead of seeking.
 * Browsers themselves allow ~500ms for a double click; 400 keeps the side-zone
 * play/pause responsive while covering an unhurried tap.
 */
const DOUBLE_TAP_MS = 400;
/** How long a press must be held before it becomes a speed gesture. */
const HOLD_MS = 400;
/** Rate the hold starts at, before any drag. */
const HOLD_BASE_RATE = 2;
/** Pixels of horizontal drag that add one step of rate. */
const DRAG_PX_PER_STEP = 60;
/** Rate change per step of drag. */
const DRAG_STEP = 0.5;
const SEEK_SECONDS = 10;

export interface SeekFlash {
  key: number;
  dir: "back" | "forward";
  seconds: number;
}

interface Options {
  /** Coarse pointer (phone, tablet): enables the double-tap zones. */
  touch: boolean;
  enabled: boolean;
  status: string;
  playbackRate: PlaybackRate;
  togglePlay: () => void;
  /**
   * Explicit play/pause, used ONLY to undo a toggle the double-tap timer
   * already fired. togglePlay() cannot undo itself: it no-ops unless the
   * status is in PLAYING_STATUSES, and a seek can put the player in "loading"
   * in between — which left the video paused and the gesture out of sync.
   */
  play: () => void;
  pause: () => void;
  seekBy: (delta: number) => void;
  setPlaybackRate: (rate: number) => void;
}

/**
 * The three gestures that share the video surface: tap, double tap and
 * press-and-hold.
 *
 * The conflict is that a tap cannot be dispatched until we know a second tap
 * is not coming — which would delay pausing, the most frequent action of all.
 * Zones resolve it: on touch, only the outer thirds wait for a double tap,
 * and the centre third (where the play/pause tap naturally lands) fires at
 * once. On a mouse there is no double-tap-to-seek at all, so a click is
 * always instant.
 */
export function useVideoGestures({
  touch,
  enabled,
  status,
  playbackRate,
  togglePlay,
  play,
  pause,
  seekBy,
  setPlaybackRate,
}: Options) {
  const [holdRate, setHoldRate] = useState<number | null>(null);
  const [flash, setFlash] = useState<SeekFlash | null>(null);

  const holdTimer = useRef<number | undefined>(undefined);
  const tapTimer = useRef<number | undefined>(undefined);
  const startX = useRef(0);
  const startY = useRef(0);
  /** Rate to restore on release; never written to the store's preference. */
  const rateBeforeHold = useRef<PlaybackRate | null>(null);
  const holding = useRef(false);
  const moved = useRef(false);
  const flashKey = useRef(0);
  /** Zone of the first tap, while waiting to see if a second one lands. */
  const pendingZone = useRef<"left" | "right" | null>(null);
  /**
   * When the pending tap's play/pause actually ran, so a second tap arriving
   * just after can undo it.
   *
   * The window alone cannot close the race: the timer fires on a background
   * task, so a tap can always land a millisecond after it. Without this the
   * late second tap toggled a SECOND time — the double tap read as a pause.
   */
  const toggledAt = useRef(0);
  /** Whether that toggle had been playing, so the undo restores it exactly. */
  const wasPlaying = useRef(false);
  // the timer fires long after the render that armed it, so the closure's
  // `status` would be stale by then
  const statusRef = useRef(status);
  statusRef.current = status;

  const clearTimers = () => {
    window.clearTimeout(holdTimer.current);
    window.clearTimeout(tapTimer.current);
  };

  useEffect(() => () => clearTimers(), []);

  const endHold = useCallback(() => {
    if (!holding.current) return;
    holding.current = false;
    const restore = rateBeforeHold.current;
    rateBeforeHold.current = null;
    setHoldRate(null);
    // back to whatever the user had chosen before the gesture
    if (restore !== null) setPlaybackRate(restore);
  }, [setPlaybackRate]);

  /**
   * Every way a hold can end without a `pointerup` on the surface.
   *
   * The gesture rates go to 4x and the menu only reaches 2x, so a hold left
   * running is a speed the user cannot see in the UI and cannot undo from it
   * either — the video just plays at 4x forever. `pointercancel` covers the
   * browser taking the pointer (a scroll or system gesture claiming it), and
   * `blur`/`visibilitychange` cover the pointer leaving with the page: an
   * alt-tab, a phone call, a tab switch. None of them fire `pointerup`.
   *
   * On window, not the element: once the pointer or the page is gone, the
   * surface is exactly what stops receiving events.
   */
  useEffect(() => {
    const recover = () => {
      clearTimers();
      endHold();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") recover();
    };
    window.addEventListener("pointercancel", recover);
    window.addEventListener("blur", recover);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointercancel", recover);
      window.removeEventListener("blur", recover);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [endHold]);

  const showFlash = (dir: "back" | "forward") => {
    flashKey.current += 1;
    setFlash({ key: flashKey.current, dir, seconds: SEEK_SECONDS });
  };

  /** Which third of the surface the pointer is in. */
  const zoneOf = (clientX: number, rect: DOMRect): "left" | "centre" | "right" => {
    const r = (clientX - rect.left) / rect.width;
    if (r < 1 / 3) return "left";
    if (r > 2 / 3) return "right";
    return "centre";
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    // Only the surface itself. Controls and loop handles sit above it and
    // stop propagation of their own; this guards the rest.
    if (e.button !== undefined && e.button !== 0) return;

    startX.current = e.clientX;
    startY.current = e.clientY;
    moved.current = false;

    clearTimers();
    holdTimer.current = window.setTimeout(() => {
      // a hold only makes sense while something is playing
      if (status !== "playing") return;
      holding.current = true;
      rateBeforeHold.current = playbackRate;
      setHoldRate(HOLD_BASE_RATE);
      setPlaybackRate(HOLD_BASE_RATE);
    }, HOLD_MS);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved.current = true;

    if (!holding.current) return;
    // drag right to speed up, left to come back down; 2x is the floor
    const steps = Math.floor(Math.max(0, dx) / DRAG_PX_PER_STEP);
    const next = Math.min(
      MAX_HOLD_RATE,
      Math.max(HOLD_BASE_RATE, HOLD_BASE_RATE + steps * DRAG_STEP),
    );
    setHoldRate((current) => {
      if (current === next) return current;
      setPlaybackRate(next);
      return next;
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    clearTimers();

    if (holding.current) {
      endHold();
      return;
    }
    // a drag on the surface is not a tap
    if (moved.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const zone = touch ? zoneOf(e.clientX, rect) : "centre";

    // Desktop, and the centre third on touch: play/pause with no delay.
    if (zone === "centre") {
      pendingZone.current = null;
      toggledAt.current = 0;
      togglePlay();
      return;
    }

    // Side zones on touch: a second tap within the window seeks instead.
    //
    // Two ways the first tap can still be "pending": its timer has not run yet
    // (the common case), or it ran a moment ago and already toggled — which is
    // the race the window cannot close. Both are a double tap; the second case
    // just has a toggle to undo first.
    const justToggled =
      toggledAt.current > 0 && Date.now() - toggledAt.current < DOUBLE_TAP_MS;

    if (pendingZone.current === zone && (tapTimer.current !== undefined || justToggled)) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = undefined;
      pendingZone.current = null;
      // Put back the play/pause the timer already fired, so the gesture is a
      // seek and nothing else. Restoring the REMEMBERED state, not toggling
      // again: togglePlay() only plays while the status is in
      // PLAYING_STATUSES, and the seek below can leave it "loading", so a
      // second toggle silently did nothing and stranded the video paused.
      if (justToggled) {
        if (wasPlaying.current) play();
        else pause();
      }
      toggledAt.current = 0;
      seekBy(zone === "left" ? -SEEK_SECONDS : SEEK_SECONDS);
      showFlash(zone === "left" ? "back" : "forward");
      return;
    }

    pendingZone.current = zone;
    toggledAt.current = 0;
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined;
      // the zone stays set: a second tap just after this still counts as a
      // double tap, and reads `toggledAt` to know it must undo the toggle
      toggledAt.current = Date.now();
      // what the toggle is about to leave behind, so the undo can restore it
      wasPlaying.current = statusRef.current === "playing";
      togglePlay();
    }, DOUBLE_TAP_MS);
  };

  const onPointerCancel = () => {
    clearTimers();
    endHold();
  };

  return {
    holdRate,
    flash,
    clearFlash: () => setFlash(null),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
