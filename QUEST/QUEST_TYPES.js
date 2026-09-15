"use strict";

import { NPC_REWARDS } from "../NPC/NPC_BALANCE.js";

export const MAX_ACTIVE_QUESTS = 5;
const K = (id, type, amount, label, map) => ({ id, kind: "kill", type, amount, label, ...(map ? { map } : {}) });
const C = (id, type, amount, label, map) => ({ id, kind: "collect", type, amount, label, ...(map ? { map } : {}) });
const V = map => ({ id: `visit_${map}`, kind: "visit", type: map, amount: 1, label: `Visiter la carte ${map}` });
const G = (type, amount = 1) => ({ id: `gate_${type}`, kind: "gate", type, amount, label: `Terminer la Galaxy Gate ${type[0].toUpperCase()}${type.slice(1)}` });
const Q = (id, title, description, objectives, credits, exp, honor, requires) => ({ id, title, description, objectives, reward: { credits, exp, honor }, ...(requires ? { requires } : {}) });
const AQ = (id, title, description, objectives, credits, exp, honor, ammo, requires) => ({ ...Q(id, title, description, objectives, credits, exp, honor, requires), reward: { credits, exp, honor, ammo } });
const EQ = (id, title, description, objectives, credits, exp, honor, galaxyEnergy, requires) => ({ ...Q(id, title, description, objectives, credits, exp, honor, requires), reward: { credits, exp, honor, galaxyEnergy } });
const CEQ = (id, title, description, objectives, credits, exp, honor, ammo, galaxyEnergy, requires) => ({ ...Q(id, title, description, objectives, credits, exp, honor, requires), reward: { credits, exp, honor, ammo, galaxyEnergy } });

const HUNT_FAMILIES = [
  ["streuner", "Streuner", "npc_Streuner", 12, 40000], ["lordakia", "Lordakia", "npc_Lordakia", 15, 60000],
  ["saimon", "Saimon", "npc_Saimon", 18, 85000], ["mordon", "Mordon", "npc_Mordon", 15, 120000],
  ["devolarium", "Devolarium", "npc_Devolarium", 8, 180000], ["sibelonit", "Sibelonit", "npc_Sibelonit", 20, 160000],
  ["sibelon", "Sibelon", "npc_Sibelon", 10, 240000], ["lordakium", "Lordakium", "npc_Lordakium", 8, 320000],
  ["kristallin", "Kristallin", "npc_Kristallin", 25, 220000], ["kristallon", "Kristallon", "npc_Kristallon", 6, 450000],
  ["protegit", "Protegit", "npc_Protegit", 30, 300000], ["marauder", "Marauder", "npc_Marauder", 15, 280000],
  ["interceptor", "Interceptor", "npc_Interceptor", 15, 350000], ["barracuda", "Barracuda", "npc_Barracuda", 10, 450000],
  ["saboteur", "Saboteur", "npc_Saboteur", 8, 550000], ["annihilator", "Annihilator", "npc_Annihilator", 5, 700000],
];
const HUNT_TIERS = [
  ["easy", "Patrouille", 1, 1, "Facile"],
  ["medium", "Opération", 4, 5, "Moyenne"],
  ["hard", "Extermination", 12, 18, "Difficile"],
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
  { ...Q(`elite_${id}_1`, `Lieutenants ${name}`, `Première étape de la série élite ${name}.`, [K("boss", bossType, 3, `Éliminer des Boss ${name}s`)], credits, credits / 2, credits * 0.002), difficulty: "Facile" },
  { ...Q(`elite_${id}_2`, `Offensive ${name}`, `Deuxième étape de la série élite ${name}.`, [K("boss", bossType, 15, `Éliminer des Boss ${name}s`), K("uber", uberType, 5, `Éliminer des Uber ${name}s`)], credits * 5, credits * 2.5, credits * 0.01, `elite_${id}_1`), difficulty: "Moyenne" },
  { ...Q(`elite_${id}_3`, `Domination ${name}`, `Dernière étape de la série élite ${name}.`, [K("boss", bossType, 50, `Éliminer des Boss ${name}s`), K("uber", uberType, 25, `Éliminer des Uber ${name}s`)], credits * 18, credits * 9, credits * 0.036, `elite_${id}_2`), difficulty: "Difficile" },
]);

const GENERATED_ROUTES = [
  ["route_mmo_outer", "Périphérie MMO", ["1-5", "1-6", "1-7", "1-8"], 100000],
  ["route_eic_outer", "Périphérie EIC", ["2-5", "2-6", "2-7", "2-8"], 100000],
  ["route_vru_outer", "Périphérie VRU", ["3-5", "3-6", "3-7", "3-8"], 100000],
  ["route_mmo_hidden", "Profondeurs MMO", ["1-4.1", "1-9", "1-10"], 200000, "route_mmo_outer"],
  ["route_eic_hidden", "Profondeurs EIC", ["2-4.1", "2-9", "2-10"], 200000, "route_eic_outer"],
  ["route_vru_hidden", "Profondeurs VRU", ["3-4.1", "3-9", "3-10"], 200000, "route_vru_outer"],
  ["route_homeworlds", "Tour des mondes mères", ["1-1", "2-1", "3-1"], 250000, "upper_tour"],
  ["route_warzone", "Route des zones de guerre", ["1-4.1", "2-4.1", "3-4.1", "4-4.123", "4-5"], 400000, "route_homeworlds"],
].map(([id, title, maps, credits, requires], index) => ({
  ...Q(id, title, "Traverse tous les secteurs indiqués par le contrôleur de mission.", maps.map(V), credits, Math.floor(credits * 0.5), Math.floor(credits * 0.002), requires),
  difficulty: index < 3 ? "Facile" : index < 6 ? "Moyenne" : "Difficile",
}));

const GENERATED_COLLECTIONS = [
  ["boxes_easy", "Ramassage express", "Bonus_Box", 25, 180000, "Facile"],
  ["boxes_medium", "Réseau de ravitaillement", "Bonus_Box", 150, 1200000, "Moyenne"],
  ["boxes_hard", "Trésorier galactique", "Bonus_Box", 750, 8000000, "Difficile"],
  ["cargo_easy", "Récupération légère", "Cargo_Box", 20, 220000, "Facile"],
  ["cargo_medium", "Ferrailleur orbital", "Cargo_Box", 120, 1500000, "Moyenne"],
  ["cargo_hard", "Maître récupérateur", "Cargo_Box", 600, 10000000, "Difficile"],
  ["palladium_easy", "Première cargaison pirate", "Palladium_Ore", 30, 500000, "Facile"],
  ["palladium_medium", "Convoi de Palladium", "Palladium_Ore", 250, 5000000, "Moyenne"],
  ["palladium_hard", "Réserve stratégique pirate", "Palladium_Ore", 1500, 30000000, "Difficile"],
].map(([id, title, type, amount, credits, difficulty], index, rows) => ({
  ...Q(id, title, `Contrat de collecte de difficulté ${difficulty.toLowerCase()}.`, [C("collect", type, amount, `Collecter ${amount} ${type.replaceAll("_", " ")}`)], credits, Math.floor(credits * 0.5), Math.floor(credits * 0.002), index % 3 ? rows[index - 1][0] : null),
  difficulty,
}));

const GENERATED_GATE_CONTRACTS = [
  ["gate_alpha_repeat_5", "Marathon Alpha", "alpha", 5, 8000000, "gate_alpha"],
  ["gate_beta_repeat_5", "Marathon Beta", "beta", 5, 12000000, "gate_beta"],
  ["gate_gamma_repeat_5", "Marathon Gamma", "gamma", 5, 18000000, "gate_gamma"],
  ["gate_alpha_repeat_10", "Domination Alpha", "alpha", 10, 20000000, "gate_alpha_repeat_5"],
  ["gate_beta_repeat_10", "Domination Beta", "beta", 10, 30000000, "gate_beta_repeat_5"],
  ["gate_gamma_repeat_10", "Domination Gamma", "gamma", 10, 45000000, "gate_gamma_repeat_5"],
  ["gate_alpha_repeat_25", "Maîtrise Alpha", "alpha", 25, 60000000, "gate_alpha_repeat_10"],
  ["gate_beta_repeat_25", "Maîtrise Beta", "beta", 25, 90000000, "gate_beta_repeat_10"],
  ["gate_gamma_repeat_25", "Maîtrise Gamma", "gamma", 25, 135000000, "gate_gamma_repeat_10"],
  ["gate_alpha_repeat_50", "Légende Alpha", "alpha", 50, 160000000, "gate_alpha_repeat_25"],
  ["gate_beta_repeat_50", "Légende Beta", "beta", 50, 240000000, "gate_beta_repeat_25"],
  ["gate_gamma_repeat_50", "Légende Gamma", "gamma", 50, 360000000, "gate_gamma_repeat_25"],
  ["gate_alpha_repeat_100", "Centenaire Alpha", "alpha", 100, 750000000, "gate_alpha_repeat_50"],
  ["gate_beta_repeat_100", "Centenaire Beta", "beta", 100, 1000000000, "gate_beta_repeat_50"],
  ["gate_gamma_repeat_100", "Centenaire Gamma", "gamma", 100, 1500000000, "gate_gamma_repeat_50"],
].map(([id, title, type, amount, credits, requires]) => ({ ...Q(id, title, `Termine ${amount} fois la Galaxy Gate ${type}.`, [G(type, amount)], credits, Math.floor(credits * 0.35), Math.floor(credits * 0.0015), requires) }));

