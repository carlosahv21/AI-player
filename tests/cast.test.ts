/*
 * Loading the Cast SDK is not enough to cast: `requestSession()` throws
 * "Cannot start session before cast options are provided" unless the context
 * has been handed a receiver id first. That is what the button hit in
 * WordPress once the plugin started enqueuing the SDK.
 *
 * These drive the real initialiser with a stubbed framework, in the style of
 * holdrecovery.test.ts: the suite runs in `node`, so there is no jsdom and
 * no React renderer — the seam is the exported function.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCast, resetCastForTests } from "../src/ui/hooks/useCast";

/** Stands in for `window`, which the `node` environment does not provide. */
let win: { cast?: unknown; chrome?: unknown };

/** The two globals the SDK publishes once it has loaded. */
function installSdk({
  setOptions = vi.fn(),
}: {
  setOptions?: (options: Record<string, unknown>) => void;
} = {}) {
  const receiver = "CC1AD845";
  const autoJoin = "origin_scoped";

  win.chrome = {
    cast: {
      media: { DEFAULT_MEDIA_RECEIVER_APP_ID: receiver },
      AutoJoinPolicy: { ORIGIN_SCOPED: autoJoin },
    },
  };
  win.cast = {
    framework: {
      CastContext: {
        getInstance: () => ({
          setOptions,
          requestSession: vi.fn(),
          getCurrentSession: () => null,
        }),
      },
    },
  };
  return setOptions;
}

beforeEach(() => {
  resetCastForTests();
  win = {};
  vi.stubGlobal("window", win);
});

afterEach(() => {
  resetCastForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("initCast", () => {
  it("does nothing without the SDK", () => {
    expect(initCast()).toBe(false);
  });

  it("hands the context a receiver before any session can start", () => {
    const setOptions = installSdk();

    expect(initCast()).toBe(true);
    expect(setOptions).toHaveBeenCalledWith({
      receiverApplicationId: "CC1AD845",
      autoJoinPolicy: "origin_scoped",
    });
  });

  // The context is page-wide: setting its options twice is pointless and,
  // mid-session, disruptive.
  it("sets the options only once per page", () => {
    const setOptions = installSdk();

    expect(initCast()).toBe(true);
    expect(initCast()).toBe(true);
    expect(initCast()).toBe(true);
    expect(setOptions).toHaveBeenCalledTimes(1);
  });

  // A half-loaded SDK must leave the button hidden rather than offer one
  // whose click throws.
  it("refuses when the framework is there but its constants are not", () => {
    installSdk();
    // A default parameter cannot express "absent", so the constant is
    // removed after the fact, which is what a half-loaded SDK looks like.
    (win.chrome as { cast: { media: Record<string, unknown> } }).cast.media = {};
    expect(initCast()).toBe(false);

    resetCastForTests();
    installSdk();
    (win.chrome as { cast: { AutoJoinPolicy: Record<string, unknown> } }).cast.AutoJoinPolicy = {};
    expect(initCast()).toBe(false);
  });

  it("refuses when chrome.cast is missing entirely", () => {
    installSdk();
    win.chrome = undefined;
    expect(initCast()).toBe(false);
  });

  it("survives a framework that throws on setOptions", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    installSdk({
      setOptions: () => {
        throw new Error("boom");
      },
    });

    expect(initCast()).toBe(false);
  });
});
