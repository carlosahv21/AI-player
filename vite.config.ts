import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const projectRoot = resolve(__dirname);
const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

// AIVP_TARGET=wp builds the self-contained IIFE the WordPress plugin loads:
// one JS, one CSS, stable names, React bundled in. Default stays the ES
// library build used by the test bench and by package consumers.
const wordpressBuild = process.env.AIVP_TARGET === "wp";

/**
 * Saca las fuentes del CSS a archivos propios.
 *
 * En modo `lib` Vite incrusta como base64 todo asset referenciado desde
 * CSS, y `assetsInlineLimit` no lo gobierna: una libreria no puede saber
 * donde viviran sus archivos, asi que los mete dentro. Aqui si lo sabemos
 * —el plugin los sirve desde `fonts/`, junto al CSS—, de modo que se
 * extraen despues de generar el bundle.
 *
 * Importa por dos motivos: base64 infla cada woff2 un tercio (15 kB pasan
 * a 46 kB) y ese peso viaja en CADA carga del CSS, mientras que un archivo
 * aparte lo cachea el navegador y sobrevive a cualquier cambio de estilos.
 */
function extractFonts() {
  return {
    name: "aivp-extract-fonts",
    // `post` para leer el CSS ya generado, no el intermedio.
    enforce: "post" as const,
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      const emit = (this as any).emitFile.bind(this);

      for (const asset of Object.values(bundle)) {
        if (asset.type !== "asset" || !asset.fileName.endsWith(".css")) continue;

        asset.source = String(asset.source).replace(
          /url\(data:font\/(woff2?|ttf|otf);base64,([A-Za-z0-9+/=]+)\)/g,
          (_match: string, ext: string, b64: string) => {
            const source = Buffer.from(b64, "base64");
            // Nombre por contenido: dos pesos distintos nunca colisionan, y
            // el mismo archivo reconstruido conserva su nombre.
            const hash = createHash("sha256")
              .update(source)
              .digest("hex")
              .slice(0, 8);
            const fileName = `fonts/aivp-${hash}.${ext}`;

            if (!bundle[fileName]) {
              emit({ type: "asset", fileName, source });
            }

            // Relativo al CSS, que se sirve junto a la carpeta fonts/.
            return `url(./${fileName})`;
          },
        );
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  root: command === "serve" ? resolve(projectRoot, "dev") : projectRoot,
  plugins: [react(), extractFonts()],
  define: {
    __AIVP_VERSION__: JSON.stringify(version),
    // React ships inside the WordPress bundle and reads process.env.NODE_ENV,
    // which does not exist in a browser: without this the bundle throws
    // "process is not defined" before it can assign window.AIVP.
    ...(wordpressBuild
      ? { "process.env.NODE_ENV": JSON.stringify("production") }
      : {}),
  },
  css: {
    modules: {
      generateScopedName: "aivp-[local]_[hash:base64:6]",
    },
  },
  // ponytail: dev serves dev/public (sample.mp4); the lib build ships no assets
  publicDir: command === "serve" ? resolve(projectRoot, "dev/public") : false,
  server: {
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: resolve(projectRoot, wordpressBuild ? "dist-wp" : "dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(projectRoot, "src/index.ts"),
      // not "AIVP": the bundle's own global would overwrite the object the
      // entry point assigns to window.AIVP
      name: "AIVPBundle",
      fileName: () => (wordpressBuild ? "aivp-player.js" : "ai-video-player.js"),
      formats: [wordpressBuild ? "iife" : "es"],
    },
    rollupOptions: {
      // the theme may not load wp-element on the front end, so React ships
      // inside the WordPress bundle
      external: wordpressBuild
        ? []
        : ["react", "react-dom", "react/jsx-runtime"],
      output: {
        inlineDynamicImports: wordpressBuild,
        assetFileNames: (info) => {
          const name = info.name ?? "";
          if (/\.(woff2?|ttf|otf)$/i.test(name)) {
            return "fonts/[name][extname]";
          }
          return wordpressBuild
            ? "aivp-player[extname]"
            : "ai-video-player[extname]";
        },
      },
    },
  },
  test: {
    root: projectRoot,
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
}));
