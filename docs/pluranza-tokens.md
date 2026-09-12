# Tokens reales de Pluranza — extracción del CSS de producción

**Fecha:** 2026-09-08
**Fuente:** `https://pluranza.com` (HTTP 200, 177 243 bytes)
**Método:** descarga del HTML de portada, extracción de los `<link rel=stylesheet>` y de los 13 bloques `<style>` inline. Sin capturas, sin inferencia visual. Todos los valores de abajo son literales del CSS.

## Archivos analizados

| Archivo | Bytes | Papel |
|---|---|---|
| `https://pluranza.com/?xlink=css&ver=7.1` | 131 875 | **Hoja principal.** CSS generado por Oxygen Builder: contiene el sistema de diseño real |
| bloques `<style>` inline del HTML | 60 929 | Overrides de plantilla (Tutor LMS, WooCommerce, formularios) |
| `oxygen/component-framework/oxygen.css?ver=4.9.5` | 20 669 | Framework Oxygen, valores por defecto del plugin |
| `oxygen-tutor-lms/assets/css/public.css?ver=7.1` | 369 | Nada relevante de marca |

Descartados por ser CSS de terceros sin valores de marca: `woocommerce*.css`, `wc-blocks.css`, `cookie-notice/front.min.css`, `mcdc-google-auth`, `unslider.css`.

La plataforma es WordPress + Oxygen Builder. Oxygen no emite variables CSS: escribe los valores literales por selector. Por eso no existe una "capa de tokens" upstream que copiar — los tokens de abajo son el resultado de agregar por frecuencia y de verificar en qué propiedad se usa cada color.

---

## 1. Colores

Frecuencia = número de apariciones en hoja principal + inline.

| Hex | Usos | Propiedades donde aparece | Papel deducido |
|---|---|---|---|
| `#ffffff` / `#fff` | 285 | `color`, `background-color` | Texto sobre oscuro, superficie clara |
| **`#039fd9`** | **57** | `color` ×28, `background-color` ×14, bordes ×7 | **Azul de marca primario** |
| `#1bb185` | 40 | `color` ×14, `background-color` ×10, bordes ×8 | Verde secundario — **estado hover de botón** |
| `#151823` | 33 | `background-color` ×25 | **Superficie base oscura** |
| `#1e2230` | 15 | `background-color` ×9 | Superficie elevada (tarjetas) |
| `#0e1019` | 11 | `background-color` ×8 | Superficie hundida / acordeón |
| `#292f59` | 10 | `color` ×9 | Azul-violeta de texto decorativo |
| `#184059` | 10 | bordes ×9 | **Borde sobre superficie oscura** |
| `#ff9f1c` | 9 | `color` ×8 | Ámbar de acento / destacados |
| `#dbdbdb` | 16 | bordes, texto | Gris claro de filete |
| `#404040` | 2+ | `color` en `body` | Texto de cuerpo en zonas claras |
| `#606e79` · `#98a1a8` · `#adb4b9` | 16 | `color` | Escala de grises de texto atenuado |

### Variantes del azul de marca

El azul aparece con varios valores casi idénticos, escritos a mano en distintas plantillas a lo largo del tiempo:

| Variante | Usos | Dónde |
|---|---|---|
| `#039fd9` | 57 | Canónico. Hoja principal + inline |
| `#03a0d9` | 12 | Overrides inline (`.suscribe_button_course`, wizard de formularios) |
| `#00a0da` | 4 | Bloque de matriculación de Tutor LMS |
| `#019fde` | 5 | Inline suelto |
| `#23a0d7` · `#1294c3` | 7 | Inline suelto |
| `#0074db` | 1 | `a{color:#0074db}` — **valor por defecto de Oxygen, no de marca** |
| `#1e73be` | 4 | `.ct-link-button` — **valor por defecto de Oxygen, no de marca** |

**El primario es `#039fd9`.** Las otras son derivas de copiar-pegar dentro de un rango de ±3 en cada canal; no son una escala intencionada. `#0074db` y `#1e73be` vienen del framework Oxygen sin personalizar y **no deben adoptarse**.

Transparencias del azul, útiles como tokens de estado suave:
`rgba(3,159,217,0.24)` ×4 · `rgba(3,159,217,0.15)` · `rgba(3,159,217,0.09)` · `#039fd912` y `#039fd924` (fondo y borde de radio-button) · `#00a0da1f` (fondo de precio).

### Hallazgo importante: el sitio ya es oscuro

