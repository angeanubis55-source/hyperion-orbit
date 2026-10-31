// Annonces Discord planifiées via webhook (aucune dépendance, fetch natif).
// - URL lue dans process.env.DISCORD_UFONIT_WEBHOOK (jamais en dur : une URL
//   de webhook permet de poster, c'est un secret).
// - UFONIT : chaque dimanche à 20h00 heure de Paris (rappel 30 min avant
//   l'event de 20h30). Ne poste que si le serveur tourne à ce moment-là.
// - Test manuel : DISCORD_UFONIT_WEBHOOK=<url> node SCRIPTS/DISCORD_ANNOUNCE.js --test
//   (vérifie le webhook sans @everyone ; --test-ufonit poste la vraie annonce)
import { HALLOWEEN_END, HALLOWEEN_START } from "../NPC/NPC_HALLOWEEN.js";
import { SUNDAY_END_MINUTES, SUNDAY_START_MINUTES, SUNDAY_WEEKDAY } from "../NPC/NPC_SUNDAY.js";
import { GALAXY_EVENT_END_MINUTES, GALAXY_EVENT_START_MINUTES, GALAXY_EVENT_WEEKDAY } from "../SRC/CORE/GALAXY_GATES.js";

const PARIS_TZ = "Europe/Paris";
// Annonce de début : 1 h avant l'événement ; annonce de fin : à l'heure de fin.
// Horaires lus dans les fichiers des événements : annonces et jeu restent alignés.
export const ANNOUNCE_LEAD_MINUTES = 60;

const pad = (n) => String(n).padStart(2, "0");
const hm = (minutes) => `${pad(Math.floor(minutes / 60))}h${pad(minutes % 60)}`;
// HALLOWEEN_START/END : mois 0-11, comme dans NPC_HALLOWEEN.js.
const dayAt = (at) => `${pad(at.day)}/${pad(at.month + 1)} à ${hm(at.hour * 60 + at.minute)}`;

// Toutes les annonces suivent le même modèle :
// - début : @everyone, titre "# E ÉVÉNEMENT NOM E", ligne :clock3: (quand,
//   heure de Paris), phrase d'accroche, sections "E **Titre**" en citations,
//   mot de la fin ;
// - fin : @everyone, titre "# E FIN DE L'ÉVÉNEMENT NOM E", remerciement,
//   ligne :calendar: du prochain rendez-vous.
export const UFONIT_MESSAGE = `@everyone
# :alien: ÉVÉNEMENT UFONIT :alien:
:clock3: **Ce soir de ${hm(SUNDAY_START_MINUTES)} à ${hm(SUNDAY_END_MINUTES)} (heure de Paris)**
L'UFONIT débarque dans le secteur 4 !

:satellite: **Où le trouver**
> Sur **4-1, 4-2, 4-3 et 4-4**, une seule map à la fois
> Il n'attaque pas et ne riposte pas
> Vos dégâts sur lui sont multipliés par **x15**
> Détruit, il réapparaît aussitôt ailleurs

:slot_machine: **La loterie**
> À chaque UFONIT détruit, les **10 joueurs qui lui ont fait le plus de dégâts** tentent leur chance
> **25 %** : un module (commun ou rare)
> **25 %** : un ticket de relance de module
> **10 %** : **50 000** munitions X4
> **40 %** : rien cette fois

Bonne chasse à tous ! :rocket:`;

export const UFONIT_END_MESSAGE = `@everyone
# :alien: FIN DE L'ÉVÉNEMENT UFONIT :alien:
L'UFONIT a quitté le secteur. Merci à tous d'avoir participé !

:calendar: **Prochain rendez-vous : dimanche prochain de ${hm(SUNDAY_START_MINUTES)} à ${hm(SUNDAY_END_MINUTES)}**`;

export const HALLOWEEN_MESSAGE = `@everyone
# :jack_o_lantern: ÉVÉNEMENT HALLOWEEN :jack_o_lantern:
:clock3: **Du ${dayAt(HALLOWEEN_START)} au ${dayAt(HALLOWEEN_END)} (heure de Paris)**
Les Curcubitors envahissent les maps x-3 à x-8 !

:space_invader: **Les Curcubitors**
> **16** Curcubitors en continu par map, adaptés à chaque map
> Tuez-en **50** et **3 Boss Curcubitors** apparaissent
> Éliminez les 3 boss et le cycle recommence

:package: **Les box**
> **Pumpkin Box** sur toutes ces maps : énergie GG x5, munitions x2, crédits et bonbons rares
> **Box de Cucurbitors** et **Box de Boss Cucurbitors** sur les NPC : bonbons classiques et **dorés**

:candy: **Les bonbons**
> À dépenser à l'**assemblage**
> Les bonbons non utilisés sont **conservés** après l'événement

:ticket: **Le passe de combat**
> **47 objectifs** à paliers : kills, dégâts, bonbons, box
> Gagnez des **clés du passe**
> Boutique du passe : modules (commun à légendaire), ressources et **laser Xénocide**

Bonne chasse à tous ! :rocket:`;

