// Annonces Discord planifiées via webhook (aucune dépendance, fetch natif).
// - URL lue dans process.env.DISCORD_UFONIT_WEBHOOK (jamais en dur : une URL
//   de webhook permet de poster, c'est un secret).
// - UFONIT : chaque dimanche à 20h00 heure de Paris (rappel 30 min avant
//   l'event de 20h30). Ne poste que si le serveur tourne à ce moment-là.
// - Test manuel : DISCORD_UFONIT_WEBHOOK=<url> node SCRIPTS/DISCORD_ANNOUNCE.js --test
const PARIS_TZ = "Europe/Paris";

export const UFONIT_MESSAGE = `@everyone **__:alien: ÉVÉNEMENT UFONIT :alien:__**
**Tous les dimanches de __20h30__ à __22h30__**

**__:space_invader: L'UFONIT RÔDE__**
Il apparaît sur 4-1 / 4-2 / 4-3 / 4-4 (une seule map à la fois)
Il n'attaque pas et riposte pas, il ne fait que se balader
Tué ? Il respawn instantanément ailleurs, un seul à la fois

**__:package: LA LOTERIE__**
Aucune soute, aucune récompense classique
10 Joueurs tirées aléatoirement gagnerons une récompense aléatoire

**__:ticket: BONNE CHASSE__**
Que le meilleur gagne :four_leaf_clover:`;

export const UFONIT_END_MESSAGE = `@everyone **__:alien: ÉVÉNEMENT UFONIT TERMINEE :alien:__**`;

export const HALLOWEEN_MESSAGE = `@everyone **__:jack_o_lantern: ÉVÉNEMENT HALLOWEEN :jack_o_lantern:__**
**Du 16/10 à 23h59 au 01/11 à 23h59**

**__:space_invader: LES CURCUBITORS INVAHISSENT__**
Ils apparaissent sur toutes les maps **x-3 à x-8**
16 Curcubitors en continu, calibrés selon la map
Tuez-en **50** et **3 Boss Curcubitors** apparaissent
Éliminez les 3 boss et le cycle recommence

**__:package: LES BOX__**
**Pumpkin Box** sur toutes les maps (comme les bonus box)
Énergie GG x5, munitions x2, crédits, bonbons rares
**Box de Cucurbitors** et **Box de Boss Cucurbitors** en drop
Bonbons classiques et **dorés** à l'intérieur

**__:candy: LES BONBONS__**
À collecter partout, à dépenser à l'assemblage
Tout les bonbons / bonbons dorée non utilisée pendant l'évènements ne sont pas réinitialisée et conservée  

**__:ticket: PASSE DE COMBAT__**
**47 objectifs** à paliers : kills, dégâts, bonbons, box
Gagnez des **clés du passe**
**Boutique du passe** : modules commun → légendaire, ressources, **laser Xénocide**`;

export const HALLOWEEN_END_MESSAGE = `@everyone **__:jack_o_lantern: ÉVÉNEMENT HALLOWEEN TERMINEE :jack_o_lantern:__**`;

// Planification (heures de Paris) :
// - UFONIT : chaque dimanche 20h00 (rappel) + 22h30 (fin).
// - HALLOWEEN : chaque 15 octobre à 20h00.
// Même webhook pour tous.
const SCHEDULES = [
  { key: "ufonit_start", weekday: 0, hour: 20, minute: 0, message: () => UFONIT_MESSAGE, label: "rappel UFONIT" },
  { key: "ufonit_end", weekday: 0, hour: 22, minute: 30, message: () => UFONIT_END_MESSAGE, label: "fin UFONIT" },
  { key: "halloween_start", month: 10, day: 15, hour: 20, minute: 0, message: () => HALLOWEEN_MESSAGE, label: "Halloween" },
  { key: "halloween_end", month: 11, day: 1, hour: 23, minute: 59, message: () => HALLOWEEN_END_MESSAGE, label: "fin Halloween" },
];

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

let lastSentByKey = {};
function dayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function tickUfonit(log = console.log) {
  try {
    const now = parisNow();
    const key = dayKey(now);
    const url = process.env.DISCORD_UFONIT_WEBHOOK || "";
    for (const slot of SCHEDULES) {
      if (!slotDue(slot, now)) continue;
      const sentKey = `${slot.key}:${key}`;
      if (lastSentByKey[sentKey]) continue; // déjà posté ce dimanche
      if (!url) {
        if (!lastSentByKey[`${sentKey}:warned`]) {
          lastSentByKey[`${sentKey}:warned`] = true;
          log("[discord] DISCORD_UFONIT_WEBHOOK non défini : annonce UFONIT ignorée.");
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
  const isTest = process.argv.includes("--test");
  if (isTest) {
    const url = process.env.DISCORD_UFONIT_WEBHOOK || "";
    postDiscordMessage(url, UFONIT_MESSAGE).then((out) => {
      console.log(out.ok ? "OK : message posté." : `ÉCHEC : ${out.error}`);
      process.exit(out.ok ? 0 : 1);
    });
  } else {
    startDiscordAnnounce();
    console.log("[discord] Planificateur UFONIT actif (dimanche 20h00 Paris).");
  }
}
