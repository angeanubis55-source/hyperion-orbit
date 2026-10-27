"use strict";

// Wiki / Aide : même DA que la fenêtre BOT (onglets à gauche, cartes).
// Les tableaux de référence sont générés depuis les données du jeu
// (boutique, NPC, gates, minerais...) : ils suivent tout seuls les
// changements d'équilibrage. Seuls les guides sont rédigés à la main.

import { CATALOG } from "../SRC/CORE/CATALOG.js";
import { SHIP_PACKS, getShipDesignBaseId, getShipDesignIds, isRemovedShipPack } from "../SHIP/SHIP_PACKS.js";
import { SHIP_THUMB_IDS, SHIP_THUMB_DIR } from "../SHIP/SHIP_THUMBS.js";
import { NPC_TYPES } from "../NPC/NPC_TYPES.js";
import { resolveNpcReward } from "../NPC/NPC_BALANCE.js";
import { halloweenRoleOf } from "../NPC/NPC_HALLOWEEN.js";
import { AMMO } from "../COMBAT/AMMO_TYPES.js";
import { ROCKET_TYPES, rocketEffectLabel } from "../COMBAT/ROCKET_TYPES.js";
import {
  CARGO_CAPACITY, ORE_SELL_PRICES, REFINERY_RECIPES, RESOURCE_TYPES,
  UPGRADE_CHARGE_COST, UPGRADE_ORE_BONUS, UPGRADE_SLOTS, getResourceName,
} from "../SRC/DATA/RESOURCES.js";
import { BOOSTERS, GROUP_BOOSTER_IDS, formatBoosterDuration } from "../SRC/DATA/BOOSTERS.js";
import {
  GALAXY_GATE_DEFINITIONS, GALAXY_SPIN_CREDIT_COST, KRONOS_PARTS_BY_GATE, PALLADIUM_PER_GALAXY_ENERGY,
} from "../SRC/CORE/GALAXY_GATES.js";
import { PILOT_RANKS } from "../SRC/CORE/PROGRESSION.js";
import { PILOT_SKILLS, PILOT_MAX_POINTS, LOGDISK_PRICE, PILOT_RESET_BASE, formatPilotEffect } from "../SRC/DATA/PILOT_SKILLS.js";
import { TITLE_DEFINITIONS, TITLE_RARITIES } from "../SRC/DATA/TITLES.js";
import { COLLECTABLE_TYPES } from "../SRC/DATA/COLLECTABLES.js";
import { SKYLAB_MODULES, SKYLAB_MAX_LEVEL } from "../SRC/DATA/SKYLAB.js";
import { MODULE_ROLL_COST, MODULE_DAILY_ROLL_LIMIT } from "../SRC/DATA/MODULE_DROPS.js";
import { DRONE_FORMATIONS, IRIS_BASE_PRICE, MAX_IRIS_DRONES, SPECIAL_DRONE_PRICE, DRONE_MAX_LEVEL } from "../DRONE/DRONE_TYPES.js";
import { MAX_ACTIVE_QUESTS } from "../QUEST/QUEST_TYPES.js";
import { GATE_WAVE_DIRS, loadNpcLocationIndex } from "../QUEST/QUEST_LOCATIONS.js";
import { botMapGroupKey, botMapGroupLabel, compareBotMapGroups, botMapsLabel } from "../SRC/CORE/BOT_NPC_CATALOG.js";
import { watchSelects } from "./UI_SELECT_COMBO.js";

// ---------- Mise en forme ----------
const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Espace insécable classique : l'espace fine de fr-FR n'est pas dans toutes les polices.
const frNum = (v, opts) => Number(v).toLocaleString("fr-FR", opts).replace(/ /g, " ");
const num = (v) => frNum(Math.round(Number(v) || 0));
function money(v) {
  const n = Number(v) || 0;
  if (n >= 1e9) return `${frNum(n / 1e9, { maximumFractionDigits: 2 })} Md`;
  if (n >= 1e6) return `${frNum(n / 1e6, { maximumFractionDigits: 2 })} M`;
  return num(n);
}
const pct = (v) => `${frNum(v, { maximumFractionDigits: 2 })} %`;
const gold = (v) => `<b class="wikiGold">${v}</b>`;
const kbd = (k) => `<kbd>${esc(k)}</kbd>`;
// fallback : image de secours si la première est introuvable (voir wireWikiWindow).
const img = (src, cls = "wikiIco", fallback = "") => (src
  ? `<img class="${cls}" src="${esc(src)}"${fallback ? ` data-fallback="${esc(fallback)}"` : ""} alt="" loading="lazy" decoding="async" />`
  : "");
// "-=[ Streuner ]=- κ" -> "Streuner κ" : on retire les décorations DarkOrbit.
const npcName = (type) => String(NPC_TYPES[type]?.name || type)
  .replace(/-=\[|\]=-|\.\.::\{|\}::\.\.|[[\]{}]/g, " ").replace(/\s+/g, " ").trim();
const lines = (text) => esc(text).replace(/\n/g, "<br />");

