import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerStoreInstance } from "../../core/store";
import type { VideoPayload } from "../../core/types";

export interface RemoteSource {
  videoId: number;
  restUrl: string;
}

const FETCH_ERROR = {
  code: "PAYLOAD_FETCH_FAILED",
  message: "No se pudo cargar la información del video. Inténtalo de nuevo.",
};

/**
 * Normalises the heatmap samples coming off the wire.
 *
 * The curve is built straight into an SVG path, so one non-finite value would
 * put `NaN` in the `d` attribute and silently blank the whole shape. WordPress
 * sends counts as JSON numbers but a filter, a stale cache or a hand-edited
 * meta can put strings or nulls in the array, so it is scrubbed here at the
 * trust boundary rather than trusted down to the renderer.
 *
 * Samples are scaled to 0..1 against the array's own peak: the aggregator
 * counts sessions per bucket, and what the curve shows is relative interest,
 * not an absolute session count.
 */
export function sanitizeHeatmap(payload: VideoPayload): VideoPayload {
  const raw = payload.heatmap;
  if (!Array.isArray(raw)) return payload;

  // Number() alone is not the filter: `Number(null)` and `Number("")` are 0,
  // which is finite, so a hole in the data would survive as a fake valley
  // instead of being dropped. Only actual numbers and non-blank numeric
  // strings become samples.
  // typed as unknown[] on purpose: the declared number[] is what the contract
  // promises, not what a filter or a hand-edited meta can actually send
  const nums = (raw as unknown[])
    .map((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() !== "") return Number(v);
      return NaN;
    })
    .filter(Number.isFinite);
  // fewer than two points cannot describe a curve; drop the field entirely so
  // the component's own guard skips rendering instead of drawing a flat line
  if (nums.length < 2) return { ...payload, heatmap: null };

  const peak = Math.max(...nums);
  const heatmap =
    peak > 0 ? nums.map((n) => Math.max(0, n) / peak) : nums.map(() => 0);

  return { ...payload, heatmap };
}

/**
 * Fetches `${restUrl}/video/${videoId}` into the given store instance.
 * Loading and failure both surface through the store, so the player shows
 * its own busy and error overlays instead of a second set of screens.
 * Returns a retry that re-runs the request.
 */
export function useVideoPayload(
  instance: PlayerStoreInstance,
  source: RemoteSource | undefined,
): () => void {
  const [attempt, setAttempt] = useState(0);
  // ponytail: a ref, so a late response from a superseded request is dropped
  const runId = useRef(0);

  useEffect(() => {
    if (!source) return;
    const { videoId, restUrl } = source;
    const id = ++runId.current;
    const controller = new AbortController();
    const { actions } = instance.playerStore;

    // ponytail: set directly, _onStatusChange is guarded on a loaded video
    // and the very first fetch runs before there is one
    instance.useStore.setState({ status: "loading", error: null });

    const url = `${restUrl.replace(/\/$/, "")}/video/${videoId}`;
    fetch(url, { signal: controller.signal, credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<VideoPayload>;
      })
      .then((payload) => {
        if (id !== runId.current) return;
        actions.loadVideo(sanitizeHeatmap(payload));
      })
      .catch((error: unknown) => {
        if (id !== runId.current) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        actions.setError(FETCH_ERROR);
      });

    return () => controller.abort();
  }, [instance, source?.videoId, source?.restUrl, attempt]);

  return useCallback(() => setAttempt((n) => n + 1), []);
}