export const HALLOWEEN_END_MESSAGE = `@everyone
# :jack_o_lantern: FIN DE L'ÉVÉNEMENT HALLOWEEN :jack_o_lantern:
Les Curcubitors ont disparu. Merci à tous d'avoir participé !
> Vos bonbons restants sont **conservés** pour l'an prochain

:calendar: **Prochain rendez-vous : le ${pad(HALLOWEEN_START.day)}/${pad(HALLOWEEN_START.month + 1)} de l'année prochaine**`;

export const GG_SUNDAY_MESSAGE = `@everyone
# :cyclone: ÉVÉNEMENT DIMANCHE GALAXY GATES :cyclone:
:clock3: **Ce dimanche de ${hm(GALAXY_EVENT_START_MINUTES)} à ${hm(GALAXY_EVENT_END_MINUTES)} (heure de Paris)**
Les Galaxy Gates classiques sont en promo toute la journée !

:moneybag: **Spins à -25 %**
> Le spin passe de ~~125 000~~ à **93 750 crédits**

:gift: **Récompenses finales x2**
> XP, honneur, UCB-100, Xénomit et ressources **doublés**
> Designs de drones et équipements doublés si vous les obtenez
> Les crédits restent inchangés
> C'est **l'heure de fin de la GG** qui compte

:white_check_mark: **GG concernées**
> Alpha, Beta, Gamma, Delta, Epsilon, Zeta, Kappa, Lambda et Awakened
> Kronos n'est pas concernée

Bonne chasse à tous ! :rocket:`;

export const GG_SUNDAY_END_MESSAGE = `@everyone
# :cyclone: FIN DE L'ÉVÉNEMENT DIMANCHE GALAXY GATES :cyclone:
Les spins et les récompenses reviennent à la normale. Merci à tous d'avoir participé !

:calendar: **Prochain rendez-vous : dimanche prochain dès ${hm(GALAXY_EVENT_START_MINUTES)}**`;

// Créneau hebdomadaire (jour 0 = dimanche, minutes depuis minuit) décalé de
// `offset` minutes ; passe au jour précédent si besoin (00h01 - 1 h = samedi 23h01).
function weekly(weekday, minutes, offset = 0) {
  const week = 7 * 1440;
  const total = (((weekday * 1440 + minutes + offset) % week) + week) % week;
  return { weekday: Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
}
// Créneau annuel (mois 0-11) décalé de `offset` minutes ; mois 1-12 en sortie.
function yearly(at, offset = 0) {
  const d = new Date(Date.UTC(2001, at.month, at.day, at.hour, at.minute + offset));
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

// Planification (heures de Paris), même webhook pour tous :
// - Dimanche Galaxy Gates : samedi 23h01 (1 h avant 00h01) + dimanche 23h59.
// - UFONIT : dimanche 19h30 (1 h avant 20h30) + 22h30.
// - Halloween : 1 h avant HALLOWEEN_START + à HALLOWEEN_END.
const SCHEDULES = [
  { key: "gg_sunday_start", ...weekly(GALAXY_EVENT_WEEKDAY, GALAXY_EVENT_START_MINUTES, -ANNOUNCE_LEAD_MINUTES), message: () => GG_SUNDAY_MESSAGE, label: "début Dimanche GG" },
  { key: "gg_sunday_end", ...weekly(GALAXY_EVENT_WEEKDAY, GALAXY_EVENT_END_MINUTES), message: () => GG_SUNDAY_END_MESSAGE, label: "fin Dimanche GG" },
  { key: "ufonit_start", ...weekly(SUNDAY_WEEKDAY, SUNDAY_START_MINUTES, -ANNOUNCE_LEAD_MINUTES), message: () => UFONIT_MESSAGE, label: "UFONIT" },
  { key: "ufonit_end", ...weekly(SUNDAY_WEEKDAY, SUNDAY_END_MINUTES), message: () => UFONIT_END_MESSAGE, label: "fin UFONIT" },
  { key: "halloween_start", ...yearly(HALLOWEEN_START, -ANNOUNCE_LEAD_MINUTES), message: () => HALLOWEEN_MESSAGE, label: "Halloween" },
  { key: "halloween_end", ...yearly(HALLOWEEN_END), message: () => HALLOWEEN_END_MESSAGE, label: "fin Halloween" },
];

// Horaires d'envoi lisibles (journal de démarrage, tests).
export function announcementSchedule() {
  const days = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  return SCHEDULES.map((slot) => ({ key: slot.key,
    when: `${slot.month != null ? `${pad(slot.day)}/${pad(slot.month)}` : days[slot.weekday]} ${pad(slot.hour)}h${pad(slot.minute)}` }));
}

// Annonces à poster à cette minute (heure de Paris vue par parisNow).
export function dueAnnouncementKeys(now) {
  return SCHEDULES.filter((slot) => slotDue(slot, now)).map((slot) => slot.key);
}

function slotDue(slot, now) {
  if (now.getHours() !== slot.hour || now.getMinutes() !== slot.minute) return false;
  if (slot.month != null && slot.day != null) {
    return now.getMonth() + 1 === slot.month && now.getDate() === slot.day;
  }
  return now.getDay() === slot.weekday;
}

// Horloge murale de Paris vue comme un Date local (getDay/getHours/getMinutes
// utilisables directement), sans dépendance.
export function parisNow(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: PARIS_TZ }));
}

