import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { toggleFullscreen } from "./hooks/usePlayerState";
import styles from "./FullscreenButton.module.css";

export function FullscreenButton({
  rootRef,
}: {
  rootRef: RefObject<HTMLDivElement>;
}) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      setOn(
        Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null),
      );
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  return (
    <button
      type="button"
      className={styles.btn}
      aria-label={on ? "Salir de pantalla completa" : "Pantalla completa"}
      title={on ? "Salir de pantalla completa (F)" : "Pantalla completa (F)"}
      aria-pressed={on}
      onClick={() => toggleFullscreen(rootRef.current)}
    >
      {on ? (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
        </svg>
      ) : (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
        </svg>
      )}
    </button>
  );
}
