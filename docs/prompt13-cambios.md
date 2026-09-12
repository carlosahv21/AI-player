# Prompt 13 — Diagnóstico del loop y cambios tras la revisión

**Fecha:** 2026-09-11
**Alcance:** solo esta carpeta. La adaptación al plugin de WordPress queda pendiente.

---

## Parte 0 — Diagnóstico del loop

Probé las 11 combinaciones contra el store y el `VideoEngine` reales, con un
elemento de video falso que permite simular la pestaña en segundo plano.

| Caso | Antes |
|---|---|
| Infinito + play, pestaña visible | ✅ |
| Finito (×3), termina y libera | ✅ |
| Creado en pausa | ✅ |
| Velocidad 2x | ✅ |
| Espejo activo | ✅ |
| Rango cerca del final | ✅ |
| Dos loops seguidos sin limpiar | ✅ |
| Frames lentos (pestaña atenuada) | ✅ |
| **Pestaña oculta / solo `timeupdate`** | ❌ |

**Una sola causa estructural, y es la que sospechabas.** Dos mitades:

1. `requestVideoFrameCallback` no corre con la pestaña en segundo plano, y
   `onFrame` era el único sitio que hacía el seek de vuelta.

2. `onTimeUpdate` no podía servir de red de seguridad por su propio guard:

```ts
if (loop && this.element.currentTime >= loop.end) return;
```

El único momento en que hace falta atender el loop es justo el que descartaba.
No llegaba tarde: **no llegaba nunca**.

**Medición:** con el loop en 10–12 s y solo `timeupdate`, el elemento llegó a
**16 s** — 4 segundos fuera del rango en 6 de reproducción, sin límite — y el
store se congeló en 12.00 con `repeatsDone = 0`.

Lo que veía el usuario: volvía a la pestaña y el audio seguía muy por delante
del loop, con la barra parada al final del rango.

### Corrección

Las dos rutas comparten ahora `handleFrame()`, que es idempotente: si el store
ya devolvió el tiempo dentro del rango, la segunda llamada no ve cruce. El
guard desaparece y `timeupdate` — que sí sigue disparándose con la pestaña
oculta — actúa de red de seguridad.

**Regresión cubierta** en `tests/loopregression.test.ts` (7 tests). Verifiqué
que fallan de verdad: reponiendo el guard, 2 de los 7 se ponen en rojo.

---

## Parte 1 — Loop sin confirmación

- **"Empezar loop" eliminado.** El rango se aplica en cuanto es válido:
  al elegir sección o paso, al soltar una manija, y con las flechas del teclado.
- **Con el video reproduciendo, entra al loop directamente.** Verificado en
  navegador: `paused` sigue en `false` al definirlo.
- **"Cancelar" → "Cerrar"**, y solo cierra el panel.
- **Selector de repeticiones al fondo del panel.**

Un matiz: el seek al inicio del rango solo ocurre si la cabeza está fuera del
nuevo rango. Arrastrando una manija el usuario ya está desplazándose, y tirar
de la cabeza en cada movimiento hacía imposible el ajuste fino.

---

## Parte 2 — Barra de progreso

- **Reanuda al soltar el arrastre.** Solo tras un arrastre real: un clic simple
  en un video pausado sigue siendo un seek, no una orden de reproducir.
- **Vista previa sobre la línea de tiempo**, al pasar el cursor: miniatura,
  nombre de sección y tiempo.
- **Mosaicos en el panel de loop** para los dos extremos del rango.
- **Barra en el azul de marca** (`--aivp-brand`, 5.87:1 sobre el carril). El
  rango de loop sigue en ámbar, así que "cuánto llevo" y "estoy en práctica"
  nunca se leen como la misma señal.

### Miniaturas

Campo opcional en el payload:

```ts
preview?: { spriteUrl: string; vttUrl: string } | null;
```

**El player no depende de él.** Sin `preview`, sin red, o con un VTT ilegible,
no se renderiza nada y todo lo demás funciona igual — comprobado en navegador,
sin errores de consola. El parser de VTT con fragmentos `#xywh` está escrito a
mano: es una expresión regular y un split, no hace falta una dependencia.

