import { formatTime } from "./formatTime";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./LoopOfferBanner.module.css";

export function LoopOfferBanner({
  loop,
  onAccept,
  onDismiss,
}: {
  loop: { start: number; end: number };
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const duration = usePlayerState((s) => s.duration);

  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>
        Retomar el loop anterior {formatTime(loop.start, duration)}–
        {formatTime(loop.end, duration)}
      </span>
      <button type="button" className={styles.accept} onClick={onAccept}>
        Retomar
      </button>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Descartar"
        title="Descartar"
        onClick={onDismiss}
      >
        ✕
      </button>
    </div>
  );
}
