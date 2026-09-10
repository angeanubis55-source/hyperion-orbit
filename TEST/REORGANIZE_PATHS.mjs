import { readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const moves = [];

function upperSnake(name) {
  const extension = extname(name).toLowerCase();
  const stem = extension ? name.slice(0, -extname(name).length) : name;
  return stem
    .replace(/-/g, "_")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase() + extension;
}

async function moveCaseSafe(from, to) {
  if (from === to) return;
  const temporary = `${to}.__CASE_TMP__`;
  await rename(from, temporary);
  await rename(temporary, to);
  moves.push([relative(root, from).replaceAll("\\", "/"), relative(root, to).replaceAll("\\", "/")]);
}

async function renameFiles(folder, extensions) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (!entry.isFile() || !extensions.has(extname(entry.name).toLowerCase())) continue;
    const next = upperSnake(entry.name);
    if (next !== entry.name) await moveCaseSafe(join(folder, entry.name), join(folder, next));
  }
}

await renameFiles(join(root, "SCRIPTS"), new Set([".js", ".mjs", ".py", ".ps1"]));
await renameFiles(join(root, "TEST", "UNIT_TESTS"), new Set([".js", ".mjs"]));
await renameFiles(join(root, "PUBLIC"), new Set([".js", ".html", ".css"]));

for (const entry of await readdir(join(root, "MAPS"), { withFileTypes: true })) {
  if (!entry.isDirectory() || !/[a-z-]/.test(entry.name) || /^\d+(?:[-.]\d+)+$/.test(entry.name)) continue;
  const next = upperSnake(entry.name);
  if (next !== entry.name) await moveCaseSafe(join(root, "MAPS", entry.name), join(root, "MAPS", next));
}
for (const entry of await readdir(join(root, "MAPS"), { withFileTypes: true })) {
  if (entry.isDirectory()) await renameFiles(join(root, "MAPS", entry.name), new Set([".js"]));
}

const coreNames = {
  "ACCOUNT.js": "ACCOUNT.js", "BOUNDED_COLLECTION.js": "BOUNDED_COLLECTION.js", "CATALOG.js": "CATALOG.js",
  "COLLISION.js": "COLLISION.js", "FACTIONS.js": "FACTIONS.js", "FIT_LAYOUT.js": "FIT_LAYOUT.js",
  "FRAME_SYSTEMS.js": "FRAME_SYSTEMS.js", "GALAXY_GATES.js": "GALAXY_GATES.js", "GAME_LOG_STORE.js": "GAME_LOG_STORE.js",
  "GATE_SYSTEM.js": "GATE_SYSTEM.js", "IMAGE_LOADER.js": "IMAGE_LOADER.js", "INPUT.js": "INPUT.js",
  "MAP_REGISTRY.js": "MAP_REGISTRY.js", "NUMBER_FORMAT.js": "NUMBER_FORMAT.js", "ORBIT_ENGINE.js": "ORBIT_ENGINE.js",
  "PERFORMANCE_MONITOR.js": "PERFORMANCE_MONITOR.js", "PERFORMANCE_TIMINGS.js": "PERFORMANCE_TIMINGS.js",
  "PORTAL_SYSTEM.js": "PORTAL_SYSTEM.js", "PROGRESSION.js": "PROGRESSION.js", "RADIATION_SYSTEM.js": "RADIATION_SYSTEM.js",
  "RENDERING.js": "RENDERING.js", "SFX.js": "SFX.js", "SPATIAL_INDEX.js": "SPATIAL_INDEX.js",
  "WAVES.js": "WAVES.js", "WORLD_LAYER_RENDERER.js": "WORLD_LAYER_RENDERER.js"
};
const dataNames = {
  "COLLECTABLES.js": "COLLECTABLES.js", "CRAFTING.js": "CRAFTING.js", "ITEM_RARITIES.js": "ITEM_RARITIES.js",
  "MODULE_DROPS.js": "MODULE_DROPS.js", "PATCH_NOTES.js": "PATCH_NOTES.js",
  "PATCH_NOTES_OVERRIDES.js": "PATCH_NOTES_OVERRIDES.js", "RESOURCES.js": "RESOURCES.js", "VERSION.js": "VERSION.js"
};

const replacements = new Map([
  ["SRC/MAIN.js", "SRC/MAIN.js"], ["SRC/CORE/", "SRC/CORE/"], ["SRC/DATA/", "SRC/DATA/"],
  ["SCRIPTS/", "SCRIPTS/"], ["PUBLIC/", "PUBLIC/"], ["MAPS/", "MAPS/"],
  ["TEST/REPORTS/", "TEST/REPORTS/"], ["TEST/UNIT_TESTS/", "TEST/UNIT_TESTS/"], ["TEST/TMP/", "TEST/TMP/"],
  ["TEST/FLASHLIB/", "TEST/FLASHLIB/"], ["TEST/LOGS/", "TEST/LOGS/"], ["PROFILE_WINDOW.css", "PROFILE_WINDOW.css"],
  ["ASSETS/", "ASSETS/"], ["BACKGROUNDS/", "BACKGROUNDS/"], ["AUDIO/", "AUDIO/"],
  ["ASSETS_MANIFEST.json", "ASSETS_MANIFEST.json"],
  ["/SRC/MAIN.js", "/SRC/MAIN.js"], ["/SRC/CORE/", "/SRC/CORE/"], ["/SRC/DATA/", "/SRC/DATA/"],
  ["/PUBLIC/", "/PUBLIC/"], ["/MAPS/", "/MAPS/"],
  ["../SRC/CORE/", "../SRC/CORE/"], ["../SRC/DATA/", "../SRC/DATA/"],
  ["../../SRC/CORE/", "../../SRC/CORE/"], ["../../SRC/DATA/", "../../SRC/DATA/"],
]);
for (const [oldName, newName] of Object.entries(coreNames)) replacements.set(oldName, newName);
for (const [oldName, newName] of Object.entries(dataNames)) replacements.set(oldName, newName);
for (const [from, to] of moves) {
  replacements.set(from, to);
  replacements.set(`/${from}`, `/${to}`);
  replacements.set(from.replaceAll("/", "\\"), to.replaceAll("/", "\\"));
  const oldBase = from.split("/").at(-1);
  const newBase = to.split("/").at(-1);
  if (oldBase !== newBase) replacements.set(oldBase, newBase);
}

const textExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".md", ".py", ".ps1", ".txt"]);
const skipped = new Set([".git", "node_modules", "TMP", "FLASHLIB", "LOGS", "REPORTS"]);
async function rewriteTree(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const full = join(folder, entry.name);
    if (entry.isDirectory()) { await rewriteTree(full); continue; }
    if (!textExtensions.has(extname(entry.name).toLowerCase())) continue;
    let source = await readFile(full, "utf8");
    const original = source;
    for (const [from, to] of [...replacements].sort((a, b) => b[0].length - a[0].length)) source = source.replaceAll(from, to);
    if (source !== original) await writeFile(full, source);
  }
}
await rewriteTree(root);
console.log(JSON.stringify({ renamed: moves.length, replacements: replacements.size }, null, 2));
