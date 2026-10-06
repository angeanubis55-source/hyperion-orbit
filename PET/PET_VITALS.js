import { getPetHullBonusHp, getPetLevel, getPetMaxHp, getPetShieldBonus, getPetStage } from "./PET_TYPES.js";
import { findCatalogItem } from "../SRC/CORE/CATALOG.js";
import { getShipDesignBaseId } from "../SHIP/SHIP_PACKS.js";

// Même plafond pour la réparation, la persistance et les pools serveur.
// Les bonus viennent du fit du hangar actif, jamais des maxima déclarés en réseau.
export function getPetVitalLimits(pet, user, selectedHangar = null) {
  const hangar = selectedHangar || user?.hangars?.find(h => h?.active) || user?.hangars?.[0];
  const cfg = String(Number(hangar?.activeConfig) === 2 ? 2 : 1);
  const perHangar = pet?.fitsByHangar?.[hangar?.id];
  const fit = perHangar ? perHangar[cfg] || {} : pet?.fits?.[cfg] || pet?.fit || {};
  const level = getPetLevel(pet?.exp);
  const shipId = String(hangar?.shipId || user?.ship || "");
  const heat = String(getShipDesignBaseId(shipId) || shipId).toLowerCase() === "goliath_plus"
    ? 1 + Math.min(50, Math.max(1, getPetStage(level)) * 10) / 100 : 1;
  const protocol = key => Math.max(0, (fit.protocols || []).reduce((sum, id) => {
    const def = findCatalogItem(id)?.petProtocol;
    return sum + (def?.key === key ? Number(def.pct) || 0 : 0);
  }, 0));
  const shields = (fit.generators || []).reduce((sum, id) => {
    const mod = findCatalogItem(id)?.module;
    return sum + (mod?.type === "shield" ? Number(mod.bonusShield) || 0 : 0);
  }, 0);
  return {
    hpMax: Math.max(1, Math.floor((getPetMaxHp(level) + getPetHullBonusHp(pet)) * (1 + protocol("hp") / 100) * heat)),
    shMax: Math.max(0, Math.floor(shields * (1 + getPetShieldBonus(level) / 100) * (1 + protocol("shield") / 100) * heat)),
  };
}
