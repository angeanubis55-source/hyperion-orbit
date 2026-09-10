import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const replacements = new Map([
  ["AUDIO/", "AUDIO/"],
  ["ASSETS/FACTIONS/", "ASSETS/FACTIONS/"],
  ["ASSETS/RANKS/", "ASSETS/RANKS/"],
  ["ASSETS/EXPLOSION/", "ASSETS/EXPLOSION/"],
  ["ASSETS/INSTANT_SHIELD/", "ASSETS/INSTANT_SHIELD/"],
  ["ASSETS/LIFE_STEAL/", "ASSETS/LIFE_STEAL/"],
]);
const directoryMoves = [
  ["SON", "AUDIO"],
  ["ASSETS/FIRMES", "ASSETS/FACTIONS"],
  ["ASSETS/GRADES", "ASSETS/RANKS"],
  ["ASSETS/BOOM1", "ASSETS/EXPLOSION"],
  ["ASSETS/INSTASHIELD", "ASSETS/INSTANT_SHIELD"],
  ["ASSETS/VOL_DE_VIE", "ASSETS/LIFE_STEAL"],
];

const normalizeName = name => {
  const extension = extname(name).toLowerCase();
  const stem = extension ? name.slice(0, -extname(name).length) : name;
  return stem.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\s-]+/g, "_").toUpperCase() + extension;
};
const audioFiles = [];
async function collect(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const full = join(folder, entry.name);
    if (entry.isDirectory()) await collect(full);
    else audioFiles.push(full);
  }
}
await collect(join(root, "AUDIO"));
for (const file of audioFiles) {
  const oldRelative = relative(root, file).split(sep).join("/");
  const relativeAudio = relative(join(root, "AUDIO"), file).split(sep).map(normalizeName).join("/");
  const targetRelative = `AUDIO/${relativeAudio}`;
  const target = join(root, ...targetRelative.split("/"));
  if (oldRelative === targetRelative) continue;
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.__MOVE_TMP__`;
  await rename(file, temporary);
  await rename(temporary, target);
  replacements.set(oldRelative, targetRelative);
  replacements.set(oldRelative.replace(/^AUDIO\//, "AUDIO/"), targetRelative);
}

const audioDirectories = [];
async function collectDirectories(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) if (entry.isDirectory()) {
    const full = join(folder, entry.name); await collectDirectories(full); audioDirectories.push(full);
  }
}
await collectDirectories(join(root, "AUDIO"));
for (const directory of audioDirectories) await rm(directory, { recursive: false }).catch(() => {});

const ignored = new Set([".git", "node_modules", "TMP", "FLASHLIB", "LOGS", "REPORTS"]);
const textExtensions = new Set([".js", ".mjs", ".json", ".html", ".css", ".md", ".py", ".ps1", ".txt"]);
async function rewrite(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = join(folder, entry.name);
    if (entry.isDirectory()) { await rewrite(full); continue; }
    if (!textExtensions.has(extname(entry.name).toLowerCase())) continue;
    let source = await readFile(full, "utf8");
    const original = source;
    for (const [from, to] of [...replacements].sort((a, b) => b[0].length - a[0].length)) source = source.replaceAll(from, to);
    if (source !== original) await writeFile(full, source);
  }
}
await rewrite(root);
console.log(JSON.stringify({ directoriesRenamed: directoryMoves.length, audioFilesRenamed: audioFiles.length, backupDeleted: true }, null, 2));
