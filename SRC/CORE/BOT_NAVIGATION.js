const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rectEdges(rect) {
  const hw = Number(rect?.w || 0) / 2, hh = Number(rect?.h || 0) / 2;
  return {
    left: Number(rect?.x || 0) - hw, right: Number(rect?.x || 0) + hw,
    top: Number(rect?.y || 0) - hh, bottom: Number(rect?.y || 0) + hh,
  };
}

// Le segment AB touche-t-il le rectangle (gonflé de margin) ?
function segmentHitsRect(ax, ay, bx, by, rect, margin) {
  const e = rectEdges(rect);
  const left = e.left - margin, right = e.right + margin;
  const top = e.top - margin, bottom = e.bottom + margin;
  const inside = (x, y) => x >= left && x <= right && y >= top && y <= bottom;
  if (inside(ax, ay) || inside(bx, by)) return true;
  // Intersection segment / arête (produits vectoriels).
  const cross = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  const seg = (x1, y1, x2, y2, x3, y3, x4, y4) => {
    const d1 = cross(x3, y3, x4, y4, x1, y1), d2 = cross(x3, y3, x4, y4, x2, y2);
    const d3 = cross(x1, y1, x2, y2, x3, y3), d4 = cross(x1, y1, x2, y2, x4, y4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  return seg(ax, ay, bx, by, left, top, right, top)
    || seg(ax, ay, bx, by, right, top, right, bottom)
    || seg(ax, ay, bx, by, right, bottom, left, bottom)
    || seg(ax, ay, bx, by, left, bottom, left, top);
}

// Le point est-il dans un mur (gonflé de margin) ? NPC coincé dans un
// caillou = à ignorer côté ciblage bot.
export function isPointInWall(x, y, walls, margin = 0) {
  if (!Array.isArray(walls) || !walls.length) return false;
  const px = Number(x) || 0, py = Number(y) || 0;
  const m = Math.max(0, Number(margin) || 0);
  for (const w of walls) {
    if (!w) continue;
    const e = rectEdges(w);
    if (px >= e.left - m && px <= e.right + m && py >= e.top - m && py <= e.bottom + m) return true;
  }
  return false;
}

// Le segment AB traverse-t-il un mur (gonflé de margin) ? NPC de l'autre
// côté = à contourner via BFS, pas à foncer droit dessus.
export function isSegmentBlocked(ax, ay, bx, by, walls, margin = 0) {
  if (!Array.isArray(walls) || !walls.length) return false;
  const m = Math.max(0, Number(margin) || 0);
  for (const w of walls) {
    if (!w) continue;
    if (segmentHitsRect(ax, ay, bx, by, w, m)) return true;
  }
  return false;
}

// Foulée max du WP retourné : on vise le coin par petits pas recalculés
// à chaque frame (la trajectoire épouse le contour au lieu de couper les
// coins en ligne droite). Le coin réel reste mémorisé pour l'état.
const DETOUR_STEP = 400;
function stepToward(fx, fy, wx, wy, maxD = DETOUR_STEP) {
  const dx = wx - fx, dy = wy - fy;
  const d = Math.hypot(dx, dy);
  if (!(d > maxD)) return { x: wx, y: wy };
  return { x: fx + (dx / d) * maxD, y: fy + (dy / d) * maxD };
}
// Direction de sortie la plus proche hors de tous les murs gonflés : 8 rayons
// échantillonnés (pour quitter une concavité par l'ouverture). Retourne un
// point à 600 m dans cette direction (fuite franche pendant 1 s, pas un
// point proche sur lequel on resterait planté). null si encerclé.
function escapePoint(fx, fy, walls, margin) {
  const insideAny = (x, y) => {
    for (const w of walls) {
      const e = rectEdges(w);
      if (x >= e.left - margin && x <= e.right + margin && y >= e.top - margin && y <= e.bottom + margin) return true;
    }
    return false;
  };
  let bestA = 0, bestD = Infinity;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 40; d <= 1200; d += 40) {
      if (!insideAny(fx + dx * d, fy + dy * d)) {
        if (d < bestD) { bestD = d; bestA = a; }
        break;
      }
    }
  }
  if (!Number.isFinite(bestD)) return null;
  return { x: fx + Math.cos(bestA) * 600, y: fy + Math.sin(bestA) * 600 };
}

