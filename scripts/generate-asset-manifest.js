import { readdir, writeFile } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

const root = process.cwd();
const output = join(root, "assets-manifest.json");
const extensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp3", ".wav", ".ogg"]);
const ignored = new Set([".git", "node_modules"]);
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
await writeFile(output, `${JSON.stringify({ version: 1, assets }, null, 2)}\n`, "utf8");
console.log(`Asset manifest: ${assets.length} files.`);
