/*
 * The reference page reads every value back out of the live CSS, so it shows
 * what the tokens actually resolve to rather than a copy that can go stale.
 */

const GROUPS = {
  "sw-surface": [
    ["--aivp-surface", "el suelo del player"],
    ["--aivp-surface-raised", "paneles, menús, hojas"],
    ["--aivp-surface-sunken", "pozos e insets"],
    ["--aivp-plate-strong", "placa sobre el video"],
    ["--aivp-plate", "placa translúcida"],
    ["--aivp-scrim", "velo sobre el fotograma"],
  ],
  "sw-text": [
    ["--aivp-text", "lectura principal"],
    ["--aivp-text-muted", "secundario, pistas"],
    ["--aivp-text-dim", "terciario"],
    ["--aivp-text-on-brand", "sobre relleno de marca"],
    ["--aivp-text-on-state", "sobre relleno de estado"],
  ],
  "sw-brand": [
    ["--aivp-brand", "interactivo primario"],
    ["--aivp-brand-strong", "variante accesible"],
    ["--aivp-brand-hover", "hover de relleno"],
    ["--aivp-brand-soft", "lavado de selección"],
    ["--aivp-brand-soft-hover", "lavado, hover"],
  ],
  "sw-state": [
    ["--aivp-state-practice", "loop, velocidad ≠ 1x, badge"],
    ["--aivp-state-practice-soft", "el mismo, en lavado"],
    ["--aivp-speed-slow", "rail: por debajo de 1x"],
    ["--aivp-speed-normal", "rail: 1x"],
    ["--aivp-speed-fast", "rail: por encima de 1x"],
  ],
  "sw-line": [
    ["--aivp-border", "filete entre superficies"],
    ["--aivp-border-strong", "filete que debe verse"],
    ["--aivp-line", "línea de separación"],
    ["--aivp-track", "carril de progreso y volumen"],
    ["--aivp-focus", "anillo de foco"],
  ],
};

const TYPE = [
  ["--aivp-text-2xl", "20px · h4"],
  ["--aivp-text-xl", "18px · cuerpo del sitio"],
  ["--aivp-text-lg", "16px · h6"],
  ["--aivp-text-base", "base del cromo"],
  ["--aivp-text-sm", "etiquetas"],
  ["--aivp-text-xs", "pistas"],
  ["--aivp-text-2xs", "microcopy"],
];

const SHAPES = [
  "--aivp-radius-xs",
  "--aivp-radius-sm",
  "--aivp-radius",
  "--aivp-radius-lg",
  "--aivp-radius-pill",
];

const root = document.documentElement;
const readToken = (name, el = root) =>
  getComputedStyle(el).getPropertyValue(name).trim();

/* --- swatches --- */
function paintSwatches() {
  for (const [id, tokens] of Object.entries(GROUPS)) {
    const host = document.getElementById(id);
    host.innerHTML = "";
    for (const [token, role] of tokens) {
      const value = readToken(token);
      const card = document.createElement("div");
      card.className = "sw";
      // checkerboard behind the chip so alpha tokens read as translucent
      card.innerHTML = `
        <div class="chip" style="background-image:
            linear-gradient(45deg,#8883 25%,transparent 25%,transparent 75%,#8883 75%),
            linear-gradient(45deg,#8883 25%,transparent 25%,transparent 75%,#8883 75%);
            background-size:14px 14px; background-position:0 0,7px 7px;">
          <div style="height:100%; background:var(${token})"></div>
        </div>
        <div class="meta">
          <div class="name">${token}</div>
          <div class="val">${value || "—"}</div>
          <div class="val" style="opacity:.75">${role}</div>
        </div>`;
      host.appendChild(card);
    }
  }
}

/* --- type scale --- */
function paintType() {
  const host = document.getElementById("type-scale");
  host.innerHTML = "";
  for (const [token, note] of TYPE) {
    const row = document.createElement("div");
    row.className = "type-row";
    row.innerHTML = `
      <div class="tag">${token}<br><span style="opacity:.7">${readToken(token)} · ${note}</span></div>
      <div style="font-size:var(${token})">Practica el paso lento — 1.25x</div>`;
    host.appendChild(row);
  }
}

