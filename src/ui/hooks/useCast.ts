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

    // --- Google Cast (Chrome). Only report it when the framework is already
    // loaded by the host page: the player does not pull in the SDK itself.
    if (window.cast?.framework) setKind("cast");
  }, [video]);

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

  return { kind, active, start };
}
