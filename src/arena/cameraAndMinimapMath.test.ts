import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampThirdPersonPitch,
  computeThirdPersonCameraPose,
  worldToMinimapCoord,
  worldYawToCanvasAngle,
} from './cameraAndMinimapMath';

test('computeThirdPersonCameraPose places camera behind hero facing +X over right shoulder', () => {
  const pose = computeThirdPersonCameraPose({
    playerX: -8,
    playerY: 0.4,
    playerZ: 2,
    camYaw: Math.PI / 2,
    camPitch: -0.22,
    distance: 6,
    shoulderOffset: 0.7,
    sampleGroundHeight: () => 0.4,
  });

  // Facing +X means camera must be behind on -X side of player and look further +X
  assert.ok(pose.camX < -8, `expected camera X behind player (-8), got ${pose.camX}`);
  assert.ok(pose.lookX > 0, `expected lookX ahead of player toward +X, got ${pose.lookX}`);
  // Screen right when facing +X is +Z
  assert.ok(pose.camZ > 2, `expected slight right-shoulder +Z offset, got ${pose.camZ}`);
  assert.ok(pose.camY >= 1.12, 'camera maintains ground clearance');
});

test('computeThirdPersonCameraPose lifts camera above steep terrain hills', () => {
  const pose = computeThirdPersonCameraPose({
    playerX: 0,
    playerY: 0,
    playerZ: 0,
    camYaw: 0,
    camPitch: 0.35,
    distance: 6,
    sampleGroundHeight: () => 2.5,
  });
  assert.ok(pose.camY >= 3.219, `expected terrain clearance >= 3.219, got ${pose.camY}`);
});

test('clampThirdPersonPitch keeps pitch within safe vertical bounds', () => {
  assert.equal(clampThirdPersonPitch(-2.5), -0.92);
  assert.equal(clampThirdPersonPitch(1.8), 0.42);
  assert.equal(clampThirdPersonPitch(-0.25), -0.25);
});

test('worldToMinimapCoord maps meadow (-X) left and desert (+X) right across scaled arenas', () => {
  const size = 160;
  const center = worldToMinimapCoord(0, 0, 25, size);
  assert.equal(center.px, 80);
  assert.equal(center.py, 80);

  const heroCorner = worldToMinimapCoord(-25, -25, 25, size);
  assert.equal(heroCorner.px, 0);
  assert.equal(heroCorner.py, 0);

  const villainCorner = worldToMinimapCoord(25, 25, 25, size);
  assert.equal(villainCorner.px, 160);
  assert.equal(villainCorner.py, 160);
});

test('worldYawToCanvasAngle aligns +X to right (0 rad) and -X to left (PI rad)', () => {
  assert.ok(Math.abs(worldYawToCanvasAngle(Math.PI / 2) - 0) < 1e-6);
  assert.ok(Math.abs(Math.abs(worldYawToCanvasAngle(-Math.PI / 2)) - Math.PI) < 1e-6);
  assert.ok(Math.abs(worldYawToCanvasAngle(0) - Math.PI / 2) < 1e-6);
});
