import { SHIP_ENGINE_ASSIGNMENTS, SHIP_ENGINE_POSITIONS } from "./SHIP_ENGINE.js";

const TAU = Math.PI * 2;

export class ShipEngine {
  constructor(loadImage, options = {}) {
    this.path = options.path || "ASSETS/SHIP_ENGINE/";
    this.frames = options.frames || 16;
    this.fps = options.fps || 30;
    this.width = options.width || 62;
    this.height = options.height || 61;
    this.anchorX = options.anchorX ?? 23;
    this.anchorY = options.anchorY ?? 31;
    this.gap = options.gap ?? 8;
    this.trailRear = options.trailRear ?? 18;
    this.images = new Array(this.frames);
    this.ready = false;
    this.states = new WeakMap();
    Promise.all(Array.from({ length: this.frames }, (_, index) =>
      loadImage(`${this.path}${index + 1}.png`, { priority: true }).then(image => (this.images[index] = image))
    )).then(() => { this.ready = true; });
  }

  assignment(pack) {
    return SHIP_ENGINE_ASSIGNMENTS[pack?.id] || null;
  }

  spriteFrame(entity, pack) {
    const count = Math.max(1, Number(pack?.frames) || 1);
    const directionalCount = count === 33 ? 32 : count;
    const angle = (entity?.angle || 0) + (pack?.angleOffset || 0);
    const normalized = ((angle % TAU) + TAU) % TAU;
    return Math.floor(normalized / TAU * directionalCount) % directionalCount;
  }

  heading(entity, pack, frame = this.spriteFrame(entity, pack)) {
    const count = Math.max(1, Number(pack?.frames) || 1);
    const directionalCount = count === 33 ? 32 : count;
    return frame * TAU / directionalCount - (pack?.angleOffset || 0);
  }

  emitters(entity, pack, exactFrame = null) {
    const assignment = this.assignment(pack);
    const outputs = assignment && SHIP_ENGINE_POSITIONS[assignment.positionClass];
    if (!outputs) return [];
    const frame = exactFrame ?? this.spriteFrame(entity, pack);
    const image = pack?._imgs?.[frame] || pack?._imgs?.[0];
    const drawWidth = Number(pack?.w ?? image?.naturalWidth ?? 1);
    const drawHeight = Number(pack?.h ?? image?.naturalHeight ?? 1);
    const scaleX = image?.naturalWidth ? drawWidth / image.naturalWidth : 1;
    const scaleY = image?.naturalHeight ? drawHeight / image.naturalHeight : 1;
    return Object.values(outputs).flatMap(points => {
      const point = points?.[frame % points.length];
      return point ? [{ x: point[0] * scaleX, y: point[1] * scaleY, calibrated: true }] : [];
    });
  }

  update(entity, pack, dt, enabled = true) {
    let state = this.states.get(entity);
    if (!state) {
      state = { position: this.frames - 1 };
      this.states.set(entity, state);
    }
    if (!enabled || !this.assignment(pack)) {
      state.position = this.frames - 1;
      return;
    }
    const moving = !entity.dead && Math.hypot(entity.vx || 0, entity.vy || 0) > 8;
    state.position = Math.max(0, Math.min(this.frames - 1,
      state.position + (moving ? -1 : 1) * this.fps * dt));
  }

  draw(ctx, entity, pack, imageReady, exactFrame = null) {
    const state = this.states.get(entity);
    if (!this.ready || !state || state.position >= this.frames - 0.01) return;
    const image = this.images[Math.min(this.frames - 1, Math.floor(state.position))];
    if (!imageReady(image)) return;
    const frame = exactFrame ?? this.spriteFrame(entity, pack);
    const emitters = this.emitters(entity, pack, frame);
    if (!emitters.length) return;
    const angle = this.heading(entity, pack, frame);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "lighter";
    for (const emitter of emitters) {
      ctx.save();
      ctx.translate(emitter.x, emitter.y);
      ctx.rotate(angle + Math.PI);
      ctx.drawImage(image, -this.anchorX, -this.anchorY, this.width, this.height);
      ctx.restore();
    }
    ctx.restore();
  }
}
