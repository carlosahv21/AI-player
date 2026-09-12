import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./HeatmapProgress.module.css";

/**
 * Closed area path in the fixed 0..100 viewBox. Takes no time argument on
 * purpose: the curve must be identical at every playback position.
 */
export function heatArea(points: readonly number[]): string {
  // smooth-ish curve: midpoint-anchored quadratics through the samples
  const step = 100 / (points.length - 1);
  const y = (v: number) => 100 - Math.max(0, Math.min(1, v)) * 100;
  let d = `M0,${y(points[0])}`;
  for (let i = 1; i < points.length; i++) {
    const x = i * step;
    d += ` Q${x - step / 2},${y(points[i - 1])} ${x},${y(points[i])}`;
  }
  return `${d} L100,100 L0,100 Z`;
}

/** Decorative cut between touching sections; must not steal axis width. */
export const GAP_PX = 2;

/**
 * Where a time sits on the bar. One axis: `time / duration`.
 *
 * The rail is a single rectangle and this curve spans that same rectangle, so
 * a plain percentage is the honest position — fill, playhead, clip, cuts and
 * seek all use this. There is no gap compensation: marks sit on the axis,
 * they do not take width out of it.
 */
export function axisAt(time: number, duration: number): string {
  if (duration <= 0) return "0%";
  return `${Math.max(0, Math.min(1, time / duration)) * 100}%`;
}

type CutSource = {
  start: number;
  end: number;
  steps?: readonly { start: number; end: number }[];
};

/**
 * Interior joints on the rail, as axis percentages: touching named sections,
 * plus every step that starts inside the video.
 *
 * A hole between two sections is an absence, not a joint. A step that shares
 * its start with a section joint is listed once.
 */
export function sectionCuts(
  sections: readonly CutSource[],
  duration: number,
): string[] {
  if (duration <= 0) return [];
  const times = new Set<number>();
  const ordered = [...sections]
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start === ordered[i - 1].end && ordered[i].start < duration) {
      times.add(ordered[i].start);
    }
  }
  for (const section of sections) {
    for (const step of section.steps ?? []) {
      if (step.end > step.start && step.start > 0 && step.start < duration) {
        times.add(step.start);
      }
    }
  }
  return [...times].sort((a, b) => a - b).map((t) => axisAt(t, duration));
}

/**
 * Punches a transparent 2px mark at each section joint so the curve reads as
 * fragmented in step with the rail. Decorative: the path still spans 0..100.
 *
 * A CSS mask, not a cut in the path: the mark has to be a true 2px at every
 * player width, and the viewBox is stretched by preserveAspectRatio="none".
 *
 * The cut STARTS at the edge and runs gapPx to the right.
 */
export function gapMask(
  edges: readonly string[],
  gapPx = GAP_PX,
): string | undefined {
  if (edges.length === 0) return undefined;
  const stops = ["#000 0%"];
  for (const at of edges) {
    stops.push(
      `#000 ${at}`,
      `transparent ${at}`,
      `transparent calc(${at} + ${gapPx}px)`,
      `#000 calc(${at} + ${gapPx}px)`,
    );
  }
  stops.push("#000 100%");
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/**
 * The curve is drawn once in a 0..100 x 0..100 viewBox and never redrawn:
 * `preserveAspectRatio="none"` stretches it to the bar's width, so the X axis
 * is always the full duration. Progress is a clip-path on the filled copy —
 * vector points untouched, no horizontal rescale as currentTime advances.
 */
export function HeatmapProgress({ points }: { points: readonly number[] }) {
  const currentTime = usePlayerState((s) => s.currentTime);
  const duration = usePlayerState((s) => s.duration);
  const sections = usePlayerState((s) => s.video?.sections);
  if (points.length < 2) return null;
  const area = heatArea(points);
  const mask = gapMask(sectionCuts(sections ?? [], duration));

  return (
    <svg
      className={styles.svg}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      <defs>
        {/* vertical: bright at the crest, fading to nothing at the baseline */}
        <linearGradient id="aivp-heat" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--aivp-brand-strong, var(--aivp-brand))"
            stopOpacity="0.8"
          />
          <stop offset="100%" stopColor="var(--aivp-brand)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path className={styles.rest} d={area} />
      {/* inset() measures its right edge inward from the right, and axisAt()
          is a distance from the left, so the two are complements. */}
      <path
        className={styles.fill}
        d={area}
        style={{
          clipPath: `inset(0 calc(100% - ${axisAt(currentTime, duration)}) 0 0)`,
        }}
      />
    </svg>
  );
}
