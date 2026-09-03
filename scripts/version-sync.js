import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, "..", "src", "data", "version.js");

let hash;
try {
  hash = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {
  hash = "dev";
}

const content = `export const GAME_VERSION = ${JSON.stringify(hash)};\n`;
writeFileSync(out, content);
console.log(`version.js -> ${hash}`);