// Carte : titre cyan + contenu. span = pleine largeur.
function card(title, body, { span = false, note = "" } = {}) {
  return `<section class="wikiCard${span ? " wikiSpan" : ""}"><div class="wikiCardTitle">${esc(title)}</div>`
    + `<div class="wikiText">${body}</div>${note ? `<p class="wikiNote">${note}</p>` : ""}</section>`;
}
// Tableau : chaque ligne est filtrée par la recherche.
function table(headers, rows, { cls = "" } = {}) {
  const head = headers.map((h) => `<th>${h}</th>`).join("");
  const body = rows.map((r) => `<tr>${r.map((c) => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("");
  return `<div class="wikiTableWrap"><table class="wikiTable ${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

// ---------- Touches ----------
function keyLabel(code) {
  const c = String(code || "");
  const named = { ControlLeft: "CTRL", ControlRight: "CTRL D", ShiftLeft: "MAJ", ShiftRight: "MAJ D", AltLeft: "ALT", Space: "ESPACE", Tab: "TAB", Escape: "ÉCHAP", Enter: "ENTRÉE", Backquote: "²" };
  if (named[c]) return named[c];
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad\d$/.test(c)) return `PAVÉ ${c.slice(6)}`;
  return c || "—";
}

// ---------- Pages ----------
function pageDemarrage() {
  return [
    card("Bienvenue, pilote", `<p>Explore les secteurs, détruis des NPC, ramasse les box, remplis tes quêtes, puis attaque les Galaxy Gates. Tu appartiens à une firme (${gold("MMO")}, ${gold("EIC")} ou ${gold("VRU")}) : les maps X-1 de ta firme sont sûres, le reste est hostile.</p>`
      + list([
        `<b>Boucle de progression :</b> quêtes → farm de NPC → minerais → raffinage → meilleur équipement → maps supérieures → Galaxy Gates.`,
        `<b>Soute :</b> ${gold(num(CARGO_CAPACITY))} unités de minerais. Vends ou raffine quand elle est pleine.`,
        `<b>Mort :</b> répare-toi à la base, au portail le plus proche ou sur place selon les choix proposés.`,
      ]), { span: true }),
    card("Premier vol en 6 étapes", `<ol>
      <li>Choisis ta firme et ton pseudo dans le profil.</li>
      <li>Clique sur la carte pour voler, clique un NPC pour le verrouiller, puis ${kbd("CTRL")} pour tirer.</li>
      <li>Ramasse les bonus-box et les cargo-box laissées par les NPC.</li>
      <li>Prends tes premières quêtes au terminal de quêtes.</li>
      <li>Raffine Prometium / Endurium / Terbium et charge tes lasers.</li>
      <li>Achète de meilleurs lasers et générateurs à la boutique, puis monte de map.</li>
    </ol>`),
    card("Conseils de départ", list([
      "Garde une config 1 offensive (lasers) et une config 2 défensive (bouclier / vitesse).",
      `Utilise la munition ${gold("X1")} (infinie) sur les petits NPC et garde X2+ pour les gros.`,
      "Si tu perds plus de coque que tu n'en infliges, redescends d'une map.",
      "Les quêtes rapportent beaucoup au début : garde toujours des quêtes actives.",
      "Le P.E.T avec un gear Auto-Loot double ta vitesse de ramassage.",
    ])),
    card("Les fenêtres du jeu", `<p>Toutes les fenêtres se déplacent par leur barre de titre, se réduisent avec <b>−</b> et se rouvrent depuis le dock en bas de l'écran.</p>`
      + table(["Fenêtre", "À quoi elle sert"], [
        ["Stats joueur", "Crédits, expérience, honneur, PDG, niveau."],
        ["État du vaisseau", "Coque, bouclier, soute, vitesse et bascule de configuration 1 / 2."],
        ["Mini-carte", "Position, portails, alliés / ennemis, zoom + / −, point de ralliement du groupe."],
        ["Missions / Terminal de quêtes", "Quêtes actives, objectifs et récompenses ; nouvelles quêtes au terminal."],
        ["Galaxy Gates", "Spins, construction des gates, multiplicateurs, historique."],
        ["Carte Stellaire", "Vue d'ensemble des maps et saut vers une map débloquée."],
        ["Inventaire", "Tout ce que tu possèdes, avec recherche et catégories."],
        ["Raffinage / Commerce", "Recettes de minerais, upgrades d'équipement, vente au comptoir."],
        ["Modules", "Roulette, modules équipés et comparateur."],
        ["Arbre des compétences", "Points de pilote et compétences passives."],
        ["Boosters", "Activation des boosters achetés."],
        ["P.E.T", "Ton P.E.T : activation, mode, carburant, gears, protocoles."],
        ["BOT", "Farm automatique (gains réduits de 75 %)."],
        ["Skylab / Enchères", "Production passive de ressources et ventes aux enchères."],
        ["Groupe / Amis / Clan / Chat", "Jeu à plusieurs."],
        ["Classement / Titres / Passe de combat", "Classements, titres débloqués et passe d'événement."],
        ["LOG / DPS", "Historique des événements et mesure de tes dégâts."],
        ["Paramètres", "Graphismes, son, commandes, compte."],
      ]), { span: true }),
  ];
}

function pageCommandes(ctx) {
  const binds = ctx.keybinds?.() || {};
  const labels = ctx.labels || {};
  const main = ["toggleAttack", "fireRocket", "switchConfig", "portal", "petToggle", "petCombat", "botToggle", "toggleWindows", "toggleDock", "tertiaryToggle"];
  const rows = main.filter((k) => binds[k]).map((k) => [esc(labels[k] || k), kbd(keyLabel(binds[k]))]);
  const slots = [];
  for (let i = 1; i <= 20; i++) if (binds[`slot${i}`]) slots.push(`${kbd(keyLabel(binds[`slot${i}`]))}`);
  return [
    card("Tes raccourcis actuels", table(["Action", "Touche"], rows)
      + `<p>Barre rapide (slots 1 à 20) : ${slots.join(" ")}</p>`,
    { note: "Ce tableau lit tes vraies touches : modifie-les dans Paramètres → Commandes (clique une ligne puis appuie la nouvelle touche)." }),
    card("Souris", list([
      "<b>Clic gauche sur la carte :</b> voler vers ce point.",
      "<b>Clic sur un NPC / joueur :</b> le verrouiller.",
      "<b>Clic sur une box :</b> voler vers elle et la ramasser.",
      "<b>Mini-carte :</b> boutons + / − pour zoomer.",
      "<b>Fenêtres :</b> déplace-les par leur barre de titre.",
    ])),
    card("Barre rapide et munitions", list([
      "Les slots contiennent munitions, roquettes, compétences, formations, IEM / ISH.",
      "Clique une munition (ou sa touche) pour la sélectionner : le tir laser l'utilise aussitôt.",
      "La 3e barre (barre d'action rapide) s'ouvre avec sa touche dédiée.",
      "IEM : casse les verrouillages ennemis, retire gel et ralentissement (3 s).",
      "ISH : invulnérabilité totale pendant 3 s.",
    ])),
  ];
}

// Le manifeste des miniatures liste des vaisseaux sans fichier : la frame
// du sprite sert de secours.
function shipSprite(pack) {
  return pack.path ? `${pack.path}${pack.firstNumber ?? 1}${pack.ext || ".png"}` : "";
}
function shipIcon(pack) {
  return SHIP_THUMB_IDS.has(pack.id) ? `${SHIP_THUMB_DIR}${pack.id}.png` : shipSprite(pack);
}
function pageVaisseaux() {
  const ships = SHIP_PACKS.filter((p) => p?.id && !isRemovedShipPack(p.id) && !getShipDesignBaseId(p.id) && String(p.id).toLowerCase() !== "police")
    .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0) || String(a.name).localeCompare(String(b.name), "fr"));
  const rows = ships.map((p) => [
    img(shipIcon(p), "wikiIco wikiIcoShip", shipSprite(p)), `<b>${esc(p.name)}</b>`, gold(num(p.hp)), num(p.speed),
    num(p.slots?.lasers), num(p.slots?.gens), num(p.slots?.extras), num(p.slots?.shipMods),
    num(getShipDesignIds(p.id).length), p.id === "phoenix_bleu" ? "Départ" : gold(money(p.price)),
  ]);
  return [
    card(`Tous les vaisseaux (${ships.length})`, table(["", "Vaisseau", "Coque", "Vitesse", "Lasers", "Générateurs", "Extras", "Modules", "Designs", "Prix"], rows, { cls: "wikiTableShips" }),
      { span: true, note: "Prix en crédits. Un design reprend les caractéristiques de son vaisseau de base et n'ajoute que ses bonus propres." }),
    card("Hangars et configurations", list([
      "Chaque vaisseau acheté crée un hangar ; active-le dans la fenêtre Hangars.",
      "Chaque hangar a 2 configurations indépendantes : bascule avec la touche Changer configuration.",
      "Exemple : config 1 = full lasers + bouclier, config 2 = full vitesse pour fuir ou voyager.",
      "Coque et bouclier de chaque config sont conservés quand tu bascules.",
    ])),
    card("Designs", list([
      "Un design est une apparence rattachée à une coque : il faut posséder le vaisseau parent.",
      "Il garde les stats du vaisseau de base. Certains designs ajoutent un bonus ou une compétence propre, affichés en boutique.",
      "Le prix d'un design dépend de sa coque et de ses bonus propres uniquement.",
    ])),
    card("Caractéristiques", list([
      "<b>Coque :</b> à 0 tu es détruit.",
      "<b>Bouclier :</b> vient des générateurs de bouclier, absorbe une partie des dégâts avant la coque.",
      "<b>Vitesse :</b> vitesse de base + générateurs de vitesse + minerai chargé.",
      "<b>Lasers / générateurs / extras / modules :</b> nombre d'emplacements disponibles.",
    ]), { span: true }),
  ];
}

function pageDrones() {
  const formations = DRONE_FORMATIONS.map((f) => [
    img(f.icon), `<b>${esc(f.name)}</b>`, esc(f.desc || "Aucun bonus ni malus."),
    num(f.minDrones || 0), f.price > 0 ? gold(money(f.price)) : (f.id === "standard" ? "Offerte" : "Assemblage"),
  ]);
  const irisPrices = Array.from({ length: MAX_IRIS_DRONES }, (_, i) => `${i + 1}<sup>e</sup> : ${gold(money(IRIS_BASE_PRICE * 2 ** i))}`);
  return [
    card("Drones", list([
      `<b>Iris :</b> jusqu'à ${gold(MAX_IRIS_DRONES)} drones, prix doublé à chaque achat (${irisPrices.join(" · ")}).`,
      `<b>Apis et Zeus :</b> drones spéciaux, ${gold(money(SPECIAL_DRONE_PRICE))} chacun.`,
      `Les drones portent lasers et générateurs dans chacune des 2 configurations.`,
      `Ils gagnent une part de ton expérience et montent jusqu'au niveau ${gold(DRONE_MAX_LEVEL)} (bonus et apparence évoluent).`,
      "Les designs de drones (drops de Galaxy Gates) ajoutent un bonus.",
    ])),
    card("Choisir sa formation", list([
      `<b>Farm NPC :</b> Barrière, X ou Chauve-Souris (dégâts et XP contre NPC).`,
      `<b>Tank :</b> Tortue, Cœur, Anneau, Diamant.`,
      `<b>Roquettes :</b> Flèche, Double Flèche, Chevron, Étoile.`,
      `<b>Honneur :</b> Vétéran, Pince.`,
      "Une formation exige un nombre minimum de drones ; sinon la formation standard s'applique.",
      "Le BOT peut changer de formation selon la phase (attaque, exploration, fuite).",
    ])),
    card(`Formations (${DRONE_FORMATIONS.length})`, table(["", "Formation", "Effets", "Drones min.", "Prix"], formations), { span: true }),
  ];
}

