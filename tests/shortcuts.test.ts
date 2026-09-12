import { describe, expect, it } from "vitest";
// Vite's ?raw import instead of node:fs, so the suite needs no @types/node.
import source from "../src/ui/Player.tsx?raw";

/** The `case "x":` labels the keydown handler answers to. */
function handledKeys(): string[] {
  const handler = source.slice(
    source.indexOf("const onKey = (e: KeyboardEvent)"),
    source.indexOf('window.addEventListener("keydown", onKey)'),
  );
  return [...handler.matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
}

describe("keyboard shortcuts", () => {
  it("has no R shortcut", () => {
    // R called repeatSection(), which looped the whole active section and
    // jumped to its start. One keypress put the player in a loop nobody
    // asked for, which reads as the player having hung.
    const keys = handledKeys();
    expect(keys).not.toContain("r");
    expect(keys).not.toContain("R");
  });

  it("repeats the section with B instead", () => {
    const keys = handledKeys();
    expect(keys).toContain("b");
    expect(keys).toContain("B");
  });

  it("ignores every shortcut when a modifier is held", () => {
    // Without this the browser combo fired the player action too: Cmd+R
    // reloaded AND looped, Cmd+F opened find AND went fullscreen.
    expect(source).toContain("e.metaKey || e.ctrlKey || e.altKey");
  });

  it("still handles the documented keys", () => {
    const keys = handledKeys();
    for (const key of [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
      "m", "f", "l", "e", ".", ",", "Escape"]) {
      expect(keys).toContain(key);
    }
  });
});
