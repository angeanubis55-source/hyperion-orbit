// Classement Winter : dates des 6 classements, gains par place, versement
// de fin de classement et réclamation (SQLite éphémère, aucun compte réel).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  WINTER_RANKING_REWARDS, WINTER_RANKING_TOP, compareWinterStanding, isWinterGateActive,
  winterFinalStandings, winterFrostPointsFor, winterPeriodFrostPoints, winterRankingPeriod,
  winterRankingPeriods, winterRankingReward,
} from "../SRC/CORE/WINTER_CONVOY.js";

const dataDir = mkdtempSync(join(tmpdir(), "orbit-winter-ranking-"));
process.env.ORBIT_DATA_DIR = dataDir;
const server = await import("./ACCOUNT_SERVER.js");
const { initAccountDb, payoutWinterRankings, claimWinterRankingRewards, handleAccountApi, WINTER_RANKING_PAYOUT_DELAY_MS } = server;
const db = initAccountDb();
test.after(() => {
  try { db.close(); } catch {}
  try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
});

// Heures de Paris (UTC+1 en novembre / décembre).
const paris = (iso) => Date.parse(`${iso}+01:00`);
const [P1, P2, P3, P4, P5, P6] = winterRankingPeriods(2026);
const afterPayout = (period) => period.endAt + WINTER_RANKING_PAYOUT_DELAY_MS;

let nextId = 0;
function addPilot(pseudo, winter, extra = {}) {
  const id = `wr_${++nextId}`;
  const now = Date.now();
  const data = {
    id, pseudo, faction: "mmo", credits: 1000, revision: 1,
    stats: { exp: 500, honor: 50, rankPoints: 0, lifetimeKills: 0 },
    ammo: { x2: 7, ice: 3 },
    ...(winter ? { winter } : {}),
    ...extra,
  };
  db.prepare(`INSERT INTO users (id, pseudo, pseudo_norm, email, faction, password_hash, data, revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'mmo', 'x', ?, 1, ?, ?)`).run(id, pseudo, pseudo.toLowerCase(), `${id}@example.test`, JSON.stringify(data), now, now);
  return id;
}
const account = (id) => JSON.parse(db.prepare("SELECT data FROM users WHERE id = ?").get(id).data);
const revision = (id) => Number(db.prepare("SELECT revision FROM users WHERE id = ?").get(id).revision);
const rewardRows = (key) => db.prepare("SELECT user_id, rank, frost_points, reward, claimed_at FROM winter_ranking_rewards WHERE period_key = ? ORDER BY rank").all(key);

test("6 classements par saison, de minuit à minuit (Paris), le 1er démarre avec l'hiver", () => {
  assert.deepEqual(winterRankingPeriods(2026).map((p) => p.key), ["2026-1", "2026-2", "2026-3", "2026-4", "2026-5", "2026-6"]);
  assert.equal(P1.startAt, paris("2026-11-02T00:01:00"));
  assert.deepEqual([P1, P2, P3, P4, P5, P6].map((p) => p.endAt), [
    paris("2026-11-09T00:00:00"), paris("2026-11-16T00:00:00"), paris("2026-11-23T00:00:00"),
    paris("2026-11-30T00:00:00"), paris("2026-12-07T00:00:00"), paris("2026-12-14T00:00:00"),
  ]);
  for (let i = 1; i < 6; i++) assert.equal(winterRankingPeriods(2026)[i].startAt, winterRankingPeriods(2026)[i - 1].endAt);
  assert.equal(winterRankingPeriod(paris("2026-11-02T00:00:59")), null);
  assert.equal(winterRankingPeriod(paris("2026-11-08T23:59:59")).key, "2026-1");
  assert.equal(winterRankingPeriod(paris("2026-11-09T00:00:00")).key, "2026-2");
  assert.equal(winterRankingPeriod(paris("2026-12-03T12:00:00")).key, "2026-5");
  assert.equal(winterRankingPeriod(paris("2026-12-13T23:59:59")).key, "2026-6");
  assert.equal(winterRankingPeriod(paris("2026-12-14T00:00:00")), null);
  assert.equal(winterRankingPeriod(paris("2027-11-20T12:00:00")).key, "2027-3");
  // GG d'hiver : jouable pendant les classements seulement.
  if (process.env.WINTER_FORCE !== "1") {
    assert.equal(isWinterGateActive(paris("2026-11-01T12:00:00")), false);
    assert.equal(isWinterGateActive(paris("2026-11-20T12:00:00")), true);
    assert.equal(isWinterGateActive(paris("2026-12-20T12:00:00")), false);
    assert.equal(isWinterGateActive(paris("2027-01-10T12:00:00")), false);
  }
});

