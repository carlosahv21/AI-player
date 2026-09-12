import { usePlayerState } from "./hooks/usePlayerState";
import { useCast } from "./hooks/useCast";
import styles from "./CastButton.module.css";

/**
 * Sends the video to a TV. Rendered only where the browser exposes the
 * capability, so there is never a button that cannot do anything.
 *
 * Disabled while a loop is active, on purpose. Once playback moves to the
 * receiver the frame is no longer rendered here, so mirror, precise looping
 * and fine speed control all stop working. Clearing the user's loop silently
 * would throw away their work, so the button explains itself and waits.
 */
export function CastButton({ video }: { video: HTMLVideoElement | null }) {
  const { kind, active, start } = useCast(video);
  const loop = usePlayerState((s) => s.loop);

  if (!kind) return null;

  const blocked = loop !== null;
  const label = kind === "airplay" ? "Enviar por AirPlay" : "Enviar al televisor";

  return (
    <button
      type="button"
      className={styles.btn}
      aria-label={label}
      aria-pressed={active}
      disabled={blocked}
      title={
        blocked
          ? "Quita el loop para enviar al televisor: en el televisor no funcionan el loop ni el espejo"
          : label
      }
      onClick={start}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-4" />
        <path d="M3 12a6 6 0 0 1 6 6" />
        <path d="M3 16a3 3 0 0 1 3 3" />
        <circle cx="3.5" cy="19.5" r="0.6" fill="currentColor" />
      </svg>
    </button>
  );
}
