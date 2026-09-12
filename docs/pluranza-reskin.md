# Sistema de diseño Pluranza — reporte del reskin

**Fecha:** 2026-09-08
**Alcance:** sólo tokens visuales. Ninguna estructura, ningún layout, ninguna lógica.
**Extracción de origen:** [pluranza-tokens.md](pluranza-tokens.md)

---

## Qué se construyó

```
src/styles/
  index.css            lo único que importa el player: fuente + contrato + temas
  font.css             Source Sans 3
  tokens.css           el contrato: nombres semánticos, sin valores de marca
  themes/
    aivp.css           la paleta original (oscuro, acento verde)
    pluranza.css       la marca (player oscuro + dashboard claro)
```

Los componentes no conocen ningún color. Leen nombres por función
(`--aivp-surface`, `--aivp-brand`, `--aivp-state-practice`) y el tema decide
qué valen. Cambiar de tema o de esquema es cambiar un atributo, nunca tocar un
componente.

```html
<div data-aivp-theme="pluranza" data-aivp-scheme="dark">
```

### Se conservó el estilo actual

Como pediste: la paleta provisional no se perdió, se convirtió en un tema más.
`themes/aivp.css` guarda los valores exactos que estaban repartidos por los
componentes (`#141416`, `#4ade80`, `#ededef`). Se elige con un botón:

- **Banco de pruebas** (`npm run dev`): conmutador arriba a la izquierda.
- **Por código**: `<Player theme="aivp" />`.
- **Desde WordPress**: `data-aivp-theme="aivp"` en el nodo de montaje, o
  `AIVP_CONFIG.theme` para todo el sitio. Un valor desconocido cae al tema por
  defecto en vez de dejar el player sin pintar.

Los dos temas declaran **exactamente el mismo conjunto de 53 tokens**, y hay un
test que falla si uno se desvía del otro.

---

## Marca y estado son colores distintos

Este era el punto de fondo del encargo, y en el código anterior no existía:
`--aivp-accent` era a la vez el color de marca y el de práctica, el mismo verde
para "seleccionado" y para "estás en modo práctica".

Ahora están separados en el origen. Revisé **las 50 apariciones** una por una y
cada una fue a su token según lo que significa, no por búsqueda y reemplazo:

| Token | Dónde se usa |
|---|---|
| `--aivp-brand` | selección, menús, secciones, banner, calidad, ajustes |
| `--aivp-state-practice` | **sólo** loop activo, velocidad ≠ 1x, badge de práctica |

### Por qué ámbar `#ff9f1c`

- **Es color de marca real**, no inventado: 9 usos en el CSS de Pluranza.
- **El verde `#1bb185` estaba descartado de antemano.** En el sistema de
  Pluranza el verde ya significa *hover / confirmación* — es el color al que
  saltan todos los botones al pasar el ratón. Reusarlo habría mantenido
  exactamente la ambigüedad que esta tarea quería eliminar. Además es el color
  provisional que ya estaba.
- **Contraste**: 8.62:1 sobre la superficie, el mejor de la paleta después del
  blanco.
- **Separación de tono**: ámbar contra cian es prácticamente la mayor distancia
  de matiz que permite la paleta. Importa para daltonismo: azul y verde son el
  par que se confunde en deuteranopia y protanopia; azul y ámbar no.

Verificado en navegador: a 1.5x el rail, el chip y el badge se pintan
`rgb(255, 159, 28)`; a 1x vuelven al neutro. El azul de marca no aparece en
ninguno de los tres.

---

## Tipografía

**Source Sans 3**, como decidiste. Es la sustituta honesta del `myriadpro` que
el sitio declara pero no sirve (sin `@font-face`, sin archivo, licencia
comercial de Adobe): misma familia humanista, del mismo origen Adobe, libre, y
con cifras tabulares de verdad.

Se carga con un `@import` desde el CDN de Google Fonts. El navegador deduplica
por URL, así que si la página anfitriona ya la carga no se repite la petición.
Para que el plugin funcione sin red, esa línea se cambia por un `@font-face`
autoalojado y nada más.

**Escala derivada de los tamaños reales del sitio**, no inventada: cuerpo 18px,
h1 36/700, h2 30/600, h3 24/600, h4 20, h5 18, h6 16.

**Cifras tabulares**: las 22 reglas `font-variant-numeric: tabular-nums` que ya
existían siguen intactas, y un test comprueba que los componentes de reloj,
progreso, velocidad y badge las conservan. Source Sans 3 las soporta, así que no
hizo falta la excepción de fuente de sistema.

