import { PET_ENGINE_POSITIONS } from "./PET_ENGINE.js";

const TAU = Math.PI * 2;

export class PetEngine {
  constructor(loadImage, options = {}) {
    this.path = options.path || "ASSETS/SHIP_ENGINE/";
    this.frames = options.frames || 16;
    this.fps = options.fps || 30;
    this.width = options.width || 62;
    this.height = options.height || 61;
    this.anchorX = options.anchorX ?? 23;
    this.anchorY = options.anchorY ?? 31;
    this.drawWidth = options.drawWidth || 154;
    this.drawHeight = options.drawHeight || 137;
    this.images = new Array(this.frames);
    this.ready = false;
    this.states = new WeakMap();
    Promise.all(Array.from({ length: this.frames }, (_, index) =>
      loadImage(`${this.path}${index + 1}.png`, { priority: true }).then(image => (this.images[index] = image))
    )).then(() => { this.ready = true; });
  }

  heading(frame) {
    const directionalFrame = ((Math.max(1, Number(frame) || 1) - 1 - 16) % 32 + 32) % 32;
    return directionalFrame * TAU / 32;
  }

  emitters(entity, spriteImage, exactFrame) {
    const frame = ((Math.max(1, Number(exactFrame) || 1) - 1) % 32 + 32) % 32;
    const sourceWidth = spriteImage?.naturalWidth || spriteImage?.width;
    const sourceHeight = spriteImage?.naturalHeight || spriteImage?.height;
    const scaleX = sourceWidth ? this.drawWidth / sourceWidth : 1;
    const scaleY = sourceHeight ? this.drawHeight / sourceHeight : 1;
    return Object.values(PET_ENGINE_POSITIONS).flatMap(points => {
      const point = points[frame];
      return point ? [{ x: point[0] * scaleX, y: point[1] * scaleY, calibrated: true }] : [];
    });
  }

  update(entity, dt, enabled = true) {
    let state = this.states.get(entity);
    if (!state) {
      state = { position: this.frames - 1 };
      this.states.set(entity, state);
    }
    const moving = enabled && Math.hypot(entity?.vx || 0, entity?.vy || 0) > 8;
    state.position = Math.max(0, Math.min(this.frames - 1,
      state.position + (moving ? -1 : 1) * this.fps * dt));
  }

  draw(ctx, entity, spriteImage, exactFrame, imageReady) {
    const state = this.states.get(entity);
    if (!this.ready || !state || state.position >= this.frames - 0.01) return;
    const image = this.images[Math.min(this.frames - 1, Math.floor(state.position))];
    if (!imageReady(image)) return;
    const emitters = this.emitters(entity, spriteImage, exactFrame);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = "lighter";
    for (const emitter of emitters) {
      ctx.save();
      ctx.translate(emitter.x, emitter.y);
      ctx.rotate(this.heading(exactFrame) + Math.PI);
      ctx.drawImage(image, -this.anchorX, -this.anchorY, this.width, this.height);
      ctx.restore();
    }
    ctx.restore();
  }
}
