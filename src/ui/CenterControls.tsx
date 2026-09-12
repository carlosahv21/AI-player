import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./CenterControls.module.css";

/** Landscape transport: ±10s flanking play, no background plates. */
export function CenterControls() {
  const status = usePlayerState((s) => s.status);
  const togglePlay = usePlayerState((s) => s.togglePlay);
  const seekBy = usePlayerState((s) => s.seekBy);
  const playing = status === "playing";

  return (
    <div className={styles.center}>
      <button
        type="button"
        className={styles.side}
        aria-label="Retroceder 10 segundos"
        title="Retroceder 10 s (←)"
        onClick={() => seekBy(-10)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
        <span className={styles.num}>10</span>
      </button>

      <button
        type="button"
        className={styles.play}
        aria-label={playing ? "Pausar" : "Reproducir"}
        title={playing ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
        onClick={() => togglePlay()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.playIcon}>
          {playing ? (
            <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
          ) : (
            <path d="M8 5v14l11-7z" />
          )}
        </svg>
      </button>

      <button
        type="button"
        className={styles.side}
        aria-label="Adelantar 10 segundos"
        title="Adelantar 10 s (→)"
        onClick={() => seekBy(10)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        <span className={styles.num}>10</span>
      </button>
    </div>
  );
}
