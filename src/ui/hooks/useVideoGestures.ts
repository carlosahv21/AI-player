import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { MAX_HOLD_RATE } from "../../core/types";
import type { PlaybackRate } from "../../core/types";

/** Wait for a possible second tap, in the side zones only. */
const DOUBLE_TAP_MS = 250;
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
      togglePlay();
      return;
    }

    // Side zones on touch: a second tap within the window seeks instead.
    if (tapTimer.current !== undefined && pendingZone.current === zone) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = undefined;
      pendingZone.current = null;
      seekBy(zone === "left" ? -SEEK_SECONDS : SEEK_SECONDS);
      showFlash(zone === "left" ? "back" : "forward");
      return;
    }

    pendingZone.current = zone;
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined;
      pendingZone.current = null;
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
