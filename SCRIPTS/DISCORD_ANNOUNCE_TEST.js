import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import * as announce from "./DISCORD_ANNOUNCE.js";
import { dueAnnouncementKeys, GG_SUNDAY_END_MESSAGE, GG_SUNDAY_MESSAGE, parisNow, postDiscordMessage } from "./DISCORD_ANNOUNCE.js";

// Heure murale de Paris (même convention que parisNow) : 1er novembre 2026 = dimanche.
const paris = (day, hour, minute) => new Date(2026, 10, day, hour, minute);

test("annonces Discord : début 1 h avant l'événement, fin à l'heure de fin", () => {
  // Dimanche GG (00h01 → 23h59) : annonce samedi 23h01, fin dimanche 23h59.
  assert.deepEqual(dueAnnouncementKeys(paris(7, 23, 1)), ["gg_sunday_start"]);
  assert.deepEqual(dueAnnouncementKeys(paris(1, 0, 1)), [], "plus à 00h01");
  assert.deepEqual(dueAnnouncementKeys(paris(8, 23, 59)), ["gg_sunday_end"]);
  // UFONIT (20h30 → 22h30) : annonce 19h30, fin 22h30.
  assert.deepEqual(dueAnnouncementKeys(paris(1, 19, 30)), ["ufonit_start"]);
  assert.deepEqual(dueAnnouncementKeys(paris(1, 20, 0)), [], "plus à 20h00");
  assert.deepEqual(dueAnnouncementKeys(paris(1, 22, 30)), ["ufonit_end"]);
  // Halloween (16/10 23h59 → 01/11 23h59) : annonce 16/10 22h59.
  assert.deepEqual(dueAnnouncementKeys(new Date(2026, 9, 16, 22, 59)), ["halloween_start"]);
  assert.deepEqual(dueAnnouncementKeys(new Date(2026, 9, 15, 20, 0)), [], "plus le 15/10");
  // 1er novembre 2026 : fin d'Halloween à la même minute que la fin GG.
  assert.deepEqual(dueAnnouncementKeys(paris(1, 23, 59)), ["gg_sunday_end", "halloween_end"]);
  assert.deepEqual(dueAnnouncementKeys(paris(14, 23, 1)), ["gg_sunday_start"], "chaque samedi");
  assert.deepEqual(dueAnnouncementKeys(paris(2, 23, 59)), [], "pas le lundi");
  assert.deepEqual(announce.announcementSchedule().map((a) => `${a.key} ${a.when}`), [
    "gg_sunday_start samedi 23h01", "gg_sunday_end dimanche 23h59", "ufonit_start dimanche 19h30",
    "ufonit_end dimanche 22h30", "halloween_start 16/10 22h59", "halloween_end 01/11 23h59"]);
});

test("annonces Discord : heure de Paris, été comme hiver", () => {
  // Samedi 23h01 Paris = 22h01 UTC en hiver, 21h01 UTC en été.
  assert.deepEqual(dueAnnouncementKeys(parisNow(new Date(Date.UTC(2026, 9, 31, 22, 1)))), ["gg_sunday_start"]);
  assert.deepEqual(dueAnnouncementKeys(parisNow(new Date(Date.UTC(2027, 6, 3, 21, 1)))), ["gg_sunday_start"]);
});

test("annonces Discord : le message part bien vers le webhook", async () => {
  const received = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => { received.push(JSON.parse(Buffer.concat(chunks).toString("utf8"))); res.writeHead(204); res.end(); });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/webhooks/1/test`;
    assert.equal((await postDiscordMessage(url, GG_SUNDAY_MESSAGE)).ok, true);
    assert.equal((await postDiscordMessage(url, GG_SUNDAY_END_MESSAGE)).ok, true);
    assert.equal(received[0].content, GG_SUNDAY_MESSAGE);
    assert.ok(received[1].content.includes("FIN DE L'ÉVÉNEMENT DIMANCHE GALAXY GATES"));
    for (const [name, value] of Object.entries(announce)) {
      if (name.endsWith("_MESSAGE")) assert.ok(value.length <= 2000, `${name} : limite Discord de 2000 caractères`);
    }
    assert.equal((await postDiscordMessage("", GG_SUNDAY_MESSAGE)).ok, false, "sans webhook : rien n'est envoyé");
  } finally {
    await new Promise((done) => server.close(done));
  }
});

test("annonces Discord : les six messages suivent le même modèle", () => {
  for (const name of ["UFONIT", "HALLOWEEN", "GG_SUNDAY"]) {
    const start = announce[`${name}_MESSAGE`].split("\n");
    const end = announce[`${name}_END_MESSAGE`].split("\n");
    assert.equal(start[0], "@everyone", name);
    assert.match(start[1], /^# (:\w+:) ÉVÉNEMENT .+ \1$/, `${name} : titre de début`);
    assert.match(start[2], /^:clock3: \*\*.+\(heure de Paris\)\*\*$/, `${name} : horaire`);
    assert.equal(start.at(-1), "Bonne chasse à tous ! :rocket:", `${name} : mot de la fin`);
    assert.equal(end[0], "@everyone", name);
    assert.match(end[1], /^# (:\w+:) FIN DE L'ÉVÉNEMENT .+ \1$/, `${name} : titre de fin`);
    assert.match(end.at(-1), /^:calendar: \*\*Prochain rendez-vous : .+\*\*$/, `${name} : prochain rendez-vous`);
  }
});
