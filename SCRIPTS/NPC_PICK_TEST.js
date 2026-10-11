import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createSpriteHitCache } from '../SRC/CORE/SPRITE_HIT_CACHE.js';
import { getNpcSpriteFrame } from '../NPC/NPC_RENDERER.js';
import { drawCenteredImage, screenToWorldPoint, worldToScreenPoint } from '../SRC/CORE/RENDERING.js';

const engine = readFileSync(new URL('../SRC/CORE/ORBIT_ENGINE.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function engineFunction(name) {
  const start = engine.indexOf(`function ${name}(`), end = engine.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start, name);
  return engine.slice(start, end + 2);
}

function image(w = 9, h = 5, opaque = (x, y) => x >= 2 && x <= 6 && y >= 1 && y <= 3 && !(x === 4 && y === 2)) {
  return { complete: true, naturalWidth: w, naturalHeight: h, opaque };
}

function canvasFactory() {
  const canvases = [], reads = [];
  return {
    canvases, reads,
    createCanvas() {
      let source;
      const canvas = { width: 0, height: 0, getContext: () => ({
        drawImage: img => { source = img; },
        getImageData: (_, __, w, h) => {
          reads.push(source);
          const data = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            data[(y * w + x) * 4 + 3] = source.opaque(x, y) ? 255 : 0;
          }
          return { data };
        },
      }) };
      canvases.push(canvas);
      return canvas;
    },
  };
}

test('masque alpha : coins transparents et trous exclus, pixels visibles inclus', () => {
  const factory = canvasFactory(), cache = createSpriteHitCache(factory), img = image();
  for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) {
    assert.equal(cache.contains(img, 90, 50, (x + 0.5) * 10 - 45, (y + 0.5) * 10 - 25),
      img.opaque(x, y), `${x},${y}`);
  }
  assert.equal(factory.reads.length, 1);
  assert.ok(factory.canvases.every(c => c.width === 0 && c.height === 0));
});

test('masque partage entre tailles : ratio, mise a l echelle boss et bords exacts', () => {
  const factory = canvasFactory(), cache = createSpriteHitCache(factory), img = image();
  for (const [w, h] of [[90, 50], [800, 640], [840, 672], [27, 15]]) {
    for (let y = 0; y < 5; y++) for (let x = 0; x < 9; x++) {
      assert.equal(cache.contains(img, w, h, ((x + 0.5) / 9 - 0.5) * w,
        ((y + 0.5) / 5 - 0.5) * h), img.opaque(x, y));
    }
  }
  assert.equal(factory.reads.length, 1, 'aucun nouveau masque pour une autre taille');
  const full = image(3, 2, () => true);
  assert.equal(cache.contains(full, 90, 50, -45, -25), true);
  for (const [x, y] of [[45, 0], [0, 25], [-45.001, 0], [0, -25.001], [NaN, 0], [Infinity, 0]]) {
    assert.equal(cache.contains(full, 90, 50, x, y), false);
  }
  assert.equal(cache.contains(full, 0, 50, 0, 0), false);
});

test('32 frames Mindfire : un seul calcul par image, cache compact et distinct par frame', () => {
  const factory = canvasFactory(), cache = createSpriteHitCache(factory);
  const frames = Array.from({ length: 32 }, (_, i) => image(800, 640, (x, y) => x === 400 + i && y === 320));
  for (let repeat = 0; repeat < 3; repeat++) for (let i = 0; i < frames.length; i++) {
    assert.equal(cache.contains(frames[i], 800, 640, i + 0.5, 0.5), true);
    assert.equal(cache.contains(frames[i], 800, 640, i - 0.5, 0.5), false);
  }
  assert.equal(factory.reads.length, 32);
  assert.deepEqual(cache.stats(), { entries: 32, bytes: 32 * 800 * 640 / 8 });
});