```css
html { background-color:#151823 !important; }
body { line-height:1.6; font-size:18px; font-weight:400; color:#404040 }
```

`#151823` es el fondo global del sitio y se repite en 25 secciones. La escala oscura `#0e1019` → `#151823` → `#1e2230` es el sistema de superficies real de Pluranza, no una zona aislada.

Esto refuerza el requisito de que el player siga oscuro: **no es una excepción al sistema de marca, es el sistema de marca.** El esquema claro del dashboard es la desviación deliberada, y conviene tratarlo como tal.

Nota: `body{color:#404040}` (gris oscuro) sobre `html{background:#151823}` es una incoherencia del propio sitio — funciona sólo porque cada sección repinta su color de texto. No la reproduzcas.

---

## 2. Tipografía

### Familia — **no determinable con certeza**

```css
body { font-family:'myriadpro' }
h1,h2,h3,h4,h5,h6 { font-family:'myriadpro'; font-size:36px; font-weight:700 }
```

También aparece `font-family: Myriad PRO, Sans-serif` en dos reglas inline.

**El sitio no sirve esa fuente.** Verificado:
- **cero** reglas `@font-face` en los 4 archivos CSS y en los 13 bloques inline
- **cero** referencias a archivos `.woff`, `.woff2`, `.ttf`, `.otf`, `.eot` en todo el HTML y todo el CSS
- **cero** enlaces a `fonts.googleapis.com` o `fonts.gstatic.com`

Consecuencia: `'myriadpro'` no resuelve en ningún navegador salvo que la máquina del visitante tenga Myriad Pro instalada localmente (habitual sólo con Adobe CC). Para el resto del mundo el sitio cae al sans-serif por defecto del sistema. **La tipografía que ve la mayoría de usuarios de Pluranza no es una decisión de marca, es el fallback del navegador.**

Además Myriad Pro es una fuente comercial de Adobe: no tiene licencia de web font redistribuible, no se puede autoalojar sin comprarla, y no hay archivo que copiar del sitio.

**No lo aproximo.** Necesito tu decisión (Parte 2 queda bloqueada en este punto):

- **(a)** Licenciar Myriad Pro como web font vía Adobe Fonts — es la única forma de cumplir la declaración literal.
- **(b)** Sustituir por una equivalente libre. Myriad Pro es una grotesca humanista; los sustitutos cercanos son **Source Sans 3** (de Adobe, diseñada por el mismo linaje, es el reemplazo más fiel y es libre) o **Open Sans**. Recomiendo **Source Sans 3**.
- **(c)** Stack de sistema, que es lo que hoy ve de facto la mayoría del tráfico.

Recomiendo **(b) Source Sans 3**: respeta la intención declarada, es gratuita, se autoaloja y soporta `tabular-nums` (relevante para la excepción de las cifras).

### Escala de tamaños — determinada

Oxygen la escribe como selectores agrupados en cascada; resuelta:

| Elemento | `font-size` | `font-weight` | Origen |
|---|---|---|---|
| h1 | `36px` | `700` | `h1,h2,h3,h4,h5,h6{font-size:36px;font-weight:700}` |
| h2 | `30px` | `600` | `h2,h3,h4,h5,h6{font-size:30px;font-weight:600}` |
| h3 | `24px` | `600` | `h3,h4,h5,h6{font-size:24px;font-weight:600}` |
| h4 | `20px` | heredado | `h4,h5,h6{font-size:20px}` |
| h5 | `18px` | heredado | `h5,h6{font-size:18px}` |
| h6 | `16px` | heredado | `h6{font-size:16px}` |
| **cuerpo** | **`18px`** | **`400`**, `line-height:1.6` | `body{...}` |

Tamaños más frecuentes en todo el CSS (sirven de escala secundaria):
`25px` ×21 · `15px` ×21 · `16px` ×20 · `20px` ×16 · `18px` ×16 · `17px` ×16 · `19px` ×15 · `14px` ×13 · `13px` ×10 · `12px` ×5

Pesos usados: `400` (cuerpo), `500`, `600` (h2/h3 y botones), `700` (h1, `.discount_plans`).

Botones: `font-size` entre `20px` y `26px` con `font-weight:600`, a veces `text-transform:uppercase` (`.tutor-add-to-cart-button`).

---

## 3. Radios

