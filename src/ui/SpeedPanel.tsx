import { useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./SpeedPanel.module.css";
import { CloseButton } from "./CloseButton";
import { PLAYBACK_RATES } from "../core/types";
import type { PlaybackRate } from "../core/types";

/**
 * Slow is cool, fast is warm, 1x is the theme's neutral. Two hues either side
 * of normal, no rainbow. The values come from the active theme, not from here:
 * off-1x is a practice state, and its colour has to track that token.
 */
const SLOW = "var(--aivp-speed-slow)";
const NORMAL = "var(--aivp-speed-normal)";
const FAST = "var(--aivp-speed-fast)";

function speedHue(rate: PlaybackRate): string {
  if (rate === 1) return NORMAL;
  return rate < 1 ? SLOW : FAST;
}

/**
 * Full-width speed picker: a track of stops, current value called out above,
 * Reset and Close on the bottom row.
 */
export function SpeedPanel({ onClose }: { onClose: () => void }) {
  const rate = usePlayerState((s) => s.playbackRate);
  const setPlaybackRate = usePlayerState((s) => s.setPlaybackRate);

  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const index = PLAYBACK_RATES.indexOf(rate);
  const last = PLAYBACK_RATES.length - 1;
  const pct = last > 0 ? (Math.max(index, 0) / last) * 100 : 0;

  const pick = (r: PlaybackRate) => setPlaybackRate(r);

  /** Nearest stop to the pointer: the rail snaps, it is not continuous. */
  const rateAt = (clientX: number): PlaybackRate | null => {
    const el = trackRef.current;
    if (!el || last <= 0) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    const i = Math.round(Math.min(1, Math.max(0, ratio)) * last);
    return PLAYBACK_RATES[i] ?? null;
  };

  const applyAt = (clientX: number) => {
    const next = rateAt(clientX);
    if (next && next !== rate) pick(next);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    applyAt(e.clientX);
  };

  return (
    <>
      <div className={styles.closeLayer} aria-hidden={false}>
        <CloseButton onClose={onClose} />
      </div>
    <div
      className={styles.panel}
      role="dialog"
      aria-label="Velocidad"
      style={{ "--aivp-speed": speedHue(rate) } as CSSProperties}
    >
      <p className={styles.current}>
        Velocidad actual: <b>{rate}x</b>
      </p>

      <div
        className={`${styles.track} ${dragging ? styles.dragging : ""}`}
        ref={trackRef}
        role="slider"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={(e) => {
          if (!dragging) return;
          applyAt(e.clientX);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        aria-label="Velocidad de reproducción"
        aria-valuemin={PLAYBACK_RATES[0]}
        aria-valuemax={PLAYBACK_RATES[PLAYBACK_RATES.length - 1]}
        aria-valuenow={rate}
        aria-valuetext={`${rate}x`}
        onKeyDown={(e) => {
          const step =
            e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, index + step))];
          if (next) pick(next);
        }}
      >
        <span className={styles.fill} style={{ width: `${pct}%` }} />
        {PLAYBACK_RATES.map((r, i) => (
          <span
            key={r}
            className={styles.tick}
            style={{ left: `${(i / last) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        <span className={styles.thumb} style={{ left: `${pct}%` }} />
      </div>

      <div className={styles.marks}>
        {PLAYBACK_RATES.map((r) => (
          <button
            key={r}
            type="button"
            className={styles.mark}
            aria-pressed={r === rate}
            onClick={() => pick(r)}
          >
            {r}x
          </button>
        ))}
      </div>

      {/* "Volver" is gone: the corner X closes the panel now */}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          disabled={rate === 1}
          onClick={() => pick(1)}
        >
          Restablecer
        </button>
      </div>
      </div>
    </>
  );
}
