import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const out = join(__dir, "..", "SRC", "DATA", "VERSION.js");

// A push can contain several commits: Git does not store a push counter.
// Count changes on the main history, excluding generated version-only commits.
// Stop on a Git error rather than replacing the existing version with a fallback.
const subjects = execFileSync("git", ["log", "--first-parent", "--format=%s", "HEAD"], {
  cwd: join(__dir, ".."),
  encoding: "utf8",
}).trim().split(/\r?\n/).filter(Boolean);
const changes = subjects.filter(subject => !/^Version auto\s*:/i.test(subject)).length;
if (!changes) throw new Error("Aucun commit de modification trouvé pour calculer la version");
const version = `0.${changes}`;

const content = `export const GAME_VERSION = ${JSON.stringify(version)};\n`;
writeFileSync(out, content);
console.log(`VERSION.js -> ${version}`);