const PIRATE_CAMPAIGNS = [
  Q("pirate_marauder_raid", "Raid Marauder", "Réduis les patrouilles Marauder.", [K("marauder", "npc_Marauder", 100, "Éliminer des Marauders")], 2500000, 1250000, 5000, "pirate_entry"),
  Q("pirate_outlaw_mix", "Coalition hors-la-loi", "Démantèle plusieurs bandes pirates.", [K("vagrant", "npc_Vagrant", 100, "Éliminer des Vagrants"), K("outcast", "npc_Outcast", 100, "Éliminer des Outcasts"), K("convict", "npc_Convict", 75, "Éliminer des Convicts"), K("hooligan", "npc_Hooligan", 75, "Éliminer des Hooligans")], 8000000, 4000000, 16000, "pirate_cleanup"),
  Q("pirate_ravager_line", "Ligne Ravager", "Écrase l’avant-garde Ravager.", [K("ravager", "npc_Ravager", 150, "Éliminer des Ravagers"), K("corsair", "npc_Corsair", 100, "Éliminer des Corsairs")], 12000000, 6000000, 24000, "pirate_outlaw_mix"),
  Q("pirate_interceptor_500", "Essaim d’Interceptors", "Neutralise une flotte complète d’Interceptors.", [K("interceptor", "npc_Interceptor", 500, "Éliminer des Interceptors")], 25000000, 12500000, 50000, "pirate_elite"),
  Q("pirate_barracuda_300", "Morsure du Barracuda", "Chasse les Barracudas des routes pirates.", [K("barracuda", "npc_Barracuda", 300, "Éliminer des Barracudas")], 30000000, 15000000, 60000, "pirate_elite"),
  Q("pirate_saboteur_250", "Contre-sabotage", "Élimine les premières cellules Saboteur.", [K("saboteur", "npc_Saboteur", 250, "Éliminer des Saboteurs")], 35000000, 17500000, 70000, "pirate_elite"),
  Q("pirate_annihilator_100", "Directive Annihilator", "Détruis les unités lourdes Annihilator.", [K("annihilator", "npc_Annihilator", 100, "Éliminer des Annihilators")], 45000000, 22500000, 90000, "pirate_elite"),
  Q("pirate_battleray_25", "Chasse au Battleray", "Affronte les prédateurs majeurs du territoire pirate.", [K("battleray", "npc_Battleray", 25, "Éliminer des Battlerays")], 50000000, 25000000, 100000, "pirate_annihilator_100"),
  Q("pirate_falcon_10", "Le Faucon du siècle", "Fais tomber plusieurs Century Falcons.", [K("falcon", "npc_Century_Falcon", 10, "Éliminer des Century Falcons")], 60000000, 30000000, 120000, "pirate_battleray_25"),
  Q("pirate_armada", "Armada pirate", "Détruis toutes les classes principales d’une armada.", [K("interceptor", "npc_Interceptor", 1000, "Éliminer des Interceptors"), K("barracuda", "npc_Barracuda", 500, "Éliminer des Barracudas"), K("saboteur", "npc_Saboteur", 500, "Éliminer des Saboteurs"), K("annihilator", "npc_Annihilator", 250, "Éliminer des Annihilators")], 150000000, 75000000, 300000, "pirate_falcon_10"),
  Q("pirate_saboteur_2500", "Guerre de l’ombre", "Poursuis la campagne contre les Saboteurs.", [K("saboteur", "npc_Saboteur", 2500, "Éliminer des Saboteurs")], 180000000, 90000000, 360000, "pirate_saboteur_250"),
  Q("pirate_saboteur_7500", "Réseau fantôme", "Détruis l’essentiel du réseau Saboteur.", [K("saboteur", "npc_Saboteur", 7500, "Éliminer des Saboteurs")], 350000000, 175000000, 700000, "pirate_saboteur_2500"),
  Q("pirate_saboteur_17500", "Fin du sabotage", "Contrat pirate de très longue durée.", [K("saboteur", "npc_Saboteur", 17500, "Éliminer des Saboteurs")], 750000000, 375000000, 1500000),
  Q("pirate_palladium_5000", "Monopole du Palladium", "Accumule une réserve massive de Palladium.", [C("palladium", "Palladium_Ore", 5000, "Collecter du Palladium", "5-2")], 120000000, 60000000, 240000, "palladium_industry"),
];

const SPECIAL_CAMPAIGNS = [
  Q("ancient_trio", "Triade ancienne", "Affronte Styxus, Charopos et Lanatum.", [K("styxus", "npc_Styxus", 25, "Éliminer des Styxus"), K("charopos", "npc_Charopos", 25, "Éliminer des Charopos"), K("lanatum", "npc_Lanatum", 25, "Éliminer des Lanatum")], 40000000, 20000000, 80000),
];

const PERMANENT_ELITE_CONTRACTS = [
  Q("elite_cube_3500", "Moisson de Cubikons", "Contrat permanent contre les Cubikons.", [K("cubikon", "npc_Cubikon", 3500, "Détruire des Cubikons")], 750000000, 750000000, 30000000),
  Q("elite_protegit_35000", "Purge des Protegits", "Élimine une population entière de Protegits.", [K("protegit", "npc_Protegit", 35000, "Éliminer des Protegits")], 425000000, 425000000, 17500000),
  Q("elite_interceptor_65000", "Fléau des Interceptors", "Contrat permanent contre les flottes Interceptor.", [K("interceptor", "npc_Interceptor", 65000, "Éliminer des Interceptors")], 425000000, 425000000, 17500000),
  Q("elite_annihilator_10500", "Hymne d’annihilation", "Élimine les unités Annihilator à très grande échelle.", [K("annihilator", "npc_Annihilator", 10500, "Éliminer des Annihilators")], 350000000, 350000000, 20000000),
];

const AMMO_CONTRACTS = [
  AQ("ammo_x2_easy", "Réserve X2", "Premier contrat de ravitaillement laser.", [K("streuner", "npc_Streuner", 25, "Éliminer des Streuners")], 50000, 25000, 50, { x2: 1000 }),
  AQ("ammo_x2_medium", "Stock X2", "Constitue une réserve X2 plus importante.", [K("lordakia", "npc_Lordakia", 150, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 100, "Éliminer des Saimons")], 300000, 150000, 300, { x2: 5000 }, "ammo_x2_easy"),
  AQ("ammo_x2_hard", "Arsenal X2", "Contrat d’endurance pour un stock X2 durable.", [K("mordon", "npc_Mordon", 500, "Éliminer des Mordons"), K("devolarium", "npc_Devolarium", 150, "Éliminer des Devolariums")], 1500000, 750000, 1500, { x2: 20000 }, "ammo_x2_medium"),
  AQ("ammo_x3_easy", "Réserve X3", "Débloque une première cargaison X3.", [K("mordon", "npc_Mordon", 50, "Éliminer des Mordons")], 150000, 75000, 150, { x3: 1000 }),
  AQ("ammo_x3_medium", "Stock X3", "Sécurise une cargaison moyenne de X3.", [K("sibelonit", "npc_Sibelonit", 250, "Éliminer des Sibelonits"), K("sibelon", "npc_Sibelon", 75, "Éliminer des Sibelons")], 800000, 400000, 800, { x3: 5000 }, "ammo_x3_easy"),
  AQ("ammo_x3_hard", "Arsenal X3", "Constitue une réserve avancée de X3.", [K("kristallin", "npc_Kristallin", 1000, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 100, "Éliminer des Kristallons")], 4000000, 2000000, 4000, { x3: 15000 }, "ammo_x3_medium"),
  AQ("ammo_x4_easy", "Premiers UCB-100", "Gagne une petite réserve de munitions X4.", [K("kristallon", "npc_Kristallon", 10, "Éliminer des Kristallons")], 300000, 150000, 300, { x4: 500 }),
  AQ("ammo_x4_medium", "Caisse UCB-100", "Renforce ta réserve de munitions X4.", [K("boss", "npc_Boss_Kristallon", 20, "Éliminer des Boss Kristallons"), K("cubikon", "npc_Cubikon", 5, "Détruire des Cubikons")], 1500000, 750000, 1500, { x4: 2500 }, "ammo_x4_easy"),
  AQ("ammo_x4_hard", "Arsenal UCB-100", "Contrat difficile pour une réserve X4 maîtrisée.", [K("kristallon", "npc_Kristallon", 500, "Éliminer des Kristallons"), K("cubikon", "npc_Cubikon", 50, "Détruire des Cubikons")], 8000000, 4000000, 8000, { x4: 10000 }, "ammo_x4_medium"),
  AQ("ammo_sab_easy", "Cellules SAB", "Récupère une petite cargaison de SAB.", [K("sibelon", "npc_Sibelon", 25, "Éliminer des Sibelons")], 250000, 125000, 250, { sab: 500 }),
  AQ("ammo_sab_medium", "Réserve SAB", "Augmente ta réserve de munitions absorbantes.", [K("lordakium", "npc_Lordakium", 100, "Éliminer des Lordakiums"), K("sibelon", "npc_Sibelon", 150, "Éliminer des Sibelons")], 1200000, 600000, 1200, { sab: 2500 }, "ammo_sab_easy"),
  AQ("ammo_sab_hard", "Arsenal SAB", "Contrat difficile de ravitaillement SAB.", [K("boss_lordakium", "npc_Boss_Lordakium", 100, "Éliminer des Boss Lordakiums"), K("uber_sibelon", "npc_Uber_Sibelon", 50, "Éliminer des Uber Sibelons")], 6000000, 3000000, 6000, { sab: 7500 }, "ammo_sab_medium"),
];

const GALAXY_ENERGY_CONTRACTS = [
  EQ("energy_first_cells", "Cellules intergalactiques", "Récupère des ressources simples pour alimenter le générateur Galaxy Gate.", [C("bonus", "Bonus_Box", 20, "Collecter des Bonus Boxes")], 100000, 50000, 100, 5),
  EQ("energy_border_patrol", "Énergie de patrouille", "Sécurise les voies proches afin de recevoir un nouveau lot d’énergies.", [K("lordakia", "npc_Lordakia", 40, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 25, "Éliminer des Saimons")], 250000, 125000, 250, 10, "energy_first_cells"),
  EQ("energy_heavy_salvage", "Récupération lourde", "Démonte des unités blindées et récupère leurs cellules intactes.", [K("devolarium", "npc_Devolarium", 25, "Éliminer des Devolariums"), K("sibelon", "npc_Sibelon", 25, "Éliminer des Sibelons")], 750000, 375000, 750, 20, "energy_border_patrol"),
  EQ("energy_crystal_reserve", "Réserve cristalline", "Affronte les forces cristallines pour constituer une réserve durable.", [K("kristallin", "npc_Kristallin", 200, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 30, "Éliminer des Kristallons")], 2500000, 1250000, 2500, 35, "energy_heavy_salvage"),
  EQ("energy_pirate_cells", "Cellules de contrebande", "Intercepte une cargaison énergétique en territoire pirate.", [K("interceptor", "npc_Interceptor", 150, "Éliminer des Interceptors", "5-2"), C("palladium", "Palladium_Ore", 250, "Collecter du Palladium", "5-2")], 5000000, 2500000, 5000, 50, "energy_crystal_reserve"),
  EQ("energy_cube_core", "Cœurs énergétiques", "Brise les défenses Cubikon et récupère leurs noyaux les plus stables.", [K("cubikon", "npc_Cubikon", 20, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 400, "Éliminer des Protegits")], 10000000, 5000000, 10000, 75, "energy_pirate_cells"),
  EQ("energy_gate_trinity", "Circuit intergalactique", "Termine une fois chaque portail de l’ensemble Alpha, Beta et Gamma.", [G("alpha"), G("beta"), G("gamma")], 12000000, 6000000, 12000, 100, "energy_cube_core"),
  EQ("energy_ultimate_stock", "Stock du vétéran", "Prouve ton endurance dans les Gates et contre les unités d’élite.", [G("alpha", 5), G("beta", 3), G("gamma", 2), K("uber", "npc_Uber_Kristallon", 50, "Éliminer des Uber Kristallons", "4-5")], 50000000, 25000000, 50000, 250, "energy_gate_trinity"),
];

