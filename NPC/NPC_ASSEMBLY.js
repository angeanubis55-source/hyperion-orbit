"use strict";

// Drops d'assemblage (darkorbitwiki.com/resources + FAQ Assembly officielle).
// - Box à collecter (sprite sur le lieu du kill) : scrap, mucosum, plasmide,
//   prismatium, aurus, bifenon, tetrathrin, kyhalon.
// - Direct inventaire à la mort (sans collecte) : rinusk, blacklight_trace,
//   mindfire_cerebrum.
// Taux : 25 % partout (choix maison, plus généreux que l'officiel).
// Quantités : 1 régulier, 2 boss, 3 uber.

// Taux uniformes 25 %.
const RATE_25 = Object.freeze({ regular: 0.25, boss: 0.25, uber: 0.25 });
const SCRAP_RATES = Object.freeze({
  npc_Saimon: RATE_25,
  npc_Mordon: RATE_25,
});
const AURUS_RATES = Object.freeze({
  npc_Interceptor: RATE_25,
  npc_Barracuda: RATE_25,
  npc_Saboteur: RATE_25,
  npc_Annihilator: RATE_25,
  npc_Battleray: RATE_25,
});

// Échelle uniforme pour les autres ressources.
const STD_RATES = RATE_25;

// Box à collecter : { ressource, box, familles NPC -> taux }.
export const ASSEMBLY_BOX_TABLE = Object.freeze([
  Object.freeze({ resource: "scrap", box: "Scrap_Box", rates: SCRAP_RATES }),
  Object.freeze({
    resource: "mucosum", box: "Mucosum_Box",
    rates: Object.freeze({
      npc_Lordakia: STD_RATES, npc_Sibelonit: STD_RATES, npc_Lordakium: STD_RATES,
    }),
  }),
  Object.freeze({
    resource: "plasmide", box: "Plasmide_Box",
    rates: Object.freeze({
      npc_Devolarium: STD_RATES, npc_Sibelon: STD_RATES,
    }),
  }),
  Object.freeze({
    resource: "prismatium", box: "Prismatium_Box",
    rates: Object.freeze({
      npc_Kristallin: STD_RATES, npc_Kristallon: STD_RATES,
    }),
  }),
  Object.freeze({ resource: "aurus", box: "Aurus_Box", rates: AURUS_RATES }),
  Object.freeze({
    resource: "bifenon", box: "Bifenon_Box",
    rates: Object.freeze({
      npc_Interceptor: RATE_25,
      npc_Barracuda: RATE_25,
      npc_Saboteur: RATE_25,
      npc_Annihilator: RATE_25,
      npc_Battleray: RATE_25,
      npc_Kristallon: Object.freeze({ regular: 0, boss: 0, uber: 0.25 }),
      npc_Kristallin: Object.freeze({ regular: 0, boss: 0, uber: 0.25 }),
      npc_Cubikon: RATE_25,
    }),
  }),
  Object.freeze({
    resource: "tetrathrin", box: "Tetrathrin_Box",
    rates: Object.freeze({
      npc_Interceptor: Object.freeze({ regular: 0, boss: 0, uber: 0.25 }),
      npc_Barracuda: Object.freeze({ regular: 0, boss: 0, uber: 0.25 }),
      npc_Saboteur: Object.freeze({ regular: 0, boss: 0, uber: 0.25 }),
      npc_Annihilator: Object.freeze({ regular: 0, boss: 0, uber: 0.25 }),
    }),
  }),
  // Kyhalon n'a officiellement AUCUNE source NPC (missions/GG) : choix maison,
  // Behemoth uniquement. À ajuster si besoin.
  Object.freeze({
    resource: "kyhalon", box: "Kyhalon_Box",
    rates: Object.freeze({
      npc_Mindfire_Behemoth: Object.freeze({ regular: 0.25, boss: 0.25, uber: 0.25 }),
    }),
  }),
]);

// Quantités par palier (box à collecter).
const BOX_QTY = Object.freeze({ regular: [1, 1], boss: [1, 2], uber: [2, 3] });

// Direct inventaire : { ressource, NPC -> quantité [min, max] }, drop 100 %.
export const ASSEMBLY_DIRECT_TABLE = Object.freeze([
  Object.freeze({
    resource: "rinusk",
    drops: Object.freeze({
      npc_Impulse_II: [1, 1], npc_Attend_IX: [1, 2],
      npc_Invoke_XVI: [2, 3], npc_Mindfire_Behemoth: [3, 5],
    }),
  }),
  Object.freeze({
    resource: "blacklight_trace",
    drops: Object.freeze({
      npc_Attend_IX: [1, 1], npc_Invoke_XVI: [1, 2], npc_Mindfire_Behemoth: [2, 3],
    }),
  }),
  Object.freeze({
    resource: "mindfire_cerebrum",
    drops: Object.freeze({ npc_Mindfire_Behemoth: [1, 2] }),
  }),
]);

function tierOf(npcType) {
  const t = String(npcType || "");
  if (/^npc_Uber_/i.test(t)) return "uber";
  if (/^npc_Boss_/i.test(t)) return "boss";
  return "regular";
}

// Famille de base : retire palier (Boss_/Uber_), variantes de gates et reskins.
export function assemblyBaseFamily(npcType) {
  let base = String(npcType || "");
  base = base.replace(/^npc_(Boss|Uber)_/i, "npc_");
  base = base.replace(/_(alpha|beta|gamma)$/i, "");
  base = base.replace(/^npc_(Frozen|Blighted|Plagued|Awakened)_/i, "npc_");
  base = base.replace(/_maudite\d*$/i, "");
  base = base.replace(/_(Aberration|Oddity|Corrupted)$/, "");
  return base;
}

function rollInt(range, random) {
  const a = Math.max(0, Math.floor(Number(range?.[0]) || 0));
  const b = Math.max(a, Math.floor(Number(range?.[1]) || a));
  return a + Math.floor(random() * (b - a + 1));
}

// Box d'assemblage droppée au kill (à collecter), ou null.
export function rollNpcAssemblyBox(npcType, random = Math.random) {
  const tier = tierOf(npcType);
  const family = assemblyBaseFamily(npcType);
  for (const entry of ASSEMBLY_BOX_TABLE) {
    const rates = entry.rates[family];
    if (!rates) continue;
    const chance = Number(rates[tier] || 0);
    if (!(chance > 0)) continue;
    if (random() < chance) {
      return { resource: entry.resource, box: entry.box, amount: rollInt(BOX_QTY[tier], random) };
    }
  }
  return null;
}

// Ressources directes inventaire à la mort (sans collecte).
export function rollNpcAssemblyDirect(npcType, random = Math.random) {
  const family = assemblyBaseFamily(npcType);
  const out = [];
  for (const entry of ASSEMBLY_DIRECT_TABLE) {
    const range = entry.drops[family];
    if (!range) continue;
    const qty = rollInt(range, random);
    if (qty > 0) out.push({ resource: entry.resource, qty });
  }
  return out;
}
