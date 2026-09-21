// SCRIPTS/GIVE_AMMO.js — Donne des munitions laser à un compte (base serveur SQLite).
// Usage : node SCRIPTS/GIVE_AMMO.js <pseudo> <type> [quantite]
//   - pseudo   : pseudo du compte (insensible à la casse) ou id interne.
//   - type     : x2, x3, x4, x6, sab, rcb, cbo, job, rb, pib, idb, vb, emaa, sbl, abl.
//   - quantite : munitions à AJOUTER (défaut 10000). Négatif = retirer.
// Exemples :
//   node SCRIPTS/GIVE_AMMO.js MonPseudo x4 50000
//   node SCRIPTS/GIVE_AMMO.js MonPseudo sab -500
//
// Recommandé : serveur arrêté OU joueur déconnecté (évite un écrasement
// par une sauvegarde cliente en cours). La révision est bumpée, donc le
// client adopte automatiquement la version serveur à sa prochaine synchro.
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

const DB_PATH = join(resolve(process.cwd(), "SERVER_DATA"), "orbit.db");
const VALID_AMMO = new Set(["x2", "x3", "x4", "x6", "sab", "rcb", "cbo", "job", "rb", "pib", "idb", "vb", "emaa", "sbl", "abl"]);

const target = String(process.argv[2] || "").trim();
const type = String(process.argv[3] || "").trim().toLowerCase();
const amount = process.argv[4] === undefined ? 10_000 : Math.floor(Number(process.argv[4]));

if (!target || !VALID_AMMO.has(type)) {
  console.error("Usage : node SCRIPTS/GIVE_AMMO.js <pseudo> <type> [quantite]");
  console.error(`Types : ${[...VALID_AMMO].join(", ")}`);
  console.error("Exemple : node SCRIPTS/GIVE_AMMO.js MonPseudo x4 50000");
  process.exit(2);
}
if (!Number.isFinite(amount) || amount === 0) {
  console.error("Quantité invalide (entier non nul attendu).");
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
  if (!data.ammo || typeof data.ammo !== "object") data.ammo = {};

  const before = Math.max(0, Math.floor(Number(data.ammo[type]) || 0));
  const after = Math.max(0, before + amount);
  const now = Date.now();
  const newRev = Math.max(Math.floor(Number(data.revision) || 0), Number(row.revision) || 0) + 1;

  data.ammo[type] = after;
  data.revision = newRev;
  data.updatedAt = now;

  db.prepare("UPDATE users SET data = ?, revision = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(data), newRev, now, row.id);

  const sign = amount > 0 ? "+" : "";
  console.log(`${row.pseudo} : ${type} ${before.toLocaleString("fr-FR")} -> ${after.toLocaleString("fr-FR")} (${sign}${amount.toLocaleString("fr-FR")}), révision ${newRev}.`);
  console.log("Le joueur récupère les munitions à sa prochaine connexion/synchro.");
} finally {
  try { db?.close(); } catch {}
}
