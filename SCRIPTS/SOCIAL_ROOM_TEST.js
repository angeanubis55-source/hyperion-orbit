import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { escapeHtml } from "../UI/UI_DOM.js";

const social = readFileSync(new URL("./SOCIAL_ROOM.js", import.meta.url), "utf8").replace(/^export /gm, "");
const server = readFileSync(new URL("./MULTI_SERVER.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const descriptor = server.slice(server.indexOf("function describePeer(pid)"), server.indexOf("function sendToPeer(pid, obj)"));
const lifecycle = server.slice(server.indexOf("const PEER_GRACE_MS ="), server.indexOf("const boxRooms ="));

// Les vrais handlers sociaux et de présence, avec une horloge contrôlée.
function fixture() {
  let now = 1000, nextTimer = 0;
  const timers = new Map(), sent = [], room = new Map();
  const rooms = new Map([["1-1", room]]), instancePeers = new Map();
  for (const [id, pseudo] of [["u_a", "Jordie"], ["u_b", "ZbliShit"], ["u_c", "Troisième"]]) {
    room.set(id, { ws: { readyState: 1 }, state: { id, pseudo, shipId: "solace_plus", x: 1000, y: 2000,
      hpPct: 0.6, shPct: 0.3, hpMax: 1000, shMax: 500, b2: ["dmg2"], combat: "npc", targetName: "Interceptor" } });
  }
  const context = vm.createContext({ rooms, instancePeers, Date: { now: () => now },
    setTimeout: (fn, ms) => { const id = ++nextTimer; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: id => timers.delete(id),
    sendToPeer: (id, msg) => sent.push({ id, ...JSON.parse(JSON.stringify(msg)) }),
    findPeerByPseudo: pseudo => [...room.values()].find(e => e.state.pseudo === pseudo)?.state,
    notifyFriendPresence: () => {},
    removeFromAllRooms: id => { for (const r of rooms.values()) r.delete(id); instancePeers.delete(id); },
  });
  vm.runInContext(`${social}\n${descriptor}\n${lifecycle}\nthis.api = {
    handleSocialMessage, socialDescribeGroup, socialPeerGone, socialPeerChanged,
    describePeer, schedulePeerGrace, cancelPeerGrace
  };`, context);
  const api = context.api;
  const ctx = id => ({ id, state: room.get(id)?.state, authed: true,
    describe: api.describePeer, findByPseudo: context.findPeerByPseudo,
    sendTo: context.sendToPeer, send: msg => context.sendToPeer(id, msg) });
  const send = (id, msg) => api.handleSocialMessage(ctx(id), msg);
  const group = () => JSON.parse(JSON.stringify(api.socialDescribeGroup("u_a", ctx("u_a"))));
  const advance = ms => {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      now = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    now = end;
  };
  const invite = id => { send("u_a", { t: "groupInvite", to: room.get(id).state.pseudo }); send(id, { t: "groupAccept" }); };
  invite("u_b");
  return { api, room, rooms, instancePeers, sent, ctx, send, group, advance, invite };
}

test("une fiche absente conserve le pseudo, la carte, le vaisseau et les dernières barres", () => {
  const f = fixture(), before = f.group().members.find(m => m.id === "u_b");
  f.room.delete("u_b");
  f.send("u_a", { t: "groupSync" });
  const member = f.sent.at(-1).group.members.find(m => m.id === "u_b");
  for (const key of ["pseudo", "map", "shipId", "hpPct", "shPct", "hpMax", "shMax"]) assert.equal(member[key], before[key]);
  assert.equal(member.online, false);
  assert.deepEqual(member.b2, [], "le cache ne fournit pas de bonus de groupe");
  assert.equal(member.combat, "", "ne pas afficher une ancienne cible comme un combat actuel");
});

test("la reconnexion remplace le cache par le nouveau pseudo et la nouvelle carte", () => {
  const f = fixture(), entry = f.room.get("u_b");
  f.room.delete("u_b"); f.group();
  entry.state.pseudo = "Nouveau pseudo"; entry.state.shipId = "goliath"; entry.state.hpPct = 0.2;
  f.rooms.set("5-2", new Map([["u_b", entry]]));
  f.api.socialPeerChanged("u_b", f.ctx("u_b"));
  const member = f.group().members.find(m => m.id === "u_b");
  assert.equal(member.online, true); assert.equal(member.pseudo, "Nouveau pseudo");
  assert.equal(member.map, "5-2"); assert.equal(member.shipId, "goliath"); assert.equal(member.hpPct, 0.2);
});

test("les Galaxy Gates conservent aussi les coordonnées et les barres réelles", () => {
  const f = fixture(), entry = f.room.get("u_b");
  f.room.delete("u_b"); f.instancePeers.set("u_b", { ...entry, mapId: "gg_alpha" });
  const member = f.group().members.find(m => m.id === "u_b");
  assert.equal(member.pseudo, "ZbliShit"); assert.equal(member.map, "gg_alpha");
  assert.equal(member.instance, true); assert.equal(member.online, true);
  assert.equal(member.hpPct, 0.6); assert.equal(member.shPct, 0.3); assert.equal(member.hpMax, 1000);
  assert.equal(member.x, 1000); assert.equal(member.y, 2000);
});

test("la grâce serveur expire une seule fois, sans laisser un Pilote fantôme dans le groupe", () => {
  const f = fixture(), state = f.room.get("u_b").state;
  f.room.get("u_b").ws.readyState = 3;
  f.api.schedulePeerGrace("u_b", { state, authed: true, accountId: "b" });
  f.advance(11999);
  const member = f.group().members.find(m => m.id === "u_b");
  assert.equal(member.pseudo, "ZbliShit"); assert.equal(member.online, false);
  f.advance(1);
  assert.equal(f.group(), null); assert.equal(f.room.has("u_b"), false);
  assert.equal(f.sent.at(-1).group, null, "le joueur restant reçoit la dissolution dès l'expiration");
});

test("un refresh avant les 12 secondes garde le groupe et annule le départ", () => {
  const f = fixture(), entry = f.room.get("u_b");
  entry.ws.readyState = 3;
  f.api.schedulePeerGrace("u_b", { state: entry.state, authed: true });
  f.advance(6000);
  assert.equal(f.api.cancelPeerGrace("u_b"), true);
  entry.ws = { readyState: 1 };
  f.api.socialPeerChanged("u_b", f.ctx("u_b"));
  f.advance(18000);
  assert.equal(f.group().members.length, 2);
  assert.equal(f.group().members.find(m => m.id === "u_b").online, true);
});

test("une exclusion annule l'ancien délai avant une nouvelle invitation", () => {
  const f = fixture();
  f.invite("u_c");
  f.api.socialPeerGone("u_b", f.ctx("u_b"));
  f.send("u_a", { t: "groupKick", target: "u_b" });
  f.invite("u_b");
  f.advance(12000);
  assert.equal(f.group().members.length, 3, "un ancien timer ne doit pas exclure un joueur réinvité");
});

test("la carte de groupe affiche Hors ligne sans perdre le nom ni afficher un point d'interrogation", () => {
  const f = fixture(); f.room.delete("u_b");
  const group = f.group(), nodes = new Map();
  for (const id of ["groupStatus", "groupMembers", "groupInvites"]) nodes.set(id, {
    style: {}, children: [], innerHTML: "", addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  });
  const source = readFileSync(new URL("../UI/UI_GROUP.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  vm.runInNewContext(`${source}\ninitGroupUI();`, { escapeHtml,
    shouldRefreshWindow: () => true, window: { addEventListener() {} },
    document: { getElementById: id => nodes.get(id), querySelector: () => null },
    localStorage: { getItem: () => null }, getNetGroup: () => group,
    netMyId: () => "u_a", netplayStatus: () => ({ connected: false }),
    getShipDesignBaseId: id => id, getShipPackById: () => ({ name: "Solace Plus" }),
    drainNetGroupInviteInbox: () => [], drainNetGroupNoticeInbox: () => [],
    sendGroupRally: () => {}, setInterval: () => {},
  });
  const html = nodes.get("groupMembers").innerHTML;
  assert.match(html, /ZbliShit/); assert.match(html, /Hors ligne/); assert.match(html, /Solace Plus/);
  assert.doesNotMatch(html, />\?<|>Pilote</);
});
