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

**Un solo eje: `time / duration`.** El rail es un rectángulo continuo. Curva,
relleno, playhead, clic, guía de hover, handles de loop y hitboxes miden el
mismo porcentaje: `axisAt()` en `HeatmapProgress.tsx`. Las divisiones entre
secciones son marcas de 2px **encima** de ese eje (`gapMask`), no huecos flex
que le resten ancho.

> Antes el rail era una fila de pastillas con `gap: 2px`. La curva ocupaba el
> 100% del contenedor y el relleno ocupaba `100% − (n−1)×2px`. Un traductor
> (`railPosition`) intentaba compensar; un hueco fantasma de 0.04s —el mock
> dice 21.9s, el MP4 dura 21.94s— costaba un gap de 2px y desplazaba todo el
> rail bajo una curva que no se movía. Un solo rectángulo elimina esa clase
> de bug: no hay gap que robar.

Un tramo sin sección sigue siendo video —se puede hacer seek ahí— pero no es
una sección: sin nombre, sin etiqueta, sin marca de 2px (un hueco es una
ausencia, no una frontera), y no aparece en la lista ni en la navegación con
`,` / `.`. `coverageGaps()` lo pinta un poco más oscuro. `sectionCoverage`
sigue midiendo lo realmente descrito.

La curva del heatmap es un SVG en `.wrap` con `viewBox` fijo `0 0 100 100` y
`preserveAspectRatio="none"`. El clip de progreso usa el mismo `axisAt()` que
el relleno. Necesita los 44px de `.wrap` para tener altura.

Los tests de `tests/heatmap.test.ts` y `tests/railaxis.test.ts` fijan este eje.
Si se mueven, la barra se desalinea.

## Aislamiento de estilos en WordPress

El player se monta dentro del tema del sitio, que aplica sus propias reglas a
`button`, `a`, `input`, `svg` y `ul/li`. Medido con **Astra + Elementor**: el
botón de cerrar de los paneles salía como un rectángulo sólido de 62x40 con el
icono perdido dentro, porque Astra pintaba `background: #e6e6e6`, `color: #fff`
y, desde su `<style>` inline, `padding: 15px 30px`.

El reset vive en `src/ui/Player.module.css`, bajo `.root`. **No hay reset
global** y **no hay un solo `!important`** en el proyecto.

### La estrategia: un reset partido en dos mitades

El reset tiene que ganar al tema pero **perder** ante las clases del propio
player (`.close` y compañía, con especificidad `(0,1,0)`). Ese techo es toda la
dificultad, y es lo que parte el reset:

| Mitad | Selector | Especificidad | Qué lleva |
|---|---|---|---|
| 1 | `.root button` | `(0,1,1)` | Lo que ningún componente pinta: `min-height`, `text-transform`, `appearance`, `padding`, `box-shadow`, tipografía |
| 2 | `:where(.root button)` | `(0,0,0)` | Lo que los componentes sí pintan: `background`, `border`, `border-radius`, `color` |

La mitad 2 gana al tema **por orden de carga** (la hoja del plugin se encola
después), y pierde ante cualquier clase de componente, que es lo que se busca.
La mitad 1 gana por especificidad, porque el `<style>` inline de Astra se emite
*después* de la hoja del plugin y ahí el orden ya no defiende nada.

**Ese era el bug**: el reset original ponía *todas* las propiedades en la mitad
2, con especificidad cero, así que `min-height`, `text-transform` y `padding` no
tenían con qué ganar.

### Alternativas descartadas (medidas, no razonadas)

- **`@layer`.** La respuesta de manual, y equivocada aquí: una regla *sin capa*
  gana a cualquier regla capada, sin importar la especificidad — y el CSS de
  Astra no está capado. Con el reset dentro de una capa, el `padding` seguía
  siendo el de Astra. Capar también los componentes no ayuda: entonces el tema
  les gana a ellos.
- **`!important` dentro de una capa.** Gana al tema, pero también a los
  componentes, que necesitarían su propio `!important`. Es la escalada que se
  quiere evitar.
- **Un reset fuerte en `.root.root`** `(0,2,1)`. Gana al tema, pero aplasta el
  fondo y el borde de `.close`: medido, el botón salía transparente en **los dos
  entornos**.

Si un componente futuro necesita `padding` en un `button`, tiene que escribir
`.root .algo` `(0,2,0)` para superar la mitad 1.

### Iconos

Los componentes pintan con `currentColor`, que está bien; el riesgo es de dónde
sale ese color. Astra ponía `color: #fff` en todo botón, así que `currentColor`
resolvía a blanco sobre fondo claro. La mitad 1 devuelve `color: inherit` (que
llega hasta `--aivp-text` de `.root`) y `.root svg` fija un token de respaldo.

### Verificación

El banco de pruebas **no sirve** para esto: ahí no hay tema que interfiera. Hay
que comparar contra el WordPress real, control por control, con el tema y el
page builder del cliente activos — barra de controles, panel de velocidad,
panel de loop, menú de ajustes, selector de calidad, botones de cerrar,
tooltips, lista de secciones, indicador de práctica y fondo de subtítulos.

El criterio es que el estilo computado de cada control sea **idéntico** en los
dos entornos.

## Temas

Dos juegos de tokens en `src/styles/themes/`. Se eligen con `data-aivp-theme`
por instancia, o con `theme` en la config global del plugin. Ver
`docs/cambiar-tema.md`.
