import test from "node:test";
import assert from "node:assert/strict";
import { petEscortTarget, stepPetMotion, petCombatVelocity, orientPet } from "../../PET/PET_MOTION.js";



function simulate(fps) {
  const player = { x: 2000, y: 2000, vx: 300, vy: 0 };
  const pet = { x: 1860, y: 2085 };
  for (let frame = 0; frame < fps * 15; frame++) {
    const dt = 1 / fps;
    if (frame >= fps * 10) player.vx = 0;
    player.x += player.vx * dt;
    const dest = petEscortTarget(pet, player, dt);
    const vx = (dest.x - pet.x) * 3;
    const vy = (dest.y - pet.y) * 3;
    const scale = Math.min(1, 390 / (Math.hypot(vx, vy) || 1));
    stepPetMotion(pet, vx * scale, vy * scale, dt, { w: 10000, h: 10000 });
  }
  assert.ok(Math.hypot(pet.x - player.x, pet.y - player.y) < 330);
  return pet;
}

test('continuous follow and braking at 30, 60 and 144 FPS', () => {
  for (const fps of [30, 60, 144]) simulate(fps);
});

test('movement keeps a straight course between dry direction corrections', () => {
  const pet = { x: 2000, y: 2000, vx: 250, vy: 0 };
  const world = { w: 10000, h: 10000 };
  stepPetMotion(pet, 250, 0, 1 / 60, world);
  stepPetMotion(pet, 230, 90, 1 / 60, world);
  assert.ok(Math.abs(pet.vy) < 1e-9, 'course is held between corrections');
  for (let i = 0; i < 20; i++) stepPetMotion(pet, 230, 90, 1 / 60, world);
  assert.ok(pet.vy > 20, 'new course is then applied sharply');
});

test('circling inside the rest zone keeps the escort point fixed', () => {
  const pet = { x: 1000, y: 1000 };
  const player = { x: 1000, y: 1000, vx: 0, vy: 0 };
  const first = petEscortTarget(pet, player, 1 / 60);
  for (let i = 0; i < 1200; i++) {
    const angle = i / 30;
    player.x = 1000 + Math.cos(angle) * 200;
    player.y = 1000 + Math.sin(angle) * 200;
    player.vx = -400 * Math.sin(angle);
    player.vy = 400 * Math.cos(angle);
    assert.deepEqual(petEscortTarget(pet, player, 1 / 60), first);
  }
});

test('continuous and point clicks give the same escort destinations', () => {
  const continuous = { x: 800, y: 1000 };
  const clicks = { ...continuous };
  for (let i = 0; i < 600; i++) {
    const player = { x: 1000 + i * 5, y: 1000, vx: 300, vy: 0 };
    const first = petEscortTarget(continuous, player, 1 / 60);
    const second = petEscortTarget(clicks, { ...player, vx: i % 10 === 0 ? 0 : 300 }, 1 / 60);
    assert.deepEqual(first, second);
  }
});

test('follow delay survives a stop outside the rest zone', () => {
  const pet = { x: 1000, y: 1000 };
  const player = { x: 1000, y: 1000, vx: 0, vy: 0 };
  petEscortTarget(pet, player, 1 / 60);
  player.x = 1400;
  for (let i = 0; i < 20; i++) {
    assert.equal(petEscortTarget(pet, player, 1 / 60).x, 1000);
  }
  for (let i = 0; i < 10; i++) petEscortTarget(pet, player, 1 / 60);
  assert.equal(pet.escortX, 1175);
});

test('an idle owner keeps the same escort point', () => {
  const state = { x: 880, y: 1080 };
  const player = { x: 1000, y: 1000, vx: 0, vy: 0, angle: 0 };
  const first = petEscortTarget(state, player, 1 / 60);
  for (let i = 0; i < 60 * 20; i++) {
    const target = petEscortTarget(state, player, 1 / 60);
    assert.deepEqual(target, first);
  }
});

test('after following, rest positions can be ahead or sideways and stay fixed', () => {
  const originalRandom = Math.random;
  try {
    for (const choice of [0, 0.25, 0.75]) {
      Math.random = () => choice;
      const state = { x: 800, y: 1000 };
      const player = { x: 1000, y: 1000, vx: 300, vy: 0 };
      for (let i = 0; i < 240; i++) {
        player.x += 5;
        petEscortTarget(state, player, 1 / 60);
      }
      player.vx = 0;
      let rest;
      for (let i = 0; i < 60; i++) rest = petEscortTarget(state, player, 1 / 60);
      const distance = Math.hypot(rest.x - player.x, rest.y - player.y);
      assert.ok(distance >= 119 && distance <= 255);
      if (choice === 0) assert.ok(rest.x > player.x, 'can park ahead');
      else assert.ok(Math.abs(rest.y - player.y) > 100, 'can park sideways');
      for (let i = 0; i < 600; i++) {
        assert.deepEqual(petEscortTarget(state, player, 1 / 60), rest);
      }
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('combat approaches an annulus without crossing the target centre', () => {
  const pet = { x: 2500, y: 2000, angle: 0 };
  const target = { x: 2000, y: 2000 };
  let minDistance = Infinity;
  for (let i = 0; i < 1200; i++) {
    const v = petCombatVelocity(pet, target, 300, 1 / 60);
    stepPetMotion(pet, v.vx, v.vy, 1 / 60, { w: 10000, h: 10000 });
    orientPet(pet, 1 / 60);
    minDistance = Math.min(minDistance, Math.hypot(pet.x - target.x, pet.y - target.y));
  }
  assert.ok(minDistance > 210);
  assert.ok(Math.hypot(pet.x - target.x, pet.y - target.y) <= 305);
  const before = { x: pet.x, y: pet.y };
  petCombatVelocity(pet, { x: 6000, y: 4000 }, 300, 1 / 60);
  assert.equal(pet.x, before.x);
  assert.equal(pet.y, before.y);
});
