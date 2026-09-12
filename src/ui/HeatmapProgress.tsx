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

/** The flex gap between rail segments; .track's `gap` must match. */
export const GAP_PX = 2;

/**
 * Where a time lands on the rail, as a CSS length.
 *
 * The rail is a flex row with `gap: GAP_PX` between segments, so the segments
 * share `100% - (n-1)*GAP_PX`, NOT the full width. A plain `time/duration*100%`
 * drifts right by up to (n-1)*GAP_PX — visible as the playhead sitting a few
 * pixels past the blue edge, and the mask's cuts missing the rail's gaps.
 *
 * The honest position is a share of the gapless space plus the whole gaps
 * already passed, which calc() expresses exactly without measuring the DOM.
 *
 * `sections` must be the same list the rail renders, in the same order.
 */
export function railPosition(
  time: number,
  duration: number,
  sections: readonly { start: number; end: number }[],
  gapPx = GAP_PX,
): string {
  if (duration <= 0) return "0px";

  // no sections means one full-width segment and no gaps at all
  const gaps = Math.max(0, sections.length - 1);
  if (gaps === 0) {
    return `${Math.max(0, Math.min(1, time / duration)) * 100}%`;
  }

  // Flex hands each segment `flexGrow: span`, so the share of the track is a
  // share of the SUMMED SPANS — not of the duration. They are the same number
  // when the sections tile the video, and differ the moment they leave a hole
  // or stop short of the end, which would drift every position after it.
  const total = sections.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (total <= 0) return "0px";

  // time measured in covered seconds: whole sections behind it, plus the part
  // of the one it falls in
  const elapsed = sections.reduce((sum, s) => {
    if (time >= s.end) return sum + (s.end - s.start);
    if (time > s.start) return sum + (time - s.start);
    return sum;
  }, 0);
  const ratio = Math.max(0, Math.min(1, elapsed / total));

  // How many whole gaps sit strictly to the LEFT of this time.
  //
  // `<` and not `<=`: a section's own start sits at the CLOSING edge of the
  // previous segment, before the gap that follows it. Counting that gap as
  // passed pushed every boundary a full gap right, which is what made the
  // heatmap's cuts miss the rail's dividers by exactly GAP_PX.
  const passed = sections.filter((s, i) => i > 0 && s.start < time).length;
  const track = `(100% - ${gaps * gapPx}px)`;

  return `calc(${ratio * 100} * ${track} / 100 + ${passed * gapPx}px)`;
}

/**
 * Punches a transparent gap at each section boundary, so the curve reads as
 * fragmented in step with the rail below it.
 *
 * A CSS mask, not a cut in the path: the gap has to be a true 2px at every
 * player width, and the viewBox is stretched by preserveAspectRatio="none", so
 * a gap measured in viewBox units would be wide on a desktop and invisible on
 * a phone.
 *
 * `edges` are the CSS lengths railPosition() returns for each section start —
 * already corrected for the gaps to their left, which is what makes the cuts
 * land on the rail's own gaps instead of drifting right of them.
 *
 * The cut STARTS at the edge and runs gapPx to the right; it is not centred on
 * it. That is how flex lays a gap out: the previous segment ends at the edge
 * and the next one begins gapPx later, so a centred cut would sit 1px left of
 * the rail's.
 *
 * Returns undefined when there is nothing to cut — one section (or none) has no
 * interior boundary, and an all-opaque mask is pointless work for the compositor.
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

  // The same list, in the same order, that the rail lays out — so every
  // position below is computed against the identical geometry.
  const rail = sections ?? [];
  const at = (t: number) => railPosition(t, duration, rail);

  // Interior boundaries only: a cut at the very start or end would shave the
  // curve's own ends rather than divide anything. A section's start is exactly
  // where the rail opens its gap, so the cuts land on the rail's own.
  const edges = rail.slice(1).map((s) => at(s.start));
  const mask = gapMask(edges);

  return (
    <>
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
        {/* inset() measures its right edge inward from the right, and at() is
            a distance from the left, so the two are complements. Sharing one
            expression is what keeps the clip edge under the playhead. */}
        <path
          className={styles.fill}
          d={area}
          style={{ clipPath: `inset(0 calc(100% - ${at(currentTime)}) 0 0)` }}
        />
      </svg>
    </>
  );
}
