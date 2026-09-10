import { performance } from "node:perf_hooks";
import { forEachNearbyPair } from "../SRC/CORE/SPATIAL_INDEX.js";

const ENTITY_COUNT = 10000;
const WORLD_SIZE = 50000;
const CELL_SIZE = 512;

let seed = 0x12345678;
function random() {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 0x100000000;
}

const entities = Array.from({ length: ENTITY_COUNT }, (_, index) => ({
  id: index + 1,
  hp: 1,
  x: random() * WORLD_SIZE,
  y: random() * WORLD_SIZE,
}));

function measure(label, run) {
  const start = performance.now();
  const checks = run();
  const elapsed = performance.now() - start;
  return { label, checks, elapsed };
}

const naive = measure("Toutes les paires", () => {
  let checks = 0;
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const dx = entities[i].x - entities[j].x;
      const dy = entities[i].y - entities[j].y;
      if (dx * dx + dy * dy >= 0) checks++;
    }
  }
  return checks;
});

const spatial = measure("Grille spatiale", () => {
  let checks = 0;
  forEachNearbyPair(entities, CELL_SIZE, (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (dx * dx + dy * dy >= 0) checks++;
  });
  return checks;
});

const reduction = 1 - spatial.checks / naive.checks;
console.log(`${naive.label}: ${naive.checks.toLocaleString("fr-FR")} vérifications en ${naive.elapsed.toFixed(2)} ms`);
console.log(`${spatial.label}: ${spatial.checks.toLocaleString("fr-FR")} vérifications en ${spatial.elapsed.toFixed(2)} ms`);
console.log(`Réduction des paires candidates: ${(reduction * 100).toFixed(2)} %`);

if (reduction < 0.9) {
  throw new Error("Régression: la grille devrait éliminer au moins 90 % des paires candidates.");
}