function pageEquipement() {
  const lasers = CATALOG.lasers.map((l) => [img(l.icon), `<b>${esc(l.name.replace(/^laser\s+/i, ""))}</b>`, gold(num(l.module?.damage)), lines(l.desc || ""),
    l.petOnly ? "P.E.T" : (l.noPet ? "Vaisseau" : "Tous"), l.shopHidden ? "Assemblage" : gold(money(l.price))]);
  const shields = CATALOG.shieldGen.map((g) => [img(g.icon), `<b>${esc(g.name)}</b>`, gold(num(g.module?.bonusShield)), g.module?.absorbPct ? pct(g.module.absorbPct) : "—", g.petOnly ? "P.E.T" : "Tous", gold(money(g.price))]);
  const speeds = CATALOG.speedGen.map((g) => [img(g.icon), `<b>${esc(g.name)}</b>`, gold(`+${num(g.module?.bonusSpeed)}`), gold(money(g.price))]);
  const oreCols = ["prometid", "duranium", "promerium", "seprom", "osmium"];
  const upgrades = UPGRADE_SLOTS.map((s) => [img(s.icon), `<b>${esc(s.name)}</b>`,
    ...oreCols.map((o) => (UPGRADE_ORE_BONUS[o]?.[s.id] ? gold(`+${pct(UPGRADE_ORE_BONUS[o][s.id] * 100)}`) : "—")),
    s.unit === "tirs" ? "1 minerai = 10 tirs" : "1 minerai = 10 min"]);
  return [
    card(`Canons laser (${lasers.length})`, table(["", "Laser", "Dégâts", "Détails", "Montage", "Prix"], lasers), { span: true, note: "Les bonus spéciaux (overdrive, critique, bonus contre NPC) s'appliquent par canon monté, drones compris." }),
    card("Générateurs de bouclier", table(["", "Générateur", "Bouclier", "Absorption", "Montage", "Prix"], shields),
      { note: "L'absorption retenue est la meilleure des générateurs montés (80 % sans générateur)." }),
    card("Générateurs de vitesse", table(["", "Générateur", "Vitesse", "Prix"], speeds)),
    card("Charger son équipement (Upgrade)", table(["", "Emplacement", ...oreCols.map((o) => esc(getResourceName(o))), "Durée"], upgrades),
      { span: true, note: `Chaque chargement coûte ${num(UPGRADE_CHARGE_COST)} unités du minerai choisi. Changer de minerai remplace le stock en cours. Le chargement se fait dans la fenêtre Raffinage (onglet Upgrade) ou automatiquement (Soute du BOT).` }),
    card("Extras", table(["Extra", "Prix"], CATALOG.extras.map((e) => [`<b>${esc(e.name.replace(/^Extra:\s*/, ""))}</b>`, gold(money(e.price))]))),
    card("Modules", list([
      `Roulette : ${gold(money(MODULE_ROLL_COST))} le tirage, ${gold(MODULE_DAILY_ROLL_LIMIT)} tirages par jour.`,
      "Chaque module a une couleur (rareté), un type et 1 à plusieurs statistiques.",
      "L'onglet Comparateur de la fenêtre Modules te dit quoi monter selon ton vaisseau et ton style (PvE / PvP, XP / honneur).",
      "Les tickets de relance et de tirage s'achètent en boutique.",
    ])),
  ];
}

function pageMunitions() {
  const ammoRows = [["x1", "LCB-10", "Munition de base, stock infini.", 0, false],
    ...CATALOG.ammo.map((a) => [Object.keys(a.give.ammo)[0], a.code || a.name, a.desc, a.price, a.shopHidden])]
    .map(([id, code, desc, price, hidden]) => [`<span class="wikiDot" style="background:${esc(AMMO[id]?.color || "#fff")}"></span>`, `<b>${esc(code)}</b>`,
      gold(`×${String(AMMO[id]?.mult ?? 1).replace(".", ",")}`), lines(desc), AMMO[id]?.cooldown ? `${num(AMMO[id].cooldown)} s` : "—",
      price ? (hidden ? "Assemblage" : gold(money(price))) : "Gratuit"]);
  const rockets = Object.values(ROCKET_TYPES).map((r) => {
    const item = CATALOG.rockets.find((x) => x.id === `rocket_${r.id}`);
    return [img(item?.icon), `<b>${esc(r.name.replace(/^Roquette\s+/, ""))}</b>`, r.damage ? gold(num(r.damage)) : "—", esc(rocketEffectLabel(r)),
      `${String(r.cooldown).replace(".", ",")} s`, r.manual === false ? "Lance-roquettes" : "Manuel", item?.shopHidden ? "Assemblage" : gold(money(r.packPrice))];
  });
  return [
    card("Munitions laser", table(["", "Munition", "Mult.", "Effet", "Recharge", "Prix / 1 000"], ammoRows),
      { span: true, note: "Le multiplicateur s'applique aux dégâts de tes lasers. RSB-75 et RCB-140 partagent la même recharge." }),
    card("Roquettes", table(["", "Roquette", "Dégâts", "Effet", "Recharge", "Tir", "Prix / 1 000"], rockets),
      { span: true, note: "Les roquettes spéciales (30 s) ont chacune leur propre recharge : en utiliser une ne bloque pas les autres." }),
    card("Quelle munition utiliser ?", list([
      `<b>Petits NPC :</b> X1 (infinie) ou X2.`,
      `<b>Gros NPC :</b> X3 / X4, ou ${gold("JOB-100")} (×3,5 contre NPC).`,
      `<b>NPC précis :</b> SBL (Sibelons), TENT (Lordakiums), RB (Demaners), VB (Styxus / Charopos), EMAA (Mimesis), ICE (Emperor Kristallon) : ×7 à ×8.`,
      `<b>Survie :</b> SAB-50 vole du bouclier pour recharger le tien.`,
      `<b>Burst :</b> RSB-75 (×6) et RCB-140 (×7) en salve, recharge 5 s.`,
    ]), { span: true }),
  ];
}

