// SCRIPTS/GIVE_CREDITS.js — Donne des crédits à un compte (base serveur SQLite).
// Usage : node SCRIPTS/GIVE_CREDITS.js <pseudo> [montant]
//   - pseudo  : pseudo du compte (insensible à la casse) ou id interne.
//   - montant : crédits à AJOUTER (défaut 1000000). Négatif = retirer.
// Exemples :
//   node SCRIPTS/GIVE_CREDITS.js MonPseudo 1000000
//   node SCRIPTS/GIVE_CREDITS.js MonPseudo -5000
//
// Recommandé : serveur arrêté OU joueur déconnecté (évite un écrasement
// par une sauvegarde cliente en cours). La révision est bumpée, donc le
// client adopte automatiquement la version serveur à sa prochaine synchro.

import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

const DB_PATH = join(resolve(process.cwd(), "SERVER_DATA"), "orbit.db");

const target = String(process.argv[2] || "").trim();
const amount = process.argv[3] === undefined ? 1_000_000 : Math.floor(Number(process.argv[3]));

if (!target) {
  console.error("Usage : node SCRIPTS/GIVE_CREDITS.js <pseudo> [montant]");
  console.error("Exemple : node SCRIPTS/GIVE_CREDITS.js MonPseudo 1000000");
  process.exit(2);
}
if (!Number.isFinite(amount) || amount === 0) {
  console.error("Montant invalide (entier non nul attendu).");
  process.exit(2);
}

const norm = (s) => String(s ?? "").trim().toLowerCase();

let db = null;
try {
  db = new DatabaseSync(DB_PATH);
} catch (e) {
  console.error(`Base introuvable : ${DB_PATH} (${e?.message || e})`);
  process.exit(1);
}
try {
  db.exec("PRAGMA busy_timeout = 5000");

  let row = db.prepare("SELECT * FROM users WHERE pseudo_norm = ?").get(norm(target));
  if (!row) row = db.prepare("SELECT * FROM users WHERE id = ?").get(target);
  if (!row) {
    console.error(`Compte introuvable : "${target}".`);
    try {
      const all = db.prepare("SELECT pseudo FROM users ORDER BY pseudo COLLATE NOCASE LIMIT 20").all();
      if (all.length) console.error(`Comptes existants : ${all.map((r) => r.pseudo).join(", ")}`);
      else console.error("Aucun compte dans la base.");
    } catch {}
    process.exit(1);
  }

  let data = {};
  try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }

  const before = Math.max(0, Math.floor(Number(data.credits) || 0));
  const after = Math.max(0, before + amount);
  const now = Date.now();
  const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;

  data.credits = after;
  data.revision = newRev;
  data.updatedAt = now;

  db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(data), newRev, now, row.id);

  const sign = amount > 0 ? "+" : "";
  console.log(`${row.pseudo} : ${before.toLocaleString("fr-FR")} -> ${after.toLocaleString("fr-FR")} crédits (${sign}${amount.toLocaleString("fr-FR")}), révision ${newRev}.`);
  console.log("Le joueur récupère les crédits à sa prochaine connexion/synchro.");
} finally {
  try { db?.close(); } catch {}
}
