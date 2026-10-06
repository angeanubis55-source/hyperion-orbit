// Un brouillon ne réserve aucun objet. Si l'inventaire diminue pendant son
// édition, conserver les choix valides et retirer seulement le surplus.
export function pruneUnavailableLoadout({ ship, drones, pet } = {}, user) {
  const used = new Map();
  const modules = new Set((user?.inventory?.shipModules || []).map(m => String(m?.id)));
  let removed = 0;
  const prune = slots => {
    if (!Array.isArray(slots)) return;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i]) continue;
      const id = String(slots[i]);
      const owned = modules.has(id) ? 1 : Math.max(0, Number(user?.inventory?.counts?.[id]) || 0);
      const count = used.get(id) || 0;
      if (count >= owned) { slots[i] = null; removed++; }
      else used.set(id, count + 1);
    }
  };
  for (const key of ["lasers", "gens", "extras", "shipMods"]) prune(ship?.[key]);
  for (const fit of Object.values(drones || {})) prune(fit?.equipment);
  for (const key of ["lasers", "generators", "gears", "protocols"]) prune(pet?.[key]);
  return removed;
}
