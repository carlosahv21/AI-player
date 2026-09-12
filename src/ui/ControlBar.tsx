import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { usePlayerState } from "./hooks/usePlayerState";
import { FullscreenButton } from "./FullscreenButton";
import { CastButton } from "./CastButton";
import { PipButton } from "./PipButton";
import { PlayPauseButton } from "./PlayPauseButton";
import { PracticeControls } from "./PracticeControls";
import { ProgressBar } from "./ProgressBar";
import { QualityMenu } from "./QualityMenu";
import { CenterControls } from "./CenterControls";
import { SectionList } from "./SectionList";
import { SettingsMenu } from "./SettingsMenu";
import { TitleBar } from "./TitleBar";
import { SpeedControl } from "./SpeedControl";
import { LoopPanel } from "./LoopPanel";
import { SpeedPanel } from "./SpeedPanel";
import { TimeDisplay } from "./TimeDisplay";
import { VolumeControl } from "./VolumeControl";
import styles from "./ControlBar.module.css";
import type { Section } from "../core/types";

const EMPTY_SECTIONS: readonly Section[] = [];

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

/**
 * Layout keys off available height, not just width: a phone in landscape is
 * wide but ~400px tall, where a stacked bar leaves no room for the video.
 */
function useLayout(): "compact" | "rail" | "full" {
  const narrow = useMediaQuery("(max-width: 639px)");
  const short = useMediaQuery("(max-height: 480px)");
  if (short) return "rail";
  return narrow ? "compact" : "full";
}

