// SHIP/SHIP_BONUSES.js
// Gains officiels des vaisseaux / designs pour l'affichage boutique.
// Sources : darkorbitwiki.com (ships + ships-plus) et fandom Designs.
//  - effet      : bonus passif (ex : "+20% PV"). null = aucun.
//  - competence : capacite active (ex : "Griffe gelee"). null = aucune.
// Un design non listé ici hérite de son vaisseau de base (cosmétique pur).
// Ex : Goliath Saturn -> effet "+20% PV" (design), compétence héritée (aucune).
"use strict";

import { getShipDesignBaseId } from "./SHIP_PACKS.js";

// ---------------------------------------------------------------------------
// Vaisseaux de base (ids de SHIP_BASE_IDS + modeles autonomes)
// ---------------------------------------------------------------------------
const SHIP_BASE_INFO = {
  aegis: { effet: null, competence: "Réparation coque / bouclier / Pod" },
  basilisk: { effet: null, competence: "Nuage toxique / Valeur exaltée" },
  berserker: { effet: null, competence: "Lien de bouclier / Berserk / Représailles" },
  bigboy: { effet: null, competence: null },
  centurion: { effet: null, competence: null }, // projets instables = modules, pas affichés
  citadel: { effet: null, competence: "Protection / Attraction / Fortification / Voyage" },
  cyborg: { effet: "+10% Dégâts", competence: "Singularité II" },
  defcom: { effet: null, competence: "Camouflage ultime" },
  diminisher: { effet: "+5% Dégâts", competence: "Affaiblissement bouclier" },
  dinde: { effet: null, competence: null },
  disruptor: { effet: null, competence: "Redirection / Désordre bouclier / DDoL" },
  goliath: { effet: null, competence: null },
  goliath_x: { effet: "+2% Dégâts, +2% XP", competence: "Griffe gelée" },
  hammerclaw: { effet: "+20% PV", competence: "Réparation coque / bouclier / Pod" },
  hecate: { effet: null, competence: "Faisceau à particules" },
  holo: { effet: null, competence: "Inversion (soi / ennemi)" },
  hyperion: { effet: null, competence: "Ancre gravitationnelle" },
  keres: { effet: null, competence: "Propagation / Esquive" },
  leonov: { effet: "+150% Dégâts/Bouclier/PV, roquettes x2.5, XP x2, vitesse x1.2 (cartes x-1 à x-4 de sa firme)", competence: null },
  liberator: { effet: null, competence: null },
  mimesis: { effet: "+10% Bouclier, +5% Pénétration", competence: "Brouillage / Sortie de phase" },
  nostromo: { effet: null, competence: null },
  orcus: { effet: null, competence: "Duplication / Assimilation" },
  paladin: { effet: null, competence: "Éventreur / Dernier rempart" },
  phoenix_bleu: { effet: null, competence: null },
  piranha: { effet: null, competence: null },
  police: { effet: null, competence: null },
  pusat: { effet: null, competence: null },
  retiarus: { effet: null, competence: "Supercharge / Tir chargé" },
  sentinel: { effet: "+10% Bouclier", competence: "Forteresse" },
  solace: { effet: "+10% Bouclier", competence: "Nano-réparateur" },
  solaris: { effet: null, competence: "Incinération" },
  spearhead: { effet: null, competence: "Camouflage ultime / JAMX / Marqueur / Recon" },
  spectrum: { effet: "+10% Bouclier", competence: "Blindage prismatique" },
  tartarus: { effet: null, competence: "Tir rapide / Boost vitesse" },
  tempest: { effet: null, competence: "Lien volt / Décharge / Secours" },
  vengeance: { effet: null, competence: null },
  venom: { effet: "+5% Dégâts", competence: "Singularité" },
  yamato: { effet: null, competence: "Voyage" },
  zephyr: { effet: null, competence: "Élan / Triple barrage" },
  // Vaisseaux Plus
  liberator_plus: { effet: null, competence: "Auto-réparation" },
  goliath_plus: { effet: "+10% Dégâts/PV/Bouclier REX par visuel (max +50%)", competence: "Amélioration HEAT" },
  citadel_plus: { effet: null, competence: "Attraction / Voyage / Protection / Fortification / Endurance prismatique" },
  solace_plus: { effet: null, competence: "Nano-réparateur Plus" },
  solaris_plus: { effet: null, competence: "Incinération Plus" },
  pusat_plus: { effet: null, competence: "Siphon vitesse / Barrière stimulante / Supercharge Plus" },
  hammerclaw_plus: { effet: null, competence: "Réparation coque / bouclier / Pod / Réallocation" },
  hecate_plus: { effet: null, competence: "Faisceau à particules Plus / Stock" },
  spearhead_plus: { effet: null, competence: "Camouflage ultime / JAMX / Marqueur / Recon" },
  tartarus_plus: { effet: null, competence: "Tir rapide Plus / Boost vitesse Plus" },
  spectrum_plus: { effet: null, competence: "Réflexion prismatique" },
  retiarus_plus: { effet: null, competence: "Tir super-chargé / Supercharge Plus" },
};

