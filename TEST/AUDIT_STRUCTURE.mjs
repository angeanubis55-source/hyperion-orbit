import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ignored = new Set([".git", "node_modules", "TMP", "FLASHLIB", "LOGS", "REPORTS"]);
const codeExtensions = new Set([".js", ".mjs", ".html", ".css"]);
const resourceExtensions = "png|jpg|jpeg|webp|gif|svg|mp3|wav|ogg|woff|woff2";
const files = [];
const directories = [];

async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = join(folder, entry.name);
    if (entry.isDirectory()) { directories.push(full); await walk(full); }
    else files.push(full);
  }
}
await walk(root);

async function exactPath(path) {
  const target = resolve(path);
  const rel = relative(root, target);
  if (rel.startsWith("..") || rel === "") return { exists: rel === "", exact: rel === "" };
  let cursor = root;
  for (const segment of rel.split(sep)) {
    let entries;
    try { entries = await readdir(cursor); } catch { return { exists: false, exact: false }; }
    const exact = entries.includes(segment);
    const matched = exact ? segment : entries.find(name => name.toLowerCase() === segment.toLowerCase());
    if (!matched) return { exists: false, exact: false };
    if (!exact) return { exists: true, exact: false, expected: matched };
    cursor = join(cursor, segment);
  }
  return { exists: true, exact: true };
}

const imports = [];
const resources = [];
const legacy = [];
const importPattern = /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g;
const resourcePattern = new RegExp(`["'\\(]((?:\\.?\\.?\\/|\\/)?(?:[A-Z0-9À-ÖØ-Þ_. -]+\\/)+[^"'\\)]+\\.(?:${resourceExtensions}))["'\\)]`, "gi");
const legacyPattern = /(?:src\/(?:core|data)|scripts\/|public\/|maps\/|reports\/|test\/|\.tmp\/|flashlib\/|SHIP\/SHIP_ENGINE|UI\/UI_ASSETS)/g;

for (const file of files.filter(file => codeExtensions.has(extname(file).toLowerCase()))) {
  const source = await readFile(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const target = resolve(dirname(file), specifier);
    imports.push({ file: relative(root, file), specifier, ...await exactPath(target) });
  }
  for (const match of source.matchAll(resourcePattern)) {
    const specifier = match[1];
    if (specifier.includes("${") || /^(?:https?:|data:)/i.test(specifier)) continue;
    const clean = specifier.replace(/^\.\//, "").replace(/^\//, "");
    const target = resolve(root, clean);
    resources.push({ file: relative(root, file), specifier, ...await exactPath(target) });
  }
  if (legacyPattern.test(source)) legacy.push(relative(root, file));
  legacyPattern.lastIndex = 0;
}

const emptyDirectories = [];
for (const directory of directories) {
  try { if ((await readdir(directory)).length === 0) emptyDirectories.push(relative(root, directory)); } catch {}
}
const namingErrors = [];
for (const directory of directories) {
  const rel = relative(root, directory).split(sep).join("/");
  if (/^(?:ASSETS|BACKGROUNDS)(?:\/|$)/.test(rel) && !/^[A-Z0-9_]+$/.test(directory.split(sep).at(-1))) namingErrors.push(rel);
}
for (const file of files) {
  const rel = relative(root, file).split(sep).join("/");
  if (/^(?:ASSETS|BACKGROUNDS)(?:\/|$)/.test(rel)) {
    const stem = file.split(sep).at(-1).slice(0, -extname(file).length);
    if (!/^[A-Z0-9_À-ÖØ-Þ()]+$/.test(stem)) namingErrors.push(rel);
  }
}

const result = {
  totals: { files: files.length, directories: directories.length, imports: imports.length, resources: resources.length },
  brokenImports: imports.filter(item => !item.exists),
  wrongCaseImports: imports.filter(item => item.exists && !item.exact),
  brokenResources: resources.filter(item => !item.exists),
  wrongCaseResources: resources.filter(item => item.exists && !item.exact),
  legacyReferences: legacy,
  namingErrors,
  emptyDirectories,
};
console.log(JSON.stringify(result, null, 2));
