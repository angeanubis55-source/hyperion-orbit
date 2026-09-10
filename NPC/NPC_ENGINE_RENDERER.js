import { NPC_ENGINE_ASSIGNMENTS, NPC_ENGINE_POSITIONS } from "./NPC_ENGINE.js";

const TAU = Math.PI * 2;

export class NpcEngine {
  constructor(loadImage, options = {}) {
    this.path = options.path || "ASSETS/SHIP_ENGINE/";
    this.frames = options.frames || 16;
    this.fps = options.fps || 20;
    this.width = options.width || 62;
    this.height = options.height || 61;
    // Pivot du symbole `mc` mesure dans engine0.swf : (23, 31) sur 62 x 61.
    this.anchorX = options.anchorX ?? 23;
    this.anchorY = options.anchorY ?? 31;
    this.images = new Array(this.frames);
    this.ready = false;
    this.states = new WeakMap();
    Promise.all(Array.from({ length: this.frames }, (_, index) =>
      loadImage(`${this.path}${index + 1}.png`).then(image => (this.images[index] = image))
    )).then(() => { this.ready = true; });
  }

  assignment(type) {
    return NPC_ENGINE_ASSIGNMENTS[type] || null;
  }

  spriteFrame(entity, config) {
    const sprite = config?.sprite || {};
    const count = Math.max(1, Number(sprite.frames) || 1);
    if (entity.type === "npc_Cubikon" && !entity.spritePlay) {
      return entity._animPhase === "hold" ? count - 1 : 0;
    }
    if (entity.spritePlay || config?.playSprite) {
      return Math.min(count - 1, Math.max(0, Math.floor(entity.spriteIdx || 0)));
    }
    const directionalCount = count === 33 ? 32 : count;
    const angle = (entity.angle || 0) + (sprite.angleOffset || 0);
    const normalized = ((angle % TAU) + TAU) % TAU;
    return Math.floor(normalized / TAU * directionalCount) % directionalCount;
  }

  heading(entity, config, frame = this.spriteFrame(entity, config)) {
    const sprite = config?.sprite || {};
    if (entity.spritePlay || config?.playSprite) return Number(entity.angle) || 0;
    const count = Math.max(1, Number(sprite.frames) || 1);
    const directionalCount = count === 33 ? 32 : count;
    return (frame % directionalCount) * TAU / directionalCount - (sprite.angleOffset || 0);
  }

  emitters(entity, config, exactFrame = null) {
    const assignment = this.assignment(entity?.type);
    const outputs = assignment && NPC_ENGINE_POSITIONS[assignment.positionClass];
    if (!outputs) return [];
    const frame = exactFrame ?? this.spriteFrame(entity, config);
    const sprite = config?.sprite || {};
    const image = sprite._imgs?.[frame] || sprite._imgs?.[0] || sprite._previewImg;
    const drawWidth = Number(sprite.w ?? sprite.size ?? image?.naturalWidth ?? 1);
    const drawHeight = Number(sprite.h ?? sprite.size ?? image?.naturalHeight ?? 1);
    const bossScale = entity.isBoss ? 1.05 : 1;
    const scaleX = image?.naturalWidth ? drawWidth * bossScale / image.naturalWidth : bossScale;
    const scaleY = image?.naturalHeight ? drawHeight * bossScale / image.naturalHeight : bossScale;
    return Object.values(outputs).flatMap(points => {
      const point = points[frame % points.length];
      return point ? [{ x: point[0] * scaleX, y: point[1] * scaleY }] : [];
    });
  }

  update(entity, dt, enabled = true) {
    let state = this.states.get(entity);
    if (!state) {
      state = { position: this.frames - 1 };
      this.states.set(entity, state);
    }
    if (!enabled) {
      state.position = this.frames - 1;
      return;
    }
    const moving = entity.hp > 0 && Math.hypot(entity.vx || 0, entity.vy || 0) > 8;
    state.position = Math.max(0, Math.min(this.frames - 1,
      state.position + (moving ? -1 : 1) * this.fps * dt));
  }

  draw(ctx, entity, config, imageReady, exactFrame = null) {
    const state = this.states.get(entity);
    if (!this.ready || !state || state.position >= this.frames - 0.01) return;
    const image = this.images[Math.min(this.frames - 1, Math.floor(state.position))];
    if (!imageReady(image)) return;
    const emitters = this.emitters(entity, config, exactFrame);
    if (!emitters.length) return;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "lighter";
    for (const emitter of emitters) {
      ctx.save();
      ctx.translate(emitter.x, emitter.y);
      ctx.rotate(this.heading(entity, config, exactFrame ?? this.spriteFrame(entity, config)) + Math.PI);
      ctx.drawImage(
        image,
        -this.anchorX,
        -this.anchorY,
        this.width,
        this.height,
      );
      ctx.restore();
    }
    ctx.restore();
  }
}
