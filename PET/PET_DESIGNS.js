// Designs P.E.T (cosmétiques) — sprites dans PET/PET_DESIGNS/<id>/1..N.png.
// Vendus dans l'onglet boutique DESIGNS P.E.T, possédés dans
// inventory.petDesigns (application au P.E.T : hangar, à brancher).
"use strict";

export const PET_DESIGN_DIR = "/PET/PET_DESIGNS/";
export const PET_DESIGN_PRICE = 5000000;
// Frame affichée en boutique (même orientation que PET_SHOP_ICON).
export const PET_DESIGN_SHOP_FRAME = 21;

const SPECIAL_NAMES = Object.freeze({ "a-elite": "A-Elite", "g-champion": "G-Champion", "goliath-x": "Goliath-X", pet10: "PET-10" });

function designName(id) {
  for (const [prefix, label] of Object.entries(SPECIAL_NAMES)) {
    if (id === prefix || id.startsWith(`${prefix}-`)) return [label, ...id.slice(prefix.length + 1).split("-").filter(Boolean).map(cap)].join(" ");
  }
  return id.split("-").map(cap).join(" ");
}
function cap(word) { return word.charAt(0).toUpperCase() + word.slice(1); }

// [id, frames] : 32 orientations, sauf sprites animés / frame en plus.
const RAW = [
  ["a-elite-blaze", 32],
  ["a-elite-lava", 32],
  ["a-elite-nobilis", 32],
  ["a-elite-ocean", 32],
  ["a-elite-poison", 32],
  ["a-elite-sandstorm", 32],
  ["berserker-ace", 32],
  ["berserker-argon", 32],
  ["berserker-blaze", 32],
  ["berserker-borealis", 32],
  ["berserker-lava", 32],
  ["berserker-legend", 32],
  ["berserker-nobilis", 32],
  ["centurion-dusklight", 32],
  ["centurion-harbinger", 32],
  ["centurion-lava", 32],
  ["centurion-nobilis", 32],
  ["centurion-seraph", 32],
  ["chimera-argon", 32],
  ["chimera-green", 32],
  ["chimera-lava", 32],
  ["chimera-legend", 32],
  ["chimera-ocean", 32],
  ["chimera-orange", 32],
  ["chimera-poison", 32],
  ["chimera-red", 32],
  ["citadel-phantasm", 32],
  ["citadel-samurai", 32],
  ["citadel-viking", 32],
  ["cyborg-argon", 32],
  ["cyborg-carbonite", 32],
  ["cyborg-dusklight", 32],
  ["cyborg-frost", 32],
  ["cyborg-horus", 32],
  ["cyborg-inferno", 32],
  ["cyborg-lava", 32],
  ["cyborg-legend", 32],
  ["cyborg-phantasm", 32],
  ["cyborg", 32],
  ["diminisher-argon", 32],
  ["diminisher-carbonite", 32],
  ["diminisher-dusklight", 32],
  ["diminisher-eldritch", 32],
  ["diminisher-lava", 32],
  ["diminisher-legend", 32],
  ["diminisher-mobius", 32],
  ["diminisher-nobilis", 32],
  ["diminisher-phantasm", 32],
  ["g-champion-argon", 32],
  ["g-champion-dusklight", 32],
  ["g-champion-lava", 32],
  ["g-champion-legend", 32],
  ["g-champion-nobilis", 32],
  ["g-champion-silver", 32],
  ["goliath-dogma", 32],
  ["goliath-dreadwing", 32],
  ["goliath-nobilis", 32],
  ["goliath-x-argon", 32],
  ["goliath-x-borealis", 32],
  ["goliath-x-dusklight", 32],
  ["goliath-x-lava", 32],
  ["goliath-x-legend", 32],
  ["goliath-x-ocean", 32],
  ["goliath-x-sandstorm", 32],
  ["goliath-x", 32],
  ["hammerclaw-argon", 32],
  ["hammerclaw-carbonite", 32],
  ["hammerclaw-dusklight", 32],
  ["hammerclaw-frost", 32],
  ["hammerclaw-inferno", 32],
  ["hammerclaw-legend", 32],
  ["hammerclaw-nobilis", 32],
  ["hammerclaw-poison", 32],
  ["hammerclaw", 32],
  ["hyperion-cerevisia", 32],
  ["mirage-argon", 32],
  ["mirage-carbonite", 32],
  ["mirage-green", 32],
  ["mirage-lava", 32],
  ["mirage-legend", 32],
  ["mirage-orange", 32],
  ["mirage-poison", 32],
  ["mirage-red", 32],
  ["orcus-carbonite", 32],
  ["orcus-nobilis", 32],
  ["orcus-thornspire", 32],
  ["orcus-viking", 32],
  ["paladin-khepri", 32],
  ["pet10-frozen", 32],
  ["pet10-green", 32],
  ["pet10-inferno", 32],
  ["pet10-red", 32],
  ["phantasm", 32],
  ["pusat-blaze", 32],
  ["pusat-carbonite", 32],
  ["pusat-inferno", 32],
  ["pusat-lava", 32],
  ["pusat-nobilis", 32],
  ["pusat-ocean", 32],
  ["pusat-phantasm", 32],
  ["pusat-poison", 32],
  ["retiarus-wyvern", 32],
  ["sentinel-argon", 32],
  ["sentinel-dusklight", 32],
  ["sentinel-harbinger", 32],
  ["sentinel-inferno", 32],
  ["sentinel-lava", 32],
  ["sentinel-legend", 32],
  ["sentinel-nobilis", 32],
  ["sentinel-phantasm", 32],
  ["solace-enigma", 32],
  ["solace-striker", 32],
  ["spectrum-blaze", 32],
  ["spectrum-eostra", 32],
  ["spectrum-harbinger", 32],
  ["spectrum-ocean", 32],
  ["spectrum-phantasm", 32],
  ["spectrum-poison", 32],
  ["spectrum-seraph", 32],
];

export const PET_DESIGNS = Object.freeze(Object.fromEntries(RAW.map(([id, frames]) => [id, Object.freeze({
  id, name: designName(id), frames, itemId: `petdesign_${id}`,
  path: `${PET_DESIGN_DIR}${id}/`, icon: `${PET_DESIGN_DIR}${id}/${PET_DESIGN_SHOP_FRAME}.png`,
})])));

export function getPetDesign(id) {
  return PET_DESIGNS[String(id || "")] || null;
}
