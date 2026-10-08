import { getFactionBaseSpawn, getFactionRespawnMap, getFactionUpperBaseMap } from "../SRC/CORE/FACTIONS.js";

export async function loadServerMaps() {
  const ids = ["low", "maudite", "5-2", ...[1, 2, 3].flatMap(s =>
    [...Array.from({ length: 8 }, (_, i) => `${s}-${i + 1}`), `${s}-bl`]),
    ...Array.from({ length: 5 }, (_, i) => `4-${i + 1}`)];
  const aliases = { low: "LOW_MAP", maudite: "MAUDITE", "1-bl": "1-BL", "2-bl": "2-BL", "3-bl": "3-BL" };
  const entries = await Promise.all(ids.map(async id => {
    const dir = aliases[id] || id;
    const [{ WORLD }, spawns] = await Promise.all([
      import(`../MAPS/${dir}/WORLD.js`), import(`../MAPS/${dir}/SPAWNS.js`),
    ]);
    const modules = spawns.getZoneSafeModules?.(WORLD);
    const base = modules?.modules?.find(m => String(m?.id || "").startsWith("CENTRE_"));
    return [id, { world: WORLD, portals: spawns.getZonePortals?.(WORLD) || [],
      base: base ? { x: base.x, y: base.y } : null }];
  }));
  return new Map(entries);
}

const near = (a, b, radius) => Number.isFinite(Number(a?.x)) && Number.isFinite(Number(a?.y))
  && Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)) <= radius;

export function respawnMap(faction, fromMap) {
  return ["maudite", "qz", "4-5"].includes(String(fromMap).toLowerCase())
    ? getFactionUpperBaseMap(faction) : getFactionRespawnMap(faction, fromMap);
}

export function baseArrival(maps, map, faction) {
  return { ...(maps.get(map)?.base || getFactionBaseSpawn(faction)), radius: 650 };
}

// La destination est déduite du portail à la position serveur. Une chaîne
// map fournie par le client n'accorde aucune exemption de déplacement.
export function mapTransition(maps, state, fromMap, toMap, faction, now) {
  if (!maps.has(toMap) && !["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "qz"].includes(toMap)) return null;
  if (state.pvpDead === true || state.hp <= 0) {
    if (toMap !== respawnMap(faction, fromMap)) return null;
    return { ...baseArrival(maps, toMap, faction), revive: true };
  }
  if (now < Number(state.portalCdUntil || 0)) return null;
  // hidden = marqueur d'arrivée d'un aller simple : jamais un départ.
  const source = maps.get(fromMap)?.portals.find(p => p?.hidden !== true
    && String(p.toMap).toLowerCase() === toMap
    && near(state, p, Math.max(450, Number(p.r) || 0) + 150));
  if (!source) return null;
  const target = maps.get(toMap)?.portals.find(p => String(p.id) === String(source.toPortal))
    || maps.get(toMap)?.portals.find(p => String(p.toMap).toLowerCase() === fromMap);
  return target ? { x: target.x, y: target.y, radius: 650 }
    : ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "qz"].includes(toMap) ? { instance: true }
    : toMap === "maudite" ? baseArrival(maps, toMap, faction) : null;
}

export function validArrival(arrival, x, y, now) {
  return !!arrival && now <= Number(arrival.until || 0) && near({ x, y }, arrival, arrival.radius || 650);
}

export function reviveArrival(maps, state, map, faction, x, y) {
  if (!(state.pvpDead === true || state.hp <= 0)) return null;
  if (["low", "maudite", "4-5"].includes(map)) return null;
  const base = map === respawnMap(faction, map) ? baseArrival(maps, map, faction) : null;
  if (base && near({ x, y }, base, base.radius)) return base;
  if (near({ x, y }, state, 150)) return { x: state.x, y: state.y, radius: 150 };
  const portals = (maps.get(map)?.portals || []).filter(p => p?.hidden !== true && !["low", "qz", "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "kappa", "lambda", "kronos", "maudite", "5-2"].includes(String(p.toMap).toLowerCase()));
  const closest = portals.sort((a, b) => Math.hypot(a.x - state.x, a.y - state.y) - Math.hypot(b.x - state.x, b.y - state.y))[0];
  return closest && near({ x, y }, closest, 150) ? { x: closest.x, y: closest.y, radius: 150 } : null;
}
