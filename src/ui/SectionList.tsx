import { useEffect, useRef, useState } from "react";
import { formatTime } from "./formatTime";
import { usePlayerState } from "./hooks/usePlayerState";
import styles from "./SectionList.module.css";
import type { Section } from "../core/types";

const EMPTY_SECTIONS: readonly Section[] = [];

/**
 * Landscape rail: section number as a heading, its steps as buttons below.
 * Scrolls with touch; the arrows are for pointer users with no wheel.
 */
export function SectionList() {
  const sections = usePlayerState((s) => s.video?.sections ?? EMPTY_SECTIONS);
  const activeSectionId = usePlayerState((s) => s.activeSectionId);
  const currentTime = usePlayerState((s) => s.currentTime);
  const duration = usePlayerState((s) => s.duration);
  const seek = usePlayerState((s) => s.seek);
  const goToSection = usePlayerState((s) => s.goToSection);

  const listRef = useRef<HTMLDivElement>(null);
  // ponytail: an arrow only exists while there is somewhere to go
  const [edges, setEdges] = useState({ up: false, down: false });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const check = () => {
      const room = el.scrollHeight - el.clientHeight;
      setEdges({
        up: el.scrollTop > 2,
        down: room > 2 && el.scrollTop < room - 2,
      });
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, [sections]);

  if (sections.length === 0) return null;

  const scrollBy = (dy: number) =>
    listRef.current?.scrollBy({ top: dy, behavior: "smooth" });

  // ponytail: SVG, not glyphs, U+2303/2304 fall back to different fonts
  const Chevron = ({ up }: { up: boolean }) => (
    <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={`${styles.arrow} ${edges.up ? "" : styles.arrowOff}`}
        aria-label="Subir"
        title="Subir"
        tabIndex={edges.up ? 0 : -1}
        aria-hidden={!edges.up}
        onClick={() => scrollBy(-120)}
      >
        <Chevron up />
      </button>

      <div className={styles.list} ref={listRef} role="navigation" aria-label="Secciones">
        {sections.map((section, i) => {
          const active = section.id === activeSectionId;
          return (
            <div key={section.id} className={styles.group}>
              <button
                type="button"
                className={styles.heading}
                aria-current={active ? "true" : undefined}
                title={`${section.name} · ${formatTime(section.start, duration)}`}
                onClick={() => goToSection(section.id)}
              >
                <span className={styles.num}>Sección {i + 1}</span>
                <span className={styles.name}>{section.name}</span>
              </button>

              {section.steps?.length ? (
                <div className={styles.steps}>
                  {section.steps.map((step) => {
                    const on =
                      currentTime >= step.start && currentTime < step.end;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        className={styles.step}
                        aria-current={on ? "true" : undefined}
                        title={`${step.name} · ${formatTime(step.start, duration)}`}
                        onClick={() => seek(step.start)}
                      >
                        <span className={styles.stepName}>{step.name}</span>
                        <span className={styles.stepTime}>
                          {formatTime(step.start, duration)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className={`${styles.arrow} ${edges.down ? "" : styles.arrowOff}`}
        aria-label="Bajar"
        title="Bajar"
        tabIndex={edges.down ? 0 : -1}
        aria-hidden={!edges.down}
        onClick={() => scrollBy(120)}
      >
        <Chevron up={false} />
      </button>
    </div>
  );
}
