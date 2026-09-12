import { useEffect, useRef, useState } from "react";

/**
 * Sending the video to a TV: AirPlay in Safari, Google Cast in Chrome.
 *
 * Both are exposed only when the browser actually has the capability, so the
 * button stays hidden everywhere else rather than offering something that
 * cannot work.
 */
export type CastKind = "airplay" | "cast" | null;

interface WebKitVideo extends HTMLVideoElement {
  webkitShowPlaybackTargetPicker?: () => void;
  webkitCurrentPlaybackTargetIsWireless?: boolean;
}

declare global {
  interface Window {
    WebKitPlaybackTargetAvailabilityEvent?: unknown;
    __onGCastApiAvailable?: (available: boolean) => void;
    chrome?: { cast?: unknown };
    cast?: {
      framework?: {
        CastContext: {
          getInstance: () => {
            requestSession: () => Promise<unknown>;
            getCurrentSession: () => unknown;
          };
        };
      };
    };
  }
}

export function useCast(video: HTMLVideoElement | null) {
  const [kind, setKind] = useState<CastKind>(null);
  const [active, setActive] = useState(false);
  const elRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    elRef.current = video;
    if (!video) return;

    // --- AirPlay (Safari). The route only exists once a target is on the
    // network, so the button appears when the availability event says so.
    if (typeof window.WebKitPlaybackTargetAvailabilityEvent !== "undefined") {
      const onAvailability = (e: Event) => {
        const detail = (e as Event & { availability?: string }).availability;
        setKind(detail === "available" ? "airplay" : null);
      };
      const onActive = () => {
        const el = video as WebKitVideo;
        setActive(Boolean(el.webkitCurrentPlaybackTargetIsWireless));
      };
      video.addEventListener(
        "webkitplaybacktargetavailabilitychanged",
        onAvailability,
      );
      video.addEventListener(
        "webkitcurrentplaybacktargetiswirelesschanged",
        onActive,
      );
      return () => {
        video.removeEventListener(
          "webkitplaybacktargetavailabilitychanged",
          onAvailability,
        );
        video.removeEventListener(
          "webkitcurrentplaybacktargetiswirelesschanged",
          onActive,
        );
      };
    }

    /*
     * --- Google Cast (Chrome). The player never pulls in the SDK; the host
     * page does (the WordPress plugin enqueues it).
     *
     * The SDK loads async, so it is usually absent on mount and checking
     * once would leave the button hidden for good. `__onGCastApiAvailable`
     * is the SDK's own ready callback, and it fires whenever the script
     * lands — before or after this effect runs.
     */
    if (window.cast?.framework) {
      setKind("cast");
    } else {
      const previous = window.__onGCastApiAvailable;
      window.__onGCastApiAvailable = (available: boolean) => {
        // Chain rather than replace: another player on the page may have
        // registered its own callback, and the SDK only calls one.
        previous?.(available);
        if (available && window.cast?.framework) setKind("cast");
      };
      return () => {
        window.__onGCastApiAvailable = previous;
      };
    }
  }, [video]);

  /*
   * Development flag: render the button with no device on the network, to
   * check styling. `start()` still does nothing without a real framework,
   * so this cannot fake a session.
   */
  const forced = Boolean(window.AIVP_CONFIG?.castForceButton);
  const effectiveKind: CastKind = kind ?? (forced ? "cast" : null);

  const start = () => {
    const el = elRef.current as WebKitVideo | null;
    if (kind === "airplay" && el?.webkitShowPlaybackTargetPicker) {
      el.webkitShowPlaybackTargetPicker();
      return;
    }
    if (kind === "cast" && window.cast?.framework) {
      void window.cast.framework.CastContext.getInstance().requestSession();
    }
  };

  return { kind: effectiveKind, active, start };
}
