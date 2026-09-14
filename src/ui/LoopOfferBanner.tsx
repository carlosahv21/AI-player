import { formatTime } from "./formatTime";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./LoopOfferBanner.module.css";

/**
 * Offers what the last visit left behind: a loop, a position, or both.
 *
 * Nothing here is applied until it is accepted. Resuming silently is what
 * makes a video open halfway through with no explanation, which reads as a
 * bug; an offer that can be ignored keeps the convenience without it.
 */
export function LoopOfferBanner({
  loop,
  resumeAt,
  onAccept,
  onDismiss,
}: {
  loop: { start: number; end: number } | null;
  resumeAt: number | null;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const duration = usePlayerState((s) => s.duration);

  if (!loop && resumeAt === null) return null;

  // The loop is the more specific thing to resume, so it names the offer
  // when both are stored.
  const text = loop
    ? `Retomar el loop anterior ${formatTime(loop.start, duration)}–${formatTime(loop.end, duration)}`
    : `Continuar desde ${formatTime(resumeAt as number, duration)}`;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.text}>{text}</span>
      <button type="button" className={styles.accept} onClick={onAccept}>
        {loop ? "Retomar" : "Continuar"}
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
