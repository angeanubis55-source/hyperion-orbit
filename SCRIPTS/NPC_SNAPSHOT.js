// Les mises a jour lointaines restent a 1 Hz, reparties sur les 20 ticks.
// Une phase stable par UID evite une pointe de trafic a chaque seconde,
// meme lorsque des NPC apparaissent ou disparaissent dans la liste.
export function npcSnapshotPhase(uid) {
  let hash = 2166136261;
  for (const char of String(uid || "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 20;
}

export function selectNpcSnapshot(npc, players, tick, nearRadius = 2000) {
  if (!Array.isArray(npc?.list) || !npc.list.length) return npc;
  const nearRadiusSq = nearRadius * nearRadius;
  const phase = tick % 20;
  const damaged = new Set((npc.dmg || []).map(entry => String(entry?.uid || "")));
  const list = npc.list.filter(entry => {
    if (!entry || entry.alive === false || entry.aggro != null || entry.cube || damaged.has(String(entry.uid || ""))) return true;
    if (Number(entry.slowT) > 0 || Number(entry.freezeT) > 0) return true;
    const nx = Number(entry.x) || 0, ny = Number(entry.y) || 0;
    for (const player of players) {
      const dx = nx - Number(player.x || 0), dy = ny - Number(player.y || 0);
      if (dx * dx + dy * dy <= nearRadiusSq) return true;
    }
    return npcSnapshotPhase(entry.uid) === phase;
  });
  return { ...npc, list };
}
