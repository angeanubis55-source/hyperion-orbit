"use strict";

import { NPC_REWARDS } from "../NPC/NPC_BALANCE.js";

export const MAX_ACTIVE_QUESTS = 5;
const K = (id, type, amount, label, map) => ({ id, kind: "kill", type, amount, label, ...(map ? { map } : {}) });
const C = (id, type, amount, label, map) => ({ id, kind: "collect", type, amount, label, ...(map ? { map } : {}) });
const V = map => ({ id: `visit_${map}`, kind: "visit", type: map, amount: 1, label: `Visiter la carte ${map}` });
const G = (type, amount = 1) => ({ id: `gate_${type}`, kind: "gate", type, amount, label: `Terminer la Galaxy Gate ${type[0].toUpperCase()}${type.slice(1)}` });
const Q = (id, title, description, objectives, credits, exp, honor, requires) => ({ id, title, description, objectives, reward: { credits, exp, honor }, ...(requires ? { requires } : {}) });
// ---------------------------------------------------------------------------
// Moteur de rééquilibrage (audit 2026).
// Constat : les récompenses manuelles variaient de 0.01x à 43x la valeur farm
// des kills demandés (ex : 1000 Cubikons = 500M mais 3500 Cubikons = 150M).
// Règle unique pour les contrats kill : la quête verse ~150% du farm en bonus
// (le joueur touche déjà le farm en tuant), plus un plancher par kill qui
// revalorise les petites quêtes, plus un forfait d'aventure. Plafonds hauts
// uniquement en garde-fou (la finale "dernière marche" reste au sommet).
// Conséquence garantie : à cibles égales, plus de kills = plus de récompense.
// ---------------------------------------------------------------------------
const QUEST_KILL_MULT = 1.5;
const QUEST_FLOOR_PER_KILL = { credits: 15000, exp: 7500, honor: 30 };
const QUEST_FLOOR_CAP = { credits: 5000000, exp: 2500000, honor: 100000 };
const QUEST_FLAT_BONUS = { credits: 250000, exp: 125000, honor: 500 };
const QUEST_REWARD_CAP = { credits: 8000000000, exp: 4000000000, honor: 25000000 };
const balancedKillReward = objectives => {
  let kills = 0, farmC = 0, farmE = 0, farmH = 0;
  for (const objective of objectives || []) {
    if (objective?.kind !== "kill") continue;
    const amount = Math.max(0, Math.floor(Number(objective.amount) || 0));
    kills += amount;
    const rate = NPC_REWARDS[objective.type];
    if (!rate) continue; // type "*" ou inconnu : seul le plancher s'applique
    farmC += Number(rate.credits || 0) * amount;
    farmE += Number(rate.exp || 0) * amount;
    farmH += Number(rate.honor || 0) * amount;
  }
  const round1k = value => Math.floor(value / 1000) * 1000;
  const round100 = value => Math.floor(value / 100) * 100;
  const credits = Math.min(QUEST_REWARD_CAP.credits, round1k(farmC * QUEST_KILL_MULT + Math.min(kills * QUEST_FLOOR_PER_KILL.credits, QUEST_FLOOR_CAP.credits) + QUEST_FLAT_BONUS.credits));
  const exp = Math.min(QUEST_REWARD_CAP.exp, round1k(farmE * QUEST_KILL_MULT + Math.min(kills * QUEST_FLOOR_PER_KILL.exp, QUEST_FLOOR_CAP.exp) + QUEST_FLAT_BONUS.exp));
  const honor = Math.min(QUEST_REWARD_CAP.honor, round100(farmH * QUEST_KILL_MULT + Math.min(kills * QUEST_FLOOR_PER_KILL.honor, QUEST_FLOOR_CAP.honor) + QUEST_FLAT_BONUS.honor));
  return { credits, exp, honor };
};
// Construit une quête à dominante kill dont la récompense est calculée.
// `extra` ajoute un bonus fixe (collectes, visites, danger particulier).
const KQ = (id, title, description, objectives, requires, extra) => {
  const base = balancedKillReward(objectives);
  const bonus = extra || {};
  const credits = Math.min(QUEST_REWARD_CAP.credits, base.credits + Math.max(0, Math.floor(Number(bonus.credits) || 0)));
  const exp = Math.min(QUEST_REWARD_CAP.exp, base.exp + Math.max(0, Math.floor(Number(bonus.exp) || 0)));
  const honor = Math.min(QUEST_REWARD_CAP.honor, base.honor + Math.max(0, Math.floor(Number(bonus.honor) || 0)));
  return Q(id, title, description, objectives, credits, exp, honor, requires);
};
const AQ = (id, title, description, objectives, credits, exp, honor, ammo, requires) => ({ ...Q(id, title, description, objectives, credits, exp, honor, requires), reward: { credits, exp, honor, ammo } });
const EQ = (id, title, description, objectives, credits, exp, honor, galaxyEnergy, requires) => ({ ...Q(id, title, description, objectives, credits, exp, honor, requires), reward: { credits, exp, honor, galaxyEnergy } });
const CEQ = (id, title, description, objectives, credits, exp, honor, ammo, galaxyEnergy, requires) => ({ ...Q(id, title, description, objectives, credits, exp, honor, requires), reward: { credits, exp, honor, ammo, galaxyEnergy } });

const HUNT_FAMILIES = [
  ["streuner", "Streuner", "npc_Streuner", 12, 80000], ["lordakia", "Lordakia", "npc_Lordakia", 15, 120000],
  ["saimon", "Saimon", "npc_Saimon", 18, 170000], ["mordon", "Mordon", "npc_Mordon", 15, 240000],
  ["devolarium", "Devolarium", "npc_Devolarium", 8, 360000], ["sibelonit", "Sibelonit", "npc_Sibelonit", 20, 320000],
  ["sibelon", "Sibelon", "npc_Sibelon", 10, 480000], ["lordakium", "Lordakium", "npc_Lordakium", 8, 640000],
  ["kristallin", "Kristallin", "npc_Kristallin", 25, 440000], ["kristallon", "Kristallon", "npc_Kristallon", 6, 900000],
  ["protegit", "Protegit", "npc_Protegit", 30, 600000], ["marauder", "Marauder", "npc_Marauder", 15, 560000],
  ["interceptor", "Interceptor", "npc_Interceptor", 15, 700000], ["barracuda", "Barracuda", "npc_Barracuda", 10, 900000],
  ["saboteur", "Saboteur", "npc_Saboteur", 8, 1100000], ["annihilator", "Annihilator", "npc_Annihilator", 5, 1400000],
];
const HUNT_TIERS = [
  ["easy", "Battue", 1, 1, "Facile"],
  ["medium", "Traque", 4, 5, "Moyenne"],
  ["hard", "Carnage", 12, 18, "Difficile"],
];
const GENERATED_HUNTS = HUNT_FAMILIES.flatMap(([id, name, type, baseAmount, baseCredits]) => HUNT_TIERS.map(([tier, prefix, amountScale, rewardScale, difficulty]) => ({
  ...Q(`${tier}_${id}`, `${prefix} ${name}`, `Contrat ${difficulty.toLowerCase()} centré sur les ${name}s.`, [K(id, type, baseAmount * amountScale, `Éliminer des ${name}s`)], baseCredits * rewardScale, Math.floor(baseCredits * rewardScale * 0.5), Math.floor(baseCredits * rewardScale * 0.002), tier === "medium" ? `easy_${id}` : tier === "hard" ? `medium_${id}` : null),
  difficulty,
})));

const ELITE_FAMILIES = [
  ["streuner", "Streuner", "npc_Boss_Streuner", "npc_Uber_Streuner", 450000],
  ["lordakia", "Lordakia", "npc_Boss_Lordakia", "npc_Uber_Lordakia", 600000],
  ["saimon", "Saimon", "npc_Boss_Saimon", "npc_Uber_Saimon", 800000],
  ["mordon", "Mordon", "npc_Boss_Mordon", "npc_Uber_Mordon", 1100000],
  ["devolarium", "Devolarium", "npc_Boss_Devolarium", "npc_Uber_Devolarium", 1500000],
  ["sibelonit", "Sibelonit", "npc_Boss_Sibelonit", "npc_Uber_Sibelonit", 1300000],
  ["sibelon", "Sibelon", "npc_Boss_Sibelon", "npc_Uber_Sibelon", 1900000],
  ["lordakium", "Lordakium", "npc_Boss_Lordakium", "npc_Uber_Lordakium", 2600000],
  ["kristallin", "Kristallin", "npc_Boss_Kristallin", "npc_Uber_Kristallin", 1800000],
  ["kristallon", "Kristallon", "npc_Boss_Kristallon", "npc_Uber_Kristallon", 3500000],
];
const GENERATED_ELITE_HUNTS = ELITE_FAMILIES.flatMap(([id, name, bossType, uberType, credits]) => [
  { ...Q(`elite_${id}_1`, `Meute ${name}`, `Première étape de la série élite ${name}.`, [K("boss", bossType, 3, `Éliminer des Boss ${name}s`)], credits, credits / 2, credits * 0.002), difficulty: "Facile" },
  { ...Q(`elite_${id}_2`, `Boucherie ${name}`, `Deuxième étape de la série élite ${name}.`, [K("boss", bossType, 15, `Éliminer des Boss ${name}s`), K("uber", uberType, 5, `Éliminer des Uber ${name}s`)], credits * 7, credits * 3.5, credits * 0.014, `elite_${id}_1`), difficulty: "Moyenne" },
  { ...Q(`elite_${id}_3`, `Génocide ${name}`, `Dernière étape de la série élite ${name}.`, [K("boss", bossType, 50, `Éliminer des Boss ${name}s`), K("uber", uberType, 25, `Éliminer des Uber ${name}s`)], credits * 30, credits * 15, credits * 0.06, `elite_${id}_2`), difficulty: "Difficile" },
]);

const GENERATED_ROUTES = [
  ["route_mmo_outer", "Faubourgs MMO", ["1-5", "1-6", "1-7", "1-8"], 100000],
  ["route_eic_outer", "Faubourgs EIC", ["2-5", "2-6", "2-7", "2-8"], 100000],
  ["route_vru_outer", "Faubourgs VRU", ["3-5", "3-6", "3-7", "3-8"], 100000],
  ["route_mmo_hidden", "Entrailles MMO", ["4-1", "1-9", "1-10"], 200000, "route_mmo_outer"],
  ["route_eic_hidden", "Entrailles EIC", ["4-2", "2-9", "2-10"], 200000, "route_eic_outer"],
  ["route_vru_hidden", "Entrailles VRU", ["4-3", "3-9", "3-10"], 200000, "route_vru_outer"],
  ["route_homeworlds", "Pèlerinage des mères", ["1-1", "2-1", "3-1"], 250000, "upper_tour"],
  ["route_warzone", "Route du carnage", ["4-1", "4-2", "4-3", "4-4", "4-5"], 400000, "route_homeworlds"],
].map(([id, title, maps, credits, requires], index) => ({
  ...Q(id, title, "Traverse tous les secteurs indiqués par le contrôleur de mission.", maps.map(V), credits, Math.floor(credits * 0.5), Math.floor(credits * 0.002), requires),
  difficulty: index < 3 ? "Facile" : index < 6 ? "Moyenne" : "Difficile",
}));

const GENERATED_COLLECTIONS = [
  ["boxes_easy", "Rafale express", "Bonus_Box", 25, 300000, "Facile"],
  ["boxes_medium", "Gros filets", "Bonus_Box", 150, 2000000, "Moyenne"],
  ["boxes_hard", "Trésor de guerre", "Bonus_Box", 750, 12000000, "Difficile"],
  ["cargo_easy", "Petites ferrailles", "Cargo_Box", 20, 400000, "Facile"],
  ["cargo_medium", "Roi de la ferraille", "Cargo_Box", 120, 2400000, "Moyenne"],
  ["cargo_hard", "Seigneur des épaves", "Cargo_Box", 600, 14000000, "Difficile"],
  ["palladium_easy", "Premier pactole", "Palladium_Ore", 30, 500000, "Facile"],
  ["palladium_medium", "Convoi doré", "Palladium_Ore", 250, 5000000, "Moyenne"],
  ["palladium_hard", "Coffre du pirate", "Palladium_Ore", 1500, 36000000, "Difficile"],
].map(([id, title, type, amount, credits, difficulty], index, rows) => ({
  ...Q(id, title, `Contrat de collecte de difficulté ${difficulty.toLowerCase()}.`, [C("collect", type, amount, `Collecter ${amount} ${type.replaceAll("_", " ")}`)], credits, Math.floor(credits * 0.5), Math.floor(credits * 0.002), index % 3 ? rows[index - 1][0] : null),
  difficulty,
}));

