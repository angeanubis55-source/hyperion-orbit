"use strict";

// Liste FIXE des NPC de la fenêtre BOT (onglet NPC).
//
// - Source : les spawns statiques des maps (index des quêtes, voir
//   QUEST/QUEST_LOCATIONS.js) : on sait déjà quels NPC vivent sur quelle map.
//   Rien n'est ajouté parce qu'on l'a croisé en jeu.
// - Jamais les JPC (faux joueurs, types créés à la volée).
// - NPC d'événement : listés UNIQUEMENT pendant l'événement, puis retirés
//   tout seuls. Nouvel événement = une entrée dans BOT_EVENT_NPCS.
// - Maps regroupées par secteur : 1-1 / 2-1 / 3-1 = X-1, etc.
//
// Pur (aucun DOM) : testable sous Node.

import {
  HALLOWEEN_VARIANT_SPECS,
  halloweenRoleOf,
  halloweenVariantKey,
  isHalloweenEventActive,
} from "../../NPC/NPC_HALLOWEEN.js";

// Événements : chaque ligne regroupe toutes les variantes d'un même NPC.
export const BOT_EVENT_NPCS = Object.freeze([
  Object.freeze({
    id: "halloween",
    label: "Halloween",
    isActive: (now) => isHalloweenEventActive(now),
    rows: () => [
      { role: "normal", name: "-=[ Curcubitor ]=-" },
      { role: "boss", name: "..::{ Boss Curcubitor }::.." },
    ].map(({ role, name }) => {
      const specs = HALLOWEEN_VARIANT_SPECS.filter((spec) => spec.role === role);
      return {
        key: `event:halloween:${role}`,
        name,
        types: specs.map((spec) => halloweenVariantKey(spec.mapId, role)).filter(Boolean),
        maps: [...new Set(specs.map((spec) => spec.mapId))],
      };
    }),
  }),
]);

// Types d'événement : jamais listés depuis les maps (ils n'y sont pas, mais
// une base d'event qui y traînerait ne doit pas rester après l'event).
function isEventType(type) {
  try { return halloweenRoleOf(type) != null; } catch { return false; }
}

const SECTOR_RE = /^[123]-([1-8]|bl)$/;

// Groupe de filtre d'une map : "x-1".."x-8", "x-bl", "gg" (gates spéciales),
// sinon la map elle-même ("4-1", "5-2", "maudite"...).
export function botMapGroupKey(mapId) {
  const id = String(mapId || "").trim();
  if (/^gate\s/i.test(id)) return "gg";
  const m = id.toLowerCase().match(SECTOR_RE);
  if (m) return `x-${m[1]}`;
  return id.toLowerCase();
}

export function botMapGroupLabel(key) {
  const k = String(key || "");
  if (k === "gg") return "Galaxy Gates";
  if (k === "event") return "Événement en cours";
  return k.toUpperCase();
}

// Ordre d'affichage : X-1..X-8, X-BL, puis 4-x, 5-x, autres, Galaxy Gates.
function groupRank(key) {
  const k = String(key);
  if (k === "event") return [0, 0, ""];
  let m = k.match(/^x-(\d)$/);
  if (m) return [1, Number(m[1]), ""];
  if (k === "x-bl") return [2, 0, ""];
  m = k.match(/^(\d)-(\d)$/);
  if (m) return [3, Number(m[1]) * 10 + Number(m[2]), ""];
  if (k === "gg") return [9, 0, ""];
  return [5, 0, k];
}
export function compareBotMapGroups(a, b) {
  const ra = groupRank(a), rb = groupRank(b);
  return ra[0] - rb[0] || ra[1] - rb[1] || ra[2].localeCompare(rb[2], "fr");
}

// Libellé compact des maps d'un NPC : "1-1, 2-1, 3-1" -> "X-1".
export function botMapsLabel(maps) {
  const ids = [...new Set((maps || []).map((m) => String(m).trim()).filter(Boolean))];
  const lower = new Set(ids.map((m) => m.toLowerCase()));
  const used = new Set();
  const parts = [];
  for (const level of ["1", "2", "3", "4", "5", "6", "7", "8", "bl"]) {
    const trio = ["1", "2", "3"].map((s) => `${s}-${level}`);
    if (trio.every((m) => lower.has(m))) {
      parts.push(`X-${level.toUpperCase()}`);
      trio.forEach((m) => used.add(m));
    }
  }
  const rest = ids.filter((m) => !used.has(m.toLowerCase()));
  rest.sort((a, b) => compareBotMapGroups(botMapGroupKey(a), botMapGroupKey(b)) || a.localeCompare(b, "fr", { numeric: true }));
  return [...parts, ...rest.map((m) => (/^gate\s/i.test(m) ? m.replace(/^gate\s+/i, "GG ") : m.toUpperCase()))].join(", ");
}

function cleanName(name) {
  return String(name || "").replace(/^[-=\[\s.:{]+|[-=\]\s.:}]+$/g, "").trim();
}

// Lignes de la liste : { key, name, types, maps, groups, event }.
export function buildBotNpcCatalog({ locations = {}, npcTypes = {}, now = new Date(), events = BOT_EVENT_NPCS } = {}) {
  const rows = [];
  for (const [type, maps] of Object.entries(locations || {})) {
    const def = npcTypes?.[type];
    if (!def || def.isJpcBot === true || isEventType(type)) continue;
    rows.push({ key: type, name: String(def.name || type), types: [type], maps: [...(maps || [])], event: null });
  }
  for (const event of events || []) {
    let active = false;
    try { active = event.isActive(now) === true; } catch { active = false; }
    if (!active) continue;
    for (const row of event.rows() || []) {
      if (!row?.types?.length) continue;
      rows.push({ key: row.key, name: row.name, types: [...row.types], maps: [...(row.maps || [])], event: event.label });
    }
  }
  for (const row of rows) {
    const groups = new Set(row.maps.map(botMapGroupKey));
    if (row.event) groups.add("event");
    row.groups = [...groups].sort(compareBotMapGroups);
  }
  rows.sort((a, b) => cleanName(a.name).localeCompare(cleanName(b.name), "fr") || a.key.localeCompare(b.key));
  return rows;
}

// Groupes de maps présents dans la liste (options du filtre).
export function botCatalogGroups(rows) {
  const set = new Set();
  for (const row of rows || []) for (const g of row.groups || []) set.add(g);
  return [...set].sort(compareBotMapGroups);
}
