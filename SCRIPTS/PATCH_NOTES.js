import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PATCH_NOTES_OVERRIDES } from "../SRC/DATA/PATCH_NOTES_OVERRIDES.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, "..", "SRC", "DATA", "PATCH_NOTES.js");
const limit = Number(process.env.PATCH_NOTES_LIMIT || "60");

// Use the same history and exclusions as VERSION_SYNC.js.
// Keep the commit date so regeneration never changes a release's timestamp.
const lines = execFileSync(
  "git", ["log", "--first-parent", "--format=%h%x09%cI%x09%s", "HEAD"],
  { cwd: join(__dir, ".."), encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }
).trim().split(/\r?\n/);

const changes = lines
  .filter(Boolean)
  .map((line) => {
    const [hash, date, ...subject] = line.split("\t");
    return { hash, date, rawMessage: subject.join("\t").trim() };
  })
  .filter(({ rawMessage }) => !/^Version auto\s*:/i.test(rawMessage));

const entries = changes.slice(0, limit).map(({ hash, date, rawMessage }, index) => ({
  version: `0.${changes.length - index}`,
  date,
  message: PATCH_NOTES_OVERRIDES[hash] || rawMessage,
}));

const content =
  "// Généré automatiquement à chaque push. Ne pas modifier à la main.\n" +
  "export const PATCH_NOTES = " + JSON.stringify(entries, null, 2) + ";\n";
writeFileSync(out, content);
console.log(`PATCH_NOTES.js -> ${entries.length} entrée(s)`);
