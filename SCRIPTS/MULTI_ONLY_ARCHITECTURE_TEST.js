import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const engine = readFileSync(new URL("../SRC/CORE/ORBIT_ENGINE.js", import.meta.url), "utf8");
const account = readFileSync(new URL("../SRC/CORE/ACCOUNT.js", import.meta.url), "utf8");

function bodyOf(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} existe`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(brace + 1, i);
  }
  throw new Error(`${name} incomplet`);
}

test("les cartes partagees n'ont plus de controleur NPC local", () => {
  const zone = bodyOf(engine, "zoneController");
  assert.doesNotMatch(zone, /makeEnemy|zoneCamps|tickJpcSystem|spawnRandomOnMap/);
  assert.match(bodyOf(engine, "isSharedZone"), /isZoneMap\s*===\s*true/);
  assert.doesNotMatch(engine, /netplayNpcActive\s*\(/);
});

test("les Galaxy Gates restent des instances privees", () => {
  assert.match(bodyOf(engine, "isPrivateInstance"), /!isSharedZone\(\)/);
  assert.match(engine, /if \(!isZoneMap\) waveController\(dt\)/);
});

test("un navigateur ne peut jamais ouvrir un compte local", () => {
  assert.match(account, /LOCAL_ACCOUNT_TEST_ONLY\s*=\s*typeof window === "undefined"/);
  assert.match(bodyOf(account, "readUsers"), /if \(!LOCAL_ACCOUNT_TEST_ONLY\) return \[\]/);
  assert.match(bodyOf(account, "readCurrent"), /if \(!LOCAL_ACCOUNT_TEST_ONLY\) return null/);
});