// ---------------------------------------------------------------------------
// Designs avec un gain propre (effet). competence omise = héritée de la base.
// ---------------------------------------------------------------------------
const SHIP_DESIGN_INFO = {
  // Goliath
  goliath_bastion: { effet: "+10% Bouclier" },
  goliath_centaur: { effet: "+10% PV" },
  goliath_champion: { effet: "+5% Dégâts, +10% Honneur" },
  goliath_enforcer: { effet: "+5% Dégâts" },
  goliath_exalted: { effet: "+10% Honneur" },
  goliath_goal: { effet: "+10% XP" },
  goliath_kick: { effet: "+10% Bouclier" },
  goliath_peacemaker: { effet: "+7% Dégâts" },
  goliath_sovereign: { effet: "+7% Dégâts" },
  goliath_vanquisher: { effet: "+7% Dégâts" },
  goliath_referee: { effet: "+5% Dégâts" },
  goliath_saturn: { effet: "+20% PV" },
  goliath_surgeon: { effet: "+6% Dégâts, +6% Honneur, +6% XP" },
  goliath_veteran: { effet: "+10% XP" },
  // Vengeance
  vengeance_adept: { effet: "+10% XP" },
  vengeance_avenger: { effet: "+10% Bouclier" },
  vengeance_corsair: { effet: "+10% Honneur" },
  vengeance_lightning: { effet: "+5% Dégâts", competence: "Postcombustion" },
  vengeance_revenge: { effet: "+5% Dégâts" },
  // Autres
  bigboy_solemn: { effet: "+10% XP" },
  yamato_ronin: { effet: "+40 000 PV" },
  centurion_damage: { effet: "+8% Dégâts" },
  centurion_hp: { effet: "+15% PV" },
  centurion_shield: { effet: "+12% Bouclier" },
  centurion_speed: { effet: "+10 Vitesse" },
  centurion_ability: { effet: null, competence: "Compétence instable" },
  centurion_tyrannos: { effet: "+10% Dégâts" },
  c_elite_ullrin: { effet: "+5% Dégâts", competence: "Protection / Attraction / Fortification / Voyage" },
};

// Préfixes de designs qui partagent le gain d'un design parent.
const SHIP_DESIGN_PREFIXES = [
  ["goliath_champion_", "goliath_champion"],
  ["goliath_surgeon_", "goliath_surgeon"],
  ["goliath_x_", "goliath_x"],
  ["vengeance_lightning_", "vengeance_lightning"],
  ["aegis_elite_", "aegis_elite"],
  ["aegis_veteran_", "aegis_veteran"],
  ["citadel_elite_", "citadel_elite"],
  ["citadel_veteran_", "citadel_veteran"],
  ["spearhead_elite_", "spearhead_elite"],
  ["spearhead_veteran_", "spearhead_veteran"],
];

const SHIP_PREFIX_INFO = {
  aegis_elite: { effet: "+5% Dégâts", competence: "Réparation coque / bouclier / Pod" },
  aegis_veteran: { effet: "+5% Honneur, +5% XP", competence: "Réparation coque / bouclier / Pod" },
  citadel_elite: { effet: "+5% Dégâts", competence: "Protection / Attraction / Fortification / Voyage" },
  citadel_veteran: { effet: "+5% Honneur, +5% XP", competence: "Protection / Attraction / Fortification / Voyage" },
  spearhead_elite: { effet: "+5% Dégâts", competence: "Camouflage ultime / JAMX / Marqueur / Recon" },
  spearhead_veteran: { effet: "+5% Honneur, +5% XP", competence: "Camouflage ultime / JAMX / Marqueur / Recon" },
};

// Cas particuliers : id boutique ne suivant pas le préfixe de sa base.
const SHIP_DESIGN_OVERRIDES = {
  g_champion_design_g_champion_ireland: "goliath_champion",
};

function designEntryFor(shipId) {
  const id = String(shipId || "");
  if (!id) return null;
  if (SHIP_DESIGN_INFO[id]) return SHIP_DESIGN_INFO[id];
  if (SHIP_DESIGN_OVERRIDES[id] && SHIP_DESIGN_INFO[SHIP_DESIGN_OVERRIDES[id]]) {
    return SHIP_DESIGN_INFO[SHIP_DESIGN_OVERRIDES[id]];
  }
  for (const [prefix, key] of SHIP_DESIGN_PREFIXES) {
    if (id.startsWith(prefix)) {
      if (SHIP_DESIGN_INFO[key]) return SHIP_DESIGN_INFO[key];
      if (SHIP_PREFIX_INFO[key]) return SHIP_PREFIX_INFO[key];
      // goliath_x_* : hérite du vaisseau goliath_x (effet + compétence).
      const base = getShipDesignBaseId(id);
      if (base && SHIP_BASE_INFO[base]) return {};
    }
  }
  return null;
}

/**
 * Renvoie { effet, competence } pour un id de vaisseau ou de design.
 * - design à gain propre -> son effet + compétence de sa base.
 * - design cosmétique   -> effet + compétence de sa base.
 * - base / autonome     -> ses propres gains (ou aucun).
 */
