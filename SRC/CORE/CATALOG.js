// SRC/CORE/CATALOG.js
"use strict";

import { SHIP_PACKS, getShipDesignBaseId, getShipPackById, isRemovedShipPack } from "../../SHIP/SHIP_PACKS.js";
import { DRONE_FORMATIONS, SPECIAL_DRONE_PRICE, getDroneShopSpritePath } from "../../DRONE/DRONE_TYPES.js";
import { ROCKET_TYPES, rocketShopIcon } from "../../COMBAT/ROCKET_TYPES.js";
import { BOOSTERS } from "../DATA/BOOSTERS.js";

/**
 * Règle de prix temporaire:
 * - Phoenix (starter, id legacy "PhoenixBleu" = pack "phoenix_bleu") :
 *   de base => jamais dans la boutique (comparaison canonique).
 * - les autres => prix calculé (tu pourras remplacer par un champ price dans SHIP_PACKS plus tard)
 */
function isStarterPackId(shipId) {
  return String(getShipPackById(shipId)?.id || shipId).toLowerCase() === "phoenix_bleu";
}
function defaultShipPrice(pack) {
  // formule simple basée sur la taille / frames (à ajuster)
  const frames = Number(pack.frames || 1);
  const area = (Number(pack.w || 160) * Number(pack.h || 160)) / 1000;
  return Math.round(200000 + frames * 8000 + area * 4000);
}