test('cache alpha : evictions bornees, dernier masque utilise conserve et vidage', () => {
  const factory = canvasFactory(), cache = createSpriteHitCache({ ...factory, maxEntries: 2, maxBytes: 4 });
  const a = image(4, 4, () => true), b = image(4, 4, () => true), c = image(4, 4, () => true);
  const hit = img => cache.contains(img, 40, 40, 0, 0);
  hit(a); hit(b); hit(a); hit(c); hit(a);
  assert.deepEqual(factory.reads, [a, b, c]);
  assert.deepEqual(cache.stats(), { entries: 2, bytes: 4 });
  hit(b); assert.equal(factory.reads.length, 4);
  cache.clear(); assert.deepEqual(cache.stats(), { entries: 0, bytes: 0 });
  hit(a); assert.equal(factory.reads.length, 5);
});

test('images non chargees ou illisibles : aucun rectangle de selection ni lecture repetee en erreur', () => {
  const factory = canvasFactory(), cache = createSpriteHitCache(factory), img = image();
  img.complete = false;
  assert.equal(cache.contains(img, 90, 50, -15, 0), false);
  assert.equal(factory.reads.length, 0);
  img.complete = true;
  assert.equal(cache.contains(img, 90, 50, -15, 0), true);
  let attempts = 0;
  const failed = createSpriteHitCache({ createCanvas: () => ({ getContext: () => ({
    drawImage() {}, getImageData() { attempts++; throw new Error('unreadable'); },
  }) }) });
  assert.equal(failed.contains(img, 90, 50, 0, 0), false);
  assert.equal(failed.contains(img, 90, 50, 0, 0), false);
  assert.equal(attempts, 1);
});

function pickerHarness(config = {}) {
  const factory = canvasFactory(), draws = [];
  const c = vm.createContext({
    NPC_TYPES: { npc_test: { sprite: { _ready: true, _imgs: [image(), image(9, 5, (x, y) => x === 7 && y === 2)],
      frames: 2, w: 90, h: 50 }, ...config } },
    spriteHitCache: createSpriteHitCache(factory), getNpcSpriteFrame, drawCenteredImage,
    screenToWorldPoint, worldToScreenPoint, innerWidth: 1600, innerHeight: 900,
    camera: { x: 12000, y: 7000 }, enemies: [], TAU: Math.PI * 2,
    normAng: angle => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2),
    isImgReady: img => !!(img?.complete && img.naturalWidth > 0),
    petLockValid: () => false, netplayNpcActive: () => false,
    canvas: { style: {} }, petState: { x: 12000, y: 7000 }, petTargetProxy: { id: 'pet' },
    PET_DRAW_W: 170, PET_DRAW_H: 150, netPlayerProxies: new Map(), netPetProxies: new Map(),
    ctx: { save() {}, restore() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
      drawImage: (...args) => draws.push(args) },
  });
  vm.runInContext(['screenToWorld', 'angleToFrameIndex', 'getEnemySpriteFrame', 'enemySpriteSize',
    'enemySpriteContainsPoint', 'pickEnemyAtScreen', 'drawEnemyBody', 'updateEnemyCursor']
    .map(engineFunction).join('\n'), c);
  const screen = (x, y) => worldToScreenPoint(x, y, c.camera, c.innerWidth, c.innerHeight);
  return { c, factory, draws, screen, pick: (x, y) => {
    const p = screen(x, y); return c.pickEnemyAtScreen(p.x, p.y);
  } };
}

test('selection et survol NPC : meme silhouette a la souris, coins et centre creux exclus', () => {
  const { c, pick, screen } = pickerHarness();
  const npc = { type: 'npc_test', x: 12000, y: 7000, hp: 100, r: 18, angle: 0, spritePlay: true, spriteIdx: 0 };
  c.enemies.push(npc);
  assert.equal(pick(npc.x - 40, npc.y - 20), null);
  assert.equal(pick(npc.x, npc.y), null, 'un trou transparent ne verrouille pas le NPC');
  assert.equal(pick(npc.x - 15, npc.y), npc);
  const visible = screen(npc.x - 15, npc.y), empty = screen(npc.x, npc.y);
  assert.equal(c.updateEnemyCursor(visible.x, visible.y), true);
  assert.equal(c.canvas.style.cursor, 'pointer');
  assert.equal(c.updateEnemyCursor(empty.x, empty.y), false);
});

