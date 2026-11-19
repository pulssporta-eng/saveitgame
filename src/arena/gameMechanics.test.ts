import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE_PLAYER_SPEED,
  computeFpsLookAndBasis,
  computeParabolicLaunch,
  computePlayerSprintState,
  computeTreeProximityVisibility,
  computeTreeTargetLushness,
  DIZZY_BOMB_RADIUS,
  DIZZY_DURATION_SECONDS,
  drainAmmo,
  EMPTY_TANK_SPRINT_SPEED,
  findDizzyVictims,
  GRENADE_AOE_RADIUS,
  GRENADE_SPAWN_INTERVAL,
  isWithinPickupRadius,
  MAX_AMMO,
  pickValidArenaPoint,
  stepDizzyTimer,
  stepScalarToward,
} from './gameMechanics';

test('ammo drains smoothly, clamps at 0, and triggers justEmptied exactly once', () => {
  const mid = drainAmmo(MAX_AMMO, 1.0, 20);
  assert.equal(mid.nextAmmo, 80);
  assert.equal(mid.justEmptied, false);

  const empty = drainAmmo(5, 0.5, 20);
  assert.equal(empty.nextAmmo, 0);
  assert.equal(empty.justEmptied, true);

  const alreadyEmpty = drainAmmo(0, 0.5, 20);
  assert.equal(alreadyEmpty.nextAmmo, 0);
  assert.equal(alreadyEmpty.justEmptied, false);
});

test('pickValidArenaPoint avoids tree obstacles and close player spawn points', () => {
  let seed = 1337;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const obstacles = [
    { x: 0, z: 0, radius: 1.5 },
    { x: 3, z: -2, radius: 1.2 },
  ];
  const avoid = [{ x: -4, z: 2, minDist: 4.0 }];

  const pt = pickValidArenaPoint(
    {
      minX: -6,
      maxX: 6,
      minZ: -8,
      maxZ: 8,
      obstacles,
      avoidPoints: avoid,
    },
    rng,
  );

  for (const obs of obstacles) {
    assert.ok(Math.hypot(pt.x - obs.x, pt.z - obs.z) >= obs.radius + 0.9);
  }
  assert.ok(Math.hypot(pt.x - (-4), pt.z - 2) >= 3.9);
});

test('parabolic grenade launch lands cleanly at the target coordinates', () => {
  const g = 18.0;
  const launch = computeParabolicLaunch(-4, 1.8, 2, 5.5, 0.4, -3.5, g);
  const t = launch.flightTime;

  const endX = -4 + launch.vx * t;
  const endY = 1.8 + launch.vy * t - 0.5 * g * t * t;
  const endZ = 2 + launch.vz * t;

  assert.ok(Math.abs(endX - 5.5) < 1e-4);
  assert.ok(Math.abs(endY - 0.4) < 1e-4);
  assert.ok(Math.abs(endZ - (-3.5)) < 1e-4);
  // Ensure noticeable upward arc peak
  assert.ok(launch.vy > 2.0);
});

test('pickup radius and constants match Step 3 gameplay spec', () => {
  assert.equal(MAX_AMMO, 100);
  assert.equal(GRENADE_SPAWN_INTERVAL, 15);
  assert.equal(GRENADE_AOE_RADIUS, 6.0);
  assert.equal(isWithinPickupRadius(2.0, 2.0, 2.8, 2.6, 1.4), true);
  assert.equal(isWithinPickupRadius(2.0, 2.0, 4.5, 2.0, 1.4), false);
});

test('tree lushness converts smoothly between meadow green and burned dry desert', () => {
  assert.equal(computeTreeTargetLushness(0.0), 1);
  assert.equal(computeTreeTargetLushness(0.2), 1);
  const mid = computeTreeTargetLushness(0.45);
  assert.ok(mid > 0.4 && mid < 0.6);
  assert.equal(computeTreeTargetLushness(0.75), 0);
  assert.equal(computeTreeTargetLushness(1.0), 0);

  const next = stepScalarToward(1, 0, 3.0, 0.25);
  assert.ok(next < 0.6 && next > 0.35);
});

