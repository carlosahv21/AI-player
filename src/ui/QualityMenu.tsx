import { useEffect, useRef, useState } from "react";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./QualityMenu.module.css";

function levelLabel(height: number, bitrate: number): string {
  if (height) return `${height}p`;
  if (bitrate) return `${Math.round(bitrate / 1000)} kbps`;
  return "Nivel";
}

/** 720p and up is HD; 1080p and up gets called Full HD. */
function hdBadge(height: number): string | null {
  if (height >= 2160) return "4K";
  if (height >= 1440) return "2K";
  if (height >= 1080) return "FHD";
  if (height >= 720) return "HD";
  return null;
}

export function QualityMenu() {
  const enabled = usePlayerState((s) => s.video?.features.quality ?? false);
  const levels = usePlayerState((s) => s.qualityLevels);
  const quality = usePlayerState((s) => s.quality);
  const setQuality = usePlayerState((s) => s.setQuality);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  if (!enabled || levels.length <= 1) return null;

  const activeLevel =
    quality === "auto" ? null : levels.find((l) => l.index === quality);
  const current = activeLevel
    ? levelLabel(activeLevel.height, activeLevel.bitrate)
    : "Auto";
  const currentBadge = activeLevel ? hdBadge(activeLevel.height) : null;

  // highest first, the way quality pickers are usually read
  const ordered = [...levels].sort((a, b) => b.height - a.height);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.btn}
        aria-label={`Calidad ${current}`}
        title={`Calidad ${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current}</span>
        {currentBadge ? (
          <span className={styles.badge}>{currentBadge}</span>
        ) : null}
      </button>
      {open ? (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            className={styles.option}
            role="menuitemradio"
            aria-pressed={quality === "auto"}
            onClick={() => {
              setQuality("auto");
              setOpen(false);
            }}
          >
            Auto
          </button>
          {ordered.map((level) => {
            const badge = hdBadge(level.height);
            return (
              <button
                key={level.index}
                type="button"
                className={styles.option}
                role="menuitemradio"
                aria-pressed={quality === level.index}
                onClick={() => {
                  setQuality(level.index);
                  setOpen(false);
                }}
              >
                <span>{levelLabel(level.height, level.bitrate)}</span>
                {badge ? <span className={styles.badge}>{badge}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