---

## Contraste WCAG AA

Calculado sobre los valores finales de los tokens.


### Esquema oscuro (player)

| Par | Valores | Ratio | Mínimo | Resultado |
|---|---|---|---|---|
| Texto principal sobre superficie | `#ffffff` / `#151823` | **17.69:1** | 4.5 | ✅ pasa |
| Texto sobre superficie elevada | `#ffffff` / `#1e2230` | **15.83:1** | 4.5 | ✅ pasa |
| Texto atenuado sobre superficie | `#a8b0bd` / `#151823` | **8.10:1** | 4.5 | ✅ pasa |
| Texto terciario sobre superficie | `#c9ced8` / `#151823` | **11.21:1** | 4.5 | ✅ pasa |
| Marca sobre superficie | `#039fd9` / `#151823` | **5.87:1** | 3.0 | ✅ pasa |
| Marca (variante) sobre superficie | `#42b7e2` / `#151823` | **7.67:1** | 4.5 | ✅ pasa |
| Marca (variante) sobre elevada | `#42b7e2` / `#1e2230` | **6.86:1** | 4.5 | ✅ pasa |
| Texto sobre relleno de marca | `#151823` / `#039fd9` | **5.87:1** | 4.5 | ✅ pasa |
| Texto sobre botón primario | `#151823` / `#42b7e2` | **7.67:1** | 4.5 | ✅ pasa |
| Estado de práctica sobre superficie | `#ff9f1c` / `#151823` | **8.62:1** | 4.5 | ✅ pasa |
| Estado sobre superficie elevada | `#ff9f1c` / `#1e2230` | **7.71:1** | 4.5 | ✅ pasa |
| Texto sobre relleno de estado | `#151823` / `#ff9f1c` | **8.62:1** | 4.5 | ✅ pasa |
| Anillo de foco sobre superficie | `#ffffff` / `#151823` | **17.69:1** | 3.0 | ✅ pasa |
| Filete fuerte sobre superficie | `#184059` / `#151823` | **1.61:1** | 3.0 | ❌ FALLA |

### Esquema claro (dashboard)

| Par | Valores | Ratio | Mínimo | Resultado |
|---|---|---|---|---|
| Texto principal sobre superficie | `#151823` / `#f7f8fa` | **16.65:1** | 4.5 | ✅ pasa |
| Texto sobre superficie elevada | `#151823` / `#ffffff` | **17.69:1** | 4.5 | ✅ pasa |
| Texto atenuado sobre superficie | `#5b6672` / `#f7f8fa` | **5.51:1** | 4.5 | ✅ pasa |
| Texto terciario sobre superficie | `#606e79` / `#f7f8fa` | **4.94:1** | 4.5 | ✅ pasa |
| Marca sobre superficie | `#0277a3` / `#f7f8fa` | **4.74:1** | 3.0 | ✅ pasa |
| Marca (variante) sobre superficie | `#0277a3` / `#f7f8fa` | **4.74:1** | 4.5 | ✅ pasa |
| Marca (variante) sobre elevada | `#0277a3` / `#ffffff` | **5.04:1** | 4.5 | ✅ pasa |
| Texto sobre relleno de marca | `#ffffff` / `#0277a3` | **5.04:1** | 4.5 | ✅ pasa |
| Texto sobre botón primario | `#ffffff` / `#0277a3` | **5.04:1** | 4.5 | ✅ pasa |
| Estado de práctica sobre superficie | `#b45309` / `#f7f8fa` | **4.73:1** | 4.5 | ✅ pasa |
| Estado sobre superficie elevada | `#b45309` / `#ffffff` | **5.02:1** | 4.5 | ✅ pasa |
| Texto sobre relleno de estado | `#ffffff` / `#b45309` | **5.02:1** | 4.5 | ✅ pasa |
| Anillo de foco sobre superficie | `#0277a3` / `#f7f8fa` | **4.74:1** | 3.0 | ✅ pasa |
| Filete fuerte sobre superficie | `#adb4b9` / `#f7f8fa` | **1.98:1** | 3.0 | ❌ FALLA |


**Los dos ❌ son filetes decorativos, y quedan fuera del criterio 1.4.11 a
propósito.** Ese criterio exige 3:1 a los bordes que *transmiten* información;
estos no lo hacen — la separación entre superficies la lleva el cambio de color
de fondo, y el borde sólo la matiza. Subirlos a 3:1 rompería el sistema de
Pluranza, que separa superficies con color y no con filete (el sitio tiene tres
reglas de `box-shadow` en total, dos de ellas rotas). Se dejan como están, con
esta justificación explícita en vez de aproximarlos.