| Valor | Usos | Tipo de elemento |
|---|---|---|
| **`100px`** | **30** (25 + 5 `!important`) | **Botones y píldoras — el radio característico de Pluranza** |
| **`10px`** | **24** | **Tarjetas y contenedores** (`.card_icon_text`, `.card_teachers`, `.item_promos`) |
| `8px` | 8 | Contenedores menores |
| `5px` | 8 | Inputs, badges (`.discount_plans`, radio-labels de formulario) |
| `3px` | 2 | `.ct-link-button` — **defecto de Oxygen, ignorar** |
| `50px` · `1000px` · `999em` | 4 | Variantes de píldora escritas a mano, equivalentes a `100px` |
| `50%` | 1 | Avatares circulares |

Sistema real: **píldora completa para botones, `10px` para tarjetas, `5px` para inputs y badges.**

---

## 4. Sombras

El sitio casi no usa sombra. Las únicas reglas presentes:

| Valor | Contexto |
|---|---|
| `2px 2px 5px 2px rgba(41,47,89,0.19)` | Tarjeta |
| `0px 3px 8px 0px rgba(26,26,26,0.1)` | Elevación suave |
| `0px 0px 10px 1px #000000` | Sobre oscuro (escrito `00px`, typo del original) |
| `box-shadow: px px px px` | Regla rota en el CSS de producción |
| `0 0 0 2px var(--wpforms-icon-choices-color), 0 2px 10px rgba(0,0,0,0.15)` | Plugin de formularios, no es marca |

**Conclusión: Pluranza no separa superficies con sombra, las separa con color** (`#0e1019`/`#151823`/`#1e2230`) y con borde `#184059`. El reskin del player debe hacer lo mismo: elevación por color, sombra sólo donde haga falta separar del video. La sombra de dos valores útiles queda documentada arriba por si se necesita en el dashboard claro.

---

## 5. Espaciado

Frecuencia de `padding` y de `margin`/`gap` en la hoja principal:

| Valor | padding | margin/gap |
|---|---|---|
| `5px` | 14 | 20 |
| `8px` | 27 | 4 |
| `10px` | 66 | 43 |
| `15px` | 41 | 23 |
| **`20px`** | **76** | **110** |
| `30px` | 20 | 29 |
| `40px` | 26 | — |
| `50px` | 11 | 3 |
| `75px` | 4 (secciones) | — |

**Escala base: 5px**, con los pasos `5 · 10 · 15 · 20 · 30 · 40 · 50`. `20px` es el paso dominante y el ritmo por defecto. Padding de sección: `75px` vertical, `20px` horizontal. Ancho de contenido: `max-width:1120px` (`1400px` en el contenedor externo).

---

## 6. Botones

### Primario — patrón confirmado en ~8 reglas independientes

```css
background-color: #039fd9;
border: 1px solid #039fd9;
color: #ffffff;
padding: 10px 16px;        /* también 15px 20px, 8px 12.8px según plantilla */
border-radius: 100px;
font-weight: 600;
```
Origen: `.ilc_cta_button`, `.button_lp_pay`, `.form_abduf button`, `.container_form_wizard button[type=submit]`, `.single_exam .tutor-btn-primary`, `.complete_class_button_disable`, `.tutor-add-to-cart-button`, `.login_form_style .tml-button`.

### Hover — **cambia de azul a verde**

```css
background-color: #1bb185;
border: 1px solid #1bb185;
```
Origen: `.ilc_cta_button:hover`, `.button_lp_pay:hover`, `.form_abduf button:hover`, `.filter_button_cat:hover`, `.single_exam .tutor-btn-primary:hover`, `.wpforms-submit:hover`, `#link-13-20084:hover`.

Es la convención de interacción más consistente del sitio: **el hover no oscurece el azul, salta al verde `#1bb185`.** Es una firma de marca, no un accidente.

### Secundario

```css
/* outline */
.tutor-btn-primary-outline        { border:1px solid #039fd9; color:#039fd9; background:transparent }
.tutor-btn-primary-outline:hover  { background:#039fd9; border-color:#039fd9; color:#fff }

/* verde sólido, para acciones de precio/matrícula */
.price_admin_subscription_button  { background-color:#1bb185; border:1px solid #1bb185; color:#fff; padding:8px 12.8px }
```

### Estado activo

No hay ninguna regla `:active` ni `:focus-visible` en todo el CSS del sitio. **No determinable.** Habrá que definirlos nosotros; los propondré derivados del sistema en la Parte 1, no copiados.

---

## 7. Contraste WCAG de los valores extraídos

Calculado sobre los valores literales, fórmula WCAG 2.1 de luminancia relativa.

