"use strict";

export const ITEM_RARITIES = Object.freeze({
  common: Object.freeze({ id: "common", name: "Commun", color: "#a9bcc7" }),
  rare: Object.freeze({ id: "rare", name: "Rare", color: "#45bfff" }),
  epic: Object.freeze({ id: "epic", name: "Épique", color: "#ba72ff" }),
  legendary: Object.freeze({ id: "legendary", name: "Légendaire", color: "#ffd15c" }),
});

const ITEM_RARITY_BY_ID = Object.freeze({
  ammo_x2: "common", ammo_x3: "rare", ammo_x4: "epic", ammo_sab: "rare", ammo_x6: "legendary",
  ammo_rcb: "legendary", ammo_cbo: "epic", ammo_job: "rare", ammo_rb: "rare", ammo_pib: "epic",
  ammo_idb: "epic", ammo_vb: "rare", ammo_emaa: "rare", ammo_sbl: "rare", ammo_abl: "epic",
  laser_lf3: "rare", laser_odysseus: "epic", laser_anchorlock: "epic",
  spd_mk3: "rare", spd_mk4: "epic",
  shd_mk3: "rare", shd_mk4: "epic",
  extra_radar: "rare", extra_loot: "rare", refined_component: "rare",
  hybrid_alloy: "epic", indoctrinated_oil: "legendary",
  scrap: "common", mucosum: "common",
  plasmide: "rare", prismatium: "rare", aurus: "rare", bifenon: "rare",
  tetrathrin: "epic", kyhalon: "epic", rinusk: "epic", blacklight_trace: "epic",
  mindfire_cerebrum: "legendary",
});

export function getItemRarity(itemOrId) {
  const id = String(typeof itemOrId === "string" ? itemOrId : itemOrId?.id || "");
  const rarityId = ITEM_RARITY_BY_ID[id]
    || (id.includes("mk4") ? "epic" : "common");
  return ITEM_RARITIES[rarityId] || ITEM_RARITIES.common;
}