// Contournement de murs pour le bot : pathfinding BFS sur grille +
// suivi avec ligne de vue (vise le point le plus lointain visible).
// Un chemin fixé ne peut pas yoyoter. Filets : demi-tour immédiat au
// contact, dégagement sur stagnation, jamais de sortie de map.
// Retourne { x, y, detour: bool }. state : objet persistant (Bot.wallSteer).
export function computeWallDetour({ fromX, fromY, toX, toY, walls, radius = 18, state = {}, dt = 1 / 60, bounds = null }) {
  const fx = Number(fromX) || 0, fy = Number(fromY) || 0;
  const tx = Number(toX) || 0, ty = Number(toY) || 0;
  const list = Array.isArray(walls) ? walls : [];
  const step = Math.max(1 / 240, Math.min(0.5, Number(dt) || 1 / 60));
  const shipR = Math.max(1, Number(radius) || 18);
  // Marge de placement (coins à bonne distance) vs marge de blocage
  // (un passage étroit mais praticable ne doit pas être déclaré bloqué).
  const margin = shipR + 30;
  const gap = shipR + 8;
  // Jamais de WP hors map (radiation) : on reste à l'intérieur.
  const bx0 = bounds ? Number(bounds.minX ?? 0) : -Infinity;
  const by0 = bounds ? Number(bounds.minY ?? 0) : -Infinity;
  const bx1 = bounds ? Number(bounds.maxX ?? Infinity) : Infinity;
  const by1 = bounds ? Number(bounds.maxY ?? Infinity) : Infinity;
  const inBounds = (x, y) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1;
  const clampToBounds = (p) => ({ x: clamp(p.x, bx0, bx1), y: clamp(p.y, by0, by1) });
  if (state.wideT > 0) state.wideT = Math.max(0, state.wideT - step);
  // Dégagement en cours : on tient le cap de sortie jusqu'au bout.
  if (state.freeT > 0) {
    state.freeT = Math.max(0, state.freeT - step);
    state.px = fx; state.py = fy; state.stuckT = 0;
    if (state.banT > 0) state.banT = Math.max(0, state.banT - step);
    return { x: state.freeX, y: state.freeY, detour: true, freeing: true };
  }
  if (state.banT > 0) state.banT = Math.max(0, state.banT - step);
  // Progression depuis le dernier appel : quasi-immobile en détour = coincé.
  const moved = state.px == null ? Infinity : Math.hypot(fx - state.px, fy - state.py);
  // Direction de déplacement (pour le demi-tour sur contact) : d'où l'on vient.
  let backX = 0, backY = 0, hasBack = false;
  if (state.px != null) {
    const bdx = fx - state.px, bdy = fy - state.py;
    const bd = Math.hypot(bdx, bdy);
    if (bd > 1) { backX = -bdx / bd; backY = -bdy / bd; hasBack = true; }
  }
  state.px = fx; state.py = fy;
  // Contact immédiat : à moins de (rayon + 12) d'un mur = on le touche.
  let touching = false;
  for (const w of list) {
    const e = rectEdges(w);
    const cx = clamp(fx, e.left, e.right), cy = clamp(fy, e.top, e.bottom);
    if (Math.hypot(fx - cx, fy - cy) <= shipR + 12) { touching = true; break; }
  }
  // Stagnation sur 1 s : le vaisseau vibre sur place contre le mur (il bouge
  // de quelques mètres mais ne progresse pas) — à détecter aussi, sinon il
  // reste collé au lieu de partir en sens inverse.
  if (state.bbX0 == null) {
    state.bbX0 = fx; state.bbX1 = fx; state.bbY0 = fy; state.bbY1 = fy; state.bbT = 0;
  } else {
    if (fx < state.bbX0) state.bbX0 = fx;
    if (fx > state.bbX1) state.bbX1 = fx;
    if (fy < state.bbY0) state.bbY0 = fy;
    if (fy > state.bbY1) state.bbY1 = fy;
    state.bbT = (Number(state.bbT) || 0) + step;
  }
  // Fenêtre écoulée et moins de 40 m couverts = collé (consomme la fenêtre).
  const bboxJammed = () => {
    if ((Number(state.bbT) || 0) < 1) return false;
    const w = (state.bbX1 ?? fx) - (state.bbX0 ?? fx);
    const h = (state.bbY1 ?? fy) - (state.bbY0 ?? fy);
    state.bbX0 = fx; state.bbX1 = fx; state.bbY0 = fy; state.bbY1 = fy; state.bbT = 0;
    return Math.max(w, h) < 40;
  };
  // Demi-tour de dégagement : 1 s vers la sortie la plus proche (hors
  // marges, en map), + inversion du sens + ban positionnel du point visé.
  const startFreeing = (wx, wy) => {
    state.stuckT = 0;
    state.path = null;
    state.dir = state.dir === -1 ? 1 : -1;
    state.banX = wx; state.banY = wy; state.banT = 5;
    state.side = null; state.wallKey = null;
    const esc = escapePoint(fx, fy, list, margin);
    state.freeT = 1;
    if (esc) { state.freeX = esc.x; state.freeY = esc.y; }
    else {
      const bd = Math.hypot(fx - wx, fy - wy) || 1;
      state.freeX = fx + ((fx - wx) / bd) * 600;
      state.freeY = fy + ((fy - wy) / bd) * 600;
    }
    const freeClamped = clampToBounds({ x: state.freeX, y: state.freeY });
    state.freeX = freeClamped.x; state.freeY = freeClamped.y;
    return { x: state.freeX, y: state.freeY, detour: true, freeing: true };
  };
  const clearing = (msg) => {
    state.wpX = null; state.wpY = null; state.wallKey = null; state.side = null; state.dir = null;
    state.stuckT = 0; state.banT = 0; state.banWall = null; state.banSide = null;
    // Fenêtre de stagnation : pas de reset ici (elle s'évalue et se reset
    // d'elle-même dans bboxJammed, sinon elle ne s'accumulerait jamais).
    return msg;
  };
  // Assez près de la cible : on y va direct (le clamp/combat gère la fin).
  // Mais stagnation quand même détectée (vibration contre un mur proche).
  if (Math.hypot(tx - fx, ty - fy) < 150) {
    if (bboxJammed()) return startFreeing(tx, ty);
    return clearing({ x: tx, y: ty, detour: false });
  }
  // Contact immédiat : demi-tour aussitôt (sans attendre la détection de
  // blocage), comme aux bords de map. On repart d'où l'on vient pendant 1 s.
  // Le point de contact est banni 3 s pour ne pas y retourner aussitôt.
  if (touching && hasBack) {
    state.stuckT = 0;
    state.path = null;
    state.dir = state.dir === -1 ? 1 : -1;
    state.banX = fx; state.banY = fy; state.banT = 3;
    state.side = null; state.wallKey = null;
    state.freeT = 1;
    state.freeX = fx + backX * 600; state.freeY = fy + backY * 600;
    const freeClamped = clampToBounds({ x: state.freeX, y: state.freeY });
    state.freeX = freeClamped.x; state.freeY = freeClamped.y;
    return { x: state.freeX, y: state.freeY, detour: true, freeing: true };
  }
  // Premier mur touché par le segment (marge étroite : un passage
  // praticable entre deux cailloux ne doit pas être déclaré bloqué).
  let hitIndex = -1;
  for (let i = 0; i < list.length; i++) {
    if (segmentHitsRect(fx, fy, tx, ty, list[i], gap)) { hitIndex = i; break; }
  }
  // Sortie/rentrée de map : premier point où le segment quitte la zone
  // (ou y rentre si on est déjà dehors). null si tout le trajet est dedans
  // ou si le segment ne touche jamais la zone.
  const segmentBoundsExit = (fx, fy, tx, ty) => {
    const dx = tx - fx, dy = ty - fy;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (fx < bx0 || fx > bx1) return null;
    } else {
      let t1 = (bx0 - fx) / dx, t2 = (bx1 - fx) / dx;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (Math.abs(dy) < 1e-9) {
      if (fy < by0 || fy > by1) return null;
    } else {
      let t1 = (by0 - fy) / dy, t2 = (by1 - fy) / dy;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    if (tmin > 0) return { x: fx + dx * tmin, y: fy + dy * tmin }; // rentrée (on est dehors)
    if (tmax < 1) return { x: fx + dx * tmax, y: fy + dy * tmax }; // sortie
    return null; // tout dedans
  };
  if (hitIndex < 0) {
    // Ligne dégagée mais stagnation (collé en vibrant, ex : orbite de
    // combat plaquée au mur) : dégagement quand même, sinon glitch infini.
    if (bboxJammed()) return startFreeing(tx, ty);
    // Le segment sort de la map (radiation, ex : trajet vers un portail
    // de bordure) : on vise le point de sortie, en restant dedans.
    // Le bot longe ensuite la bordure au lieu de couper par dehors.
    const exit = segmentBoundsExit(fx, fy, tx, ty);
    if (exit) {
      const ex = clamp(exit.x, bx0, bx1), ey = clamp(exit.y, by0, by1);
      return { x: ex, y: ey, detour: true };
    }
    return clearing({ x: tx, y: ty, detour: false });
  }
  // WP final : foulée max + clampé dans la map (jamais de radiation).
  const finishDetour = (x, y) => {
    const w = stepToward(fx, fy, x, y);
    const c = clampToBounds(w);
    return { x: c.x, y: c.y, detour: true };
  };
  // ---- Pathfinding sur grille (BFS) + suivi avec ligne de vue ----
  // Un chemin fixé à l'avance ne peut pas yoyoter : on avance le long et
  // on vise toujours le point le plus lointain visible. Replanifié si la
  // cible a beaucoup bougé, si le chemin est épuisé, ou sur blocage.
  const GRID_CELL = 200;
  const gridBounds = bounds
    ? { x0: bx0, y0: by0, x1: bx1, y1: by1 }
    : {
        x0: Math.min(fx, tx) - 2000, y0: Math.min(fy, ty) - 2000,
        x1: Math.max(fx, tx) + 2000, y1: Math.max(fy, ty) + 2000,
      };
  // Marge élargie après un blocage avéré : force un itinéraire plus large.
  const gridBlockMargin = shipR + 20 + (state.wideT > 0 ? 100 : 0);
  const gridW = Math.max(1, Math.ceil((gridBounds.x1 - gridBounds.x0) / GRID_CELL));
  const gridH = Math.max(1, Math.ceil((gridBounds.y1 - gridBounds.y0) / GRID_CELL));
  const gridCellBlocked = (ix, iy) => {
    const cx0 = gridBounds.x0 + ix * GRID_CELL, cy0 = gridBounds.y0 + iy * GRID_CELL;
    const cx1 = cx0 + GRID_CELL, cy1 = cy0 + GRID_CELL;
    for (const w of list) {
      const e = rectEdges(w);
      if (cx0 < e.right + gridBlockMargin && cx1 > e.left - gridBlockMargin
        && cy0 < e.bottom + gridBlockMargin && cy1 > e.top - gridBlockMargin) return true;
    }
    return false;
  };
  const gridCellOf = (x, y) => ({
    ix: clamp(Math.floor((x - gridBounds.x0) / GRID_CELL), 0, gridW - 1),
    iy: clamp(Math.floor((y - gridBounds.y0) / GRID_CELL), 0, gridH - 1),
  });
  const gridFreeNear = (ix, iy) => {
    for (let r = 0; r <= 12; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = ix + dx, ny = iy + dy;
          if (nx < 0 || ny < 0 || nx >= gridW || ny >= gridH) continue;
          if (!gridCellBlocked(nx, ny)) return { ix: nx, iy: ny };
        }
      }
    }
    return null;
  };
  const segClear = (ax, ay, bx, by) => {
    for (let i = 0; i < list.length; i++) {
      if (segmentHitsRect(ax, ay, bx, by, list[i], gridBlockMargin)) return false;
    }
    return true;
  };
  const planGridPath = () => {
    const sc = gridCellOf(fx, fy), gc = gridCellOf(tx, ty);
    const sn = gridFreeNear(sc.ix, sc.iy), gn = gridFreeNear(gc.ix, gc.iy);
    if (!sn || !gn) return null;
    const W = gridW, H = gridH;
    const si2 = sn.iy * W + sn.ix, gi = gn.iy * W + gn.ix;
    if (si2 === gi) return [{ x: tx, y: ty }];
    const prev = new Int32Array(W * H).fill(-1);
    const seen = new Uint8Array(W * H);
    const queue = [si2];
    seen[si2] = 1;
    let head = 0, found = false;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let guard = W * H + 5;
    while (head < queue.length && guard-- > 0) {
      const cur = queue[head++];
      if (cur === gi) { found = true; break; }
      const cx = cur % W, cy = (cur / W) | 0;
      for (const dd of DIRS) {
        const nx = cx + dd[0], ny = cy + dd[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (dd[0] !== 0 && dd[1] !== 0) {
          if (gridCellBlocked(cx + dd[0], cy) || gridCellBlocked(cx, cy + dd[1])) continue;
        }
        const ni = ny * W + nx;
        if (seen[ni] || gridCellBlocked(nx, ny)) continue;
        seen[ni] = 1; prev[ni] = cur; queue.push(ni);
      }
    }
    if (!found) return null;
    const cells = [];
    let c = gi, g2 = W * H + 5;
    while (c !== -1 && g2-- > 0) { cells.push(c); if (c === si2) break; c = prev[c]; }
    cells.reverse();
    return cells.map((idx) => {
      const ix = idx % W, iy = (idx / W) | 0;
      return { x: gridBounds.x0 + (ix + 0.5) * GRID_CELL, y: gridBounds.y0 + (iy + 0.5) * GRID_CELL };
    });
  };
  const targetMoved = Math.hypot(tx - (state.pathTx ?? tx), ty - (state.pathTy ?? ty));
  if (!Array.isArray(state.path) || targetMoved > 600) {
    state.path = planGridPath();
    state.pathI = 0; state.pathTx = tx; state.pathTy = ty; state.pathAge = 0;
    state.progD = Infinity; state.progT = 0;
  }
  let path = Array.isArray(state.path) ? state.path : null;
  let pi = Math.max(0, Number(state.pathI) || 0);
  state.pathAge = (Number(state.pathAge) || 0) + step;
  const pathDone = !path || !path.length || pi >= path.length;
  if (pathDone && state.pathAge > 2) {
    state.path = planGridPath();
    state.pathI = 0; state.pathTx = tx; state.pathTy = ty; state.pathAge = 0;
    path = Array.isArray(state.path) ? state.path : null;
    pi = 0;
  }
  if (!path || !path.length) {
    state.wideT = 0;
    return startFreeing(tx, ty);
  }
  while (pi < path.length && Math.hypot(fx - path[pi].x, fy - path[pi].y) < 150) pi++;
  if (pi >= path.length) {
    state.path = null;
    const last = path[path.length - 1];
    const wpe = clampToBounds(last);
    return finishDetour(wpe.x, wpe.y);
  }
  let aim = pi;
  for (let j = path.length - 1; j > pi; j--) {
    if (segClear(fx, fy, path[j].x, path[j].y)) { aim = j; break; }
  }
  state.pathI = aim;
  // Chien de garde : en suivi on doit se rapprocher de la cible. Si la
  // distance stagne 4 s (poussée dans une poche par le suivi, glissade
  // contre un mur), on invalide le chemin, on élargit la grille et on dégage.
  // Indépendant des replans : seul le rapprochement réel compte.
  const distT = Math.hypot(tx - fx, ty - fy);
  if (distT < (state.progD ?? Infinity) - 50) {
    state.progD = distT; state.progT = 0;
  } else {
    state.progT = (Number(state.progT) || 0) + step;
    if (state.progT > 4) {
      state.progD = distT; state.progT = 0;
      state.path = null;
      state.wideT = 6;
      return startFreeing(tx, ty);
    }
  }
  const wp = clampToBounds(path[aim]);
  return finishDetour(wp.x, wp.y);
}