test("gains : 1er = 1 Md crédits / 1 Md XP / 100 M honneur / 1 M ICE, /2 par place, fixe dès le 10e, ICE >= 10 000", () => {
  assert.equal(WINTER_RANKING_REWARDS.length, WINTER_RANKING_TOP);
  assert.equal(WINTER_RANKING_TOP, 30);
  assert.deepEqual({ ...winterRankingReward(1) }, { rank: 1, credits: 1e9, exp: 1e9, honor: 1e8, ice: 1e6 });
  assert.deepEqual({ ...winterRankingReward(2) }, { rank: 2, credits: 5e8, exp: 5e8, honor: 5e7, ice: 5e5 });
  for (let rank = 2; rank <= 10; rank++) {
    const a = winterRankingReward(rank - 1), b = winterRankingReward(rank);
    assert.equal(b.credits, Math.floor(a.credits / 2), `crédits ${rank}`);
    assert.ok(b.credits < a.credits && b.exp < a.exp && b.honor < a.honor);
    assert.ok(b.ice <= a.ice && b.ice >= 10000);
  }
  for (let rank = 11; rank <= 30; rank++) {
    const { credits, exp, honor, ice } = winterRankingReward(rank);
    const ten = winterRankingReward(10);
    assert.deepEqual({ credits, exp, honor, ice }, { credits: ten.credits, exp: ten.exp, honor: ten.honor, ice: 10000 });
  }
  assert.ok(WINTER_RANKING_REWARDS.every((r) => r.credits > 1 && r.ice >= 10000));
  assert.equal(winterRankingReward(0), null);
  assert.equal(winterRankingReward(31), null);
});

test("points givrés : comptés pour leur classement seulement (anciens comptes = 2026-1)", () => {
  assert.equal(winterFrostPointsFor({ frostPoints: 40, frostPeriod: "2026-2" }, "2026-2"), 40);
  assert.equal(winterFrostPointsFor({ frostPoints: 40, frostPeriod: "2026-2" }, "2026-3"), 0);
  assert.equal(winterFrostPointsFor({ frostPoints: 40 }, "2026-1"), 40);
  assert.equal(winterFrostPointsFor({ frostPoints: 40 }, "2027-1"), 0);
  assert.equal(winterFrostPointsFor(null, "2026-1"), 0);
  assert.equal(winterFrostPointsFor({ frostPoints: 40, frostPeriod: "2026-2" }, null), 0);
  assert.equal(winterPeriodFrostPoints({ frostPoints: 9, frostPeriod: "2026-4" }, paris("2026-11-25T12:00:00")), 9);
  assert.equal(winterPeriodFrostPoints({ frostPoints: 9, frostPeriod: "2026-4" }, paris("2026-12-01T12:00:00")), 0);
  assert.equal(winterPeriodFrostPoints({ frostPoints: 9, frostPeriod: "2026-6" }, paris("2026-12-20T12:00:00")), 0);
});

test("classement final : top 30 > 0 point, égalités départagées par pseudo", () => {
  const rows = [
    { pseudo: "Zed", frostPoints: 50 }, { pseudo: "Abel", frostPoints: 50 }, { pseudo: "Nul", frostPoints: 0 },
    { pseudo: "Max", frostPoints: 90 },
    ...Array.from({ length: 40 }, (_, i) => ({ pseudo: `P${String(i).padStart(2, "0")}`, frostPoints: 10 + i % 3 })),
  ];
  const standings = winterFinalStandings(rows);
  assert.equal(standings.length, 30);
  assert.deepEqual(standings.slice(0, 3).map((s) => [s.rank, s.pseudo]), [[1, "Max"], [2, "Abel"], [3, "Zed"]]);
  assert.ok(standings.every((s, i) => s.rank === i + 1 && s.reward === winterRankingReward(i + 1)));
  assert.ok(!standings.some((s) => s.pseudo === "Nul"));
  for (let i = 1; i < standings.length; i++) assert.ok(compareWinterStanding(standings[i - 1], standings[i]) <= 0);
  assert.deepEqual(winterFinalStandings([]), []);
});

