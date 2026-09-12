# Miniaturas de vista previa

El player las lee del payload:

```ts
preview?: { spriteUrl: string; vttUrl: string } | null;
```

Sin ese campo no se renderiza vista previa y todo lo demás funciona igual.
Son dos archivos: una hoja de sprites con todos los fotogramas, y un WebVTT
que mapea cada tramo de tiempo a un recorte de esa hoja.

## En producción: Bunny

Bunny genera ambos automáticamente para los videos de su biblioteca. El plugin
solo tiene que pasar las dos URLs en el payload. **Nada de esto hay que
construirlo a mano.**

## En el banco de pruebas

`dev/public/sprite.png` y `sprite.vtt` se generaron del propio `sample.mp4`,
para poder ver fotogramas reales sin depender de Bunny. Así se regeneran si
cambia el video de muestra:

```bash
# duración exacta
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 dev/public/sample.mp4)

# 40 fotogramas de 160x90 en una rejilla de 8x5
ffmpeg -y -i dev/public/sample.mp4 \
  -vf "fps=40/$DUR,scale=160:90,tile=8x5" \
  -frames:v 1 dev/public/sprite.png
```

Y el VTT, un cue por fotograma con su recorte en `#xywh`:

```
WEBVTT

00:00:00.000 --> 00:00:00.548
sprite.png#xywh=0,0,160,90

00:00:00.548 --> 00:00:01.097
sprite.png#xywh=160,0,160,90
...
```

`x` avanza `160` por columna y vuelve a `0` cada 8; `y` avanza `90` por fila.

## Formato que entiende el parser

`src/ui/hooks/usePreviewSprite.ts`, escrito a mano porque es una expresión
regular y un split:

- Marcas de tiempo `hh:mm:ss.mmm` o `mm:ss.mmm`.
- Carga útil del cue: una URL con fragmento `#xywh=x,y,ancho,alto`.
- Cues sin `#xywh`, con números inválidos o con ancho/alto ≤ 0 se descartan
  en silencio.
- Si no queda ningún cue válido, el resultado es `null` y no se renderiza
  nada: un sprite roto es una función ausente, no un error que mostrar.

La URL del sprite viene del campo `spriteUrl` del payload, no del cue, así que
lo que el VTT escriba antes del `#` da igual.

## Dónde aparecen

- **Sobre la línea de tiempo**, al pasar el cursor: fotograma, nombre de
  sección y tiempo.
- **En el panel de loop**, dos mosaicos con los fotogramas de los extremos del
  rango, que es lo que permite recortar sin ir probando.
