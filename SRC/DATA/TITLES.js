"use strict";
// Titres de joueur : affichables sous le pseudo, visibles par tous.
// Déblocage via quêtes (reward.titles) ou objectifs (kills).
// Chaque titre : { id, name, desc, color, req }
// req: { type: "always" } | { type: "kills", count } | { type: "quest", questId } | { type: "gates", count }

// Rareté : commun (jaune pâle), utilitaire (jaune pâle, le vert est supprimé), dur (violet), légendaire (rouge).
export const TITLE_RARITIES = Object.freeze({
  commun: Object.freeze({ id: "commun", name: "Commun", color: "#ffe9a3" }),
  utilitaire: Object.freeze({ id: "utilitaire", name: "Utilitaire", color: "#ffe9a3" }),
  dur: Object.freeze({ id: "dur", name: "Dur", color: "#c77dff" }),
  legendaire: Object.freeze({ id: "legendaire", name: "Légendaire", color: "#ff5d5d" }),
});

export const TITLE_DEFINITIONS = Object.freeze([
  // --- Commun (jaune pâle) : débuts, patrouilles, premiers contrats ---
  Object.freeze({ id: "recrue", name: "Recrue", desc: "Tout pilote commence ici.", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "always" }) }),
  Object.freeze({ id: "joueur_beta", name: "Joueur de la Beta", desc: "Compte créé pendant la bêta.", color: "#A0662F", rarity: "commun", req: Object.freeze({ type: "beta" }) }),
  Object.freeze({ id: "bleu", name: "Né du vide", desc: "Terminer « Baptême du vide ».", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "quest", questId: "cadet_contact" }) }),
  Object.freeze({ id: "chasseur", name: "Prédateur", desc: "100 NPC détruits.", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "kills", count: 100 }) }),
  Object.freeze({ id: "cadet", name: "Chasseur d'ombres", desc: "Terminer « Chasse aux ombres ».", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "quest", questId: "cadet_saimon" }) }),
  Object.freeze({ id: "nettoyeur", name: "Nettoyeur", desc: "Terminer une chasse intensive aux Streuners.", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "quest", questId: "hard_streuner" }) }),
  Object.freeze({ id: "pisteur", name: "Purgeur", desc: "Terminer « Purge orbitale ».", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "quest", questId: "low_mix" }) }),
  Object.freeze({ id: "convoyeur", name: "Pillard", desc: "Terminer « La grande rafle ».", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "quest", questId: "collector_route" }) }),
  Object.freeze({ id: "initie_bl", name: "Initié Blacklight", desc: "Terminer « Délimitation » (BL-01).", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "quest", questId: "bl_01" }) }),
  // --- Utilitaire (vert) : campagnes, exploration, Gates courantes ---
  Object.freeze({ id: "rodeur", name: "Rôdeur", desc: "500 NPC détruits.", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "kills", count: 500 }) }),
  Object.freeze({ id: "veteran", name: "Vétéran", desc: "1 000 NPC détruits.", color: "#ffe9a3", rarity: "utilitaire", req: Object.freeze({ type: "kills", count: 1000 }) }),
  Object.freeze({ id: "sergent", name: "Brise-blindé", desc: "Terminer « Épreuve du blindé ».", color: TITLE_RARITIES.commun.color, rarity: "commun", req: Object.freeze({ type: "quest", questId: "cadet_devolarium" }) }),
  Object.freeze({ id: "decapiteur", name: "Décapiteur", desc: "Terminer « Décapitation ».", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "low_bosses" }) }),
  Object.freeze({ id: "cartographe", name: "Outremur", desc: "Terminer « Au-delà du mur ».", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "upper_tour" }) }),
  Object.freeze({ id: "flibustier", name: "Flibustier", desc: "Terminer « Enfer 5-2 ».", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "pirate_entry" }) }),
  Object.freeze({ id: "echantillonneur", name: "Disséqueur", desc: "Terminer « Prélèvements interdits ».", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "blighted_sample" }) }),
  Object.freeze({ id: "porte_alpha", name: "Conquérant Alpha", desc: "Terminer la Galaxy Gate Alpha.", color: "#ffe9a3", rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "gate_alpha" }) }),
  Object.freeze({ id: "porte_beta", name: "Conquérant Beta", desc: "Terminer la Galaxy Gate Beta.", color: "#ffe9a3", rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "gate_beta" }) }),
  Object.freeze({ id: "raz_de_maree", name: "Raz-de-marée", desc: "Terminer « Océan de débris ».", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "extreme_streuner" }) }),
  Object.freeze({ id: "explorateur_bl", name: "Abyssal", desc: "Terminer « Sous la surface » (BL-10).", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "bl_10" }) }),
  // --- Dur (violet) : élites, Ubers, grosses campagnes ---
  Object.freeze({ id: "elite", name: "Élite", desc: "10 000 NPC détruits.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "kills", count: 10000 }) }),
  Object.freeze({ id: "devastateur", name: "Dévastateur", desc: "25 000 NPC détruits.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "kills", count: 25000 }) }),
  Object.freeze({ id: "briseur_cubikon", name: "Briseur de Cubikon", desc: "Terminer « Siège du cœur ».", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "cubikon_siege" }) }),
  Object.freeze({ id: "fleau_uber", name: "Sanguinaire", desc: "Terminer « Âge de sang ».", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "uber_ice" }) }),
  Object.freeze({ id: "nemesis_pirate", name: "Némésis des pirates", desc: "Terminer « Gibier d'élite ».", color: TITLE_RARITIES.dur.color, rarity: "dur", req: Object.freeze({ type: "quest", questId: "pirate_elite" }) }),
  Object.freeze({ id: "endigueur", name: "Brasier", desc: "Terminer « Feu de contagion ».", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "blighted_epidemic" }) }),
  Object.freeze({ id: "chasseur_couronnes", name: "Chasseur de couronnes", desc: "Terminer « Têtes couronnées ».", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "boss_extermination" }) }),
  Object.freeze({ id: "chasseur_pirates", name: "Chasseur de pirates", desc: "Détruire 25 Deadly Battlerays.", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "pirate_battleray_25" }) }),
  Object.freeze({ id: "roi_boites", name: "Roi des boîtes", desc: "Contrat de collecte intensive.", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "quest", questId: "boxes_hard" }) }),
  Object.freeze({ id: "talent_naturel", name: "Talent naturel", desc: "Accomplir 50 missions.", color: "#ffe9a3", rarity: "utilitaire", req: Object.freeze({ type: "quests", count: 50 }) }),
  Object.freeze({ id: "admire", name: "Admiré", desc: "Récolter 450 000 points d'honneur.", color: "#ffe9a3", rarity: "utilitaire", req: Object.freeze({ type: "honor", count: 450000 }) }),
  Object.freeze({ id: "creditllionaire", name: "Créditllionaire", desc: "Posséder 7 500 000 crédits.", color: "#ffe9a3", rarity: "utilitaire", req: Object.freeze({ type: "credits", count: 7500000 }) }),
  Object.freeze({ id: "dompteur_rex", name: "Dompteur de P.E.T.", desc: "Atteindre le niveau 10 avec le P.E.T.", color: TITLE_RARITIES.utilitaire.color, rarity: "utilitaire", req: Object.freeze({ type: "pet", level: 10 }) }),
  Object.freeze({ id: "regicide", name: "Régicide", desc: "Terminer « Régicide ».", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "emperor_protocol" }) }),
  Object.freeze({ id: "cristal_cendres", name: "Cristal et cendres", desc: "Terminer « Cristal et cendres ».", color: TITLE_RARITIES.dur.color, rarity: "dur", req: Object.freeze({ type: "quest", questId: "extreme_crystal" }) }),
  Object.freeze({ id: "maudit", name: "Damné", desc: "Terminer « Légende maudite ».", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "cursed_legend" }) }),
  Object.freeze({ id: "porte_gamma", name: "Conquérant Gamma", desc: "Terminer la Galaxy Gate Gamma.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "gate_gamma" }) }),
  Object.freeze({ id: "porte_delta", name: "Conquérant Delta", desc: "Terminer la Galaxy Gate Delta.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "gate_delta" }) }),
  Object.freeze({ id: "tueur_mindfire", name: "Tueur de Mindfire", desc: "Terminer « Œil de Lynx, Cœur de pierre » (BL-25).", color: TITLE_RARITIES.dur.color, rarity: "dur", req: Object.freeze({ type: "quest", questId: "bl_25" }) }),
  Object.freeze({ id: "all_star", name: "All Star", desc: "Terminer le portail Kappa.", color: TITLE_RARITIES.dur.color, rarity: "dur", req: Object.freeze({ type: "quest", questId: "gate_kappa" }) }),
  Object.freeze({ id: "big_boss", name: "Big boss", desc: "Terminer le portail Lambda.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "quest", questId: "gate_lambda" }) }),
  Object.freeze({ id: "multi_expert", name: "Multi expert", desc: "Accomplir 100 missions.", color: TITLE_RARITIES.dur.color, rarity: "dur", req: Object.freeze({ type: "quests", count: 100 }) }),
  Object.freeze({ id: "transcendant", name: "Transcendant", desc: "Récolter 2 500 000 points d'honneur.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "honor", count: 2500000 }) }),
  Object.freeze({ id: "parrain", name: "Parrain", desc: "Récolter 100 000 000 points d'expérience.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "exp", count: 100000000 }) }),
  Object.freeze({ id: "cresus", name: "Crésus", desc: "Posséder 25 500 000 crédits.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "credits", count: 25500000 }) }),
  Object.freeze({ id: "expert", name: "Expert", desc: "Atteindre le niveau 15.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "level", level: 15 }) }),
  Object.freeze({ id: "commandeur_rex", name: "Commandeur de P.E.T.", desc: "Atteindre le niveau 15 avec le P.E.T.", color: "#ffe9a3", rarity: "dur", req: Object.freeze({ type: "pet", level: 15 }) }),
  // --- Légendaire (rouge) : exploits ultimes ---
  Object.freeze({ id: "apocalypse", name: "Apocalypse", desc: "100 000 NPC détruits.", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "kills", count: 100000 }) }),
  Object.freeze({ id: "exterminateur", name: "Exterminateur", desc: "Détruire 1 000 000 d'extra-terrestres.", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "kills", count: 1000000 }) }),
  Object.freeze({ id: "tueur_cubikons", name: "Tueur de Cubikons", desc: "Accomplir « Taquiner le cube » (3 500 Cubikons).", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "elite_cube_3500" }) }),
  Object.freeze({ id: "destructeur_saboteurs", name: "Destructeur de Saboteurs", desc: "Accomplir « Sabotage discret » (17 500 Saboteurs).", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "pirate_saboteur_17500" }) }),
  Object.freeze({ id: "pourfendeur_annihilators", name: "Pourfendeur d'Annihilators", desc: "Accomplir « Hymne à l'annihilation » (10 500 Annihilators).", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "elite_annihilator_10500" }) }),
  Object.freeze({ id: "illumine", name: "Illuminé", desc: "Récolter 10 000 000 000 points d'expérience.", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "exp", count: 10000000000 }) }),
  Object.freeze({ id: "officiel_legende", name: "Légende", desc: "Atteindre le niveau 25.", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "level", level: 25 }) }),
  Object.freeze({ id: "briseur_mondes", name: "Briseur de mondes", desc: "Terminer « Briseur de mondes ».", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "extreme_cube" }) }),
  Object.freeze({ id: "mythe", name: "Mythe", desc: "Un million de NPC détruits (contrat légendaire).", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "legend_million_npcs" }) }),
  Object.freeze({ id: "zenith_bl", name: "Zénith Blacklight", desc: "Terminer la chaîne Blacklight (BL-60).", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "bl_60" }) }),
  Object.freeze({ id: "seigneur_bl", name: "Seigneur Blacklight", desc: "Terminer la chaîne Blacklight intermédiaire (BL-35).", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "bl_35" }) }),
  Object.freeze({ id: "legende", name: "Légende vivante", desc: "Terminer « Légende vivante ».", color: TITLE_RARITIES.legendaire.color, rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "galactic_legend" }) }),
  Object.freeze({ id: "seigneur_9_galaxies", name: "Seigneur des 9 Galaxies", desc: "Terminer les 9 Galaxy Gates (Alpha à Kronos, hors Awakened).", color: "#ff69b4", rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "gate_couronne" }) }),
  Object.freeze({ id: "derniere_marche", name: "La dernière marche", desc: "Terminer « La dernière marche ».", color: "#5eead4", rarity: "legendaire", req: Object.freeze({ type: "quest", questId: "ultimate_all_missions" }) }),
]);

