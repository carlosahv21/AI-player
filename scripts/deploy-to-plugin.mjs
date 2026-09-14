// Copies the WordPress bundle into the plugin's assets/ folder.
// Override the destination with AIVP_PLUGIN_DIR.
import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

const DEFAULT_PLUGIN_DIR = resolve(projectRoot, "../ai-video-player-wp");
const pluginDir = resolve(process.env.AIVP_PLUGIN_DIR ?? DEFAULT_PLUGIN_DIR);
const assetsDir = resolve(pluginDir, "assets");
const buildDir = resolve(projectRoot, "dist-wp");

const FILES = ["aivp-player.js", "aivp-player.css"];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(pluginDir))) {
  console.error(
    `Plugin directory not found: ${pluginDir}\n` +
      "Set AIVP_PLUGIN_DIR to the plugin's root folder.",
  );
  process.exit(1);
}

await mkdir(assetsDir, { recursive: true });

for (const file of FILES) {
  const from = resolve(buildDir, file);
  if (!(await exists(from))) {
    console.error(`Missing build output: ${from}\nRun the build first.`);
    process.exit(1);
  }
  await copyFile(from, resolve(assetsDir, file));
  console.log(`copied ${file} -> ${resolve(assetsDir, file)}`);
}

const fontsFrom = resolve(buildDir, "fonts");
if (await exists(fontsFrom)) {
  const fontsTo = resolve(assetsDir, "fonts");
  await mkdir(fontsTo, { recursive: true });
  for (const file of await readdir(fontsFrom)) {
    await copyFile(resolve(fontsFrom, file), resolve(fontsTo, file));
    console.log(`copied fonts/${file}`);
  }
}
