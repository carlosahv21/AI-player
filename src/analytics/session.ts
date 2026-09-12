const SESSION_KEY = "aivp:sessionId";

function uuid(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // fall through to the non-crypto id below
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * One id per tab, in sessionStorage: it survives navigation within the tab
 * and dies with it. Deliberately not localStorage — nothing here should
 * follow a user across sessions, which is what would drag this into
 * cookie-consent territory.
 */
export function getSessionId(): string {
  try {
    const stored = window.sessionStorage.getItem(SESSION_KEY);
    if (stored) return stored;
    const fresh = uuid();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // private mode can throw on access; a per-load id still works
    return uuid();
  }
}

/** True when the visitor asked not to be tracked, by any of the three flags. */
export function doNotTrackEnabled(): boolean {
  try {
    const nav = navigator as Navigator & {
      msDoNotTrack?: string;
      globalPrivacyControl?: boolean;
    };
    const win = window as Window & { doNotTrack?: string };
    const signal = nav.doNotTrack ?? win.doNotTrack ?? nav.msDoNotTrack;
    return signal === "1" || signal === "yes" || nav.globalPrivacyControl === true;
  } catch {
    return false;
  }
}