function pageCombat() {
  return [
    card("Verrouillage, portée, tir", list([
      "Clique une cible pour la verrouiller, puis active le tir laser.",
      "Le laser ne touche que si la cible est vivante, à portée et attaquable dans cette zone.",
      "Les lasers tirent en continu ; les roquettes se tirent à la main, une par seconde (sauf recharge spéciale).",
      "Le lance-roquettes tire des salves avec son propre stock.",
    ])),
    card("Dégâts, bouclier et pénétration", list([
      "Le bouclier absorbe une part des dégâts (l'absorption) avant la coque.",
      "La pénétration envoie une part directement sur la coque.",
      "SAB / CBO volent du bouclier ; SP-100X ignore le bouclier.",
      `Après un impact : ${gold("10 s")} avant que la coque se répare et que le bouclier se recharge normalement. Chaque coup relance le délai.`,
    ])),
    card("IEM, ISH et contrôles", list([
      "<b>IEM :</b> casse les verrouillages des joueurs et NPC qui te visent, retire gel et ralentissement, empêche leur retour pendant 3 s.",
      "<b>ISH :</b> invulnérable 3 s ; ton propre verrouillage est gardé.",
      "<b>Gel :</b> immobilise (R-IC3 2 s, RC-100 3 s).",
      "<b>Ralentissement :</b> DCR-250, K-300M, PIB-100.",
      "Le BOT peut lancer IEM / ISH automatiquement (onglet Configuration).",
    ])),
    card("Zones de non-agression", list([
      "Autour des bases, de certains portails et modules : les NPC ne t'engagent pas.",
      "Attaquer ou rester en combat suspend la protection.",
      "Quand tu la récupères, les NPC abandonnent la poursuite.",
    ])),
    card("Mort et réparation", list([
      "Après destruction : réparation à la base, au portail le plus proche ou sur place quand c'est disponible.",
      "En Galaxy Gate, les vies sont limitées et les choix dépendent de la gate.",
      "Depuis les maps 4-x, le retour base se fait à la base X-8 de ta firme.",
    ])),
    card("PvP", list([
      "Les joueurs des autres firmes sont hostiles en dehors de tes maps sûres.",
      "Détruire un joueur rapporte de l'honneur ; certaines munitions et lasers ont un bonus PvP.",
      "Les noms : blanc = toi, cyan = alliés, rouge = ennemis, jaune clair = ton groupe.",
    ])),
  ];
}

function pageNpc() {
  return [
    card("Bestiaire", `<div class="wikiFilterRow"><label class="wikiField"><span>Maps</span><select id="wikiNpcFilter" aria-label="Filtrer par map"><option value="">Toutes les maps</option></select></label><span id="wikiNpcCount" class="wikiCount"></span></div>`
      + `<div id="wikiNpcTable"><p class="wikiMuted">Chargement des NPC…</p></div>`,
    { span: true, note: "Gains de base. Sur les maps des firmes, les crédits sont multipliés : ×2 en X-1 à X-4, ×1,5 en X-5, ×1,25 en X-6 à X-8. Boosters, formations, pilote et modules s'ajoutent." }),
    card("Familles de NPC", list([
      "<b>Normal / Boss / Uber :</b> chaque famille existe en 3 forces ; Boss ≈ ×4 et Uber ≈ ×8 les gains du normal.",
      "<b>Streuner → Lordakia → Mordon → Saimon → Devolarium → Sibelon → Kristallin → Kristallon :</b> du plus faible au plus fort sur les maps de firme.",
      "<b>NPC de gate :</b> versions renforcées propres à chaque Galaxy Gate.",
    ])),
    card("Butin", list([
      "Chaque NPC laisse une cargo-box (minerais) réservée au tueur.",
      "Les NPC d'assemblage lâchent des ressources d'atelier (Scrap, Mucosum, Plasmide...).",
      "Les objectifs de quête et les titres comptent tes kills personnels.",
    ])),
  ];
}

function npcTableHtml(entries) {
  const rows = entries.map(({ type, maps }) => {
    const d = NPC_TYPES[type] || {};
    const r = resolveNpcReward(type) || {};
    const sprite = d.sprite ? `${d.sprite.path}${d.sprite.firstNumber ?? 1}${d.sprite.ext || ".png"}` : "";
    return [img(sprite, "wikiIco wikiIcoNpc"), `<b>${esc(npcName(type))}</b>`, gold(num(d.hp)), num(d.shield), num(d.bulletDmg), num(d.speed),
      gold(num(r.credits)), num(r.exp), num(r.honor), esc(botMapsLabel(maps))];
  });
  return rows.length ? table(["", "NPC", "Coque", "Bouclier", "Dégâts", "Vitesse", "Crédits", "XP", "Honneur", "Maps"], rows, { cls: "wikiTableNpc" })
    : `<p class="wikiMuted">Aucun NPC pour ce filtre.</p>`;
}

function pageMaps() {
  const own = [["X-1, X-2", 1], ["X-3", 2], ["X-4", 3], ["X-5", 10], ["X-6, X-7", 11], ["X-8", 12]];
  const enemy = [["X-3, X-4", 5], ["X-2", 13], ["X-5", 14], ["X-6, X-7", 15], ["X-1", 16], ["X-8", 17]];
  const special = [["4-1, 4-2, 4-3", 8], ["4-4", 9], ["4-5", 12], ["5-2 (pirates)", 12], ["Maudite", 12], ["Galaxy Gates, Low, QZ", "Pièces / entrée"]];
  return [
    card("Secteurs des firmes", list([
      `${gold("1-x")} = MMO, ${gold("2-x")} = EIC, ${gold("3-x")} = VRU. Les maps vont de X-1 (débutant) à X-8 (très dur), plus les BL.`,
      "<b>X-1 à X-4 :</b> farm de base, crédits ×2.",
      "<b>X-5 :</b> transition, crédits ×1,5.",
      "<b>X-6 à X-8 :</b> gros NPC, PvP, crédits ×1,25.",
      "<b>4-x :</b> maps centrales PvP partagées par les trois firmes.",
      "<b>5-2 :</b> map pirate, avec son comptoir.",
    ])),
    card("Portails et voyage", list([
      "Vole sur un portail puis appuie sur la touche Portail.",
      "La Carte Stellaire permet de sauter directement vers une map débloquée.",
      "Un niveau minimum est demandé pour certaines maps (tableau ci-contre).",
      "Les Galaxy Gates s'ouvrent depuis la fenêtre Galaxy Gates une fois construites.",
    ])),
    card("Niveau requis — ta firme", table(["Maps", "Niveau"], own.map(([m, l]) => [`<b>${m}</b>`, gold(l)]))),
    card("Niveau requis — firmes ennemies", table(["Maps", "Niveau"], enemy.map(([m, l]) => [`<b>${m}</b>`, gold(l)]))),
    card("Niveau requis — maps spéciales", table(["Maps", "Accès"], special.map(([m, l]) => [`<b>${m}</b>`, gold(l)]))),
    card("Bases et comptoirs", list([
      "Chaque firme a une base en X-1 et en X-8 : réparation, comptoir, zone sûre.",
      "La map pirate 5-2 a son comptoir.",
      "Le BOT choisit la base de vente la plus proche (ou celle que tu imposes dans l'onglet Soute).",
    ])),
  ];
}

function pageMinerais() {
  const recipeOf = (id) => REFINERY_RECIPES.find((r) => r.id === id);
  const recipeText = (r) => Object.entries(r.inputs).map(([k, v]) => `${num(v)} ${esc(getResourceName(k, v))}`).join(" + ") + ` → ${gold(num(r.output.amount))}`;
  const ores = ["prometium", "endurium", "terbium", "prometid", "duranium", "promerium", "seprom", "xenomit", "osmium", "palladium"];
  const rows = ores.map((id) => {
    const r = recipeOf(id);
    const bonus = Object.entries(UPGRADE_ORE_BONUS[id] || {}).map(([slot, v]) => `${UPGRADE_SLOTS.find((s) => s.id === slot)?.name || slot} +${pct(v * 100)}`).join(", ");
    const price = id === "palladium" ? `${PALLADIUM_PER_GALAXY_ENERGY} → 1 énergie GG` : (ORE_SELL_PRICES[id] ? gold(num(ORE_SELL_PRICES[id])) : "Invendable");
    return [img(RESOURCE_TYPES[id]?.icon), `<b>${esc(getResourceName(id))}</b>`, r ? recipeText(r) : "Collecte", price, esc(bonus || "—")];
  });
  return [
    card("Minerais", table(["", "Minerai", "Obtention / recette", "Vente", "Upgrade"], rows), { span: true, note: "Prix de vente au comptoir par unité, en crédits." }),
    card("Soute", list([
      `Capacité : ${gold(num(CARGO_CAPACITY))} unités, partagées par tous les minerais (le protocole P.E.T Cargo et le pilote l'augmentent).`,
      "Les ressources d'assemblage, de Skylab et d'événement ne prennent pas de place en soute.",
      "Soute pleine : les cargo-box ne sont plus ramassées.",
    ])),
    card("Raffinage", list([
      "Fenêtre Raffinage : choisis une recette et la quantité, ou « Tout raffiner ».",
      "Le raffinage automatique raffine à chaque collecte (réglable aussi dans l'onglet Soute du BOT).",
      "Le Xenomit vient des bonus-box, des gates et du Skylab : garde-le pour le Promerium.",
      "L'Osmium demande 100 Seprom : vise-le seulement avec un gros stock.",
    ])),
    card("Vente et palladium", list([
      "Vends au comptoir d'une base (X-1, X-8 ou pirate 5-2).",
      "Le gear P.E.T Cargo Trader vend hors base avec un bonus.",
      `Le palladium (5-2) s'échange : ${gold(PALLADIUM_PER_GALAXY_ENERGY)} palladium = ${gold(1)} énergie de Galaxy Gate.`,
      "Le BOT peut vendre automatiquement par minerai et par quantité (onglet Soute).",
    ]), { span: true }),
  ];
}

