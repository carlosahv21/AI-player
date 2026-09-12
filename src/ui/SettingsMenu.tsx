import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { formatTime } from "./formatTime";
import { toggleFullscreen, usePlayerState } from "./hooks/usePlayerState";
import styles from "./SettingsMenu.module.css";

interface Item {
  key: string;
  label: string;
  value?: string;
  icon: ReactNode;
  active?: boolean;
  onSelect: () => void;
}

/**
 * Landscape settings: a FAB that fans its items upward, each labelled
 * beside the button. Closes on outside click, Escape, or picking an item.
 */
export function SettingsMenu({
  rootRef,
  onOpenChange,
  onOpenSpeed,
  onOpenLoop,
}: {
  rootRef: RefObject<HTMLDivElement>;
  onOpenChange?: (open: boolean) => void;
  onOpenSpeed?: () => void;
  onOpenLoop?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const muted = usePlayerState((s) => s.muted);
  const toggleMute = usePlayerState((s) => s.toggleMute);
  const mirrored = usePlayerState((s) => s.mirrored);
  const toggleMirror = usePlayerState((s) => s.toggleMirror);
  const mirrorOn = usePlayerState((s) => Boolean(s.video?.features.mirror));
  const perspective = usePlayerState((s) => s.perspective);
  const setPerspective = usePlayerState((s) => s.setPerspective);
  const hasBack = usePlayerState(
    (s) => Boolean(s.video?.sources.back) && Boolean(s.video?.features.frontBack),
  );
  const rate = usePlayerState((s) => s.playbackRate);
  const quality = usePlayerState((s) => s.quality);
  const levels = usePlayerState((s) => s.qualityLevels);
  const setQuality = usePlayerState((s) => s.setQuality);
  const qualityOn = usePlayerState((s) => Boolean(s.video?.features.quality));
  const loop = usePlayerState((s) => s.loop);
  const loopOn = usePlayerState((s) => Boolean(s.video?.features.loop));
  const repeatMode = usePlayerState((s) => s.repeatMode);
  const duration = usePlayerState((s) => s.duration);

  useEffect(() => onOpenChange?.(open), [open, onOpenChange]);

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

  const items: Item[] = [
    {
      key: "speed",
      label: "Velocidad",
      value: `${rate}x`,
      active: rate !== 1,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21a9 9 0 1 1 9-9" />
          <path d="M12 12l4-3" />
        </svg>
      ),
      // opens the picker; a second tap reopens it rather than resetting,
      // so an existing choice is never lost by accident
      onSelect: () => onOpenSpeed?.(),
    },
  ];

  if (loopOn) {
    // ponytail: loop and repeat were always coupled, so one button cycles both
    items.push({
      key: "loop",
      label: "Loop",
      value: loop
        ? `${formatTime(loop.start, duration)}–${formatTime(loop.end, duration)} ${
            repeatMode === "infinite" ? "∞" : `x${repeatMode ?? 1}`
          }`
        : "OFF",
      active: Boolean(loop),
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      ),
      // opens the builder: pick a range and repeat count in one place
      onSelect: () => onOpenLoop?.(),
    });
  }

  if (mirrorOn) {
    items.push({
      key: "mirror",
      label: "Espejo",
      value: mirrored ? "ON" : "OFF",
      active: mirrored,
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v18" />
          <path d="M9 7L4 12l5 5z" />
          <path d="M15 7l5 5-5 5z" />
        </svg>
      ),
      onSelect: () => toggleMirror(),
    });
  }

  if (hasBack) {
    items.push({
      key: "view",
      label: "Vista",
      value: perspective === "back" ? "ESPALDA" : "FRENTE",
      active: perspective === "back",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="3" width="12" height="18" rx="2" />
          <path d="M12 7v10" />
        </svg>
      ),
      onSelect: () => setPerspective(perspective === "back" ? "front" : "back"),
    });
  }

  items.push({
    key: "mute",
    label: "Sonido",
    value: muted ? "OFF" : "ON",
    active: !muted,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M17 9a5 5 0 0 1 0 6" />}
      </svg>
    ),
    onSelect: () => toggleMute(),
  });

  if (qualityOn && levels.length > 1) {
    items.push({
      key: "quality",
      label: "Calidad",
      value: quality === "auto" ? "AUTO" : `${levels.find((l) => l.index === quality)?.height ?? ""}p`,
      active: quality !== "auto",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M8 12h8" />
        </svg>
      ),
      onSelect: () => {
        const i = levels.findIndex((l) => l.index === quality);
        const next = levels[i + 1];
        setQuality(next ? next.index : "auto");
      },
    });
  }

  items.push({
    key: "fullscreen",
    label: "Pantalla",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      </svg>
    ),
    onSelect: () => toggleFullscreen(rootRef.current),
  });

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={`${styles.items} ${open ? styles.itemsOpen : ""}`}>
        {items.map((item, i) => (
          <div
            key={item.key}
            className={styles.row}
            style={{ transitionDelay: open ? `${i * 28}ms` : "0ms" }}
          >
            <span className={styles.caption}>
              {item.label}
              {item.value ? <b>{item.value}</b> : null}
            </span>
            <button
              type="button"
              className={styles.item}
              aria-label={`${item.label}${item.value ? ` ${item.value}` : ""}`}
              aria-pressed={item.active}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                item.onSelect();
                if (
                  item.key === "fullscreen" ||
                  item.key === "speed" ||
                  item.key === "loop"
                ) {
                  setOpen(false);
                }
              }}
            >
              {item.icon}
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={`${styles.fab} ${open ? styles.fabOpen : ""}`}
        aria-label={open ? "Cerrar configuración" : "Configuración"}
        title={open ? "Cerrar configuración" : "Configuración"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