const GENERATED_GATE_CONTRACTS = [
  ["gate_alpha_repeat_5", "Marathon Alpha", "alpha", 5, 12000000, "gate_alpha"],
  ["gate_beta_repeat_5", "Marathon Beta", "beta", 5, 18000000, "gate_beta"],
  ["gate_gamma_repeat_5", "Marathon Gamma", "gamma", 5, 27000000, "gate_gamma"],
  ["gate_alpha_repeat_10", "Domination Alpha", "alpha", 10, 30000000, "gate_alpha_repeat_5"],
  ["gate_beta_repeat_10", "Domination Beta", "beta", 10, 45000000, "gate_beta_repeat_5"],
  ["gate_gamma_repeat_10", "Domination Gamma", "gamma", 10, 68000000, "gate_gamma_repeat_5"],
  ["gate_alpha_repeat_25", "Maîtrise Alpha", "alpha", 25, 90000000, "gate_alpha_repeat_10"],
  ["gate_beta_repeat_25", "Maîtrise Beta", "beta", 25, 135000000, "gate_beta_repeat_10"],
  ["gate_gamma_repeat_25", "Maîtrise Gamma", "gamma", 25, 200000000, "gate_gamma_repeat_10"],
  ["gate_alpha_repeat_50", "Légende Alpha", "alpha", 50, 240000000, "gate_alpha_repeat_25"],
  ["gate_beta_repeat_50", "Légende Beta", "beta", 50, 360000000, "gate_beta_repeat_25"],
  ["gate_gamma_repeat_50", "Légende Gamma", "gamma", 50, 540000000, "gate_gamma_repeat_25"],
  ["gate_alpha_repeat_100", "Centenaire Alpha", "alpha", 100, 1100000000, "gate_alpha_repeat_50"],
  ["gate_beta_repeat_100", "Centenaire Beta", "beta", 100, 1500000000, "gate_beta_repeat_50"],
  ["gate_gamma_repeat_100", "Centenaire Gamma", "gamma", 100, 2200000000, "gate_gamma_repeat_50"],
].map(([id, title, type, amount, credits, requires]) => ({ ...Q(id, title, `Termine ${amount} fois la Galaxy Gate ${type}.`, [G(type, amount)], credits, Math.floor(credits * 0.35), Math.floor(credits * 0.0015), requires) }));

const PIRATE_CAMPAIGNS = [
  Q("pirate_marauder_raid", "Raid Marauder", "Réduis les patrouilles Marauder.", [K("marauder", "npc_Marauder", 100, "Éliminer des Marauders")], 13000000, 6500000, 26000, "pirate_entry"),
  Q("pirate_outlaw_mix", "Coalition hors-la-loi", "Démantèle plusieurs bandes pirates.", [K("vagrant", "npc_Vagrant", 100, "Éliminer des Vagrants"), K("outcast", "npc_Outcast", 100, "Éliminer des Outcasts"), K("convict", "npc_Convict", 75, "Éliminer des Convicts"), K("hooligan", "npc_Hooligan", 75, "Éliminer des Hooligans")], 40000000, 20000000, 80000, "pirate_cleanup"),
  Q("pirate_ravager_line", "Ligne de feu : Ravager", "Écrase l’avant-garde Ravager.", [K("ravager", "npc_Ravager", 150, "Éliminer des Ravagers"), K("corsair", "npc_Corsair", 100, "Éliminer des Corsairs")], 40000000, 20000000, 80000, "pirate_outlaw_mix"),
  Q("pirate_interceptor_500", "Essaim d’Interceptors", "Neutralise une flotte complète d’Interceptors.", [K("interceptor", "npc_Interceptor", 500, "Éliminer des Interceptors")], 30000000, 15000000, 60000, "pirate_elite"),
  Q("pirate_barracuda_300", "Morsure du Barracuda", "Chasse les Barracudas des routes pirates.", [K("barracuda", "npc_Barracuda", 300, "Éliminer des Barracudas")], 60000000, 30000000, 120000, "pirate_elite"),
  Q("pirate_saboteur_250", "Contre-sabotage", "Élimine les premières cellules Saboteur.", [K("saboteur", "npc_Saboteur", 250, "Éliminer des Saboteurs")], 70000000, 35000000, 140000, "pirate_elite"),
  Q("pirate_annihilator_100", "Directive Annihilator", "Détruis les unités lourdes Annihilator.", [K("annihilator", "npc_Annihilator", 100, "Éliminer des Annihilators")], 55000000, 27500000, 110000, "pirate_elite"),
  Q("pirate_battleray_25", "Chasse au Battleray", "Affronte les prédateurs majeurs du territoire pirate.", [K("battleray", "npc_Battleray", 25, "Éliminer des Battlerays")], 50000000, 25000000, 100000, "pirate_annihilator_100"),
  Q("pirate_falcon_10", "Le Faucon du siècle", "Fais tomber plusieurs Century Falcons.", [K("falcon", "npc_Century_Falcon", 10, "Éliminer des Century Falcons")], 60000000, 30000000, 120000, "pirate_battleray_25"),
  Q("pirate_armada", "Armada à couler", "Détruis toutes les classes principales d’une armada.", [K("interceptor", "npc_Interceptor", 1000, "Éliminer des Interceptors"), K("barracuda", "npc_Barracuda", 500, "Éliminer des Barracudas"), K("saboteur", "npc_Saboteur", 500, "Éliminer des Saboteurs"), K("annihilator", "npc_Annihilator", 250, "Éliminer des Annihilators")], 400000000, 200000000, 800000, "pirate_falcon_10"),
  Q("pirate_saboteur_2500", "Guerre de l’ombre", "Poursuis la campagne contre les Saboteurs.", [K("saboteur", "npc_Saboteur", 2500, "Éliminer des Saboteurs")], 500000000, 250000000, 1000000, "pirate_saboteur_250"),
  Q("pirate_saboteur_7500", "Réseau fantôme", "Détruis l’essentiel du réseau Saboteur.", [K("saboteur", "npc_Saboteur", 7500, "Éliminer des Saboteurs")], 1200000000, 600000000, 2400000, "pirate_saboteur_2500"),
  Q("pirate_saboteur_17500", "Extinction des Saboteurs", "Contrat pirate de très longue durée.", [K("saboteur", "npc_Saboteur", 17500, "Éliminer des Saboteurs")], 2500000000, 1250000000, 5000000),
  Q("pirate_palladium_5000", "Tout le Palladium", "Accumule une réserve massive de Palladium.", [C("palladium", "Palladium_Ore", 5000, "Collecter du Palladium", "5-2")], 150000000, 75000000, 300000, "palladium_industry"),
];

const SPECIAL_CAMPAIGNS = [
  Q("ancient_trio", "Triade des anciens", "Affronte Styxus, Charopos et Lanatum.", [K("styxus", "npc_Styxus", 25, "Éliminer des Styxus"), K("charopos", "npc_Charopos", 25, "Éliminer des Charopos"), K("lanatum", "npc_Lanatum", 25, "Éliminer des Lanatum")], 40000000, 20000000, 80000),
];

const PERMANENT_ELITE_CONTRACTS = [
  KQ("elite_cube_3500", "Faucheuse à Cubikons", "Contrat permanent contre les Cubikons.", [K("cubikon", "npc_Cubikon", 3500, "Détruire des Cubikons")]),
  KQ("elite_protegit_35000", "Marée de Protegits", "Élimine une population entière de Protegits.", [K("protegit", "npc_Protegit", 35000, "Éliminer des Protegits")]),
  KQ("elite_interceptor_65000", "Fléau des Interceptors", "Contrat permanent contre les flottes Interceptor.", [K("interceptor", "npc_Interceptor", 65000, "Éliminer des Interceptors")]),
  KQ("elite_annihilator_10500", "Requiem des Annihilators", "Élimine les unités Annihilator à très grande échelle.", [K("annihilator", "npc_Annihilator", 10500, "Éliminer des Annihilators")]),
];

const AMMO_CONTRACTS = [
  AQ("ammo_x2_easy", "Miettes X2", "Premier contrat de ravitaillement laser.", [K("streuner", "npc_Streuner", 25, "Éliminer des Streuners")], 120000, 60000, 240, { x2: 2000 }),
  AQ("ammo_x2_medium", "Butin X2", "Constitue une réserve X2 plus importante.", [K("lordakia", "npc_Lordakia", 150, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 100, "Éliminer des Saimons")], 750000, 375000, 1500, { x2: 10000 }, "ammo_x2_easy"),
  AQ("ammo_x2_hard", "Arsenal X2", "Contrat d’endurance pour un stock X2 durable.", [K("mordon", "npc_Mordon", 500, "Éliminer des Mordons"), K("devolarium", "npc_Devolarium", 150, "Éliminer des Devolariums")], 10000000, 5000000, 20000, { x2: 40000 }, "ammo_x2_medium"),
  AQ("ammo_x3_easy", "Miettes X3", "Débloque une première cargaison X3.", [K("mordon", "npc_Mordon", 50, "Éliminer des Mordons")], 375000, 187500, 750, { x3: 2000 }),
  AQ("ammo_x3_medium", "Butin X3", "Sécurise une cargaison moyenne de X3.", [K("sibelonit", "npc_Sibelonit", 250, "Éliminer des Sibelonits"), K("sibelon", "npc_Sibelon", 75, "Éliminer des Sibelons")], 2000000, 1000000, 4000, { x3: 10000 }, "ammo_x3_easy"),
  AQ("ammo_x3_hard", "Arsenal X3", "Constitue une réserve avancée de X3.", [K("kristallin", "npc_Kristallin", 1000, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 100, "Éliminer des Kristallons")], 25000000, 12500000, 50000, { x3: 30000 }, "ammo_x3_medium"),
  AQ("ammo_x4_easy", "Miettes UCB", "Gagne une petite réserve de munitions X4.", [K("kristallon", "npc_Kristallon", 10, "Éliminer des Kristallons")], 750000, 375000, 1500, { x4: 1000 }),
  AQ("ammo_x4_medium", "Butin UCB", "Renforce ta réserve de munitions X4.", [K("boss", "npc_Boss_Kristallon", 20, "Éliminer des Boss Kristallons"), K("cubikon", "npc_Cubikon", 5, "Détruire des Cubikons")], 10000000, 5000000, 20000, { x4: 5000 }, "ammo_x4_easy"),
  AQ("ammo_x4_hard", "Arsenal UCB-100", "Contrat difficile pour une réserve X4 maîtrisée.", [K("kristallon", "npc_Kristallon", 500, "Éliminer des Kristallons"), K("cubikon", "npc_Cubikon", 50, "Détruire des Cubikons")], 100000000, 50000000, 200000, { x4: 20000 }, "ammo_x4_medium"),
  AQ("ammo_sab_easy", "Miettes SAB", "Récupère une petite cargaison de SAB.", [K("sibelon", "npc_Sibelon", 25, "Éliminer des Sibelons")], 600000, 300000, 1200, { sab: 1000 }),
  AQ("ammo_sab_medium", "Butin SAB", "Augmente ta réserve de munitions absorbantes.", [K("lordakium", "npc_Lordakium", 100, "Éliminer des Lordakiums"), K("sibelon", "npc_Sibelon", 150, "Éliminer des Sibelons")], 15000000, 7500000, 30000, { sab: 5000 }, "ammo_sab_easy"),
  AQ("ammo_sab_hard", "Arsenal SAB", "Contrat difficile de ravitaillement SAB.", [K("boss_lordakium", "npc_Boss_Lordakium", 100, "Éliminer des Boss Lordakiums"), K("uber_sibelon", "npc_Uber_Sibelon", 50, "Éliminer des Uber Sibelons")], 40000000, 20000000, 80000, { sab: 15000 }, "ammo_sab_medium"),
];

const GALAXY_ENERGY_CONTRACTS = [
  EQ("energy_first_cells", "Premières étincelles", "Récupère des ressources simples pour alimenter le générateur Galaxy Gate.", [C("bonus", "Bonus_Box", 20, "Collecter des Bonus Boxes")], 200000, 100000, 400, 5),
  EQ("energy_border_patrol", "Sueur et cellules", "Sécurise les voies proches afin de recevoir un nouveau lot d’énergies.", [K("lordakia", "npc_Lordakia", 40, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 25, "Éliminer des Saimons")], 250000, 125000, 250, 10, "energy_first_cells"),
  EQ("energy_heavy_salvage", "Gros démontage", "Démonte des unités blindées et récupère leurs cellules intactes.", [K("devolarium", "npc_Devolarium", 25, "Éliminer des Devolariums"), K("sibelon", "npc_Sibelon", 25, "Éliminer des Sibelons")], 750000, 375000, 750, 20, "energy_border_patrol"),
  EQ("energy_crystal_reserve", "Cœur de cristal", "Affronte les forces cristallines pour constituer une réserve durable.", [K("kristallin", "npc_Kristallin", 200, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 30, "Éliminer des Kristallons")], 2500000, 1250000, 2500, 35, "energy_heavy_salvage"),
  EQ("energy_pirate_cells", "Marché noir", "Intercepte une cargaison énergétique en territoire pirate.", [K("interceptor", "npc_Interceptor", 150, "Éliminer des Interceptors", "5-2"), C("palladium", "Palladium_Ore", 250, "Collecter du Palladium", "5-2")], 5000000, 2500000, 5000, 50, "energy_crystal_reserve"),
  EQ("energy_cube_core", "Cœurs à prendre", "Brise les défenses Cubikon et récupère leurs noyaux les plus stables.", [K("cubikon", "npc_Cubikon", 20, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 400, "Éliminer des Protegits")], 60000000, 30000000, 120000, 75, "energy_pirate_cells"),
  EQ("energy_gate_trinity", "Triple saut", "Termine une fois chaque portail de l’ensemble Alpha, Beta et Gamma.", [G("alpha"), G("beta"), G("gamma")], 35000000, 17500000, 35000, 100, "energy_cube_core"),
  EQ("energy_ultimate_stock", "Coffre du vétéran", "Prouve ton endurance dans les Gates et contre les unités d’élite.", [G("alpha", 5), G("beta", 3), G("gamma", 2), K("uber", "npc_Uber_Kristallon", 50, "Éliminer des Uber Kristallons", "4-5")], 50000000, 25000000, 50000, 250, "energy_gate_trinity"),
];

