import { formatTime } from "./formatTime";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./TimeDisplay.module.css";

export function TimeDisplay({ previewTime }: { previewTime?: number | null }) {
  const currentTime = usePlayerState((s) => s.currentTime);
  const duration = usePlayerState((s) => s.duration);
  const shown =
    previewTime != null && Number.isFinite(previewTime)
      ? previewTime
      : currentTime;

  return (
    <div className={styles.time} aria-label="Tiempo">
      {formatTime(shown, duration)}
      <span className={styles.sep}> / </span>
      {formatTime(duration, duration)}
    </div>
  );
}