test("versement : rien avant la fin (+ délai), top 30 figé une seule fois, autres classements ignorés", () => {
  const ids = [];
  for (let i = 0; i < 32; i++) ids.push(addPilot(`Givre${String(i).padStart(2, "0")}`, { frostPoints: 1000 - i, frostPeriod: "2026-2" }));
  const legacy = addPilot("Ancien", { frostPoints: 77 });
  const other = addPilot("Autre", { frostPoints: 5000, frostPeriod: "2026-3" });
  const none = addPilot("SansHiver", null);

  // 2026-1 est terminé depuis une semaine : versé dès ce premier passage.
  assert.deepEqual(payoutWinterRankings(P2.endAt - 1).map((p) => p.periodKey), ["2026-1"]);
  assert.deepEqual(payoutWinterRankings(afterPayout(P2) - 1), []);
  assert.equal(rewardRows("2026-2").length, 0, "pas avant la fin + délai");
  assert.equal(db.prepare("SELECT 1 FROM winter_ranking_payouts WHERE period_key = '2026-2'").get(), undefined);

  const paid = payoutWinterRankings(afterPayout(P2));
  assert.deepEqual(paid.map((p) => p.periodKey), ["2026-2"]);
  assert.deepEqual(paid[0].winners.slice(0, 2).map((w) => [w.pseudo, w.rank]), [["Givre00", 1], ["Givre01", 2]]);
  const rows = rewardRows("2026-2");
  assert.equal(rows.length, 30);
  assert.deepEqual(rows.map((r) => r.user_id), ids.slice(0, 30));
  assert.ok(rows.every((r, i) => r.rank === i + 1 && r.frost_points === 1000 - i && r.claimed_at === 0));
  const { rank: _rank, ...first } = winterRankingReward(1);
  assert.deepEqual(JSON.parse(rows[0].reward), first);
  assert.ok(!rows.some((r) => [ids[30], ids[31], other, none, legacy].includes(r.user_id)));
  // Ancien compte sans frostPeriod : classement 2026-1.
  assert.deepEqual(rewardRows("2026-1").map((r) => [r.user_id, r.rank]), [[legacy, 1]]);
  // 2026-3 pas encore terminé.
  assert.equal(rewardRows("2026-3").length, 0);

  // Idempotent : un second passage (ou un redémarrage) ne refait rien.
  assert.deepEqual(payoutWinterRankings(afterPayout(P2) + 60_000), []);
  assert.equal(rewardRows("2026-2").length, 30);
  assert.equal(db.prepare("SELECT winners FROM winter_ranking_payouts WHERE period_key = '2026-2'").get().winners, 30);
  // Points gagnés après coup : le classement versé ne bouge plus.
  db.prepare("UPDATE users SET data = ? WHERE id = ?").run(JSON.stringify({ ...account(ids[31]), winter: { frostPoints: 99999, frostPeriod: "2026-2" } }), ids[31]);
  payoutWinterRankings(afterPayout(P2) + 120_000);
  assert.ok(!rewardRows("2026-2").some((r) => r.user_id === ids[31]));
});

test("réclamation : crédits, XP, honneur, ICE-100 ajoutés une seule fois, le reste du compte intact", () => {
  const winner = db.prepare("SELECT user_id FROM winter_ranking_rewards WHERE period_key = '2026-2' AND rank = 3").get().user_id;
  const before = account(winner), beforeRev = revision(winner);
  const reward = winterRankingReward(3);
  const now = afterPayout(P2) + 5_000;
  const out = claimWinterRankingRewards(winner, now);
  assert.equal(out.ok, true);
  assert.deepEqual(out.rewards, [{ periodKey: "2026-2", rank: 3, frostPoints: 998, credits: reward.credits, exp: reward.exp, honor: reward.honor, ice: reward.ice }]);
  const after = account(winner);
  assert.equal(after.credits, before.credits + reward.credits);
  assert.equal(after.stats.exp, before.stats.exp + reward.exp);
  assert.equal(after.stats.honor, before.stats.honor + reward.honor);
  assert.ok(after.stats.rankPoints > before.stats.rankPoints);
  assert.equal(after.ammo.ice, before.ammo.ice + reward.ice);
  assert.equal(after.ammo.x2, before.ammo.x2);
  assert.deepEqual(after.winter, before.winter);
  assert.equal(revision(winner), beforeRev + 1);
  assert.equal(after.revision, beforeRev + 1);
  assert.equal(out.user.credits, after.credits);
  assert.equal(out.user.revision, after.revision);
  assert.ok(rewardRows("2026-2").find((r) => r.user_id === winner).claimed_at === now);

  // Deuxième réclamation : rien, compte inchangé.
  const again = claimWinterRankingRewards(winner, now + 1000);
  assert.deepEqual(again, { ok: true, rewards: [] });
  assert.equal(account(winner).credits, after.credits);
  assert.equal(revision(winner), beforeRev + 1);
});

