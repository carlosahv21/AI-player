# AI Video Player

Reproductor de video para clases de baile, embebido en WordPress. React +
TypeScript, empaquetado como bundle IIFE que el plugin carga y monta sobre cada
`<div data-aivp-video>` de la página.

El foco no es reproducir video — es **practicar**: loops sobre un fragmento,
control de velocidad, vista espejo, navegación por secciones y una barra de
progreso que muestra qué partes se repiten más.

## Arranque

```bash
npm install
npm run dev          # servidor de desarrollo en dev/
npm test             # vitest, 128 tests
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite dev server sobre `dev/`, con payload de `src/mock/` |
| `npm run build` | Bundle de librería → `dist/` |
| `npm run build:wp` | Bundle para WordPress → `dist-wp/` |
| `npm run build:plugin` | `build:wp` + copia a `../ai-video-player-wp/assets/` |
| `npm test` | Suite completa |
| `npm run check:gestures` | Verificación de gestos táctiles (Playwright) |

**Para ver un cambio en WordPress hay que correr `build:plugin`.** `npm run
build` solo escribe `dist/`, que el plugin no lee — un cambio validado ahí
puede no estar en lo que el navegador carga. La ruta destino se puede
sobreescribir con `AIVP_PLUGIN_DIR`.

Ni `dist/` ni `dist-wp/` están versionados.

## Estructura

```
src/
  index.ts        API pública + window.AIVP
  mount.tsx       mount/unmount/autoMount sobre [data-aivp-video]
  core/           store (zustand), tipos, selectores, persistencia
  engine/         VideoEngine: <video> + HLS, carga y errores
  ui/             componentes; Player.tsx es la raíz
  analytics/      cola de eventos por lotes
  styles/themes/  aivp.css (marca) y pluranza.css
  mock/           payload de ejemplo para desarrollo
dev/              páginas de desarrollo; wp-sim/ simula el entorno del plugin
docs/             temas, miniaturas, reskin
```

El estado vive en un store de zustand por instancia (`createPlayerStore`), no en
un singleton: pueden convivir varios reproductores en una página. `VideoEngine`
es la única capa que toca el elemento `<video>` y empuja el estado al store.

## El payload

El plugin sirve un `VideoPayload` por REST (`src/core/types.ts`). Campos
obligatorios: `id`, `title`, `duration`, `sources`, `sections`, `features`,
`tracks`.

`preview` (sprite de miniaturas) y `heatmap` (muestras de interés en 0..1) son
opcionales: si faltan, el reproductor se comporta igual sin dibujarlos.

Los datos cruzan una frontera de confianza — los sirve WordPress y un filtro o
un meta editado a mano puede meter cualquier cosa. `sanitizeHeatmap` en
`src/ui/hooks/useVideoPayload.ts` los limpia; un solo `NaN` en el array del
heatmap borra la curva entera sin error visible.

Cuidado con dos supuestos que **no** están garantizados:

- Las secciones pueden no cubrir toda la duración: dejar huecos, empezar tarde o
  terminar antes. Nada las valida.
- `duration` se siembra del payload y luego la **sobreescribe** la metadata real
  del MP4 (`_onDurationChange`), mientras las secciones conservan los números
  del payload. Los dos pueden discrepar.

## Barra de progreso

La parte más delicada del código, y donde se concentran los bugs visuales.

`.track` es una fila flex con `gap: 2px` y un `.segment` por sección, cada uno
con `flexGrow: span`. **Flex reparte el ancho contra la suma de los spans, no
contra `duration`** — el rail siempre llena el track, sea cual sea la duración.

Cualquier cosa posicionada sobre el rail tiene que usar ese mismo eje. Por eso
`railPosition()` en `HeatmapProgress.tsx` calcula posiciones como fracción de
los spans sumados más los gaps ya pasados, en vez de un `time/duration` directo
que se desplaza hasta `(n-1)*2px`.

El playhead es la excepción deliberada: vive *dentro* del segmento y reusa la
misma expresión `local(shown)` que dimensiona el relleno, porque flex redondea
cada caja a su manera y cualquier cálculo hecho desde `.wrap` cae una fracción
de píxel fuera.

La curva del heatmap es un SVG en `.wrap` con `viewBox` fijo `0 0 100 100` y
`preserveAspectRatio="none"`. Necesita los 44px de `.wrap` para tener altura;
moverla dentro de un `.segment` de 4px la colapsa.

Los tests de `tests/heatmap.test.ts` fijan esta geometría, varios leyendo el CSS
directamente. Si se mueven, la barra se desalinea.

## Temas

Dos juegos de tokens en `src/styles/themes/`. Se eligen con `data-aivp-theme`
por instancia, o con `theme` en la config global del plugin. Ver
`docs/cambiar-tema.md`.