const BY_ID = new Map(TITLE_DEFINITIONS.map(t => [t.id, t]));

const COLOR_RANK = Object.freeze({ "#ffe9a3": 0, "#a0662f": 1, "#7dffa8": 1, "#c77dff": 2 });
const RARITY_RANK = Object.freeze({ commun: 0, utilitaire: 1, dur: 2, legendaire: 3 });

// Tri d'affichage : par couleur (jaunes, verts, violets, rouges), puis rareté, puis nom.
export function compareTitles(a, b) {
  const ca = COLOR_RANK[String(a?.color || "").toLowerCase()] ?? 3;
  const cb = COLOR_RANK[String(b?.color || "").toLowerCase()] ?? 3;
  if (ca !== cb) return ca - cb;
  const ra = RARITY_RANK[a?.rarity] ?? 9;
  const rb = RARITY_RANK[b?.rarity] ?? 9;
  if (ra !== rb) return ra - rb;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "fr");
}

export function getTitlesSorted() {
  return [...TITLE_DEFINITIONS].sort(compareTitles);
}

// Catalogue + cadeaux admin du joueur, triés pour la fenêtre.
export function getAllTitlesSorted(user) {
  const customs = getCustomTitles(user).map(c => ({
    id: c.id, name: c.name, desc: "Cadeau de l'admin",
    color: c.color, rarity: "cadeau", custom: true,
  }));
  return [...TITLE_DEFINITIONS, ...customs].sort(compareTitles);
}

