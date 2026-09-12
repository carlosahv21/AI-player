import { forwardRef, useEffect, useRef, useState } from "react";
import { useRetryLoad, usePlayerState } from "./hooks/usePlayerState";
import { useVideoGestures } from "./hooks/useVideoGestures";
import styles from "./VideoSurface.module.css";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => setMatches(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [query]);
  return matches;
}

export const VideoSurface = forwardRef<HTMLVideoElement>(
  function VideoSurface(_, ref) {
    const mirrored = usePlayerState((s) => s.mirrored);
    const status = usePlayerState((s) => s.status);
    const error = usePlayerState((s) => s.error);
    const poster = usePlayerState((s) => s.video?.poster ?? undefined);

    const togglePlay = usePlayerState((s) => s.togglePlay);
    const hasVideo = usePlayerState((s) => Boolean(s.video));
    const seekBy = usePlayerState((s) => s.seekBy);
    // only for undoing a double-tap's already-fired toggle; see useVideoGestures
    const play = usePlayerState((s) => s.play);
    const pause = usePlayerState((s) => s.pause);
    const playbackRate = usePlayerState((s) => s.playbackRate);
    const setPlaybackRate = usePlayerState((s) => s.setPlaybackRate);
    const retryLoad = useRetryLoad();


    const showError = status === "error" || error !== null;

    // coarse pointer: double-tap-to-seek zones only make sense with a finger
    const touch = useMediaQuery("(pointer: coarse)");
    const gestures = useVideoGestures({
      touch,
      enabled: !showError && hasVideo,
      status,
      playbackRate,
      togglePlay: () => toggleRef.current(),
      play,
      pause,
      seekBy,
      setPlaybackRate,
    });
    // `toggle` is defined below and re-created each render; the ref keeps the
    // gesture hook pointing at the current one without re-subscribing
    const toggleRef = useRef(() => {});
    const showBusy = !showError && status === "loading";
    // ponytail: key forces a fresh node so the CSS animation replays every toggle
    const [pulse, setPulse] = useState<{ key: number; playing: boolean } | null>(
      null,
    );
    const pulseKey = useRef(0);

    // the pulse owns the centre while it runs, or both icons show at once
    // paused frame reads better under a light scrim, controls gain contrast
    const dimmed = !showError && hasVideo && status !== "playing" && !showBusy;

    // ponytail: the landscape rail draws its own centre play button
    const compactPlay = !useMediaQuery("(max-height: 480px)");

    const showPlay =
      !showError &&
      !showBusy &&
      hasVideo &&
      status !== "playing" &&
      pulse === null &&
      compactPlay;

    const toggle = () => {
      if (showError || !hasVideo) return;
      pulseKey.current += 1;
      setPulse({ key: pulseKey.current, playing: status !== "playing" });
      togglePlay();
    };
    toggleRef.current = toggle;

    return (
      <div
        className={styles.surface}
        role={compactPlay ? "button" : undefined}
        tabIndex={compactPlay && !showError && hasVideo ? 0 : -1}
        aria-label={
          compactPlay
            ? status === "playing"
              ? "Pausar"
              : "Reproducir"
            : undefined
        }
        {...gestures.handlers}
        onKeyDown={(e) => {
          // ponytail: Space is already bound globally in Player
          if (e.key !== "Enter") return;
          e.preventDefault();
          toggle();
        }}
      >
        <video
          ref={ref}
          className={`${styles.video} ${mirrored ? styles.mirrored : ""}`}
          poster={poster ?? undefined}
          playsInline
          controls={false}
          preload="metadata"
        />
        {showPlay ? (
          <div className={styles.bigPlay} aria-hidden="true">
            <svg className={styles.bigPlayIcon} viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        ) : null}
        {dimmed ? <div className={styles.dim} aria-hidden="true" /> : null}
        {pulse ? (
          <div
            key={pulse.key}
            className={styles.pulse}
            aria-hidden="true"
            onAnimationEnd={() => setPulse(null)}
          >
            <svg className={styles.pulseIcon} viewBox="0 0 24 24">
              {pulse.playing ? (
                <path d="M8 5v14l11-7z" />
              ) : (
                <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
              )}
            </svg>
          </div>
        ) : null}
        {/* which way the double tap jumped, and by how much */}
        {gestures.flash ? (
          <div
            key={gestures.flash.key}
            className={`${styles.seekFlash} ${
              gestures.flash.dir === "back" ? styles.seekBack : styles.seekForward
            }`}
            aria-hidden="true"
            onAnimationEnd={gestures.clearFlash}
          >
            <svg className={styles.seekIcon} viewBox="0 0 24 24">
              {gestures.flash.dir === "back" ? (
                <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
              ) : (
                <path d="M13 6v12l8.5-6L13 6zm-.5 6L4 6v12l8.5-6z" />
              )}
            </svg>
            <span className={styles.seekLabel}>
              {gestures.flash.seconds}s
            </span>
          </div>
        ) : null}

        {/* press-and-hold: the rate is transient, so it says so out loud */}
        {gestures.holdRate !== null ? (
          <div className={styles.holdBadge} role="status">
            <span className={styles.holdRate}>{gestures.holdRate}x</span>
            <span className={styles.holdHint}>Arrastra para más velocidad</span>
          </div>
        ) : null}

        {showBusy ? (
          <div className={`${styles.overlay} ${styles.overlayBusy}`}>
            <p className={styles.message}>Cargando video…</p>
          </div>
        ) : null}
        {showError ? (
          <div className={styles.overlay} role="alert">
            <p className={styles.message}>
              {error?.message ??
                "No se pudo reproducir el video. Inténtalo de nuevo."}
            </p>
            <button type="button" className={styles.retry} onClick={retryLoad}>
              Reintentar
            </button>
          </div>
        ) : null}
      </div>
    );
  },
);
