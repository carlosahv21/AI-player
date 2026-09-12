import { useEffect, useRef, useState } from "react";
import { PLAYBACK_RATES } from "../core/types";
import type { PlaybackRate } from "../core/types";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./SpeedControl.module.css";

const PRACTICE: PlaybackRate[] = [0.5, 0.75, 1];
const EXTRA = PLAYBACK_RATES.filter((rate) => !PRACTICE.includes(rate));

function label(rate: number): string {
  return `${rate}x`;
}

export function SpeedControl({ compact = false }: { compact?: boolean }) {
  const rate = usePlayerState((s) => s.playbackRate);
  const enabled = usePlayerState((s) => s.video?.features.speed ?? false);
  const setPlaybackRate = usePlayerState((s) => s.setPlaybackRate);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = rate !== 1;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;

  if (compact) {
    return (
      <button
        type="button"
        className={`${styles.compact} ${active ? styles.compactActive : ""}`}
        aria-label={`Velocidad ${label(rate)}`}
        title={`Velocidad ${label(rate)}`}
        onClick={() => {
          const i = PRACTICE.indexOf(rate as PlaybackRate);
          const next = i < 0 ? 1 : (PRACTICE[(i + 1) % PRACTICE.length] ?? 1);
          setPlaybackRate(next);
        }}
      >
        {label(rate)}
      </button>
    );
  }

  const extraSelected = EXTRA.includes(rate);

  return (
    <div
      className={`${styles.wrap} ${active ? styles.wrapActive : ""}`}
      ref={wrapRef}
    >
      <div className={styles.segment} role="group" aria-label="Velocidad">
        {PRACTICE.map((item) => (
          <button
            key={item}
            type="button"
            className={styles.seg}
            aria-pressed={rate === item}
            aria-label={label(item)}
            title={`Velocidad ${label(item)}`}
            onClick={() => setPlaybackRate(item)}
          >
            {label(item)}
          </button>
        ))}
        <button
          type="button"
          className={styles.more}
          aria-label="Más velocidades"
          title="Más velocidades"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-pressed={extraSelected}
          onClick={() => setOpen((v) => !v)}
        >
          {extraSelected ? label(rate) : "▾"}
        </button>
      </div>
      {open ? (
        <div className={styles.menu} role="menu">
          {EXTRA.map((item) => (
            <button
              key={item}
              type="button"
              className={styles.option}
              role="menuitemradio"
              aria-pressed={rate === item}
              onClick={() => {
                setPlaybackRate(item);
                setOpen(false);
              }}
            >
              {label(item)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