/* --- radii and shadows --- */
function paintShapes() {
  const host = document.getElementById("shapes");
  host.innerHTML = "";
  for (const token of SHAPES) {
    const box = document.createElement("div");
    box.className = "shape";
    box.style.borderRadius = `var(${token})`;
    box.textContent = readToken(token);
    box.title = token;
    host.appendChild(box);
  }
  const sh = document.getElementById("shadows");
  sh.innerHTML = "";
  for (const token of ["--aivp-shadow-sm", "--aivp-shadow-md"]) {
    const box = document.createElement("div");
    box.className = "shape";
    box.style.boxShadow = `var(${token})`;
    box.style.borderRadius = "var(--aivp-radius)";
    box.textContent = token.replace("--aivp-", "");
    host.appendChild(box);
    sh.appendChild(box);
  }
}

/* --- mock player, built from tokens only --- */
const PLAYER = `
  <div class="frame">
    <div class="badge">● Práctica · loop <span class="tnum">00:12–00:24</span></div>
    <svg width="54" height="54" viewBox="0 0 24 24" fill="none"
         stroke="var(--aivp-text)" stroke-width="1.6" style="filter:var(--aivp-icon-shadow-lg)">
      <circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z" fill="var(--aivp-text)"/>
    </svg>
  </div>
  <div class="bar">
    <div class="track">
      <div class="buffered"></div>
      <div class="looprange"></div>
      <div class="played"></div>
      <div class="mark" style="left:30%"></div>
      <div class="mark" style="left:58%"></div>
      <div class="mark" style="left:80%"></div>
    </div>
    <div class="ctl">
      <span>▶</span><span>🔊</span>
      <span class="speed">1.25x</span>
      <span class="time tnum">00:18 / 04:32</span>
    </div>
  </div>`;

/* --- contrast, computed live from the resolved tokens --- */
const srgb = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Resolves any CSS colour (hex, rgb(), alpha) to [r,g,b] via the canvas. */
function toRGB(value, backdrop) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  // paint the backdrop first so a translucent token composites the way it will
  // on screen, instead of reporting the ratio of a colour nobody ever sees
  if (backdrop) {
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, 1, 1);
  }
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

const lum = ([r, g, b]) =>
  0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);

function ratio(fg, bg) {
  const a = lum(toRGB(fg, bg));
  const b = lum(toRGB(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const PAIRS = [
  ["--aivp-text", "--aivp-surface", "texto sobre superficie"],
  ["--aivp-text", "--aivp-surface-raised", "texto sobre superficie elevada"],
  ["--aivp-text-muted", "--aivp-surface", "texto atenuado sobre superficie"],
  ["--aivp-brand-strong", "--aivp-surface", "marca (variante) sobre superficie"],
  ["--aivp-text-on-brand", "--aivp-brand-strong", "texto sobre botón de marca"],
  ["--aivp-state-practice", "--aivp-surface", "estado de práctica sobre superficie"],
  ["--aivp-state-practice", "--aivp-surface-raised", "estado sobre superficie elevada"],
  ["--aivp-text-on-state", "--aivp-state-practice", "texto sobre relleno de estado"],
  ["--aivp-focus", "--aivp-surface", "anillo de foco sobre superficie"],
];

function paintContrast() {
  const body = document.querySelector("#contrast tbody");
  body.innerHTML = "";
  // the table describes the player, which is dark in both themes
  const scope = document.querySelector('[data-aivp-scheme="dark"]') || root;
  for (const [fgT, bgT, label] of PAIRS) {
    const fg = readToken(fgT, scope);
    const bg = readToken(bgT, scope);
    if (!fg || !bg) continue;
    const r = ratio(fg, bg);
    const ok = (min) =>
      r >= min
        ? '<span class="pass">✓ pasa</span>'
        : `<span style="opacity:.7">✕ ${r.toFixed(2)}</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${label}<br><span class="val" style="font-size:.72rem;opacity:.65">${fgT} / ${bgT}</span></td>
      <td class="ratio">${r.toFixed(2)}:1</td>
      <td>${ok(4.5)}</td>
      <td>${ok(3)}</td>`;
    body.appendChild(tr);
  }
}

function render() {
  paintSwatches();
  paintType();
  paintShapes();
  document.getElementById("player-dark").innerHTML = PLAYER;
  document.getElementById("player-light").innerHTML = PLAYER;
  paintContrast();
}

document.querySelectorAll(".switch button").forEach((btn) => {
  btn.addEventListener("click", () => {
    root.dataset.aivpTheme = btn.dataset.theme;
    document.querySelectorAll(".switch button").forEach((b) =>
      b.setAttribute("aria-pressed", String(b === btn)),
    );
    render();
  });
});

render();
