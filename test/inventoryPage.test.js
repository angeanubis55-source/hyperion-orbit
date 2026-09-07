import test from "node:test";
import assert from "node:assert/strict";
import { inventoryPage } from "../src/core/inventoryPage.js";

test("la pagination conserve toutes les unités et les objets empilés", () => {
  const sections = [
    { id: "equipment", items: [{ id: "laser", quantity: 5 }] },
    { id: "resources", items: [{ id: "ore", quantity: 10000 }] },
  ];
  const pages = [0, 1, 2].map(page => inventoryPage(sections, page, 2));
  assert.deepEqual(pages.flatMap(page => page.slots.map(slot => slot.slotId || slot.id)),
    ["laser-0", "laser-1", "laser-2", "laser-3", "laser-4", "ore"]);
  assert.equal(pages[2].slots[1].quantity, 10000);
  assert.equal(inventoryPage(sections, 99, 2).page, 2);
});

test("un million d'équipements ne crée que la page demandée", () => {
  const result = inventoryPage([{ id: "equipment", items: [{ id: "laser", quantity: 1000000 }] }], 8000);
  assert.equal(result.slots.length, 120);
  assert.equal(result.slots[0].slotId, "laser-960000");
  assert.equal(result.total, 1000000);
  assert.equal(inventoryPage([], 20).page, 0);
  assert.deepEqual(inventoryPage([], 20).slots, []);
});