export function getTitleById(id, user) {
  const key = String(id || "");
  if (!key) return null;
  // Titres cadeaux de l'admin (propres à chaque compte).
  try {
    const customs = user?.titles?.custom;
    if (Array.isArray(customs)) {
      const found = customs.find(c => String(c?.id) === key && String(c?.name || "").trim());
      if (found) {
        return {
          id: key,
          name: String(found.name).slice(0, 32),
          desc: "Cadeau de l'admin",
          color: sanitizeTitleColor(found.color),
          rarity: "cadeau",
          custom: true,
          req: Object.freeze({ type: "admin" }),
        };
      }
    }
  } catch {}
  return BY_ID.get(key) || null;
}

// Couleur hexadécimale valide ou blanc par défaut.
export function sanitizeTitleColor(color) {
  const c = String(color || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : "#ffffff";
}

// Titres cadeaux stockés sur le compte (écrits par l'admin).
export function getCustomTitles(user) {
  try {
    const customs = user?.titles?.custom;
    if (!Array.isArray(customs)) return [];
    const seen = new Set();
    const out = [];
    for (const c of customs) {
      const id = String(c?.id || "");
      const name = String(c?.name || "").replace(/\s+/g, " ").trim().slice(0, 32);
      if (!/^admin_[0-9a-f]{1,16}$/.test(id) || !name || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name, color: sanitizeTitleColor(c?.color) });
    }
    return out;
  } catch { return []; }
}

