// MAPS/LOW_MAP/SPAWNS.js — Low partagée (raid de groupe 2 à 10).
// Les camps portent raidWave (1..6) : ils ne spawnent que si leur vague
// est active (contrôleur SCRIPTS/LOW_RAID.js). raidWave 0 = absent ici.
// Zone de ralliement : centre de la map (gardée synchro avec LOW_RAID.js).
export const LOW_RAID_ZONE = Object.freeze({ x: 5500, y: 3500, r: 800 });

// Portail d'arrivée (spawn) + zone sûre d'entrée.
export const LOW_ENTRY = Object.freeze({ x: 1000, y: 3500, r: 1200 });

// Composition des vagues (1 NPC par camp, 1 type par vague + boss final).
const RAID_WAVES = [
  null,
  Array.from({ length: 14 }, () => "npc_Vagrant"),
  Array.from({ length: 17 }, () => "npc_Marauder"),
  Array.from({ length: 18 }, () => "npc_Outcast"),
  Array.from({ length: 10 }, () => "npc_Corsair"),
  Array.from({ length: 17 }, () => "npc_Hooligan"),
  Array.from({ length: 17 }, () => "npc_Ravager"),
  Array.from({ length: 16 }, () => "npc_Convict"),
  ["npc_Century_Falcon"],
];

export function getZoneSpawns(WORLD) {
  const camps = [];
  const cx = LOW_RAID_ZONE.x;
  const cy = LOW_RAID_ZONE.y;
  let n = 0;
  for (let wave = 1; wave < RAID_WAVES.length; wave++) {
    for (const type of RAID_WAVES[wave]) {
      // Anneaux autour du centre : arène lisible, pas de stack au spawn.
      const angle = n * 2.399963 + wave;
      const ring = 1300 + (n % 5) * 450;
      const x = Math.max(300, Math.min(WORLD.w - 300, cx + Math.cos(angle) * ring));
      const y = Math.max(300, Math.min(WORLD.h - 300, cy + Math.sin(angle) * ring * 0.7));
      n++;
      camps.push({
        type,
        x: Math.round(x),
        y: Math.round(y),
        radius: 400,
        respawn: 2,
        maxAlive: 1,
        aggroRange: 950,
        leashRange: 2400,
        aggroHold: 5,
        raidWave: wave,
        // Vague : chaque camp spawn une seule fois (pas de respawn
        // tant que la vague est active, sinon la vague ne se finit jamais).
        noRespawn: true,
        // IA chasseur type gate : traque map-wide, pas de fuite.
        hunter: true,
      });
    }
  }
  return camps;
}

export function getZonePortals(WORLD) {
  // Atterrissage d'entrée : les portails x-3 visent "p_low_return"
  // (au centre de la zone sûre d'entrée).
  // Retour : portail unique, la destination (map d'origine selon la firme)
  // est résolue au moment du saut (factionReturn).
  return [
    {
      id: "p_low_return",
      x: 1500,
      y: 3500,
      r: 260,
      factionReturn: true,
      toMap: "2-3",
      toPortal: "p_23_to_low",
    },
  ];
}

export function getZoneSafeModules(WORLD) {
  return {
    zone: { kind: "circle", x: LOW_ENTRY.x, y: LOW_ENTRY.y, r: LOW_ENTRY.r },
    modules: [],
    beacons: [],
  };
}
