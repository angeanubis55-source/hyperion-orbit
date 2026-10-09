import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const policy = readFileSync(new URL("../SRC/CORE/BACKGROUND_REFRESH.js", import.meta.url), "utf8").replace(/^export /gm, "");
const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const node = (display = "block", classes = []) => ({ style: { display }, hidden: false,
  classList: { contains: name => classes.includes(name) }, parentElement: null });
function context(root = node()) {
  const c = vm.createContext({ document: { getElementById: () => root },
    localStorage: { getItem() { throw new Error("aucune lecture du stockage pendant le rendu"); } } });
  vm.runInContext(policy, c);
  return c;
}
function engineFunction(name) {
  const from = engine.indexOf(`function ${name}(`), to = engine.indexOf("\n}", from);
  assert.ok(from >= 0 && to > from);
  return engine.slice(from, to + 2);
}

test("actualisation : defaut active et valeurs inconnues compatibles avec les anciens reglages", () => {
  const c = context(node("none"));
  assert.equal(c.shouldRefreshWindow("window"), true);
  for (const value of [undefined, null, "auto", true, false, "enabled"]) {
    assert.equal(c.setBackgroundRefresh(value), "enabled");
    assert.equal(c.shouldRefreshWindow("window"), true);
  }
});

test("desactive : fermeture, reduction, animation et parent masque suspendent le panneau", () => {
  const root = node(), c = context(root);
  c.setBackgroundRefresh("disabled");
  assert.equal(c.shouldRefreshWindow("window"), true);
  for (const hidden of [node("none"), node("block", ["gameWinMinimized"]), node("block", ["gameWinClosing"]), { ...node(), hidden: true }]) {
    assert.equal(c.shouldRefreshWindow(hidden), false);
    root.parentElement = hidden;
    assert.equal(c.shouldRefreshWindow("window"), false);
  }
  root.parentElement = null;
  assert.equal(c.shouldRefreshWindow("window"), true);
  assert.equal(c.shouldRefreshWindow(null), false);
  root.style.display = "none";
  c.setBackgroundRefresh("enabled");
  assert.equal(c.shouldRefreshWindow("window"), true);
});

test("les panneaux fermes ne lisent ni le compte ni les dimensions ni les donnees de rendu", () => {
  const c = vm.createContext({ shouldRefreshWindow: () => false,
    getCurrentUserFull() { throw new Error("lecture inutile du compte"); },
    performance: { now() { throw new Error("travail inutile avant le filtre"); } },
    ui: new Proxy({}, { get() { throw new Error("acces inutile au contenu"); } }) });
  for (const name of ["drawMinimap", "renderGalaxyGateWindow", "renderRefineryWindow", "renderCraftingWindow",
    "renderBoosterWindow", "renderOreTradeWindow", "renderStarMap", "refreshStarMap", "updatePetHud",
    "botRefreshHud", "botRefreshStats", "botRefreshPetOptions", "botRenderNpcList", "updateConfigButtons"]) {
    vm.runInContext(engineFunction(name), c);
    c[name]();
  }
  vm.runInContext("let questJournalRenderPending = false, questTerminalRenderPending = false;\n" +
    engineFunction("renderQuestWindow") + "\n" + engineFunction("renderQuestTerminal"), c);
  c.renderQuestWindow(); c.renderQuestTerminal();
  assert.equal(vm.runInContext("questJournalRenderPending && questTerminalRenderPending", c), true);
});

test("groupe ferme : synchronisation et acceptation automatique continuent sans construire le panneau", () => {
  const source = readFileSync(new URL("../UI/UI_GROUP.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const root = node("none"), members = { addEventListener() {} }, invites = { addEventListener() {} };
  const autoAccept = { checked: true, addEventListener() {} };
  const nodes = { groupWindow: root, groupMembers: members, groupInvites: invites, groupAutoAccept: autoAccept };
  let syncs = 0, accepts = 0, received = false;
  const c = vm.createContext({ document: { getElementById: id => nodes[id] || null },
    window: { addEventListener() {} }, localStorage: { getItem: () => "1" },
    setInterval() {}, netplayStatus: () => ({ connected: true }), sendGroupSync: () => syncs++,
    getNetGroup: () => null, sendGroupAccept: () => accepts++,
    drainNetGroupInviteInbox: () => received ? [] : (received = true, [{ from: "pilot", expiresAt: Date.now() + 15000 }]),
    drainNetGroupNoticeInbox: () => [], sendGroupRally() {}, shouldRefreshWindow: () => false });
  vm.runInContext(source, c); c.initGroupUI();
  assert.equal(syncs, 1); assert.equal(accepts, 1);
});

test("chat ferme : messages conserves, annonces immediates et rattrapage borne a la reouverture", () => {
  const source = readFileSync(new URL("../UI/UI_CHAT.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  const root = node("none"), listeners = new Map(), rows = [], announcements = [];
  let poll, statusWrites = 0;
  const entries = { children: rows, querySelector: () => null, appendChild: row => rows.push(row),
    removeChild: row => rows.splice(rows.indexOf(row), 1), scrollHeight: 100 };
  const status = { classList: { toggle() {} }, set textContent(value) { statusWrites++; } };
  const control = { addEventListener() {}, value: "" };
  const nodes = { chatWindow: root, chatEntries: entries, chatForm: control, chatInput: control, chatStatus: status };
  let inbox = Array.from({ length: 120 }, (_, i) => ({ from: i ? "Pilote" : "[ADMIN]",
    at: Date.now(), text: `message-${i}`, adminBlast: i === 0 }));
  const c = vm.createContext({ document: { getElementById: id => nodes[id] || null, createElement: () => ({}) },
    window: { addEventListener: (name, callback) => listeners.set(name, callback),
      dispatchEvent: event => announcements.push(event.detail.text) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setInterval: callback => { poll = callback; }, escapeHtml: String,
    netplayStatus: () => ({ connected: false }), netMyId: () => "me", netMyPseudo: () => "Moi",
    drainNetChatInbox: () => { const received = inbox; inbox = []; return received; } });
  vm.runInContext(policy + '\n' + source, c);
  c.setBackgroundRefresh("disabled"); c.initChatUI(); poll();
  assert.equal(rows.length, 0); assert.equal(statusWrites, 0);
  assert.deepEqual(announcements, ["message-0"]);
  root.style.display = "block";
  listeners.get("orbit:window-restoring")({ detail: { id: "chatWindow" } });
  assert.equal(rows.length, 60); assert.equal(statusWrites, 1);
  assert.match(rows[0].innerHTML, /message-60</); assert.match(rows[59].innerHTML, /message-119</);
  poll(); assert.equal(rows.length, 60);
  assert.deepEqual(announcements, ["message-0"], "la reouverture ne rejoue pas la banniere admin");
});
