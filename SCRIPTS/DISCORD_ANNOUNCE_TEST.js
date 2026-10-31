import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { dueAnnouncementKeys, GG_SUNDAY_END_MESSAGE, GG_SUNDAY_MESSAGE, parisNow, postDiscordMessage } from "./DISCORD_ANNOUNCE.js";

// Heure murale de Paris (même convention que parisNow) : 1er novembre 2026 = dimanche.
const paris = (day, hour, minute) => new Date(2026, 10, day, hour, minute);

test("annonces Discord : Dimanche GG à 00h01 et 23h59, UFONIT inchangé", () => {
  assert.deepEqual(dueAnnouncementKeys(paris(1, 0, 0)), []);
  assert.deepEqual(dueAnnouncementKeys(paris(1, 0, 1)), ["gg_sunday_start"]);
  assert.deepEqual(dueAnnouncementKeys(paris(1, 20, 0)), ["ufonit_start"]);
  assert.deepEqual(dueAnnouncementKeys(paris(1, 22, 30)), ["ufonit_end"]);
  assert.deepEqual(dueAnnouncementKeys(paris(8, 23, 59)), ["gg_sunday_end"]);
  // 1er novembre 2026 : fin d'Halloween à la même minute, les deux partent.
  assert.deepEqual(dueAnnouncementKeys(paris(1, 23, 59)), ["gg_sunday_end", "halloween_end"]);
  assert.deepEqual(dueAnnouncementKeys(paris(8, 0, 1)), ["gg_sunday_start"], "chaque dimanche");
  assert.deepEqual(dueAnnouncementKeys(paris(7, 0, 1)), [], "pas le samedi");
  assert.deepEqual(dueAnnouncementKeys(paris(2, 23, 59)), [], "pas le lundi");
});

test("annonces Discord : heure de Paris, été comme hiver", () => {
  // 00h01 Paris = 23h01 UTC la veille en hiver, 22h01 UTC en été.
  assert.deepEqual(dueAnnouncementKeys(parisNow(new Date(Date.UTC(2026, 9, 31, 23, 1)))), ["gg_sunday_start"]);
  assert.deepEqual(dueAnnouncementKeys(parisNow(new Date(Date.UTC(2027, 6, 3, 22, 1)))), ["gg_sunday_start"]);
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
    assert.ok(received[1].content.includes("FIN DU DIMANCHE GALAXY GATES"));
    assert.ok(GG_SUNDAY_MESSAGE.length <= 2000 && GG_SUNDAY_END_MESSAGE.length <= 2000, "limite Discord de 2000 caractères");
    assert.equal((await postDiscordMessage("", GG_SUNDAY_MESSAGE)).ok, false, "sans webhook : rien n'est envoyé");
  } finally {
    await new Promise((done) => server.close(done));
  }
});
