// SCRIPTS/MODULES_BACK_TO_JSON.js — Retour arrière du stockage des modules.
// Remet chaque liste de la table ship_modules dans users.data
// (inventory.shipModules, dans l'ordre d'obtention) puis vide la table.
// À lancer UNIQUEMENT avant de redémarrer avec une ancienne version du
// serveur (qui lit les modules dans le JSON du compte), serveur ARRÊTÉ.
// Usage : node SCRIPTS/MODULES_BACK_TO_JSON.js

import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

const DB_PATH = join(resolve(process.env.ORBIT_DATA_DIR || resolve(process.cwd(), "SERVER_DATA")), "orbit.db");

let db = null;
try {
  db = new DatabaseSync(DB_PATH);
} catch (e) {
  console.error(`Base introuvable : ${DB_PATH} (${e?.message || e})`);
  process.exit(1);
}
try {
  db.exec("PRAGMA busy_timeout = 5000");
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ship_modules'").get()) {
    console.log("Pas de table ship_modules : rien à faire.");
    process.exit(0);
  }
  const users = db.prepare("SELECT DISTINCT user_id FROM ship_modules").all();
  const modulesOf = db.prepare("SELECT data FROM ship_modules WHERE user_id = ? ORDER BY pos");
  const rowOf = db.prepare("SELECT data FROM users WHERE id = ?");
  const update = db.prepare("UPDATE users SET data = ? WHERE id = ?");
  let accounts = 0, modules = 0;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const { user_id: id } of users) {
      const row = rowOf.get(id);
      if (!row) continue;
      const data = JSON.parse(row.data || "{}");
      data.inventory ||= {};
      data.inventory.shipModules = modulesOf.all(id).map((entry) => JSON.parse(entry.data));
      modules += data.inventory.shipModules.length;
      update.run(JSON.stringify(data), id);
      accounts++;
    }
    db.exec("DELETE FROM ship_modules");
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    throw e;
  }
  console.log(`OK : ${modules} modules remis dans ${accounts} comptes. Table ship_modules vidée.`);
} catch (e) {
  console.error("Erreur :", e?.message || e);
  process.exitCode = 1;
} finally {
  try { db?.close(); } catch {}
}
