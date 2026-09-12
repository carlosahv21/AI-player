import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { Player } from "./ui/Player";
import type { AivpTheme } from "./ui/Player";

export interface MountOptions {
  videoId: number;
  restUrl: string;
  /** Token set to paint with. Defaults to the brand theme. */
  theme?: AivpTheme;
}

export interface Instance {
  element: HTMLElement;
  unmount: () => void;
}

/** Printed by the plugin before the bundle. Never carries credentials. */
export interface AivpConfig {
  restUrl?: string;
  /** Where analytics batches go; the player does not care who serves it. */
  eventsUrl?: string;
  analyticsEnabled?: boolean;
  /** WP user id, or null for anonymous. Never a name or an email. */
  currentUserId?: number | null;
  /** Site-wide default theme. A per-mount data-aivp-theme overrides it. */
  theme?: AivpTheme;
}

declare global {
  interface Window {
    AIVP?: AivpGlobal;
    AIVP_CONFIG?: AivpConfig;
  }
}

export interface AivpGlobal {
  mount: (element: HTMLElement, options: MountOptions) => Instance;
  unmount: (element: HTMLElement) => void;
  version: string;
}

// one root per container, so unmount() can find what to tear down
const roots = new Map<HTMLElement, Root>();

export function mount(element: HTMLElement, options: MountOptions): Instance {
  // remounting the same node would orphan the previous root and its engine
  unmount(element);

  const root = createRoot(element);
  roots.set(element, root);
  // ponytail: no StrictMode, its double-invoked effects would build and tear
  // down a second hls.js instance per mount
  root.render(
    <Player
      videoId={options.videoId}
      restUrl={options.restUrl}
      theme={options.theme}
    />,
  );

  return {
    element,
    unmount: () => unmount(element),
  };
}

export function unmount(element: HTMLElement): void {
  const root = roots.get(element);
  if (!root) return;
  roots.delete(element);
  // Player's cleanup runs here: VideoEngine.detach() destroys hls.js,
  // cancels the frame callback and unbinds every media listener
  root.unmount();
}

function readMountOptions(element: HTMLElement): MountOptions | null {
  const videoId = Number(element.dataset.aivpVideo);
  if (!Number.isInteger(videoId) || videoId <= 0) return null;

  const restUrl = element.dataset.aivpRest ?? window.AIVP_CONFIG?.restUrl;
  if (!restUrl) return null;

  // data-aivp-theme on the mount node wins; anything unknown falls back to the
  // default rather than painting a player with no tokens at all.
  const requested = element.dataset.aivpTheme ?? window.AIVP_CONFIG?.theme;
  const theme: AivpTheme | undefined =
    requested === "aivp" || requested === "pluranza" ? requested : undefined;

  return { videoId, restUrl, theme };
}

/** Mounts every [data-aivp-video] not already mounted. */
export function mountAll(root: ParentNode = document): void {
  const nodes = root.querySelectorAll<HTMLElement>("[data-aivp-video]");
  nodes.forEach((element) => {
    if (roots.has(element)) return;
    const options = readMountOptions(element);
    if (!options) return;
    mount(element, options);
  });
}

export function autoMount(): void {
  if (typeof document === "undefined") return;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mountAll(), {
      once: true,
    });
    return;
  }
  mountAll();
}
