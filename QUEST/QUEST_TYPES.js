"use strict";

import { NPC_REWARDS } from "../NPC/NPC_BALANCE.js";
import { getMapRequiredLevel } from "../SRC/CORE/MAP_ACCESS.js";

export const MAX_ACTIVE_QUESTS = 10;
const K = (id, type, amount, label, map) => ({ id, kind: "kill", type, amount, label, ...(map ? { map } : {}) });
const C = (id, type, amount, label, map) => ({ id, kind: "collect", type, amount, label, ...(map ? { map } : {}) });
// Assemblage : type = id de recette (craft_prometheus...), amount = crafts.
// Joueurs : type "pvp". Présence : type "bl" (maps Blacklight), amount en secondes.
const R = (id, type, amount, label) => ({ id, kind: "craft", type, amount, label });
const P = (id, amount, label, map) => ({ id, kind: "pvp", type: "pvp", amount, label, ...(map ? { map } : {}) });
const S = (id, seconds, label) => ({ id, kind: "stay", type: "bl", amount: seconds, label });
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

// ---------------------------------------------------------------------------
// Famille Blacklight (60 quêtes chaînées : chacune débloque la suivante).
// Objectifs suivis : kill / collect (box comme ressources) / craft /
// pvp / stay (présence BL). Contraintes de temps, "sans mourir" et dégâts
// du document d'origine : non suivis (version simplifiée).
// Récompenses : EXP/honneur du document ; crédits 0 (aucun au document) ;
// boosters -> 1 Laser Prometheus (inventaire) ; codes secrets -> ressource
// blacklight_cipher (+2,5 M d'honneur si le document ne précise rien).
// ---------------------------------------------------------------------------
const BL_MAPS = ["1-bl", "2-bl", "3-bl"];
const BLQ = (num, title, description, objectives, reward, prev) => ({
  id: `bl_${String(num).padStart(2, "0")}`,
  title,
  description,
  objectives,
  reward: { credits: 0, exp: 0, honor: 0, ...reward },
  ...(prev ? { requires: `bl_${String(prev).padStart(2, "0")}` } : {}),
});
const PRL = { lasers: { laser_prl: 1 } };
const BLACKLIGHT_CHAIN = [
  BLQ(1, "Délimitation", "Fais tes preuves sur les Impulse II de la Blacklight.", [K("impulse", "npc_Impulse_II", 10, "Détruire des Impulse II", BL_MAPS)], { ...PRL }, null),
  BLQ(2, "Bouche Prométhéenne", "Continue le nettoyage des Impulse II.", [K("impulse", "npc_Impulse_II", 25, "Détruire des Impulse II", BL_MAPS)], { ...PRL }, 1),
  BLQ(3, "Arrimage", "Les Impulse II pullulent, ne relâche pas l'effort.", [K("impulse", "npc_Impulse_II", 35, "Détruire des Impulse II", BL_MAPS)], { ...PRL }, 2),
  BLQ(4, "L'assemblée des Fous", "Une vague massive d'Impulse II à exterminer.", [K("impulse", "npc_Impulse_II", 50, "Détruire des Impulse II", BL_MAPS)], { ...PRL }, 3),
  BLQ(5, "Une Mort Brève", "Impulse II et premiers Attend IX au programme.", [K("impulse", "npc_Impulse_II", 50, "Détruire des Impulse II", BL_MAPS), K("attend", "npc_Attend_IX", 5, "Détruire des Attend IX", BL_MAPS)], { ...PRL }, 4),
  BLQ(6, "Soupçons", "Concentre-toi sur les Attend IX.", [K("attend", "npc_Attend_IX", 15, "Détruire des Attend IX", BL_MAPS)], { ...PRL }, 5),
  BLQ(7, "Lame de Rasoir", "Ménage mixte : Impulse II et Attend IX.", [K("impulse", "npc_Impulse_II", 35, "Détruire des Impulse II", BL_MAPS), K("attend", "npc_Attend_IX", 8, "Détruire des Attend IX", BL_MAPS)], { ...PRL }, 6),
  BLQ(8, "Probabilités Tangibles", "Grosse opération mixte dans la Blacklight.", [K("impulse", "npc_Impulse_II", 50, "Détruire des Impulse II", BL_MAPS), K("attend", "npc_Attend_IX", 20, "Détruire des Attend IX", BL_MAPS)], { ...PRL }, 7),
  BLQ(9, "Pensée Fugace", "Cinquante Attend IX à abattre.", [K("attend", "npc_Attend_IX", 50, "Détruire des Attend IX", BL_MAPS)], { ...PRL }, 8),
  BLQ(10, "Sous la surface", "Tes premiers Invoke XVI t'attendent.", [K("invoke", "npc_Invoke_XVI", 3, "Détruire des Invoke XVI", BL_MAPS)], { ...PRL }, 9),
  BLQ(11, "Foreuse", "Rapporte du Rinusk des épaves Blacklight.", [C("rinusk", "rinusk", 2000, "Collecter du Rinusk")], { ...PRL }, 10),
  BLQ(12, "Désordre Technologique", "Rinusk et premier Prometheus assemblé.", [C("rinusk", "rinusk", 4000, "Collecter du Rinusk"), R("craft-prl", "craft_prometheus", 1, "Assembler un Laser Prometheus")], { ...PRL, ammo: { abl: 20000 } }, 11),
  BLQ(13, "Soif de connaissances", "Invoke XVI et munitions A-BL assemblées.", [K("invoke", "npc_Invoke_XVI", 5, "Détruire des Invoke XVI", BL_MAPS), R("craft-abl", "craft_abl_25000", 1, "Assembler des Munitions A-BL")], { ...PRL }, 12),
  BLQ(14, "Courons !", "Invoke XVI et Attend IX en force.", [K("invoke", "npc_Invoke_XVI", 5, "Détruire des Invoke XVI", BL_MAPS), K("attend", "npc_Attend_IX", 25, "Détruire des Attend IX", BL_MAPS)], { ...PRL, resources: { mindfire_cerebrum: 100 } }, 13),
  BLQ(15, "Solution insensée", "Assemble un Code secret Black Light.", [R("craft-cipher", "craft_blacklight_cipher", 1, "Assembler un Code secret Black Light")], { honor: 2500000, resources: { blacklight_cipher: 2 } }, 14),
  BLQ(16, "Sans dessus dessous", "Rapporte vite du Rinusk.", [C("rinusk", "rinusk", 100, "Collecter du Rinusk")], { exp: 35000000, honor: 1500000 }, 15),
  BLQ(17, "La vertu est un mensonge", "Rapporte des Traceurs Black Light.", [C("trace", "blacklight_trace", 100, "Collecter des Traceurs Black Light")], { exp: 35000000, honor: 1500000 }, 16),
  BLQ(18, "Organiser le Chaos", "Un gros stock de Rinusk s'impose.", [C("rinusk", "rinusk", 1000, "Collecter du Rinusk")], { exp: 35000000, honor: 1500000 }, 17),
  BLQ(19, "Le monde de Mars", "Un gros stock de Traceurs s'impose.", [C("trace", "blacklight_trace", 1000, "Collecter des Traceurs Black Light")], { exp: 35000000, honor: 1500000 }, 18),
  BLQ(20, "Annihiler les faibles", "Vingt Impulse II, vite et proprement.", [K("impulse", "npc_Impulse_II", 20, "Détruire des Impulse II", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 19),
  BLQ(21, "Apparition Publique", "Dix Attend IX à abattre.", [K("attend", "npc_Attend_IX", 10, "Détruire des Attend IX", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 20),
  BLQ(22, "Toucher Miraculeux", "Trois Invoke XVI à détruire.", [K("invoke", "npc_Invoke_XVI", 3, "Détruire des Invoke XVI", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 21),
  BLQ(23, "Jouer avec les Cieux", "Cent Impulse et cinquante Attend à exterminer.", [K("impulse", "npc_Impulse_II", 100, "Détruire des Impulse II", BL_MAPS), K("attend", "npc_Attend_IX", 50, "Détruire des Attend IX", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 22),
  BLQ(24, "Une simple parcelle", "Trois Invoke XVI à détruire.", [K("invoke", "npc_Invoke_XVI", 3, "Détruire des Invoke XVI", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 23),
  BLQ(25, "Œil de Lynx, Cœur de pierre", "Abats le Mindfire Behemoth.", [K("mindfire", "npc_Mindfire_Behemoth", 1, "Détruire le Mindfire Behemoth", BL_MAPS)], { exp: 150000000, honor: 25000000, ammo: { abl: 30000 }, resources: { blacklight_cipher: 1 } }, 24),
  BLQ(26, "Frappe Chirurgicale", "Trente-cinq Impulse II à éliminer.", [K("impulse", "npc_Impulse_II", 35, "Détruire des Impulse II", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 25),
  BLQ(27, "Respirez", "Cent Impulse II à éliminer.", [K("impulse", "npc_Impulse_II", 100, "Détruire des Impulse II", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 26),
  BLQ(28, "Talents Cachés", "Deux cents Impulse II à éliminer.", [K("impulse", "npc_Impulse_II", 200, "Détruire des Impulse II", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 27),
  BLQ(29, "Bourreau de Travail", "Dix Attend IX à éliminer.", [K("attend", "npc_Attend_IX", 10, "Détruire des Attend IX", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 28),
  BLQ(30, "Nettoyage", "Cinquante Attend IX à éliminer.", [K("attend", "npc_Attend_IX", 50, "Détruire des Attend IX", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 29),
  BLQ(31, "La restauration", "Cent Attend IX à éliminer.", [K("attend", "npc_Attend_IX", 100, "Détruire des Attend IX", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 30),
  BLQ(32, "Protéger et Obéir", "Trois Invoke XVI à détruire.", [K("invoke", "npc_Invoke_XVI", 3, "Détruire des Invoke XVI", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 31),
  BLQ(33, "Tueur de Sang Froid", "Quinze Invoke XVI à détruire.", [K("invoke", "npc_Invoke_XVI", 15, "Détruire des Invoke XVI", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 32),
  BLQ(34, "Écraser la Vermine", "Cinquante Invoke XVI à détruire.", [K("invoke", "npc_Invoke_XVI", 50, "Détruire des Invoke XVI", BL_MAPS)], { exp: 35000000, honor: 1500000 }, 33),
  BLQ(35, "Motivations Fluctuantes", "Dix Mindfire Behemoth à abattre.", [K("mindfire", "npc_Mindfire_Behemoth", 10, "Détruire des Mindfire Behemoth", BL_MAPS)], { exp: 150000000, honor: 50000000, ammo: { abl: 30000 }, resources: { blacklight_cipher: 1 } }, 34),
  BLQ(36, "La lettre de la loi", "Mille Rinusk sur les maps Blacklight.", [C("rinusk-bl", "rinusk", 1000, "Collecter du Rinusk en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 35),
  BLQ(37, "Toujours Vivant !", "Deux cents Traceurs sur les maps Blacklight.", [C("trace-bl", "blacklight_trace", 200, "Collecter des Traceurs Black Light en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 36),
  BLQ(38, "Chiffonnier", "Rinusk et Traceurs sur les maps Blacklight.", [C("rinusk-bl", "rinusk", 2000, "Collecter du Rinusk en Blacklight", BL_MAPS), C("trace-bl", "blacklight_trace", 400, "Collecter des Traceurs Black Light en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 37),
  BLQ(39, "Imprudence", "Dix Cerebrum Mindfire sur les maps Blacklight.", [C("cerebrum-bl", "mindfire_cerebrum", 10, "Collecter des Cerebrum Mindfire en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 38),
  BLQ(40, "Nature Humaine", "Cinquante Impulse II sur les maps Blacklight.", [K("impulse-bl", "npc_Impulse_II", 50, "Détruire des Impulse II en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 39),
  BLQ(41, "Pierre à aiguiser", "Impulse II et Attend IX sur les maps Blacklight.", [K("impulse-bl", "npc_Impulse_II", 50, "Détruire des Impulse II en Blacklight", BL_MAPS), K("attend-bl", "npc_Attend_IX", 50, "Détruire des Attend IX en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 40),
  BLQ(42, "Imitation", "Impulse, Attend et Invoke sur les maps Blacklight.", [K("impulse-bl", "npc_Impulse_II", 50, "Détruire des Impulse II en Blacklight", BL_MAPS), K("attend-bl", "npc_Attend_IX", 50, "Détruire des Attend IX en Blacklight", BL_MAPS), K("invoke-bl", "npc_Invoke_XVI", 10, "Détruire des Invoke XVI en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 41),
  BLQ(43, "Bruit Blanc", "Tiens bon 20 minutes en Blacklight.", [S("stay-20m", 1200, "Rester 20 minutes en Blacklight")], { exp: 35000000, honor: 2500000 }, 42),
  BLQ(44, "Générosité", "Tiens bon 1 heure en Blacklight.", [S("stay-1h", 3600, "Rester 1 heure en Blacklight")], { exp: 35000000, honor: 2500000 }, 43),
  BLQ(45, "Restez à l'écoute", "Tiens bon 5 heures en Blacklight.", [S("stay-5h", 18000, "Rester 5 heures en Blacklight")], { exp: 150000000, honor: 35000000, ammo: { abl: 30000 }, resources: { blacklight_cipher: 1 } }, 44),
  BLQ(46, "Les murs que nous érigeons", "Dix pilotes ennemis en Blacklight.", [P("pvp-10", 10, "Détruire 10 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 45),
  BLQ(47, "Tous aux abris", "Vingt pilotes ennemis en Blacklight.", [P("pvp-20", 20, "Détruire 20 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 46),
  BLQ(48, "La résistance", "Cinquante pilotes ennemis en Blacklight.", [P("pvp-50a", 50, "Détruire 50 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 47),
  BLQ(49, "Envoyer et recevoir", "Cinq pilotes ennemis en Blacklight.", [P("pvp-5", 5, "Détruire 5 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 48),
  BLQ(50, "Le temps presse", "Dix pilotes ennemis en Blacklight.", [P("pvp-10b", 10, "Détruire 10 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 49),
  BLQ(51, "Poings Liés", "Quinze pilotes ennemis en Blacklight.", [P("pvp-15", 15, "Détruire 15 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 50),
  BLQ(52, "La force des mots", "Trente pilotes ennemis en Blacklight.", [P("pvp-30a", 30, "Détruire 30 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 51),
  BLQ(53, "L'ancien règne", "Trente pilotes ennemis en Blacklight.", [P("pvp-30b", 30, "Détruire 30 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 52),
  BLQ(54, "Erreurs fondamentales", "Cinquante pilotes ennemis en Blacklight.", [P("pvp-50b", 50, "Détruire 50 joueurs en Blacklight", BL_MAPS)], { exp: 35000000, honor: 2500000 }, 53),
  BLQ(55, "Les confins du réel", "Cinquante pilotes ennemis en Blacklight.", [P("pvp-50c", 50, "Détruire 50 joueurs en Blacklight", BL_MAPS)], { exp: 150000000, honor: 35000000, ammo: { abl: 30000 }, resources: { blacklight_cipher: 1 }, ...PRL }, 54),
  BLQ(56, "Pointage", "Soixante-douze heures cumulées en Blacklight.", [S("stay-72h", 259200, "Rester 72 heures en Blacklight")], { exp: 200000000, honor: 45000000 }, 55),
  BLQ(57, "Coup de Grâce", "Deux cents Mindfire Behemoth à abattre.", [K("mindfire", "npc_Mindfire_Behemoth", 200, "Détruire des Mindfire Behemoth", BL_MAPS)], { exp: 200000000, honor: 45000000 }, 56),
  BLQ(58, "Gladiateur", "Mille pilotes ennemis en Blacklight.", [P("pvp-1000", 1000, "Détruire 1000 joueurs en Blacklight", BL_MAPS)], { exp: 200000000, honor: 45000000 }, 57),
  BLQ(59, "Enfantin", "Quatre mille Impulse II à exterminer.", [K("impulse", "npc_Impulse_II", 4000, "Détruire des Impulse II", BL_MAPS)], { exp: 200000000, honor: 45000000 }, 58),
  BLQ(60, "Nous détenons votre identité", "Assemble cinq boosters EPHON-100.", [R("craft-ephon", "craft_ephon_100", 5, "Assembler 5 boosters EPHON-100")], { exp: 200000000, honor: 45000000 }, 59),
];
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
  ["route_mmo_hidden", "Entrailles MMO", ["4-1"], 200000, "route_mmo_outer"],
  ["route_eic_hidden", "Entrailles EIC", ["4-2"], 200000, "route_eic_outer"],
  ["route_vru_hidden", "Entrailles VRU", ["4-3"], 200000, "route_vru_outer"],
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
  Q("pirate_battleray_25", "Chasse aux Annihilators", "Affronte les prédateurs majeurs du territoire pirate.", [K("battleray", "npc_Annihilator", 25, "Éliminer des Annihilators", "5-2")], 50000000, 25000000, 100000, "pirate_annihilator_100"),
  Q("pirate_falcon_10", "Le Faucon du siècle", "Fais tomber plusieurs Century Falcons.", [K("falcon", "npc_Century_Falcon", 10, "Éliminer des Century Falcons")], 60000000, 30000000, 120000, "pirate_battleray_25"),
  Q("pirate_armada", "Armada à couler", "Détruis toutes les classes principales d’une armada.", [K("interceptor", "npc_Interceptor", 1000, "Éliminer des Interceptors"), K("barracuda", "npc_Barracuda", 500, "Éliminer des Barracudas"), K("saboteur", "npc_Saboteur", 500, "Éliminer des Saboteurs"), K("annihilator", "npc_Annihilator", 250, "Éliminer des Annihilators")], 400000000, 200000000, 800000, "pirate_falcon_10"),
  Q("pirate_saboteur_2500", "Guerre de l’ombre", "Poursuis la campagne contre les Saboteurs.", [K("saboteur", "npc_Saboteur", 2500, "Éliminer des Saboteurs")], 500000000, 250000000, 1000000, "pirate_saboteur_250"),
  Q("pirate_saboteur_7500", "Réseau fantôme", "Détruis l’essentiel du réseau Saboteur.", [K("saboteur", "npc_Saboteur", 7500, "Éliminer des Saboteurs")], 1200000000, 600000000, 2400000, "pirate_saboteur_2500"),
  Q("pirate_saboteur_17500", "Extinction des Saboteurs", "Contrat pirate de très longue durée.", [K("saboteur", "npc_Saboteur", 17500, "Éliminer des Saboteurs")], 3500000000, 1000000000, 4500000),
  Q("pirate_palladium_5000", "Tout le Palladium", "Accumule une réserve massive de Palladium.", [C("palladium", "Palladium_Ore", 5000, "Collecter du Palladium", "5-2")], 150000000, 75000000, 300000, "palladium_industry"),
];

const SPECIAL_CAMPAIGNS = [
  Q("ancient_trio", "Triade des anciens", "Affronte les variantes Uber des secteurs extérieurs.", [K("styxus", "npc_Uber_Sibelon", 25, "Éliminer des Uber Sibelons", "4-5"), K("charopos", "npc_Uber_Lordakium", 25, "Éliminer des Uber Lordakiums", "4-5"), K("lanatum", "npc_Uber_Kristallon", 25, "Éliminer des Uber Kristallons", "4-5")], 40000000, 20000000, 80000),
];

const PERMANENT_ELITE_CONTRACTS = [
  KQ("elite_cube_3500", "Faucheuse à Cubikons", "Contrat permanent contre les Cubikons.", [K("cubikon", "npc_Cubikon", 3500, "Détruire des Cubikons")]),
  KQ("elite_protegit_35000", "Marée de Protegits", "Élimine une population entière de Protegits.", [K("protegit", "npc_Protegit", 35000, "Éliminer des Protegits")]),
  Q("elite_interceptor_65000", "Fléau des Interceptors", "Contrat permanent contre les flottes Interceptor.", [K("interceptor", "npc_Interceptor", 65000, "Éliminer des Interceptors")], 3500000000, 1000000000, 4500000),
  Q("elite_barracuda_22000", "Prédateur des Barracudas", "Contrat permanent contre les meutes de Barracudas.", [K("barracuda", "npc_Barracuda", 22000, "Éliminer des Barracudas")], 3500000000, 1000000000, 4500000),
  Q("elite_annihilator_10500", "Requiem des Annihilators", "Élimine les unités Annihilator à très grande échelle.", [K("annihilator", "npc_Annihilator", 10500, "Éliminer des Annihilators")], 3500000000, 1000000000, 4500000),
  Q("elite_palladium_50000", "Fièvre éternelle du Palladium", "Collecte une réserve colossale de Palladium en 5-2.", [C("palladium", "Palladium_Ore", 50000, "Collecter du Palladium", "5-2")], 3500000000, 1000000000, 4500000),
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
  EQ("energy_gate_delta", "Saut Delta", "Termine le portail Delta, isolé de l’ensemble Alpha, Beta et Gamma.", [G("delta")], 45000000, 22500000, 45000, 150, "energy_gate_trinity"),
  EQ("energy_gate_epsilon", "Saut Epsilon", "Termine le portail pirate Epsilon, isolé des autres roues.", [G("epsilon")], 55000000, 27500000, 55000, 200, "energy_gate_delta"),
  EQ("energy_gate_zeta", "Saut Zeta", "Termine le portail Zeta et son Devourer à paliers.", [G("zeta")], 65000000, 32500000, 65000, 250, "energy_gate_epsilon"),
  EQ("energy_gate_kappa", "Saut Kappa", "Termine le portail Kappa et ses onze vagues mixtes.", [G("kappa")], 75000000, 37500000, 75000, 300, "energy_gate_zeta"),
  EQ("energy_gate_lambda", "Saut Lambda", "Termine le portail Lambda et ses sept vagues de Boss.", [G("lambda")], 85000000, 42500000, 85000, 350, "energy_gate_kappa"),
  EQ("energy_gate_kronos", "Saut Kronos", "Termine le portail Kronos et ses treize vagues Saturn.", [G("kronos")], 100000000, 50000000, 100000, 400, "energy_gate_lambda"),
  EQ("energy_ultimate_stock", "Coffre du vétéran", "Prouve ton endurance dans les Gates et contre les unités d’élite.", [G("alpha", 5), G("beta", 3), G("gamma", 2), K("uber", "npc_Uber_Kristallon", 50, "Éliminer des Uber Kristallons", "4-5")], 50000000, 25000000, 50000, 250, "energy_gate_trinity"),
];

const CURSED_MAP_CONTRACTS = [
  CEQ("cursed_first_contact", "Là où meurent les noms", "Pénètre dans la carte ??? et survis au premier contact.", [V("MAUDITE"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits", "MAUDITE")], 25000000, 25000000, 125000, { x4: 5000, x6: 500 }, 12),
  CEQ("cursed_astral_harvest", "Moisson des damnés", "Récupère les réserves rares disséminées dans le secteur ???.", [C("astral", "Astral_Prime_Box", 100, "Collecter des Astral Prime Boxes", "MAUDITE")], 50000000, 50000000, 250000, { x4: 10000, x6: 1000 }, 25, "cursed_first_contact"),
  CEQ("cursed_protegit_line", "Légions de l’oubli", "Détruis chacune des variantes de Protegit qui infestent la carte ???.", [K("protegit_1", "npc_Protegit_maudite", 150, "Éliminer des Chaos Protegit", "MAUDITE"), K("protegit_2", "npc_Protegit_maudite2", 150, "Éliminer des Boss Chaos Protegit", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 150, "Éliminer des Uber Chaos Protegit", "MAUDITE")], 150000000, 150000000, 750000, { x4: 25000, x6: 2500 }, 50, "cursed_astral_harvest"),
  CEQ("cursed_ammunition_run", "Arsenal des tréfonds", "Résiste aux essaims de ??? pour obtenir une cargaison de combat exceptionnelle.", [K("protegit", "npc_Protegit", 500, "Éliminer des Protegits", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 250, "Éliminer des Uber Chaos Protegit", "MAUDITE")], 250000000, 250000000, 1250000, { x4: 50000, x6: 5000, sab: 25000 }, 100, "cursed_protegit_line"),
  CEQ("cursed_cube_breakers", "Brise-mondes", "Détruis les forteresses vivantes qui contrôlent le secteur ???.", [K("cubikon", "npc_Cubikon", 100, "Détruire des Cubikons", "MAUDITE"), K("cursed_cubikon", "npc_Cubikon_maudite", 25, "Détruire des Cubikons maudits", "MAUDITE")], 500000000, 500000000, 3750000, { x4: 125000, x6: 12500 }, 250, "cursed_ammunition_run"),
  CEQ("cursed_extermination", "La grande purge", "Mène une campagne complète contre toutes les forces de la carte maudite.", [K("cubikon", "npc_Cubikon", 250, "Détruire des Cubikons", "MAUDITE"), K("cursed_cubikon", "npc_Cubikon_maudite", 100, "Détruire des Cubikons maudits", "MAUDITE"), K("protegit_1", "npc_Protegit_maudite", 750, "Éliminer des Chaos Protegit", "MAUDITE"), K("protegit_2", "npc_Protegit_maudite2", 750, "Éliminer des Boss Chaos Protegit", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 750, "Éliminer des Uber Chaos Protegit", "MAUDITE")], 500000000, 500000000, 5000000, { x4: 100000, x6: 10000, sab: 50000 }, 100, "cursed_cube_breakers"),
  CEQ("cursed_legend", "Légende des tréfonds", "Accomplis l’épreuve ultime du secteur ???.", [K("cursed_cubikon", "npc_Cubikon_maudite", 500, "Détruire des Cubikons maudits", "MAUDITE"), K("protegit_3", "npc_Protegit_maudite3", 5000, "Éliminer des Uber Chaos Protegit", "MAUDITE"), C("astral", "Astral_Prime_Box", 1000, "Collecter des Astral Prime Boxes", "MAUDITE")], 2500000000, 2500000000, 25000000, { x4: 500000, x6: 50000, sab: 250000 }, 500, "cursed_extermination"),
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
  ["century_011", "Rayons de la mort", [K("battleray", "npc_Uber_Annihilator", 100, "Éliminer des Uber Annihilators", "5-2"), K("annihilator", "npc_Annihilator", 300, "Éliminer des Annihilators", "5-2")]],
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
  Q("salvage_gate_07", "Maîtrise Alpha", "Termine deux Galaxy Gates Alpha après avoir accepté ce contrat.", [G("alpha", 2)], 1500000, 525000, 1500, "gate_alpha"),
  Q("salvage_gate_08", "Maîtrise Beta", "Termine deux Galaxy Gates Beta après avoir accepté ce contrat.", [G("beta", 2)], 2000000, 700000, 2000, "salvage_gate_07"),
  Q("salvage_gate_09", "Maîtrise Gamma", "Termine deux Galaxy Gates Gamma après avoir accepté ce contrat.", [G("gamma", 2)], 3000000, 1050000, 3000, "salvage_gate_08"),
  Q("salvage_gate_10", "Trinité en boucle", "Répète la trinité Alpha, Beta et Gamma.", [G("alpha", 2), G("beta", 2), G("gamma", 1)], 10000000, 3500000, 10000, "salvage_gate_09"),
  Q("salvage_gate_11", "Feu et cristal", "Combine Gates et chasse au cristal.", [G("alpha"), K("kristallin", "npc_Kristallin", 150, "Éliminer des Kristallins"), K("kristallon", "npc_Kristallon", 25, "Éliminer des Kristallons")], 8000000, 4000000, 16000, "salvage_gate_10"),
  Q("salvage_gate_12", "Rafle finale", "Termine les opérations mixtes.", [K("all_npcs", "*", 1000, "Éliminer des NPC"), C("bonus", "Bonus_Box", 100, "Collecter des Bonus Boxes"), C("cargo", "Cargo_Box", 100, "Collecter des Cargo Boxes")], 12000000, 6000000, 24000, "salvage_gate_11"),
];

const ANCIENT_CURSED_EXTENSION = [
  Q("ancient_cursed_01", "Anciens — Bêtes volatiles", "Ouvre l'extension anciens et maudits.", [K("styxus", "npc_Uber_Sibelon", 5, "Éliminer des Uber Sibelons", "4-5"), K("charopos", "npc_Uber_Lordakium", 5, "Éliminer des Uber Lordakiums", "4-5"), K("lanatum", "npc_Uber_Kristallon", 10, "Éliminer des Uber Kristallons", "4-5")], 15000000, 7500000, 30000, "ancient_trio"),
  Q("ancient_cursed_02", "Braises à éteindre", "Affronte les unités explosives des secteurs de guerre.", [K("magma", "npc_Explosif", 80, "Éliminer des Kamikazes", ["4-1", "4-2", "4-3", "4-4"]), K("pyrospire", "npc_Uber_Kristallin", 3, "Éliminer des Uber Kristallins", "4-5")], 18000000, 9000000, 36000, "ancient_cursed_01"),
  Q("ancient_cursed_03", "4-1 — Zone de mort", "Nettoie la zone explosive 4-1.", [K("explosif", "npc_Explosif", 40, "Éliminer des Kamikazes"), V("4-1")], 12000000, 6000000, 24000, "ancient_cursed_02"),
  Q("ancient_cursed_04", "Siège du premier cœur", "Frappe les dispositifs Cubikon.", [K("cubikon", "npc_Cubikon", 5, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 100, "Éliminer des Protegits")], 15000000, 7500000, 30000, "cubikon_siege"),
  Q("ancient_cursed_05", "Cœur lourd", "Mène une lourde campagne Cubikon.", [K("cubikon", "npc_Cubikon", 20, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 400, "Éliminer des Protegits")], 60000000, 30000000, 120000, "ancient_cursed_04"),
  Q("ancient_cursed_06", "Au-delà du voile", "Survis au secteur maudit et récolte l'astral.", [V("MAUDITE"), K("protegit", "npc_Protegit", 50, "Éliminer des Protegits", "MAUDITE"), C("astral", "Astral_Prime_Box", 25, "Collecter des Astral Prime Boxes", "MAUDITE")], 30000000, 30000000, 150000, "cursed_first_contact"),
  Q("ancient_cursed_07", "Le suzerain tombe", "Neutralise la souche virale et ses overlords.", [K("viral_kristallon", "npc_Viral_Kristallon", 40, "Éliminer des Viral Kristallons"), K("viral_gyger", "npc_Viral_Gygerthrall", 60, "Éliminer des Viral Gygerthralls"), K("overlord", "npc_Gygerim_Overlord", 3, "Éliminer des Gygerim Overlords")], 35000000, 17500000, 70000, "viral_outbreak"),
  Q("ancient_cursed_08", "L’épreuve finale", "Termine l'extension par une épreuve complète.", [K("styxus", "npc_Uber_Sibelon", 10, "Éliminer des Uber Sibelons", "4-5"), K("charopos", "npc_Uber_Lordakium", 10, "Éliminer des Uber Lordakiums", "4-5"), K("lanatum", "npc_Uber_Kristallon", 25, "Éliminer des Uber Kristallons", "4-5"), K("cubikon", "npc_Cubikon", 10, "Détruire des Cubikons"), K("protegit", "npc_Protegit", 250, "Éliminer des Protegits")], 80000000, 40000000, 160000, "ancient_cursed_07"),
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
  ["exterm1000_boss_streuner_recruit", "Protecteur Streuner", "npc_Boss_Streuner_Recruit"],
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
  ["exterm1000_styxus", "Uber Sibelon", "npc_Uber_Sibelon"],
  ["exterm1000_charopos", "Uber Lordakium", "npc_Uber_Lordakium"],
  ["exterm1000_lanatum", "Uber Kristallon", "npc_Uber_Kristallon"],
  ["exterm1000_explosif", "Kamikaze", "npc_Explosif"],
  ["exterm1000_magma_stalker", "Kamikaze", "npc_Explosif"],
  ["exterm1000_pyrospire", "Uber Kristallin", "npc_Uber_Kristallin"],
];
const extermTitleFor = (name) => {
  const raw = String(name || "").trim();
  const lower = raw.toLowerCase();
  const rest = (prefix) => raw.slice(prefix.length).trim() || raw;
  if (lower.startsWith("emperor ")) return `Régicide : ${rest("Emperor ")}`;
  if (lower.startsWith("uber ")) return `Cauchemar Uber : ${rest("Uber ")}`;
  if (lower.startsWith("boss ")) return `Prime au commandant : ${rest("Boss ")}`;
  if (lower.includes("blighted") || lower.includes("gygerthrall") || lower.includes("viral")) return `Endiguement contagion : ${raw}`;
  if (lower.includes("recruit") || lower.includes("aider") || lower.includes("protecteur streuner")) return `Bizutage sanglant : ${raw}`;
  if (lower.includes("interceptor") || lower.includes("barracuda") || lower.includes("saboteur") || lower.includes("annihilator") || lower.includes("marauder") || lower.includes("vagrant") || lower.includes("outcast") || lower.includes("corsair") || lower.includes("convict") || lower.includes("hooligan") || lower.includes("ravager")) return `Nettoyage pirate : ${raw}`;
  if (lower.includes("styxus") || lower.includes("charopos") || lower.includes("lanatum")) return `Chasse ancienne : ${raw}`;
  if (lower.includes("magma") || lower.includes("pyrospire") || lower.includes("kamikaze") || lower.includes("explosif")) return `Zone à risque : ${raw}`;
  if (lower.includes("protegit") || lower.includes("cubikon")) return `Siège du cœur : ${raw}`;
  if (lower.includes("streuner8") || lower.includes("streuner")) return `Battue du vide : ${raw}`;
  if (lower.includes("kristall")) return `Bris de cristal : ${raw}`;
  if (lower.includes("sibelon")) return `Front de sang : ${raw}`;
  if (lower.includes("lordaki")) return `Pression de l'étau : ${raw}`;
  if (lower.includes("saimon") || lower.includes("mordon") || lower.includes("devolarium")) return `Purge des bas-fonds : ${raw}`;
  return `Purge : ${raw}`;
};
const EXTERMINATION_1000 = EXTERMINATION_1000_DATA.map(([id, name, type]) =>
  KQ(id, extermTitleFor(name), `Contrat d'extermination : détruis 1000 ${name}.`, [K("kill", type, 1000, `Éliminer 1000 ${name}`)])
);

// ---------------------------------------------------------------------------
// Extension 300 missions. Uniquement des NPC présents dans MAPS/*/SPAWNS.js
// (ou invoqués : Gygerthrall), des boxes existantes et les Gates jouables.
// Titres et descriptions en modèles ("{0} — Patrouille") : traduits par les
// patterns i18n, sans une entrée par mission.
// ---------------------------------------------------------------------------
const X_ROMAN = ["I", "II", "III", "IV", "V"];
const X_NAME_OVERRIDES = { npc_Explosif: "Kamikaze", npc_Boss_Streuner_Recruit: "Protecteur Streuner" };
const xName = (type) => X_NAME_OVERRIDES[type] || String(type).replace(/^npc_/, "").replace(/_/g, " ");
const xPlural = (name) => (name === "Protecteur Streuner" ? "Protecteurs Streuner" : /[0-9s]$/.test(name) ? name : `${name}s`);
const xKill = (id, type, amount, map) => {
  const verb = /Cubikon/.test(type) ? "Détruire" : "Éliminer";
  return K(id, type, Math.max(1, Math.round(amount)), `${verb} des ${xPlural(xName(type))}`, map);
};

// Occupants de chaque carte (SPAWNS.js) : [types communs], [boss], empereur.
const X_SECTOR_SPAWNS = {
  1: [["npc_Streuner", "npc_Streuner_Recruit", "npc_Streuner_Aider"], ["npc_Boss_Streuner_Recruit"], null],
  2: [["npc_Streuner", "npc_Lordakia", "npc_Streuner_Recruit"], ["npc_Boss_Streuner", "npc_Boss_Lordakia"], null],
  3: [["npc_Saimon", "npc_Mordon", "npc_Devolarium"], ["npc_Boss_Saimon", "npc_Boss_Mordon", "npc_Boss_Devolarium"], null],
  4: [["npc_Saimon", "npc_Mordon", "npc_Sibelon"], ["npc_Boss_Saimon", "npc_Boss_Sibelon"], "npc_Emperor_Sibelon"],
  5: [["npc_Sibelonit", "npc_Lordakia", "npc_Lordakium"], ["npc_Boss_Sibelonit", "npc_Boss_Lordakium"], "npc_Emperor_Lordakium"],
  6: [["npc_Kristallin", "npc_Kristallon", "npc_Blighted_Kristallin"], ["npc_Boss_Kristallin"], null],
  7: [["npc_Kristallin", "npc_Kristallon", "npc_Blighted_Kristallon"], ["npc_Boss_Kristallin", "npc_Boss_Kristallon"], "npc_Emperor_Kristallon"],
  8: [["npc_StreuneR8"], ["npc_Boss_StreuneR8"], null],
};
const X_SECTOR_TIERS = [
  ["patrol", "Patrouille", "Patrouille la carte {map} et élimine ses occupants.", 1],
  ["sweep", "Ratissage", "Ratisse la carte {map} et abats ses commandants.", 4],
  ["iron", "Main de fer", "Prends le contrôle total de la carte {map}.", 12],
];
const xSectorQuests = (map, commons, bosses, emperor, firstRequires) => X_SECTOR_TIERS.map(([tier, label, desc, scale], index) => {
  const objectives = commons.map((type, i) => xKill(`c${i}`, type, (i ? 10 : 20) * scale, map));
  if (index >= 1) bosses.forEach((type, i) => objectives.push(xKill(`b${i}`, type, 2 * scale / 4 + (index === 2 ? 4 : 1), map)));
  if (index === 2 && emperor) objectives.push(xKill("emperor", emperor, 1, map));
  if (index === 0) objectives.push(V(map));
  const id = `sector_${map.replace("-", "_")}_${tier}`;
  const requires = index === 0 ? firstRequires : `sector_${map.replace("-", "_")}_${X_SECTOR_TIERS[index - 1][0]}`;
  return KQ(id, `${map} — ${label}`, desc.replace("{map}", map), objectives, requires);
});
const X_SECTOR_OPERATIONS = [
  ...[1, 2, 3].flatMap((faction) => Object.entries(X_SECTOR_SPAWNS).flatMap(([n, [commons, bosses, emperor]]) => {
    const map = `${faction}-${n}`;
    const first = Number(n) > 1 ? `sector_${faction}_${Number(n) - 1}_patrol` : null;
    return xSectorQuests(map, commons, bosses, emperor, first);
  })),
  ...xSectorQuests("4-5", ["npc_Boss_Mordon", "npc_Boss_Sibelon", "npc_Uber_Kristallin"], ["npc_Uber_Lordakium", "npc_Uber_Kristallon"], null, "dangerous_crossroads"),
  ...xSectorQuests("5-2", ["npc_Interceptor", "npc_Barracuda", "npc_Saboteur"], ["npc_Annihilator"], null, "pirate_entry"),
  ...["4-1", "4-2", "4-3", "4-4"].map((map, index, maps) =>
    KQ(`sector_${map.replace("-", "_")}_patrol`, `${map} — Patrouille`, `Patrouille la carte ${map} et élimine ses occupants.`,
      [V(map), xKill("c0", "npc_Explosif", 25, map)], index ? `sector_${maps[index - 1].replace("-", "_")}_patrol` : "dangerous_crossroads")),
];

// Chasses : trois paliers au-delà de "Carnage" (Massacre, Hécatombe, Apocalypse).
const X_HUNT_FAMILIES = [
  ["streuner", "npc_Streuner", 12, "hard_streuner"], ["lordakia", "npc_Lordakia", 15, "hard_lordakia"],
  ["saimon", "npc_Saimon", 18, "hard_saimon"], ["mordon", "npc_Mordon", 15, "hard_mordon"],
  ["devolarium", "npc_Devolarium", 8, "hard_devolarium"], ["sibelonit", "npc_Sibelonit", 20, "hard_sibelonit"],
  ["sibelon", "npc_Sibelon", 10, "hard_sibelon"], ["lordakium", "npc_Lordakium", 8, "hard_lordakium"],
  ["kristallin", "npc_Kristallin", 25, "hard_kristallin"], ["kristallon", "npc_Kristallon", 6, "hard_kristallon"],
  ["protegit", "npc_Protegit", 30, "hard_protegit"], ["interceptor", "npc_Interceptor", 15, "hard_interceptor"],
  ["barracuda", "npc_Barracuda", 10, "hard_barracuda"], ["saboteur", "npc_Saboteur", 8, "hard_saboteur"],
  ["annihilator", "npc_Annihilator", 5, "hard_annihilator"], ["streuner8", "npc_StreuneR8", 15, null],
  ["blighted_kristallin", "npc_Blighted_Kristallin", 15, null], ["blighted_kristallon", "npc_Blighted_Kristallon", 10, null],
];
const X_HUNT_TIERS = [["massacre", "Massacre", 25], ["hecatomb", "Hécatombe", 60], ["apocalypse", "Apocalypse", 150]];
const X_HUNTS = X_HUNT_FAMILIES.flatMap(([id, type, base, firstRequires]) => X_HUNT_TIERS.map(([tier, prefix, scale], index) => {
  const name = xPlural(xName(type));
  return KQ(`${tier}_${id}`, `${prefix} ${xName(type)}`, `Contrat de chasse intensif contre les ${name}.`,
    [xKill(id, type, base * scale)], index ? `${X_HUNT_TIERS[index - 1][0]}_${id}` : firstRequires);
}));

// Séries élite : paliers 4 et 5 (+ série complète StreuneR8).
const X_ELITE_FAMILIES = ["streuner", "lordakia", "saimon", "mordon", "devolarium", "sibelonit", "sibelon", "lordakium", "kristallin", "kristallon"];
const xEliteTier = (id, name, bossType, uberType, step, requires) => {
  const amounts = { 1: [3, 0], 2: [15, 5], 3: [50, 25], 4: [120, 60], 5: [300, 150] }[step];
  const titles = { 1: "Meute", 2: "Boucherie", 3: "Génocide", 4: "Purge élite", 5: "Apothéose" };
  const descs = { 1: "Première étape de la série élite {0}.", 2: "Deuxième étape de la série élite {0}.", 3: "Troisième étape de la série élite {0}.", 4: "Quatrième étape de la série élite {0}.", 5: "Ultime étape de la série élite {0}." };
  const objectives = [xKill("boss", bossType, amounts[0])];
  if (amounts[1]) objectives.push(xKill("uber", uberType, amounts[1]));
  return KQ(`elite_${id}_${step}`, `${titles[step]} ${name}`, descs[step].replace("{0}", name), objectives, requires);
};
const X_ELITE = [
  ...X_ELITE_FAMILIES.flatMap((id) => {
    const name = id[0].toUpperCase() + id.slice(1);
    return [4, 5].map((step) => xEliteTier(id, name, `npc_Boss_${name}`, `npc_Uber_${name}`, step, `elite_${id}_${step - 1}`));
  }),
  ...[1, 2, 3, 4, 5].map((step) => xEliteTier("streuner8", "StreuneR8", "npc_Boss_StreuneR8", "npc_Uber_StreuneR8", step, step > 1 ? `elite_streuner8_${step - 1}` : null)),
];

// Collectes : quatre paliers par type de box.
const X_COLLECT_TYPES = [
  ["bonus", "Bonus_Box", "Bonus Boxes", [50, 300, 1500, 5000], 12000, null],
  ["cargo", "Cargo_Box", "Cargo Boxes", [50, 300, 1500, 5000], 20000, null],
  ["palladium", "Palladium_Ore", "Palladium", [100, 600, 3000, 10000], 24000, "5-2"],
  ["booty", "Green_Booty_Box", "Green Booty Boxes", [10, 50, 200, 600], 150000, null],
  ["alloy", "Hybrid_Alloy_Box", "Hybrid Alloy Boxes", [20, 100, 400, 1500], 120000, null],
  ["astral", "Astral_Prime_Box", "Astral Prime Boxes", [5, 25, 100, 400], 500000, "MAUDITE"],
];
const X_COLLECT_TIERS = ["Glaneur", "Récupérateur", "Pilleur", "Magnat"];
const X_COLLECTIONS = X_COLLECT_TYPES.flatMap(([id, type, label, amounts, unit, map]) => amounts.map((amount, index) => {
  const credits = Math.floor(amount * unit * (1 + index * 0.25) / 1000) * 1000;
  const objective = C("collect", type, amount, label === "Palladium" ? "Collecter du Palladium" : `Collecter des ${label}`, map);
  return Q(`collect_${id}_${index + 1}`, `${X_COLLECT_TIERS[index]} : ${label}`, `Contrat de collecte : rapporte ${formatXInt(amount)} ${label}.`,
    [objective], credits, Math.floor(credits * 0.5), Math.floor(credits * 0.002), index ? `collect_${id}_${index}` : null);
}));
function formatXInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

// Galaxy Gates : répétitions des roues isolées.
const X_GATE_BASE = { delta: 5000000, epsilon: 3000000, zeta: 4000000, kappa: 4500000, lambda: 2000000, kronos: 6000000 };
const X_GATE_STEPS = [["Marathon", 5, 1.6], ["Domination", 10, 2], ["Maîtrise", 25, 2.4]];
const X_GATES = Object.entries(X_GATE_BASE).flatMap(([gate, base]) => X_GATE_STEPS.map(([prefix, amount, mult], index) => {
  const name = gate[0].toUpperCase() + gate.slice(1);
  const credits = Math.floor(base * amount * mult);
  return Q(`gate_${gate}_repeat_${amount}`, `${prefix} ${name}`, `Termine ${amount} fois la Galaxy Gate ${name}.`, [G(gate, amount)],
    credits, Math.round(credits * 0.35), Math.round(credits * 0.0015), index ? `gate_${gate}_repeat_${X_GATE_STEPS[index - 1][1]}` : `gate_${gate}_veteran`);
}));

// Campagnes de firme : 20 chapitres par firme, de la base jusqu'aux secteurs 8,
// puis 4-5, 5-2, les Cubikons et les Gates.
const X_FACTIONS = [[1, "MMO"], [2, "EIC"], [3, "VRU"]];
const X_CAMPAIGNS = X_FACTIONS.flatMap(([faction, firm]) => Array.from({ length: 20 }, (_, index) => {
  const chapter = index + 1;
  let objectives;
  if (chapter <= 16) {
    const n = Math.ceil(chapter / 2);
    const map = `${faction}-${n}`;
    const [commons, bosses] = X_SECTOR_SPAWNS[n];
    const scale = 1 + Math.floor(index / 4);
    objectives = chapter % 2
      ? [xKill("c0", commons[0], 30 * scale, map), xKill("c1", commons[1] || commons[0], 15 * scale, map), C("bonus", "Bonus_Box", 10 * scale, "Collecter des Bonus Boxes", map)]
      : [xKill("b0", bosses[0], 3 * scale, map), xKill("c2", commons[commons.length - 1], 20 * scale, map), C("cargo", "Cargo_Box", 10 * scale, "Collecter des Cargo Boxes", map)];
  } else if (chapter === 17) {
    objectives = [V("4-5"), xKill("boss", "npc_Boss_Kristallon", 20, "4-5"), xKill("uber", "npc_Uber_Kristallon", 10, "4-5")];
  } else if (chapter === 18) {
    objectives = [V("5-2"), xKill("interceptor", "npc_Interceptor", 150, "5-2"), C("palladium", "Palladium_Ore", 200, "Collecter du Palladium", "5-2")];
  } else if (chapter === 19) {
    objectives = [xKill("cubikon", "npc_Cubikon", 15, `${faction}-6`), xKill("protegit", "npc_Protegit", 300, `${faction}-6`)];
  } else {
    objectives = [G("alpha"), G("beta"), G("gamma"), xKill("emperor", `npc_Emperor_Kristallon`, 1)];
  }
  const id = `campaign_${firm.toLowerCase()}_${String(chapter).padStart(2, "0")}`;
  const requires = chapter > 1 ? `campaign_${firm.toLowerCase()}_${String(chapter - 1).padStart(2, "0")}` : `firme_${firm.toLowerCase()}_08`;
  return KQ(id, `${firm} — Chapitre ${chapter}`, `Campagne ${firm}, chapitre ${chapter}.`, objectives, requires, { credits: chapter * 400000, exp: chapter * 200000, honor: chapter * 800 });
}));

// Contrats spéciaux à paliers.
const xTiers = (prefix, ids, build) => ids.map((value, index) => build(value, index, `${prefix} ${X_ROMAN[index]}`));
const X_SPECIALS = [
  ...["Sibelon", "Lordakium", "Kristallon"].flatMap((name) => xTiers(`Chute de l'Empereur ${name}`, [5, 15, 40], (amount, index, title) =>
    KQ(`emperor_${name.toLowerCase()}_${index + 1}`, title, `Abats ${amount} fois l'Empereur ${name}.`, [xKill("emperor", `npc_Emperor_${name}`, amount)],
      index ? `emperor_${name.toLowerCase()}_${index}` : "emperor_protocol", { credits: amount * 4000000, exp: amount * 2000000, honor: amount * 8000 }))),
  ...xTiers("Brise-cœur", [25, 75, 200, 500], (amount, index, title) =>
    KQ(`heartbreaker_${index + 1}`, title, "Détruis des Cubikons et leur garde de Protegits.", [xKill("cubikon", "npc_Cubikon", amount), xKill("protegit", "npc_Protegit", amount * 20)],
      index ? `heartbreaker_${index}` : "cubikon_campaign")),
  ...xTiers("Champ de mines", [50, 200, 600, 1500], (amount, index, title) =>
    KQ(`minefield_${index + 1}`, title, "Élimine les Kamikazes des secteurs 4-1 à 4-4.", [xKill("explosif", "npc_Explosif", amount, ["4-1", "4-2", "4-3", "4-4"])],
      index ? `minefield_${index}` : "sector_4_1_patrol")),
  ...xTiers("Carnage universel", [2500, 10000, 50000, 200000, 500000], (amount, index, title) =>
    KQ(`universal_carnage_${index + 1}`, title, "Élimine n'importe quels NPC, partout dans la galaxie.", [K("all_npcs", "*", amount, "Éliminer des NPC")],
      index ? `universal_carnage_${index}` : null)),
  ...xTiers("Quarantaine", [100, 400, 1500, 4000], (amount, index, title) =>
    KQ(`quarantine_${index + 1}`, title, "Endigue la contagion des Blighted.", [xKill("gyger", "npc_Blighted_Gygerthrall", amount), xKill("blighted_kristallin", "npc_Blighted_Kristallin", amount / 2), xKill("blighted_kristallon", "npc_Blighted_Kristallon", amount / 2)],
      index ? `quarantine_${index}` : "blighted_sample")),
  ...xTiers("Terreur des pirates", [10, 30, 80], (amount, index, title) =>
    KQ(`pirate_terror_${index + 1}`, title, "Abats les Ubers pirates de 5-2.", ["npc_Uber_Interceptor", "npc_Uber_Barracuda", "npc_Uber_Saboteur", "npc_Uber_Annihilator"].map((type, i) => xKill(`u${i}`, type, amount, "5-2")),
      index ? `pirate_terror_${index}` : "pirate52_08")),
  ...xTiers("Garde rapprochée", [10, 50], (amount, index, title) =>
    KQ(`bodyguard_${index + 1}`, title, "Élimine les Protecteurs Streuner des cartes de départ.", [K("protector", "npc_Boss_Streuner_Recruit", amount, "Éliminer des Protecteurs Streuner")],
      index ? `bodyguard_${index}` : null)),
];

// Grands tours de la galaxie (visites).
const X_TOURS = [
  ["tour_mmo", "Tour complet MMO", ["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8"], 2000000, null],
  ["tour_eic", "Tour complet EIC", ["2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8"], 2000000, null],
  ["tour_vru", "Tour complet VRU", ["3-1", "3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-8"], 2000000, null],
  ["tour_war", "Tour des zones de guerre", ["4-1", "4-2", "4-3", "4-4", "4-5", "5-2"], 4000000, "dangerous_crossroads"],
  ["tour_capitals", "Tour des trois capitales", ["1-1", "2-1", "3-1", "1-8", "2-8", "3-8"], 3000000, "upper_tour"],
  ["tour_grand", "Le grand tour", ["1-1", "1-2", "1-3", "1-4", "1-5", "1-6", "1-7", "1-8", "2-1", "2-2", "2-3", "2-4", "2-5", "2-6", "2-7", "2-8", "3-1", "3-2", "3-3", "3-4", "3-5", "3-6", "3-7", "3-8", "4-1", "4-2", "4-3", "4-4", "4-5", "5-2"], 15000000, "tour_war"],
].map(([id, title, maps, credits, requires]) => Q(id, title, "Visite chaque carte indiquée.", maps.map(V), credits, Math.floor(credits * 0.5), Math.floor(credits * 0.002), requires));

const EXTENSION_300 = [
  ...X_SECTOR_OPERATIONS,
  ...X_HUNTS,
  ...X_ELITE,
  ...X_COLLECTIONS,
  ...X_GATES,
  ...X_CAMPAIGNS,
  ...X_SPECIALS,
  ...X_TOURS,
];

// ---------------------------------------------------------------------------
// Défis loufoques : aucune mission requise, contraintes vérifiées au kill
// (questChallengeMet). Faisabilité (stats NPC_TYPES, portée joueur 700 vs
// 500 des NPC) : les contraintes "sans bouger" ne visent que des NPC
// tankables, les vaisseaux faibles visent des NPC lents qu'on peut kiter,
// les Empereurs solo restent possibles en kitant (vitesse 100).
//   cond.solo       : pas de groupe et kill personnel
//   cond.config     : config 1 ou 2 active
//   cond.ship       : famille de vaisseau ("phoenix_bleu", "liberator"...)
//   cond.laser      : tous les lasers montés sont de ce modèle
//   cond.maxLasers  : au plus N lasers montés
//   cond.ammo       : la cible n'a reçu que cette munition
//   cond.stayed     : aucun déplacement depuis le premier tir sur la cible
//   cond.hullIntact : aucune perte de coque depuis le premier tir
// ---------------------------------------------------------------------------
const CK = (id, type, amount, label, cond, map) => ({ ...K(id, type, amount, label, map), cond });
const CHALLENGE_CONTRACTS = [
  KQ("challenge_duel_sibelon", "Duel impérial", "L'Empereur Sibelon, toi, et personne d'autre.",
    [CK("emperor", "npc_Emperor_Sibelon", 1, "Éliminer le Emperor Sibelon", { solo: true })], null, { credits: 150000000, exp: 75000000, honor: 300000 }),
  KQ("challenge_throne_lordakium", "Seul contre le trône", "Abats l'Empereur Lordakium en solo, sur ta configuration de secours.",
    [CK("emperor", "npc_Emperor_Lordakium", 1, "Éliminer le Emperor Lordakium", { solo: true, config: 2 })], null, { credits: 250000000, exp: 125000000, honor: 500000 }),
  KQ("challenge_crystal_kristallon", "Le cristal ne pardonne pas", "L'Empereur Kristallon en tête-à-tête. Prévois du café.",
    [CK("emperor", "npc_Emperor_Kristallon", 1, "Éliminer le Emperor Kristallon", { solo: true })], null, { credits: 500000000, exp: 250000000, honor: 1000000 }),
  KQ("challenge_war_economy", "Économie de guerre", "Un Empereur, en solo, avec les munitions de base. Rien d'autre.",
    [CK("emperor", "npc_Emperor_Sibelon", 1, "Éliminer le Emperor Sibelon", { solo: true, ammo: "x1" })], null, { credits: 600000000, exp: 300000000, honor: 1200000 }),
  KQ("challenge_stake", "Planté comme un piquet", "Abats des Kristallons sans bouger d'un pouce dès le premier tir.",
    [CK("kristallon", "npc_Kristallon", 10, "Éliminer des Kristallons", { stayed: true })], null, { credits: 40000000, exp: 20000000, honor: 80000 }),
  KQ("challenge_salt_statue", "Statue de sel", "Des Boss Mordons, en solo, sans jamais bouger pendant le combat.",
    [CK("boss_mordon", "npc_Boss_Mordon", 25, "Éliminer des Boss Mordons", { solo: true, stayed: true })], null, { credits: 20000000, exp: 10000000, honor: 40000 }),
  KQ("challenge_human_turret", "Tourelle humaine", "Encaisse les Boss Kristallins sans bouger. Ton bouclier va souffrir.",
    [CK("boss_kristallin", "npc_Boss_Kristallin", 5, "Éliminer des Boss Kristallins", { stayed: true })], null, { credits: 45000000, exp: 22500000, honor: 90000 }),
  KQ("challenge_still_shooter", "Tireur immobile", "Abats des Kamikazes sans bouger : vise vite ou saute avec eux.",
    [CK("kamikaze", "npc_Explosif", 30, "Éliminer des Kamikazes", { stayed: true }, ["4-1", "4-2", "4-3", "4-4"])], null, { credits: 25000000, exp: 12500000, honor: 50000 }),
  KQ("challenge_retro", "Rétro-gaming", "Des Boss Mordons avec uniquement des lasers LF-1 montés.",
    [CK("boss_mordon", "npc_Boss_Mordon", 15, "Éliminer des Boss Mordons", { laser: "laser_lf1" })], null, { credits: 30000000, exp: 15000000, honor: 60000 }),
  KQ("challenge_old_school_cube", "Cubikon à l'ancienne", "Un Cubikon, en solo, avec uniquement des lasers LF-1.",
    [CK("cubikon", "npc_Cubikon", 1, "Détruire le Cubikon", { solo: true, laser: "laser_lf1" })], null, { credits: 80000000, exp: 40000000, honor: 160000 }),
  KQ("challenge_phoenix_giant", "Le Phoenix et le géant", "Un Sibelon abattu avec le Phoenix Bleu. Courage.",
    [CK("sibelon", "npc_Sibelon", 1, "Éliminer le Sibelon", { ship: "phoenix_bleu" })], null, { credits: 35000000, exp: 17500000, honor: 70000 }),
  KQ("challenge_back_to_basics", "Retour aux sources", "Des Boss Streuners en Phoenix Bleu, munitions de base uniquement.",
    [CK("boss_streuner", "npc_Boss_Streuner", 20, "Éliminer des Boss Streuners", { ship: "phoenix_bleu", ammo: "x1" })], null, { credits: 15000000, exp: 7500000, honor: 30000 }),
  KQ("challenge_single_cannon", "Un seul canon", "Des Kristallins avec un seul laser monté sur ton vaisseau.",
    [CK("kristallin", "npc_Kristallin", 10, "Éliminer des Kristallins", { maxLasers: 1 })], null, { credits: 25000000, exp: 12500000, honor: 50000 }),
  KQ("challenge_damp_squib", "Pétard mouillé", "Des Boss Devolariums avec les munitions de base uniquement.",
    [CK("boss_devolarium", "npc_Boss_Devolarium", 3, "Éliminer des Boss Devolariums", { ammo: "x1" })], null, { credits: 30000000, exp: 15000000, honor: 60000 }),
  KQ("challenge_no_scratch", "Sans une égratignure", "Des Boss Sibelonits sans perdre un seul point de coque.",
    [CK("boss_sibelonit", "npc_Boss_Sibelonit", 10, "Éliminer des Boss Sibelonits", { hullIntact: true })], null, { credits: 35000000, exp: 17500000, honor: 70000 }),
  KQ("challenge_backup_config", "Config de secours", "Des Uber Mordons en solo, sur ta configuration 2.",
    [CK("uber_mordon", "npc_Uber_Mordon", 20, "Éliminer des Uber Mordons", { solo: true, config: 2 }, "4-5")], null, { credits: 30000000, exp: 15000000, honor: 60000 }),
  KQ("challenge_stubborn_liberator", "Libérateur têtu", "Des Lordakiums abattus en Liberator.",
    [CK("lordakium", "npc_Lordakium", 5, "Éliminer des Lordakiums", { ship: "liberator" })], null, { credits: 30000000, exp: 15000000, honor: 60000 }),
  KQ("challenge_sober_still", "Immobile et sobre", "Des StreuneR8 sans bouger, munitions de base uniquement.",
    [CK("r8", "npc_StreuneR8", 30, "Éliminer des StreuneR8", { stayed: true, ammo: "x1" })], null, { credits: 25000000, exp: 12500000, honor: 50000 }),
  KQ("challenge_untouchable", "Intouchable", "Un Boss Kristallon en solo sans perdre un point de coque.",
    [CK("boss_kristallon", "npc_Boss_Kristallon", 1, "Éliminer le Boss Kristallon", { solo: true, hullIntact: true })], null, { credits: 60000000, exp: 30000000, honor: 120000 }),
  KQ("challenge_minimalist", "Minimaliste", "Des Boss Saimons avec un seul laser et les munitions de base.",
    [CK("boss_saimon", "npc_Boss_Saimon", 3, "Éliminer des Boss Saimons", { maxLasers: 1, ammo: "x1" })], null, { credits: 20000000, exp: 10000000, honor: 40000 }),
];

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
  Q("gate_delta", "Gueule Delta", "Termine la Galaxy Gate Delta (roue isolée, 128 pièces, 10 vagues).", [G("delta")], 5000000, 1750000, 5000, "gate_gamma"),
  Q("gate_tetrad", "Tétrade de feu", "Achève les quatre Gates : Alpha, Beta, Gamma et Delta.", [G("alpha"), G("beta"), G("gamma"), G("delta")], 14000000, 4900000, 14000, "gate_delta"),
  Q("gate_delta_veteran", "Vétéran Delta", "Répète la Galaxy Gate Delta jusqu’à la maîtriser.", [G("delta", 3)], 30000000, 10500000, 30000, "gate_tetrad"),
  Q("gate_epsilon", "Gueule Epsilon", "Termine la Galaxy Gate Epsilon (roue isolée, 99 pièces, 11 vagues pirates).", [G("epsilon")], 3000000, 1050000, 3000, "gate_delta"),
  Q("gate_pentad", "Pentade de feu", "Achève les cinq Gates : Alpha, Beta, Gamma, Delta et Epsilon.", [G("alpha"), G("beta"), G("gamma"), G("delta"), G("epsilon")], 18000000, 6300000, 18000, "gate_epsilon"),
  Q("gate_epsilon_veteran", "Vétéran Epsilon", "Répète la Galaxy Gate Epsilon jusqu’à la maîtriser.", [G("epsilon", 3)], 20000000, 7000000, 20000, "gate_pentad"),
  Q("gate_zeta", "Gueule Zeta", "Termine la Galaxy Gate Zeta (roue isolée, 111 pièces, finale Devourer à paliers).", [G("zeta")], 4000000, 1400000, 4000, "gate_epsilon"),
  Q("gate_hexad", "Hexade de feu", "Achève les six Gates : Alpha, Beta, Gamma, Delta, Epsilon et Zeta.", [G("alpha"), G("beta"), G("gamma"), G("delta"), G("epsilon"), G("zeta")], 22000000, 7700000, 22000, "gate_zeta"),
  Q("gate_zeta_veteran", "Vétéran Zeta", "Répète la Galaxy Gate Zeta jusqu’à la maîtriser.", [G("zeta", 3)], 25000000, 8750000, 25000, "gate_hexad"),
  Q("gate_kappa", "Gueule Kappa", "Termine la Galaxy Gate Kappa (roue isolée, 120 pièces, 11 vagues mixtes).", [G("kappa")], 4500000, 1575000, 4500, "gate_zeta"),
  Q("gate_heptad", "Heptade de feu", "Achève les sept Gates : Alpha, Beta, Gamma, Delta, Epsilon, Zeta et Kappa.", [G("alpha"), G("beta"), G("gamma"), G("delta"), G("epsilon"), G("zeta"), G("kappa")], 26000000, 9100000, 26000, "gate_kappa"),
  Q("gate_kappa_veteran", "Vétéran Kappa", "Répète la Galaxy Gate Kappa jusqu’à la maîtriser.", [G("kappa", 3)], 30000000, 10500000, 30000, "gate_heptad"),
  Q("gate_lambda", "Gueule Lambda", "Termine la Galaxy Gate Lambda (roue isolée, 45 pièces, 7 vagues de Boss).", [G("lambda")], 2000000, 700000, 2000, "gate_kappa"),
  Q("gate_octad", "Octade de feu", "Achève les huit Gates : Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Kappa et Lambda.", [G("alpha"), G("beta"), G("gamma"), G("delta"), G("epsilon"), G("zeta"), G("kappa"), G("lambda")], 30000000, 10500000, 30000, "gate_lambda"),
  Q("gate_lambda_veteran", "Vétéran Lambda", "Répète la Galaxy Gate Lambda jusqu’à la maîtriser.", [G("lambda", 3)], 15000000, 5250000, 15000, "gate_octad"),
  Q("gate_kronos", "Couronne Kronos", "Termine la Galaxy Gate Kronos, forgée par les huit autres Gates (21 pièces, 13 vagues Saturn).", [G("kronos")], 6000000, 2100000, 6000, "gate_lambda"),
  Q("gate_couronne", "Couronne des neuf", "Achève les neuf Gates : Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Kappa, Lambda et Kronos.", [G("alpha"), G("beta"), G("gamma"), G("delta"), G("epsilon"), G("zeta"), G("kappa"), G("lambda"), G("kronos")], 36000000, 12600000, 36000, "gate_kronos"),
  Q("gate_kronos_veteran", "Vétéran Kronos", "Répète la Galaxy Gate Kronos jusqu’à la maîtriser.", [G("kronos", 3)], 40000000, 14000000, 40000, "gate_couronne"),

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
  ...BLACKLIGHT_CHAIN,
  ...SUPPLY_CONTRACTS,
  ...LEGENDARY_KILL_CONTRACTS,
  ...FIRME_PATROLS,
  ...UBER_45_CAMPAIGN,
  ...CRYSTAL_R8_EXPEDITION,
  ...PIRATE_52_OPERATIONS,
  ...SALVAGE_GATE_OPERATIONS,
  ...ANCIENT_CURSED_EXTENSION,
  ...EXTERMINATION_1000,
  ...EXTENSION_300,
  ...CHALLENGE_CONTRACTS,
];

const FINAL_QUEST = {
  ...CEQ("ultimate_all_missions", "La dernière marche", "Après avoir accompli toutes les missions du jeu, élimine simplement un Streuner.", [K("last_streuner", "npc_Streuner", 1, "Éliminer un Streuner")], 10000000000, 10000000000, 60000000, { x4: 500000, x6: 50000, sab: 250000 }, 500),
  requiresAll: QUEST_CATALOG.map(quest => quest.id),
};

// Titres offerts en récompense de quête (débloqués à la validation).
// La condition req.quest reste le garde-fou (re-déblocage auto au chargement).
const QUEST_TITLE_REWARDS = Object.freeze({
  cadet_contact: ["bleu"],
  cadet_saimon: ["cadet"],
  cadet_devolarium: ["sergent"],
  hard_streuner: ["nettoyeur"],
  low_mix: ["pisteur"],
  low_bosses: ["decapiteur"],
  collector_route: ["convoyeur"],
  upper_tour: ["cartographe"],
  pirate_entry: ["flibustier"],
  pirate_elite: ["nemesis_pirate"],
  blighted_sample: ["echantillonneur"],
  blighted_epidemic: ["endigueur"],
  boss_extermination: ["chasseur_couronnes"],
  emperor_protocol: ["regicide"],
  extreme_streuner: ["raz_de_maree"],
  pirate_battleray_25: ["chasseur_pirates"],
  boxes_hard: ["roi_boites"],
  gate_kappa: ["all_star"],
  gate_lambda: ["big_boss"],
  elite_cube_3500: ["tueur_cubikons"],
  pirate_saboteur_17500: ["destructeur_saboteurs"],
  elite_annihilator_10500: ["pourfendeur_annihilators"],
  extreme_crystal: ["cristal_cendres"],
  extreme_cube: ["briseur_mondes"],
  cubikon_siege: ["briseur_cubikon"],
  uber_ice: ["fleau_uber"],
  cursed_legend: ["maudit"],
  legend_million_npcs: ["mythe"],
  gate_alpha: ["porte_alpha"],
  gate_beta: ["porte_beta"],
  gate_gamma: ["porte_gamma"],
  gate_delta: ["porte_delta"],
  gate_couronne: ["seigneur_9_galaxies"],
  galactic_legend: ["legende"],
  ultimate_all_missions: ["derniere_marche"],
  bl_01: ["initie_bl"],
  bl_10: ["explorateur_bl"],
  bl_25: ["tueur_mindfire"],
  bl_35: ["seigneur_bl"],
  bl_60: ["zenith_bl"],
});

function withTitleRewards(quest) {
  const titles = QUEST_TITLE_REWARDS[quest?.id];
  if (!titles) return quest;
  return { ...quest, reward: { ...(quest.reward || {}), titles: [...titles] } };
}

export const QUEST_DEFINITIONS = Object.freeze([...QUEST_CATALOG.map(withTitleRewards), withTitleRewards(FINAL_QUEST)]);

// ---------------------------------------------------------------------------
// Fabricateur de quêtes (onglet du terminal).
// Le pilote compose UN contrat à la fois : cible, quantité, carte, contraintes
// de défi et mise. Un nouveau contrat n'est possible que 24 h après la
// création du précédent (abandon compris). Récompense = calcul standard des
// quêtes kill × multiplicateur des contraintes (plafonné). La mise est
// rendue × ce multiplicateur en cas de réussite, perdue en cas d'abandon ;
// elle n'est jamais doublée par les boosters de quête.
// ---------------------------------------------------------------------------
export const FORGE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const FORGE_MAX_AMOUNT = 5000;
export const FORGE_MAX_STAKE = 100000000;
// Frais = 20 % de la récompense (minimum 5 000) : un petit contrat coûte
// peu, un gros coûte cher. Pas de forfait d'aventure (250 000) pour les
// contrats fabriqués : 1 Streuner ne doit pas rapporter une fortune.
export const FORGE_FEE_RATE = 0.2;
export const FORGE_FEE_MIN = 5000;
export const FORGE_MAX_MULT = 4;
export const FORGE_CONDITIONS = Object.freeze([
  Object.freeze({ id: "solo", label: "En solo", mult: 1.25, cond: { solo: true } }),
  Object.freeze({ id: "config1", label: "Config 1", mult: 1.1, cond: { config: 1 }, excludes: "config2" }),
  Object.freeze({ id: "config2", label: "Config 2", mult: 1.1, cond: { config: 2 }, excludes: "config1" }),
  Object.freeze({ id: "lf1", label: "Lasers LF-1 uniquement", mult: 1.5, cond: { laser: "laser_lf1" } }),
  Object.freeze({ id: "onelaser", label: "1 laser maximum", mult: 1.4, cond: { maxLasers: 1 } }),
  Object.freeze({ id: "x1", label: "Munitions LCB-10 uniquement", mult: 1.5, cond: { ammo: "x1" } }),
  Object.freeze({ id: "stayed", label: "Sans bouger", mult: 1.4, cond: { stayed: true } }),
  Object.freeze({ id: "hull", label: "Sans perte de coque", mult: 1.6, cond: { hullIntact: true } }),
]);
const FORGE_CONDITION_BY_ID = new Map(FORGE_CONDITIONS.map(c => [c.id, c]));
// Titres générés ({0} = cible au pluriel). Le pilote peut renommer.
export const FORGE_TITLE_TEMPLATES = Object.freeze([
  "Mauvaise journée pour les {0}",
  "Pas de quartier pour les {0}",
  "La revanche contre les {0}",
  "Les {0} n'ont qu'à bien se tenir",
  "Le grand ménage : {0}",
  "Rendez-vous galant avec des {0}",
  "Opération « Adieu {0} »",
  "Les {0} vont regretter",
]);
export const forgeTargetName = type => xName(type);
export function forgeGeneratedTitle(type, index = 0) {
  const templates = FORGE_TITLE_TEMPLATES;
  const i = ((Math.floor(Number(index) || 0) % templates.length) + templates.length) % templates.length;
  return templates[i].replace("{0}", xPlural(xName(type)));
}
const forgeInt = (value, min, max) => Math.max(min, Math.min(max, Math.floor(Number(value) || 0)));

export function sanitizeForgeSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = String(raw.type || "");
  if (!type.startsWith("npc_") || !NPC_REWARDS[type]) return null;
  const amount = forgeInt(raw.amount, 1, FORGE_MAX_AMOUNT);
  const map = raw.map ? String(raw.map).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 16) || null : null;
  const conds = [];
  for (const id of Array.isArray(raw.conds) ? raw.conds : []) {
    const def = FORGE_CONDITION_BY_ID.get(String(id));
    if (!def || conds.includes(def.id) || (def.excludes && conds.includes(def.excludes))) continue;
    conds.push(def.id);
  }
  const stake = forgeInt(raw.stake, 0, FORGE_MAX_STAKE);
  const title = String(raw.title || "").replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 48);
  const titleIdx = forgeInt(raw.titleIdx, 0, 999);
  return { type, amount, map, conds, stake, title, titleIdx };
}

// Aperçu / définition d'un contrat fabriqué (mêmes règles des deux côtés).
export function forgePreview(rawSpec) {
  const spec = sanitizeForgeSpec(rawSpec);
  if (!spec) return null;
  let cond = null;
  let mult = 1;
  for (const id of spec.conds) {
    const def = FORGE_CONDITION_BY_ID.get(id);
    cond = { ...(cond || {}), ...def.cond };
    mult *= def.mult;
  }
  mult = Math.min(FORGE_MAX_MULT, Math.round(mult * 100) / 100);
  const objective = { ...xKill("forge_kill", spec.type, spec.amount, spec.map || undefined), ...(cond ? { cond } : {}) };
  const raw = balancedKillReward([objective]);
  const base = {
    credits: Math.max(0, raw.credits - QUEST_FLAT_BONUS.credits),
    exp: Math.max(0, raw.exp - QUEST_FLAT_BONUS.exp),
    honor: Math.max(0, raw.honor - QUEST_FLAT_BONUS.honor),
  };
  // Mise plafonnée à 5x la récompense de base : parier gros exige un gros
  // contrat (sinon 1 Streuner + toutes les contraintes = rente quotidienne).
  const stakeCap = Math.min(FORGE_MAX_STAKE, Math.floor(base.credits * 5 / 100000) * 100000);
  spec.stake = Math.min(spec.stake, stakeCap);
  const reward = {
    credits: Math.floor(base.credits * mult / 1000) * 1000,
    exp: Math.floor(base.exp * mult / 1000) * 1000,
    honor: Math.floor(base.honor * mult / 100) * 100,
    ...(spec.stake > 0 ? { forgeStake: Math.floor(spec.stake * mult) } : {}),
  };
  const fee = Math.max(FORGE_FEE_MIN, Math.floor(reward.credits * FORGE_FEE_RATE / 1000) * 1000);
  return { spec, objective, reward, mult, stakeCap, fee, cost: fee + spec.stake, title: spec.title || forgeGeneratedTitle(spec.type, spec.titleIdx) };
}

function normalizeForgeState(raw) {
  const seq = forgeInt(raw?.seq, 0, 1e9);
  const cooldownUntil = Math.max(0, Math.floor(Number(raw?.cooldownUntil) || 0));
  let status = ["active", "done", "abandoned"].includes(raw?.status) ? raw.status : "none";
  const spec = sanitizeForgeSpec(raw?.spec);
  if (status === "active" && !spec) status = "none";
  return { seq, status, spec: status === "none" ? null : spec, cooldownUntil };
}
const FORGE_STATUS_RANK = { none: 0, active: 1, done: 2, abandoned: 2 };
// Fusion de deux sauvegardes : le contrat le plus récent gagne ; à contrat
// égal, une fin (rendu/abandon) bat "actif" (jamais de résurrection).
export function mergeForgeState(a, b) {
  const x = normalizeForgeState(a), y = normalizeForgeState(b);
  const pick = x.seq !== y.seq ? (x.seq > y.seq ? x : y) : (FORGE_STATUS_RANK[y.status] > FORGE_STATUS_RANK[x.status] ? y : x);
  return { ...pick, cooldownUntil: Math.max(x.cooldownUntil, y.cooldownUntil) };
}

function buildForgeDefinition(forge) {
  if (!forge || forge.status !== "active" || !forge.spec) return null;
  const preview = forgePreview(forge.spec);
  if (!preview) return null;
  const stake = preview.spec.stake;
  return {
    id: `forge_${forge.seq}`,
    forged: true,
    title: preview.title,
    description: stake > 0 ? `Contrat fabriqué au terminal. Mise engagée : ${formatXInt(stake)} crédits.` : "Contrat fabriqué au terminal.",
    objectives: [preview.objective],
    reward: preview.reward,
  };
}
let forgeDefinitionCache = { key: "", def: null };
export function getForgeQuest(state) {
  const forge = state?.forge;
  if (!forge || forge.status !== "active") return null;
  const key = JSON.stringify(forge);
  if (forgeDefinitionCache.key !== key) forgeDefinitionCache = { key, def: buildForgeDefinition(forge) };
  return forgeDefinitionCache.def;
}
const QUEST_BY_ID = new Map(QUEST_DEFINITIONS.map(q => [q.id, q]));
export function findQuestDefinition(id, state) {
  const known = QUEST_BY_ID.get(id);
  if (known) return known;
  const forged = getForgeQuest(state);
  return forged && forged.id === id ? forged : null;
}
const questDefinitionsFor = state => {
  const forged = getForgeQuest(state);
  return forged ? [...QUEST_DEFINITIONS, forged] : QUEST_DEFINITIONS;
};
// Raison du refus, ou null si un contrat peut être créé maintenant.
export function getForgeBlock(state, now = Date.now()) {
  const forge = state?.forge;
  if (forge?.status === "active") return "active";
  if (Number(forge?.cooldownUntil || 0) > now) return "cooldown";
  if (Object.keys(state?.active || {}).length >= MAX_ACTIVE_QUESTS) return "full";
  return null;
}
export function createForgeQuest(state, rawSpec, now = Date.now()) {
  if (getForgeBlock(state, now)) return null;
  const preview = forgePreview(rawSpec);
  if (!preview) return null;
  const seq = forgeInt(state.forge?.seq, 0, 1e9) + 1;
  state.forge = { seq, status: "active", spec: preview.spec, cooldownUntil: now + FORGE_COOLDOWN_MS };
  const quest = getForgeQuest(state);
  state.active[quest.id] = { forge_kill: 0 };
  return quest;
}

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

// Niveau requis = niveau de la map la plus exigeante des objectifs.
// - visit/kill/collect avec map explicite : cette map.
// - visit/gate sans map : type = map (gates = niv. 1).
// - kill sans map : map la plus accessible où le NPC apparaît
//   (ex : un Uber qui ne spawn qu'en 4-5 vaut niv. 12, pas 1).
// - collect sans map : même logique via la définition du collectable.
// Sans info : 1 (faisable partout).
const PIRATE_NPC_PATTERN = /interceptor|barracuda|saboteur|annihilator|marauder|vagrant|outcast|corsair|convict|hooligan|ravager|battleray|century_falcon/i;
const HIGH_MAP_NPC_PATTERN = /uber_|maudite|cubikon_maudite|protegit_maudite|astral/i;
function easiestMapLevel(maps, playerSector) {
  let best = null;
  for (const mapId of maps || []) {
    const id = String(mapId || "").trim();
    if (!id || /^gate\s/i.test(id)) continue; // Gates : accès par construction, pas par niveau
    try {
      // Secteur inconnu : niveau le plus favorable parmi les 3 firmes
      // (un Streuner en 1-2 vaut niv. 1 pour un MMO, pas 13).
      const lv = mapLevelFavoring(id, playerSector);
      best = best == null ? lv : Math.min(best, lv);
    } catch {}
  }
  return best;
}
function mapLevelFavoring(mapId, playerSector) {
  // Secteur inconnu : niveau le plus favorable parmi les 3 firmes
  // (un Streuner en 1-2 vaut niv. 1 pour un MMO, pas 13).
  if (playerSector != null) return getMapRequiredLevel(mapId, playerSector);
  return Math.min(getMapRequiredLevel(mapId, "1"), getMapRequiredLevel(mapId, "2"), getMapRequiredLevel(mapId, "3"));
}
function fallbackNpcLevel(type) {
  const name = String(type || "");
  if (HIGH_MAP_NPC_PATTERN.test(name) || PIRATE_NPC_PATTERN.test(name)) return 12;
  return 1;
}
export function getQuestRequiredLevel(quest, playerSector = null, context = {}) {
  const npcLocations = context?.npcLocations || null;
  const collectables = context?.collectables || null;
  let level = 1;
  for (const objective of getQuestObjectives(quest)) {
    const map = objective?.map
      || (objective?.kind === "visit" || objective?.kind === "gate" ? objective?.type : null);
    if (map) {
      try {
        level = Math.max(level, mapLevelFavoring(map, playerSector));
      } catch {}
      continue;
    }
    if (objective?.kind === "kill" && objective?.type && objective.type !== "*") {
      const maps = npcLocations?.[objective.type];
      if (Array.isArray(maps) && maps.length) {
        const easiest = easiestMapLevel(maps, playerSector);
        if (easiest != null) level = Math.max(level, easiest);
        else level = Math.max(level, fallbackNpcLevel(objective.type));
      } else {
        level = Math.max(level, fallbackNpcLevel(objective.type));
      }
      continue;
    }
    if (objective?.kind === "collect" && objective?.type) {
      const definition = collectables?.[objective.type];
      const maps = definition?.maps;
      if (maps === "*") continue; // disponible partout
      if (Array.isArray(maps) && maps.length) {
        const easiest = easiestMapLevel(maps, playerSector);
        if (easiest != null) level = Math.max(level, easiest);
      } else if (typeof maps === "string" && maps) {
        try {
          level = Math.max(level, mapLevelFavoring(maps, playerSector));
        } catch {}
      }
      continue;
    }
  }
  return Math.max(1, Math.floor(Number(level) || 1));
}

// Sections du terminal par tranches de niveaux (1-5, 6-10, 11-15, 16+).
export const QUEST_LEVEL_SECTIONS = Object.freeze([
  Object.freeze({ id: "1-5", min: 1, max: 5 }),
  Object.freeze({ id: "6-10", min: 6, max: 10 }),
  Object.freeze({ id: "11-15", min: 11, max: 15 }),
  Object.freeze({ id: "16+", min: 16, max: 99 }),
]);

export function questLevelSectionId(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return (QUEST_LEVEL_SECTIONS.find((s) => lv >= s.min && lv <= s.max) || QUEST_LEVEL_SECTIONS[0]).id;
}
export function isQuestComplete(state, quest) { const progress = state?.active?.[quest?.id]; return !!quest && progress != null && getQuestObjectives(quest).every(o => Number(progress[o.id] || 0) >= o.amount); }
export function normalizeQuestState(raw) {
  const active = {};
  const forge = normalizeForgeState(raw?.forge);
  for (const quest of questDefinitionsFor({ forge })) {
    if (Object.keys(active).length >= MAX_ACTIVE_QUESTS) break;
    const saved = raw?.active?.[quest.id] ?? (quest.forged ? {} : null); if (saved == null) continue;
    active[quest.id] = Object.fromEntries(getQuestObjectives(quest).map((o, i) => [o.id, Math.max(0, Math.min(o.amount, Math.floor(Number(typeof saved === "number" ? (i ? 0 : saved) : saved?.[o.id]) || 0)))]));
  }
  const valid = new Set(QUEST_DEFINITIONS.map(q => q.id));
  const completed = [...new Set(Array.isArray(raw?.completed) ? raw.completed : [])].filter(id => valid.has(id));
  // Tombstones d'abandon : survivent à la normalisation pour que les fusions
  // "max-gagnant" ne ressuscitent jamais une progression abandonnée.
  // Ni terminées ni actives : une quête reprise repart de zéro.
  const abandoned = {};
  if (raw?.abandoned && typeof raw.abandoned === "object") {
    for (const id of Object.keys(raw.abandoned)) {
      if (valid.has(id) && !completed.includes(id) && active[id] == null) abandoned[id] = 1;
    }
  }
  return { active, completed, abandoned, forge };
}
export function getQuestPrerequisiteIds(quest) {
  return [...new Set([...(quest?.requires ? [quest.requires] : []), ...(Array.isArray(quest?.requiresAll) ? quest.requiresAll : [])])];
}
export function canAcceptQuest(state, quest) { return !!quest && !state.completed.includes(quest.id) && state.active[quest.id] == null && Object.keys(state.active).length < MAX_ACTIVE_QUESTS && getQuestPrerequisiteIds(quest).every(id => state.completed.includes(id)); }
export function acceptQuest(state, questId) { const quest = QUEST_BY_ID.get(questId); if (!canAcceptQuest(state, quest)) return false; if (state.abandoned) delete state.abandoned[quest.id]; state.active[quest.id] = Object.fromEntries(getQuestObjectives(quest).map(o => [o.id, 0])); return true; }
// Contraintes d'un objectif "défi" (voir CHALLENGE_CONTRACTS). Sans
// contexte de combat (kill par drone seul, etc.) : refusé.
export function questChallengeMet(cond, ch) {
  if (!cond) return true;
  if (!ch) return false;
  if (cond.solo && !ch.solo) return false;
  if (cond.config && Number(ch.config) !== Number(cond.config)) return false;
  if (cond.ship) {
    const ship = String(ch.ship || "").toLowerCase();
    if (ship !== cond.ship && !ship.startsWith(`${cond.ship}_`)) return false;
  }
  const lasers = Array.isArray(ch.lasers) ? ch.lasers : [];
  if (cond.laser && (!lasers.length || lasers.some(id => id !== cond.laser))) return false;
  if (cond.maxLasers && (!lasers.length || lasers.length > cond.maxLasers)) return false;
  if (cond.ammo && (!Array.isArray(ch.ammo) || !ch.ammo.length || ch.ammo.some(a => a !== cond.ammo))) return false;
  if (cond.stayed && ch.stayed !== true) return false;
  if (cond.hullIntact && ch.hullIntact !== true) return false;
  return true;
}

export function recordQuestProgress(state, kind, type, amount = 1, context = {}) {
  const advanced = [];
  const sameId = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  for (const quest of questDefinitionsFor(state)) {
    if (state.active[quest.id] == null) continue;
    let changed = false;
    for (const o of getQuestObjectives(quest)) {
      if (o.kind !== kind) continue;
      // Les ids de map ("MAUDITE" vs "maudite", "1-1", "4-4"...) sont comparés
      // sans tenir compte de la casse : le moteur envoie parfois en minuscules.
      const typeMatches = kind === "visit" || kind === "gate"
        ? sameId(o.type, type)
        : (o.type === type || (kind === "kill" && o.type === "*")
          || (kind === "kill" && !o.map && o.type === "npc_Cubikon"
            && type === "npc_Cubikon_maudite"));
      if (!typeMatches) continue;
      // Filtre map : string unique ou liste (ex : les 3 maps BL).
      if (o.map) {
        const maps = Array.isArray(o.map) ? o.map : [o.map];
        if (!maps.some(candidate => sameId(candidate, context.map))) continue;
      }
      // Défis : contraintes vérifiées au moment du kill.
      if (o.cond && !questChallengeMet(o.cond, context.challenge)) continue;
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
export const recordQuestCraft = (state, recipeId, quantity = 1) => recordQuestProgress(state, "craft", recipeId, quantity, {});
export const recordQuestPvp = (state, context) => recordQuestProgress(state, "pvp", "pvp", 1, context);
export const recordQuestStay = (state, seconds, context) => recordQuestProgress(state, "stay", "bl", seconds, context);
export function abandonQuest(state, questId) { if (state.active[questId] == null) return false; delete state.active[questId]; if (String(questId).startsWith("forge_")) { if (state.forge && `forge_${state.forge.seq}` === questId) state.forge.status = "abandoned"; return true; } if (!state.abandoned || typeof state.abandoned !== "object") state.abandoned = {}; state.abandoned[questId] = 1; return true; }
export function claimQuest(state, questId) { const quest = findQuestDefinition(questId, state); if (!quest || state.completed.includes(questId) || !isQuestComplete(state, quest)) return null; delete state.active[questId]; if (quest.forged) { state.forge.status = "done"; return { ...quest.reward }; } if (state.abandoned) delete state.abandoned[questId]; state.completed.push(questId); return { ...quest.reward }; }