export const BOT_RANGE = Object.freeze({ desired: 0.82, inner: 0.70, outer: 0.93, minimum: 140 });

function unit(x, y, fallbackX = 1, fallbackY = 0) {
  const length = Math.hypot(x, y);
  return length > 0.001 ? { x: x / length, y: y / length } : { x: fallbackX, y: fallbackY };
}

// Pure, deterministic steering: independent from rendering and frame rate.
export function computeBotCombatMove({ player, npc, range, desiredDistance, bounds, state = {}, dt = 0, walls = null, shipRadius = 18 }) {
  const laserRange = Math.max(BOT_RANGE.minimum, Number(range) || BOT_RANGE.minimum);
  const desired = Math.max(BOT_RANGE.minimum, Math.min(laserRange - 5, Number(desiredDistance) || laserRange * BOT_RANGE.desired));
  const inner = Math.max(90, desired - Math.max(35, laserRange * 0.06));
  const outer = Math.min(laserRange - 2, Math.max(inner + 20, desired + Math.max(18, laserRange * 0.025)));
  const dx = Number(player.x) - Number(npc.x);
  const dy = Number(player.y) - Number(npc.y);
  const distance = Math.hypot(dx, dy);
  const radial = unit(dx, dy);
  let mode = state.mode || "orbit";
  if (distance < inner) mode = "retreat";
  else if (distance > outer) mode = "approach";
  else if ((mode === "retreat" && distance >= desired) || (mode === "approach" && distance <= desired)) mode = "orbit";

  let direction = state.direction === -1 ? -1 : 1;
  if (!state.direction) direction = ((Number(npc.id) || 0) % 2) ? 1 : -1;
  const lead = mode === "approach" ? 0.3 : 0.15;
  const predictedX = Number(npc.x) + (Number(npc.vx) || 0) * lead;
  const predictedY = Number(npc.y) + (Number(npc.vy) || 0) * lead;
  const targetRadius = mode === "retreat" ? desired + 45 : desired;
  const angleStep = mode === "orbit" ? 0.58 : mode === "retreat" ? 0.24 : 0.18;
  const ca = Math.cos(angleStep * direction);
  const sa = Math.sin(angleStep * direction);
  const orbitX = radial.x * ca - radial.y * sa;
  const orbitY = radial.x * sa + radial.y * ca;

  let x = predictedX + orbitX * targetRadius;
  let y = predictedY + orbitY * targetRadius;
  let wallTurnT = Math.max(0, (Number(state.wallTurnT) || 0) - Math.max(0, Number(dt) || 0));
  const margin = Number(bounds?.margin ?? 80);
  const minX = Number(bounds?.minX ?? 0) + margin;
  const minY = Number(bounds?.minY ?? 0) + margin;
  const maxX = Number(bounds?.maxX ?? 10000) - margin;
  const maxY = Number(bounds?.maxY ?? 10000) - margin;
  if (x < minX || x > maxX || y < minY || y > maxY) {
    if (wallTurnT <= 0) {
      direction *= -1;
      wallTurnT = 0.75;
    }
    const tx = -radial.y * direction, ty = radial.x * direction;
    x = clamp(Number(player.x) + radial.x * 260 + tx * 520, minX, maxX);
    y = clamp(Number(player.y) + radial.y * 260 + ty * 520, minY, maxY);
  } else {
    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);
  }
  // Murs : le point d'orbite ne colle jamais un mur (sinon le vaisseau
  // le frôle en boucle et glitche dessus). On le translate en ligne droite
  // vers le joueur ET AU-DELÀ (le joueur lui-même peut être dans la marge :
  // viser le joueur ferait osciller autour de lui sans jamais sortir).
  if (Array.isArray(walls) && walls.length) {
    const stand = Math.max(1, Number(shipRadius) || 18) + 100;
    const px0 = Number(player.x) || 0, py0 = Number(player.y) || 0;
    const d0 = Math.hypot(px0 - x, py0 - y) || 1;
    const ux = (px0 - x) / d0, uy = (py0 - y) / d0;
    for (let k = 0; k < 30; k++) {
      let inside = false;
      for (const w of walls) {
        const e = rectEdges(w);
        if (x >= e.left - stand && x <= e.right + stand && y >= e.top - stand && y <= e.bottom + stand) { inside = true; break; }
      }
      if (!inside) break;
      x += ux * 50;
      y += uy * 50;
    }
    x = clamp(x, minX, maxX);
    y = clamp(y, minY, maxY);
    // Vaisseau près d'un mur : on inverse juste le sens de rotation
    // orbitale (avec cooldown, comme aux bords). Pas de répulsion : il
    // peut coller s'il faut, mais il tourne dans l'autre sens au lieu
    // de glitcher en boucle dans le même.
    let nx = 0, ny = 0, nd = Infinity;
    for (const w of walls) {
      const e = rectEdges(w);
      const cx = clamp(px0, e.left, e.right), cy = clamp(py0, e.top, e.bottom);
      const dx = px0 - cx, dy = py0 - cy;
      const d = Math.hypot(dx, dy);
      if (d < nd) { nd = d; nx = dx; ny = dy; }
    }
    const shipR2 = Math.max(1, Number(shipRadius) || 18);
    // Dès qu'il touche un mur ou s'en approche : inversion du sens de
    // rotation (avec cooldown, comme aux bords). Pas de seuil étroit.
    if (nd < shipR2 + 150 && wallTurnT <= 0) {
      direction *= -1;
      wallTurnT = 2;
    }
  }
  return { x, y, desired, inner, outer, distance, mode, state: { mode, direction, wallTurnT, elapsed: (Number(state.elapsed) || 0) + Math.max(0, Number(dt) || 0) } };
}
