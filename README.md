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
npm test             # vitest, 171 tests
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

`heatmap` (muestras de interés en 0..1) es opcional. `preview` es obligatorio
como **clave**, pero `null` es un valor válido y esperado: el plugin siempre
manda el campo, y cuando vale `null` no se dibuja vista previa y todo lo demás
funciona igual.

Los datos cruzan una frontera de confianza — los sirve WordPress y un filtro o
un meta editado a mano puede meter cualquier cosa. `sanitizeHeatmap` en
`src/ui/hooks/useVideoPayload.ts` los limpia: descarta las muestras inválidas
una a una y registra cuántas y por qué. Solo si más de la mitad del array es
inválida se descarta la curva entera, como `console.error`.

### La duración real manda

`duration` del payload es una **estimación**. Cuando llega `loadedmetadata`, la
metadata del medio es la autoridad y `_onDurationChange` reconcilia todo contra
ella:

- las secciones que empiezan después del final se descartan;
- las que terminan después se recortan (y sus `steps` con ellas);
- cualquier loop —el activo o uno restaurado de `localStorage`— se recorta o se
  descarta si ya no cabe;
- cada ajuste se registra en consola con la sección, el valor esperado y el
  real.

Ese aviso no es un error del usuario final: significa que las secciones
guardadas en el admin describen un video que no es el que se está sirviendo.
**Hay que corregirlas en el admin.**

### Cobertura de secciones

Las secciones **no** tienen por qué cubrir toda la duración, y el player no
inventa secciones de relleno: un hueco es un dato que falta, no algo que el
reproductor deba fabricar.

`selectSectionCoverage` (en `src/core/selectors.ts`) devuelve el porcentaje
cubierto, y `selectCoverageGaps` los tramos vacíos. Ambos son derivados, nunca
estado guardado. Si hay huecos se registra un aviso al cargar.

Importa porque rompe la analítica: un heartbeat que cae en un hueco no se
atribuye a ninguna sección, así que la retención por secciones muestra una
caída donde en realidad hay un vacío del modelo.

> **Pendiente para el admin del plugin:** al guardar, esto debe ser una
> advertencia visible — "las secciones cubren el 62% del video" — junto a los
> tramos sin cubrir. Mismo criterio para las secciones que exceden la duración
> real.

### `preview`: lo que el plugin debe producir

El campo es parte del contrato aunque el plugin todavía no mande miniaturas.
Formato exacto, para no tener que deducirlo leyendo TypeScript:

```json
"preview": {
  "spriteUrl": "https://cdn.example.com/vid/123/sprite.jpg",
  "vttUrl":    "https://cdn.example.com/vid/123/thumbs.vtt"
}
```

O bien `"preview": null`. Ambas claves son obligatorias cuando el objeto está
presente; si falta cualquiera de las dos, se trata como `null`.

El VTT es el sabor *thumbnail* de WebVTT: cada cue apunta a un recorte del
sprite con un fragmento de medios `#xywh`.

```
WEBVTT

00:00:00.000 --> 00:00:05.000
sprite.jpg#xywh=0,0,160,90

00:00:05.000 --> 00:00:10.000
sprite.jpg#xywh=160,0,160,90
```

Reglas que aplica el parser (`src/ui/hooks/usePreviewSprite.ts`):

| Regla | Detalle |
|---|---|
| Marcas de tiempo | `hh:mm:ss.mmm` o `mm:ss.mmm` |
| Carga útil | URL con `#xywh=x,y,ancho,alto`, en la línea siguiente al cue |
| Origen del sprite | **`spriteUrl` del payload**, no la URL escrita en el cue |
| Cue inválido | Se descarta en silencio (sin `#xywh`, números no numéricos, ancho o alto ≤ 0) |

**Degradación.** Si el VTT no carga (404, error de red) o no deja ni un cue
válido, el resultado es "sin vista previa" y se registra un aviso en consola.
Nunca llega al estado de error del store: la barra de progreso, el scrubbing y
el panel de loop siguen funcionando igual. Una miniatura ausente es una función
que falta, no un fallo del reproductor.

En producción Bunny genera el sprite y el VTT automáticamente; el plugin solo
pasa las dos URLs. Ver `docs/miniaturas.md` para el banco de pruebas.

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
