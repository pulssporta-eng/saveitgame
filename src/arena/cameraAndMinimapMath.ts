export interface ThirdPersonCameraPose {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
}

export function clampThirdPersonPitch(pitch: number): number {
  return Math.max(-0.92, Math.min(0.42, pitch));
}

/**
 * Computes a third-person over-the-shoulder chase camera pose directly behind
 * the active player's facing yaw (`camYaw`), avoiding any camera-to-aim feedback loop.
 * Coordinate convention: yaw = 0 faces +Z; yaw = +PI/2 faces +X.
 */
export function computeThirdPersonCameraPose(params: {
  playerX: number;
  playerY: number;
  playerZ: number;
  camYaw: number;
  camPitch: number;
  distance?: number;
  shoulderOffset?: number;
  pivotHeight?: number;
  sampleGroundHeight: (x: number, z: number) => number;
}): ThirdPersonCameraPose {
  const distance = params.distance ?? 5.6;
  const shoulderOffset = params.shoulderOffset ?? 0.68;
  const pivotHeight = params.pivotHeight ?? 1.56;
  const pitch = clampThirdPersonPitch(params.camPitch);

  const cosP = Math.cos(pitch);
  const sinP = Math.sin(pitch);
  const sinY = Math.sin(params.camYaw);
  const cosY = Math.cos(params.camYaw);

  // Full 3D look direction
  const fx = sinY * cosP;
  const fy = sinP;
  const fz = cosY * cosP;

  // Screen-right horizontal axis (forward × up)
  const rx = -cosY;
  const rz = sinY;

  const pivotX = params.playerX;
  const pivotY = params.playerY + pivotHeight;
  const pivotZ = params.playerZ;

  const camX = pivotX - fx * distance + rx * shoulderOffset;
  let camY = pivotY - fy * distance + 0.32;
  const camZ = pivotZ - fz * distance + rz * shoulderOffset;

  const minGroundY = params.sampleGroundHeight(camX, camZ) + 0.72;
  if (camY < minGroundY) {
    camY = minGroundY;
  }

  const lookDist = 14.0;
  const lookX = pivotX + fx * lookDist + rx * (shoulderOffset * 0.45);
  const lookY = pivotY + fy * lookDist;
  const lookZ = pivotZ + fz * lookDist + rz * (shoulderOffset * 0.45);

  return {
    camX,
    camY,
    camZ,
    lookX,
    lookY,
    lookZ,
    forwardX: sinY,
    forwardZ: cosY,
    rightX: rx,
    rightZ: rz,
  };
}

export interface MinimapCoord {
  px: number;
  py: number;
}

/**
 * Maps world (x, z) inside [-arenaHalfSize, +arenaHalfSize] to 2D minimap pixels [0, mapSize].
 * Left (-X, Hero Meadow) -> px < mapSize / 2; Right (+X, Villain Desert) -> px > mapSize / 2.
 */
export function worldToMinimapCoord(
  wx: number,
  wz: number,
  arenaHalfSize: number,
  mapSize: number,
): MinimapCoord {
  const half = Math.max(1, arenaHalfSize);
  const nx = Math.max(0, Math.min(1, (wx / half) * 0.5 + 0.5));
  const nz = Math.max(0, Math.min(1, (wz / half) * 0.5 + 0.5));
  return {
    px: nx * mapSize,
    py: nz * mapSize,
  };
}

/**
 * Converts a 3D world yaw (0 = +Z, +PI/2 = +X) into a 2D HTML5 Canvas rotation angle
 * where angle 0 points +X (right) and +PI/2 points +Y (down).
 */
export function worldYawToCanvasAngle(yaw: number): number {
  return Math.atan2(Math.cos(yaw), Math.sin(yaw));
}
