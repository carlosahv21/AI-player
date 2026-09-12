/*
 * Reproduces exactly what the WordPress plugin prints: AIVP_CONFIG before the
 * bundle, then containers carrying data-aivp-video (and optionally
 * data-aivp-theme). Proves the precedence chain without a PHP runtime.
 */
import danceLocal from "../../src/mock/dance-local.json";
import { Player } from "../../src/index";
import type { AivpTheme, VideoPayload } from "../../src/index";
import { createRoot } from "react-dom/client";

// what PlayerAssets::enqueue() emits
window.AIVP_CONFIG = { theme: "pluranza" } as typeof window.AIVP_CONFIG;

const video = danceLocal as VideoPayload;
const VALID = ["pluranza", "aivp"];

document.querySelectorAll<HTMLElement>("[data-aivp-video]").forEach((el) => {
  const requested = el.dataset.aivpTheme ?? window.AIVP_CONFIG?.theme;
  const theme = (
    VALID.includes(requested ?? "") ? requested : undefined
  ) as AivpTheme | undefined;
  createRoot(el).render(<Player initialVideo={video} theme={theme} />);
});