const CURSED_MAP_CONTRACTS = [
  CEQ("cursed_first_contact", "Le secteur sans nom", "Pénètre dans la carte ??? et survis au premier contact.", [V("MAUDITE"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits", "MAUDITE")], 500000000, 500000000, 2500000, { x4: 100000, x6: 10000 }, 250),
  CEQ("cursed_astral_harvest", "Moisson astrale", "Récupère les réserves rares disséminées dans le secteur ???.", [C("astral", "Astral_Prime_Box", 100, "Collecter des Astral Prime Boxes", "MAUDITE")], 1000000000, 1000000000, 5000000, { x4: 200000, x6: 20000 }, 500, "cursed_first_contact"),
  CEQ("cursed_protegit_line", "Légions maudites", "Détruis chacune des variantes de Protegit qui infestent la carte ???.", [K("protegit_1", "npc_Protegit_maudite", 150, "Éliminer des Protegits maudits", "MAUDITE"), K("protegit_2", "npc_Protegit_maudite2", 150, "Éliminer des Protegits maudits renforcés", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 150, "Éliminer des Protegits maudits suprêmes", "MAUDITE")], 3000000000, 3000000000, 15000000, { x4: 500000, x6: 50000 }, 1000, "cursed_astral_harvest"),
  CEQ("cursed_ammunition_run", "Arsenal de l’inconnu", "Résiste aux essaims de ??? pour obtenir une cargaison de combat exceptionnelle.", [K("protegit", "npc_Protegit", 500, "Éliminer des Protegits", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 250, "Éliminer des Protegits maudits suprêmes", "MAUDITE")], 5000000000, 5000000000, 25000000, { x4: 1000000, x6: 100000, sab: 500000 }, 2000, "cursed_protegit_line"),
  CEQ("cursed_cube_breakers", "Briseurs de Cubikons maudits", "Détruis les forteresses vivantes qui contrôlent le secteur ???.", [K("cubikon", "npc_Cubikon", 100, "Détruire des Cubikons", "MAUDITE"), K("cursed_cubikon", "npc_Cubikon_maudite", 25, "Détruire des Cubikons maudits", "MAUDITE")], 10000000000, 10000000000, 75000000, { x4: 2500000, x6: 250000 }, 5000, "cursed_ammunition_run"),
  CEQ("cursed_extermination", "Purge du secteur ???", "Mène une campagne complète contre toutes les forces de la carte maudite.", [K("cubikon", "npc_Cubikon", 250, "Détruire des Cubikons", "MAUDITE"), K("cursed_cubikon", "npc_Cubikon_maudite", 100, "Détruire des Cubikons maudits", "MAUDITE"), K("protegit_1", "npc_Protegit_maudite", 750, "Éliminer des Protegits maudits", "MAUDITE"), K("protegit_2", "npc_Protegit_maudite2", 750, "Éliminer des Protegits maudits renforcés", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 750, "Éliminer des Protegits maudits suprêmes", "MAUDITE")], 50000000000, 50000000000, 500000000, { x4: 10000000, x6: 1000000, sab: 5000000 }, 10000, "cursed_cube_breakers"),
  CEQ("cursed_legend", "Légende de l’inconnu", "Accomplis l’épreuve ultime du secteur ???.", [K("cursed_cubikon", "npc_Cubikon_maudite", 500, "Détruire des Cubikons maudits", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 5000, "Éliminer des Protegits maudits suprêmes", "MAUDITE"), C("astral", "Astral_Prime_Box", 1000, "Collecter des Astral Prime Boxes", "MAUDITE")], 250000000000, 250000000000, 2500000000, { x4: 50000000, x6: 5000000, sab: 25000000 }, 50000, "cursed_extermination"),
];

const LEGENDARY_KILL_CONTRACTS = [
  CEQ("legend_million_npcs", "Un million de destructions", "Élimine un million de NPC, toutes espèces et toutes cartes confondues.", [K("all_npcs", "*", 1000000, "Éliminer des NPC")], 50000000000, 50000000000, 250000000, { x4: 5000000, x6: 500000, sab: 2000000 }, 5000),
];

const SUPPLY_CONTRACTS = [
  AQ("supply_x2_starter", "Chargeurs X2", "Élimine une petite patrouille pour recevoir des munitions X2.", [K("streuner", "npc_Streuner", 10, "Éliminer des Streuners")], 25000, 10000, 25, { x2: 1000 }),
  AQ("supply_x2_patrol", "Réserve X2 intermédiaire", "Repousse les éclaireurs des secteurs bas pour compléter ta réserve X2.", [K("lordakia", "npc_Lordakia", 50, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 25, "Éliminer des Saimons")], 150000, 75000, 150, { x2: 4000 }, "supply_x2_starter"),
  AQ("supply_x2_armored", "Convoi X2", "Neutralise des unités intermédiaires et récupère leur cargaison.", [K("mordon", "npc_Mordon", 75, "Éliminer des Mordons"), K("devolarium", "npc_Devolarium", 20, "Éliminer des Devolariums")], 500000, 250000, 500, { x2: 10000 }, "supply_x2_patrol"),

  AQ("supply_x3_starter", "Chargeurs X3", "Affronte les Mordons pour recevoir une première réserve X3.", [K("mordon", "npc_Mordon", 20, "Éliminer des Mordons")], 75000, 35000, 75, { x3: 500 }),
  AQ("supply_x3_patrol", "Réserve X3 intermédiaire", "Détruis une escorte Sibelon afin de sécuriser des munitions X3.", [K("sibelonit", "npc_Sibelonit", 75, "Éliminer des Sibelonits"), K("sibelon", "npc_Sibelon", 15, "Éliminer des Sibelons")], 400000, 200000, 400, { x3: 2500 }, "supply_x3_starter"),
  AQ("supply_x3_crystal", "Convoi X3", "Récupère un ravitaillement avancé sur les forces cristallines.", [K("kristallin", "npc_Kristallin", 150, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 15, "Éliminer des Kristallons")], 1000000, 500000, 1000, { x3: 7500 }, "supply_x3_patrol"),

  AQ("supply_x4_starter", "Première caisse UCB-100", "Détruis quelques unités cristallines pour recevoir une petite quantité de X4.", [K("kristallin", "npc_Kristallin", 50, "Éliminer des Kristallins")], 150000, 75000, 150, { x4: 250 }),
  AQ("supply_x4_patrol", "Réserve UCB-100 intermédiaire", "Affronte les unités lourdes pour agrandir ta réserve X4.", [K("kristallon", "npc_Kristallon", 20, "Éliminer des Kristallons"), K("boss", "npc_Boss_Kristallin", 10, "Éliminer des Boss Kristallins")], 750000, 375000, 750, { x4: 1250 }, "supply_x4_starter"),
  AQ("supply_x4_cube", "Convoi UCB-100", "Brise une défense Cubikon pour obtenir une cargaison X4 intermédiaire.", [K("cubikon", "npc_Cubikon", 5, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits")], 2500000, 1250000, 2500, { x4: 5000 }, "supply_x4_patrol"),

  EQ("supply_energy_boxes", "Étincelles intergalactiques", "Collecte quelques Bonus Boxes pour alimenter le générateur.", [C("bonus", "Bonus_Box", 10, "Collecter des Bonus Boxes")], 25000, 10000, 25, 3),
  EQ("supply_energy_cargo", "Cellules récupérées", "Récupère des cargaisons abandonnées contenant des cellules énergétiques.", [C("cargo", "Cargo_Box", 25, "Collecter des Cargo Boxes")], 100000, 50000, 100, 8, "supply_energy_boxes"),
  EQ("supply_energy_patrol", "Patrouille énergétique", "Nettoie les secteurs intermédiaires pour recevoir un lot d’énergies.", [K("mordon", "npc_Mordon", 75, "Éliminer des Mordons"), K("sibelonit", "npc_Sibelonit", 100, "Éliminer des Sibelonits")], 500000, 250000, 500, 15, "supply_energy_cargo"),
  EQ("supply_energy_crystal", "Énergie cristalline", "Détruis des forces cristallines afin de stabiliser davantage d’énergies.", [K("kristallin", "npc_Kristallin", 200, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 25, "Éliminer des Kristallons")], 1500000, 750000, 1500, 30, "supply_energy_patrol"),
  EQ("supply_energy_cube", "Noyaux de Cubikon", "Récupère les noyaux de plusieurs Cubikons pour le générateur Galaxy Gate.", [K("cubikon", "npc_Cubikon", 10, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 200, "Éliminer des Protegits")], 4000000, 2000000, 4000, 50, "supply_energy_crystal"),
];

const HUNDRED_MISSION_CHAIN = [
  ["century_001", "Confiance éprouvée", [K("kristallon", "npc_Kristallon", 300, "Éliminer des Kristallons"), K("lordakium", "npc_Lordakium", 450, "Éliminer des Lordakiums")]],
  ["century_002", "Zone fracturée", [K("kristallin", "npc_Kristallin", 800, "Éliminer des Kristallins"), K("lordakia", "npc_Lordakia", 2000, "Éliminer des Lordakias")]],
  ["century_003", "Prédateurs aux portes", [K("boss_kristallon", "npc_Boss_Kristallon", 100, "Éliminer des Boss Kristallons"), K("boss_kristallin", "npc_Boss_Kristallin", 230, "Éliminer des Boss Kristallins"), V("2-1")]],
  ["century_004", "Temps contaminés", [V("2-2"), V("2-6"), K("blighted", "npc_Blighted_Kristallon", 460, "Éliminer des Blighted Kristallons")]],
  ["century_005", "Théorie hybride", [K("blighted", "npc_Blighted_Kristallon", 230, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 500, "Éliminer des Blighted Gygerthralls"), C("alloy", "Hybrid_Alloy_Box", 1200, "Collecter des Hybrid Alloy Boxes")]],
  ["century_006", "Influence gamma", [G("gamma"), K("kristallon", "npc_Kristallon", 300, "Éliminer des Kristallons"), V("3-7")]],
  ["century_007", "Sous notre contrôle", [K("kristallin", "npc_Kristallin", 700, "Éliminer des Kristallins"), V("4-5"), K("uber_kristallin", "npc_Uber_Kristallin", 100, "Éliminer des Uber Kristallins", "4-5")]],
  ["century_008", "Voies avancées", [K("uber_kristallin", "npc_Uber_Kristallin", 30, "Éliminer des Uber Kristallins", "4-5"), K("uber_kristallon", "npc_Uber_Kristallon", 30, "Éliminer des Uber Kristallons", "4-5"), K("uber_lordakium", "npc_Uber_Lordakium", 70, "Éliminer des Uber Lordakiums", "4-5")]],
  ["century_009", "Vol du faucon", [K("lordakia", "npc_Lordakia", 1500, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 2000, "Éliminer des Saimons"), K("mordon", "npc_Mordon", 1000, "Éliminer des Mordons")]],
  ["century_010", "Éléments pirates", [K("interceptor", "npc_Interceptor", 1200, "Éliminer des Interceptors"), K("saboteur", "npc_Saboteur", 500, "Éliminer des Saboteurs"), K("barracuda", "npc_Barracuda", 300, "Éliminer des Barracudas")]],
  ["century_011", "Rayons de bataille", [K("battleray", "npc_Battleray", 100, "Éliminer des Battlerays"), K("annihilator", "npc_Annihilator", 300, "Éliminer des Annihilators")]],
  ["century_012", "Guerre des chefs", [K("boss_sibelon", "npc_Boss_Sibelon", 200, "Éliminer des Boss Sibelons"), K("boss_lordakium", "npc_Boss_Lordakium", 150, "Éliminer des Boss Lordakiums"), K("boss_kristallon", "npc_Boss_Kristallon", 100, "Éliminer des Boss Kristallons")]],
  ["century_013", "Route supérieure", [V("1-8"), V("2-8"), V("3-8"), V("4-4.123")]],
  ["century_014", "Triple passage", [G("alpha", 2), G("beta", 2), G("gamma", 2)]],
  ["century_015", "Forteresses orbitales", [K("cubikon", "npc_Cubikon", 250, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 5000, "Éliminer des Protegits")]],
].map(([id, title, objectives], index, rows) => {
  const navigationOnly = objectives.every(objective => objective.kind === "visit");
  const firstEliteStep = id === "century_001";
  const credits = navigationOnly ? 5000000 : firstEliteStep ? 1200000000 : 800000000;
  const exp = navigationOnly ? 2500000 : firstEliteStep ? 1200000000 : 800000000;
  const honor = navigationOnly ? 10000 : firstEliteStep ? 500000 : 375000;
  return Q(id, title, "Mission élite de longue durée adaptée aux systèmes disponibles.", objectives, credits, exp, honor, index ? rows[index - 1][0] : "pirate_saboteur_17500");
});

// ---------------------------------------------------------------------------
// Extension : une centaine de missions supplémentaires, toutes complétables
// avec les spawns existants (MAPS/*/SPAWNS.js + Gates Alpha/Beta/Gamma +
// invocations onKill). Aucun filtre de carte impossible, aucun NPC inexistant.
// ---------------------------------------------------------------------------

const FIRME_PATROLS = [
  Q("firme_mmo_01", "Patrouille MMO : recrues", "Sécurise les abords de la base MMO et ramasse les bonus.", [K("streuner", "npc_Streuner", 15, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], 60000, 30000, 120),
  Q("firme_mmo_02", "Patrouille MMO : aides de camp", "Encadre les recrues et leurs accompagnateurs.", [K("recruit", "npc_Streuner_Recruit", 15, "Éliminer des Streuner Recruits"), K("aider", "npc_Streuner_Aider", 10, "Éliminer des Streuner Aiders")], 120000, 60000, 240, "firme_mmo_01"),
  Q("firme_mmo_03", "Patrouille MMO : éclaireurs", "Repousse les éclaireurs Lordakia et Saimon.", [K("lordakia", "npc_Lordakia", 25, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 20, "Éliminer des Saimons")], 200000, 100000, 400, "firme_mmo_02"),
  Q("firme_mmo_04", "Patrouille MMO : secteurs 1-2 et 1-3", "Cartographie deux secteurs MMO puis brise la ligne Mordon.", [V("1-2"), V("1-3"), K("mordon", "npc_Mordon", 15, "Éliminer des Mordons")], 300000, 150000, 600, "firme_mmo_03"),
  Q("firme_mmo_05", "Patrouille MMO : essaim Sibelonit", "Contiens l'essaim Sibelonit et son commandant.", [K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits"), K("boss_sibelonit", "npc_Boss_Sibelonit", 3, "Éliminer des Boss Sibelonits")], 500000, 250000, 1000, "firme_mmo_04"),
  Q("firme_mmo_06", "Patrouille MMO : pression Lordakium", "Repousse les Lordakiums des voies MMO.", [K("lordakium", "npc_Lordakium", 12, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 25, "Éliminer des Sibelonits")], 750000, 375000, 1500, "firme_mmo_05"),
  Q("firme_mmo_07", "Patrouille MMO : éclats de glace", "Réduis l'avant-garde Kristallin et récupère les cargaisons.", [K("kristallin", "npc_Kristallin", 40, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 10, "Récupérer des Cargo Boxes")], 1000000, 500000, 2000, "firme_mmo_06"),
  Q("firme_mmo_08", "Patrouille MMO : chefs de meute", "Traque les Boss des secteurs bas côté MMO.", [K("boss_lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("boss_saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons"), K("boss_mordon", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons")], 1400000, 700000, 2800, "firme_mmo_07"),
  Q("firme_eic_01", "Patrouille EIC : recrues", "Sécurise les abords de la base EIC et ramasse les bonus.", [K("streuner", "npc_Streuner", 15, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], 60000, 30000, 120, "cadet_contact"),
  Q("firme_eic_02", "Patrouille EIC : aides de camp", "Encadre les recrues et leurs accompagnateurs.", [K("recruit", "npc_Streuner_Recruit", 15, "Éliminer des Streuner Recruits"), K("aider", "npc_Streuner_Aider", 10, "Éliminer des Streuner Aiders")], 120000, 60000, 240, "firme_eic_01"),
  Q("firme_eic_03", "Patrouille EIC : éclaireurs", "Repousse les éclaireurs Lordakia et Saimon.", [K("lordakia", "npc_Lordakia", 25, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 20, "Éliminer des Saimons")], 200000, 100000, 400, "firme_eic_02"),
  Q("firme_eic_04", "Patrouille EIC : secteurs 2-2 et 2-3", "Cartographie deux secteurs EIC puis brise la ligne Mordon.", [V("2-2"), V("2-3"), K("mordon", "npc_Mordon", 15, "Éliminer des Mordons")], 300000, 150000, 600, "firme_eic_03"),
  Q("firme_eic_05", "Patrouille EIC : essaim Sibelonit", "Contiens l'essaim Sibelonit et son commandant.", [K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits"), K("boss_sibelonit", "npc_Boss_Sibelonit", 3, "Éliminer des Boss Sibelonits")], 500000, 250000, 1000, "firme_eic_04"),
  Q("firme_eic_06", "Patrouille EIC : pression Lordakium", "Repousse les Lordakiums des voies EIC.", [K("lordakium", "npc_Lordakium", 12, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 25, "Éliminer des Sibelonits")], 750000, 375000, 1500, "firme_eic_05"),
  Q("firme_eic_07", "Patrouille EIC : éclats de glace", "Réduis l'avant-garde Kristallin et récupère les cargaisons.", [K("kristallin", "npc_Kristallin", 40, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 10, "Récupérer des Cargo Boxes")], 1000000, 500000, 2000, "firme_eic_06"),
  Q("firme_eic_08", "Patrouille EIC : chefs de meute", "Traque les Boss des secteurs bas côté EIC.", [K("boss_lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("boss_saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons"), K("boss_mordon", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons")], 1400000, 700000, 2800, "firme_eic_07"),
  Q("firme_vru_01", "Patrouille VRU : recrues", "Sécurise les abords de la base VRU et ramasse les bonus.", [K("streuner", "npc_Streuner", 15, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], 60000, 30000, 120, "cadet_contact"),
  Q("firme_vru_02", "Patrouille VRU : aides de camp", "Encadre les recrues et leurs accompagnateurs.", [K("recruit", "npc_Streuner_Recruit", 15, "Éliminer des Streuner Recruits"), K("aider", "npc_Streuner_Aider", 10, "Éliminer des Streuner Aiders")], 120000, 60000, 240, "firme_vru_01"),
  Q("firme_vru_03", "Patrouille VRU : éclaireurs", "Repousse les éclaireurs Lordakia et Saimon.", [K("lordakia", "npc_Lordakia", 25, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 20, "Éliminer des Saimons")], 200000, 100000, 400, "firme_vru_02"),
  Q("firme_vru_04", "Patrouille VRU : secteurs 3-2 et 3-3", "Cartographie deux secteurs VRU puis brise la ligne Mordon.", [V("3-2"), V("3-3"), K("mordon", "npc_Mordon", 15, "Éliminer des Mordons")], 300000, 150000, 600, "firme_vru_03"),
  Q("firme_vru_05", "Patrouille VRU : essaim Sibelonit", "Contiens l'essaim Sibelonit et son commandant.", [K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits"), K("boss_sibelonit", "npc_Boss_Sibelonit", 3, "Éliminer des Boss Sibelonits")], 500000, 250000, 1000, "firme_vru_04"),
  Q("firme_vru_06", "Patrouille VRU : pression Lordakium", "Repousse les Lordakiums des voies VRU.", [K("lordakium", "npc_Lordakium", 12, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 25, "Éliminer des Sibelonits")], 750000, 375000, 1500, "firme_vru_05"),
  Q("firme_vru_07", "Patrouille VRU : éclats de glace", "Réduis l'avant-garde Kristallin et récupère les cargaisons.", [K("kristallin", "npc_Kristallin", 40, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 10, "Récupérer des Cargo Boxes")], 1000000, 500000, 2000, "firme_vru_06"),
  Q("firme_vru_08", "Patrouille VRU : chefs de meute", "Traque les Boss des secteurs bas côté VRU.", [K("boss_lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("boss_saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons"), K("boss_mordon", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons")], 1400000, 700000, 2800, "firme_vru_07"),
];

const UBER_45_CAMPAIGN = [
  Q("uber45_01", "4-5 : meute Streuner", "Ouvre la campagne 4-5 contre les Streuners lourds.", [K("boss", "npc_Boss_Streuner", 5, "Éliminer des Boss Streuners", "4-5"), K("uber", "npc_Uber_Streuner", 5, "Éliminer des Uber Streuners", "4-5")], 2000000, 1000000, 4000, "dangerous_crossroads"),
  Q("uber45_02", "4-5 : meute Lordakia", "Poursuis contre les Lordakias lourds de 4-5.", [K("boss", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias", "4-5"), K("uber", "npc_Uber_Lordakia", 5, "Éliminer des Uber Lordakias", "4-5")], 2200000, 1100000, 4400, "uber45_01"),
  Q("uber45_03", "4-5 : meute Saimon", "Nettoie les Saimons lourds de 4-5.", [K("boss", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons", "4-5"), K("uber", "npc_Uber_Saimon", 5, "Éliminer des Uber Saimons", "4-5")], 2400000, 1200000, 4800, "uber45_02"),
  Q("uber45_04", "4-5 : ligne Mordon", "Brise la ligne Mordon de 4-5.", [K("boss", "npc_Boss_Mordon", 5, "Éliminer des Boss Mordons", "4-5"), K("uber", "npc_Uber_Mordon", 5, "Éliminer des Uber Mordons", "4-5")], 2600000, 1300000, 5200, "uber45_03"),
  Q("uber45_05", "4-5 : front Sibelon", "Démantèle le front Sibelon de 4-5.", [K("boss", "npc_Boss_Sibelon", 5, "Éliminer des Boss Sibelons", "4-5"), K("uber", "npc_Uber_Sibelon", 5, "Éliminer des Uber Sibelons", "4-5")], 2800000, 1400000, 5600, "uber45_04"),
  Q("uber45_06", "4-5 : blindés Devolarium", "Détruis les blindés Devolarium de 4-5.", [K("boss", "npc_Boss_Devolarium", 5, "Éliminer des Boss Devolariums", "4-5"), K("uber", "npc_Uber_Devolarium", 5, "Éliminer des Uber Devolariums", "4-5")], 3000000, 1500000, 6000, "uber45_05"),
  Q("uber45_07", "4-5 : essaim Sibelonit", "Écrase l'essaim Sibelonit de 4-5.", [K("boss", "npc_Boss_Sibelonit", 5, "Éliminer des Boss Sibelonits", "4-5"), K("uber", "npc_Uber_Sibelonit", 5, "Éliminer des Uber Sibelonits", "4-5")], 3200000, 1600000, 6400, "uber45_06"),
  Q("uber45_08", "4-5 : pression Lordakium", "Repousse les Lordakiums lourds de 4-5.", [K("boss", "npc_Boss_Lordakium", 5, "Éliminer des Boss Lordakiums", "4-5"), K("uber", "npc_Uber_Lordakium", 5, "Éliminer des Uber Lordakiums", "4-5")], 3400000, 1700000, 6800, "uber45_07"),
  Q("uber45_09", "4-5 : glace Kristallin", "Survis aux Kristallins lourds de 4-5.", [K("boss", "npc_Boss_Kristallin", 5, "Éliminer des Boss Kristallins", "4-5"), K("uber", "npc_Uber_Kristallin", 5, "Éliminer des Uber Kristallins", "4-5")], 3600000, 1800000, 7200, "uber45_08"),
  Q("uber45_10", "4-5 : cuirassés Kristallon", "Neutralise les Kristallons lourds de 4-5.", [K("boss", "npc_Boss_Kristallon", 5, "Éliminer des Boss Kristallons", "4-5"), K("uber", "npc_Uber_Kristallon", 5, "Éliminer des Uber Kristallons", "4-5")], 3800000, 1900000, 7600, "uber45_09"),
  Q("uber45_11", "4-5 : frappe StreuneR8", "Termine le premier tour 4-5 contre les StreuneR8.", [K("boss", "npc_Boss_StreuneR8", 5, "Éliminer des Boss StreuneR8", "4-5"), K("uber", "npc_Uber_StreuneR8", 5, "Éliminer des Uber StreuneR8", "4-5")], 4000000, 2000000, 8000, "uber45_10"),
  Q("uber45_12", "4-5 : revanche Streuner", "Deuxième vague contre la meute Streuner.", [K("boss", "npc_Boss_Streuner", 20, "Éliminer des Boss Streuners", "4-5"), K("uber", "npc_Uber_Streuner", 20, "Éliminer des Uber Streuners", "4-5")], 6000000, 3000000, 12000, "uber45_11"),
  Q("uber45_13", "4-5 : revanche Lordakia", "Deuxième vague contre les Lordakias lourds.", [K("boss", "npc_Boss_Lordakia", 20, "Éliminer des Boss Lordakias", "4-5"), K("uber", "npc_Uber_Lordakia", 20, "Éliminer des Uber Lordakias", "4-5")], 6500000, 3250000, 13000, "uber45_12"),
  Q("uber45_14", "4-5 : revanche Saimon", "Deuxième vague contre les Saimons lourds.", [K("boss", "npc_Boss_Saimon", 20, "Éliminer des Boss Saimons", "4-5"), K("uber", "npc_Uber_Saimon", 20, "Éliminer des Uber Saimons", "4-5")], 7000000, 3500000, 14000, "uber45_13"),
  Q("uber45_15", "4-5 : revanche Mordon", "Deuxième vague contre la ligne Mordon.", [K("boss", "npc_Boss_Mordon", 20, "Éliminer des Boss Mordons", "4-5"), K("uber", "npc_Uber_Mordon", 20, "Éliminer des Uber Mordons", "4-5")], 7500000, 3750000, 15000, "uber45_14"),
  Q("uber45_16", "4-5 : revanche Sibelon", "Deuxième vague contre le front Sibelon.", [K("boss", "npc_Boss_Sibelon", 20, "Éliminer des Boss Sibelons", "4-5"), K("uber", "npc_Uber_Sibelon", 20, "Éliminer des Uber Sibelons", "4-5")], 8000000, 4000000, 16000, "uber45_15"),
  Q("uber45_17", "4-5 : revanche Devolarium", "Deuxième vague contre les blindés Devolarium.", [K("boss", "npc_Boss_Devolarium", 20, "Éliminer des Boss Devolariums", "4-5"), K("uber", "npc_Uber_Devolarium", 20, "Éliminer des Uber Devolariums", "4-5")], 8500000, 4250000, 17000, "uber45_16"),
  Q("uber45_18", "4-5 : revanche Sibelonit", "Deuxième vague contre l'essaim Sibelonit.", [K("boss", "npc_Boss_Sibelonit", 20, "Éliminer des Boss Sibelonits", "4-5"), K("uber", "npc_Uber_Sibelonit", 20, "Éliminer des Uber Sibelonits", "4-5")], 9000000, 4500000, 18000, "uber45_17"),
  Q("uber45_19", "4-5 : revanche Lordakium", "Deuxième vague contre les Lordakiums lourds.", [K("boss", "npc_Boss_Lordakium", 20, "Éliminer des Boss Lordakiums", "4-5"), K("uber", "npc_Uber_Lordakium", 20, "Éliminer des Uber Lordakiums", "4-5")], 9500000, 4750000, 19000, "uber45_18"),
  Q("uber45_20", "4-5 : revanche cristalline", "Deuxième vague contre les forces cristallines lourdes.", [K("boss_kristallin", "npc_Boss_Kristallin", 20, "Éliminer des Boss Kristallins", "4-5"), K("uber_kristallin", "npc_Uber_Kristallin", 20, "Éliminer des Uber Kristallins", "4-5"), K("boss_kristallon", "npc_Boss_Kristallon", 15, "Éliminer des Boss Kristallons", "4-5"), K("uber_kristallon", "npc_Uber_Kristallon", 15, "Éliminer des Uber Kristallons", "4-5")], 15000000, 7500000, 30000, "uber45_19"),
  Q("uber45_21", "4-5 : verrou StreuneR8", "Verrouille la campagne StreuneR8 en 4-5.", [K("boss", "npc_Boss_StreuneR8", 20, "Éliminer des Boss StreuneR8", "4-5"), K("uber", "npc_Uber_StreuneR8", 20, "Éliminer des Uber StreuneR8", "4-5")], 12000000, 6000000, 24000, "uber45_20"),
  Q("uber45_22", "4-5 : domination totale", "Domine toutes les lignées lourdes de 4-5.", [K("boss_mordon", "npc_Boss_Mordon", 30, "Éliminer des Boss Mordons", "4-5"), K("boss_sibelon", "npc_Boss_Sibelon", 25, "Éliminer des Boss Sibelons", "4-5"), K("boss_lordakium", "npc_Boss_Lordakium", 20, "Éliminer des Boss Lordakiums", "4-5"), K("boss_kristallon", "npc_Boss_Kristallon", 15, "Éliminer des Boss Kristallons", "4-5")], 30000000, 15000000, 60000, "uber45_21"),
];

const CRYSTAL_R8_EXPEDITION = [
  Q("crystal_r8_01", "Glace : premiers éclats", "Ouvre l'expédition cristalline.", [K("kristallin", "npc_Kristallin", 60, "Éliminer des Kristallins"), K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits")], 1000000, 500000, 2000, "ice_fragments"),
  Q("crystal_r8_02", "Glace : cuirassés", "Affronte les premiers Kristallons.", [K("kristallon", "npc_Kristallon", 15, "Éliminer des Kristallons"), K("kristallin", "npc_Kristallin", 60, "Éliminer des Kristallins")], 1500000, 750000, 3000, "crystal_r8_01"),
  Q("crystal_r8_03", "Glace : commandants", "Traque les Boss cristallins.", [K("boss_kristallin", "npc_Boss_Kristallin", 8, "Éliminer des Boss Kristallins"), K("boss_kristallon", "npc_Boss_Kristallon", 5, "Éliminer des Boss Kristallons")], 2200000, 1100000, 4400, "crystal_r8_02"),
  Q("crystal_r8_04", "Glace : souverains", "Défie les Empereurs cristallins et Lordakium.", [K("emperor_kristallon", "npc_Emperor_Kristallon", 2, "Éliminer des Emperor Kristallons"), K("emperor_lordakium", "npc_Emperor_Lordakium", 2, "Éliminer des Emperor Lordakiums")], 4000000, 2000000, 8000, "crystal_r8_03"),
  Q("crystal_r8_05", "Zone 1-8 : nuée R8", "Nettoie la nuée StreuneR8.", [K("r8", "npc_StreuneR8", 60, "Éliminer des StreuneR8"), K("boss_r8", "npc_Boss_StreuneR8", 10, "Éliminer des Boss StreuneR8")], 3500000, 1750000, 7000, "crystal_r8_04"),
  Q("crystal_r8_06", "Zone 1-8 : essaim renforcé", "Poursuis la campagne R8.", [K("r8", "npc_StreuneR8", 150, "Éliminer des StreuneR8"), K("boss_r8", "npc_Boss_StreuneR8", 25, "Éliminer des Boss StreuneR8")], 7000000, 3500000, 14000, "crystal_r8_05"),
  Q("crystal_r8_07", "Contamination : premiers foyers", "Endigue les Blighted Kristallins et Kristallons.", [K("blighted_kristallin", "npc_Blighted_Kristallin", 60, "Éliminer des Blighted Kristallins"), K("blighted_kristallon", "npc_Blighted_Kristallon", 30, "Éliminer des Blighted Kristallons")], 5000000, 2500000, 10000, "crystal_r8_06"),
  Q("crystal_r8_08", "Contamination : essaim Gygerthrall", "Provoque l'apparition des Gygerthralls en détruisant des Blighted.", [K("blighted_kristallon", "npc_Blighted_Kristallon", 60, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 60, "Éliminer des Blighted Gygerthralls")], 8000000, 4000000, 16000, "crystal_r8_07"),
  Q("crystal_r8_09", "Contamination : vague massive", "Affronte une vague massive de contaminés.", [K("blighted_kristallin", "npc_Blighted_Kristallin", 200, "Éliminer des Blighted Kristallins"), K("blighted_kristallon", "npc_Blighted_Kristallon", 120, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 120, "Éliminer des Blighted Gygerthralls")], 14000000, 7000000, 28000, "crystal_r8_08"),
  Q("crystal_r8_10", "Souverains : triade impériale", "Affronte les trois Empereurs.", [K("sibelon", "npc_Emperor_Sibelon", 3, "Éliminer des Emperor Sibelons"), K("lordakium", "npc_Emperor_Lordakium", 3, "Éliminer des Emperor Lordakiums"), K("kristallon", "npc_Emperor_Kristallon", 3, "Éliminer des Emperor Kristallons")], 12000000, 6000000, 24000, "crystal_r8_09"),
  Q("crystal_r8_11", "Uber : avant-garde de glace", "Traque les Ubers cristallins de 4-5.", [K("uber_kristallin", "npc_Uber_Kristallin", 15, "Éliminer des Uber Kristallins", "4-5"), K("uber_kristallon", "npc_Uber_Kristallon", 10, "Éliminer des Uber Kristallons", "4-5")], 9000000, 4500000, 18000, "crystal_r8_10"),
  Q("crystal_r8_12", "Uber : ligne lourde R8", "Verrouille la lignée R8 en 4-5.", [K("boss_r8", "npc_Boss_StreuneR8", 10, "Éliminer des Boss StreuneR8", "4-5"), K("uber_r8", "npc_Uber_StreuneR8", 10, "Éliminer des Uber StreuneR8", "4-5")], 9000000, 4500000, 18000, "crystal_r8_11"),
  Q("crystal_r8_13", "Alliages : première récolte", "Récupère des alliages hybrides sur les contaminés.", [K("blighted_kristallon", "npc_Blighted_Kristallon", 40, "Éliminer des Blighted Kristallons"), C("alloy", "Hybrid_Alloy_Box", 40, "Collecter des Hybrid Alloy Boxes")], 7000000, 3500000, 14000, "crystal_r8_12"),
  Q("crystal_r8_14", "Alliages : stock stratégique", "Constitue un stock d'alliages.", [K("gyger", "npc_Blighted_Gygerthrall", 100, "Éliminer des Blighted Gygerthralls"), C("alloy", "Hybrid_Alloy_Box", 100, "Collecter des Hybrid Alloy Boxes")], 11000000, 5500000, 22000, "crystal_r8_13"),
  Q("crystal_r8_15", "Portails : route du nord", "Visite les secteurs avancés MMO, EIC et VRU.", [V("1-8"), V("2-8"), V("3-8")], 3000000, 1500000, 6000, "crystal_r8_14"),
  Q("crystal_r8_16", "Guerre de cristal : acte I", "Lance une campagne démesurée contre le cristal.", [K("kristallin", "npc_Kristallin", 300, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 80, "Éliminer des Kristallons")], 18000000, 9000000, 36000, "crystal_r8_15"),
  Q("crystal_r8_17", "Guerre de cristal : acte II", "Poursuis contre les commandants et souverains.", [K("boss_kristallin", "npc_Boss_Kristallin", 30, "Éliminer des Boss Kristallins"), K("boss_kristallon", "npc_Boss_Kristallon", 20, "Éliminer des Boss Kristallons"), K("emperor_kristallon", "npc_Emperor_Kristallon", 3, "Éliminer des Emperor Kristallons")], 25000000, 12500000, 50000, "crystal_r8_16"),
  Q("crystal_r8_18", "Guerre de cristal : acte final", "Achève l'expédition cristalline.", [K("kristallin", "npc_Kristallin", 500, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 150, "Éliminer des Kristallons"), K("blighted_kristallon", "npc_Blighted_Kristallon", 100, "Éliminer des Blighted Kristallons")], 40000000, 20000000, 80000, "crystal_r8_17"),
];

const PIRATE_52_OPERATIONS = [
  Q("pirate52_01", "5-2 : premiers Interceptors", "Ouvre les opérations pirates.", [K("interceptor", "npc_Interceptor", 30, "Éliminer des Interceptors", "5-2"), V("5-2")], 2500000, 1250000, 5000, "pirate_entry"),
  Q("pirate52_02", "5-2 : morsure Barracuda", "Chasse les Barracudas des routes pirates.", [K("barracuda", "npc_Barracuda", 20, "Éliminer des Barracudas", "5-2"), K("interceptor", "npc_Interceptor", 30, "Éliminer des Interceptors", "5-2")], 3500000, 1750000, 7000, "pirate52_01"),
  Q("pirate52_03", "5-2 : contre-sabotage léger", "Élimine les premières cellules Saboteur.", [K("saboteur", "npc_Saboteur", 15, "Éliminer des Saboteurs", "5-2"), K("barracuda", "npc_Barracuda", 20, "Éliminer des Barracudas", "5-2")], 4500000, 2250000, 9000, "pirate52_02"),
  Q("pirate52_04", "5-2 : directive Annihilator", "Détruis les unités lourdes Annihilator.", [K("annihilator", "npc_Annihilator", 10, "Éliminer des Annihilators", "5-2"), K("saboteur", "npc_Saboteur", 15, "Éliminer des Saboteurs", "5-2")], 6000000, 3000000, 12000, "pirate52_03"),
  Q("pirate52_05", "5-2 : patrouille mixte", "Démantèle une patrouille mixte.", [K("interceptor", "npc_Interceptor", 60, "Éliminer des Interceptors", "5-2"), K("barracuda", "npc_Barracuda", 30, "Éliminer des Barracudas", "5-2"), K("saboteur", "npc_Saboteur", 20, "Éliminer des Saboteurs", "5-2"), K("annihilator", "npc_Annihilator", 10, "Éliminer des Annihilators", "5-2")], 9000000, 4500000, 18000, "pirate52_04"),
  Q("pirate52_06", "5-2 : Palladium brut", "Constitue une première réserve de Palladium.", [C("palladium", "Palladium_Ore", 100, "Collecter du Palladium", "5-2"), K("interceptor", "npc_Interceptor", 30, "Éliminer des Interceptors", "5-2")], 5000000, 2500000, 10000, "pirate52_05"),
  Q("pirate52_07", "5-2 : convoi Palladium", "Sécurise un convoi de Palladium.", [C("palladium", "Palladium_Ore", 250, "Collecter du Palladium", "5-2"), K("barracuda", "npc_Barracuda", 30, "Éliminer des Barracudas", "5-2")], 8000000, 4000000, 16000, "pirate52_06"),
  Q("pirate52_08", "5-2 : Ubers pirates", "Affronte les versions Uber des pirates.", [K("uber_interceptor", "npc_Uber_Interceptor", 3, "Éliminer des Uber Interceptors", "5-2"), K("uber_barracuda", "npc_Uber_Barracuda", 3, "Éliminer des Uber Barracudas", "5-2"), K("uber_saboteur", "npc_Uber_Saboteur", 3, "Éliminer des Uber Saboteurs", "5-2"), K("uber_annihilator", "npc_Uber_Annihilator", 2, "Éliminer des Uber Annihilators", "5-2")], 15000000, 7500000, 30000, "pirate52_07"),
  Q("pirate52_09", "5-2 : essaim Interceptor", "Neutralise un essaim d'Interceptors.", [K("interceptor", "npc_Interceptor", 200, "Éliminer des Interceptors", "5-2")], 12000000, 6000000, 24000, "pirate52_08"),
  Q("pirate52_10", "5-2 : meute Barracuda", "Chasse une meute de Barracudas.", [K("barracuda", "npc_Barracuda", 120, "Éliminer des Barracudas", "5-2")], 13000000, 6500000, 26000, "pirate52_09"),
  Q("pirate52_11", "5-2 : réseau Saboteur", "Détruis le réseau Saboteur.", [K("saboteur", "npc_Saboteur", 100, "Éliminer des Saboteurs", "5-2")], 14000000, 7000000, 28000, "pirate52_10"),
  Q("pirate52_12", "5-2 : marteaux Annihilator", "Détruis les marteaux Annihilator.", [K("annihilator", "npc_Annihilator", 60, "Éliminer des Annihilators", "5-2")], 16000000, 8000000, 32000, "pirate52_11"),
  Q("pirate52_13", "5-2 : route 4-5 / 5-2", "Fais la navette entre le front 4-5 et le territoire pirate.", [V("4-5"), V("5-2"), K("interceptor", "npc_Interceptor", 50, "Éliminer des Interceptors", "5-2")], 7000000, 3500000, 14000, "pirate52_12"),
  Q("pirate52_14", "5-2 : réserve stratégique", "Accumule une réserve stratégique de Palladium.", [C("palladium", "Palladium_Ore", 750, "Collecter du Palladium", "5-2"), K("saboteur", "npc_Saboteur", 50, "Éliminer des Saboteurs", "5-2")], 18000000, 9000000, 36000, "pirate52_13"),
  Q("pirate52_15", "5-2 : armada réduite", "Détruis une armada réduite.", [K("interceptor", "npc_Interceptor", 300, "Éliminer des Interceptors", "5-2"), K("barracuda", "npc_Barracuda", 150, "Éliminer des Barracudas", "5-2"), K("saboteur", "npc_Saboteur", 100, "Éliminer des Saboteurs", "5-2"), K("annihilator", "npc_Annihilator", 50, "Éliminer des Annihilators", "5-2")], 35000000, 17500000, 70000, "pirate52_14"),
  Q("pirate52_16", "5-2 : seigneur du Palladium", "Termine les opérations pirates.", [C("palladium", "Palladium_Ore", 1500, "Collecter du Palladium", "5-2"), K("annihilator", "npc_Annihilator", 100, "Éliminer des Annihilators", "5-2"), K("uber_annihilator", "npc_Uber_Annihilator", 5, "Éliminer des Uber Annihilators", "5-2")], 50000000, 25000000, 100000, "pirate52_15"),
];

const SALVAGE_GATE_OPERATIONS = [
  Q("salvage_gate_01", "Récup : boîtes bonus", "Lance les opérations de récupération.", [C("bonus", "Bonus_Box", 30, "Collecter des Bonus Boxes"), K("streuner", "npc_Streuner", 20, "Éliminer des Streuners")], 200000, 100000, 400, "collector_route"),
  Q("salvage_gate_02", "Récup : cargaisons", "Récupère les cargaisons des NPC détruits.", [C("cargo", "Cargo_Box", 30, "Collecter des Cargo Boxes"), K("lordakia", "npc_Lordakia", 30, "Éliminer des Lordakias")], 400000, 200000, 800, "salvage_gate_01"),
  Q("salvage_gate_03", "Récup : butins verts", "Chasse les Green Booty Boxes.", [C("booty", "Green_Booty_Box", 15, "Collecter des Green Booty Boxes"), K("saimon", "npc_Saimon", 30, "Éliminer des Saimons")], 800000, 400000, 1600, "salvage_gate_02"),
  Q("salvage_gate_04", "Récup : grand ramassage", "Effectue un grand ramassage mixte.", [C("bonus", "Bonus_Box", 100, "Collecter des Bonus Boxes"), C("cargo", "Cargo_Box", 80, "Collecter des Cargo Boxes"), C("booty", "Green_Booty_Box", 10, "Collecter des Green Booty Boxes")], 2000000, 1000000, 4000, "salvage_gate_03"),
  Q("salvage_gate_05", "Récup : alliages hybrides", "Prélève des alliages sur les contaminés.", [C("alloy", "Hybrid_Alloy_Box", 30, "Collecter des Hybrid Alloy Boxes"), K("blighted_kristallon", "npc_Blighted_Kristallon", 20, "Éliminer des Blighted Kristallons")], 3000000, 1500000, 6000, "salvage_gate_04"),
  Q("salvage_gate_06", "Récup : extermination libre", "Élimine n'importe quels NPC en masse.", [K("all_npcs", "*", 300, "Éliminer des NPC")], 4000000, 2000000, 8000, "salvage_gate_05"),
  Q("salvage_gate_07", "Gate : premier Alpha", "Termine une première Galaxy Gate Alpha.", [G("alpha")], 1500000, 525000, 1500, "gate_alpha"),
  Q("salvage_gate_08", "Gate : premier Beta", "Termine une première Galaxy Gate Beta.", [G("beta")], 2000000, 700000, 2000, "salvage_gate_07"),
  Q("salvage_gate_09", "Gate : premier Gamma", "Termine une première Galaxy Gate Gamma.", [G("gamma")], 3000000, 1050000, 3000, "salvage_gate_08"),
  Q("salvage_gate_10", "Gate : trinité répétée", "Répète la trinité Alpha, Beta et Gamma.", [G("alpha", 2), G("beta", 2), G("gamma", 1)], 10000000, 3500000, 10000, "salvage_gate_09"),
  Q("salvage_gate_11", "Mixte : Gates et cristal", "Combine Gates et chasse au cristal.", [G("alpha"), K("kristallin", "npc_Kristallin", 150, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 25, "Éliminer des Kristallons")], 8000000, 4000000, 16000, "salvage_gate_10"),
  Q("salvage_gate_12", "Mixte : grand nettoyage", "Termine les opérations mixtes.", [K("all_npcs", "*", 1000, "Éliminer des NPC"), C("bonus", "Bonus_Box", 100, "Collecter des Bonus Boxes"), C("cargo", "Cargo_Box", 100, "Collecter des Cargo Boxes")], 12000000, 6000000, 24000, "salvage_gate_11"),
];

const ANCIENT_CURSED_EXTENSION = [
  Q("ancient_cursed_01", "Anciens : volatiles", "Ouvre l'extension anciens et maudits.", [K("styxus", "npc_Styxus", 5, "Éliminer des Styxus"), K("charopos", "npc_Charopos", 5, "Éliminer des Charopos"), K("lanatum", "npc_Lanatum", 10, "Éliminer des Lanatums")], 15000000, 7500000, 30000, "ancient_trio"),
  Q("ancient_cursed_02", "Braises : stalkers et spires", "Affronte les braises de 1-9.", [K("magma", "npc_Magma_Stalker", 80, "Éliminer des Magma Stalkers"), K("pyrospire", "npc_Pyrospire", 3, "Éliminer des Pyrospires"), V("1-9")], 12000000, 6000000, 24000, "ancient_cursed_01"),
  Q("ancient_cursed_03", "Zone explosive", "Nettoie la zone explosive 1-4.1.", [K("explosif", "npc_Explosif", 40, "Éliminer des Explosifs"), V("1-4.1")], 6000000, 3000000, 12000, "ancient_cursed_02"),
  Q("ancient_cursed_04", "Cubikons : premier siège", "Frappe les dispositifs Cubikon.", [K("cubikon", "npc_Cubikon", 5, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits")], 10000000, 5000000, 20000, "cubikon_siege"),
  Q("ancient_cursed_05", "Cubikons : campagne lourde", "Mène une lourde campagne Cubikon.", [K("cubikon", "npc_Cubikon", 20, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 400, "Éliminer des Protegits")], 25000000, 12500000, 50000, "ancient_cursed_04"),
  Q("ancient_cursed_06", "Maudits : premier contact étendu", "Survis au secteur maudit et récolte l'astral.", [V("MAUDITE"), K("protegit", "npc_Protegit", 50, "Éliminer des Protegits", "MAUDITE"), C("astral", "Astral_Prime_Box", 25, "Collecter des Astral Prime Boxes", "MAUDITE")], 30000000, 30000000, 150000, "cursed_first_contact"),
  Q("ancient_cursed_07", "Viral : souche et overlord", "Neutralise la souche virale et ses overlords.", [K("viral_kristallon", "npc_Viral_Kristallon", 40, "Éliminer des Viral Kristallons"), K("viral_gyger", "npc_Viral_Gygerthrall", 60, "Éliminer des Viral Gygerthralls"), K("overlord", "npc_Gygerim_Overlord", 3, "Éliminer des Gygerim Overlords")], 35000000, 17500000, 70000, "viral_outbreak"),
  Q("ancient_cursed_08", "Légende : triade et Cubikons", "Termine l'extension par une épreuve complète.", [K("styxus", "npc_Styxus", 10, "Éliminer des Styxus"), K("charopos", "npc_Charopos", 10, "Éliminer des Charopos"), K("lanatum", "npc_Lanatum", 25, "Éliminer des Lanatums"), K("cubikon", "npc_Cubikon", 10, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 250, "Éliminer des Protegits")], 80000000, 40000000, 160000, "ancient_cursed_07"),
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
  ["exterm1000_explosif", "Explosif", "npc_Explosif"],
  ["exterm1000_magma_stalker", "Magma Stalker", "npc_Magma_Stalker"],
  ["exterm1000_pyrospire", "Pyrospire", "npc_Pyrospire"],
];
const EXTERMINATION_1000 = EXTERMINATION_1000_DATA.map(([id, name, type]) => {
  const reward = NPC_REWARDS[type] || { credits: 0, exp: 0, honor: 0 };
  const credits = Math.floor(Number(reward.credits || 0) * 1500);
  const exp = Math.floor(Number(reward.exp || 0) * 1500);
  const honor = Math.floor(Number(reward.honor || 0) * 1500);
  return Q(id, `Extermination : ${name} (1000)`, `Contrat d'extermination : détruis 1000 ${name}.`, [K("kill", type, 1000, `Éliminer 1000 ${name}`)], credits, exp, honor);
});

// Inspiré des familles de missions DarkOrbit, mais limité aux contenus jouables
// du projet et rédigé avec des titres/descriptions originaux.
const QUEST_CATALOG = [
  Q("cadet_contact", "Premier contact", "Nettoie la route de départ et récupère les ressources abandonnées.", [K("streuner", "npc_Streuner", 5, "Éliminer des Streuners"), C("bonus", "Bonus_Box", 3, "Collecter des Bonus Boxes")], 25000, 10000, 50),
  Q("cadet_lordakia", "Alerte Lordakia", "Écarte les éclaireurs qui menacent les voies commerciales.", [K("lordakia", "npc_Lordakia", 10, "Éliminer des Lordakias"), C("cargo", "Cargo_Box", 5, "Récupérer des Cargo Boxes")], 50000, 20000, 100, "cadet_contact"),
  Q("cadet_saimon", "Signaux Saimon", "Intercepte les Saimons et sécurise les balises.", [K("saimon", "npc_Saimon", 12, "Éliminer des Saimons"), C("bonus", "Bonus_Box", 5, "Collecter des Bonus Boxes")], 90000, 40000, 180, "cadet_lordakia"),
  Q("cadet_mordon", "La ligne Mordon", "Brise la première ligne lourde des envahisseurs.", [K("mordon", "npc_Mordon", 10, "Éliminer des Mordons"), K("saimon", "npc_Saimon", 15, "Éliminer des Saimons")], 150000, 75000, 300, "cadet_saimon"),
  Q("cadet_devolarium", "Épreuve Devolarium", "Affronte une cible blindée et rapporte ses cargaisons.", [K("devolarium", "npc_Devolarium", 6, "Éliminer des Devolariums"), C("cargo", "Cargo_Box", 8, "Récupérer des Cargo Boxes")], 250000, 125000, 500, "cadet_mordon"),
  Q("low_mix", "Nettoyage orbital", "Réduis plusieurs populations hostiles des secteurs bas.", [K("lordakia", "npc_Lordakia", 40, "Éliminer des Lordakias"), K("saimon", "npc_Saimon", 30, "Éliminer des Saimons"), K("mordon", "npc_Mordon", 20, "Éliminer des Mordons")], 400000, 200000, 800),
  Q("low_bosses", "Chefs de meute", "Traque les variantes Boss des espèces des secteurs bas.", [K("streuner", "npc_Boss_Streuner", 5, "Éliminer des Boss Streuners"), K("lordakia", "npc_Boss_Lordakia", 5, "Éliminer des Boss Lordakias"), K("saimon", "npc_Boss_Saimon", 5, "Éliminer des Boss Saimons")], 650000, 325000, 1300),
  Q("sibelon_front", "Front Sibelon", "Démantèle une formation Sibelon et son escorte.", [K("sibelon", "npc_Sibelon", 15, "Éliminer des Sibelons"), K("sibelonit", "npc_Sibelonit", 30, "Éliminer des Sibelonits")], 750000, 375000, 1500),
  Q("lordakium_pressure", "Pression Lordakium", "Repousse les unités des secteurs avancés.", [K("lordakium", "npc_Lordakium", 15, "Éliminer des Lordakiums"), K("sibelonit", "npc_Sibelonit", 35, "Éliminer des Sibelonits")], 950000, 475000, 1900, "sibelon_front"),
  Q("ice_fragments", "Éclats de glace", "Réduis l’essaim Kristallin avant l’arrivée des unités lourdes.", [K("kristallin", "npc_Kristallin", 50, "Éliminer des Kristallins"), C("cargo", "Cargo_Box", 15, "Récupérer des Cargo Boxes")], 1100000, 550000, 2200),
  Q("kristallon_hunt", "Chasseurs de Kristallons", "Neutralise les cuirassés cristallins et leur escorte.", [K("kristallon", "npc_Kristallon", 12, "Éliminer des Kristallons"), K("kristallin", "npc_Kristallin", 60, "Éliminer des Kristallins")], 1600000, 800000, 3200, "ice_fragments"),
  Q("cubikon_siege", "Siège du Cubikon", "Frappe le cœur d’un dispositif Cubikon.", [K("cubikon", "npc_Cubikon", 2, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 30, "Éliminer des Protegits")], 3000000, 1500000, 6000, "kristallon_hunt"),
  Q("cubikon_campaign", "Campagne Cubikon", "Mène une longue opération contre les structures Cubikon.", [K("cubikon", "npc_Cubikon", 10, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 150, "Éliminer des Protegits")], 12000000, 6000000, 24000, "cubikon_siege"),

  Q("mmo_route", "Route MMO", "Reconnais les secteurs bas de la zone MMO.", [V("1-2"), V("1-3"), V("1-4")], 50000, 25000, 50),
  Q("eic_route", "Route EIC", "Reconnais les secteurs bas de la zone EIC.", [V("2-2"), V("2-3"), V("2-4")], 50000, 25000, 50),
  Q("vru_route", "Route VRU", "Reconnais les secteurs bas de la zone VRU.", [V("3-2"), V("3-3"), V("3-4")], 50000, 25000, 50),
  Q("upper_tour", "Au-delà de la frontière", "Traverse les trois grands secteurs supérieurs.", [V("1-8"), V("2-8"), V("3-8")], 150000, 75000, 150),
  Q("dangerous_crossroads", "Carrefours dangereux", "Cartographie les zones les plus hostiles du centre galactique.", [V("4-4.123"), V("4-5"), V("5-2")], 300000, 150000, 300, "upper_tour"),
  Q("uber_vanguard", "Avant-garde Uber", "Affronte les variantes Uber légères de 4-5.", [K("streuner", "npc_Uber_Streuner", 10, "Éliminer des Uber Streuners", "4-5"), K("lordakia", "npc_Uber_Lordakia", 10, "Éliminer des Uber Lordakias", "4-5"), K("saimon", "npc_Uber_Saimon", 10, "Éliminer des Uber Saimons", "4-5")], 3500000, 1750000, 7000, "dangerous_crossroads"),
  Q("uber_heavy", "Ligne Uber lourde", "Élimine les unités Uber blindées de 4-5.", [K("mordon", "npc_Uber_Mordon", 15, "Éliminer des Uber Mordons", "4-5"), K("sibelon", "npc_Uber_Sibelon", 10, "Éliminer des Uber Sibelons", "4-5"), K("devo", "npc_Uber_Devolarium", 10, "Éliminer des Uber Devolariums", "4-5")], 6000000, 3000000, 12000, "uber_vanguard"),
  Q("uber_ice", "Âge de glace Uber", "Survis aux prédateurs les plus dangereux de 4-5.", [K("kristallin", "npc_Uber_Kristallin", 25, "Éliminer des Uber Kristallins", "4-5"), K("kristallon", "npc_Uber_Kristallon", 10, "Éliminer des Uber Kristallons", "4-5"), K("lordakium", "npc_Uber_Lordakium", 10, "Éliminer des Uber Lordakiums", "4-5")], 10000000, 5000000, 20000, "uber_heavy"),

  Q("pirate_entry", "Territoire pirate", "Ouvre une route et constitue une première réserve de Palladium.", [V("5-2"), K("marauder", "npc_Marauder", 15, "Éliminer des Marauders"), C("palladium", "Palladium_Ore", 50, "Collecter du Palladium", "5-2")], 2000000, 1000000, 4000),
  Q("pirate_cleanup", "Nettoyage pirate", "Affronte les bandes qui contrôlent les routes de contrebande.", [K("vagrant", "npc_Vagrant", 25, "Éliminer des Vagrants"), K("outcast", "npc_Outcast", 25, "Éliminer des Outcasts"), K("corsair", "npc_Corsair", 15, "Éliminer des Corsairs")], 3500000, 1750000, 7000, "pirate_entry"),
  Q("pirate_elite", "Élite pirate", "Détruis les unités pirates spécialisées.", [K("interceptor", "npc_Interceptor", 40, "Éliminer des Interceptors"), K("barracuda", "npc_Barracuda", 25, "Éliminer des Barracudas"), K("saboteur", "npc_Saboteur", 20, "Éliminer des Saboteurs"), K("annihilator", "npc_Annihilator", 10, "Éliminer des Annihilators")], 8000000, 4000000, 16000, "pirate_cleanup"),
  Q("palladium_industry", "Industrie du Palladium", "Constitue une réserve stratégique en territoire pirate.", [C("palladium", "Palladium_Ore", 500, "Collecter du Palladium", "5-2"), K("marauder", "npc_Marauder", 50, "Éliminer des Marauders")], 9000000, 4500000, 18000, "pirate_entry"),

  Q("blighted_sample", "Échantillons contaminés", "Prélève des alliages sur les créatures contaminées.", [K("kristallon", "npc_Blighted_Kristallon", 20, "Éliminer des Blighted Kristallons"), K("gyger", "npc_Blighted_Gygerthrall", 50, "Éliminer des Blighted Gygerthralls"), C("alloy", "Hybrid_Alloy_Box", 30, "Collecter des Hybrid Alloy Boxes")], 6000000, 3000000, 12000),
  Q("blighted_epidemic", "Épidémie orbitale", "Endigue une vague massive de contaminés.", [K("kristallon", "npc_Blighted_Kristallon", 100, "Éliminer des Blighted Kristallons"), K("kristallin", "npc_Blighted_Kristallin", 200, "Éliminer des Blighted Kristallins"), K("gyger", "npc_Blighted_Gygerthrall", 300, "Éliminer des Blighted Gygerthralls")], 30000000, 15000000, 60000, "blighted_sample"),
  Q("viral_outbreak", "Souche virale", "Neutralise les formes virales avant leur dissémination.", [K("kristallon", "npc_Viral_Kristallon", 25, "Éliminer des Viral Kristallons"), K("gyger", "npc_Viral_Gygerthrall", 75, "Éliminer des Viral Gygerthralls"), K("overlord", "npc_Gygerim_Overlord", 3, "Éliminer des Gygerim Overlords")], 18000000, 9000000, 36000, "blighted_sample"),

  Q("gate_alpha", "Contrat Alpha", "Termine la Galaxy Gate Alpha.", [G("alpha")], 1000000, 350000, 1000),
  Q("gate_beta", "Contrat Beta", "Termine la Galaxy Gate Beta.", [G("beta")], 1500000, 525000, 1500, "gate_alpha"),
  Q("gate_gamma", "Contrat Gamma", "Termine la Galaxy Gate Gamma.", [G("gamma")], 2250000, 800000, 2250, "gate_beta"),
  Q("gate_trinity", "Trinité galactique", "Achève les trois Gates de l’ensemble Alpha, Beta et Gamma.", [G("alpha"), G("beta"), G("gamma")], 6000000, 2100000, 6000, "gate_gamma"),
  Q("gate_veteran", "Vétéran des Gates", "Répète les Gates jusqu’à maîtriser leurs vagues.", [G("alpha", 3), G("beta", 2), G("gamma", 2)], 15000000, 5250000, 15000, "gate_trinity"),

  Q("collector_route", "Route des collecteurs", "Récupère toutes les formes de cargaisons courantes.", [C("bonus", "Bonus_Box", 100, "Collecter des Bonus Boxes"), C("cargo", "Cargo_Box", 100, "Collecter des Cargo Boxes"), C("booty", "Green_Booty_Box", 10, "Collecter des Green Booty Boxes")], 5000000, 2500000, 10000),
  Q("astral_reserves", "Réserves astrales", "Récupère les caches les plus rares disponibles.", [C("astral", "Astral_Prime_Box", 10, "Collecter des Astral Prime Boxes"), C("alloy", "Hybrid_Alloy_Box", 25, "Collecter des Hybrid Alloy Boxes")], 12000000, 6000000, 24000),
  Q("boss_extermination", "Décapitation", "Élimine les commandants des principales espèces.", [K("mordon", "npc_Boss_Mordon", 25, "Éliminer des Boss Mordons"), K("sibelon", "npc_Boss_Sibelon", 20, "Éliminer des Boss Sibelons"), K("lordakium", "npc_Boss_Lordakium", 15, "Éliminer des Boss Lordakiums"), K("kristallon", "npc_Boss_Kristallon", 10, "Éliminer des Boss Kristallons")], 15000000, 7500000, 30000),
  Q("emperor_protocol", "Protocole Empereur", "Affronte les trois souverains extraterrestres.", [K("sibelon", "npc_Emperor_Sibelon", 3, "Éliminer des Emperor Sibelons"), K("lordakium", "npc_Emperor_Lordakium", 3, "Éliminer des Emperor Lordakiums"), K("kristallon", "npc_Emperor_Kristallon", 3, "Éliminer des Emperor Kristallons")], 30000000, 15000000, 60000, "boss_extermination"),
  Q("extreme_streuner", "Un million de débris", "Contrat d’endurance pour les pilotes qui ne reculent jamais.", [K("streuner", "npc_Streuner", 1000, "Éliminer des Streuners"), K("boss", "npc_Boss_Streuner", 100, "Éliminer des Boss Streuners"), K("uber", "npc_Uber_Streuner", 50, "Éliminer des Uber Streuners")], 50000000, 25000000, 100000),
  Q("extreme_crystal", "Guerre de cristal", "Une campagne démesurée contre les forces cristallines.", [K("kristallin", "npc_Kristallin", 1000, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 300, "Éliminer des Kristallons"), K("boss", "npc_Boss_Kristallon", 50, "Éliminer des Boss Kristallons"), K("uber", "npc_Uber_Kristallon", 25, "Éliminer des Uber Kristallons")], 150000000, 75000000, 300000, "uber_ice"),
  Q("extreme_cube", "Briseur de Cubikons", "Un contrat excessif réservé aux escadrons les plus puissants.", [K("cubikon", "npc_Cubikon", 100, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 2000, "Éliminer des Protegits")], 250000000, 125000000, 500000, "cubikon_campaign"),
  Q("galactic_legend", "Légende galactique", "Traverse la galaxie, écrase ses menaces et domine les Gates.", [V("4-5"), V("5-2"), K("cubikon", "npc_Cubikon", 50, "Détruire des Cubikons"), K("uber", "npc_Uber_Kristallon", 50, "Éliminer des Uber Kristallons", "4-5"), G("alpha", 5), G("beta", 5), G("gamma", 5)], 1000000000, 500000000, 2000000, "gate_veteran"),
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
  ...CEQ("ultimate_all_missions", "L’ultime formalité", "Après avoir accompli toutes les missions du jeu, élimine simplement un Streuner.", [K("last_streuner", "npc_Streuner", 1, "Éliminer un Streuner")], 1000000000000000, 1000000000000000, 10000000000000, { x4: 1000000000, x6: 250000000, sab: 500000000 }, 10000000),
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
      // Les ids de map ("MAUDITE" vs "maudite", "1-1", "4-4.123"...) sont comparés
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
