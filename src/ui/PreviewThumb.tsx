import type { PreviewData } from "./hooks/usePreviewSprite";
import { cueAt } from "./hooks/usePreviewSprite";
import styles from "./PreviewThumb.module.css";

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
  const scale = width / cue.w;

  return (
    <span
      className={`${styles.thumb} ${className ?? ""}`}
      style={{ width: `${width}px`, height: `${cue.h * scale}px` }}
      aria-hidden="true"
    >
      <span
        className={styles.tile}
        style={{
          width: `${cue.w}px`,
          height: `${cue.h}px`,
          backgroundImage: `url(${data.spriteUrl})`,
          backgroundPosition: `-${cue.x}px -${cue.y}px`,
          transform: `scale(${scale})`,
        }}
      />
    </span>
  );
}
