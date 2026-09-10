import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
const textExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".md", ".py", ".ps1", ".txt"]);
const protectedSpriteRoots = [
  "NPC/NPC_SPRITES/", "PET/PET_SPRITES/", "SHIP/SHIP_SPRITES/", "SHIP/SHIP_EFFECTS/",
  "DRONE/DRONE_SPRITES/", "COMBAT/MUNITIONS/", "COMBAT/RAYGUN/", "COMBAT/ROCKET_SPRITES/",
];
const ignoredRoots = [".git/", "node_modules/", "TEST/TMP/", "TEST/FLASHLIB/", "TEST/LOGS/", "TEST/REPORTS/"];

const slash = path => path.split(sep).join("/");
const absolute = path => join(root, ...path.split("/"));
const normalizeSegment = name => {
  const extension = extname(name).toLowerCase();
  const stem = extension ? name.slice(0, -extname(name).length) : name;
  return stem.replace(/[\s-]+/g, "_").toUpperCase() + extension;
};
const normalizePath = path => path.split("/").map(normalizeSegment).join("/");

async function walk(folder, output = []) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    const rel = slash(relative(root, full));
    if (ignoredRoots.some(prefix => `${rel}/`.startsWith(prefix))) continue;
    if (entry.isDirectory()) await walk(full, output);
    else output.push(rel);
  }
  return output;
}

const files = await walk(root);
const planned = [];
for (const source of files) {
  let target = source;
  if (source.startsWith("ASSETS/")) target = normalizePath(source);
  else if (source.startsWith("BACKGROUNDS/")) target = normalizePath(source);
  else if (source.startsWith("ASSETS/SHIP_ENGINE/")) target = normalizePath(source.replace(/^SHIP\/SHIP_ENGINE\//, "ASSETS/SHIP_ENGINE/"));
  else if (source.startsWith("ASSETS/UI/")) target = normalizePath(source.replace(/^UI\/UI_ASSETS\//, "ASSETS/UI/"));
  else if (imageExtensions.has(extname(source).toLowerCase())
    && !protectedSpriteRoots.some(prefix => source.startsWith(prefix))
    && !source.startsWith("BACKGROUNDS/")) {
    target = normalizePath(`ASSETS/MISC/${source}`);
  }
  if (target !== source) planned.push({ source, target });
}

const byTarget = new Map();
for (const move of planned) {
  const key = move.target.toUpperCase();
  if (!byTarget.has(key)) byTarget.set(key, []);
  byTarget.get(key).push(move.source);
}
const collisions = [...byTarget].filter(([, sources]) => sources.length > 1);
if (collisions.length) {
  console.error(JSON.stringify({ collisions }, null, 2));
  process.exit(2);
}

for (const { source, target } of planned) {
  const from = absolute(source);
  const to = absolute(target);
  await mkdir(dirname(to), { recursive: true });
  const temporary = `${to}.__MOVE_TMP__`;
  await rename(from, temporary);
  await rename(temporary, to);
}

for (const start of ["ASSETS", "BACKGROUNDS", "SHIP/SHIP_ENGINE", "UI/UI_ASSETS"]) {
  const base = absolute(start);
  try {
    const directories = [];
    async function collect(folder) {
      for (const entry of await readdir(folder, { withFileTypes: true })) if (entry.isDirectory()) {
        const child = join(folder, entry.name); await collect(child); directories.push(child);
      }
    }
    await collect(base);
    for (const directory of directories) await rm(directory, { recursive: false }).catch(() => {});
    if (start !== "ASSETS" && start !== "BACKGROUNDS") await rm(base, { recursive: false }).catch(() => {});
  } catch (error) { if (error.code !== "ENOENT") throw error; }
}

const replacements = new Map();
for (const { source, target } of planned) {
  replacements.set(source, target);
  replacements.set(`/${source}`, `/${target}`);
  const sourceDirectory = source.slice(0, source.lastIndexOf("/") + 1);
  const targetDirectory = target.slice(0, target.lastIndexOf("/") + 1);
  if (sourceDirectory !== targetDirectory) replacements.set(sourceDirectory, targetDirectory);
}
replacements.set("ASSETS/SHIP_ENGINE/", "ASSETS/SHIP_ENGINE/");
replacements.set("/ASSETS/SHIP_ENGINE/", "/ASSETS/SHIP_ENGINE/");
replacements.set("ASSETS/UI/", "ASSETS/UI/");
replacements.set("/ASSETS/UI/", "/ASSETS/UI/");

async function rewrite(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    const rel = slash(relative(root, full));
    if (ignoredRoots.some(prefix => `${rel}/`.startsWith(prefix))) continue;
    if (entry.isDirectory()) { await rewrite(full); continue; }
    if (!textExtensions.has(extname(entry.name).toLowerCase())) continue;
    let source = await readFile(full, "utf8");
    const original = source;
    for (const [from, to] of [...replacements].sort((a, b) => b[0].length - a[0].length)) source = source.replaceAll(from, to);
    if (source !== original) await writeFile(full, source);
  }
}
await rewrite(root);
await writeFile(join(root, "TEST", "ASSET_MIGRATION.json"), `${JSON.stringify({ moved: planned.length, replacements: replacements.size }, null, 2)}\n`);
console.log(JSON.stringify({ moved: planned.length, replacements: replacements.size }, null, 2));