function rewardText(rewards = {}) {
  const parts = [];
  const range = (v) => (Array.isArray(v) ? (v[0] === v[1] ? num(v[0]) : `${num(v[0])}–${num(v[1])}`) : num(v));
  if (rewards.credits) parts.push(`${range(rewards.credits)} crédits`);
  if (rewards.exp) parts.push(`${range(rewards.exp)} XP`);
  if (rewards.honor) parts.push(`${range(rewards.honor)} honneur`);
  if (rewards.galaxyEnergy) parts.push(`${range(rewards.galaxyEnergy)} énergie GG`);
  for (const [k, v] of Object.entries(rewards.ammo || {})) parts.push(`${range(v)} ${k.toUpperCase()}`);
  for (const [k, v] of Object.entries(rewards.rockets || {})) parts.push(`${range(v)} ${esc(ROCKET_TYPES[k]?.name?.replace(/^Roquette\s+/, "") || k)}`);
  for (const [k, v] of Object.entries(rewards.resources || {})) parts.push(`${range(v)} ${esc(getResourceName(k, 2))}`);
  return parts.join(", ");
}
function pageBox() {
  const seen = new Set();
  const rows = [];
  for (const [id, box] of Object.entries(COLLECTABLE_TYPES)) {
    if (box.enabled === false) continue;
    const content = box.exclusiveRewards
      ? (() => {
        const total = box.exclusiveRewards.reduce((s, e) => s + e.weight, 0);
        return box.exclusiveRewards.map((e) => `${gold(pct(Math.round(e.weight / total * 1000) / 10))} ${rewardText(e.reward)}`).join("<br />");
      })()
      : rewardText(box.rewards);
    const key = `${box.name}|${content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const where = Number(box.qty) > 0
      ? (box.maps === "*" ? "Toutes les maps (sauf gates, Low, QZ, BL, 5-2)" : [].concat(box.maps).join(", "))
      : (Array.isArray(box.maps) ? box.maps.join(", ") : (box.maps === "*" ? "Drop de NPC / événement" : String(box.maps)));
    const sprite = box.sprite ? `${box.sprite.path}${box.sprite.firstNumber ?? 1}${box.sprite.ext || ".png"}` : "";
    rows.push([img(sprite), `<b>${esc(box.name)}</b>`, esc(where), content || "—", id === "Sun_Box" || id === "Mindfire_Sun_Box" ? "Non" : "−75&nbsp;%"]);
  }
  return [
    card("Toutes les box", table(["", "Box", "Où", "Contenu", "BOT"], rows), { span: true, note: "Les pourcentages des bonus-box sont les chances de chaque gain (un seul par box). La colonne BOT indique la réduction quand le BOT ramasse." }),
    card("Ramassage", list([
      "Clique une box pour voler dessus : elle est ramassée au contact.",
      "La collecte est validée par le serveur : une box prise disparaît pour tout le monde.",
      "Les cargo-box NPC sont réservées au tueur (ou au premier à avoir verrouillé).",
      "Le P.E.T avec Auto-Loot ou Collecteur ramasse à distance.",
    ])),
    card("Astuces", list([
      "Les bonus-box réapparaissent tout de suite : une map calme se farm en boucle.",
      "Les bonus-box donnent de l'énergie de Galaxy Gate et du Xenomit.",
      "Le BOT a un onglet Bonus Box pour choisir quelles box ramasser.",
    ])),
  ];
}

function pageQuetes() {
  return [
    card("Terminal de quêtes", list([
      "Le terminal propose des quêtes adaptées à ta progression : tuer, collecter, visiter.",
      `Tu peux garder jusqu'à ${gold(MAX_ACTIVE_QUESTS)} quêtes actives.`,
      "Une quête terminée se valide au terminal ou depuis la fenêtre Missions.",
      "Les récompenses donnent crédits, XP, honneur, et parfois des objets ou des titres.",
    ])),
    card("Missions", list([
      "La fenêtre Missions liste tes quêtes actives et l'avancement de chaque objectif.",
      "Les kills NPC en groupe font avancer les quêtes des membres présents sur la map.",
      "Les récompenses de quête ne sont jamais partagées avec le groupe.",
      "Changer de firme annule toutes les quêtes en cours.",
    ])),
    card("Passe de combat (événements)", list([
      "Pendant un événement, le passe propose des objectifs (NPC, box...) à remplir.",
      "Chaque objectif terminé débloque ses récompenses dans la fenêtre Passe de combat.",
      "Les ressources d'événement (bonbons, clés) se gardent dans l'inventaire.",
    ])),
    card("Titres", list([
      "Certaines quêtes, kills et exploits débloquent des titres.",
      "Choisis le titre affiché sous ton pseudo dans la fenêtre Titres.",
      "La liste complète est dans l'onglet Progression.",
    ])),
  ];
}

function pageProgression() {
  const levels = [];
  for (let l = 1; l <= 32; l++) levels.push([gold(l), l === 1 ? "0" : num(10000 * 2 ** (l - 2))]);
  const half = Math.ceil(levels.length / 2);
  const levelRows = levels.slice(0, half).map((r, i) => [...r, ...(levels[i + half] || ["", ""])]);
  const ranks = PILOT_RANKS.map((r) => [img(`/ASSETS/RANKS/${r.image}`, "wikiIco wikiIcoRank"), `<b>${esc(r.name)}</b>`, gold(num(r.points))]);
  const skills = PILOT_SKILLS.map((s) => {
    const last = s.levels[s.levels.length - 1];
    const credits = s.levels.reduce((t, l) => t + (l.credits || 0), 0);
    const seprom = s.levels.reduce((t, l) => t + (l.seprom || 0), 0);
    return [`<b>${esc(s.name)}</b>`, esc(s.desc), num(s.max), gold(esc(formatPilotEffect(last?.effect || {}))), `${money(credits)}${seprom ? ` + ${num(seprom)} Seprom` : ""}`];
  });
  const titles = TITLE_DEFINITIONS.map((t) => [`<b style="color:${esc(t.color)}">${esc(t.name)}</b>`, esc(TITLE_RARITIES[t.rarity]?.name || t.rarity), esc(t.desc)]);
  return [
    card("Expérience, honneur, grade", list([
      "<b>Expérience :</b> NPC, quêtes, gates, box. Chaque niveau demande le double du précédent.",
      "<b>Honneur :</b> NPC, joueurs, quêtes, gates. Certaines formations le modifient.",
      `<b>Points de grade :</b> ${gold("XP ÷ 100 000 + honneur ÷ 100")}.`,
      "Classement → NPC & Grades : ton grade actuel, le suivant et tes kills par NPC.",
    ]), { span: true }),
    card("Niveaux (XP totale)", table(["Niv.", "XP", "Niv.", "XP"], levelRows)),
    card("Grades", table(["", "Grade", "Points"], ranks)),
    card("Arbre des compétences", list([
      `${gold(PILOT_MAX_POINTS)} points de pilote au maximum, 1 par niveau.`,
      `Disque de log : ${gold(money(LOGDISK_PRICE))} l'unité.`,
      `Réinitialisation : ${gold(money(PILOT_RESET_BASE))} la première fois, puis le prix double.`,
      "Chaque compétence a des prérequis (points investis dans d'autres compétences).",
    ]) + table(["Compétence", "Effet", "Niv. max", "Au max", "Coût total"], skills), { span: true }),
    card(`Titres (${TITLE_DEFINITIONS.length})`, table(["Titre", "Rareté", "Condition"], titles), { span: true }),
  ];
}

