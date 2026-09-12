import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./PlayPauseButton.module.css";

export function PlayPauseButton() {
  const status = usePlayerState((s) => s.status);
  const togglePlay = usePlayerState((s) => s.togglePlay);
  const playing = status === "playing";

  return (
    <button
      type="button"
      className={styles.btn}
      aria-label={playing ? "Pausar" : "Reproducir"}
      title={playing ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
      onClick={() => togglePlay()}
    >
      {playing ? (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
        </svg>
      ) : (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  );
}
