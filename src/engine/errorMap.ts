import { ErrorTypes } from "hls.js";
import type { ErrorData } from "hls.js";
import type { PlayerError } from "../core/types";

const MEDIA_ERR_ABORTED = 1;
const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

export function mapMediaError(error: MediaError | null): PlayerError {
  const code = error?.code;
  if (code === MEDIA_ERR_NETWORK) {
    return {
      code: "MEDIA_ERR_NETWORK",
      message:
        "No se pudo descargar el video. Revisa tu conexión e inténtalo de nuevo.",
    };
  }
  if (code === MEDIA_ERR_DECODE) {
    return {
      code: "MEDIA_ERR_DECODE",
      message:
        "El video no se pudo decodificar. Recarga la página o prueba otro navegador.",
    };
  }
  if (code === MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return {
      code: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      message:
        "Este formato de video no es compatible con tu navegador.",
    };
  }
  if (code === MEDIA_ERR_ABORTED) {
    return {
      code: "MEDIA_ERR_ABORTED",
      message: "La carga del video se interrumpió. Inténtalo de nuevo.",
    };
  }
  return {
    code: "MEDIA_ERR_UNKNOWN",
    message: "Hubo un problema al reproducir el video. Inténtalo de nuevo.",
  };
}

export function mapHlsError(data: ErrorData): PlayerError {
  if (data.type === ErrorTypes.NETWORK_ERROR) {
    return {
      code: "NETWORK_ERROR",
      message:
        "No se pudo cargar el video. Revisa tu conexión e inténtalo de nuevo.",
    };
  }
  if (data.type === ErrorTypes.MEDIA_ERROR) {
    return {
      code: "MEDIA_ERROR",
      message:
        "El video se interrumpió al decodificar. Recarga la página o prueba otro navegador.",
    };
  }
  return {
    code: data.details || data.type,
    message: "No se pudo reproducir el video. Inténtalo de nuevo.",
  };
}

export const unsupportedError: PlayerError = {
  code: "unsupported",
  message:
    "Tu navegador no puede reproducir este video. Actualízalo o prueba Chrome, Firefox o Safari.",
};
