import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./PipButton.module.css";

export function PipButton({
  videoRef,
}: {
  videoRef: RefObject<HTMLVideoElement>;
}) {
  const enabled = usePlayerState((s) => s.video?.features.pip ?? false);
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    setSupported(
      typeof document !== "undefined" &&
        Boolean(document.pictureInPictureEnabled),
    );
    const sync = () => {
      setOn(document.pictureInPictureElement === videoRef.current);
    };
    const el = videoRef.current;
    el?.addEventListener("enterpictureinpicture", sync);
    el?.addEventListener("leavepictureinpicture", sync);
    document.addEventListener("enterpictureinpicture", sync);
    document.addEventListener("leavepictureinpicture", sync);
    return () => {
      el?.removeEventListener("enterpictureinpicture", sync);
      el?.removeEventListener("leavepictureinpicture", sync);
      document.removeEventListener("enterpictureinpicture", sync);
      document.removeEventListener("leavepictureinpicture", sync);
    };
  }, [videoRef]);

  if (!enabled || !supported) return null;

  return (
    <button
      type="button"
      className={styles.btn}
      aria-label={on ? "Salir de imagen en imagen" : "Imagen en imagen"}
      title={on ? "Salir de imagen en imagen" : "Imagen en imagen"}
      aria-pressed={on}
      onClick={() => {
        const video = videoRef.current;
        if (!video) return;
        if (document.pictureInPictureElement) {
          void document.exitPictureInPicture();
          return;
        }
        void video.requestPictureInPicture();
      }}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19 7h-8v6h8V7zm4-4H1v18h22V3zm-2 16H3V5h18v14z" />
      </svg>
    </button>
  );
}
