/*
 * Press-and-hold reaches 4x; the speed menu stops at 2x. So a hold that ends
 * without a `pointerup` on the surface leaves the video at a rate the user can
 * neither see in the UI nor undo from it — permanently, until they reload.
 *
 * Three ways that happens, none of which fire `pointerup`: the browser takes
 * the pointer away (`pointercancel`), the window loses focus (`blur`), or the
 * page is hidden (`visibilitychange`).
 *
 * The hook is driven for real here, with the three React primitives it uses
 * stubbed, so these exercise the actual handlers rather than a copy of their
 * logic. No jsdom: the suite runs in `node` and this needs a window with
 * listeners, not a document.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (e: unknown) => void;

/** Just enough window/document for the hook's effect to bind to. */
class FakeEventTarget {
  listeners = new Map<string, Set<Listener>>();
  addEventListener(type: string, fn: Listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    this.listeners.get(type)?.forEach((fn) => fn({ type }));
  }
  count(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const timers = new Set<() => void>();

/**
 * Stubs for the four React primitives useVideoGestures calls.
 *
 * `useRef` and `useState` are backed by a slot array replayed in call order,
 * which is exactly what React guarantees for a component that never branches
 * over its hooks — and this one does not.
 */
let slots: unknown[];
let slot: number;
let effects: (() => void | (() => void))[];
let cleanups: (() => void)[];

vi.mock("react", () => ({
  useRef: (initial: unknown) => {
    const i = slot++;
    if (slots[i] === undefined) slots[i] = { current: initial };
    return slots[i];
  },
  useState: (initial: unknown) => {
    const i = slot++;
    if (slots[i] === undefined) slots[i] = { value: initial };
    const cell = slots[i] as { value: unknown };
    return [
      cell.value,
      (next: unknown) => {
        cell.value = typeof next === "function" ? next(cell.value) : next;
      },
    ];
  },
  // no dependency tracking: every render re-runs the effects, and the test
  // renders once
  useEffect: (fn: () => void | (() => void)) => {
    effects.push(fn);
  },
  useCallback: (fn: unknown) => fn,
}));

const { useVideoGestures } = await import("../src/ui/hooks/useVideoGestures");

let fakeWindow: FakeEventTarget;
let fakeDocument: FakeEventTarget & { visibilityState: string };
let setPlaybackRate: ReturnType<typeof vi.fn>;

/** Mounts the hook and returns its handlers plus the rates it requested. */
function mount(playbackRate = 1) {
  slots = [];
  slot = 0;
  effects = [];
  cleanups = [];

  const result = useVideoGestures({
    touch: true,
    enabled: true,
    status: "playing",
    playbackRate: playbackRate as 1,
    togglePlay: () => {},
    play: () => {},
    pause: () => {},
    seekBy: () => {},
    setPlaybackRate,
  });

  for (const effect of effects) {
    const cleanup = effect();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }
  return result;
}

/** Runs the pending hold timer, which is what turns a press into a gesture. */
function fireTimers() {
  const pending = [...timers];
  timers.clear();
  pending.forEach((fn) => fn());
}

function pointerDownAt(handlers: ReturnType<typeof mount>["handlers"]) {
  handlers.onPointerDown({ button: 0, clientX: 100, clientY: 100 } as never);
}

beforeEach(() => {
  fakeWindow = new FakeEventTarget();
  fakeDocument = Object.assign(new FakeEventTarget(), {
    visibilityState: "visible",
  });
  setPlaybackRate = vi.fn();
  timers.clear();

  vi.stubGlobal("window", {
    addEventListener: fakeWindow.addEventListener.bind(fakeWindow),
    removeEventListener: fakeWindow.removeEventListener.bind(fakeWindow),
    setTimeout: (fn: () => void) => {
      timers.add(fn);
      return timers.size;
    },
    clearTimeout: () => {},
  });
  vi.stubGlobal("document", fakeDocument);
});

afterEach(() => {
  cleanups.forEach((fn) => fn());
  vi.unstubAllGlobals();
});

describe("a hold interrupted without pointerup restores the rate", () => {
  it("recovers on pointercancel, when the browser takes the pointer", () => {
    const gestures = mount(1.25);
    pointerDownAt(gestures.handlers);
    fireTimers();
    // the hold is live at 2x
    expect(setPlaybackRate).toHaveBeenLastCalledWith(2);

    fakeWindow.emit("pointercancel");

    expect(setPlaybackRate).toHaveBeenLastCalledWith(1.25);
  });

  it("recovers on blur, when the window loses focus mid-hold", () => {
    const gestures = mount(0.75);
    pointerDownAt(gestures.handlers);
    fireTimers();
    expect(setPlaybackRate).toHaveBeenLastCalledWith(2);

    fakeWindow.emit("blur");

    expect(setPlaybackRate).toHaveBeenLastCalledWith(0.75);
  });

  it("recovers on visibilitychange, when the tab is hidden mid-hold", () => {
    const gestures = mount(1);
    pointerDownAt(gestures.handlers);
    fireTimers();
    expect(setPlaybackRate).toHaveBeenLastCalledWith(2);

    fakeDocument.visibilityState = "hidden";
    fakeDocument.emit("visibilitychange");

    expect(setPlaybackRate).toHaveBeenLastCalledWith(1);
  });

  it("restores the rate the drag climbed away from, not the drag's own", () => {
    const gestures = mount(1.5);
    pointerDownAt(gestures.handlers);
    fireTimers();
    // drag right: 2x -> 4x
    gestures.handlers.onPointerMove({
      clientX: 100 + 60 * 4,
      clientY: 100,
    } as never);
    expect(setPlaybackRate).toHaveBeenLastCalledWith(4);

    fakeWindow.emit("pointercancel");

    expect(setPlaybackRate).toHaveBeenLastCalledWith(1.5);
  });

  it("stays put when the tab becomes visible again", () => {
    const gestures = mount(1);
    pointerDownAt(gestures.handlers);
    fireTimers();
    setPlaybackRate.mockClear();

    fakeDocument.visibilityState = "visible";
    fakeDocument.emit("visibilitychange");

    // a tab coming back into view is not an interruption
    expect(setPlaybackRate).not.toHaveBeenCalled();
  });

  it("does nothing when no hold was running", () => {
    mount(1);
    setPlaybackRate.mockClear();

    fakeWindow.emit("pointercancel");
    fakeWindow.emit("blur");

    expect(setPlaybackRate).not.toHaveBeenCalled();
  });

  it("unbinds the recovery listeners on unmount", () => {
    mount(1);
    expect(fakeWindow.count("pointercancel")).toBe(1);
    expect(fakeWindow.count("blur")).toBe(1);
    expect(fakeDocument.count("visibilitychange")).toBe(1);

    cleanups.forEach((fn) => fn());
    cleanups = [];

    expect(fakeWindow.count("pointercancel")).toBe(0);
    expect(fakeWindow.count("blur")).toBe(0);
    expect(fakeDocument.count("visibilitychange")).toBe(0);
  });
});

describe("gesture rates never reach persistence", () => {
  it("keeps the menu list as the only thing persistence will restore", async () => {
    const { PLAYBACK_RATES, ALLOWED_RATES } = await import(
      "../src/core/types"
    );
    const { loadPrefs } = await import("../src/core/persistence");

    // the asymmetry itself: the gesture can reach rates the menu cannot
    const gestureOnly = ALLOWED_RATES.filter(
      (r) => !PLAYBACK_RATES.includes(r),
    );
    expect(gestureOnly).toEqual([2.5, 3, 3.5, 4]);

    // A hold writes its rate to the store, and usePersistence writes the store
    // out continuously — so a 4x DOES reach localStorage if the gesture is
    // interrupted at the wrong moment. The read is what must refuse it, or the
    // next visit starts at 4x with no way back from the menu.
    for (const rate of gestureOnly) {
      const store: Record<string, string> = {
        "aivp:prefs": JSON.stringify({ playbackRate: rate, mirrored: false }),
      };
      vi.stubGlobal("window", {
        localStorage: {
          getItem: (k: string) => store[k] ?? null,
          setItem: () => {},
        },
      });
      expect(loadPrefs().playbackRate).toBeUndefined();
    }

    // and a menu rate still round-trips
    const store: Record<string, string> = {
      "aivp:prefs": JSON.stringify({ playbackRate: 1.5 }),
    };
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: () => {},
      },
    });
    expect(loadPrefs().playbackRate).toBe(1.5);
  });
});
