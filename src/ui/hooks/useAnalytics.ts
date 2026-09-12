import { useEffect } from "react";
import { createTracker } from "../../analytics/tracker";
import type { PlayerStoreInstance } from "../../core/store";

/**
 * Wires analytics to one player instance for as long as it is mounted.
 *
 * Reads its settings from window.AIVP_CONFIG, which the plugin prints before
 * the bundle. The player never learns who serves the ingest endpoint: that is
 * the whole point of taking the URL from config.
 */
export function useAnalytics(
  instance: PlayerStoreInstance,
  version: string,
): void {
  useEffect(() => {
    const config = typeof window === "undefined" ? undefined : window.AIVP_CONFIG;
    // no config means no analytics; a missing flag defaults to off
    if (!config?.eventsUrl || config.analyticsEnabled !== true) return;

    const tracker = createTracker({
      eventsUrl: config.eventsUrl,
      userId: typeof config.currentUserId === "number" ? config.currentUserId : null,
      playerVersion: version,
      enabled: true,
    });
    if (!tracker) return;

    return tracker.attach(instance.playerStore);
  }, [instance, version]);
}
