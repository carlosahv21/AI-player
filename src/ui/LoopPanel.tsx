import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clamp } from "../core/store";
import { formatTime } from "./formatTime";
import { usePlayerStoreInstance } from "./context/PlayerStoreContext";
import { usePlayerState } from "./hooks/usePlayerState";
import { usePreviewSprite } from "./hooks/usePreviewSprite";
import { PreviewThumb } from "./PreviewThumb";
import { CloseButton } from "./CloseButton";
import styles from "./LoopPanel.module.css";
import type { RepeatMode, Section } from "../core/types";

const EMPTY_SECTIONS: readonly Section[] = [];
const MIN_LOOP = 0.5;
const REPEATS: RepeatMode[] = [2, 3, "infinite"];

function repeatLabel(mode: RepeatMode): string {
  return mode === "infinite" ? "∞" : `×${mode}`;
}

/**
 * Loop builder: pick a section or drag the two handles and the loop is
 * already running — there is no confirmation step. The range reaches the
 * store as soon as it is valid, and every later edit updates it in place.
 *
 * "Cerrar" only closes the panel; it does not undo anything.
 */
export function LoopPanel({ onClose }: { onClose: () => void }) {
  const sections = usePlayerState((s) => s.video?.sections ?? EMPTY_SECTIONS);
  const activeSectionId = usePlayerState((s) => s.activeSectionId);
  const duration = usePlayerState((s) => s.duration);
  const currentTime = usePlayerState((s) => s.currentTime);
  const storedLoop = usePlayerState((s) => s.loop);
  const setLoop = usePlayerState((s) => s.setLoop);
  const setRepeatMode = usePlayerState((s) => s.setRepeatMode);
  const seek = usePlayerState((s) => s.seek);
  const play = usePlayerState((s) => s.play);
  const togglePlay = usePlayerState((s) => s.togglePlay);
  const status = usePlayerState((s) => s.status);
  // live reads inside pointer handlers: the subscribed copies above are a
  // render old by the time a drag ends
  const { playerStore } = usePlayerStoreInstance();
  const preview = usePlayerState((s) => s.video?.preview);
  const hls = usePlayerState((s) => s.video?.sources.hls);
  const poster = usePlayerState((s) => s.video?.poster);
  const payloadDuration = usePlayerState((s) => s.video?.duration ?? 0);
  const previewData = usePreviewSprite(preview, {
    hls,
    poster,
    duration: duration > 0 ? duration : payloadDuration,
  });

  // the panel still owns the range while dragging, so a half-made selection
  // does not thrash the store; commitRange() pushes it once it is valid
  const [range, setRange] = useState(() => {
    if (storedLoop) return storedLoop;
    const active = sections.find((x) => x.id === activeSectionId);
    if (active) return { start: active.start, end: active.end };
    const start = clamp(currentTime, 0, Math.max(0, duration - MIN_LOOP));
    return { start, end: Math.min(duration, start + 8) };
  });
  const [repeat, setRepeat] = useState<RepeatMode>("infinite");
  const [drag, setDrag] = useState<"start" | "end" | "move" | null>(null);
  // offset from the selection's start to where the pointer grabbed it
  const grabOffset = useRef(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const max = duration > 0 ? duration : 1;
  const pctOf = (t: number) => (t / max) * 100;

  const timeAt = (clientX: number): number | null => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return clamp((clientX - rect.left) / rect.width, 0, 1) * duration;
  };

  const moveEdge = (edge: "start" | "end", clientX: number) => {
    const t = timeAt(clientX);
    if (t === null) return;
    setRange((r) =>
      edge === "start"
        ? { start: clamp(t, 0, r.end - MIN_LOOP), end: r.end }
        : { start: r.start, end: clamp(t, r.start + MIN_LOOP, duration) },
    );
    // show the frame at the edge being moved
    seek(edge === "start" ? clamp(t, 0, range.end - MIN_LOOP) : clamp(t, range.start + MIN_LOOP, duration));
  };

  /** Slides the whole window, keeping its length — the editor gesture. */
  const moveWindow = (clientX: number) => {
    const t = timeAt(clientX);
    if (t === null) return;
    setRange((r) => {
      const span = r.end - r.start;
      const start = clamp(t - grabOffset.current, 0, duration - span);
      return { start, end: start + span };
    });
  };

  const grab =
    (edge: "start" | "end") => (e: ReactPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(edge);
      moveEdge(edge, e.clientX);
    };

  const grabWindow = (e: ReactPointerEvent<HTMLDivElement>) => {
    const t = timeAt(e.clientX);
    if (t === null) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    grabOffset.current = t - range.start;
    setDrag("move");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /**
   * Picking from the list is a decision, not an adjustment: it commits, runs
   * and gets out of the way.
   */
  const pick = (next: { start: number; end: number }) => {
    setRange(next);
    commitRange(next, "confirm");
  };

  const tooShort = range.end - range.start < MIN_LOOP;

  /**
   * Push the range to the store. There is no confirmation step: the loop is
   * live as soon as the range is valid.
   *
   * Two kinds of edit, and they end differently:
   *
   * - "confirm" — picking a section or sliding the whole window. The user has
   *   said which passage they want, so the loop starts playing and the panel
   *   closes.
   * - "adjust" — dragging one of the two handles. That is trimming, not
   *   choosing: closing the panel after every handle release would make it
   *   impossible to tune both edges, since reopening resets the view. The
   *   loop still updates live; the panel just stays open.
   *
   * The seek is skipped when the playhead already sits inside the new range,
   * so trimming does not keep yanking playback back to the start.
   */
  const commitRange = (
    next: { start: number; end: number },
    intent: "confirm" | "adjust",
  ) => {
    if (next.end - next.start < MIN_LOOP) return;
    setLoop(next.start, next.end);
    setRepeatMode(repeat);

    const t = playerStore.getState().currentTime;
    if (t < next.start || t >= next.end) seek(next.start);

    if (intent === "adjust") return;

    // a confirmed choice plays, whether or not it was playing before
    play();
    onClose();
  };

  const isPicked = (r: { start: number; end: number }) =>
    Math.abs(r.start - range.start) < 0.01 && Math.abs(r.end - range.end) < 0.01;

  return (
    <div className={styles.panel} role="dialog" aria-label="Configurar loop">
      <CloseButton onClose={onClose} />
      <div className={styles.body}>
        <div className={styles.sections}>
          <p className={styles.heading}>Secciones</p>
          <div className={styles.list}>
            {sections.map((section) => (
              <div key={section.id} className={styles.group}>
                <button
                  type="button"
                  className={styles.section}
                  aria-pressed={isPicked(section)}
                  onClick={() =>
                    pick({ start: section.start, end: section.end })
                  }
                >
                  <span className={styles.sectionName}>{section.name}</span>
                  <span className={styles.sectionTime}>
                    {formatTime(section.start, duration)}
                  </span>
                </button>

                {section.steps?.map((step) => (
                  <button
                    key={step.id}
                    type="button"
                    className={styles.step}
                    aria-pressed={isPicked(step)}
                    onClick={() => pick({ start: step.start, end: step.end })}
                  >
                    <span className={styles.sectionName}>{step.name}</span>
                    <span className={styles.sectionTime}>
                      {formatTime(step.start, duration)}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* what the two edges actually land on — absent without a sprite */}
      {previewData ? (
        <div className={styles.edgeFrames}>
          {(["start", "end"] as const).map((edge) => (
            <div key={edge} className={styles.edgeFrame}>
              <PreviewThumb data={previewData} time={range[edge]} width={150} />
              <span className={styles.edgeFrameLabel}>
                {edge === "start" ? "Inicio" : "Fin"}
                <b>{formatTime(range[edge], duration)}</b>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.trackWrap}>
        <span className={styles.edgeTime} style={{ left: `${pctOf(range.start)}%` }}>
          {formatTime(range.start, duration)}
        </span>
        <span className={styles.edgeTime} style={{ left: `${pctOf(range.end)}%` }}>
          {formatTime(range.end, duration)}
        </span>

        <div
          className={styles.track}
          ref={trackRef}
          onPointerMove={(e) => {
            if (!drag) return;
            if (drag === "move") moveWindow(e.clientX);
            else moveEdge(drag, e.clientX);
          }}
          onPointerUp={() => {
            // moving the window picks a passage; a handle only trims an edge
            if (drag) commitRange(range, drag === "move" ? "confirm" : "adjust");
            setDrag(null);
          }}
          onPointerCancel={() => setDrag(null)}
        >
          {sections.map((section) =>
            section.start <= 0 ? null : (
              <span
                key={section.id}
                className={styles.gap}
                style={{ left: `${pctOf(section.start)}%` }}
                aria-hidden="true"
              />
            ),
          )}

          {/* grab anywhere inside to slide the window without resizing it */}
          <div
            className={`${styles.selection} ${drag === "move" ? styles.selectionOn : ""}`}
            style={{
              left: `${pctOf(range.start)}%`,
              width: `${pctOf(range.end - range.start)}%`,
            }}
            role="slider"
            tabIndex={0}
            aria-label="Mover el loop"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={range.start}
            aria-valuetext={`${formatTime(range.start, duration)} a ${formatTime(range.end, duration)}`}
            onPointerDown={grabWindow}
            onKeyDown={(e) => {
              const step =
                e.key === "ArrowLeft" ? -0.5 : e.key === "ArrowRight" ? 0.5 : 0;
              if (!step) return;
              e.preventDefault();
              setRange((r) => {
                const span = r.end - r.start;
                const start = clamp(r.start + step, 0, duration - span);
                const next = { start, end: start + span };
                commitRange(next, "adjust");
                return next;
              });
            }}
          />

          {(["start", "end"] as const).map((edge) => (
            <div
              key={edge}
              className={`${styles.handle} ${drag === edge ? styles.handleOn : ""}`}
              style={{ left: `${pctOf(range[edge])}%` }}
              role="slider"
              tabIndex={0}
              aria-label={edge === "start" ? "Inicio del loop" : "Fin del loop"}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={range[edge]}
              aria-valuetext={formatTime(range[edge], duration)}
              onPointerDown={grab(edge)}
              onKeyDown={(e) => {
                const step =
                  e.key === "ArrowLeft" ? -0.5 : e.key === "ArrowRight" ? 0.5 : 0;
                if (!step) return;
                e.preventDefault();
                setRange((r) => {
                  const next =
                    edge === "start"
                      ? {
                          start: clamp(r.start + step, 0, r.end - MIN_LOOP),
                          end: r.end,
                        }
                      : {
                          start: r.start,
                          end: clamp(r.end + step, r.start + MIN_LOOP, duration),
                        };
                  commitRange(next, "adjust");
                  return next;
                });
              }}
            >
              <span className={styles.grip} />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.actions}>
        {/* the loop is already running while the panel is open, so the panel
            needs its own transport: closing it just to pause was silly */}
        <button
          type="button"
          className={styles.transport}
          aria-label={status === "playing" ? "Pausar" : "Reproducir"}
          title={status === "playing" ? "Pausar" : "Reproducir"}
          onClick={togglePlay}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.transportIcon}>
            {status === "playing" ? (
              <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
            ) : (
              <path d="M8 5v14l11-7z" />
            )}
          </svg>
        </button>

        <div className={styles.repeatGroup}>
          <p className={styles.caption}>Veces que se repite</p>
          <div className={styles.repeats} role="group" aria-label="Repeticiones">
            {REPEATS.map((mode) => (
              <button
                key={String(mode)}
                type="button"
                className={styles.repeat}
                aria-pressed={repeat === mode}
                aria-label={
                  mode === "infinite"
                    ? "Repetir siempre"
                    : `Repetir ${mode} veces`
                }
                onClick={() => {
                  setRepeat(mode);
                  // the loop is already live, so the choice applies at once
                  if (!tooShort) setRepeatMode(mode);
                }}
              >
                {repeatLabel(mode)}
              </button>
            ))}
          </div>
        </div>

        <p className={styles.hint}>
          Arrastra las dos barras o elige una sección para acotar el loop.
        </p>
      </div>
    </div>
  );
}
