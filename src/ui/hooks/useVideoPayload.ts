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
 *
 * Bad samples are repaired in place and logged, never in silence. Only when
 * more than half the array is unusable is the whole curve discarded — at that
 * point it would be a shape drawn from a minority of the measurements.
 *
 * Repaired in place, NOT filtered out: a sample's X coordinate is its index
 * (`heatArea` spreads the array evenly across the width), so removing one
 * shifts every sample after it to the left. Measured on a 101-bucket curve
 * with ten bad values at the head: peaks authored at 25/50/75% were drawn at
 * 16.7/44.4/72.2%. The array's LENGTH is what anchors the time axis, so it is
 * preserved and only the values are mended.
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
  const parsed = (raw as unknown[]).map((v) => {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return NaN;
  });
  const valid = parsed.filter(Number.isFinite);
  const dropped = parsed.length - valid.length;

  // Partial damage keeps the good samples. One bad value used to void the
  // whole curve with nothing logged — the worst of both, since the data was
  // gone AND nobody knew why. The curve is relative interest, so losing a few
  // buckets skews its shape slightly; losing all of it hides a real signal.
  if (dropped > 0 && valid.length >= 2 && dropped <= parsed.length / 2) {
    console.warn(
      `[aivp] video ${payload.id}: ${dropped} de ${parsed.length} muestras del ` +
        `heatmap no son números finitos. Se interpolan en su posición para no ` +
        `desplazar la curva; revisa el origen de los datos.`,
    );
  }

  // More than half bad is not damage to work around, it is the wrong data.
  // Interpolating a curve from a minority of the buckets would draw a shape
  // nobody measured, so the field goes and the component renders nothing.
  if (dropped > parsed.length / 2) {
    console.error(
      `[aivp] video ${payload.id}: ${dropped} de ${parsed.length} muestras del ` +
        `heatmap son inválidas (más de la mitad). Se descarta la curva entera.`,
    );
    return { ...payload, heatmap: null };
  }

  // fewer than two points cannot describe a curve; drop the field entirely so
  // the component's own guard skips rendering instead of drawing a flat line
  if (valid.length < 2) {
    if (parsed.length >= 2) {
      console.error(
        `[aivp] video ${payload.id}: el heatmap queda con ${valid.length} muestra(s) ` +
          `válida(s), insuficientes para una curva. Se descarta.`,
      );
    }
    return { ...payload, heatmap: null };
  }

  const mended = mendInPlace(parsed);
  const peak = Math.max(...mended);
  const heatmap =
    peak > 0 ? mended.map((n) => Math.max(0, n) / peak) : mended.map(() => 0);

  return { ...payload, heatmap };
}

/**
 * Fills each non-finite slot from its nearest good neighbours, keeping the
 * array's length — and therefore every sample's position on the time axis.
 *
 * A run of holes is bridged linearly between the values on either side, and a
 * run at either end takes the nearest good value flat. Interpolating rather
 * than zeroing because a zero is a claim — "nobody watched this part" — that
 * a missing sample does not support; carrying the neighbours across says only
 * "no measurement here", which is what actually happened.
 */
function mendInPlace(parsed: readonly number[]): number[] {
  const out = [...parsed];
  for (let i = 0; i < out.length; i += 1) {
    if (Number.isFinite(out[i])) continue;

    let end = i;
    while (end < out.length && !Number.isFinite(out[end])) end += 1;

    const before = i > 0 ? out[i - 1] : undefined;
    const after = end < out.length ? out[end] : undefined;
    const span = end - i + 1;

    for (let j = i; j < end; j += 1) {
      if (before === undefined) out[j] = after!;
      else if (after === undefined) out[j] = before;
      else out[j] = before + ((after - before) * (j - i + 1)) / span;
    }
    i = end - 1;
  }
  return out;
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
