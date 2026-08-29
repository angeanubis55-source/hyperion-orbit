"use strict";

export function createKeyboardState() {
  const held = new Set();
  const pressed = new Set();
  return {
    held,
    pressed,
    keyDown(code, repeat = false) {
      held.add(code);
      if (!repeat) pressed.add(code);
    },
    keyUp(code) { held.delete(code); },
    endFrame() { pressed.clear(); },
    reset() { held.clear(); pressed.clear(); },
  };
}

export function createPointerState() {
  return {
    down: false,
    clientX: 0,
    clientY: 0,
    dragStartX: 0,
    dragStartY: 0,
    dragArmed: false,
    dragging: false,
    downOnEnemy: false,
    followWhileDown: false,
    remember(event) {
      this.clientX = Number(event?.clientX || 0);
      this.clientY = Number(event?.clientY || 0);
    },
    begin(event) {
      this.down = true;
      this.remember(event);
      this.dragStartX = this.clientX;
      this.dragStartY = this.clientY;
      this.dragArmed = true;
      this.dragging = false;
      this.downOnEnemy = false;
      this.followWhileDown = false;
    },
    reset() {
      this.down = false;
      this.dragArmed = false;
      this.dragging = false;
      this.downOnEnemy = false;
      this.followWhileDown = false;
    },
  };
}