export async function postDiscordMessage(webhookUrl, content) {
  if (!webhookUrl) return { ok: false, error: "Webhook manquant." };
  const res = await fetch(String(webhookUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: String(content ?? "") }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Discord HTTP ${res.status} ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

// DISCORD_UFONIT_WEBHOOK (nom historique) ou DISCORD_WEBHOOK.
export function discordWebhookUrl() {
  return String(process.env.DISCORD_UFONIT_WEBHOOK || process.env.DISCORD_WEBHOOK || "").trim();
}

let lastSentByKey = {};
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function tickUfonit(log = console.log) {
  try {
    const now = parisNow();
    const key = dayKey(now);
    const url = discordWebhookUrl();
    for (const slot of SCHEDULES) {
      if (!slotDue(slot, now)) continue;
      const sentKey = `${slot.key}:${key}`;
      if (lastSentByKey[sentKey]) continue; // déjà posté ce dimanche
      if (!url) {
        if (!lastSentByKey[`${sentKey}:warned`]) {
          lastSentByKey[`${sentKey}:warned`] = true;
          log(`[discord] Webhook non défini (DISCORD_UFONIT_WEBHOOK ou DISCORD_WEBHOOK) : annonce ${slot.label} ignorée.`);
        }
        continue;
      }
      const out = await postDiscordMessage(url, slot.message());
      if (out.ok) {
        lastSentByKey[sentKey] = true;
        log(`[discord] Annonce ${slot.label} postée (${key} ${String(slot.hour).padStart(2, "0")}h${String(slot.minute).padStart(2, "0")} Paris).`);
      } else {
        log(`[discord] Échec annonce ${slot.label} : ${out.error} (nouvel essai à la prochaine minute).`);
      }
    }
  } catch (e) { try { log(`[discord] tick UFONIT : ${e?.message || e}`); } catch {} }
}

export function startDiscordAnnounce({ intervalMs = 30_000 } = {}) {
  try { tickUfonit(); } catch {}
  const timer = setInterval(() => { tickUfonit(); }, Math.max(10_000, intervalMs));
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

// Lancement direct : envoi immédiat (test manuel).
const invoked = String(process.argv?.[1] || "").replace(/\\/g, "/");
if (invoked.endsWith("/SCRIPTS/DISCORD_ANNOUNCE.js") || invoked.endsWith("DISCORD_ANNOUNCE.js")) {
  const isTest = process.argv.includes("--test") || process.argv.includes("--test-ufonit");
  if (isTest) {
    const url = discordWebhookUrl();
    const content = process.argv.includes("--test-ufonit") ? UFONIT_MESSAGE : "Test du webhook Hyperion Orbit : les annonces automatiques fonctionnent.";
    postDiscordMessage(url, content).then((out) => {
      console.log(out.ok ? "OK : message posté." : `ÉCHEC : ${out.error}`);
      process.exit(out.ok ? 0 : 1);
    });
  } else {
    startDiscordAnnounce();
    console.log(`[discord] Planificateur actif : ${announcementSchedule().map((a) => `${a.key} ${a.when}`).join(", ")}.`);
  }
}
