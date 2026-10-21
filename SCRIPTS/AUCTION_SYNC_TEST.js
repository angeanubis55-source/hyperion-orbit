import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { auctionMinNextBid, normalizeAuctionState, AUCTION_CYCLE_VERSION } from "../SRC/DATA/AUCTION.js";
import { buildHourlyLots, AUCTION_ACTIVE_LOTS } from "../SRC/DATA/AUCTION.js";

test("lots horaires : 32 lots fixes (22 + 10 Base de Combat), sans Xénocide, ticket dernier", () => {
  const item = (id, price = 1000000) => ({ id, name: id, icon: "", price, give: {} });
  const catalog = {
    ammo: [item("ammo_x2"), item("ammo_x3"), item("ammo_x4"), { ...item("ammo_x6"), give: { ammo: { x6: 1000 } } }],
    shields: [item("shd_sg3nb02")],
    gens: [item("spd_g3n7900")],
    lasers: [item("laser_lf2"), item("laser_lf3"), item("laser_lf4"), item("laser_lf5"), item("laser_lf6")],
    drones: [item("drone_iris")],
    rockets: [{ ...item("rocket_plt3030"), give: { rockets: { plt3030: 10 } } }, { ...item("rocket_plt2021"), give: { rockets: { plt2021: 10 } } }],
    boosters: [item("booster_ep"), item("booster_dmg"), item("booster_hp"), item("booster_shd")],
    ships: [item("ship_goliath"), item("ship_vengeance"), item("ship_leonov")],
    designs: [{ id: "design_x", name: "Design X", icon: "", price: 1000, design: { id: "design_x" } }],
    tickets: [item("ticket_module_reroll")],
  };
  const lots = buildHourlyLots(catalog, {}, Date.now(), () => 0.5);
  assert.equal(lots.length, 32, "32 lots fixes (22 + 10 Base de Combat)");
  assert.equal(lots.length, AUCTION_ACTIVE_LOTS, "cap = lots réels");
  assert.equal(lots.filter((l) => l.kind === "resources").length, 10, "10 lots Base de Combat");
  assert.ok(lots.every((l) => l.catalogId !== "laser_lf6"), "pas de Xénocide aux enchères");
  assert.ok(lots.some((l) => l.catalogId === "laser_lf5"), "LF-5 toujours là");
  assert.equal(lots[lots.length - 1].catalogId, "ticket_module_reroll", "ticket toujours dernier");
});

const source = readFileSync(new URL("../SRC/CORE/AUCTION_NET.js", import.meta.url), "utf8")
  .replace(/^import [\s\S]*? from .*?;\r?\n/gm, "").replace(/^export /gm, "");
function client(id = "pilot", storage = new Map()) {
  let user = { id, pseudo: "Pilot", credits: 10000, auction: { lots: [], history: [] } }, won = 0;
  const inbox = [], sent = [];
  const api = vm.createContext({ Date, normalizeAuctionState, auctionMinNextBid, AUCTION_CYCLE_VERSION,
    drainNetAuctionInbox: () => inbox.splice(0), sendAuctionBid: (key, amount) => { sent.push({ key, amount }); return true; },
    netConnected: () => true, netIsAuthed: () => true, netMyId: () => id, setSharedAuctionMode() {},
    applySharedAuctionWin: () => { won++; return { ok: true }; }, pushSharedAuctionExpired() {},
    getCurrentUserForMutation: () => structuredClone(user), saveUser: u => { user = structuredClone(u); },
    localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
  });
  vm.runInContext(source, api);
  const lot = { key: "ammo_x3", catalogId: "ammo_x3", name: "MCB-50", kind: "catalog", qty: 10,
    shopPrice: 150000, startPrice: 100, endsAt: Date.now() + 60000, topBid: 0, topBidder: "", topBidderId: "" };
  const message = msg => { inbox.push(msg); return api.pumpSharedAuction(); };
  message({ t: "auctionSync", cycle: 123, lots: [lot] });
  return { api, sent, lot, message, current: () => user, wins: () => won,
    bid: amount => api.placeSharedBid(user.auction.lots[0].id, amount),
    update: (amount, id = "pilot") => message({ t: "auctionUpdate", lot: { ...lot, topBid: amount, topBidder: id, topBidderId: id } }) };
}

test("deux clics rapprochés ne remplacent pas la réserve d'une mise encore non confirmée", () => {
  const c = client(); assert.equal(c.bid(1000).ok, true);
  assert.equal(c.bid(2500).ok, false); assert.equal(c.sent.length, 1);
  assert.equal(c.current().credits, 9000); assert.equal(c.current().auction.lots[0].myBid, 1000);
  c.update(1000); assert.equal(c.bid(2500).ok, true);
  assert.equal(c.current().credits, 7500); assert.equal(c.sent.length, 2);
});

test("le règlement d'un cycle est dédupliqué par compte, pas pour tout le navigateur", () => {
  const storage = new Map(), first = client("pilot", storage), second = client("other", storage);
  const settle = id => ({ t: "auctionSettle", cycle: 123, results: [{ key: "ammo_x3", name: "MCB-50", winnerId: id, amount: 1000 }] });
  first.message(settle("pilot")); first.message(settle("pilot")); assert.equal(first.wins(), 1);
  second.message(settle("other")); second.message(settle("other")); assert.equal(second.wins(), 1);
});

test("le journal historique est conservé à la migration sans bloquer un autre compte", () => {
  const storage = new Map([["orbit_auction_settled_v1", "[123]"]]);
  const first = client("pilot", storage), second = client("other", storage);
  first.message({ t: "auctionSettle", cycle: 123, results: [{ key: "ammo_x3", winnerId: "pilot", amount: 1000 }] });
  assert.equal(first.wins(), 0);
  second.message({ t: "auctionSettle", cycle: 123, results: [{ key: "ammo_x3", winnerId: "other", amount: 1000 }] });
  assert.equal(second.wins(), 1);
});

test("un sync de confirmation libère aussi la mise suivante", () => {
  const c = client(); assert.equal(c.bid(1000).ok, true);
  c.message({ t: "auctionSync", cycle: 123,
    lots: [{ ...c.lot, topBid: 1000, topBidderId: "pilot", topBidder: "pilot" }] });
  assert.equal(c.bid(2500).ok, true);
});

test("un ancien update rival puis un rejet ne remboursent la même mise qu'une fois", () => {
  const c = client(); c.bid(1000);
  const stale = c.update(900, "rival");
  assert.equal(c.current().credits, 9000); assert.equal(stale.events.length, 0);
  const reject = { t: "auctionBidReject", key: c.lot.key, reason: "Mise refusée.",
    lot: { ...c.lot, topBid: 900, topBidder: "rival", topBidderId: "rival" } };
  c.message(reject); assert.equal(c.current().credits, 10000);
  c.message(reject); assert.equal(c.current().credits, 10000);
  assert.equal(c.current().auction.lots[0].myBid, 0);
});

test("confirmation puis vraie surenchère : rembourse la dernière réserve sans duplication", () => {
  const c = client(); c.bid(1000); c.update(1000);
  assert.equal(c.bid(2500).ok, true); c.update(2500); assert.equal(c.current().credits, 7500);
  c.update(5000, "rival"); assert.equal(c.current().credits, 10000);
  c.update(5000, "rival"); assert.equal(c.current().credits, 10000);
});