test('first-person camera basis clamps pitch and aligns character facing with view direction', () => {
  const clamped = computeFpsLookAndBasis(0, 3.5);
  assert.equal(clamped.clampedPitch, 1.05);

  const basis = computeFpsLookAndBasis(-Math.PI * 0.5, 0);
  // Camera looking +X: forwardX ~ 1, forwardZ ~ 0; right vector points +Z (rightZ ~ 1)
  assert.ok(Math.abs(basis.forwardX - 1) < 1e-6);
  assert.ok(Math.abs(basis.forwardZ) < 1e-6);
  assert.ok(Math.abs(basis.rightZ - 1) < 1e-6);
  // Character forward (+sin(charYaw), +cos(charYaw)) matches camera forward (+1, 0)
  assert.ok(Math.abs(Math.sin(basis.charYaw) - basis.forwardX) < 1e-6);
  assert.ok(Math.abs(Math.cos(basis.charYaw) - basis.forwardZ) < 1e-6);
});

test('empty-tank Shift speed boost unlocks at 0 ammo and stops immediately upon recharge', () => {
  // Tank has ammo: holding Shift does NOT grant boost
  const fullWithShift = computePlayerSprintState({ ammo: 45, isShiftHeld: true, isMoving: true });
  assert.equal(fullWithShift.canEmptySprint, false);
  assert.equal(fullWithShift.isSprinting, false);
  assert.equal(fullWithShift.targetSpeed, BASE_PLAYER_SPEED);

  // Tank empty, Shift not held: base speed, but eligible
  const emptyIdleShift = computePlayerSprintState({ ammo: 0, isShiftHeld: false, isMoving: true });
  assert.equal(emptyIdleShift.canEmptySprint, true);
  assert.equal(emptyIdleShift.isSprinting, false);
  assert.equal(emptyIdleShift.targetSpeed, BASE_PLAYER_SPEED);

  // Tank empty, Shift held and moving: extra speed active
  const emptyBoosting = computePlayerSprintState({ ammo: 0, isShiftHeld: true, isMoving: true });
  assert.equal(emptyBoosting.canEmptySprint, true);
  assert.equal(emptyBoosting.isSprinting, true);
  assert.equal(emptyBoosting.targetSpeed, EMPTY_TANK_SPRINT_SPEED);
  assert.ok(EMPTY_TANK_SPRINT_SPEED > BASE_PLAYER_SPEED);

  // Recharged while still holding Shift: stops immediately until next empty
  const rechargedWithShift = computePlayerSprintState({ ammo: 100, isShiftHeld: true, isMoving: true });
  assert.equal(rechargedWithShift.canEmptySprint, false);
  assert.equal(rechargedWithShift.isSprinting, false);
  assert.equal(rechargedWithShift.targetSpeed, BASE_PLAYER_SPEED);
});

test('tree proximity visibility fades nearby trees and restores full opacity further away', () => {
  const closeVis = computeTreeProximityVisibility(1.5, 0.12, 1.8, 4.4);
  assert.ok(Math.abs(closeVis - 0.12) < 1e-6);

  const midVis = computeTreeProximityVisibility(3.1, 0.12, 1.8, 4.4);
  assert.ok(midVis > 0.45 && midVis < 0.65);

  const farVis = computeTreeProximityVisibility(5.0, 0.12, 1.8, 4.4);
  assert.equal(farVis, 1);
});

test('dizzy bomb affects only close opposing-team troopers within its small radius and stuns for 3 seconds', () => {
  assert.equal(DIZZY_DURATION_SECONDS, 3.0);
  assert.ok(DIZZY_BOMB_RADIUS < GRENADE_AOE_RADIUS);

  const troopers = [
    { id: 1, role: 'hero' as const, x: 0.5, z: 0.5 }, // ally inside range -> ignored
    { id: 2, role: 'villain' as const, x: 2.0, z: 1.5 }, // enemy inside 3.4m -> hit!
    { id: 3, role: 'villain' as const, x: 5.0, z: 0.0 }, // enemy outside 3.4m -> safe
  ];
  const hitIds = findDizzyVictims(0, 0, 'hero', troopers);
  assert.deepEqual(hitIds, [2]);

  const s1 = stepDizzyTimer(DIZZY_DURATION_SECONDS, 1.2);
  assert.equal(s1.isDizzy, true);
  assert.ok(Math.abs(s1.nextTimer - 1.8) < 1e-6);

  const s2 = stepDizzyTimer(s1.nextTimer, 2.0);
  assert.equal(s2.isDizzy, false);
  assert.equal(s2.nextTimer, 0);
});



