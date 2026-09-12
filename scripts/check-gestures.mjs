/*
 * Browser checks for the behaviours that only exist in the DOM: pointer
 * gestures, drag-to-resume, and the control/handle exclusions.
 *
 * The unit suite covers the store and the VTT parser; this covers what a
 * finger and a mouse actually do. Run against `npm run dev`:
 *
 *   node scripts/check-gestures.mjs [url]
 */
import { chromium, devices } from "playwright";

const URL = process.argv[2] ?? "http://localhost:5173/";
const results = [];
const check = (name, ok, detail = "") =>
  results.push({ name, ok, detail });

const rateOf = (p) =>
  p.evaluate(() => document.querySelector("video")?.playbackRate);
const stateOf = (p) =>
  p.evaluate(() => ({
    t: +(document.querySelector("video")?.currentTime ?? 0).toFixed(2),
    paused: document.querySelector("video")?.paused,
  }));

async function desktop(browser) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForTimeout(1800);

  // click is play/pause with no delay
  await p.mouse.click(640, 250);
  await p.waitForTimeout(400);
  check("escritorio: clic reproduce al instante", (await stateOf(p)).paused === false);

  // press and hold -> 2x, drag right -> faster, release -> restored
  await p.mouse.move(640, 250);
  await p.mouse.down();
  await p.waitForTimeout(700);
  const held = await rateOf(p);
  await p.mouse.move(770, 250);
  await p.waitForTimeout(350);
  const dragged = await rateOf(p);
  await p.mouse.up();
  await p.waitForTimeout(400);
  const restored = await rateOf(p);
  check("sostener acelera a 2x", held === 2, `rate=${held}`);
  check("arrastrar sube por encima de 2x", dragged > 2, `rate=${dragged}`);
  check("soltar restaura la velocidad previa", restored === 1, `rate=${restored}`);

  // the gesture must not fire over chrome
  for (const [label, sel] of [
    ["barra de progreso", '[class*=aivp-wrap_] [class*=aivp-track_]'],
    ["botón de volumen", 'button[aria-label*="Silenciar"]'],
  ]) {
    const el = await p.$(sel);
    if (!el) continue;
    const box = await el.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(700);
    const r = await rateOf(p);
    await p.mouse.up();
    await p.waitForTimeout(250);
    check(`sostener NO se activa sobre ${label}`, r === 1, `rate=${r}`);
  }

  // loop handles are part of the controls, not the surface
  await p.keyboard.press("b");
  await p.waitForTimeout(600);
  const handle = await p.$("[class*=aivp-handle_]");
  if (handle) {
    const box = await handle.boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await p.mouse.down();
    await p.waitForTimeout(700);
    const r = await rateOf(p);
    await p.mouse.up();
    check("sostener NO se activa sobre las manijas del loop", r === 1, `rate=${r}`);
  }

  // releasing a scrub resumes playback
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p2.goto(URL, { waitUntil: "networkidle" });
  await p2.waitForTimeout(1800);
  await p2.mouse.move(640, 400);
  await p2.waitForTimeout(400);
  const bar = await p2.$("[class*=aivp-wrap_]");
  const bb = await bar.boundingBox();
  await p2.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2);
  await p2.mouse.down();
  await p2.mouse.move(bb.x + bb.width * 0.6, bb.y + bb.height / 2, { steps: 10 });
  await p2.mouse.up();
  await p2.waitForTimeout(700);
  const after = await stateOf(p2);
  check("soltar el arrastre reanuda la reproducción", after.paused === false, `t=${after.t}`);
  await p2.close();
  await p.close();
}

async function mobile(browser) {
  const p = await browser.newPage({
    ...devices["iPhone 13"],
    hasTouch: true,
    isMobile: true,
  });
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);

  const box = await (await p.$("video")).boundingBox();
  const cy = box.y + box.height / 2;
  const left = box.x + box.width * 0.15;
  const mid = box.x + box.width * 0.5;
  const right = box.x + box.width * 0.85;

  await p.touchscreen.tap(mid, cy);
  await p.waitForTimeout(800);
  check("móvil: toque central reproduce", (await stateOf(p)).paused === false);

  await p.waitForTimeout(900);
  const before = (await stateOf(p)).t;
  await p.touchscreen.tap(right, cy);
  await p.waitForTimeout(80);
  await p.touchscreen.tap(right, cy);
  await p.waitForTimeout(700);
  const afterRight = await stateOf(p);
  check(
    "móvil: doble toque derecho adelanta ~10s",
    afterRight.t - before > 8,
    `${before} -> ${afterRight.t}`,
  );
  check(
    "móvil: el doble toque NO pausa",
    afterRight.paused === false,
  );

  const beforeLeft = (await stateOf(p)).t;
  await p.touchscreen.tap(left, cy);
  await p.waitForTimeout(80);
  await p.touchscreen.tap(left, cy);
  await p.waitForTimeout(700);
  const afterLeft = (await stateOf(p)).t;
  check(
    "móvil: doble toque izquierdo retrocede ~10s",
    beforeLeft - afterLeft > 8,
    `${beforeLeft} -> ${afterLeft}`,
  );

  // The reported bug: a real finger is slower than the 80ms above. Two taps
  // measured 251ms apart landed past the old 250ms window, so the first tap's
  // timer had already toggled play/pause and the second toggled it back — the
  // double tap paused instead of seeking. A fresh page per gap: a leftover
  // pending zone from the previous pair would mask the result.
  for (const gap of [240, 380]) {
    const slow = await browser.newPage({
      ...devices["iPhone 13"],
      hasTouch: true,
      isMobile: true,
    });
    await slow.goto(URL, { waitUntil: "networkidle" });
    await slow.waitForTimeout(2000);
    const sbox = await (await slow.$("video")).boundingBox();
    const sy = sbox.y + sbox.height / 2;
    await slow.touchscreen.tap(sbox.x + sbox.width * 0.5, sy);
    await slow.waitForTimeout(1500);
    const s0 = await stateOf(slow);
    await slow.touchscreen.tap(sbox.x + sbox.width * 0.85, sy);
    await slow.waitForTimeout(gap);
    await slow.touchscreen.tap(sbox.x + sbox.width * 0.85, sy);
    await slow.waitForTimeout(700);
    const s1 = await stateOf(slow);
    check(
      `móvil: doble toque lento (${gap}ms) adelanta y NO pausa`,
      s1.t - s0.t > 8 && s1.paused === false,
      `${s0.t} -> ${s1.t}, pausado=${s1.paused}`,
    );
    await slow.close();
  }

  // the bar's own controls must still take their taps
  const btn = await p.$('button[aria-label*="Pausar"], button[aria-label*="Reproducir"]');
  const bb = await btn.boundingBox();
  const wasPaused = (await stateOf(p)).paused;
  await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.waitForTimeout(600);
  check(
    "móvil: los controles siguen recibiendo el toque",
    (await stateOf(p)).paused !== wasPaused,
  );
  await p.close();
}

