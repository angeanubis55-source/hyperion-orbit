// SCRIPTS/SERVER_LOG.js — Copie mémoire de la console du serveur, lue par le
// panneau admin (journal serveur en direct). Importé en premier par
// MULTI_SERVER.js pour capturer aussi les messages de démarrage.
// La console d'origine reste inchangée (systemd/journalctl continue).
const SERVER_LOG_KEEP = 3000;
const lines = [];
let seq = 0;

function formatArg(arg) {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  try { return JSON.stringify(arg); } catch { return String(arg); }
}

export function recordServerLog(level, args) {
  const text = args.map(formatArg).join(" ").slice(0, 2000);
  lines.push({ seq: ++seq, at: Date.now(), level, text });
  if (lines.length > SERVER_LOG_KEEP) lines.splice(0, lines.length - SERVER_LOG_KEEP);
}

for (const level of ["log", "info", "warn", "error"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    try { recordServerLog(level, args); } catch {}
    original(...args);
  };
}

// Lignes postérieures à `since` (suivi en direct) ; filtres optionnels.
export function readServerLog({ since = 0, level = "", q = "", limit = 500 } = {}) {
  const needle = String(q || "").toLowerCase();
  const size = Math.max(1, Math.min(SERVER_LOG_KEEP, Math.floor(Number(limit) || 500)));
  const list = lines.filter((line) => line.seq > Number(since || 0)
    && (!level || line.level === level)
    && (!needle || line.text.toLowerCase().includes(needle)));
  return { seq, lines: list.slice(-size) };
}