function pageGates() {
  const gates = Object.values(GALAXY_GATE_DEFINITIONS);
  const groupLabel = (g) => (g.group === "ensemble" ? "Ensemble ABG" : g.group ? "Roue isolée" : "Pièces Kronos");
  const rows = gates.map((g) => {
    const c = g.completion || {};
    return [img(g.image), `<b>${esc(g.name)}</b>`, gold(num(g.requiredParts)), num(g.maxWaves), num(g.maxLives), esc(groupLabel(g)),
      `${money(c.credits)} cr · ${money(c.exp)} XP · ${num(c.honor)} hon. · ${num(c.x4)} X4${c.xenomit ? ` · ${num(c.xenomit)} Xenomit` : ""}`];
  });
  const kronos = Object.entries(KRONOS_PARTS_BY_GATE).map(([id, n]) => [`<b>${esc(GALAXY_GATE_DEFINITIONS[id]?.name || id)}</b>`, gold(n)]);
  return [
    card("Construire une gate", list([
      `Fenêtre Galaxy Gates : choisis une gate et lance des spins (énergie d'abord, sinon ${gold(money(GALAXY_SPIN_CREDIT_COST))} crédits le spin).`,
      "Chaque spin peut donner des pièces ; à 100 % des pièces, la gate est construite.",
      "Alpha, Beta et Gamma partagent une seule roue (Ensemble ABG) ; les autres ont leur roue.",
      "Le multiplicateur de chaque roue accélère la construction quand il est armé.",
      `Kronos n'a pas de roue : ses pièces viennent des autres gates terminées.`,
      `L'énergie vient des bonus-box et du palladium (${PALLADIUM_PER_GALAXY_ENERGY} palladium = 1 énergie).`,
    ])),
    card("Jouer une gate", list([
      "Entre avec la touche Portail quand le portail de la gate est prêt.",
      "Les vies sont limitées (colonne Vies) et les vagues deviennent de plus en plus dures.",
      "Les NPC donnent leurs gains normaux pendant les vagues.",
      "La récompense finale est personnelle, jamais partagée au groupe.",
      "Attends le message de fin avant le retour en X-1.",
    ])),
    card("Toutes les gates", table(["", "Gate", "Pièces", "Vagues", "Vies", "Roue", "Récompense finale"], rows), { span: true }),
    card("Pièces Kronos par gate terminée", table(["Gate", "Pièces"], kronos)),
    card("Vagues par gate", `<div class="wikiFilterRow"><label class="wikiField"><span>Gate</span><select id="wikiGateFilter" aria-label="Gate">${
      Object.keys(GATE_WAVE_DIRS).map((id) => `<option value="${id}">${esc(botMapGroupLabel(`gg:${id}`))}</option>`).join("")}</select></label></div><div id="wikiGateWaves"><p class="wikiMuted">Chargement…</p></div>`),
  ];
}

function pagePet() {
  const gears = CATALOG.petGears.map((g) => [img(g.icon), `<b>${esc(g.name)}</b>`, esc(g.desc), g.petLevel ? `Niv. ${g.petLevel}` : "—", g.shopHidden ? "Assemblage" : gold(money(g.price))]);
  const protos = CATALOG.petProtocols.map((g) => [img(g.icon), `<b>${esc(g.name)}</b>`, esc(g.desc), g.petLevel ? `Niv. ${g.petLevel}` : "—", g.shopHidden ? "Assemblage" : gold(money(g.price))]);
  const pet = CATALOG.pets.find((p) => p.pet);
  const hull = CATALOG.pets.find((p) => p.petHull);
  return [
    card("Ton P.E.T", list([
      `Achat en boutique : ${gold(money(pet?.price))} crédits. Active-le avec ▶ dans la fenêtre P.E.T.`,
      `Carburant : sans carburant le P.E.T reste au hangar. Achat rapide +1 000 dans la fenêtre P.E.T.`,
      `Coque+ : +${num(hull?.petHull?.hp)} PV définitifs par achat (prix doublé à chaque achat, 10 max).`,
      "Il gagne de l'XP avec toi ; les gears de niveau 2, 3 et 4 demandent un P.E.T de niveau 4, 8 et 20.",
      "Il porte ses propres lasers et générateurs (certains sont réservés au P.E.T).",
      "Renomme-le dans Paramètres → Compte.",
    ])),
    card("Modes et gears actifs", list([
      "<b>Passif :</b> te suit sans attaquer. <b>Combat :</b> attaque ta cible.",
      "Les gears (Auto-Loot, Collecteur, Localisateur, Réparateur, Kamikaze...) remplacent le comportement de base.",
      "Les gears à recharge (Flamme, Lien HP, balises) se lancent puis le P.E.T reprend ton comportement secondaire.",
      "Le BOT pilote le P.E.T : comportement principal / secondaire, carburant et réparation automatiques, kamikaze auto.",
    ])),
    card("Gears", table(["", "Gear", "Effet", "P.E.T requis", "Prix"], gears), { span: true }),
    card("Protocoles", table(["", "Protocole", "Effet", "P.E.T requis", "Prix"], protos), { span: true }),
  ];
}

function pageBoosters() {
  const rows = BOOSTERS.map((b) => [img(b.icon), `<b>${esc(b.code)}</b>`, esc(b.name), lines(b.desc), esc(formatBoosterDuration(b.durationSec)),
    GROUP_BOOSTER_IDS.includes(b.id) ? "Oui" : "—", ["ephon", "dmgdlb", "dmgdlb2", "shddlb", "hpdlb", "epdlb", "hondlb", "npc", "npcb2"].includes(b.id) ? "Drop / quête" : gold(money(b.price))]);
  return [
    card("Utiliser les boosters", list([
      "Achète-les en boutique, active-les dans la fenêtre Boosters.",
      "Les boosters de groupe (B02) donnent aussi un petit bonus aux membres du groupe sur la même map.",
      "Active-les avant une grosse session de farm ou une Galaxy Gate.",
    ]), { span: true }),
    card(`Tous les boosters (${BOOSTERS.length})`, table(["", "Code", "Booster", "Effet", "Durée", "Groupe", "Prix"], rows), { span: true }),
  ];
}

function pageEconomie() {
  const skylab = SKYLAB_MODULES.map((m) => [`<b>${esc(m.name)}</b>`, esc(m.desc), m.upgradeable ? `1 → ${SKYLAB_MAX_LEVEL}` : "—"]);
  return [
    card("Boutique", list([
      "Vaisseaux, designs, lasers, générateurs, munitions, roquettes, drones, formations, P.E.T, boosters, tickets.",
      "Tout se paie en crédits ; un achat rejoint ton inventaire.",
      "Les objets marqués « Assemblage » ne se vendent pas : ils s'obtiennent à l'atelier ou en drop.",
    ])),
    card("Sources de crédits", list([
      "NPC (×2 en X-1 à X-4), bonus-box, quêtes, Galaxy Gates.",
      "Vente de minerais au comptoir (l'Osmium vaut le plus cher).",
      "Sun Box : énorme gain, non réduit par le BOT.",
    ])),
    card("Atelier (assemblage)", list([
      "Transforme les ressources d'assemblage (Scrap, Mucosum, Plasmide, Prismatium, Aurus, Bifenon, Tetrathrin, Kyhalon, Rinusk...) en équipement.",
      "Ces ressources ne prennent pas de place en soute.",
      "Certaines munitions, roquettes et formations s'obtiennent uniquement ici.",
    ])),
    card("Enchères", list([
      "Des lots tournent régulièrement ; le meilleur enchérisseur gagne à la clôture.",
      "Vérifie ton solde et l'heure de fin avant de surenchérir.",
    ])),
    card("Skylab", `<p>Production passive de minerais. Les modules montent de niveau avec crédits, ressources et temps.</p>` + table(["Module", "Rôle", "Niveaux"], skylab), { span: true }),
    card("Station de combat", list([
      "Une station se compose d'un cœur, de canons, de lance-roquettes et de modules (DMG, EXP, HON, REP).",
      "Les pièces s'achètent en boutique (onglet Station) ou aux enchères.",
    ]), { span: true }),
  ];
}