/** Loop panel flow and the panel chrome, from the Prompt 13 review. */
async function panels(browser) {
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p.goto(URL, { waitUntil: "networkidle" });
  await p.waitForTimeout(2000);

  const dialogs = () => p.locator("[role=dialog]").count();
  const openLoop = async () => {
    const x = await p.$("[class*=aivp-close_]");
    if (x) {
      await x.click();
      await p.waitForTimeout(500);
    }
    await p.mouse.move(640, 400);
    await p.waitForTimeout(400);
    let btn = await p.$('button[aria-label*="Salir del loop"]');
    if (btn) {
      await btn.click();
      await p.waitForTimeout(600);
      await p.mouse.move(640, 400);
      await p.waitForTimeout(400);
    }
    btn = await p.$('button[aria-label*="loop"], button[aria-label*="Loop"]');
    await btn.click();
    await p.waitForTimeout(800);
  };

  // picking a section is a decision: it runs and gets out of the way
  await openLoop();
  await p.click("text=Secuencia principal");
  await p.waitForTimeout(900);
  check("elegir sección cierra el panel y reproduce",
    (await dialogs()) === 0 && (await stateOf(p)).paused === false);

  // trimming an edge is an adjustment: the panel stays put
  await openLoop();
  const handle = await p.$('[role=dialog] [aria-label="Fin del loop"]');
  const hb = await handle.boundingBox();
  await p.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await p.mouse.down();
  await p.mouse.move(hb.x + hb.width / 2 + 80, hb.y + hb.height / 2, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(900);
  check("arrastrar una manija NO cierra el panel", (await dialogs()) === 1);

  // sliding the whole window is a decision again
  if ((await dialogs()) === 0) await openLoop();
  const sel = await p.$("[role=dialog] [class*=aivp-selection_]");
  const sb = await sel.boundingBox();
  await p.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await p.mouse.down();
  await p.mouse.move(sb.x + sb.width / 2 + 110, sb.y + sb.height / 2, { steps: 8 });
  await p.mouse.up();
  await p.waitForTimeout(900);
  check("mover la ventana cierra el panel y reproduce",
    (await dialogs()) === 0 && (await stateOf(p)).paused === false);

  // the panel carries its own transport: the loop runs while it is open
  await openLoop();
  const wasPaused = (await stateOf(p)).paused;
  await p.click("[class*=aivp-transport_]");
  await p.waitForTimeout(800);
  check("play/pausa desde el panel de loop",
    (await stateOf(p)).paused !== wasPaused && (await dialogs()) === 1);

  // both panels close from the corner
  await openLoop();
  check("X en el panel de loop",
    (await p.locator("[role=dialog] [class*=aivp-close_]").count()) === 1);
  await p.click("[class*=aivp-close_]");
  await p.waitForTimeout(500);
  check("la X cierra el panel de loop", (await dialogs()) === 0);

  await p.mouse.move(640, 400);
  await p.waitForTimeout(400);
  await (await p.$('button[aria-label*="Velocidad"]')).click();
  await p.waitForTimeout(800);
  check("X en el panel de velocidad",
    (await p.locator("[class*=aivp-close_]").count()) === 1);

  // both panels put their close button in the same corner
  const xPos = await p.evaluate(() => {
    const x = document.querySelector("[class*=aivp-close_]").getBoundingClientRect();
    const r = document.querySelector("[class*=aivp-root_]").getBoundingClientRect();
    return { x: Math.round(x.x - r.x), y: Math.round(x.y - r.y) };
  });
  check("la X de velocidad está donde la de loop",
    xPos.y < 30, `y=${xPos.y}`);
  const size = await p.evaluate(() => {
    const el = document.querySelector("[class*=aivp-panel_]");
    const root = document.querySelector("[class*=aivp-root_]");
    const a = el.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    return { w: +(a.width / b.width).toFixed(2), h: +(a.height / b.height).toFixed(2) };
  });
  check("velocidad: ancho completo, alto reducido",
    size.w === 1 && size.h < 0.3, `ancho=${size.w} alto=${size.h}`);

  await p.close();
}

const browser = await chromium.launch();
try {
  await desktop(browser);
  await mobile(browser);
  await panels(browser);
} finally {
  await browser.close();
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} comprobaciones`);
process.exit(failed ? 1 : 0);