export function getShipBonusInfo(shipId) {
  const id = String(shipId || "");
  if (!id) return { effet: null, competence: null };
  const baseId = getShipDesignBaseId(id) || id;
  const base = SHIP_BASE_INFO[baseId] || SHIP_BASE_INFO[id] || { effet: null, competence: null };
  const entry = designEntryFor(id);
  if (!entry) return { effet: base.effet ?? null, competence: base.competence ?? null };
  return {
    effet: entry.effet !== undefined ? entry.effet : (base.effet ?? null),
    competence: entry.competence !== undefined ? entry.competence : (base.competence ?? null),
  };
}

// ---------------------------------------------------------------------------
// Stats numériques des effets passifs, appliquées par le moteur.
// Champs : hpPct, flatHp, shieldPct, damagePct, speedFlat, expPct, honorPct,
// penPct. Tout ce qui est conditionnel ou dynamique est EXCLU (voir plus bas)
// et reste affiché uniquement en boutique.
// Exclus (affichage seul) :
// - Goliath Plus "HEAT" : bonus P.E.T. (géré à part dans ORBIT_ENGINE).
// Le Leonov est géré à part dans computeHangarStats (bonus conditionnel
// à la map courante).
// ---------------------------------------------------------------------------
const SHIP_EFFECT_STATS = {
  cyborg: { damagePct: 10 },
  diminisher: { damagePct: 5 },
  goliath_x: { damagePct: 2, expPct: 2 },
  hammerclaw: { hpPct: 20 },
  mimesis: { shieldPct: 10, penPct: 5 },
  sentinel: { shieldPct: 10 },
  solace: { shieldPct: 10 },
  spectrum: { shieldPct: 10 },
  venom: { damagePct: 5 },
  // Designs à gain propre
  goliath_bastion: { shieldPct: 10 },
  goliath_centaur: { hpPct: 10 },
  goliath_champion: { damagePct: 5, honorPct: 10 },
  goliath_enforcer: { damagePct: 5 },
  goliath_exalted: { honorPct: 10 },
  goliath_goal: { expPct: 10 },
  goliath_kick: { shieldPct: 10 },
  goliath_peacemaker: { damagePct: 7 },
  goliath_sovereign: { damagePct: 7 },
  goliath_vanquisher: { damagePct: 7 },
  goliath_referee: { damagePct: 5 },
  goliath_saturn: { hpPct: 20 },
  goliath_surgeon: { damagePct: 6, honorPct: 6, expPct: 6 },
  goliath_veteran: { expPct: 10 },
  vengeance_adept: { expPct: 10 },
  vengeance_avenger: { shieldPct: 10 },
  vengeance_corsair: { honorPct: 10 },
  vengeance_lightning: { damagePct: 5 },
  vengeance_revenge: { damagePct: 5 },
  bigboy_solemn: { expPct: 10 },
  yamato_ronin: { flatHp: 40000 },
  centurion_damage: { damagePct: 8 },
  centurion_hp: { hpPct: 15 },
  centurion_shield: { shieldPct: 12 },
  centurion_speed: { speedFlat: 10 },
  centurion_tyrannos: { damagePct: 10 },
  c_elite_ullrin: { damagePct: 5 },
  aegis_elite: { damagePct: 5 },
  aegis_veteran: { honorPct: 5, expPct: 5 },
  citadel_elite: { damagePct: 5 },
  citadel_veteran: { honorPct: 5, expPct: 5 },
  spearhead_elite: { damagePct: 5 },
  spearhead_veteran: { honorPct: 5, expPct: 5 },
};

const EMPTY_STATS = { hpPct: 0, flatHp: 0, shieldPct: 0, damagePct: 0, speedFlat: 0, expPct: 0, honorPct: 0, penPct: 0 };

function statsKeyFor(shipId) {
  const id = String(shipId || "");
  if (!id) return null;
  if (SHIP_EFFECT_STATS[id]) return id;
  if (SHIP_DESIGN_OVERRIDES[id] && SHIP_EFFECT_STATS[SHIP_DESIGN_OVERRIDES[id]]) {
    return SHIP_DESIGN_OVERRIDES[id];
  }
  for (const [prefix, key] of SHIP_DESIGN_PREFIXES) {
    if (id.startsWith(prefix) && SHIP_EFFECT_STATS[key]) return key;
  }
  return null;
}

/**
 * Renvoie les stats numériques de l'effet passif d'un vaisseau ou design,
 * en suivant la même règle d'héritage que l'affichage (cosmétique = base).
 * Toujours un objet complet (zéros si aucun effet applicable).
 */
export function getShipEffectStats(shipId) {
  const id = String(shipId || "");
  if (!id) return { ...EMPTY_STATS };
  const key = statsKeyFor(id) || getShipDesignBaseId(id) || id;
  const found = SHIP_EFFECT_STATS[key];
  if (!found) return { ...EMPTY_STATS };
  return { ...EMPTY_STATS, ...found };
}