const CURSED_MAP_CONTRACTS = [
  CEQ("cursed_first_contact", "Là où meurent les noms", "Pénètre dans la carte ??? et survis au premier contact.", [V("MAUDITE"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits", "MAUDITE")], 25000000, 25000000, 125000, { x4: 5000, x6: 500 }, 12),
  CEQ("cursed_astral_harvest", "Moisson des damnés", "Récupère les réserves rares disséminées dans le secteur ???.", [C("astral", "Astral_Prime_Box", 100, "Collecter des Astral Prime Boxes", "MAUDITE")], 50000000, 50000000, 250000, { x4: 10000, x6: 1000 }, 25, "cursed_first_contact"),
  CEQ("cursed_protegit_line", "Légions de l’oubli", "Détruis chacune des variantes de Protegit qui infestent la carte ???.", [K("protegit_1", "npc_Protegit_maudite", 150, "Éliminer des Protegits maudits", "MAUDITE"), K("protegit_2", "npc_Protegit_maudite2", 150, "Éliminer des Protegits maudits renforcés", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 150, "Éliminer des Protegits maudits suprêmes", "MAUDITE")], 150000000, 150000000, 750000, { x4: 25000, x6: 2500 }, 50, "cursed_astral_harvest"),
  CEQ("cursed_ammunition_run", "Arsenal des tréfonds", "Résiste aux essaims de ??? pour obtenir une cargaison de combat exceptionnelle.", [K("protegit", "npc_Protegit", 500, "Éliminer des Protegits", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 250, "Éliminer des Protegits maudits suprêmes", "MAUDITE")], 250000000, 250000000, 1250000, { x4: 50000, x6: 5000, sab: 25000 }, 100, "cursed_protegit_line"),
  CEQ("cursed_cube_breakers", "Brise-mondes", "Détruis les forteresses vivantes qui contrôlent le secteur ???.", [K("cubikon", "npc_Cubikon", 100, "Détruire des Cubikons", "MAUDITE"), K("cursed_cubikon", "npc_Cubikon_maudite", 25, "Détruire des Cubikons maudits", "MAUDITE")], 500000000, 500000000, 3750000, { x4: 125000, x6: 12500 }, 250, "cursed_ammunition_run"),
  CEQ("cursed_extermination", "La grande purge", "Mène une campagne complète contre toutes les forces de la carte maudite.", [K("cubikon", "npc_Cubikon", 250, "Détruire des Cubikons", "MAUDITE"), K("cursed_cubikon", "npc_Cubikon_maudite", 100, "Détruire des Cubikons maudits", "MAUDITE"), K("protegit_1", "npc_Protegit_maudite", 750, "Éliminer des Protegits maudits", "MAUDITE"), K("protegit_2", "npc_Protegit_maudite2", 750, "Éliminer des Protegits maudits renforcés", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 750, "Éliminer des Protegits maudits suprêmes", "MAUDITE")], 500000000, 500000000, 5000000, { x4: 100000, x6: 10000, sab: 50000 }, 100, "cursed_cube_breakers"),
  CEQ("cursed_legend", "Légende des tréfonds", "Accomplis l’épreuve ultime du secteur ???.", [K("cursed_cubikon", "npc_Cubikon_maudite", 500, "Détruire des Cubikons maudits", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 5000, "Éliminer des Protegits maudits suprêmes", "MAUDITE"), C("astral", "Astral_Prime_Box", 1000, "Collecter des Astral Prime Boxes", "MAUDITE")], 2500000000, 2500000000, 25000000, { x4: 500000, x6: 50000, sab: 250000 }, 500, "cursed_extermination"),
];

const LEGENDARY_KILL_CONTRACTS = [
  CEQ("legend_million_npcs", "Million de cadavres", "Élimine un million de NPC, toutes espèces et toutes cartes confondues.", [K("all_npcs", "*", 1000000, "Éliminer des NPC")], 2000000000, 1000000000, 10000000, { x4: 50000, x6: 5000, sab: 20000 }, 50),
];

const SUPPLY_CONTRACTS = [
  AQ("supply_x2_starter", "Premiers chargeurs", "Élimine une petite patrouille pour recevoir des munitions X2.", [K("streuner", "npc_Streuner", 10, "Éliminer des Streuners")], 60000, 24000, 120, { x2: 2000 }),
  AQ("supply_x2_patrol", "Chargeurs de patrouille", "Repousse les éclaireurs des secteurs bas pour compléter ta réserve X2.", [K("lordakia", "npc_Lordakia", 50, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 25, "Éliminer des Saimons")], 375000, 150000, 750, { x2: 8000 }, "supply_x2_starter"),
  AQ("supply_x2_armored", "Convoi blindé", "Neutralise des unités intermédiaires et récupère leur cargaison.", [K("mordon", "npc_Mordon", 75, "Éliminer des Mordons"), K("devolarium", "npc_Devolarium", 20, "Éliminer des Devolariums")], 1200000, 480000, 2400, { x2: 20000 }, "supply_x2_patrol"),

  AQ("supply_x3_starter", "Premiers obus", "Affronte les Mordons pour recevoir une première réserve X3.", [K("mordon", "npc_Mordon", 20, "Éliminer des Mordons")], 180000, 72000, 360, { x3: 1000 }),
  AQ("supply_x3_patrol", "Obus de patrouille", "Détruis une escorte Sibelon afin de sécuriser des munitions X3.", [K("sibelonit", "npc_Sibelonit", 75, "Éliminer des Sibelonits"), K("sibelon", "npc_Sibelon", 15, "Éliminer des Sibelons")], 1000000, 400000, 2000, { x3: 5000 }, "supply_x3_starter"),
  AQ("supply_x3_crystal", "Convoi de cristal", "Récupère un ravitaillement avancé sur les forces cristallines.", [K("kristallin", "npc_Kristallin", 150, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 15, "Éliminer des Kristallons")], 2500000, 1000000, 5000, { x3: 15000 }, "supply_x3_patrol"),

  AQ("supply_x4_starter", "Premiers UCB", "Détruis quelques unités cristallines pour recevoir une petite quantité de X4.", [K("kristallin", "npc_Kristallin", 50, "Éliminer des Kristallins")], 375000, 150000, 750, { x4: 500 }),
  AQ("supply_x4_patrol", "UCB de patrouille", "Affronte les unités lourdes pour agrandir ta réserve X4.", [K("kristallon", "npc_Kristallon", 20, "Éliminer des Kristallons"), K("boss", "npc_Boss_Kristallin", 10, "Éliminer des Boss Kristallins")], 1800000, 720000, 3600, { x4: 2500 }, "supply_x4_starter"),
  AQ("supply_x4_cube", "Convoi du cube", "Brise une défense Cubikon pour obtenir une cargaison X4 intermédiaire.", [K("cubikon", "npc_Cubikon", 5, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits")], 15000000, 7500000, 30000, { x4: 10000 }, "supply_x4_patrol"),

  EQ("supply_energy_boxes", "Étincelles de départ", "Collecte quelques Bonus Boxes pour alimenter le générateur.", [C("bonus", "Bonus_Box", 10, "Collecter des Bonus Boxes")], 60000, 24000, 120, 3),
  EQ("supply_energy_cargo", "Cellules de récup", "Récupère des cargaisons abandonnées contenant des cellules énergétiques.", [C("cargo", "Cargo_Box", 25, "Collecter des Cargo Boxes")], 250000, 100000, 500, 8, "supply_energy_boxes"),
  EQ("supply_energy_patrol", "Patrouille aux cellules", "Nettoie les secteurs intermédiaires pour recevoir un lot d’énergies.", [K("mordon", "npc_Mordon", 75, "Éliminer des Mordons"), K("sibelonit", "npc_Sibelonit", 100, "Éliminer des Sibelonits")], 1200000, 480000, 2400, 15, "supply_energy_cargo"),
  EQ("supply_energy_crystal", "Cristal en cellules", "Détruis des forces cristallines afin de stabiliser davantage d’énergies.", [K("kristallin", "npc_Kristallin", 200, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 25, "Éliminer des Kristallons")], 3500000, 1400000, 7000, 30, "supply_energy_patrol"),
  EQ("supply_energy_cube", "Noyaux à saisir", "Récupère les noyaux de plusieurs Cubikons pour le générateur Galaxy Gate.", [K("cubikon", "npc_Cubikon", 10, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 200, "Éliminer des Protegits")], 30000000, 15000000, 60000, 50, "supply_energy_crystal"),
];

const HUNDRED_MISSION_CHAIN = [
  ["century_001", "Premier serment", [K("kristallon", "npc_Kristallon", 300, "Éliminer des Kristallons"), K("lordakium", "npc_Lordakium", 450, "Éliminer des Lordakiums")]],
  ["century_002", "Terres fracturées", [K("kristallin", "npc_Kristallin", 800, "Éliminer des Kristallins"), K("lordakia", "npc_Lordakia", 2000, "Éliminer des Lordakias")]],
  ["century_003", "Les bêtes aux portes", [K("boss_kristallon", "npc_Boss_Kristallon", 100, "Éliminer des Boss Kristallons"), K("boss_kristallin", "npc_Boss_Kristallin", 230, "Éliminer des Boss Kristallins"), V("2-1")]],
  ["century_004", "Heures contaminées", [V("2-2"), V("2-6"), K("blighted", "npc_Blighted_Kristallon", 460, "Éliminer des Blighted Kristallons")]],
  ["century_005", "Chair hybride", [K("blighted", "npc_Blighted_Kristallon", 230, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 500, "Éliminer des Blighted Gygerthralls"), C("alloy", "Hybrid_Alloy_Box", 1200, "Collecter des Hybrid Alloy Boxes")]],
  ["century_006", "Œil du gamma", [G("gamma"), K("kristallon", "npc_Kristallon", 300, "Éliminer des Kristallons"), V("3-7")]],
  ["century_007", "Sous notre loi", [K("kristallin", "npc_Kristallin", 700, "Éliminer des Kristallins"), V("4-5"), K("uber_kristallin", "npc_Uber_Kristallin", 100, "Éliminer des Uber Kristallins", "4-5")]],
  ["century_008", "Voies de sang", [K("uber_kristallin", "npc_Uber_Kristallin", 30, "Éliminer des Uber Kristallins", "4-5"), K("uber_kristallon", "npc_Uber_Kristallon", 30, "Éliminer des Uber Kristallons", "4-5"), K("uber_lordakium", "npc_Uber_Lordakium", 70, "Éliminer des Uber Lordakiums", "4-5")]],
  ["century_009", "Vol du faucon", [K("lordakia", "npc_Lordakia", 1500, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 2000, "Éliminer des Saimons"), K("mordon", "npc_Mordon", 1000, "Éliminer des Mordons")]],
  ["century_010", "Vermine pirate", [K("interceptor", "npc_Interceptor", 1200, "Éliminer des Interceptors"), K("saboteur", "npc_Saboteur", 500, "Éliminer des Saboteurs"), K("barracuda", "npc_Barracuda", 300, "Éliminer des Barracudas")]],
  ["century_011", "Rayons de la mort", [K("battleray", "npc_Battleray", 100, "Éliminer des Battlerays"), K("annihilator", "npc_Annihilator", 300, "Éliminer des Annihilators")]],
  ["century_012", "Guerre des chefs", [K("boss_sibelon", "npc_Boss_Sibelon", 200, "Éliminer des Boss Sibelons"), K("boss_lordakium", "npc_Boss_Lordakium", 150, "Éliminer des Boss Lordakiums"), K("boss_kristallon", "npc_Boss_Kristallon", 100, "Éliminer des Boss Kristallons")]],
  ["century_013", "Route des cimes", [V("1-8"), V("2-8"), V("3-8"), V("4-4")]],
  ["century_014", "Triple enfer", [G("alpha", 2), G("beta", 2), G("gamma", 2)]],
  ["century_015", "Cœurs de fer", [K("cubikon", "npc_Cubikon", 250, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 5000, "Éliminer des Protegits")]],
].map(([id, title, objectives], index, rows) => {
  const navigationOnly = objectives.every(objective => objective.kind === "visit");
  const firstEliteStep = id === "century_001";
  const cubikonStep = id === "century_015";
  const credits = navigationOnly ? 5000000 : firstEliteStep ? 60000000 : cubikonStep ? 800000000 : 160000000;
  const exp = navigationOnly ? 2500000 : firstEliteStep ? 60000000 : cubikonStep ? 400000000 : 160000000;
  const honor = navigationOnly ? 10000 : firstEliteStep ? 25000 : cubikonStep ? 1600000 : 75000;
  return Q(id, title, "Mission élite de longue durée adaptée aux systèmes disponibles.", objectives, credits, exp, honor, index ? rows[index - 1][0] : "pirate_saboteur_17500");
});

// ---------------------------------------------------------------------------
// Extension : une centaine de missions supplémentaires, toutes complétables
// avec les spawns existants (MAPS/*/SPAWNS.js + Gates Alpha/Beta/Gamma +
// invocations onKill). Aucun filtre de carte impossible, aucun NPC inexistant.
// ---------------------------------------------------------------------------

const FIRME_PATROLS = [
  KQ("firme_mmo_01", "MMO — Chair fraîche", "Sécurise les abords de la base MMO et ramasse les bonus.", [K("streuner", "npc_Streuner", 15, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], null, { credits: 50000, exp: 25000, honor: 100 }),
  KQ("firme_mmo_02", "MMO — Seconds couteaux", "Encadre les recrues et leurs accompagnateurs.", [K("recruit", "npc_Streuner_Recruit", 15, "Éliminer des Streuner Recruits"), K("aider", "npc_Streuner_Aider", 10, "Éliminer des Streuner Aiders")], "firme_mmo_01"),
  KQ("firme_mmo_03", "MMO — Yeux crevés", "Repousse les éclaireurs Lordakia et Saimon.", [K("lordakia", "npc_Lordakia", 25, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 20, "Éliminer des Saimons")], "firme_mmo_02"),
  KQ("firme_mmo_04", "MMO — Terrain conquis", "Cartographie deux secteurs MMO puis brise la ligne Mordon.", [V("1-2"), V("1-3"), K("mordon", "npc_Mordon", 15, "Éliminer des Mordons")], "firme_mmo_03", { credits: 450000, exp: 225000, honor: 900 }),
  KQ("firme_mmo_05", "MMO — Nid de vipères", "Contiens l'essaim Sibelonit et son commandant.", [K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits"), K("boss_sibelonit", "npc_Boss_Sibelonit", 3, "Éliminer des Boss Sibelonits")], "firme_mmo_04"),
  KQ("firme_mmo_06", "MMO — Tenir la ligne", "Repousse les Lordakiums des voies MMO.", [K("lordakium", "npc_Lordakium", 12, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 25, "Éliminer des Sibelonits")], "firme_mmo_05"),
  KQ("firme_mmo_07", "MMO — Moisson de glace", "Réduis l'avant-garde Kristallin et récupère les cargaisons.", [K("kristallin", "npc_Kristallin", 40, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 10, "Récupérer des Cargo Boxes")], "firme_mmo_06", { credits: 150000, exp: 75000, honor: 300 }),
  KQ("firme_mmo_08", "MMO — Prime aux chefs", "Traque les Boss des secteurs bas côté MMO.", [K("boss_lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("boss_saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons"), K("boss_mordon", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons")], "firme_mmo_07", { credits: 1500000, exp: 750000, honor: 3000 }),
  KQ("firme_eic_01", "EIC — Chair fraîche", "Sécurise les abords de la base EIC et ramasse les bonus.", [K("streuner", "npc_Streuner", 15, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], "cadet_contact", { credits: 50000, exp: 25000, honor: 100 }),
  KQ("firme_eic_02", "EIC — Seconds couteaux", "Encadre les recrues et leurs accompagnateurs.", [K("recruit", "npc_Streuner_Recruit", 15, "Éliminer des Streuner Recruits"), K("aider", "npc_Streuner_Aider", 10, "Éliminer des Streuner Aiders")], "firme_eic_01"),
  KQ("firme_eic_03", "EIC — Yeux crevés", "Repousse les éclaireurs Lordakia et Saimon.", [K("lordakia", "npc_Lordakia", 25, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 20, "Éliminer des Saimons")], "firme_eic_02"),
  KQ("firme_eic_04", "EIC — Terrain conquis", "Cartographie deux secteurs EIC puis brise la ligne Mordon.", [V("2-2"), V("2-3"), K("mordon", "npc_Mordon", 15, "Éliminer des Mordons")], "firme_eic_03", { credits: 450000, exp: 225000, honor: 900 }),
  KQ("firme_eic_05", "EIC — Nid de vipères", "Contiens l'essaim Sibelonit et son commandant.", [K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits"), K("boss_sibelonit", "npc_Boss_Sibelonit", 3, "Éliminer des Boss Sibelonits")], "firme_eic_04"),
  KQ("firme_eic_06", "EIC — Tenir la ligne", "Repousse les Lordakiums des voies EIC.", [K("lordakium", "npc_Lordakium", 12, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 25, "Éliminer des Sibelonits")], "firme_eic_05"),
  KQ("firme_eic_07", "EIC — Moisson de glace", "Réduis l'avant-garde Kristallin et récupère les cargaisons.", [K("kristallin", "npc_Kristallin", 40, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 10, "Récupérer des Cargo Boxes")], "firme_eic_06", { credits: 150000, exp: 75000, honor: 300 }),
  KQ("firme_eic_08", "EIC — Prime aux chefs", "Traque les Boss des secteurs bas côté EIC.", [K("boss_lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("boss_saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons"), K("boss_mordon", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons")], "firme_eic_07", { credits: 1500000, exp: 750000, honor: 3000 }),
  KQ("firme_vru_01", "VRU — Chair fraîche", "Sécurise les abords de la base VRU et ramasse les bonus.", [K("streuner", "npc_Streuner", 15, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], "cadet_contact", { credits: 50000, exp: 25000, honor: 100 }),
  KQ("firme_vru_02", "VRU — Seconds couteaux", "Encadre les recrues et leurs accompagnateurs.", [K("recruit", "npc_Streuner_Recruit", 15, "Éliminer des Streuner Recruits"), K("aider", "npc_Streuner_Aider", 10, "Éliminer des Streuner Aiders")], "firme_vru_01"),
  KQ("firme_vru_03", "VRU — Yeux crevés", "Repousse les éclaireurs Lordakia et Saimon.", [K("lordakia", "npc_Lordakia", 25, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 20, "Éliminer des Saimons")], "firme_vru_02"),
  KQ("firme_vru_04", "VRU — Terrain conquis", "Cartographie deux secteurs VRU puis brise la ligne Mordon.", [V("3-2"), V("3-3"), K("mordon", "npc_Mordon", 15, "Éliminer des Mordons")], "firme_vru_03", { credits: 450000, exp: 225000, honor: 900 }),
  KQ("firme_vru_05", "VRU — Nid de vipères", "Contiens l'essaim Sibelonit et son commandant.", [K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits"), K("boss_sibelonit", "npc_Boss_Sibelonit", 3, "Éliminer des Boss Sibelonits")], "firme_vru_04"),
  KQ("firme_vru_06", "VRU — Tenir la ligne", "Repousse les Lordakiums des voies VRU.", [K("lordakium", "npc_Lordakium", 12, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 25, "Éliminer des Sibelonits")], "firme_vru_05"),
  KQ("firme_vru_07", "VRU — Moisson de glace", "Réduis l'avant-garde Kristallin et récupère les cargaisons.", [K("kristallin", "npc_Kristallin", 40, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 10, "Récupérer des Cargo Boxes")], "firme_vru_06", { credits: 150000, exp: 75000, honor: 300 }),
  KQ("firme_vru_08", "VRU — Prime aux chefs", "Traque les Boss des secteurs bas côté VRU.", [K("boss_lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("boss_saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons"), K("boss_mordon", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons")], "firme_vru_07", { credits: 1500000, exp: 750000, honor: 3000 }),
];

const UBER_45_CAMPAIGN = [
  Q("uber45_01", "4-5 — Premiers crocs : Streuner", "Ouvre la campagne 4-5 contre les Streuners lourds.", [K("boss", "npc_Boss_Streuner", 5, "Éliminer des Boss Streuners", "4-5"), K("uber", "npc_Uber_Streuner", 5, "Éliminer des Uber Streuners", "4-5")], 2000000, 1000000, 4000, "dangerous_crossroads"),
  Q("uber45_02", "4-5 — Premiers crocs : Lordakia", "Poursuis contre les Lordakias lourds de 4-5.", [K("boss", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias", "4-5"), K("uber", "npc_Uber_Lordakia", 5, "Éliminer des Uber Lordakias", "4-5")], 2200000, 1100000, 4400, "uber45_01"),
  Q("uber45_03", "4-5 — Premiers crocs : Saimon", "Nettoie les Saimons lourds de 4-5.", [K("boss", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons", "4-5"), K("uber", "npc_Uber_Saimon", 5, "Éliminer des Uber Saimons", "4-5")], 2400000, 1200000, 4800, "uber45_02"),
  Q("uber45_04", "4-5 — Ligne brisée : Mordon", "Brise la ligne Mordon de 4-5.", [K("boss", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons", "4-5"), K("uber", "npc_Uber_Mordon", 5, "Éliminer des Uber Mordons", "4-5")], 2600000, 1300000, 5200, "uber45_03"),
  Q("uber45_05", "4-5 — Front éventré : Sibelon", "Démantèle le front Sibelon de 4-5.", [K("boss", "npc_Boss_Sibelon", 5, "Éliminer des Boss Sibelons", "4-5"), K("uber", "npc_Uber_Sibelon", 5, "Éliminer des Uber Sibelons", "4-5")], 2800000, 1400000, 5600, "uber45_04"),
  Q("uber45_06", "4-5 — Blindés fendus : Devolarium", "Détruis les blindés Devolarium de 4-5.", [K("boss", "npc_Boss_Devolarium", 5, "Éliminer des Boss Devolariums", "4-5"), K("uber", "npc_Uber_Devolarium", 5, "Éliminer des Uber Devolariums", "4-5")], 3000000, 1500000, 6000, "uber45_05"),
  Q("uber45_07", "4-5 — Nid écrasé : Sibelonit", "Écrase l'essaim Sibelonit de 4-5.", [K("boss", "npc_Boss_Sibelonit", 5, "Éliminer des Boss Sibelonits", "4-5"), K("uber", "npc_Uber_Sibelonit", 5, "Éliminer des Uber Sibelonits", "4-5")], 3200000, 1600000, 6400, "uber45_06"),
  Q("uber45_08", "4-5 — Pression sanglante : Lordakium", "Repousse les Lordakiums lourds de 4-5.", [K("boss", "npc_Boss_Lordakium", 5, "Éliminer des Boss Lordakiums", "4-5"), K("uber", "npc_Uber_Lordakium", 5, "Éliminer des Uber Lordakiums", "4-5")], 3400000, 1700000, 6800, "uber45_07"),
  Q("uber45_09", "4-5 — Glace brisée : Kristallin", "Survis aux Kristallins lourds de 4-5.", [K("boss", "npc_Boss_Kristallin", 5, "Éliminer des Boss Kristallins", "4-5"), K("uber", "npc_Uber_Kristallin", 5, "Éliminer des Uber Kristallins", "4-5")], 3600000, 1800000, 7200, "uber45_08"),
  Q("uber45_10", "4-5 — Cuirassés coulés : Kristallon", "Neutralise les Kristallons lourds de 4-5.", [K("boss", "npc_Boss_Kristallon", 5, "Éliminer des Boss Kristallons", "4-5"), K("uber", "npc_Uber_Kristallon", 5, "Éliminer des Uber Kristallons", "4-5")], 3800000, 1900000, 7600, "uber45_09"),
  Q("uber45_11", "4-5 — Frappe R8 : StreuneR8", "Termine le premier tour 4-5 contre les StreuneR8.", [K("boss", "npc_Boss_StreuneR8", 5, "Éliminer des Boss StreuneR8", "4-5"), K("uber", "npc_Uber_StreuneR8", 5, "Éliminer des Uber StreuneR8", "4-5")], 4000000, 2000000, 8000, "uber45_10"),
  Q("uber45_12", "4-5 — Second round : Streuner", "Deuxième vague contre la meute Streuner.", [K("boss", "npc_Boss_Streuner", 20, "Éliminer des Boss Streuners", "4-5"), K("uber", "npc_Uber_Streuner", 20, "Éliminer des Uber Streuners", "4-5")], 6000000, 3000000, 12000, "uber45_11"),
  Q("uber45_13", "4-5 — Second round : Lordakia", "Deuxième vague contre les Lordakias lourds.", [K("boss", "npc_Boss_Lordakia", 20, "Éliminer des Boss Lordakias", "4-5"), K("uber", "npc_Uber_Lordakia", 20, "Éliminer des Uber Lordakias", "4-5")], 6500000, 3250000, 13000, "uber45_12"),
  Q("uber45_14", "4-5 — Second round : Saimon", "Deuxième vague contre les Saimons lourds.", [K("boss", "npc_Boss_Saimon", 20, "Éliminer des Boss Saimons", "4-5"), K("uber", "npc_Uber_Saimon", 20, "Éliminer des Uber Saimons", "4-5")], 7000000, 3500000, 14000, "uber45_13"),
  Q("uber45_15", "4-5 — Second round : Mordon", "Deuxième vague contre la ligne Mordon.", [K("boss", "npc_Boss_Mordon", 20, "Éliminer des Boss Mordons", "4-5"), K("uber", "npc_Uber_Mordon", 20, "Éliminer des Uber Mordons", "4-5")], 7500000, 3750000, 15000, "uber45_14"),
  Q("uber45_16", "4-5 — Second round : Sibelon", "Deuxième vague contre le front Sibelon.", [K("boss", "npc_Boss_Sibelon", 20, "Éliminer des Boss Sibelons", "4-5"), K("uber", "npc_Uber_Sibelon", 20, "Éliminer des Uber Sibelons", "4-5")], 8000000, 4000000, 16000, "uber45_15"),
  Q("uber45_17", "4-5 — Second round : Devolarium", "Deuxième vague contre les blindés Devolarium.", [K("boss", "npc_Boss_Devolarium", 20, "Éliminer des Boss Devolariums", "4-5"), K("uber", "npc_Uber_Devolarium", 20, "Éliminer des Uber Devolariums", "4-5")], 8500000, 4250000, 17000, "uber45_16"),
  Q("uber45_18", "4-5 — Second round : Sibelonit", "Deuxième vague contre l'essaim Sibelonit.", [K("boss", "npc_Boss_Sibelonit", 20, "Éliminer des Boss Sibelonits", "4-5"), K("uber", "npc_Uber_Sibelonit", 20, "Éliminer des Uber Sibelonits", "4-5")], 9000000, 4500000, 18000, "uber45_17"),
  Q("uber45_19", "4-5 — Second round : Lordakium", "Deuxième vague contre les Lordakiums lourds.", [K("boss", "npc_Boss_Lordakium", 20, "Éliminer des Boss Lordakiums", "4-5"), K("uber", "npc_Uber_Lordakium", 20, "Éliminer des Uber Lordakiums", "4-5")], 9500000, 4750000, 19000, "uber45_18"),
  Q("uber45_20", "4-5 — Revanche de cristal", "Deuxième vague contre les forces cristallines lourdes.", [K("boss_kristallin", "npc_Boss_Kristallin", 20, "Éliminer des Boss Kristallins", "4-5"), K("uber_kristallin", "npc_Uber_Kristallin", 20, "Éliminer des Uber Kristallins", "4-5"), K("boss_kristallon", "npc_Boss_Kristallon", 15, "Éliminer des Boss Kristallons", "4-5"), K("uber_kristallon", "npc_Uber_Kristallon", 15, "Éliminer des Uber Kristallons", "4-5")], 15000000, 7500000, 30000, "uber45_19"),
  Q("uber45_21", "4-5 — Verrou R8", "Verrouille la campagne StreuneR8 en 4-5.", [K("boss", "npc_Boss_StreuneR8", 20, "Éliminer des Boss StreuneR8", "4-5"), K("uber", "npc_Uber_StreuneR8", 20, "Éliminer des Uber StreuneR8", "4-5")], 18000000, 9000000, 36000, "uber45_20"),
  Q("uber45_22", "4-5 — Domination totale", "Domine toutes les lignées lourdes de 4-5.", [K("boss_mordon", "npc_Boss_Mordon", 30, "Éliminer des Boss Mordons", "4-5"), K("boss_sibelon", "npc_Boss_Sibelon", 25, "Éliminer des Boss Sibelons", "4-5"), K("boss_lordakium", "npc_Boss_Lordakium", 20, "Éliminer des Boss Lordakiums", "4-5"), K("boss_kristallon", "npc_Boss_Kristallon", 15, "Éliminer des Boss Kristallons", "4-5")], 30000000, 15000000, 60000, "uber45_21"),
];

const CRYSTAL_R8_EXPEDITION = [
  Q("crystal_r8_01", "Premiers éclats de haine", "Ouvre l'expédition cristalline.", [K("kristallin", "npc_Kristallin", 60, "Éliminer des Kristallins"), K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits")], 1500000, 750000, 3000, "ice_fragments"),
  Q("crystal_r8_02", "Cuirassés de glace", "Affronte les premiers Kristallons.", [K("kristallon", "npc_Kristallon", 15, "Éliminer des Kristallons"), K("kristallin", "npc_Kristallin", 60, "Éliminer des Kristallins")], 1500000, 750000, 3000, "crystal_r8_01"),
  Q("crystal_r8_03", "Têtes de cristal", "Traque les Boss cristallins.", [K("boss_kristallin", "npc_Boss_Kristallin", 8, "Éliminer des Boss Kristallins"), K("boss_kristallon", "npc_Boss_Kristallon", 5, "Éliminer des Boss Kristallons")], 2200000, 1100000, 4400, "crystal_r8_02"),
  Q("crystal_r8_04", "Souverains à genoux", "Défie les Empereurs cristallins et Lordakium.", [K("emperor_kristallon", "npc_Emperor_Kristallon", 2, "Éliminer des Emperor Kristallons"), K("emperor_lordakium", "npc_Emperor_Lordakium", 2, "Éliminer des Emperor Lordakiums")], 100000000, 50000000, 200000, "crystal_r8_03"),
  Q("crystal_r8_05", "Nuée R8", "Nettoie la nuée StreuneR8.", [K("r8", "npc_StreuneR8", 60, "Éliminer des StreuneR8"), K("boss_r8", "npc_Boss_StreuneR8", 10, "Éliminer des Boss StreuneR8")], 3500000, 1750000, 7000, "crystal_r8_04"),
  Q("crystal_r8_06", "Essaim enragé", "Poursuis la campagne R8.", [K("r8", "npc_StreuneR8", 150, "Éliminer des StreuneR8"), K("boss_r8", "npc_Boss_StreuneR8", 25, "Éliminer des Boss StreuneR8")], 7000000, 3500000, 14000, "crystal_r8_05"),
  Q("crystal_r8_07", "Foyers à éteindre", "Endigue les Blighted Kristallins et Kristallons.", [K("blighted_kristallin", "npc_Blighted_Kristallin", 60, "Éliminer des Blighted Kristallins"), K("blighted_kristallon", "npc_Blighted_Kristallon", 30, "Éliminer des Blighted Kristallons")], 5000000, 2500000, 10000, "crystal_r8_06"),
  Q("crystal_r8_08", "Chasse au Gygerthrall", "Provoque l'apparition des Gygerthralls en détruisant des Blighted.", [K("blighted_kristallon", "npc_Blighted_Kristallon", 60, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 60, "Éliminer des Blighted Gygerthralls")], 8000000, 4000000, 16000, "crystal_r8_07"),
  Q("crystal_r8_09", "Marée contaminée", "Affronte une vague massive de contaminés.", [K("blighted_kristallin", "npc_Blighted_Kristallin", 200, "Éliminer des Blighted Kristallins"), K("blighted_kristallon", "npc_Blighted_Kristallon", 120, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 120, "Éliminer des Blighted Gygerthralls")], 14000000, 7000000, 28000, "crystal_r8_08"),
  Q("crystal_r8_10", "Triade à abattre", "Affronte les trois Empereurs.", [K("sibelon", "npc_Emperor_Sibelon", 3, "Éliminer des Emperor Sibelons"), K("lordakium", "npc_Emperor_Lordakium", 3, "Éliminer des Emperor Lordakiums"), K("kristallon", "npc_Emperor_Kristallon", 3, "Éliminer des Emperor Kristallons")], 200000000, 100000000, 400000, "crystal_r8_09"),
  Q("crystal_r8_11", "Avant-garde de givre", "Traque les Ubers cristallins de 4-5.", [K("uber_kristallin", "npc_Uber_Kristallin", 15, "Éliminer des Uber Kristallins", "4-5"), K("uber_kristallon", "npc_Uber_Kristallon", 10, "Éliminer des Uber Kristallons", "4-5")], 9000000, 4500000, 18000, "crystal_r8_10"),
  Q("crystal_r8_12", "Verrou R8", "Verrouille la lignée R8 en 4-5.", [K("boss_r8", "npc_Boss_StreuneR8", 10, "Éliminer des Boss StreuneR8", "4-5"), K("uber_r8", "npc_Uber_StreuneR8", 10, "Éliminer des Uber StreuneR8", "4-5")], 9000000, 4500000, 18000, "crystal_r8_11"),
  Q("crystal_r8_13", "Moisson d’alliages", "Récupère des alliages hybrides sur les contaminés.", [K("blighted_kristallon", "npc_Blighted_Kristallon", 40, "Éliminer des Blighted Kristallons"), C("alloy", "Hybrid_Alloy_Box", 40, "Collecter des Hybrid Alloy Boxes")], 7000000, 3500000, 14000, "crystal_r8_12"),
  Q("crystal_r8_14", "Stock de guerre", "Constitue un stock d'alliages.", [K("gyger", "npc_Blighted_Gygerthrall", 100, "Éliminer des Blighted Gygerthralls"), C("alloy", "Hybrid_Alloy_Box", 100, "Collecter des Hybrid Alloy Boxes")], 11000000, 5500000, 22000, "crystal_r8_13"),
  Q("crystal_r8_15", "Cap au nord", "Visite les secteurs avancés MMO, EIC et VRU.", [V("1-8"), V("2-8"), V("3-8")], 3000000, 1500000, 6000, "crystal_r8_14"),
  Q("crystal_r8_16", "Guerre du cristal : acte I", "Lance une campagne démesurée contre le cristal.", [K("kristallin", "npc_Kristallin", 300, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 80, "Éliminer des Kristallons")], 18000000, 9000000, 36000, "crystal_r8_15"),
  Q("crystal_r8_17", "Guerre du cristal : acte II", "Poursuis contre les commandants et souverains.", [K("boss_kristallin", "npc_Boss_Kristallin", 30, "Éliminer des Boss Kristallins"), K("boss_kristallon", "npc_Boss_Kristallon", 20, "Éliminer des Boss Kristallons"), K("emperor_kristallon", "npc_Emperor_Kristallon", 3, "Éliminer des Emperor Kristallons")], 150000000, 75000000, 300000, "crystal_r8_16"),
  Q("crystal_r8_18", "Bûcher de cristal", "Achève l'expédition cristalline.", [K("kristallin", "npc_Kristallin", 500, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 150, "Éliminer des Kristallons"), K("blighted_kristallon", "npc_Blighted_Kristallon", 100, "Éliminer des Blighted Kristallons")], 40000000, 20000000, 80000, "crystal_r8_17"),
];

const PIRATE_52_OPERATIONS = [
  Q("pirate52_01", "5-2 — Premier sang", "Ouvre les opérations pirates.", [K("interceptor", "npc_Interceptor", 30, "Éliminer des Interceptors", "5-2"), V("5-2")], 2500000, 1250000, 5000, "pirate_entry"),
  Q("pirate52_02", "5-2 — Morsure", "Chasse les Barracudas des routes pirates.", [K("barracuda", "npc_Barracuda", 20, "Éliminer des Barracudas", "5-2"), K("interceptor", "npc_Interceptor", 30, "Éliminer des Interceptors", "5-2")], 3500000, 1750000, 7000, "pirate52_01"),
  Q("pirate52_03", "5-2 — Saboteurs à terre", "Élimine les premières cellules Saboteur.", [K("saboteur", "npc_Saboteur", 15, "Éliminer des Saboteurs", "5-2"), K("barracuda", "npc_Barracuda", 20, "Éliminer des Barracudas", "5-2")], 4500000, 2250000, 9000, "pirate52_02"),
  Q("pirate52_04", "5-2 — Lourds à couler", "Détruis les unités lourdes Annihilator.", [K("annihilator", "npc_Annihilator", 10, "Éliminer des Annihilators", "5-2"), K("saboteur", "npc_Saboteur", 15, "Éliminer des Saboteurs", "5-2")], 6000000, 3000000, 12000, "pirate52_03"),
  Q("pirate52_05", "5-2 — Patrouille éventrée", "Démantèle une patrouille mixte.", [K("interceptor", "npc_Interceptor", 60, "Éliminer des Interceptors", "5-2"), K("barracuda", "npc_Barracuda", 30, "Éliminer des Barracudas", "5-2"), K("saboteur", "npc_Saboteur", 20, "Éliminer des Saboteurs", "5-2"), K("annihilator", "npc_Annihilator", 10, "Éliminer des Annihilators", "5-2")], 9000000, 4500000, 18000, "pirate52_04"),
  Q("pirate52_06", "5-2 — Premiers lingots", "Constitue une première réserve de Palladium.", [C("palladium", "Palladium_Ore", 100, "Collecter du Palladium", "5-2"), K("interceptor", "npc_Interceptor", 30, "Éliminer des Interceptors", "5-2")], 7000000, 3500000, 14000, "pirate52_05"),
  Q("pirate52_07", "5-2 — Convoi saigné", "Sécurise un convoi de Palladium.", [C("palladium", "Palladium_Ore", 250, "Collecter du Palladium", "5-2"), K("barracuda", "npc_Barracuda", 30, "Éliminer des Barracudas", "5-2")], 8000000, 4000000, 16000, "pirate52_06"),
  Q("pirate52_08", "5-2 — Chasse aux Ubers", "Affronte les versions Uber des pirates.", [K("uber_interceptor", "npc_Uber_Interceptor", 3, "Éliminer des Uber Interceptors", "5-2"), K("uber_barracuda", "npc_Uber_Barracuda", 3, "Éliminer des Uber Barracudas", "5-2"), K("uber_saboteur", "npc_Uber_Saboteur", 3, "Éliminer des Uber Saboteurs", "5-2"), K("uber_annihilator", "npc_Uber_Annihilator", 2, "Éliminer des Uber Annihilators", "5-2")], 15000000, 7500000, 30000, "pirate52_07"),
  Q("pirate52_09", "5-2 — Essaim noyé", "Neutralise un essaim d'Interceptors.", [K("interceptor", "npc_Interceptor", 200, "Éliminer des Interceptors", "5-2")], 12000000, 6000000, 24000, "pirate52_08"),
  Q("pirate52_10", "5-2 — Meute dépecée", "Chasse une meute de Barracudas.", [K("barracuda", "npc_Barracuda", 120, "Éliminer des Barracudas", "5-2")], 13000000, 6500000, 26000, "pirate52_09"),
  Q("pirate52_11", "5-2 — Réseau arraché", "Détruis le réseau Saboteur.", [K("saboteur", "npc_Saboteur", 100, "Éliminer des Saboteurs", "5-2")], 14000000, 7000000, 28000, "pirate52_10"),
  Q("pirate52_12", "5-2 — Marteaux brisés", "Détruis les marteaux Annihilator.", [K("annihilator", "npc_Annihilator", 60, "Éliminer des Annihilators", "5-2")], 16000000, 8000000, 32000, "pirate52_11"),
  Q("pirate52_13", "5-2 — Navette infernale", "Fais la navette entre le front 4-5 et le territoire pirate.", [V("4-5"), V("5-2"), K("interceptor", "npc_Interceptor", 50, "Éliminer des Interceptors", "5-2")], 7000000, 3500000, 14000, "pirate52_12"),
  Q("pirate52_14", "5-2 — Coffre de guerre", "Accumule une réserve stratégique de Palladium.", [C("palladium", "Palladium_Ore", 750, "Collecter du Palladium", "5-2"), K("saboteur", "npc_Saboteur", 50, "Éliminer des Saboteurs", "5-2")], 18000000, 9000000, 36000, "pirate52_13"),
  Q("pirate52_15", "5-2 — Armada coulée", "Détruis une armada réduite.", [K("interceptor", "npc_Interceptor", 300, "Éliminer des Interceptors", "5-2"), K("barracuda", "npc_Barracuda", 150, "Éliminer des Barracudas", "5-2"), K("saboteur", "npc_Saboteur", 100, "Éliminer des Saboteurs", "5-2"), K("annihilator", "npc_Annihilator", 50, "Éliminer des Annihilators", "5-2")], 35000000, 17500000, 70000, "pirate52_14"),
  Q("pirate52_16", "5-2 — Le seigneur tombe", "Termine les opérations pirates.", [C("palladium", "Palladium_Ore", 1500, "Collecter du Palladium", "5-2"), K("annihilator", "npc_Annihilator", 100, "Éliminer des Annihilators", "5-2"), K("uber_annihilator", "npc_Uber_Annihilator", 5, "Éliminer des Uber Annihilators", "5-2")], 50000000, 25000000, 100000, "pirate52_15"),
];

const SALVAGE_GATE_OPERATIONS = [
  Q("salvage_gate_01", "Charogne — Boîtes bonus", "Lance les opérations de récupération.", [C("bonus", "Bonus_Box", 30, "Collecter des Bonus Boxes"), K("streuner", "npc_Streuner", 20, "Éliminer des Streuners")], 500000, 250000, 1000, "collector_route"),
  Q("salvage_gate_02", "Charogne — Cargaisons", "Récupère les cargaisons des NPC détruits.", [C("cargo", "Cargo_Box", 30, "Collecter des Cargo Boxes"), K("lordakia", "npc_Lordakia", 30, "Éliminer des Lordakias")], 1000000, 500000, 2000, "salvage_gate_01"),
  Q("salvage_gate_03", "Charogne — Butins verts", "Chasse les Green Booty Boxes.", [C("booty", "Green_Booty_Box", 15, "Collecter des Green Booty Boxes"), K("saimon", "npc_Saimon", 30, "Éliminer des Saimons")], 2000000, 1000000, 4000, "salvage_gate_02"),
  Q("salvage_gate_04", "Charogne — Grande rafle", "Effectue un grand ramassage mixte.", [C("bonus", "Bonus_Box", 100, "Collecter des Bonus Boxes"), C("cargo", "Cargo_Box", 80, "Collecter des Cargo Boxes"), C("booty", "Green_Booty_Box", 10, "Collecter des Green Booty Boxes")], 2000000, 1000000, 4000, "salvage_gate_03"),
  Q("salvage_gate_05", "Charogne — Alliages", "Prélève des alliages sur les contaminés.", [C("alloy", "Hybrid_Alloy_Box", 30, "Collecter des Hybrid Alloy Boxes"), K("blighted_kristallon", "npc_Blighted_Kristallon", 20, "Éliminer des Blighted Kristallons")], 3000000, 1500000, 6000, "salvage_gate_04"),
  Q("salvage_gate_06", "Charogne — Carte blanche", "Élimine n'importe quels NPC en masse.", [K("all_npcs", "*", 300, "Éliminer des NPC")], 4000000, 2000000, 8000, "salvage_gate_05"),
  Q("salvage_gate_07", "Baptême Alpha", "Termine une première Galaxy Gate Alpha.", [G("alpha")], 1500000, 525000, 1500, "gate_alpha"),
  Q("salvage_gate_08", "Baptême Beta", "Termine une première Galaxy Gate Beta.", [G("beta")], 2000000, 700000, 2000, "salvage_gate_07"),
  Q("salvage_gate_09", "Baptême Gamma", "Termine une première Galaxy Gate Gamma.", [G("gamma")], 3000000, 1050000, 3000, "salvage_gate_08"),
  Q("salvage_gate_10", "Trinité en boucle", "Répète la trinité Alpha, Beta et Gamma.", [G("alpha", 2), G("beta", 2), G("gamma", 1)], 10000000, 3500000, 10000, "salvage_gate_09"),
  Q("salvage_gate_11", "Feu et cristal", "Combine Gates et chasse au cristal.", [G("alpha"), K("kristallin", "npc_Kristallin", 150, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 25, "Éliminer des Kristallons")], 8000000, 4000000, 16000, "salvage_gate_10"),
  Q("salvage_gate_12", "Rafle finale", "Termine les opérations mixtes.", [K("all_npcs", "*", 1000, "Éliminer des NPC"), C("bonus", "Bonus_Box", 100, "Collecter des Bonus Boxes"), C("cargo", "Cargo_Box", 100, "Collecter des Cargo Boxes")], 12000000, 6000000, 24000, "salvage_gate_11"),
];

const ANCIENT_CURSED_EXTENSION = [
  Q("ancient_cursed_01", "Anciens — Bêtes volatiles", "Ouvre l'extension anciens et maudits.", [K("styxus", "npc_Styxus", 5, "Éliminer des Styxus"), K("charopos", "npc_Charopos", 5, "Éliminer des Charopos"), K("lanatum", "npc_Lanatum", 10, "Éliminer des Lanatums")], 15000000, 7500000, 30000, "ancient_trio"),
  Q("ancient_cursed_02", "Braises à éteindre", "Affronte les braises de 1-9.", [K("magma", "npc_Magma_Stalker", 80, "Éliminer des Magma Stalkers"), K("pyrospire", "npc_Pyrospire", 3, "Éliminer des Pyrospires"), V("1-9")], 18000000, 9000000, 36000, "ancient_cursed_01"),
  Q("ancient_cursed_03", "4-1 — Zone de mort", "Nettoie la zone explosive 4-1.", [K("explosif", "npc_Explosif", 40, "Éliminer des Kamikazes"), V("4-1")], 12000000, 6000000, 24000, "ancient_cursed_02"),
  Q("ancient_cursed_04", "Siège du premier cœur", "Frappe les dispositifs Cubikon.", [K("cubikon", "npc_Cubikon", 5, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits")], 15000000, 7500000, 30000, "cubikon_siege"),
  Q("ancient_cursed_05", "Cœur lourd", "Mène une lourde campagne Cubikon.", [K("cubikon", "npc_Cubikon", 20, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 400, "Éliminer des Protegits")], 60000000, 30000000, 120000, "ancient_cursed_04"),
  Q("ancient_cursed_06", "Au-delà du voile", "Survis au secteur maudit et récolte l'astral.", [V("MAUDITE"), K("protegit", "npc_Protegit", 50, "Éliminer des Protegits", "MAUDITE"), C("astral", "Astral_Prime_Box", 25, "Collecter des Astral Prime Boxes", "MAUDITE")], 30000000, 30000000, 150000, "cursed_first_contact"),
  Q("ancient_cursed_07", "Le suzerain tombe", "Neutralise la souche virale et ses overlords.", [K("viral_kristallon", "npc_Viral_Kristallon", 40, "Éliminer des Viral Kristallons"), K("viral_gyger", "npc_Viral_Gygerthrall", 60, "Éliminer des Viral Gygerthralls"), K("overlord", "npc_Gygerim_Overlord", 3, "Éliminer des Gygerim Overlords")], 35000000, 17500000, 70000, "viral_outbreak"),
  Q("ancient_cursed_08", "L’épreuve finale", "Termine l'extension par une épreuve complète.", [K("styxus", "npc_Styxus", 10, "Éliminer des Styxus"), K("charopos", "npc_Charopos", 10, "Éliminer des Charopos"), K("lanatum", "npc_Lanatum", 25, "Éliminer des Lanatums"), K("cubikon", "npc_Cubikon", 10, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 250, "Éliminer des Protegits")], 80000000, 40000000, 160000, "ancient_cursed_07"),
];

// ---------------------------------------------------------------------------
// Contrats d'extermination : une quête "tuer 1000" par NPC de map uniquement
// (pas de NPC de GG, ni de Low, ni de Maudite, ni de QZ).
// Récompense = 1000 x gain d'un seul NPC x 1.5 (NPC_REWARDS).
// ---------------------------------------------------------------------------
const EXTERMINATION_1000_DATA = [
  ["exterm1000_streuner", "Streuner", "npc_Streuner"],
  ["exterm1000_boss_streuner", "Boss Streuner", "npc_Boss_Streuner"],
  ["exterm1000_uber_streuner", "Uber Streuner", "npc_Uber_Streuner"],
  ["exterm1000_lordakia", "Lordakia", "npc_Lordakia"],
  ["exterm1000_boss_lordakia", "Boss Lordakia", "npc_Boss_Lordakia"],
  ["exterm1000_uber_lordakia", "Uber Lordakia", "npc_Uber_Lordakia"],
  ["exterm1000_saimon", "Saimon", "npc_Saimon"],
  ["exterm1000_boss_saimon", "Boss Saimon", "npc_Boss_Saimon"],
  ["exterm1000_uber_saimon", "Uber Saimon", "npc_Uber_Saimon"],
  ["exterm1000_mordon", "Mordon", "npc_Mordon"],
  ["exterm1000_boss_mordon", "Boss Mordon", "npc_Boss_Mordon"],
  ["exterm1000_uber_mordon", "Uber Mordon", "npc_Uber_Mordon"],
  ["exterm1000_sibelon", "Sibelon", "npc_Sibelon"],
  ["exterm1000_boss_sibelon", "Boss Sibelon", "npc_Boss_Sibelon"],
  ["exterm1000_uber_sibelon", "Uber Sibelon", "npc_Uber_Sibelon"],
  ["exterm1000_devolarium", "Devolarium", "npc_Devolarium"],
  ["exterm1000_boss_devolarium", "Boss Devolarium", "npc_Boss_Devolarium"],
  ["exterm1000_uber_devolarium", "Uber Devolarium", "npc_Uber_Devolarium"],
  ["exterm1000_sibelonit", "Sibelonit", "npc_Sibelonit"],
  ["exterm1000_boss_sibelonit", "Boss Sibelonit", "npc_Boss_Sibelonit"],
  ["exterm1000_uber_sibelonit", "Uber Sibelonit", "npc_Uber_Sibelonit"],
  ["exterm1000_lordakium", "Lordakium", "npc_Lordakium"],
  ["exterm1000_boss_lordakium", "Boss Lordakium", "npc_Boss_Lordakium"],
  ["exterm1000_uber_lordakium", "Uber Lordakium", "npc_Uber_Lordakium"],
  ["exterm1000_kristallin", "Kristallin", "npc_Kristallin"],
  ["exterm1000_boss_kristallin", "Boss Kristallin", "npc_Boss_Kristallin"],
  ["exterm1000_uber_kristallin", "Uber Kristallin", "npc_Uber_Kristallin"],
  ["exterm1000_kristallon", "Kristallon", "npc_Kristallon"],
  ["exterm1000_boss_kristallon", "Boss Kristallon", "npc_Boss_Kristallon"],
  ["exterm1000_uber_kristallon", "Uber Kristallon", "npc_Uber_Kristallon"],
  ["exterm1000_streuner8", "StreuneR8", "npc_StreuneR8"],
  ["exterm1000_boss_streuner8", "Boss StreuneR8", "npc_Boss_StreuneR8"],
  ["exterm1000_uber_streuner8", "Uber StreuneR8", "npc_Uber_StreuneR8"],
  ["exterm1000_blighted_kristallin", "Blighted Kristallin", "npc_Blighted_Kristallin"],
  ["exterm1000_blighted_kristallon", "Blighted Kristallon", "npc_Blighted_Kristallon"],
  ["exterm1000_blighted_gygerthrall", "Blighted Gygerthrall", "npc_Blighted_Gygerthrall"],
  ["exterm1000_streuner_recruit", "Streuner Recruit", "npc_Streuner_Recruit"],
  ["exterm1000_streuner_aider", "Streuner Aider", "npc_Streuner_Aider"],
  ["exterm1000_boss_streuner_recruit", "Boss Streuner Recruit", "npc_Boss_Streuner_Recruit"],
  ["exterm1000_protegit", "Protegit", "npc_Protegit"],
  ["exterm1000_cubikon", "Cubikon", "npc_Cubikon"],
  ["exterm1000_emperor_sibelon", "Emperor Sibelon", "npc_Emperor_Sibelon"],
  ["exterm1000_emperor_lordakium", "Emperor Lordakium", "npc_Emperor_Lordakium"],
  ["exterm1000_emperor_kristallon", "Emperor Kristallon", "npc_Emperor_Kristallon"],
  ["exterm1000_interceptor", "Interceptor", "npc_Interceptor"],
  ["exterm1000_barracuda", "Barracuda", "npc_Barracuda"],
  ["exterm1000_saboteur", "Saboteur", "npc_Saboteur"],
  ["exterm1000_annihilator", "Annihilator", "npc_Annihilator"],
  ["exterm1000_uber_interceptor", "Uber Interceptor", "npc_Uber_Interceptor"],
  ["exterm1000_uber_barracuda", "Uber Barracuda", "npc_Uber_Barracuda"],
  ["exterm1000_uber_saboteur", "Uber Saboteur", "npc_Uber_Saboteur"],
  ["exterm1000_uber_annihilator", "Uber Annihilator", "npc_Uber_Annihilator"],
  ["exterm1000_styxus", "Styxus", "npc_Styxus"],
  ["exterm1000_charopos", "Charopos", "npc_Charopos"],
  ["exterm1000_lanatum", "Lanatum", "npc_Lanatum"],
  ["exterm1000_explosif", "Kamikaze", "npc_Explosif"],
  ["exterm1000_magma_stalker", "Magma Stalker", "npc_Magma_Stalker"],
  ["exterm1000_pyrospire", "Pyrospire", "npc_Pyrospire"],
];
const EXTERMINATION_1000 = EXTERMINATION_1000_DATA.map(([id, name, type]) =>
  KQ(id, `Anéantissement : 1000 ${name}`, `Contrat d'extermination : détruis 1000 ${name}.`, [K("kill", type, 1000, `Éliminer 1000 ${name}`)])
);

// Inspiré des familles de missions DarkOrbit, mais limité aux contenus jouables
// du projet et rédigé avec des titres/descriptions originaux.
const QUEST_CATALOG = [
  AQ("cadet_contact", "Baptême du vide", "Nettoie la route de départ et récupère les ressources abandonnées.", [K("streuner", "npc_Streuner", 5, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 3, "Collecter des Bonus Boxes")], 300000, 150000, 600, { x2: 500 }),
  Q("cadet_lordakia", "Chiens de garde", "Écarte les éclaireurs qui menacent les voies commerciales.", [K("lordakia", "npc_Lordakia", 10, "Éliminer des Lordakias"), C("cargo", "Cargo_Box", 5, "Récupérer des Cargo Boxes")], 500000, 250000, 1000, "cadet_contact"),
  AQ("cadet_saimon", "Chasse aux ombres", "Intercepte les Saimons et sécurise les balises.", [K("saimon", "npc_Saimon", 12, "Éliminer des Saimons"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], 900000, 450000, 1800, { x2: 1000 }, "cadet_lordakia"),
  Q("cadet_mordon", "Briser la ligne", "Brise la première ligne lourde des envahisseurs.", [K("mordon", "npc_Mordon", 10, "Éliminer des Mordons"), K("saimon", "npc_Saimon", 15, "Éliminer des Saimons")], 1500000, 750000, 3000, "cadet_saimon"),
  AQ("cadet_devolarium", "Épreuve du blindé", "Affronte une cible blindée et rapporte ses cargaisons.", [K("devolarium", "npc_Devolarium", 6, "Éliminer des Devolariums"), C("cargo", "Cargo_Box", 8, "Récupérer des Cargo Boxes")], 2500000, 1250000, 5000, { x3: 500 }, "cadet_mordon"),
  Q("low_mix", "Purge orbitale", "Réduis plusieurs populations hostiles des secteurs bas.", [K("lordakia", "npc_Lordakia", 40, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 30, "Éliminer des Saimons"), K("mordon", "npc_Mordon", 20, "Éliminer des Mordons")], 1500000, 750000, 3000),
  Q("low_bosses", "Décapitation", "Traque les variantes Boss des espèces des secteurs bas.", [K("streuner", "npc_Boss_Streuner", 5, "Éliminer des Boss Streuners"), K("lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons")], 2000000, 1000000, 4000),
  Q("sibelon_front", "Front de sang", "Démantèle une formation Sibelon et son escorte.", [K("sibelon", "npc_Sibelon", 15, "Éliminer des Sibelons"), K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits")], 3200000, 1600000, 6400),
  Q("lordakium_pressure", "L’étau se resserre", "Repousse les unités des secteurs avancés.", [K("lordakium", "npc_Lordakium", 15, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 35, "Éliminer des Sibelonits")], 5500000, 2750000, 11000, "sibelon_front"),
  Q("ice_fragments", "Éclats de haine", "Réduis l’essaim Kristallin avant l’arrivée des unités lourdes.", [K("kristallin", "npc_Kristallin", 50, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 15, "Récupérer des Cargo Boxes")], 1500000, 750000, 3000),
  Q("kristallon_hunt", "Chasse aux cuirassés", "Neutralise les cuirassés cristallins et leur escorte.", [K("kristallon", "npc_Kristallon", 12, "Éliminer des Kristallons"), K("kristallin", "npc_Kristallin", 60, "Éliminer des Kristallins")], 9000000, 4500000, 18000, "ice_fragments"),
  Q("cubikon_siege", "Siège du cœur", "Frappe le cœur d’un dispositif Cubikon.", [K("cubikon", "npc_Cubikon", 2, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 30, "Éliminer des Protegits")], 6000000, 3000000, 12000, "kristallon_hunt"),
  Q("cubikon_campaign", "Abattre le cœur", "Mène une longue opération contre les structures Cubikon.", [K("cubikon", "npc_Cubikon", 10, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 150, "Éliminer des Protegits")], 30000000, 15000000, 60000, "cubikon_siege"),

  Q("mmo_route", "Marche MMO", "Reconnais les secteurs bas de la zone MMO.", [V("1-2"), V("1-3"), V("1-4")], 300000, 150000, 600),
  Q("eic_route", "Marche EIC", "Reconnais les secteurs bas de la zone EIC.", [V("2-2"), V("2-3"), V("2-4")], 300000, 150000, 600),
  Q("vru_route", "Marche VRU", "Reconnais les secteurs bas de la zone VRU.", [V("3-2"), V("3-3"), V("3-4")], 300000, 150000, 600),
  Q("upper_tour", "Au-delà du mur", "Traverse les trois grands secteurs supérieurs.", [V("1-8"), V("2-8"), V("3-8")], 800000, 400000, 1600),
  Q("dangerous_crossroads", "Carrefour des damnés", "Cartographie les zones les plus hostiles du centre galactique.", [V("4-4"), V("4-5"), V("5-2")], 1500000, 750000, 3000, "upper_tour"),
  Q("uber_vanguard", "Premiers damnés", "Affronte les variantes Uber légères de 4-5.", [K("streuner", "npc_Uber_Streuner", 10, "Éliminer des Uber Streuners", "4-5"), K("lordakia", "npc_Uber_Lordakia", 10, "Éliminer des Uber Lordakias", "4-5"), K("saimon", "npc_Uber_Saimon", 10, "Éliminer des Uber Saimons", "4-5")], 3500000, 1750000, 7000, "dangerous_crossroads"),
  Q("uber_heavy", "Chair lourde", "Élimine les unités Uber blindées de 4-5.", [K("mordon", "npc_Uber_Mordon", 15, "Éliminer des Uber Mordons", "4-5"), K("sibelon", "npc_Uber_Sibelon", 10, "Éliminer des Uber Sibelons", "4-5"), K("devo", "npc_Uber_Devolarium", 10, "Éliminer des Uber Devolariums", "4-5")], 6000000, 3000000, 12000, "uber_vanguard"),
  Q("uber_ice", "Âge de sang", "Survis aux prédateurs les plus dangereux de 4-5.", [K("kristallin", "npc_Uber_Kristallin", 25, "Éliminer des Uber Kristallins", "4-5"), K("kristallon", "npc_Uber_Kristallon", 10, "Éliminer des Uber Kristallons", "4-5"), K("lordakium", "npc_Uber_Lordakium", 10, "Éliminer des Uber Lordakiums", "4-5")], 10000000, 5000000, 20000, "uber_heavy"),

  Q("pirate_entry", "Enfer 5-2", "Ouvre une route et constitue une première réserve de Palladium.", [V("5-2"), K("marauder", "npc_Marauder", 15, "Éliminer des Marauders"), C("palladium", "Palladium_Ore", 50, "Collecter du Palladium", "5-2")], 3000000, 1500000, 6000),
  Q("pirate_cleanup", "Purifier par le feu", "Affronte les bandes qui contrôlent les routes de contrebande.", [K("vagrant", "npc_Vagrant", 25, "Éliminer des Vagrants"), K("outcast", "npc_Outcast", 25, "Éliminer des Outcasts"), K("corsair", "npc_Corsair", 15, "Éliminer des Corsairs")], 12000000, 6000000, 24000, "pirate_entry"),
  Q("pirate_elite", "Gibier d’élite", "Détruis les unités pirates spécialisées.", [K("interceptor", "npc_Interceptor", 40, "Éliminer des Interceptors"), K("barracuda", "npc_Barracuda", 25, "Éliminer des Barracudas"), K("saboteur", "npc_Saboteur", 20, "Éliminer des Saboteurs"), K("annihilator", "npc_Annihilator", 10, "Éliminer des Annihilators")], 18000000, 9000000, 36000, "pirate_cleanup"),
  Q("palladium_industry", "Fièvre du Palladium", "Constitue une réserve stratégique en territoire pirate.", [C("palladium", "Palladium_Ore", 500, "Collecter du Palladium", "5-2"), K("marauder", "npc_Marauder", 50, "Éliminer des Marauders")], 20000000, 10000000, 40000, "pirate_entry"),

  Q("blighted_sample", "Prélèvements interdits", "Prélève des alliages sur les créatures contaminées.", [K("kristallon", "npc_Blighted_Kristallon", 20, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 50, "Éliminer des Blighted Gygerthralls"), C("alloy", "Hybrid_Alloy_Box", 30, "Collecter des Hybrid Alloy Boxes")], 6000000, 3000000, 12000),
  Q("blighted_epidemic", "Feu de contagion", "Endigue une vague massive de contaminés.", [K("kristallon", "npc_Blighted_Kristallon", 100, "Éliminer des Blighted Kristallons"), K("kristallin", "npc_Blighted_Kristallin", 200, "Éliminer des Blighted Kristallins"), K("gyger", "npc_Blighted_Gygerthrall", 300, "Éliminer des Blighted Gygerthralls")], 80000000, 40000000, 160000, "blighted_sample"),
  Q("viral_outbreak", "Souche zéro", "Neutralise les formes virales avant leur dissémination.", [K("kristallon", "npc_Viral_Kristallon", 25, "Éliminer des Viral Kristallons"), K("gyger", "npc_Viral_Gygerthrall", 75, "Éliminer des Viral Gygerthralls"), K("overlord", "npc_Gygerim_Overlord", 3, "Éliminer des Gygerim Overlords")], 20000000, 10000000, 40000, "blighted_sample"),

  Q("gate_alpha", "Gueule Alpha", "Termine la Galaxy Gate Alpha.", [G("alpha")], 1500000, 525000, 1500),
  Q("gate_beta", "Gueule Beta", "Termine la Galaxy Gate Beta.", [G("beta")], 2250000, 800000, 2250, "gate_alpha"),
  Q("gate_gamma", "Gueule Gamma", "Termine la Galaxy Gate Gamma.", [G("gamma")], 3400000, 1200000, 3400, "gate_beta"),
  Q("gate_trinity", "Trinité de feu", "Achève les trois Gates de l’ensemble Alpha, Beta et Gamma.", [G("alpha"), G("beta"), G("gamma")], 9000000, 3150000, 9000, "gate_gamma"),
  Q("gate_veteran", "Vétéran des gouffres", "Répète les Gates jusqu’à maîtriser leurs vagues.", [G("alpha", 3), G("beta", 2), G("gamma", 2)], 22500000, 8000000, 22500, "gate_trinity"),

  Q("collector_route", "La grande rafle", "Récupère toutes les formes de cargaisons courantes.", [C("bonus", "Bonus_Box", 100, "Collecter des Bonus Boxes"), C("cargo", "Cargo_Box", 100, "Collecter des Cargo Boxes"), C("booty", "Green_Booty_Box", 10, "Collecter des Green Booty Boxes")], 5000000, 2500000, 10000),
  Q("astral_reserves", "Poussière d’étoiles", "Récupère les caches les plus rares disponibles.", [C("astral", "Astral_Prime_Box", 10, "Collecter des Astral Prime Boxes"), C("alloy", "Hybrid_Alloy_Box", 25, "Collecter des Hybrid Alloy Boxes")], 12000000, 6000000, 24000),
  Q("boss_extermination", "Têtes couronnées", "Élimine les commandants des principales espèces.", [K("mordon", "npc_Boss_Mordon", 25, "Éliminer des Boss Mordons"), K("sibelon", "npc_Boss_Sibelon", 20, "Éliminer des Boss Sibelons"), K("lordakium", "npc_Boss_Lordakium", 15, "Éliminer des Boss Lordakiums"), K("kristallon", "npc_Boss_Kristallon", 10, "Éliminer des Boss Kristallons")], 15000000, 7500000, 30000),
  Q("emperor_protocol", "Régicide", "Affronte les trois souverains extraterrestres.", [K("sibelon", "npc_Emperor_Sibelon", 3, "Éliminer des Emperor Sibelons"), K("lordakium", "npc_Emperor_Lordakium", 3, "Éliminer des Emperor Lordakiums"), K("kristallon", "npc_Emperor_Kristallon", 3, "Éliminer des Emperor Kristallons")], 200000000, 100000000, 400000, "boss_extermination"),
  Q("extreme_streuner", "Océan de débris", "Contrat d’endurance pour les pilotes qui ne reculent jamais.", [K("streuner", "npc_Streuner", 1000, "Éliminer des Streuners"), K("boss", "npc_Boss_Streuner", 100, "Éliminer des Boss Streuners"), K("uber", "npc_Uber_Streuner", 50, "Éliminer des Uber Streuners")], 50000000, 25000000, 100000),
  Q("extreme_crystal", "Cristal et cendres", "Une campagne démesurée contre les forces cristallines.", [K("kristallin", "npc_Kristallin", 1000, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 300, "Éliminer des Kristallons"), K("boss", "npc_Boss_Kristallon", 50, "Éliminer des Boss Kristallons"), K("uber", "npc_Uber_Kristallon", 25, "Éliminer des Uber Kristallons")], 150000000, 75000000, 300000, "uber_ice"),
  Q("extreme_cube", "Briseur de mondes", "Un contrat excessif réservé aux escadrons les plus puissants.", [K("cubikon", "npc_Cubikon", 100, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 2000, "Éliminer des Protegits")], 300000000, 150000000, 600000, "cubikon_campaign"),
  Q("galactic_legend", "Légende vivante", "Traverse la galaxie, écrase ses menaces et domine les Gates.", [V("4-5"), V("5-2"), K("cubikon", "npc_Cubikon", 50, "Détruire des Cubikons"), K("uber", "npc_Uber_Kristallon", 50, "Éliminer des Uber Kristallons", "4-5"), G("alpha", 5), G("beta", 5), G("gamma", 5)], 50000000, 25000000, 100000, "gate_veteran"),
  ...GENERATED_HUNTS,
  ...GENERATED_ELITE_HUNTS,
  ...GENERATED_ROUTES,
  ...GENERATED_COLLECTIONS,
  ...GENERATED_GATE_CONTRACTS,
  ...PIRATE_CAMPAIGNS,
  ...SPECIAL_CAMPAIGNS,
  ...PERMANENT_ELITE_CONTRACTS,
  ...HUNDRED_MISSION_CHAIN,
  ...AMMO_CONTRACTS,
  ...GALAXY_ENERGY_CONTRACTS,
  ...CURSED_MAP_CONTRACTS,
  ...SUPPLY_CONTRACTS,
  ...LEGENDARY_KILL_CONTRACTS,
  ...FIRME_PATROLS,
  ...UBER_45_CAMPAIGN,
  ...CRYSTAL_R8_EXPEDITION,
  ...PIRATE_52_OPERATIONS,
  ...SALVAGE_GATE_OPERATIONS,
  ...ANCIENT_CURSED_EXTENSION,
  ...EXTERMINATION_1000,
];

const FINAL_QUEST = {
  ...CEQ("ultimate_all_missions", "La dernière marche", "Après avoir accompli toutes les missions du jeu, élimine simplement un Streuner.", [K("last_streuner", "npc_Streuner", 1, "Éliminer un Streuner")], 10000000000, 10000000000, 60000000, { x4: 500000, x6: 50000, sab: 250000 }, 500),
  requiresAll: QUEST_CATALOG.map(quest => quest.id),
};

export const QUEST_DEFINITIONS = Object.freeze([...QUEST_CATALOG, FINAL_QUEST]);

export function getQuestRewardValue(quest) {
  const ammoValues = { x2: 50, x3: 150, x4: 500, x6: 1500, sab: 250 };
  const ammoValue = Object.entries(quest?.reward?.ammo || {}).reduce((total, [type, amount]) => total + Math.max(0, Number(amount) || 0) * (ammoValues[type] || 0), 0);
  return Math.max(0, Number(quest?.reward?.credits) || 0)
    + Math.max(0, Number(quest?.reward?.exp) || 0)
    + Math.max(0, Number(quest?.reward?.honor) || 0) * 100
    + ammoValue
    + Math.max(0, Number(quest?.reward?.galaxyEnergy) || 0) * 100000;
}

// Classe le terminal par progression tout en gardant chaque chaîne réunie.
// Les nouvelles missions sont donc rangées automatiquement selon leur charge.
export function getOrderedQuestDefinitions() {
  const byParent = new Map();
  for (const quest of QUEST_DEFINITIONS) {
    if (!quest.requires) continue;
    if (!byParent.has(quest.requires)) byParent.set(quest.requires, []);
    byParent.get(quest.requires).push(quest);
  }
  const compare = (a, b) => getQuestRewardValue(a) - getQuestRewardValue(b) || a.title.localeCompare(b.title, "fr");
  for (const children of byParent.values()) children.sort(compare);

  const ordered = [];
  const visited = new Set();
  const appendChain = quest => {
    if (!quest || visited.has(quest.id) || quest.requiresAll) return;
    visited.add(quest.id);
    ordered.push(quest);
    for (const child of byParent.get(quest.id) || []) appendChain(child);
  };

  QUEST_DEFINITIONS.filter(quest => !quest.requires && !quest.requiresAll).sort(compare).forEach(appendChain);
  QUEST_DEFINITIONS.filter(quest => !visited.has(quest.id) && !quest.requiresAll).sort(compare).forEach(appendChain);
  QUEST_DEFINITIONS.filter(quest => quest.requiresAll).forEach(quest => ordered.push(quest));
  return ordered;
}

export function getQuestObjectives(quest) {
  const source = Array.isArray(quest?.objectives) && quest.objectives.length ? quest.objectives : quest?.target ? [quest.target] : [];
  return source.map((objective, index) => ({ ...objective, id: String(objective.id || `objective_${index + 1}`), kind: objective.kind || "kill", amount: Math.max(1, Math.floor(Number(objective.amount) || 1)) }));
}
export function isQuestComplete(state, quest) { const progress = state?.active?.[quest?.id]; return !!quest && progress != null && getQuestObjectives(quest).every(o => Number(progress[o.id] || 0) >= o.amount); }
export function normalizeQuestState(raw) {
  const active = {};
  for (const quest of QUEST_DEFINITIONS) {
    if (Object.keys(active).length >= MAX_ACTIVE_QUESTS) break;
    const saved = raw?.active?.[quest.id]; if (saved == null) continue;
    active[quest.id] = Object.fromEntries(getQuestObjectives(quest).map((o, i) => [o.id, Math.max(0, Math.min(o.amount, Math.floor(Number(typeof saved === "number" ? (i ? 0 : saved) : saved?.[o.id]) || 0)))]));
  }
  const valid = new Set(QUEST_DEFINITIONS.map(q => q.id));
  return { active, completed: [...new Set(Array.isArray(raw?.completed) ? raw.completed : [])].filter(id => valid.has(id)) };
}
export function getQuestPrerequisiteIds(quest) {
  return [...new Set([...(quest?.requires ? [quest.requires] : []), ...(Array.isArray(quest?.requiresAll) ? quest.requiresAll : [])])];
}
export function canAcceptQuest(state, quest) { return !!quest && !state.completed.includes(quest.id) && state.active[quest.id] == null && Object.keys(state.active).length < MAX_ACTIVE_QUESTS && getQuestPrerequisiteIds(quest).every(id => state.completed.includes(id)); }
export function acceptQuest(state, questId) { const quest = QUEST_DEFINITIONS.find(q => q.id === questId); if (!canAcceptQuest(state, quest)) return false; state.active[quest.id] = Object.fromEntries(getQuestObjectives(quest).map(o => [o.id, 0])); return true; }
export function recordQuestProgress(state, kind, type, amount = 1, context = {}) {
  const advanced = [];
  const sameId = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  for (const quest of QUEST_DEFINITIONS) {
    if (state.active[quest.id] == null) continue;
    let changed = false;
    for (const o of getQuestObjectives(quest)) {
      if (o.kind !== kind) continue;
      // Les ids de map ("MAUDITE" vs "maudite", "1-1", "4-4"...) sont comparés
      // sans tenir compte de la casse : le moteur envoie parfois en minuscules.
      const typeMatches = kind === "visit" || kind === "gate"
        ? sameId(o.type, type)
        : (o.type === type || (kind === "kill" && o.type === "*"));
      if (!typeMatches) continue;
      if (o.map && !sameId(o.map, context.map)) continue;
      const before = Number(state.active[quest.id][o.id] || 0);
      state.active[quest.id][o.id] = Math.min(o.amount, before + Math.max(0, Number(amount) || 0));
      changed ||= before !== state.active[quest.id][o.id];
    }
    if (changed) advanced.push(quest.id);
  }
  return advanced;
}
export const recordQuestKill = (state, type, context) => recordQuestProgress(state, "kill", type, 1, context);
export const recordQuestCollect = (state, type, context) => recordQuestProgress(state, "collect", type, 1, context);
export const recordQuestVisit = (state, map) => recordQuestProgress(state, "visit", map, 1, { map });
export const recordQuestGate = (state, gateId) => recordQuestProgress(state, "gate", gateId);
export function abandonQuest(state, questId) { if (state.active[questId] == null) return false; delete state.active[questId]; return true; }
export function claimQuest(state, questId) { const quest = QUEST_DEFINITIONS.find(q => q.id === questId); if (!quest || state.completed.includes(questId) || !isQuestComplete(state, quest)) return null; delete state.active[questId]; state.completed.push(questId); return { ...quest.reward }; }
