import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const output = join(root, "ASSETS_MANIFEST.json");
const extensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".wav", ".ogg"]);
const ignored = new Set([".git", "node_modules", "TEST"]);
const assets = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (extensions.has(extname(entry.name).toLowerCase())) {
      const urlPath = relative(root, path).split(sep).map(encodeURIComponent).join("/");
      assets.push(`./${urlPath}`);
    }
  }
}

await scan(root);
assets.sort((a, b) => a.localeCompare(b, "en"));
if (process.argv.includes("--check")) {
  const manifest = JSON.parse(await readFile(output, "utf8"));
  const listed = new Set(manifest.assets);
  const actual = new Set(assets);
  const missing = assets.filter(asset => !listed.has(asset));
  const obsolete = manifest.assets.filter(asset => !actual.has(asset));
  const duplicates = manifest.assets.length - listed.size;
  if (manifest.version !== 1 || missing.length || obsolete.length || duplicates) {
    console.error(JSON.stringify({ version: manifest.version, missing, obsolete, duplicates }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`Asset manifest verified: ${assets.length} files, no missing, obsolete or duplicate entries.`);
  }
} else {
  await writeFile(output, `${JSON.stringify({ version: 1, assets }, null, 2)}\n`, "utf8");
  console.log(`Asset manifest: ${assets.length} files.`);
}