function pageBot() {
  return [
    card("Le BOT en bref", list([
      `Le BOT est autorisé, mais tout ce qu'il rapporte est réduit de ${gold("75 %")} (NPC et box). Seuls le palladium et les Sun Box gardent leur gain complet.`,
      "▶ démarre, ⏸ met en pause ; la touche Start / Stop Bot fait pareil.",
      "Il ne quitte jamais un NPC verrouillé pour une box, sauf si tu l'autorises.",
    ]), { span: true }),
    card("Tableau de bord", list([
      "Session en cours : durée, morts, crédits, XP, honneur, PDG, avec le gain par heure.",
      "Listes des NPC tués et des box ramassées.",
      "« Remettre à zéro » relance les compteurs.",
    ])),
    card("Configuration", list([
      "<b>Mode :</b> Kill, Collect, ou Kill & Collect (NPC d'abord, box d'abord, au plus proche).",
      "<b>Map de travail :</b> le BOT y voyage tout seul.",
      "<b>Compétences auto :</b> IEM, ISH, camouflage après un kill.",
      "<b>Fuite :</b> seuil de coque, retour base. <b>Si détruit :</b> lieu de réparation.",
      "<b>Configuration et formation</b> par phase : attaque, exploration / navigation, fuite.",
    ])),
    card("NPC", list([
      "Coche les NPC à attaquer, filtrés par map ou par Galaxy Gate.",
      "Priorité de −100 à 100 : un nombre négatif = cible immédiate (le plus négatif gagne).",
      "Par NPC : munition, SAB, salve (X6 / RCB), configuration et formation.",
    ])),
    card("Bonus Box", list(["Choisis les box à ramasser.", "Option : ramasser pendant un combat."])),
    card("P.E.T", list([
      "Activation, carburant et réparation automatiques.",
      "Comportement principal et secondaire (pendant la recharge d'un gear).",
      "Localisateur : le NPC suivi passe en priorité −1.",
      "Kamikaze automatique (si équipé).",
    ])),
    card("Soute", list([
      "Vente automatique à partir d'un seuil de remplissage (1 à 100 %).",
      "Base de vente : automatique, X-1, X-8 ou pirate 5-2.",
      "Raffinage automatique synchronisé avec la fenêtre Raffinage.",
      "Vente au comptoir minerai par minerai, palladium compris.",
    ])),
  ];
}

function pageSocial() {
  return [
    card("Groupe", list([
      "Invite un joueur ; l'invitation expire après 15 s.",
      "Le chef (couronne) peut verrouiller les invitations et exclure un membre.",
      "Chaque carte de membre montre vaisseau, map, distance, coque, bouclier et sa cible.",
      "Le chef peut poser un point de ralliement sur la mini-carte.",
    ])),
    card("Partage en groupe", list([
      "Sur la même map, crédits, XP et honneur des NPC sont partagés équitablement.",
      "Pas de partage des cargo-box, des récompenses de quête, ni en Galaxy Gate.",
      "Seul le vrai tueur compte dans les statistiques NPC & Grades.",
    ])),
    card("Amis, clan, chat", list([
      "Les demandes d'amis restent jusqu'à acceptation ou refus ; la fenêtre montre qui est en ligne.",
      "Être ami ne partage jamais les récompenses.",
      "Le clan affiche son tag à côté de ton pseudo.",
      "Le chat permet de discuter avec les autres pilotes connectés.",
    ])),
    card("Classements", list([
      "Général, expérience, honneur, vagues Eternal, grade.",
      "NPC & Grades : tes destructions et le calcul de tes points de grade.",
    ])),
    card("Compte et firme", list([
      "Paramètres → Compte : pseudo, email, mot de passe, nom du P.E.T.",
      `Changer de firme coûte ${gold("50 M")} de crédits + ${gold("50 %")} de l'honneur et annule tes quêtes.`,
      "Déconnexion et redémarrage depuis l'icône Session du dock.",
    ]), { span: true }),
  ];
}

function pageFaq() {
  const qa = (q, a) => card(q, a);
  return [
    qa("Je n'inflige aucun dégât", list(["Cible verrouillée ?", "Tir activé ?", "À portée ?", "Zone sûre ou NPC protégé ?", "Munition en stock ?"])),
    qa("Je meurs en boucle", list(["Redescends d'une map.", "Charge Duranium / Promerium sur le bouclier.", "Repars avec le bouclier plein.", "Garde une config 2 de fuite et utilise ISH / IEM."])),
    qa("Ma soute est pleine", list(["Vends au comptoir ou raffine.", "Active la vente automatique dans l'onglet Soute du BOT.", "Le gear Cargo Trader vend hors base."])),
    qa("Je ne peux pas entrer sur une map", list(["Vérifie le niveau requis (onglet Maps).", "Les gates demandent d'être construites (onglet Galaxy Gates)."])),
    qa("Une fenêtre a disparu", list(["Rouvre-la depuis le dock.", "La touche Masquer / restaurer ré-affiche tout.", "Paramètres → Réinitialiser les fenêtres."])),
    qa("Le BOT ne fait rien", list(["Au moins un NPC coché (mode Kill) ?", "La map de travail est-elle accessible ?", "La soute est-elle pleine sans vente auto ?", "Le P.E.T a-t-il du carburant ?"])),
    qa("Le jeu rame", list(["Paramètres : baisse la qualité graphique ou désactive des effets.", "Ferme les fenêtres inutiles."])),
    qa("Le son est trop fort", list(["Paramètres → Son : volume général + volume par effet."])),
  ];
}

const PAGES = [
  { id: "demarrage", label: "Démarrage", build: pageDemarrage },
  { id: "commandes", label: "Commandes", build: pageCommandes },
  { id: "vaisseaux", label: "Vaisseaux", build: pageVaisseaux },
  { id: "drones", label: "Drones & formations", build: pageDrones },
  { id: "equipement", label: "Équipement", build: pageEquipement },
  { id: "munitions", label: "Munitions", build: pageMunitions },
  { id: "combat", label: "Combat", build: pageCombat },
  { id: "npc", label: "NPC", build: pageNpc },
  { id: "maps", label: "Maps", build: pageMaps },
  { id: "minerais", label: "Minerais & soute", build: pageMinerais },
  { id: "box", label: "Bonus Box", build: pageBox },
  { id: "quetes", label: "Quêtes & passe", build: pageQuetes },
  { id: "progression", label: "Progression", build: pageProgression },
  { id: "galaxy", label: "Galaxy Gates", build: pageGates },
  { id: "pet", label: "P.E.T", build: pagePet },
  { id: "boosters", label: "Boosters", build: pageBoosters },
  { id: "economie", label: "Économie", build: pageEconomie },
  { id: "bot", label: "BOT", build: pageBot },
  { id: "social", label: "Social & compte", build: pageSocial },
  { id: "faq", label: "FAQ", build: pageFaq },
];