test("réclamation : plusieurs classements cumulés pour un joueur revenu plus tard, non-gagnant sans effet", () => {
  // Gagnant de 2026-3 et 2026-4 sans se connecter entre les deux.
  const id = addPilot("Absent", { frostPoints: 10, frostPeriod: "2026-3" });
  payoutWinterRankings(afterPayout(P3));
  db.prepare("UPDATE users SET data = ? WHERE id = ?").run(JSON.stringify({ ...account(id), winter: { frostPoints: 10, frostPeriod: "2026-4" } }), id);
  payoutWinterRankings(afterPayout(P4));
  const rank3 = rewardRows("2026-3").find((r) => r.user_id === id).rank;
  const rank4 = rewardRows("2026-4").find((r) => r.user_id === id).rank;
  assert.equal(rank3, 2); // "Autre" (5000 points) est 1er de 2026-3.
  assert.equal(rank4, 1);
  const before = account(id);
  const out = claimWinterRankingRewards(id, afterPayout(P4) + 1);
  assert.deepEqual(out.rewards.map((r) => [r.periodKey, r.rank]), [["2026-3", 2], ["2026-4", 1]]);
  const after = account(id);
  assert.equal(after.credits, before.credits + winterRankingReward(2).credits + winterRankingReward(1).credits);
  assert.equal(after.ammo.ice, before.ammo.ice + winterRankingReward(2).ice + winterRankingReward(1).ice);

  const nobody = addPilot("Spectateur", null);
  const creditsBefore = account(nobody).credits, revBefore = revision(nobody);
  assert.deepEqual(claimWinterRankingRewards(nobody, afterPayout(P4) + 2), { ok: true, rewards: [] });
  assert.equal(account(nobody).credits, creditsBefore);
  assert.equal(revision(nobody), revBefore);
  assert.equal(claimWinterRankingRewards("", afterPayout(P4)).ok, false);
});

test("POST /api/winter/claim : session requise, gains renvoyés avec le compte à jour", async () => {
  const id = addPilot("ViaApi", { frostPoints: 3, frostPeriod: "2026-5" });
  payoutWinterRankings(afterPayout(P5));
  const token = "winter-ranking-test-token";
  db.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(createHash("sha256").update(`session::${token}`, "utf8").digest("hex"), id, Date.now(), Date.now() + 3600_000);
  const call = (headers = {}) => new Promise((resolve) => {
    const req = { url: "/api/winter/claim", method: "POST", headers, socket: { remoteAddress: `winter-${Math.random()}` }, on() {} };
    const res = { status: 0, writeHead(code) { this.status = code; }, end(body) { resolve({ status: this.status, body: JSON.parse(body) }); } };
    assert.equal(handleAccountApi(req, res), true);
  });
  assert.equal((await call()).status, 401);
  const first = await call({ authorization: `Bearer ${token}` });
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.deepEqual(first.body.rewards.map((r) => [r.periodKey, r.rank]), [["2026-5", 1]]);
  assert.equal(first.body.user.credits, 1000 + winterRankingReward(1).credits);
  assert.equal(first.body.user.ammo.ice, 3 + winterRankingReward(1).ice);
  const second = await call({ authorization: `Bearer ${token}` });
  assert.deepEqual(second.body.rewards, []);
  assert.equal(second.body.user, undefined);
});

test("compte supprimé : ses gains en attente disparaissent", () => {
  const id = addPilot("Parti", { frostPoints: 1, frostPeriod: "2026-6" });
  payoutWinterRankings(afterPayout(P6));
  assert.ok(rewardRows("2026-6").some((r) => r.user_id === id));
  const out = server.adminDeleteAccount("Parti");
  assert.equal(out?.ok, true, JSON.stringify(out));
  assert.ok(!rewardRows("2026-6").some((r) => r.user_id === id));
});
