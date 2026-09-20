// Coordonnees 2D officielles extraites de main.swf (liste 2D des formations 3D).
const RAW_FORMATION_POSITIONS = {"standard":[150,0,225,0,187.5,37.5,187.5,-37.5,-37.5,-150,37.5,-150,0,-112.5,0,-187.5,-37.5,150,37.5,150,0,187.5,0,112.5],"turtle":[-100,-50,-100,50,-50,-100,-50,100,0,-150,0,150,50,-100,50,100,100,-50,100,50,-100,0,100,0],"arrow":[-100,-25,-100,25,-50,-50,-50,50,0,-75,0,75,50,-100,50,100,100,-125,100,125,150,-150,150,150],"lance":[-150,-100,-150,100,-75,-100,-75,100,0,-100,0,100,75,-100,75,100,150,-100,150,100,-200,-100,-200,100],"star":[-50,-50,-50,50,0,-75,0,75,75,0,150,0,0,-150,0,150,-100,-100,-100,100,0,-112.5,0,112.5],"pincer":[0,-100,0,100,0,-150,0,150,75,-100,75,100,-75,-150,-75,150,-150,-150,-150,150,-200,-150,-200,150],"double_arrow":[-50,-150,-50,150,0,-125,0,125,50,-100,50,100,0,-175,0,175,50,-200,50,200,100,-75,100,75],"diamond":[0,-200,0,200,150,0,-150,0,75,-100,75,100,-75,-100,-75,100,0,-100,0,100,-112.5,-50,-112.5,50],"chevron":[-150,0,-100,-50,-100,50,100,0,150,-50,150,50,-50,-100,-50,100,0,-150,0,150,125,-25,125,25],"butterfly":[-150,-150,-150,150,-100,-200,-100,200,-100,-100,-100,100,75,-75,75,75,125,-125,125,125,-125,-125,-125,125],"crab":[-75,-75,-75,75,100,-50,100,50,0,-150,0,150,-150,-150,-150,150,-225,-125,-225,125,50,-100,50,100],"heart":[-50,-150,-50,150,50,100,50,-100,150,0,-150,-100,-150,100,-100,0,0,-125,0,125,-125,-50,-125,50],"barrier":[-150,-25,-150,25,-150,-75,-150,75,-150,-125,-150,125,-100,-50,-100,50,-100,-100,-100,100,-100,-150,-100,150],"bat":[100,-50,100,50,150,-150,150,150,-25,-200,-25,200,-150,-150,-150,150,-100,-25,-100,25,-75,-175,-75,175],"ring":[-100,0,100,0,-40,-100,40,100,-100,35,100,-35,-100,-35,100,35,40,-100,-40,100,200,-200,200,200],"drill":[-100,0,-100,50,-100,-50,0,70,0,-70,-50,-100,-50,100,50,-130,50,130,-150,0,0,0],"veteran":[-100,100,-100,-100,200,200,100,-100,100,100,150,-150,150,150,200,-200,-150,150,-150,-150],"dome":[30,100,30,-100,100,35,100,-35,100,100,100,-100,-50,70,-50,-70,-100,-35,-100,35,0,0],"wheel":[0,100,0,-100,0,150,0,-150,0,200,0,-200,-50,150,-50,-150,50,150,50,-150,0,0],"x":[-100,100,-100,-100,100,100,100,-100,150,-150,150,150,200,200,200,-200,-80,170,-80,-170],"wave":[-150,-140,-150,140,-75,-100,-75,100,0,-140,0,140,75,-100,75,100,150,-140,150,140,-200,-100,-200,100]};
export const DRONE_FORMATION_POSITIONS = Object.freeze(Object.fromEntries(Object.entries(RAW_FORMATION_POSITIONS).map(([id, values]) => [id, Object.freeze(Array.from({ length: values.length / 2 }, (_, index) => Object.freeze({ x: values[index * 2], y: values[index * 2 + 1] }))) ])));

// `usedPositions` officiel de game.xml (main.swf), indices 1-based.
// La formation standard est la seule formation 2D dont les petits effectifs
// ne prennent pas simplement les N premiers slots : elle conserve la symetrie
// entre le groupe arriere et les deux groupes lateraux.
const STANDARD_USED_POSITIONS = Object.freeze({
  0: Object.freeze([]),
  1: Object.freeze([1]),
  2: Object.freeze([3, 4]),
  3: Object.freeze([1, 3, 4]),
  4: Object.freeze([1, 2, 3, 4]),
  5: Object.freeze([2, 3, 4, 5, 9]),
  6: Object.freeze([1, 2, 3, 4, 5, 9]),
  7: Object.freeze([2, 3, 4, 5, 6, 9, 10]),
  8: Object.freeze([1, 2, 3, 4, 5, 6, 9, 10]),
  9: Object.freeze([2, 3, 4, 5, 6, 8, 9, 10, 11]),
  10: Object.freeze([1, 2, 3, 4, 5, 6, 8, 9, 10, 11]),
  11: Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
  12: Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
});

export function getOfficialDroneFormationPositions(count, formationId = "standard") {
  const n = Math.max(0, Math.min(12, Math.floor(Number(count) || 0)));
  if (!n) return [];
  const id = String(formationId || "standard");
  const reference = DRONE_FORMATION_POSITIONS[id] || DRONE_FORMATION_POSITIONS.standard;
  const used = id === "standard"
    ? STANDARD_USED_POSITIONS[n]
    : Array.from({ length: n }, (_, index) => index + 1);
  return used.map(positionId => ({ ...reference[positionId - 1] })).filter(position => Number.isFinite(position.x) && Number.isFinite(position.y));
}
