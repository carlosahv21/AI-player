import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { clamp } from "../core/store";
import { coverageGaps } from "../core/duration";
import type { Section } from "../core/types";
import { formatTime } from "./formatTime";
import {
  axisAt,
  gapMask,
  HeatmapProgress,
  sectionCuts,
} from "./HeatmapProgress";
import { usePlayerState } from "./hooks/usePlayerState";
import { usePreviewSprite } from "./hooks/usePreviewSprite";
import { PreviewThumb } from "./PreviewThumb";
import styles from "./ProgressBar.module.css";

// ponytail: stable ref, a new [] each call would re-render forever
const EMPTY_SECTIONS: readonly Section[] = [];

const MIN_LOOP = 0.5;


function ratioFromEvent(clientX: number, el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0) return 0;
  return clamp((clientX - rect.left) / rect.width, 0, 1);
}

export function ProgressBar({
  loopDraft = null,
  onScrubbing,
}: {
  loopDraft?: number | null;
  /** Fires while the pointer is over the bar, so the caller can step aside. */
  onScrubbing?: (active: boolean) => void;
} = {}) {
  const currentTime = usePlayerState((s) => s.currentTime);
  const duration = usePlayerState((s) => s.duration);
  const buffered = usePlayerState((s) => s.buffered);
  const sections = usePlayerState((s) => s.video?.sections ?? EMPTY_SECTIONS);
  const loop = usePlayerState((s) => s.loop);
  const seek = usePlayerState((s) => s.seek);
  const play = usePlayerState((s) => s.play);
  const goToSection = usePlayerState((s) => s.goToSection);
  const activeSectionId = usePlayerState((s) => s.activeSectionId);
  const setLoop = usePlayerState((s) => s.setLoop);
  const preview = usePlayerState((s) => s.video?.preview);
  const heatmap = usePlayerState((s) => s.video?.heatmap);
  const previewData = usePreviewSprite(preview);
  // which loop edge is being dragged, null when not dragging one
  const [handle, setHandle] = useState<"start" | "end" | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dragged = useRef(false);
  const nudgeLoop = usePlayerState((s) => s.nudgeLoop);
  // 0..1 position of the pointer along the bar, for the hover guide
  const [guide, setGuide] = useState<number | null>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const [labelW, setLabelW] = useState(0);
  const [barW, setBarW] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setBarW(el.clientWidth);
      setLabelW(labelRef.current?.offsetWidth ?? 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [guide !== null]);
  const guideTime = guide === null ? null : guide * duration;

  // ponytail: the label is 132px on phones and 176px on desktop, so measure it
  // rather than hardcoding either. The overflow is computed as a share of the
  // bar, then converted to a share of the label, which is what translateX uses.
  const labelShift = (() => {
    if (guide === null || labelW <= 0 || barW <= 0) return -50;
    const halfBar = (labelW / 2 / barW) * 100;
    const overLeft = Math.max(0, halfBar - guide * 100);
    const overRight = Math.max(0, halfBar - (1 - guide) * 100);
    return -50 + (overLeft - overRight) * (barW / labelW);
  })();
  // No fallback to the last section: over a hole there is genuinely no section
  // to name, and labelling it with a neighbour's name claimed the hole was
  // part of a section the user would then not find there.
  const guideSection =
    guideTime === null
      ? null
      : (sections.find((x) => x.start <= guideTime && guideTime < x.end) ??
        null);

  const shown = drag ?? currentTime;
  const max = duration > 0 ? duration : 1;
  const at = (t: number) => axisAt(t, max);
  const mask = gapMask(sectionCuts(sections, max));
  const holes = coverageGaps(sections, max);

  const commit = (time: number) => {
    seek(time);
    setDrag(null);
    // Releasing a scrub resumes playback: the bar used to leave the video
    // parked at the new position waiting for a second action. Only after a
    // real drag — a plain click on a paused video is a seek, not a request
    // to start playing.
    if (dragged.current) play();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = wrapRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragged.current = false;
    setDrag(ratioFromEvent(e.clientX, el) * duration);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    const el = wrapRef.current;
    if (!el) return;
    dragged.current = true;
    setDrag(ratioFromEvent(e.clientX, el) * duration);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (drag === null) return;
    // A click on the bar always seeks to the point clicked, section hit or
    // not: the hit layer spans the whole track, so deferring to it made every
    // click jump to the start of the section instead of where the pointer was.
    const el = wrapRef.current;
    const time = el ? ratioFromEvent(e.clientX, el) * duration : drag;
    commit(time);
  };

  return (
    <div
      className={styles.wrap}
      role="slider"
      tabIndex={0}
      aria-label="Progreso"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={shown}
      aria-valuetext={formatTime(shown, duration)}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        onPointerMove(e);
        const el = wrapRef.current;
        if (el) setGuide(ratioFromEvent(e.clientX, el));
        onScrubbing?.(true);
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => {
        setGuide(null);
        onScrubbing?.(false);
      }}
      ref={wrapRef}
    >
      {heatmap ? <HeatmapProgress points={heatmap} /> : null}
      <div className={styles.track}>
        <div
          className={styles.bar}
          style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
        >
          <span className={styles.rail} />
          <span className={styles.buffered} style={{ width: at(buffered) }} />
          <span className={styles.played} style={{ width: at(shown) }} />
          {holes.map((gap) => (
            <span
              key={`gap:${gap.start}`}
              className={styles.hole}
              style={{
                left: at(gap.start),
                width: `${((gap.end - gap.start) / max) * 100}%`,
              }}
            />
          ))}
          {loop ? (
            <span
              className={styles.loop}
              style={{
                left: at(loop.start),
                right: `calc(100% - ${at(loop.end)})`,
              }}
            />
          ) : null}
          {loopDraft !== null ? (
            <span
              className={styles.draft}
              style={{
                left: at(Math.min(loopDraft, shown)),
                right: `calc(100% - ${at(Math.max(loopDraft, shown))})`,
              }}
            />
          ) : null}
        </div>
        <span
          className={styles.playhead}
          style={{ left: at(shown) }}
          aria-hidden="true"
        />
      </div>
      {guide !== null ? (
        <div
          className={styles.guide}
          style={{ left: `${guide * 100}%` }}
          aria-hidden="true"
        >
          {/* ponytail: the shift slides with the pointer instead of snapping
              at a threshold, so the label never jumps sideways near the ends */}
          <span
            ref={labelRef}
            className={styles.guideLabel}
            style={{ transform: `translateX(${labelShift}%)` }}
          >
            <PreviewThumb
              data={previewData}
              time={guide * duration}
              /* labelW is the label's real rendered width, already measured
                 for the edge clamping — so the frame tracks the breakpoint
                 without this component knowing what the breakpoint is */
              width={Math.max(0, labelW - 16)}
              className={styles.guideThumb}
            />
            {guideSection ? (
              <b className={styles.guideName}>{guideSection.name}</b>
            ) : null}
            <span className={styles.guideTime}>
              {formatTime(guide * duration, duration)}
            </span>
          </span>
        </div>
      ) : null}
      {loopDraft !== null ? (
        <div
          className={styles.draftMark}
          style={{ left: `${(loopDraft / max) * 100}%` }}
          aria-hidden="true"
        />
      ) : null}
      {loop
        ? (["start", "end"] as const).map((edge) => (
            <div
              key={edge}
              className={styles.handle}
              role="slider"
              tabIndex={0}
              aria-label={edge === "start" ? "Inicio del loop" : "Fin del loop"}
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={loop[edge]}
              aria-valuetext={formatTime(loop[edge], duration)}
              style={{ left: `${(loop[edge] / max) * 100}%` }}
              onPointerDown={(e) => {
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                setHandle(edge);
              }}
              onPointerMove={(e) => {
                if (handle !== edge) return;
                const el = wrapRef.current;
                if (!el) return;
                const t = ratioFromEvent(e.clientX, el) * duration;
                // seek to the edge being moved so the cut is visible
                if (edge === "start") {
                  const start = clamp(t, 0, loop.end - MIN_LOOP);
                  setLoop(start, loop.end);
                  seek(start);
                } else {
                  const end = clamp(t, loop.start + MIN_LOOP, duration);
                  setLoop(loop.start, end);
                  seek(end);
                }
              }}
              onPointerUp={() => setHandle(null)}
              onPointerCancel={() => setHandle(null)}
              onKeyDown={(e) => {
                const step =
                  e.key === "ArrowLeft" ? -0.5 : e.key === "ArrowRight" ? 0.5 : 0;
                if (!step) return;
                e.preventDefault();
                e.stopPropagation();
                nudgeLoop(edge, step);
              }}
            >
              <span className={styles.handleGrip} />
            </div>
          ))
        : null}
      {sections.length > 1 ? (
        <div className={styles.hitbar}>
          {sections.map((section) => (
            // ponytail: no native title here, .hitName is the tooltip
            <button
              key={section.id}
              type="button"
              className={`${styles.hit} ${
                section.id === activeSectionId ? styles.hitActive : ""
              }`}
              style={{
                left: `${(section.start / max) * 100}%`,
                width: `${((section.end - section.start) / max) * 100}%`,
              }}
              aria-label={`Ir a ${section.name}`}
              // Mouse clicks are handled by the bar itself (seek to the exact
              // point). This stays for keyboard: Enter/Space on a focused
              // section jumps to its start, which is what a section button
              // should do when you cannot point at a pixel.
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                e.stopPropagation();
                goToSection(section.id);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
