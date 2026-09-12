import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const projectRoot = resolve(__dirname);
const { version } = createRequire(import.meta.url)("./package.json") as {
  version: string;
};

// AIVP_TARGET=wp builds the self-contained IIFE the WordPress plugin loads:
// one JS, one CSS, stable names, React bundled in. Default stays the ES
// library build used by the test bench and by package consumers.
const wordpressBuild = process.env.AIVP_TARGET === "wp";

export default defineConfig(({ command }) => ({
  root: command === "serve" ? resolve(projectRoot, "dev") : projectRoot,
  plugins: [react()],
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
        assetFileNames: wordpressBuild
          ? "aivp-player[extname]"
          : "ai-video-player[extname]",
      },
    },
  },
  test: {
    root: projectRoot,
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
}));
