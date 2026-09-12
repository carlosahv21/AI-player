import styles from "./CloseButton.module.css";

/**
 * The close affordance every panel shares: top-right corner, where a dialog
 * is expected to be dismissed from.
 */
export function CloseButton({
  onClose,
  label = "Cerrar",
  className,
}: {
  onClose: () => void;
  label?: string;
  /** For a panel that does not span the player: re-anchor to its corner. */
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${styles.close} ${className ?? ""}`}
      aria-label={label}
      title={label}
      onClick={onClose}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" />
      </svg>
    </button>
  );
}