export function ControlBar({
  rootRef,
  videoRef,
  hover = false,
  loopDraft = null,
}: {
  rootRef: RefObject<HTMLDivElement>;
  videoRef: RefObject<HTMLVideoElement>;
  hover?: boolean;
  loopDraft?: number | null;
}) {
  const layout = useLayout();
  const status = usePlayerState((s) => s.status);
  const sections = usePlayerState((s) => s.video?.sections ?? EMPTY_SECTIONS);
  const activeSectionId = usePlayerState((s) => s.activeSectionId);
  const nextSection = usePlayerState((s) => s.nextSection);
  const seekBy = usePlayerState((s) => s.seekBy);
  const previousSection = usePlayerState((s) => s.previousSection);
  const perspective = usePlayerState((s) => s.perspective);
  const playbackRate = usePlayerState((s) => s.playbackRate);
  const setPerspective = usePlayerState((s) => s.setPerspective);
  const hasBack = usePlayerState(
    (s) => Boolean(s.video?.sources.back) && Boolean(s.video?.features.frontBack),
  );

  const [sheet, setSheet] = useState(false);
  const [onBar, setOnBar] = useState(false);
  const [panel, setPanel] = useState(false);
  const [speed, setSpeed] = useState(false);
  const [loopPanel, setLoopPanel] = useState(false);
  // ponytail: the timeline tooltip sits right over the practice row, so that
  // row dims while scrubbing instead of either one moving somewhere worse
  const [scrubbing, setScrubbing] = useState(false);

  const sectionIndex = sections.findIndex((x) => x.id === activeSectionId);
  const section = sectionIndex >= 0 ? sections[sectionIndex] : null;

  // ponytail: only hide while actually playing, any other state keeps controls up
  const modal = speed || loopPanel;
  const visible =
    !modal && (hover || sheet || panel || onBar || status !== "playing");

  useEffect(() => {
    if (!speed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSpeed(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [speed]);

  /*
   * ponytail: playback starting means the user wants the frame, not the panel.
   *
   * The loop panel is excluded. It seeks while a handle is dragged so the
   * edge frame is visible, and it now decides for itself when to close
   * (picking a section closes; trimming an edge does not). Leaving it in here
   * meant every handle drag closed the panel mid-adjustment, which is exactly
   * what the trim flow exists to avoid.
   */
  useEffect(() => {
    if (status !== "playing") return;
    setSpeed(false);
  }, [status]);

  useEffect(() => {
    if (layout !== "compact") setSheet(false);
    if (layout !== "rail") setPanel(false);
    setSpeed(false);
    setLoopPanel(false);
  }, [layout]);

  const backButton = hasBack ? (
    <button
      type="button"
      className={styles.chromeBtn}
      aria-label={perspective === "back" ? "Ver de frente" : "Ver de espaldas"}
      title={perspective === "back" ? "Ver de frente" : "Ver de espaldas"}
      aria-pressed={perspective === "back"}
      onClick={() => setPerspective(perspective === "back" ? "front" : "back")}
    >
      {perspective === "back" ? "Espalda" : "Frente"}
    </button>
  ) : null;

  const sectionNav = section ? (
    <div className={styles.sections}>
      <button
        type="button"
        className={styles.sectionNav}
        aria-label="Sección anterior"
        title="Sección anterior (,)"
        disabled={sectionIndex <= 0}
        onClick={() => previousSection()}
      >
        ‹
      </button>
      <span className={styles.sectionName}>{section.name}</span>
      <button
        type="button"
        className={styles.sectionNav}
        aria-label="Sección siguiente"
        title="Sección siguiente (.)"
        disabled={sectionIndex >= sections.length - 1}
        onClick={() => nextSection()}
      >
        ›
      </button>
    </div>
  ) : null;

  return (
    <>
      {layout === "full" ? (
        <>
          <div className={visible ? undefined : styles.hidden}>
            <TitleBar align="left" />
          </div>
          <div
            className={`${styles.practiceRow} ${
              visible ? styles.practiceRowOn : ""
            } ${scrubbing ? styles.practiceRowDim : ""}`}
            onPointerEnter={() => setOnBar(true)}
            onPointerLeave={() => setOnBar(false)}
          >
            <PracticeControls
              labelled
              onOpenLoop={() => setLoopPanel(true)}
            />
            <button
              type="button"
              className={styles.practiceItem}
              aria-label={`Velocidad ${playbackRate}x`}
              title="Velocidad"
              aria-pressed={playbackRate !== 1}
              onClick={() => setSpeed(true)}
            >
              <svg className={styles.practiceIcon} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 21a9 9 0 1 1 9-9" />
                <path d="M12 12l4-3" />
              </svg>
              <span className={styles.practiceLabel}>
                Velocidad
                <b>{playbackRate}x</b>
              </span>
            </button>
          </div>
        </>
      ) : null}

      {/* landscape: rails and centre transport keep the frame clear */}
      {layout === "rail" ? (
        <>
          <div className={visible ? undefined : styles.hidden}>
            <TitleBar />
          </div>
          <div className={visible ? undefined : styles.hidden}>
            <CenterControls />
          </div>
          {/* the settings FAB lives in the bar, which the modal hides */}
          {sections.length > 0 ? (
            <div
              className={`${styles.railLeft} ${visible ? styles.railVisible : ""}`}
              onPointerEnter={() => setOnBar(true)}
              onPointerLeave={() => setOnBar(false)}
            >
              <SectionList />
            </div>
          ) : null}
        </>
      ) : null}

      <div
        className={`${styles.bar} ${styles[layout]} ${
          visible ? styles.barVisible : ""
        }`}
        onPointerEnter={() => setOnBar(true)}
        onPointerLeave={() => setOnBar(false)}
      >
        <div className={styles.progress}>
          <ProgressBar loopDraft={loopDraft} onScrubbing={setScrubbing} />
        </div>

        <div className={styles.left}>
          {layout !== "rail" ? <PlayPauseButton /> : null}
          {layout !== "rail" ? (
            <>
          <button
            type="button"
            className={styles.seekBtn}
            aria-label="Retroceder 10 segundos"
            title="Retroceder 10 s (←)"
            onClick={() => seekBy(-10)}
          >
            {/* lucide: rotate-ccw */}
            <svg className={styles.seekIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span className={styles.seekNum}>10</span>
          </button>
          <button
            type="button"
            className={styles.seekBtn}
            aria-label="Adelantar 10 segundos"
            title="Adelantar 10 s (→)"
            onClick={() => seekBy(10)}
          >
            {/* lucide: rotate-cw */}
            <svg className={styles.seekIcon} viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            <span className={styles.seekNum}>10</span>
          </button>
          </>
          ) : null}
          {layout === "full" ? sectionNav : null}
          <TimeDisplay />
        </div>

        <div className={styles.practice} />

        <div className={styles.chrome}>
          {layout === "full" ? (
            <>
              {backButton}
              <VolumeControl />
              <QualityMenu />
              <CastButton video={videoRef.current} />
              <PipButton videoRef={videoRef} />
            </>
          ) : null}
          {layout === "rail" ? (
            <SettingsMenu
              rootRef={rootRef}
              onOpenChange={setPanel}
              onOpenSpeed={() => setSpeed(true)}
              onOpenLoop={() => setLoopPanel(true)}
            />
          ) : (
            <FullscreenButton rootRef={rootRef} />
          )}
          {layout === "compact" ? (
            <button
              type="button"
              className={styles.more}
              aria-label="Más controles"
              title="Más controles"
              aria-expanded={sheet}
              onClick={() => setSheet(true)}
            >
              ⋯
            </button>
          ) : null}
        </div>
      </div>

      {speed ? <SpeedPanel onClose={() => setSpeed(false)} /> : null}
      {loopPanel ? <LoopPanel onClose={() => setLoopPanel(false)} /> : null}

      {/* portrait: a sheet that leaves the video visible above it */}
      {sheet ? (
        <div className={styles.sheetWrap}>
          <button
            type="button"
            className={styles.backdrop}
            aria-label="Cerrar controles"
            title="Cerrar controles"
            onClick={() => setSheet(false)}
          />
          <div className={styles.sheet} role="dialog" aria-label="Controles">
            <div className={styles.grabber} aria-hidden="true" />
            {sectionNav ? (
              <div className={styles.sheetRow}>
                <span className={styles.sheetLabel}>Sección</span>
                {sectionNav}
              </div>
            ) : null}
            <div className={styles.sheetRow}>
              <span className={styles.sheetLabel}>Velocidad</span>
              <SpeedControl />
            </div>
            <div className={styles.sheetRow}>
              <span className={styles.sheetLabel}>Práctica</span>
              <PracticeControls />
            </div>
            <div className={styles.sheetRow}>
              <span className={styles.sheetLabel}>Volumen</span>
              <VolumeControl />
            </div>
            <div className={`${styles.sheetRow} ${styles.sheetChrome}`}>
              {backButton}
              <QualityMenu />
              <PipButton videoRef={videoRef} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
