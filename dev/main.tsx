import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import danceLocal from "../src/mock/dance-local.json";
import { Player } from "../src/index";
import type { AivpTheme, VideoPayload } from "../src/index";

const video = danceLocal as VideoPayload;

/**
 * Dev-only chrome. Collapsed to a dot in the corner so the bench shows the
 * video and nothing else, and gone entirely once the player fills the screen.
 */
function BenchTools({
  theme,
  onTheme,
}: {
  theme: AivpTheme;
  onTheme: (t: AivpTheme) => void;
}) {
  const [open, setOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    // Native fullscreen fires an event; theater mode is a CSS class on .root,
    // so it needs watching. Both mean "the player owns the screen now".
    const sync = () => {
      const theater = document.querySelector('[class*="theater"]') !== null;
      setImmersive(document.fullscreenElement !== null || theater);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (immersive) setOpen(false);
  }, [immersive]);

  return (
    <div className="bench-tools" hidden={immersive}>
      <div className="bench-panel" hidden={!open}>
        {(["pluranza", "aivp"] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={theme === t}
            onClick={() => onTheme(t)}
          >
            {t === "pluranza" ? "Pluranza" : "AIVP original"}
          </button>
        ))}
        <a href="./styleguide/">Sistema →</a>
      </div>
      <button
        type="button"
        className="bench-toggle"
        aria-expanded={open}
        aria-label={open ? "Ocultar herramientas" : "Mostrar herramientas"}
        title="Herramientas de desarrollo"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "×" : "⚙"}
      </button>
    </div>
  );
}

function Bench() {
  const [theme, setTheme] = useState<AivpTheme>("pluranza");
  return (
    <>
      <BenchTools theme={theme} onTheme={setTheme} />
      <Player initialVideo={video} theme={theme} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Bench />);