// ---------- Câblage ----------
export function wireWikiWindow(ctx = {}) {
  const root = document.getElementById("wikiWindow");
  if (!root || root.__wikiWired) return;
  root.__wikiWired = true;

  const tabsEl = root.querySelector("#wikiTabs");
  const pagesEl = root.querySelector("#wikiPages");
  const search = root.querySelector("#wikiSearch");
  const count = root.querySelector("#wikiCount");
  let current = "demarrage";
  let built = false;
  let npcEntries = null;

  function safe(build) {
    try { return build(ctx).join(""); } catch (error) {
      console.warn("[Wiki] page impossible à générer", error);
      return card("Page indisponible", "<p>Cette page n'a pas pu être générée.</p>", { span: true });
    }
  }

  function build() {
    if (built) return;
    built = true;
    tabsEl.innerHTML = PAGES.map((p) => `<button class="wikiTab${p.id === current ? " active" : ""}" data-wiki-tab="${p.id}" type="button"><span>${esc(p.label)}</span><em class="wikiHits"></em></button>`).join("");
    pagesEl.innerHTML = PAGES.map((p) => `<div class="wikiPage${p.id === current ? " active" : ""}" data-wiki-page="${p.id}">${safe(p.build)}</div>`).join("");
    tabsEl.querySelectorAll("[data-wiki-tab]").forEach((tab) => tab.addEventListener("click", () => showTab(tab.dataset.wikiTab)));
    watchSelects(root, { maxHeight: 308 });
    wireNpc();
    wireGates();
    applySearch();
  }

  function showTab(name) {
    current = name;
    for (const tab of tabsEl.querySelectorAll("[data-wiki-tab]")) tab.classList.toggle("active", tab.dataset.wikiTab === name);
    for (const page of pagesEl.querySelectorAll("[data-wiki-page]")) page.classList.toggle("active", page.dataset.wikiPage === name);
    pagesEl.scrollTop = 0;
  }

  // Recherche : filtre les cartes et les lignes de tableaux de toutes les pages.
  function applySearch() {
    if (!built) return;
    const query = (search?.value || "").trim().toLowerCase();
    let hits = 0;
    let firstHit = null;
    for (const page of pagesEl.querySelectorAll("[data-wiki-page]")) {
      let pageHits = 0;
      for (const cardEl of page.querySelectorAll(".wikiCard")) {
        if (!query) {
          cardEl.hidden = false;
          cardEl.querySelectorAll("tbody tr").forEach((tr) => { tr.hidden = false; });
          continue;
        }
        const titleHit = cardEl.querySelector(".wikiCardTitle").textContent.toLowerCase().includes(query);
        const rows = [...cardEl.querySelectorAll("tbody tr")];
        let rowHits = 0;
        for (const tr of rows) {
          const hit = titleHit || tr.textContent.toLowerCase().includes(query);
          tr.hidden = !hit;
          if (hit) rowHits += 1;
        }
        const textOnly = [...cardEl.querySelector(".wikiText").childNodes].filter((n) => !(n.classList?.contains("wikiTableWrap"))).map((n) => n.textContent).join(" ");
        const textHit = textOnly.toLowerCase().includes(query);
        const visible = titleHit || textHit || rowHits > 0;
        cardEl.hidden = !visible;
        if (visible) pageHits += titleHit || textHit ? Math.max(1, rowHits) : rowHits;
      }
      const tab = tabsEl.querySelector(`[data-wiki-tab="${page.dataset.wikiPage}"]`);
      const badge = tab?.querySelector(".wikiHits");
      if (badge) badge.textContent = query && pageHits ? String(pageHits) : "";
      tab?.classList.toggle("wikiNoHit", !!query && !pageHits);
      if (query && pageHits && !firstHit) firstHit = page.dataset.wikiPage;
      hits += pageHits;
    }
    if (count) count.textContent = query ? `${hits} résultat${hits > 1 ? "s" : ""}` : `${PAGES.length} rubriques`;
    const active = pagesEl.querySelector(`[data-wiki-page="${current}"]`);
    if (query && firstHit && active && ![...active.querySelectorAll(".wikiCard")].some((c) => !c.hidden)) showTab(firstHit);
  }

  // Bestiaire : NPC présents sur les maps et dans les gates (hors événement).
  function renderNpc() {
    const host = root.querySelector("#wikiNpcTable");
    if (!host || !npcEntries) return;
    const filter = root.querySelector("#wikiNpcFilter")?.value || "";
    const shown = npcEntries.filter((e) => !filter || e.maps.some((m) => botMapGroupKey(m) === filter));
    host.innerHTML = npcTableHtml(shown);
    const c = root.querySelector("#wikiNpcCount");
    if (c) c.textContent = `${shown.length} NPC`;
    applySearch();
  }
  function wireNpc() {
    const select = root.querySelector("#wikiNpcFilter");
    select?.addEventListener("change", renderNpc);
    loadNpcLocationIndex().then((locations) => {
      npcEntries = Object.entries(locations || {})
        .filter(([type, maps]) => NPC_TYPES[type] && maps?.length && halloweenRoleOf(type) == null)
        .map(([type, maps]) => ({ type, maps }))
        .map((e) => ({ ...e, group: e.maps.map(botMapGroupKey).sort(compareBotMapGroups)[0] }))
        // Par map (X-1 d'abord, gates à la fin), puis du plus faible au plus fort.
        .sort((a, b) => compareBotMapGroups(a.group, b.group) || (NPC_TYPES[a.type].hp || 0) - (NPC_TYPES[b.type].hp || 0) || npcName(a.type).localeCompare(npcName(b.type), "fr"));
      const groups = [...new Set(npcEntries.flatMap((e) => e.maps.map(botMapGroupKey)))].sort(compareBotMapGroups);
      if (select) select.innerHTML = `<option value="">Toutes les maps</option>${groups.map((g) => `<option value="${esc(g)}">${esc(botMapGroupLabel(g))}</option>`).join("")}`;
      renderNpc();
    }).catch((error) => {
      console.warn("[Wiki] bestiaire indisponible", error);
      const host = root.querySelector("#wikiNpcTable");
      if (host) host.innerHTML = `<p class="wikiMuted">Bestiaire indisponible.</p>`;
    });
  }

  // Vagues d'une gate : composition vague par vague, lue dans MAPS/<gate>/WAVES.js.
  async function renderGate() {
    const host = root.querySelector("#wikiGateWaves");
    const id = root.querySelector("#wikiGateFilter")?.value;
    if (!host || !id) return;
    try {
      const module = await import(`../MAPS/${GATE_WAVE_DIRS[id]}/WAVES.js`);
      const rows = (module.WAVE_PLANS || []).map((wave, index) => (index && wave?.length
        ? [gold(index), wave.map((s) => `${s.count ? `${num(s.count)} × ` : ""}${esc(npcName(s.type))}`).join(", ")]
        : null)).filter(Boolean);
      host.innerHTML = rows.length ? table(["Vague", "NPC"], rows) : `<p class="wikiMuted">Vagues générées en continu.</p>`;
    } catch (error) {
      console.warn("[Wiki] vagues indisponibles", error);
      host.innerHTML = `<p class="wikiMuted">Vagues indisponibles.</p>`;
    }
    applySearch();
  }
  function wireGates() {
    root.querySelector("#wikiGateFilter")?.addEventListener("change", renderGate);
    renderGate();
  }

  // Image introuvable : on tente le secours, sinon on la masque (pas de carré cassé).
  pagesEl.addEventListener("error", (event) => {
    const el = event.target;
    if (!(el instanceof HTMLImageElement)) return;
    const fallback = el.dataset.fallback;
    if (fallback && el.getAttribute("src") !== fallback) { el.src = fallback; return; }
    el.style.visibility = "hidden";
  }, true);
  search?.addEventListener("input", applySearch);
  window.addEventListener("orbit:window-restoring", (event) => {
    if (event.detail?.id !== "wikiWindow") return;
    build();
    // Les raccourcis ont pu changer dans les paramètres.
    const page = pagesEl.querySelector('[data-wiki-page="commandes"]');
    if (page) { page.innerHTML = safe(pageCommandes); applySearch(); }
  });
  window.addEventListener("orbit:window-restored", (event) => {
    if (event.detail?.id === "wikiWindow") search?.focus?.();
  });
  // Construit en arrière-plan si la fenêtre n'a pas encore été ouverte.
  setTimeout(build, 4000);
}