| Par | Ratio | AA normal (4.5) | AA grande / UI (3.0) |
|---|---|---|---|
| `#ffffff` sobre `#151823` | **17.69** | ✅ | ✅ |
| `#ff9f1c` sobre `#151823` | **8.62** | ✅ | ✅ |
| `#1bb185` sobre `#151823` | **6.47** | ✅ | ✅ |
| `#039fd9` sobre `#151823` | **5.87** | ✅ | ✅ |
| `#039fd9` sobre `#1e2230` | **5.25** | ✅ | ✅ |
| `#404040` sobre `#ffffff` | **10.37** | ✅ | ✅ |
| `#0074db` sobre `#ffffff` | **4.64** | ✅ | ✅ |
| **`#ffffff` sobre `#039fd9`** (botón primario) | **3.02** | ❌ | ✅ |
| **`#ffffff` sobre `#1bb185`** (botón hover) | **2.74** | ❌ | ❌ |
| **`#039fd9` sobre `#ffffff`** (azul en dashboard claro) | **3.02** | ❌ | ✅ |

### Dos fallos reales que hereda el reskin

**1. El texto blanco del botón primario de Pluranza no pasa AA.** `#fff` sobre `#039fd9` da 3.02:1, por debajo de 4.5. Sólo pasa si el texto es "grande" (≥18.66px bold o ≥24px normal) — y de hecho los botones del sitio usan 20–26px/600, así que en su contexto *cumple por tamaño*. En el player, los botones son más pequeños: ahí **no cumpliría**. En hover es peor: `#fff` sobre `#1bb185` da 2.74:1 y no pasa ni como texto grande.

**2. El azul de marca sobre blanco no pasa AA para texto normal** (3.02:1), exactamente el caso que anticipaste. Sirve para elementos de interfaz y texto grande, no para cuerpo ni enlaces pequeños en el dashboard claro.

Sobre superficie oscura el azul sí pasa holgadamente (5.87:1), así que **no hace falta una variante aclarada para el player** — al contrario de lo previsto. Donde hace falta variante es en el esquema **claro**, oscureciendo. Calculé ambas direcciones por si acaso:

| Variante aclarada | Hex | sobre `#151823` | sobre `#1e2230` |
|---|---|---|---|
| +15 % | `#29addf` | 6.86 | 6.13 |
| +25 % | `#42b7e2` | 7.67 | 6.86 |
| +30 % | `#4fbce4` | 8.13 | 7.27 |

Útiles si se quiere más brillo en foco o en enlaces del player, todas pasan AA con margen.

---

## 8. Nota para la Parte 1 — color de estado de práctica

Todavía no propongo el token, pero la extracción ya acota el campo, y conviene que lo sepas antes de confirmar:

- El azul `#039fd9` queda ocupado por marca.
- **El verde `#1bb185` no sirve como estado de práctica**: en el sistema de Pluranza el verde ya significa *hover / confirmación*, y además es el color que hoy usa el player provisional (`#4ADE80`). Reusarlo mantendría la ambigüedad que la tarea quiere eliminar.
- **`#ff9f1c` es el candidato fuerte.** Es un color de marca real (9 usos, ya usado como acento), tiene 8.62:1 sobre `#151823` (el mejor de la paleta después del blanco), es ámbar contra azul cian — máxima separación de tono, distinguible también en los tipos comunes de daltonismo, donde azul y verde sí se confunden entre sí. Lo justificaré formalmente en el reporte de la Parte 1.

---

## 9. Resumen: lo que no se pudo determinar

Listado explícito, sin aproximar:

1. **El archivo de fuente de marca.** Declarada `'myriadpro'`, no servida, sin `@font-face`, sin archivo, licencia comercial. Requiere tu decisión entre (a) licenciar, (b) sustituir por Source Sans 3, (c) stack de sistema.
2. **Estados `:active` y `:focus-visible` de los botones.** No existe ninguna regla en el CSS del sitio. Habrá que definirlos.
3. **Escala de espaciado intencionada.** Inferida por frecuencia (base 5px), no declarada en ninguna parte — Oxygen escribe valor por valor.
4. **Un esquema claro de marca.** El sitio es íntegramente oscuro. Para el dashboard no hay superficies claras de Pluranza que copiar más allá de `#ffffff` y los grises; la paleta clara habrá que derivarla del azul de marca, no extraerla.
5. **Sistema de sombras.** Prácticamente inexistente y con dos reglas rotas en producción. Elevación por color, no por sombra.

---

**Parte 0 completa. Espero confirmación antes de seguir con la capa de tokens (Parte 1).**
