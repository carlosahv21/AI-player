import Hls from "hls.js";
import type { Perspective, VideoPayload } from "../core/types";

export const HLS_MIME = "application/vnd.apple.mpegurl";

export type LoadMode = "hls.js" | "native-hls" | "mp4" | "unsupported";

export function resolveUrls(
  payload: VideoPayload,
  perspective: Perspective,
): { hls: string | null; mp4: string | null } {
  const back = payload.sources.back;
  if (perspective === "back" && back) {
    return { hls: back.hls, mp4: back.mp4 };
  }
  return { hls: payload.sources.hls, mp4: payload.sources.mp4 };
}

export function detectLoadMode(
  element: HTMLVideoElement,
  hlsUrl: string | null,
  mp4Url: string | null,
): LoadMode {
  if (hlsUrl && Hls.isSupported()) return "hls.js";
  if (hlsUrl && element.canPlayType(HLS_MIME)) return "native-hls";
  if (mp4Url) return "mp4";
  return "unsupported";
}

export function createHlsInstance(): Hls {
  return new Hls({
    enableWorker: true,
    lowLatencyMode: false,
  });
}
