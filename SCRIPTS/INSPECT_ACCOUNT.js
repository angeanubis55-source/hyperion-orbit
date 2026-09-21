// SCRIPTS/INSPECT_ACCOUNT.js — Diagnostic lecture-seule d'un compte (base serveur SQLite).
// Usage : node SCRIPTS/INSPECT_ACCOUNT.js <pseudo>
// Affiche : révision, dernière écriture, crédits, munitions, roquettes,
// lots d'enchères avec mises, dernière map. Ne modifie RIEN.
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

const DB_PATH = join(resolve(process.cwd(), "SERVER_DATA"), "orbit.db");
const target = String(process.argv[2] || "").trim();
if (!target) {
  console.error("Usage : node SCRIPTS/INSPECT_ACCOUNT.js <pseudo>");
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
    process.exit(1);
  }
  let data = {};
  try { data = JSON.parse(row.data || "{}") || {}; } catch { data = {}; }
  const fmtDate = (t) => { try { return new Date(Number(t)).toISOString(); } catch { return String(t); } };
  console.log(`Compte : ${row.pseudo} (id ${row.id})`);
  console.log(`  révision : data=${Math.floor(Number(data.revision) || 0)} / colonne=${Number(row.revision) || 0}`);
  console.log(`  dernière écriture : ${fmtDate(Math.max(Number(data.updatedAt) || 0, Number(row.updated_at) || 0))}`);
  console.log(`  crédits : ${Math.max(0, Math.floor(Number(data.credits) || 0)).toLocaleString("fr-FR")}`);
  const ammo = (data.ammo && typeof data.ammo === "object") ? data.ammo : {};
  console.log(`  munitions : ${["x2", "x3", "x4", "x6", "sab", "rcb", "cbo", "job", "rb", "pib", "idb", "vb", "emaa", "sbl", "abl"].map((k) => `${k}=${Math.floor(Number(ammo[k]) || 0)}`).join(" ")} (active=${data.ammoActive || ammo.active || "?"})`);
  const rockets = (data.rockets && typeof data.rockets === "object") ? data.rockets : {};
  console.log(`  roquettes : ${Object.entries(rockets).map(([k, v]) => `${k}=${Math.floor(Number(v) || 0)}`).join(" ") || "(aucune)"}`);
  const lots = Array.isArray(data?.auction?.lots) ? data.auction.lots : [];
  const withBids = lots.filter((l) => Number(l?.myBid) > 0);
  console.log(`  enchères : ${lots.length} lot(s), ${withBids.length} avec mise ${withBids.map((l) => `[${l.catalogId || l.id}: ${Number(l.myBid)}]`).join(" ") || ""}`);
  const hangars = Array.isArray(data.hangars) ? data.hangars : [];
  const active = hangars.find((h) => h?.active) || hangars[0];
  console.log(`  dernière map : ${active?.lastMap || "?"} (vaisseau ${data.ship || "?"})`);
  const stats = (data.stats && typeof data.stats === "object") ? data.stats : {};
  console.log(`  stats : exp=${Math.floor(Number(stats.exp) || 0)} honneur=${Math.floor(Number(stats.honor) || 0)} rankPoints=${Math.floor(Number(stats.rankPoints) || 0)}`);
} finally {
  try { db?.close(); } catch {}
}