Para verlas en producción hace falta que Bunny exponga esas dos URLs desde el
lado del plugin.

---

## Parte 3 — Gestos

Implementado el modelo propuesto, sin problemas que reportar.

| Entrada | Gesto |
|---|---|
| Escritorio | Clic = play/pausa **instantáneo**. Sin doble clic para saltar. |
| Móvil/tableta, tercio central | Toque = play/pausa, sin retardo |
| Móvil/tableta, tercios laterales | Doble toque = ∓10 s; toque simple espera 250 ms |

**Pulsación sostenida:** 400 ms de umbral, 2x mientras se sostiene, arrastrar a
la derecha sube hasta 4x en pasos de 0.5. Al soltar restaura la velocidad
previa. Indicador visible con la velocidad actual.

**No se activa sobre los controles ni sobre las manijas del loop** — verificado
uno por uno en navegador.

La lista de velocidades del store llega a 4x (`ALLOWED_RATES`), pero el menú
sigue en 2x (`PLAYBACK_RATES`). Son dos listas distintas a propósito, y la
persistencia valida contra la del menú: **una velocidad de gesto nunca se
guarda como preferencia**.

### Un fallo que encontré por el camino

En móvil, la barra de controles tenía `pointer-events: auto` sobre toda su
caja, y su relleno superior (el degradado) **cubría el 54 % del fotograma**.
Se tragaba todos los toques: ni los gestos nuevos ni ningún toque en la mitad
inferior del video llegaban a la superficie. Ahora el contenedor es
transparente al puntero y sus hijos recuperan sus propios impactos. Los
controles siguen respondiendo — comprobado.

---

## Parte 4 — Interfaz

- **Menú de velocidad a la mitad de ancho**, centrado. Medido: 0.50 del ancho
  del player. En móvil sigue a ancho completo: la mitad de una pantalla
  estrecha no deja sitio para las etiquetas de los topes.
- **Selector de repeticiones al fondo del panel de loop.**

---

## Parte 5 — Envío a televisor

Confirmado el alcance contigo: AirPlay + Google Cast.

- **AirPlay** (Safari) por `webkitShowPlaybackTargetPicker`, y el botón aparece
  cuando el evento de disponibilidad dice que hay un destino en la red.
- **Google Cast** (Chrome) si la página anfitriona ya cargó la SDK. El player
  **no la descarga**: no voy a añadir una petición externa a todos los alumnos
  por una función que la mayoría no usará. El plugin decide si la carga.
- **Sin capacidad, no hay botón.** Comprobado: en Chromium sin SDK no se
  renderiza nada.

### La advertencia, confirmada

Al enviar a un televisor la reproducción la controla el receptor y el fotograma
deja de renderizarse localmente. **El espejo, el loop de precisión y el control
fino de velocidad dejan de funcionar.** Es un límite de la tecnología, no del
código.

**Decisión tomada: el botón se deshabilita mientras haya un loop activo**, con
un tooltip que explica por qué. Limpiar el loop automáticamente destruiría
trabajo del alumno sin que lo haya pedido; que el botón se explique es más
honesto que deshacer algo por él.

Conviene que el cliente lo sepa antes de descubrirlo en uso: **enviar al
televisor y practicar con precisión son modos excluyentes.**

---

## Verificación

| | |
|---|---|
| Tests unitarios | **94** (85 previos + 9 nuevos), todos en verde |
| Regresión del loop | 7 tests; comprobado que fallan si se repone el bug |
| Comprobaciones en navegador | **13/13** (`npm run check:gestures`) |
| `tsc --noEmit` | limpio |
| Build | correcto |

Los gestos y el arrastre viven en el DOM, así que no se pueden cubrir con el
suite unitario. `scripts/check-gestures.mjs` los ejecuta en Chromium real
(escritorio y iPhone emulado) contra `npm run dev`.

### Dependencia nueva

`playwright` en `devDependencies`, para esas comprobaciones. Solo desarrollo,
no entra en el bundle.

### Pendiente

- Adaptar al plugin de WordPress: emitir `preview` en el payload desde Bunny.
- Cargar la SDK de Cast desde el plugin si se quiere Chromecast en producción.
