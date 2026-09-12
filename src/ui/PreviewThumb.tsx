import type { PreviewCue, PreviewData } from "./hooks/usePreviewSprite";
import { cueAt } from "./hooks/usePreviewSprite";
import styles from "./PreviewThumb.module.css";

/**
 * Fit the tile so its longer side is `width`. Landscape stays ~160×90;
 * portrait used to scale by width and come out ~160×284.
 */
export function thumbSize(
  cue: Pick<PreviewCue, "w" | "h">,
  width: number,
): { w: number; h: number; scale: number } {
  const long = Math.max(cue.w, cue.h);
  if (long <= 0 || width <= 0) return { w: 0, h: 0, scale: 0 };
  const scale = width / long;
  return { w: cue.w * scale, h: cue.h * scale, scale };
}

/**
 * One frame from the sprite sheet, scaled to `width`.
 *
 * Renders nothing when there is no sprite or no cue covers the time, so
 * every caller can mount it unconditionally.
 */
export function PreviewThumb({
  data,
  time,
  width = 160,
  className,
}: {
  data: PreviewData | null;
  time: number;
  width?: number;
  className?: string;
}) {
  if (!data) return null;
  const cue = cueAt(data.cues, time);
  if (!cue) return null;

  /*
   * The cue gives the tile's box inside the sheet but not the sheet's own
   * size, so the sheet cannot be sized directly. Scaling the whole element
   * with a transform sidesteps that: the tile is positioned at 1:1 and the
   * wrapper reports the scaled box, so layout still sees the right size.
   */
  const { w, h, scale } = thumbSize(cue, width);

  return (
    <span
      className={`${styles.thumb} ${className ?? ""}`}
      style={{ width: `${w}px`, height: `${h}px` }}
      aria-hidden="true"
    >
      <span
        className={styles.tile}
        style={{
          width: `${cue.w}px`,
          height: `${cue.h}px`,
          backgroundImage: `url(${cue.spriteUrl ?? data.spriteUrl})`,
          backgroundPosition: `-${cue.x}px -${cue.y}px`,
          transform: `scale(${scale})`,
        }}
      />
    </span>
  );
}