test('selection : frame animee et frame directionnelle identiques au corps dessine', () => {
  const { c, pick, draws } = pickerHarness();
  const npc = { type: 'npc_test', x: 12000, y: 7000, hp: 100, r: 18, angle: 0, spritePlay: true, spriteIdx: 0 };
  c.enemies.push(npc);
  c.drawEnemyBody(npc);
  assert.equal(draws.at(-1)[0], c.NPC_TYPES.npc_test.sprite._imgs[0]);
  assert.equal(pick(npc.x - 15, npc.y), npc);
  npc.spriteIdx = 1;
  c.drawEnemyBody(npc);
  assert.equal(draws.at(-1)[0], c.NPC_TYPES.npc_test.sprite._imgs[1]);
  assert.equal(pick(npc.x - 15, npc.y), null);
  assert.equal(pick(npc.x + 30, npc.y), npc);
  npc.spritePlay = false;
  for (const angle of [0, Math.PI]) {
    npc.angle = angle; c.drawEnemyBody(npc);
    const index = c.getEnemySpriteFrame(npc, c.NPC_TYPES.npc_test, c.NPC_TYPES.npc_test.sprite);
    assert.equal(draws.at(-1)[0], c.NPC_TYPES.npc_test.sprite._imgs[index]);
    assert.equal(pick(npc.x + 30, npc.y), index === 1 ? npc : null);
  }
});

test('selection boss : taille reelle 105 %, pas de rotation ajoutee a une frame deja orientee', () => {
  const { c, pick, draws } = pickerHarness();
  c.NPC_TYPES.npc_test.sprite._imgs = [image(9, 5, (x, y) => x === 8 && y === 2)];
  const npc = { type: 'npc_test', x: 12000, y: 7000, hp: 100, r: 18, angle: Math.PI / 2, isBoss: true };
  c.enemies.push(npc); c.drawEnemyBody(npc);
  assert.equal(draws.at(-1)[3], 94.5); assert.equal(draws.at(-1)[4], 52.5);
  assert.equal(pick(npc.x + 46, npc.y), npc, 'le bord visible depasse la taille standard');
  assert.equal(pick(npc.x, npc.y + 46), null);
});

test('selection : frames de repli et disque de chargement suivent le rendu sans case vide clickable', () => {
  const { c, pick } = pickerHarness();
  const npc = { type: 'npc_test', x: 12000, y: 7000, hp: 100, r: 18, spritePlay: true, spriteIdx: 1 };
  c.enemies.push(npc);
  c.NPC_TYPES.npc_test.sprite._imgs[1] = null;
  assert.equal(pick(npc.x - 15, npc.y), npc, 'la frame manquante utilise la premiere image');
  c.NPC_TYPES.npc_test.sprite._ready = false;
  assert.equal(pick(npc.x, npc.y), npc);
  assert.equal(pick(npc.x + 17, npc.y + 17), null, 'hors du disque temporaire');
  assert.equal(pick(npc.x + 40, npc.y), null, 'la taille du PNG non charge ne compte pas');
});

test('NPC superposes : cliquer un trou selectionne le corps visible derriere, NPC morts ignores', () => {
  const { c, pick } = pickerHarness();
  const front = { type: 'npc_test', x: 12000, y: 7000, hp: 100, r: 18, spritePlay: true, spriteIdx: 0 };
  const behind = { ...front, x: 12015 };
  c.enemies.push(front, behind);
  assert.equal(pick(front.x, front.y), behind);
  behind.hp = 0; assert.equal(pick(front.x, front.y), null);
});

test('le clic dans le vide du PNG reste disponible pour les joueurs et PET', () => {
  const { c, pick } = pickerHarness();
  c.enemies.push({ type: 'npc_test', x: 12000, y: 7000, hp: 100, r: 18, spritePlay: true, spriteIdx: 0 });
  c.petLockValid = () => true;
  assert.equal(pick(12000, 7000), c.petTargetProxy);
  c.petLockValid = () => false; c.netplayNpcActive = () => true;
  const remote = { id: 'friend', x: 12000, y: 7000, hp: 100 };
  c.netPlayerProxies.set(remote.id, remote);
  assert.equal(pick(12000, 7000), remote);
  remote._netCloaked = true; assert.equal(pick(12000, 7000), null);
});
