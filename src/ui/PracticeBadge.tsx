import { formatTime } from "./formatTime";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./PracticeBadge.module.css";

/**
 * Always-on answer to "why is the video behaving oddly?".
 * Never hidden by the control bar's idle timer.
 */
export function PracticeBadge() {
  const loop = usePlayerState((s) => s.loop);
  const rate = usePlayerState((s) => s.playbackRate);
  const repeatMode = usePlayerState((s) => s.repeatMode);
  const repeatsDone = usePlayerState((s) => s.repeatsDone);
  const duration = usePlayerState((s) => s.duration);
  const clearLoop = usePlayerState((s) => s.clearLoop);
  const setPlaybackRate = usePlayerState((s) => s.setPlaybackRate);

  if (!loop && rate === 1) return null;

  return (
    <div className={styles.badge} role="status">
      {rate !== 1 ? <span className={styles.chip}>{rate}x</span> : null}
      {loop ? (
        <span className={styles.chip}>
          {formatTime(loop.start, duration)}–{formatTime(loop.end, duration)}
        </span>
      ) : null}
      {loop && repeatMode ? (
        <span className={styles.chip}>
          {repeatMode === "infinite"
            ? "∞"
            : `${Math.min(repeatsDone + 1, repeatMode)} / ${repeatMode}`}
        </span>
      ) : null}
      <button
        type="button"
        className={styles.exit}
        aria-label={loop ? "Salir del loop" : "Volver a 1x"}
        title={loop ? "Salir del loop (L)" : "Volver a 1x"}
        onClick={() => {
          if (loop) clearLoop();
          if (rate !== 1) setPlaybackRate(1);
        }}
      >
        ✕
      </button>
    </div>
  );
}
