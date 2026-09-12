# Cómo cambiar el tema del player

Hay tres formas, de más general a más concreta. La más específica gana.

| Dónde | Alcance | Cuándo usarla |
|---|---|---|
| Ajustes del plugin | Todo el sitio | Lo normal |
| Atributo del shortcode | Un reproductor | Una página distinta |
| `data-aivp-theme` en el contenedor | Un reproductor | HTML a mano |

Temas disponibles: **`pluranza`** (marca, por defecto) y **`aivp`** (paleta original).

---

## 1. Desde el admin de WordPress — todo el sitio

**Ajustes → AI Video Player → «Tema visual»**, elegir en el desplegable y
guardar. Afecta a todos los reproductores que no pidan otra cosa.

Antes esto no existía: el player ya sabía leer el ajuste, pero el plugin nunca
lo enviaba, así que no había forma de cambiarlo desde WordPress. Ahora se
guarda en la opción `aivp_settings` y sale en `AIVP_CONFIG.theme`.

## 2. En un shortcode — un solo reproductor

```
[aivp_video id="123"]                  → el tema del sitio
[aivp_video id="123" theme="aivp"]     → solo este, con la paleta original
```

## 3. En HTML propio — un solo reproductor

```html
<div data-aivp-video="123" data-aivp-theme="aivp"></div>
```

Sin `data-aivp-theme`, toma el del sitio.

---

## Qué pasa si el valor está mal

Cae al tema por defecto (`pluranza`). Nunca deja el reproductor sin pintar, que
es lo que ocurriría si se aplicase un tema inexistente: los componentes se
quedarían sin tokens. La validación está en un solo sitio, `Plugin::valid_theme()`,
y tanto el formulario como el atributo pasan por ella.

Comprobado con los tres casos (sin atributo, con atributo válido, con atributo
inválido): cada uno resuelve al tema esperado.

## Añadir un tema nuevo

1. Copiar `src/styles/themes/pluranza.css`, cambiar valores, dejar **los mismos
   nombres de token** (hay un test que falla si un tema declara un conjunto
   distinto del otro).
2. Importarlo en `src/styles/index.css`.
3. Añadirlo a `AivpTheme` en `src/ui/Player.tsx` y a la lista de válidos en
   `src/mount.tsx`.
4. En el plugin, añadir una línea a `Plugin::THEMES`. El desplegable de ajustes
   y la validación leen de ahí, así que no hay nada más que tocar.

---

## Archivos del plugin que cambiaron

| Archivo | Cambio |
|---|---|
| `src/Plugin.php` | `THEMES`, `valid_theme()`, y `'theme'` en los defaults |
| `src/Admin/SettingsPage.php` | Desplegable en el formulario + sanitización |
| `src/Frontend/PlayerAssets.php` | `theme` dentro de `AIVP_CONFIG` |
| `src/Frontend/PlayerRenderer.php` | Imprime `data-aivp-theme` si se pidió uno |
| `src/Frontend/Shortcode.php` | Atributo `theme` |

**No pude ejecutar `phpcs` ni los tests del plugin: no hay PHP en esta máquina.**
Verifiqué las llaves y paréntesis balanceados y la alineación que exige el
estándar, pero conviene pasar `composer lint` antes de desplegar.

El bloque de Gutenberg no cambió: llama a `PlayerRenderer::render()` con un solo
argumento y el segundo tiene valor por defecto, así que sigue funcionando igual.

---

## Herramientas del banco de pruebas

En `npm run dev`, el conmutador de tema ya no ocupa una franja arriba. Es un
punto en la esquina superior derecha que se abre al pulsarlo, y **desaparece
por completo cuando el player pasa a pantalla completa o a modo cine**, así que
sólo se ve el video. `dev/wp-sim/` reproduce el HTML que imprime WordPress para
comprobar los tres casos de precedencia.
