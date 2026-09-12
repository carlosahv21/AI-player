import { formatTime } from "./formatTime";
import { useCycleRepeat, usePlayerState } from "./hooks/usePlayerState";
import styles from "./PracticeControls.module.css";
import type { RepeatMode } from "../core/types";

function repeatLabel(mode: RepeatMode): string {
  if (mode === "infinite") return "∞";
  if (typeof mode === "number") return `×${mode}`;
  return "";
}

const ICONS = {
  mirror: (
    <>
      <path d="M12 3v18" />
      <path d="M9 7L4 12l5 5z" />
      <path d="M15 7l5 5-5 5z" />
    </>
  ),
  loop: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </>
  ),
};

function Icon({ paths }: { paths: keyof typeof ICONS }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[paths]}
    </svg>
  );
}

/**
 * The practice cluster: mirror, loop with repeat count, section, fine nudge.
 * `labelled` stacks a NAME / value caption under each icon, the way the
 * desktop bar shows them; the compact sheet uses bare icons.
 */
export function PracticeControls({
  labelled = false,
  onOpenLoop,
}: {
  labelled?: boolean;
  /** When given, the loop button opens the builder instead of cycling. */
  onOpenLoop?: () => void;
}) {
  const loop = usePlayerState((s) => s.loop);
  const repeatMode = usePlayerState((s) => s.repeatMode);
  const mirrored = usePlayerState((s) => s.mirrored);
  const toggleMirror = usePlayerState((s) => s.toggleMirror);
  const nudgeLoop = usePlayerState((s) => s.nudgeLoop);
  const duration = usePlayerState((s) => s.duration);
  const loopOn = usePlayerState((s) => Boolean(s.video?.features.loop));
  const mirrorOn = usePlayerState((s) => Boolean(s.video?.features.mirror));
  const cycleRepeat = useCycleRepeat();

  const cls = labelled ? `${styles.row} ${styles.labelled}` : styles.row;

  return (
    <div className={cls}>
      {mirrorOn ? (
        <button
          type="button"
          className={styles.btn}
          aria-label={mirrored ? "Quitar espejo" : "Activar espejo"}
          title={mirrored ? "Quitar espejo (E)" : "Activar espejo (E)"}
          aria-pressed={mirrored}
          onClick={() => toggleMirror()}
        >
          <Icon paths="mirror" />
          {labelled ? (
            <span className={styles.label}>
              Espejo
              <b>{mirrored ? "ON" : "OFF"}</b>
            </span>
          ) : null}
        </button>
      ) : null}

      {loopOn ? (
        <>
          {/* ponytail: one button, loop and repeat count were always coupled */}
          <button
            type="button"
            className={styles.btn}
            aria-label={
              loop ? `Loop ${repeatLabel(repeatMode)}, cambiar` : "Activar loop"
            }
            title={
              loop
                ? `Loop ${repeatLabel(repeatMode)} · clic para cambiar (L)`
                : "Activar loop (L)"
            }
            aria-pressed={Boolean(loop)}
            onClick={() => (onOpenLoop ? onOpenLoop() : cycleRepeat())}
          >
            <Icon paths="loop" />
            {loop && !labelled ? (
              <span className={styles.glyph}>{repeatLabel(repeatMode)}</span>
            ) : null}
            {labelled ? (
              <span className={styles.label}>
                Loop
                <b>
                  {loop
                    ? `${formatTime(loop.start, duration)}–${formatTime(loop.end, duration)} ${repeatLabel(repeatMode)}`
                    : "OFF"}
                </b>
              </span>
            ) : null}
          </button>

          {/* ponytail: no section button here — the loop panel and the
              landscape rail already cover jumping and repeating a section */}
          {/* ponytail: the desktop row opens the loop panel, which has its own
              fine adjust; these only exist where no panel is reachable */}
          {loop && !labelled ? (
            <div
              className={styles.nudge}
              role="group"
              aria-label="Ajuste fino del loop"
            >
              {(
                [
                  ["start", -0.5, "⟨−", "Inicio −0,5 s"],
                  ["start", 0.5, "⟨+", "Inicio +0,5 s"],
                  ["end", -0.5, "−⟩", "Fin −0,5 s"],
                  ["end", 0.5, "+⟩", "Fin +0,5 s"],
                ] as const
              ).map(([edge, delta, glyph, label]) => (
                <button
                  key={`${edge}${delta}`}
                  type="button"
                  className={styles.nudgeBtn}
                  aria-label={label}
                  title={label}
                  onClick={() => nudgeLoop(edge, delta)}
                >
                  {glyph}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
