import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PATCH_NOTES_OVERRIDES } from "../src/data/patchNotesOverrides.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, "..", "src", "data", "patchNotes.js");
const limit = Number(process.env.PATCH_NOTES_LIMIT || "60");

let lines;
try {
  lines = execSync(
    "git log --no-merges --pretty=format:%h%x09%s HEAD",
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
  ).trim().split("\n");
} catch {
  lines = [];
}

const entries = lines
  .filter(Boolean)
  .slice(0, limit)
  .map((line) => {
    const tab = line.indexOf("\t");
    const version = tab > 0 ? line.slice(0, tab) : line;
    const rawMessage = tab > 0 ? line.slice(tab + 1).trim() : "";
    const message = PATCH_NOTES_OVERRIDES[version] || rawMessage;
    return { version, message };
  });

const content =
  "// Généré automatiquement à chaque push. Ne pas modifier à la main.\n" +
  "export const PATCH_NOTES = " + JSON.stringify(entries, null, 2) + ";\n";
writeFileSync(out, content);
console.log(`patchNotes.js -> ${entries.length} entrée(s)`);
