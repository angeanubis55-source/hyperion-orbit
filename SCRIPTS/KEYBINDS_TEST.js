import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createKeyboardState } from "../SRC/CORE/INPUT.js";

const source = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function section(from, to) {
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, from);
  return source.slice(start, end);
}

function harness() {
  const listeners = new Map(), actions = [], saved = [], toasts = [];
  const canvas = {}, ui = { closest: () => null }, typing = { closest: () => ({}) };
  const portal = {};
  const addEventListener = (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  };
  const context = vm.createContext({
    createKeyboardState, canvas, addEventListener, portal,
    window: { addEventListener, GameWindowManager: { toggleAll: () => actions.push("windows") } },
    document: { querySelectorAll: selector => selector.includes("actionSlot")
      ? Array.from({ length: 20 }, (_, i) => ({ querySelector: () => ({ click: () => actions.push(`slot${i + 1}`) }) }))
      : [] },
    saveGameSettings: () => saved.push(JSON.stringify(context.GAME_SETTINGS.keybinds)),
    renderSettingsWindow() {}, showToast: message => toasts.push(message),
    isZoneMap: false, betweenWaves: true, getInteractivePortals: () => [portal], isPlayerNearPortal: () => true,
    startGatePortalJump: () => actions.push("portal"), toggleActiveConfigByKey: () => actions.push("config"),
    toggleAttack: () => actions.push("attack"), tryFireRocket: () => actions.push("rocket"),
    toggleActionDockMenu: () => actions.push("dock"),
  });
  vm.runInContext(section("const DEFAULT_KEYBINDS =", "// Volumes par défaut")
    + "\nglobalThis.GAME_SETTINGS = { keybinds: { ...DEFAULT_KEYBINDS } };\n"
    + section("function normalizeKeybinds(", "function loadGameSettings(")
    + section("let waitingForBindAction =", "function renderKeybindRows(")
    + section("const keyboard = createKeyboardState();", "// Click-to-move / Lock manuel"), context);
  function emit(type, extra = {}) {
    const event = { button: 3, pointerType: "mouse", target: canvas, detail: 1,
      preventDefault() { this.prevented = true; }, stopPropagation() {},
      stopImmediatePropagation() { this.stopped = true; }, ...extra };
    for (const listener of listeners.get(type) || []) {
      listener(event);
      if (event.stopped) break;
    }
    return event;
  }
  return { c: context, emit, actions, saved, toasts, canvas, ui, typing,
    held: () => vm.runInContext("Array.from(keyboard.held)", context),
    pressed: () => vm.runInContext("Array.from(keyboard.pressed)", context) };
}

test("capture souris : seuls les boutons supplémentaires sont assignables et persistés", () => {
  const h = harness();
  h.c.beginKeyCapture("toggleAttack");
  for (const button of [0, 1, 2]) assert.equal(h.emit("pointerdown", { button }).prevented, undefined);
  assert.equal(h.c.GAME_SETTINGS.keybinds.toggleAttack, "ControlLeft");
  for (const button of [3, 4, 5, 11]) {
    h.c.beginKeyCapture("toggleAttack");
    assert.equal(h.emit("pointerdown", { button, target: h.ui }).prevented, true);
    assert.equal(h.c.GAME_SETTINGS.keybinds.toggleAttack, `Mouse${button}`);
    assert.equal(h.c.codeLabel(`Mouse${button}`), `SOURIS ${button + 1}`);
    h.emit("pointerup", { button });
    assert.equal(h.emit("auxclick", { button, target: h.ui }).prevented, true);
    const restored = h.c.normalizeKeybinds(JSON.parse(h.saved.at(-1)));
    assert.equal(restored.toggleAttack, `Mouse${button}`);
  }
  assert.equal(h.actions.length, 0, "éditer ne déclenche pas le raccourci");
});

test("conflit souris et annulation clavier : aucune liaison écrasée", () => {
  const h = harness();
  h.c.bindKey("toggleAttack", "Mouse3");
  h.c.beginKeyCapture("fireRocket"); h.emit("pointerdown"); h.emit("pointerup");
  assert.equal(h.c.GAME_SETTINGS.keybinds.fireRocket, "Space");
  assert.match(h.toasts.at(-1), /déjà utilisée/);
  h.c.beginKeyCapture("fireRocket"); h.emit("keydown", { code: "Escape" });
  h.emit("pointerdown", { button: 4 });
  assert.equal(h.c.GAME_SETTINGS.keybinds.fireRocket, "Space");
});

for (const [action, result] of [["portal", "portal"], ["switchConfig", "config"], ["toggleAttack", "attack"],
  ["fireRocket", "rocket"], ["toggleWindows", "windows"], ["toggleDock", "dock"],
  ...Array.from({ length: 20 }, (_, i) => [`slot${i + 1}`, `slot${i + 1}`])]) {
  test(`${action} : le bouton souris lance la vraie commande une seule fois`, () => {
    const h = harness(); h.c.bindKey(action, "Mouse4");
    assert.equal(h.emit("pointerdown", { button: 4 }).prevented, true);
    h.emit("mousedown", { button: 4 });
    assert.deepEqual(h.actions, [result]);
    assert.ok(h.pressed().includes("Mouse4"));
    h.emit("pointerup", { button: 4 }); h.emit("mouseup", { button: 4 });
    assert.equal(h.held().length, 0);
    assert.equal(h.emit("auxclick", { button: 4 }).prevented, true);
  });
}

test("boutons simultanés, relâchement et perte de focus ne laissent aucune touche bloquée", () => {
  const h = harness(); h.c.bindKey("toggleAttack", "Mouse3"); h.c.bindKey("fireRocket", "Mouse4");
  h.emit("pointerdown", { button: 3 }); h.emit("mousedown", { button: 4 });
  assert.deepEqual(h.actions, ["attack", "rocket"]);
  h.emit("mouseup", { button: 4 });
  assert.deepEqual(Array.from(h.held()), ["Mouse3"]);
  h.emit("blur"); assert.equal(h.held().length, 0);
  h.emit("pointerdown", { button: 3 });
  h.emit("pointercancel", { button: -1 });
  assert.equal(h.held().length, 0);
});

test("interface, clics usuels, toucher et saisie de texte gardent leur comportement", () => {
  const h = harness(); h.c.bindKey("toggleAttack", "Mouse3");
  for (const event of [{ target: h.ui }, { pointerType: "touch" }, { pointerType: "pen" },
    { button: 0 }, { button: 1 }, { button: 2 }]) {
    assert.equal(h.emit("pointerdown", event).prevented, undefined);
  }
  h.emit("keydown", { code: "Space", target: h.typing });
  assert.equal(h.actions.length, 0);
  h.emit("keydown", { code: "Space", target: h.ui });
  h.emit("keydown", { code: "Space", repeat: true });
  assert.deepEqual(h.actions, ["rocket"]);
});