export function lifetimeKillsOf(user) {
  try {
    if (Number.isFinite(Number(user?.stats?.lifetimeKills))) return Math.max(0, Math.floor(Number(user.stats.lifetimeKills)));
    const kills = user?.stats?.npcKills;
    if (kills && typeof kills === "object") return Object.values(kills).reduce((t, n) => t + Math.max(0, Math.floor(Number(n) || 0)), 0);
  } catch {}
  return 0;
}

export function completedQuestsOf(user) {
  try {
    const c = user?.quests?.completed;
    if (Array.isArray(c)) return new Set(c.map(String));
  } catch {}
  return new Set();
}

function questsDoneCount(user) {
  try { return completedQuestsOf(user).size; } catch { return 0; }
}

function honorOf(user) {
  try { return Math.max(0, Math.floor(Number(user?.stats?.honor) || 0)); } catch { return 0; }
}

function expOf(user) {
  try { return Math.max(0, Math.floor(Number(user?.stats?.exp) || 0)); } catch { return 0; }
}

function creditsOf(user) {
  try { return Math.max(0, Math.floor(Number(user?.credits) || 0)); } catch { return 0; }
}

function petLevelOf(user) {
  try { return Math.max(0, Math.floor(Number(user?.pet?.level) || 0)); } catch { return 0; }
}