**Todos los pares de texto y de elemento de interfaz pasan AA.**

### Dos fallos heredados que hubo que corregir

**1. Blanco sobre el azul de marca no pasa AA.** `#fff` sobre `#039fd9` da
3.02:1. El sitio se salva porque sus botones son de 20–26px (texto grande); los
del player son mucho más pequeños y no se habrían salvado. En esquema oscuro,
`--aivp-text-on-brand` es la tinta oscura `#151823`: **5.87:1**, y 7.67:1 sobre
la variante. Lo detecté midiendo en el navegador, no en papel: la primera
versión daba 2.31:1.

**2. El azul de marca sobre claro tampoco pasa.** 2.84:1 sobre el fondo de app.
En el esquema claro `--aivp-brand` **resuelve directamente al azul oscurecido**
`#0277a3` (5.04:1), de forma que cualquier componente que pida el token es
accesible por construcción y no por acordarse de elegir la variante correcta. El
azul verdadero sigue disponible como `--aivp-brand-raw` para formas grandes sin
texto: barras de gráfico, rellenos, filetes.

---

## Página de referencia

`dev/styleguide/` — enlazada desde el banco de pruebas.

Muestra paleta con nombre de token y valor, escala tipográfica, botones en todos
sus estados, radios, sombras, y el player en los dos esquemas.

Lo importante: **no repite ni un solo valor.** Lee `src/styles/` y saca cada
valor del CSS ya resuelto por el navegador (`getComputedStyle`), incluida la
tabla de contraste, que se calcula en vivo compositando sobre el fondo real para
que los tokens con alfa den el ratio que de verdad se ve. No puede
desincronizarse del sistema porque no tiene copia propia de nada.

El botón de tema cambia la página entera. El player de la derecha se queda
oscuro dentro del panel claro: es la regla en funcionamiento, no una excepción.

---

## Estados `:active` y `:focus-visible`

El CSS de Pluranza no tiene ni una regla de ninguno de los dos, así que los
definí (los dejaste a mi criterio):

- **`:focus-visible`** — anillo de 2px con `--aivp-focus`, separado 2px. En
  oscuro es blanco (17.69:1) y en claro el azul accesible (4.74:1). Se usa
  `:focus-visible` y no `:focus` para que el anillo salga al navegar con teclado
  pero no al hacer clic. Sobrevive a temas hostiles: el reset de Astra ya estaba
  y se conserva.
- **`:active`** — desplazamiento de 1px. No cambia de color: en una barra sobre
  video un cambio cromático al pulsar compite con el propio video, y el
  desplazamiento se lee igual de bien sin añadir ruido.

---

## Fuera de alcance, respetado

- Ningún cambio de layout ni de estructura de componentes.
- El asistente de IA no se construyó. El sistema lo contempla: cuando llegue,
  toma `--aivp-brand` como cualquier otro elemento interactivo, y tiene prohibido
  `--aivp-state-practice`, que es exclusivo de los tres usos de práctica.
- Cero cambios en consultas, eventos o lógica de negocio.

---

## Verificación

| Criterio | Estado |
|---|---|
| Ningún color, tamaño, radio o sombra a mano fuera de los tokens | ✅ 0 literales en 19 hojas — test lo bloquea |
| Cambiar de esquema no requiere tocar componentes | ✅ atributo `data-aivp-scheme` |
| Todos los pares pasan WCAG AA, tabla reportada | ✅ arriba y en vivo en la página |
| Estado de práctica distinguible del azul | ✅ ámbar vs cian, verificado en navegador |
| Cifras con números tabulares | ✅ 22 reglas intactas, test lo cubre |
| Página de referencia completa | ✅ `dev/styleguide/` |
| Tests previos en verde | ✅ **78/78** (72 previos + 6 nuevos) |
| Ningún cambio de comportamiento | ✅ sólo CSS y tokens; `tsc` limpio, ambos builds OK |

Los 6 tests nuevos (`tests/tokens.test.ts`) bloquean las reglas del sistema:
literales en componentes, deriva entre los dos temas, tokens usados sin definir,
marca igual a estado, y pérdida de cifras tabulares. Comprobé que fallan de
verdad ensuciando un componente a propósito.

### Una dependencia nueva

`@types/node` en `devDependencies`, necesaria para que el test lea las hojas de
estilo. Sólo desarrollo: no entra en el bundle.