export const CATALOG = {
  // Munitions lasers officielles (icônes : itemsControlMenu_texture officielle).
  // Dégâts : LCB-10 x1 (base, stock infini, non vendue), MCB-25 x2, MCB-50 x3,
  // UCB-100 x4, SAB-50 (vole le bouclier x2 + recharge le tien), RSB-75 x6.
  ammo: [
  { id: "ammo_x2", name: "MCB-25 (X2)", price: 50000, give: { ammo: { x2: 1000 } },
    code: "MCB-25", mult: 2, laser: "bleu",
    desc: "Batterie moyenne capacité : dégâts doublés (×2).", effect: "Tirs bleus." },
  { id: "ammo_x3", name: "MCB-50 (X3)", price: 150000, give: { ammo: { x3: 1000 } },
    code: "MCB-50", mult: 3, laser: "vert",
    desc: "Batterie capacité max : dégâts triplés (×3).", effect: "Tirs verts." },
  { id: "ammo_x4", name: "UCB-100 (X4)", price: 500000, give: { ammo: { x4: 1000 } },
    code: "UCB-100", mult: 4, laser: "blanc",
    desc: "Batterie ultra capacité : dégâts quadruplés (×4).", effect: "Tirs blancs." },
  { id: "ammo_sab", name: "SAB-50", price: 250000, give: { ammo: { sab: 1000 } },
    code: "SAB-50", mult: 2, laser: "bleu (cercles)",
    desc: "Batterie absorbe-bouclier : vole le bouclier adverse (×2) et recharge le tien. Zéro dégât coque.", effect: "Cercles bleus + faisceau inversé (cible → toi)." },
  { id: "ammo_x6", name: "RSB-75 (X6)", price: 1500000, give: { ammo: { x6: 1000 } },
    code: "RSB-75", mult: 6, laser: "orange",
    desc: "Batterie de salve rapide : dégâts sextuplés (×6).", effect: "Tirs oranges." },
  // Munitions spéciales officielles (effets : voir COMBAT/AMMO_TYPES.js).
  { id: "ammo_rcb", name: "RCB-140", price: 3000000, give: { ammo: { rcb: 1000 } },
    code: "RCB-140", mult: 7, laser: "violet",
    desc: "Munition d'événement : dégâts septuplés (×7).", effect: "Tirs violets." },
  { id: "ammo_cbo", name: "CBO-100", price: 800000, give: { ammo: { cbo: 1000 } },
    code: "CBO-100", mult: 3, laser: "violet (absorption)",
    desc: "Dégâts triplés (×3) + vole le bouclier adverse (×1).", effect: "Faisceau inversé (cible → toi)." },
  { id: "ammo_job", name: "JOB-100", price: 400000, give: { ammo: { job: 1000 } },
    code: "JOB-100", mult: 2, laser: "jaune-vert",
    desc: "×3,5 contre les aliens, ×2 contre les joueurs.", effect: "Tirs jaune-vert." },
  { id: "ammo_rb", name: "RB-214", price: 600000, give: { ammo: { rb: 1000 } },
    code: "RB-214", mult: 4, laser: "or",
    desc: "Dégâts quadruplés (×4), ×8 contre les Demaners.", effect: "Tirs dorés." },
  { id: "ammo_pib", name: "PIB-100", price: 2000000, give: { ammo: { pib: 1000 } },
    code: "PIB-100", mult: 4, laser: "vert",
    desc: "Dégâts quadruplés (×4) + infecte la cible (vitesse −10 %, 15 s).", effect: "Tirs verts." },
  { id: "ammo_idb", name: "IDB-125", price: 1200000, give: { ammo: { idb: 1000 } },
    code: "IDB-125", mult: 1, laser: "magenta (progressif)",
    desc: "Commence à ×1 puis +1,25 par tir réussi jusqu'à ×6 (retombe à ×1 après 3 s sans tirer).", effect: "Tirs magenta." },
  { id: "ammo_vb", name: "VB-142", price: 900000, give: { ammo: { vb: 1000 } },
    code: "VB-142", mult: 4, laser: "mauve",
    desc: "Dégâts quadruplés (×4), ×7 contre Styxus et Charopos.", effect: "Tirs mauves." },
  { id: "ammo_emaa", name: "EMAA-20", price: 900000, give: { ammo: { emaa: 1000 } },
    code: "EMAA-20", mult: 4, laser: "vert-jaune",
    desc: "Dégâts quadruplés (×4), ×7 contre les Mimesis.", effect: "Tirs vert-jaune." },
  { id: "ammo_sbl", name: "SBL-100", price: 900000, give: { ammo: { sbl: 1000 } },
    code: "SBL-100", mult: 4, laser: "cyan",
    desc: "Dégâts quadruplés (×4), ×8 contre les Sibelons.", effect: "Tirs cyan." },
  { id: "ammo_abl", name: "A-BL", price: 1000000, give: { ammo: { abl: 1000 } },
    code: "A-BL", mult: 4, laser: "rose",
    desc: "Dégâts quadruplés (×4), ×8 contre Invoke et Mindfire Behemoth.", effect: "Tirs roses." },
  ],

  // Roquettes (lanceur natif + lance-roquettes) : généré depuis data/rockets.js.
  // Nouvelles roquettes = juste une entrée là-bas, la boutique suit toute seule.
  // Une seule catégorie boutique "Roquettes", le flag manual distingue l'usage.
  rockets: Object.values(ROCKET_TYPES).map((r) => ({
    id: `rocket_${r.id}`,
    name: `${r.name} ×${r.packSize}`,
    price: r.packPrice,
    give: { rockets: { [r.id]: r.packSize } },
    icon: rocketShopIcon(r.id),
    manual: r.manual !== false,
  })),

  // Générateurs de vitesse officiels (darkorbitwiki.com/equipment/generators).
  // Prix uridium convertis en crédits (×1000) : G3N-6900 (1000 U), G3N-7900 (2000 U).
  speedGen: [
    { id: "spd_g3n1010", name: "G3N-1010", price: 2000, icon: "/ASSETS/ITEMS/G3N-1010.png", module: { type: "speed",  bonusSpeed: 2 } },
    { id: "spd_g3n2010", name: "G3N-2010", price: 4000, icon: "/ASSETS/ITEMS/G3N-2010.png", module: { type: "speed",  bonusSpeed: 3 } },
    { id: "spd_g3n3210", name: "G3N-3210", price: 8000, icon: "/ASSETS/ITEMS/G3N-3210.png", module: { type: "speed",  bonusSpeed: 4 } },
    { id: "spd_g3n3310", name: "G3N-3310", price: 16000, icon: "/ASSETS/ITEMS/G3N-3310.png", module: { type: "speed",  bonusSpeed: 5 } },
    { id: "spd_g3n6900", name: "G3N-6900", price: 8000000, icon: "/ASSETS/ITEMS/G3N-6900.png", module: { type: "speed",  bonusSpeed: 7 } },
    { id: "spd_g3n7900", name: "G3N-7900", price: 15000000, icon: "/ASSETS/ITEMS/G3N-7900.png", module: { type: "speed",  bonusSpeed: 10 } },
  ],

  // Générateurs de bouclier officiels (valeur + absorption).
  // L'absorption équipée = max des générateurs montés (défaut 80 % sans générateur).
  // Prix uridium/assemblage convertis : B02 (10000 U), autres : estimation boutique.
  shieldGen: [
    { id: "shd_sg3na01", name: "SG3N-A01", price: 8000, icon: "/ASSETS/ITEMS/SG3N-A01.png", module: { type: "shield", bonusShield: 1000, absorbPct: 40 } },
    { id: "shd_fs01", name: "FS-01", price: 256000, icon: "/ASSETS/ITEMS/FS-01.png", module: { type: "shield", bonusShield: 3200, absorbPct: 70 } },
    { id: "shd_sg3na02", name: "SG3N-A02", price: 16000, icon: "/ASSETS/ITEMS/SG3N-A02.png", module: { type: "shield", bonusShield: 5000, absorbPct: 50 } },
    { id: "shd_sg3na03", name: "SG3N-A03", price: 256000, icon: "/ASSETS/ITEMS/SG3N-A03.png", module: { type: "shield", bonusShield: 5000, absorbPct: 60 } },
    { id: "shd_fs02", name: "FS-02", price: 2560000, icon: "/ASSETS/ITEMS/FS-02.png", module: { type: "shield", bonusShield: 5600, absorbPct: 75 } },
    { id: "shd_fs03", name: "FS-03", price: 8000000, icon: "/ASSETS/ITEMS/FS-03.png", module: { type: "shield", bonusShield: 8000, absorbPct: 80 } },
    { id: "shd_sg3nb00", name: "SG3N-B00", price: 5000000, icon: "/ASSETS/ITEMS/SG3N-B00.png", module: { type: "shield", bonusShield: 9000, absorbPct: 70 } },
    { id: "shd_sg3nb01", name: "SG3N-B01", price: 256000, icon: "/ASSETS/ITEMS/SG3N-B01.png", module: { type: "shield", bonusShield: 9500, absorbPct: 70 } },
    { id: "shd_sg3nb02", name: "SG3N-B02", price: 10000000, icon: "/ASSETS/ITEMS/SG3N-B02.png", module: { type: "shield", bonusShield: 10000, absorbPct: 80 } },
    { id: "shd_fs04", name: "FS-04", price: 20000000, icon: "/ASSETS/ITEMS/FS-04.png", module: { type: "shield", bonusShield: 11400, absorbPct: 80 } },
    { id: "shd_sg3nb03", name: "SG3N-B03", price: 15000000, icon: "/ASSETS/ITEMS/SG3N-B03.png", module: { type: "shield", bonusShield: 11450, absorbPct: 80 } },
    { id: "shd_sg3np01", name: "SG3N-P01", price: 3000000, icon: "/ASSETS/ITEMS/SG3N-P01.png", petOnly: true, module: { type: "shield", bonusShield: 11500 } },
    { id: "shd_sg3npx01", name: "SG3N-PX01", price: 8000000, icon: "/ASSETS/ITEMS/SG3N-PX01.png", petOnly: true, module: { type: "shield", bonusShield: 11900, absorbPct: 80 } },
  ],

  // Canons laser officiels (prix existants conservés).
  // Bonus appliqués par le moteur, TOUS x nombre équipé (vaisseau + drones) :
  // vsMatch (AA-1, LF-3, Caucasus, AAP-1, PR-L),
  // overdrive tous les 5 tirs : PR-L +200/canon, Caucasus +100/canon
  // (ex : 1 PR-L = +200, 2 = +400, 35 = +7000 sur le 5e tir),
  // critique OS-L (+3 %/canon, set +9 % dès 3, ×2), coque LF-4-HP (+0,5 %/canon), set
  // Mortifier (dégâts globaux dès 3 montés, vaisseau uniquement), U-LF4 (128-220 aléatoires/canon).
  // Bonus PVP uniquement documentés (jeu 100 % NPC) : MD, LF-5-AL.
  // AM-L absent (aucune stat officielle). SL/SLL = canons NPC, non vendus.
  lasers: [
    { id: "laser_lf1", name: "laser LF-1", price: 15000, icon: "/ASSETS/LASERS/lf_1_100x100.png", module: { type: "laser", damage: 65 }, desc: "Canon standard : 65 dégâts, aucun bonus." },
    { id: "laser_mp1", name: "laser MP-1", price: 60000, icon: "/ASSETS/LASERS/mp_1_100x100.png", module: { type: "laser", damage: 60, playerDamage: 70 }, desc: "60 dégâts vs aliens, 70 vs joueurs." },
    { id: "laser_lf2", name: "laser LF-2", price: 150000, icon: "/ASSETS/LASERS/lf_2_100x100.png", module: { type: "laser", damage: 140 }, desc: "Canon standard : 140 dégâts, aucun bonus." },
    { id: "laser_lf3", name: "laser LF-3", price: 1200000, icon: "/ASSETS/LASERS/lf_3_100x100.png", module: { type: "laser", damage: 175, vsMatch: [/^npc_/], vsMult: 1.15, vsLabel: "aliens" }, desc: "175 dégâts +15 % vs aliens." },
    { id: "laser_lfp01", name: "laser LF-P01", price: 5000000, icon: "/ASSETS/LASERS/lf_p01_100x100.png", petOnly: true, module: { type: "laser", damage: 280 }, desc: "280 dégâts, P.E.T uniquement." },
    { id: "laser_ulf4", name: "laser U-LF4 Instable", price: 8000000, icon: "/ASSETS/LASERS/lf_4_unstable_100x100.png", module: { type: "laser", damage: 174, unstable: true }, desc: "128 à 220 dégâts aléatoires par tir." },
    { id: "laser_lf4", name: "laser LF-4", price: 9000000, icon: "/ASSETS/LASERS/lf_4_100x100.png", module: { type: "laser", damage: 200 }, desc: "Canon standard : 200 dégâts, aucun bonus." },
    { id: "laser_lfpx01", name: "laser LF-PX01", price: 12000000, icon: "/ASSETS/LASERS/lf_px01_100x100.png", petOnly: true, module: { type: "laser", damage: 280 }, desc: "280 dégâts + chaleur, P.E.T uniquement." },
    { id: "laser_aap1", name: "laser AAP-1", price: 14000000, icon: "/ASSETS/LASERS/aap_1_100x100.png", petOnly: true, module: { type: "laser", damage: 225, vsMatch: [/Mimesis/], vsMult: 525 / 225, vsLabel: "Mimesis" }, desc: "225 dégâts, 525 vs Mimesis, P.E.T uniquement." },
    { id: "laser_aa1", name: "laser AA-1", price: 18000000, icon: "/ASSETS/LASERS/aa_1_100x100.png", module: { type: "laser", damage: 180, vsMatch: [/Mimesis/], vsMult: 305 / 180, vsLabel: "Mimesis" }, desc: "180 dégâts, 305 vs Mimesis (anti-AI)." },
    { id: "laser_lf4hp", name: "laser LF-4 Hyperplasmoid", price: 22000000, icon: "/ASSETS/LASERS/lf_4_hp_100x100.png", module: { type: "laser", damage: 225, hpPct: 0.5 }, desc: "225 dégâts, +0,5 % de coque max par canon monté." },
    { id: "laser_lf4md", name: "laser LF-4 Magmadrill", price: 28000000, icon: "/ASSETS/LASERS/lf_4_md_100x100.png", module: { type: "laser", damage: 230 }, desc: "230 dégâts, bonus PVP (sans effet vs aliens)." },
    { id: "laser_lf4pd", name: "laser LF-4 Paritydrill", price: 30000000, icon: "/ASSETS/LASERS/lf_4_pd_100x100.png", module: { type: "laser", damage: 235 }, desc: "235 dégâts (230 +5 PVE)." },
    { id: "laser_caucasus", name: "laser Caucasus", price: 55000000, icon: "/ASSETS/LASERS/caucasus_100x100.png", module: { type: "laser", damage: 200, vsMatch: [/^npc_/], vsMult: 1.15, vsLabel: "aliens", overdrive: 100 }, desc: "200 dégâts +15 % vs aliens, +100/canon tous les 5 tirs (ex : 10 = +1000)." },
    { id: "laser_lf5", name: "laser LF-5", price: 70000000, icon: "/ASSETS/LASERS/lf_5_100x100.png", module: { type: "laser", damage: 245 }, desc: "245 dégâts, constant PVE/PVP, sans bonus." },
    { id: "laser_lf5al", name: "laser LF-5 Anchorlock", price: 85000000, icon: "/ASSETS/LASERS/lf_5_al_100x100.png", module: { type: "laser", damage: 245 }, desc: "245 dégâts, bonus PVP + ralentissements (sans effet vs aliens)." },
    { id: "laser_prl", name: "laser PR-L Prometheus", price: 200000000, icon: "/ASSETS/LASERS/pr_l_100x100.png", module: { type: "laser", damage: 210, vsMatch: [/Invoke/, /Mindfire/], vsMult: 3.5, vsLabel: "aliens Blacklight", overdrive: 200 }, desc: "210 dégâts, +200/canon tous les 5 tirs (ex : 35 = +7000), ×3,5 vs aliens Blacklight." },
    { id: "laser_osl", name: "laser OS-L Odysseus", price: 550000000, icon: "/ASSETS/LASERS/os_l_100x100.png", module: { type: "laser", damage: 220, critPct: 3 }, desc: "220 dégâts, critique à 200 % : +3 % de chance par canon, +9 % dès 3 montés." },
    { id: "laser_lf5mf", name: "laser LF-5 Mortifier", price: 600000000, icon: "/ASSETS/LASERS/lf_5_mf_100x100.png", module: { type: "laser", damage: 452, mf: true }, desc: "452 dégâts, dégâts globaux +10 % à +50 % dès 3 montés." },
    ],

  extras: [
    { id: "extra_radar", name: "Extra: Radar +", price: 250000, module: { type: "extra", key: "radar_plus" } },
    { id: "extra_loot",  name: "Extra: Loot +",  price: 500000, module: { type: "extra", key: "loot_plus" } },
  ],

  drones: [
    { id: "drone_iris", name: "Drone Iris", price: 15000000, drone: { type: "iris" }, icon: getDroneShopSpritePath("iris") },
    { id: "drone_apis", name: "Drone Apis", price: SPECIAL_DRONE_PRICE, drone: { type: "apis" }, icon: getDroneShopSpritePath("apis") },
    { id: "drone_zeus", name: "Drone Zeus", price: SPECIAL_DRONE_PRICE, drone: { type: "zeus" }, icon: getDroneShopSpritePath("zeus") },
  ],

  pets: [
    { id: "pet_niveau1", name: "P.E.T", price: 10000000, icon: "/PET/PET_SPRITES/NIVEAU1/21.png", pet: { id: "niveau1" } },
  ],

  // Gears P.E.T officiels (darkorbitwiki.com/p-e-t). Prix uridium → crédits (×1000).
  // Paliers officiels : niveau 2 dès P.E.T 4, niveau 3 dès P.E.T 8.
  // Branchés dans le moteur : G-AL / G-AR (auto-collecte), G-EL
  // (localisateur), G-REP (régén coque), G-KK (kamikaze), G-TRA (trader),
  // G-FS (flamme), G-HPL (lien HP), G-BC / G-BH (bouées) — voir PET/PET_GEARS.js.
  // C-GM/C-SR absents (aucune icône officielle).
  petGears: [
    { id: "gear_gal1", name: "G-AL1 · Auto-Loot", price: 7500000, icon: "/PET/PET_GEARS/G-AL1.png", petLevel: 0, petGear: { key: "al", level: 1 }, desc: "Collecte cargo + bonus boxes, portée 700." },
    { id: "gear_gal2", name: "G-AL2 · Auto-Loot", price: 17500000, icon: "/PET/PET_GEARS/G-AL1.png", petLevel: 4, petGear: { key: "al", level: 2 }, desc: "Collecte cargo + bonus boxes, portée 1500." },
    { id: "gear_gal3", name: "G-AL3 · Auto-Loot", price: 37500000, icon: "/PET/PET_GEARS/G-AL1.png", petLevel: 8, petGear: { key: "al", level: 3 }, desc: "Collecte cargo + bonus boxes, portée 3000." },
    { id: "gear_gar1", name: "G-AR1 · Collecteur", price: 2500000, icon: "/PET/PET_GEARS/G-AR1.png", petLevel: 0, petGear: { key: "ar", level: 1 }, desc: "Collecte minerais, portée 700." },
    { id: "gear_gar2", name: "G-AR2 · Collecteur", price: 6000000, icon: "/PET/PET_GEARS/G-AR1.png", petLevel: 4, petGear: { key: "ar", level: 2 }, desc: "Collecte minerais, portée 1500." },
    { id: "gear_gar3", name: "G-AR3 · Collecteur", price: 17500000, icon: "/PET/PET_GEARS/G-AR1.png", petLevel: 8, petGear: { key: "ar", level: 3 }, desc: "Collecte minerais, portée 3000." },
    { id: "gear_gel1", name: "G-EL1 · Localisateur ennemis", price: 6000000, icon: "/PET/PET_GEARS/G-EL1.png", petLevel: 0, petGear: { key: "el", level: 1 }, desc: "Localise un NPC, portée 1000." },
    { id: "gear_gel2", name: "G-EL2 · Localisateur ennemis", price: 12500000, icon: "/PET/PET_GEARS/G-EL1.png", petLevel: 4, petGear: { key: "el", level: 2 }, desc: "Localise un NPC, portée 1500." },
    { id: "gear_gel3", name: "G-EL3 · Localisateur ennemis", price: 37500000, icon: "/PET/PET_GEARS/G-EL1.png", petLevel: 8, petGear: { key: "el", level: 3 }, desc: "Localise un NPC, portée 2500." },
    { id: "gear_gtra1", name: "G-TRA1 · Cargo Trader", price: 6000000, icon: "/PET/PET_GEARS/G-TRA1.png", petLevel: 0, petGear: { key: "tra", level: 1 }, desc: "Vend les minerais hors base, bonus +5 %, cooldown 300 s." },
    { id: "gear_gtra2", name: "G-TRA2 · Cargo Trader", price: 12500000, icon: "/PET/PET_GEARS/G-TRA1.png", petLevel: 4, petGear: { key: "tra", level: 2 }, desc: "Vend les minerais hors base, bonus +15 %, cooldown 120 s." },
    { id: "gear_gtra3", name: "G-TRA3 · Cargo Trader", price: 37500000, icon: "/PET/PET_GEARS/G-TRA1.png", petLevel: 8, petGear: { key: "tra", level: 3 }, desc: "Vend les minerais hors base, bonus +30 %, cooldown 30 s." },
    { id: "gear_grep1", name: "G-REP1 · Réparateur", price: 2500000, icon: "/PET/PET_GEARS/G-REP1.png", petLevel: 0, petGear: { key: "rep", level: 1 }, desc: "Régénère 3 % de la coque /s." },
    { id: "gear_grep2", name: "G-REP2 · Réparateur", price: 6000000, icon: "/PET/PET_GEARS/G-REP1.png", petLevel: 4, petGear: { key: "rep", level: 2 }, desc: "Régénère 4 % de la coque /s." },
    { id: "gear_grep3", name: "G-REP3 · Réparateur", price: 12500000, icon: "/PET/PET_GEARS/G-REP1.png", petLevel: 8, petGear: { key: "rep", level: 3 }, desc: "Régénère 5 % de la coque /s." },
    { id: "gear_gkk1", name: "G-KK1 · Kamikaze", price: 7500000, icon: "/PET/PET_GEARS/G-KK1.png", petLevel: 0, petGear: { key: "kk", level: 1 }, desc: "Explosion 25000 dégâts, portée 250, cooldown 120 s." },
    { id: "gear_gkk2", name: "G-KK2 · Kamikaze", price: 17500000, icon: "/PET/PET_GEARS/G-KK1.png", petLevel: 4, petGear: { key: "kk", level: 2 }, desc: "Explosion 50000 dégâts, portée 350, cooldown 60 s." },
    { id: "gear_gkk3", name: "G-KK3 · Kamikaze", price: 50000000, icon: "/PET/PET_GEARS/G-KK1.png", petLevel: 8, petGear: { key: "kk", level: 3 }, desc: "Explosion 75000 dégâts, portée 450, cooldown 30 s." },
    { id: "gear_gfs1", name: "G-FS1 · Flamme sacrificielle", price: 9000000, icon: "/PET/PET_GEARS/G-FS1.png", petLevel: 0, petGear: { key: "fs", level: 1 }, desc: "Transfère le bouclier du REX vers ton vaisseau (tout si besoin), cooldown 90 s." },
    { id: "gear_ghpl1", name: "G-HPL1 · Lien HP", price: 10000000, icon: "/PET/PET_GEARS/G-HPL1.png", petLevel: 8, petGear: { key: "hpl", level: 1 }, desc: "Dégâts coque redirigés vers le REX, mix combat + éclair, 20 s, cooldown 240 s." },
    { id: "gear_gbc1", name: "G-BC1 · Bouée combat", price: 25000000, icon: "/PET/PET_GEARS/G-BC1.png", petLevel: 8, petGear: { key: "bc", level: 1 }, desc: "Halo 500 : +5 % dégâts dedans, 120 s, cooldown 240 s." },
    { id: "gear_gbh1", name: "G-BH1 · Bouée coque", price: 25000000, icon: "/PET/PET_GEARS/G-BH1.png", petLevel: 8, petGear: { key: "bh", level: 1 }, desc: "Halo 500 : +5 % PV max dedans, 120 s, cooldown 240 s." },
  ],

  // Protocoles P.E.T officiels (IA). Seuls dégâts (AI-LM) et Alien (AI-AL)
  // sont appliqués par le moteur ; le reste est stocké + affiché (effet à venir).
  petProtocols: [
    { id: "proto_aicr1", name: "AI-CR1 · Cargo", price: 3000000, icon: "/PET/PET_PROTOCOLS/AI-CR1.png", petLevel: 0, petProtocol: { key: "cargo", level: 1, pct: 3 }, desc: "Soute cargo +3 %." },
    { id: "proto_aicr2", name: "AI-CR2 · Cargo", price: 7500000, icon: "/PET/PET_PROTOCOLS/AI-CR1.png", petLevel: 4, petProtocol: { key: "cargo", level: 2, pct: 6 }, desc: "Soute cargo +6 %." },
    { id: "proto_aicr3", name: "AI-CR3 · Cargo", price: 25000000, icon: "/PET/PET_PROTOCOLS/AI-CR1.png", petLevel: 8, petProtocol: { key: "cargo", level: 3, pct: 12 }, desc: "Soute cargo +12 %." },
    { id: "proto_air1", name: "AI-R1 · Radar", price: 3000000, icon: "/PET/PET_PROTOCOLS/AI-R1.png", petLevel: 0, petProtocol: { key: "radar", level: 1, pct: 3 }, desc: "Portée radar P.E.T +3 %." },
    { id: "proto_air2", name: "AI-R2 · Radar", price: 7500000, icon: "/PET/PET_PROTOCOLS/AI-R1.png", petLevel: 4, petProtocol: { key: "radar", level: 2, pct: 6 }, desc: "Portée radar P.E.T +6 %." },
    { id: "proto_air3", name: "AI-R3 · Radar", price: 25000000, icon: "/PET/PET_PROTOCOLS/AI-R1.png", petLevel: 8, petProtocol: { key: "radar", level: 3, pct: 12 }, desc: "Portée radar P.E.T +12 %." },
    { id: "proto_ais1", name: "AI-S1 · Récupération", price: 5000000, icon: "/PET/PET_PROTOCOLS/AI-S1.png", petLevel: 0, petProtocol: { key: "salvage", level: 1, pct: 1 }, desc: "Contenu collecté +1 %." },
    { id: "proto_ais2", name: "AI-S2 · Récupération", price: 12500000, icon: "/PET/PET_PROTOCOLS/AI-S1.png", petLevel: 4, petProtocol: { key: "salvage", level: 2, pct: 2 }, desc: "Contenu collecté +2 %." },
    { id: "proto_ais3", name: "AI-S3 · Récupération", price: 45000000, icon: "/PET/PET_PROTOCOLS/AI-S1.png", petLevel: 8, petProtocol: { key: "salvage", level: 3, pct: 3 }, desc: "Contenu collecté +3 %." },
    { id: "proto_aism1", name: "AI-SM1 · Bouclier", price: 5000000, icon: "/PET/PET_PROTOCOLS/AI-SM1.png", petLevel: 0, petProtocol: { key: "shield", level: 1, pct: 1 }, desc: "Bouclier P.E.T +1 %." },
    { id: "proto_aism2", name: "AI-SM2 · Bouclier", price: 12500000, icon: "/PET/PET_PROTOCOLS/AI-SM1.png", petLevel: 4, petProtocol: { key: "shield", level: 2, pct: 2 }, desc: "Bouclier P.E.T +2 %." },
    { id: "proto_aism3", name: "AI-SM3 · Bouclier", price: 45000000, icon: "/PET/PET_PROTOCOLS/AI-SM1.png", petLevel: 8, petProtocol: { key: "shield", level: 3, pct: 4 }, desc: "Bouclier P.E.T +4 %." },
    { id: "proto_ailm1", name: "AI-LM1 · Laser", price: 5000000, icon: "/PET/PET_PROTOCOLS/AI-LM1.png", petLevel: 0, petProtocol: { key: "damage", level: 1, pct: 1 }, desc: "Dégâts lasers P.E.T +1 % (appliqué)." },
    { id: "proto_ailm2", name: "AI-LM2 · Laser", price: 12500000, icon: "/PET/PET_PROTOCOLS/AI-LM1.png", petLevel: 4, petProtocol: { key: "damage", level: 2, pct: 2 }, desc: "Dégâts lasers P.E.T +2 % (appliqué)." },
    { id: "proto_ailm3", name: "AI-LM3 · Laser", price: 45000000, icon: "/PET/PET_PROTOCOLS/AI-LM1.png", petLevel: 8, petProtocol: { key: "damage", level: 3, pct: 4 }, desc: "Dégâts lasers P.E.T +4 % (appliqué)." },
    { id: "proto_aiaim1", name: "AI-AIM1 · Ciblage", price: 3000000, icon: "/PET/PET_PROTOCOLS/AI-AIM1.png", petLevel: 0, petProtocol: { key: "aim", level: 1, pct: 1 }, desc: "Précision P.E.T +1 %." },
    { id: "proto_aiaim2", name: "AI-AIM2 · Ciblage", price: 7500000, icon: "/PET/PET_PROTOCOLS/AI-AIM1.png", petLevel: 4, petProtocol: { key: "aim", level: 2, pct: 2 }, desc: "Précision P.E.T +2 %." },
    { id: "proto_aiaim3", name: "AI-AIM3 · Ciblage", price: 25000000, icon: "/PET/PET_PROTOCOLS/AI-AIM1.png", petLevel: 8, petProtocol: { key: "aim", level: 3, pct: 4 }, desc: "Précision P.E.T +4 %." },
    { id: "proto_aie1", name: "AI-E1 · Évasion", price: 5000000, icon: "/PET/PET_PROTOCOLS/AI-E1.png", petLevel: 0, petProtocol: { key: "evasion", level: 1, pct: 1 }, desc: "Évasion P.E.T +1 %." },
    { id: "proto_aie2", name: "AI-E2 · Évasion", price: 12500000, icon: "/PET/PET_PROTOCOLS/AI-E1.png", petLevel: 4, petProtocol: { key: "evasion", level: 2, pct: 2 }, desc: "Évasion P.E.T +2 %." },
    { id: "proto_aie3", name: "AI-E3 · Évasion", price: 45000000, icon: "/PET/PET_PROTOCOLS/AI-E1.png", petLevel: 8, petProtocol: { key: "evasion", level: 3, pct: 3 }, desc: "Évasion P.E.T +3 %." },
    { id: "proto_aihp1", name: "AI-HP1 · Coque", price: 5000000, icon: "/PET/PET_PROTOCOLS/AI-HP1.png", petLevel: 0, petProtocol: { key: "hp", level: 1, pct: 1 }, desc: "Coque P.E.T +1 %." },
    { id: "proto_aihp2", name: "AI-HP2 · Coque", price: 12500000, icon: "/PET/PET_PROTOCOLS/AI-HP1.png", petLevel: 4, petProtocol: { key: "hp", level: 2, pct: 2 }, desc: "Coque P.E.T +2 %." },
    { id: "proto_aihp3", name: "AI-HP3 · Coque", price: 45000000, icon: "/PET/PET_PROTOCOLS/AI-HP1.png", petLevel: 8, petProtocol: { key: "hp", level: 3, pct: 4 }, desc: "Coque P.E.T +4 %." },
    { id: "proto_aial1", name: "AI-AL1 · Alien", price: 3000000, icon: "/PET/PET_PROTOCOLS/AI-AL1.png", petLevel: 0, petProtocol: { key: "alien", level: 1, pct: 1 }, desc: "Dégâts vs aliens +1 % (appliqué)." },
    { id: "proto_aial2", name: "AI-AL2 · Alien", price: 7500000, icon: "/PET/PET_PROTOCOLS/AI-AL1.png", petLevel: 4, petProtocol: { key: "alien", level: 2, pct: 3 }, desc: "Dégâts vs aliens +3 % (appliqué)." },
    { id: "proto_aial3", name: "AI-AL3 · Alien", price: 25000000, icon: "/PET/PET_PROTOCOLS/AI-AL1.png", petLevel: 8, petProtocol: { key: "alien", level: 3, pct: 6 }, desc: "Dégâts vs aliens +6 % (appliqué)." },
    { id: "proto_aieco1", name: "AI-ECO1 · Économie", price: 5000000, icon: "/PET/PET_PROTOCOLS/AI-ECO1.png", petLevel: 0, petProtocol: { key: "eco", level: 1, pct: 3 }, desc: "Consommation fuel −3 %." },
    { id: "proto_aieco2", name: "AI-ECO2 · Économie", price: 12500000, icon: "/PET/PET_PROTOCOLS/AI-ECO1.png", petLevel: 4, petProtocol: { key: "eco", level: 2, pct: 3.5 }, desc: "Consommation fuel −3,5 %." },
    { id: "proto_aieco3", name: "AI-ECO3 · Économie", price: 45000000, icon: "/PET/PET_PROTOCOLS/AI-ECO1.png", petLevel: 8, petProtocol: { key: "eco", level: 3, pct: 4 }, desc: "Consommation fuel −4 %." },
    { id: "proto_aiah1", name: "AI-AH1 · Chaleur", price: 5000000, icon: "/PET/PET_PROTOCOLS/AI-AH1.png", petLevel: 0, petProtocol: { key: "heat", level: 1, pct: 1 }, desc: "Génération chaleur +1 %." },
    { id: "proto_aiah2", name: "AI-AH2 · Chaleur", price: 15000000, icon: "/PET/PET_PROTOCOLS/AI-AH1.png", petLevel: 4, petProtocol: { key: "heat", level: 2, pct: 2 }, desc: "Génération chaleur +2 %." },
    { id: "proto_aiah3", name: "AI-AH3 · Chaleur", price: 50000000, icon: "/PET/PET_PROTOCOLS/AI-AH1.png", petLevel: 8, petProtocol: { key: "heat", level: 3, pct: 3 }, desc: "Génération chaleur +3 %." },
  ],

  formations: DRONE_FORMATIONS.filter(formation => formation.price > 0).map(formation => ({
    id: `formation_${formation.id}`, name: formation.name, price: formation.price,
    formation: { id: formation.id, minDrones: formation.minDrones, icon: formation.icon },
    icon: formation.icon,
  })),

  // Boosters officiels (stock consommable, activation depuis la fenêtre Boosters).
  boosters: BOOSTERS.map((b) => ({
    id: `booster_${b.id}`,
    name: `${b.name} (${b.code})`,
    price: b.price,
    icon: b.icon,
    desc: b.desc,
    booster: { id: b.id },
  })),

  // ✅ auto depuis SHIP_PACKS (price propre à chaque vaisseau, fallback heuristique)
  // « Vaisseaux » = uniquement les vaisseaux de base ; toutes les variantes
  // (designs) sont dans la catégorie « designs ».
  ships: SHIP_PACKS
    .filter(p => p?.id && !isStarterPackId(p.id) && !isRemovedShipPack(p.id) && !getShipDesignBaseId(p.id))
    .map(p => ({
      id: `ship_${p.id}`,
      name: `Vaisseau: ${p.name || p.id}`,
      price: Number(p.price) > 0 ? Number(p.price) : defaultShipPrice(p),
      ship: { id: p.id },
    })),

  designs: SHIP_PACKS
    .filter(p => p?.id && !isStarterPackId(p.id) && !isRemovedShipPack(p.id) && getShipDesignBaseId(p.id))
    .map(p => ({
      id: `design_${p.id}`,
      name: p.name || p.id,
      price: Number(p.price) > 0 ? Number(p.price) : defaultShipPrice(p),
      design: { id: p.id, base: getShipDesignBaseId(p.id) },
    })),
};

export function findCatalogItem(itemId) {
  for (const cat of Object.values(CATALOG)) {
    if (!Array.isArray(cat)) continue;
    const it = cat.find(x => x?.id === itemId);
    if (it) return it;
  }
  return null;
}