function playerLevelOf(user) {
  try {
    const exp = Math.max(0, Number(user?.stats?.exp) || 0);
    return exp < 10000 ? 1 : Math.floor(Math.log2(exp / 10000)) + 2;
  } catch { return 1; }
}

// Fin de la bêta (privée + publique) : passé cette date, les nouveaux
// comptes ne reçoivent plus le titre « Joueur de la Beta ».
export const BETA_TITLE_END = Date.UTC(2027, 11, 31, 23, 59, 59);

function createdAtOf(user) {
  try {
    const v = Number(user?.createdAt);
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  } catch { return Date.now(); }
}

export function isTitleUnlocked(user, titleId) {
  const def = getTitleById(titleId, user);
  if (!def) return false;
  // Déjà débloqué explicitement (récompense de quête) : acquis définitivement.
  try {
    const unlocked = user?.titles?.unlocked;
    if (Array.isArray(unlocked) && unlocked.map(String).includes(String(def.id))) return true;
  } catch {}
  const req = def.req || { type: "always" };
  if (req.type === "always") return true;
  if (req.type === "kills") return lifetimeKillsOf(user) >= Math.max(1, Math.floor(Number(req.count) || 1));
  if (req.type === "quest") return completedQuestsOf(user).has(String(req.questId));
  if (req.type === "quests") return questsDoneCount(user) >= Math.max(1, Math.floor(Number(req.count) || 1));
  if (req.type === "honor") return honorOf(user) >= Math.max(1, Math.floor(Number(req.count) || 1));
  if (req.type === "exp") return expOf(user) >= Math.max(1, Math.floor(Number(req.count) || 1));
  if (req.type === "credits") return creditsOf(user) >= Math.max(1, Math.floor(Number(req.count) || 1));
  if (req.type === "pet") return petLevelOf(user) >= Math.max(1, Math.floor(Number(req.level) || 1));
  if (req.type === "level") return playerLevelOf(user) >= Math.max(1, Math.floor(Number(req.level) || 1));
  // Titre Beta : comptes créés pendant la bêta (privée ou publique).
  if (req.type === "beta") return createdAtOf(user) <= BETA_TITLE_END;
  return false;
}

export function getUnlockedTitles(user) {
  const list = TITLE_DEFINITIONS.filter(t => isTitleUnlocked(user, t.id));
  for (const c of getCustomTitles(user)) {
    if (isTitleUnlocked(user, c.id)) list.push(getTitleById(c.id, user));
  }
  return list;
}

export function getUnlockedTitlesSorted(user) {
  return getUnlockedTitles(user).sort(compareTitles);
}

export function normalizeTitlesState(raw, user) {
  const t = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
  const customIds = new Set(getCustomTitles({ titles: t }).map(c => c.id));
  const unlocked = Array.isArray(t.unlocked) ? [...new Set(t.unlocked.map(x => String(x)).filter(x => BY_ID.has(x) || customIds.has(x)))] : [];
  const custom = getCustomTitles({ titles: t });
  const hadBeta = unlocked.includes("joueur_beta");
  // Auto-ajout des titres à condition remplie (kills / quêtes / always).
  for (const def of TITLE_DEFINITIONS) {
    if (!unlocked.includes(def.id) && isTitleUnlocked({ ...user, titles: { unlocked } }, def.id)) unlocked.push(def.id);
  }
  let activeId = t.activeId != null ? String(t.activeId) : null;
  if (!activeId || !unlocked.includes(activeId)) activeId = unlocked.includes("recrue") ? "recrue" : (unlocked[0] || null);
  // Titre Beta offert : affiché d'office pour ceux qui n'ont jamais choisi (défaut Recrue).
  if (unlocked.includes("joueur_beta") && !hadBeta && activeId === "recrue") activeId = "joueur_beta";
  const show = t.show !== false;
  return { unlocked, activeId, show, custom };
}

// Titre visible pour les autres : null si masqué / non débloqué.
export function visibleTitleOf(user) {
  try {
    const st = user?.titles;
    if (!st || st.show === false) return null;
    const def = getTitleById(st.activeId, user);
    if (!def) return null;
    if (!isTitleUnlocked(user, def.id)) return null;
    return def;
  } catch { return null; }
}
