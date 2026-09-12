import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const UI = resolve(__dirname, "../src/ui");
const STYLES = resolve(__dirname, "../src/styles");

const componentSheets = readdirSync(UI).filter((f: string) =>
  f.endsWith(".module.css"),
);
const read = (dir: string, f: string) => readFileSync(resolve(dir, f), "utf8");

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every --token: value pair declared in a stylesheet. */
function declaredTokens(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of stripComments(css).matchAll(/(--aivp-[a-z0-9-]+)\s*:/g)) {
    out.add(m[1]);
  }
  return out;
}

describe("token layer", () => {
  it("no component hardcodes a colour", () => {
    const offenders: string[] = [];
    for (const file of componentSheets) {
      const css = stripComments(read(UI, file));
      for (const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([\d\s,.%/]+\)/g)) {
        offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no component hardcodes a font-size, radius or shadow", () => {
    const offenders: string[] = [];
    for (const file of componentSheets) {
      const css = stripComments(read(UI, file));
      for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
        const v = m[1].trim();
        // `inherit` is the reset that stops a host theme leaking its size in
        if (!v.includes("var(") && v !== "inherit") {
          offenders.push(`${file} font-size: ${v}`);
        }
      }
      // Not scale values: multi-value radii (0 6px 6px 0) are shapes, `50%` is
      // a circle, `0` is a reset, 1px just rounds the tip of a 2px tick, and
      // `inherit` takes whatever radius the parent already got from a token.
      for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
        const v = m[1].trim();
        const exempt = ["50%", "0", "1px", "inherit"].includes(v) || v.includes(" ");
        if (!v.includes("var(") && !exempt) {
          offenders.push(`${file} border-radius: ${v}`);
        }
      }
      for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g)) {
        const v = m[1].trim();
        if (!v.includes("var(") && v !== "none") {
          offenders.push(`${file} box-shadow: ${v}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("both themes define exactly the same token contract", () => {
    const aivp = declaredTokens(read(`${STYLES}/themes`, "aivp.css"));
    const pluranza = declaredTokens(read(`${STYLES}/themes`, "pluranza.css"));
    expect([...aivp].sort()).toEqual([...pluranza].sort());
  });

  it("every token a component uses is defined by both themes", () => {
    // set at runtime by the component that owns them, never by a theme
    const RUNTIME = new Set(["--aivp-speed", "--aivp-vol"]);
    const defined = new Set([
      ...declaredTokens(read(`${STYLES}/themes`, "aivp.css")),
      ...declaredTokens(read(STYLES, "tokens.css")),
    ]);
    const used = new Set<string>();
    for (const file of [...componentSheets, "SpeedPanel.tsx"]) {
      for (const m of read(UI, file).matchAll(/var\((--aivp-[a-z0-9-]+)/g)) {
        used.add(m[1]);
      }
    }
    const missing = [...used].filter((t) => !defined.has(t) && !RUNTIME.has(t));
    expect(missing).toEqual([]);
  });

  it("brand and practice state are different colours in the brand theme", () => {
    const css = read(`${STYLES}/themes`, "pluranza.css");
    const dark = css.slice(0, css.indexOf("--- Light"));
    const brand = /--aivp-brand:\s*([^;]+);/.exec(dark)?.[1].trim();
    const practice = /--aivp-state-practice:\s*([^;]+);/.exec(dark)?.[1].trim();
    expect(brand).toBeTruthy();
    expect(practice).toBeTruthy();
    expect(practice).not.toBe(brand);
  });

  it("digits keep tabular figures wherever a time or count is rendered", () => {
    const withTabular = componentSheets.filter((f: string) =>
      read(UI, f).includes("font-variant-numeric: tabular-nums"),
    );
    // the components that render clocks, speeds and counters
    for (const f of ["TimeDisplay", "ProgressBar", "SpeedControl", "PracticeBadge"]) {
      expect(withTabular).toContain(`${f}.module.css`);
    }
  });
});
