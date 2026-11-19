import { ARENA_HALF_SIZE } from './terrainMath';

export const MAX_AMMO = 100;
export const AMMO_DRAIN_PER_SEC = 14.5;
export const GRENADE_SPAWN_INTERVAL = 15;
export const GRENADE_AOE_RADIUS = 6.0;
export const PICKUP_RADIUS = 1.4;

export interface Vec2 {
  x: number;
  z: number;
}

export interface ObstacleCircle {
  x: number;
  z: number;
  radius: number;
}

export interface ParabolicLaunch {
  vx: number;
  vy: number;
  vz: number;
  flightTime: number;
}

export function drainAmmo(currentAmmo: number, dt: number, drainRate = AMMO_DRAIN_PER_SEC): {
  nextAmmo: number;
  justEmptied: boolean;
} {
  if (currentAmmo <= 0) {
    return { nextAmmo: 0, justEmptied: false };
  }
  const next = Math.max(0, currentAmmo - drainRate * Math.max(0, dt));
  return {
    nextAmmo: next,
    justEmptied: next === 0,
  };
}

export function isWithinPickupRadius(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius = PICKUP_RADIUS,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz <= radius * radius;
}

export function pickValidArenaPoint(
  options: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    arenaHalfSize?: number;
    obstacles: ReadonlyArray<ObstacleCircle>;
    avoidPoints?: ReadonlyArray<{ x: number; z: number; minDist: number }>;
  },
  rng: () => number = Math.random,
): Vec2 {
  const { minX, maxX, minZ, maxZ, obstacles, avoidPoints = [] } = options;
  const clampLimit = (options.arenaHalfSize ?? ARENA_HALF_SIZE) - 1.5;
  const loX = Math.max(-clampLimit, minX);
  const hiX = Math.min(clampLimit, maxX);
  const loZ = Math.max(-clampLimit, minZ);
  const hiZ = Math.min(clampLimit, maxZ);

  let bestX = (loX + hiX) * 0.5;
  let bestZ = (loZ + hiZ) * 0.5;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < 48; attempt++) {
    const cx = loX + rng() * (hiX - loX);
    const cz = loZ + rng() * (hiZ - loZ);

    let clear = true;
    let minClearance = Infinity;

    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const d = Math.hypot(cx - obs.x, cz - obs.z) - (obs.radius + 0.95);
      if (d < 0) {
        clear = false;
      }
      if (d < minClearance) minClearance = d;
    }

    for (let i = 0; i < avoidPoints.length; i++) {
      const av = avoidPoints[i];
      const d = Math.hypot(cx - av.x, cz - av.z) - av.minDist;
      if (d < 0) {
        clear = false;
      }
      if (d < minClearance) minClearance = d;
    }

    if (clear) {
      return { x: cx, z: cz };
    }
    if (minClearance > bestScore) {
      bestScore = minClearance;
      bestX = cx;
      bestZ = cz;
    }
  }

  return { x: bestX, z: bestZ };
}

export function computeParabolicLaunch(
  startX: number,
  startY: number,
  startZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  gravity = 18.0,
): ParabolicLaunch {
  const dx = targetX - startX;
  const dy = targetY - startY;
  const dz = targetZ - startZ;
  const horizDist = Math.hypot(dx, dz);
  const flightTime = Math.max(0.42, Math.min(1.18, horizDist / 13.5 + 0.14));

  return {
    vx: dx / flightTime,
    vz: dz / flightTime,
    vy: (dy + 0.5 * gravity * flightTime * flightTime) / flightTime,
    flightTime,
  };
}

/**
 * Converts a local biome mask average (0 = lush meadow, 1 = arid desert)
 * into a tree lushness target (1 = lush green foliage, 0 = parched dry tree).
 */
export function computeTreeTargetLushness(avgBiomeMask: number): number {
  const dryStart = 0.28;
  const dryEnd = 0.62;
  const t = Math.max(0, Math.min(1, (avgBiomeMask - dryStart) / (dryEnd - dryStart)));
  const smoothDry = t * t * (3 - 2 * t);
  return 1 - smoothDry;
}

export function stepScalarToward(
  current: number,
  target: number,
  rate: number,
  dt: number,
): number {
  if (Math.abs(target - current) <= 0.001) return target;
  const alpha = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, dt));
  return current + (target - current) * alpha;
}

export interface FpsCameraBasis {
  clampedPitch: number;
  charYaw: number;
  forwardX: number;
  forwardY: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
}

/**
 * Computes clamped FPS pitch, synchronized character yaw (Trooper faces +Z at yaw=0,
 * Three.js camera looks down -Z at rotation.y=0), and horizontal movement basis vectors.
 */
export function computeFpsLookAndBasis(fpsYaw: number, fpsPitch: number): FpsCameraBasis {
  const clampedPitch = Math.max(-1.12, Math.min(1.05, fpsPitch));
  const cosP = Math.cos(clampedPitch);
  const forwardX = -Math.sin(fpsYaw) * cosP;
  const forwardY = Math.sin(clampedPitch);
  const forwardZ = -Math.cos(fpsYaw) * cosP;
  const rightX = Math.cos(fpsYaw);
  const rightZ = -Math.sin(fpsYaw);
  const charYaw = fpsYaw + Math.PI;
  return {
    clampedPitch,
    charYaw,
    forwardX,
    forwardY,
    forwardZ,
    rightX,
    rightZ,
  };
}

export const BASE_PLAYER_SPEED = 6.2;
export const EMPTY_TANK_SPRINT_SPEED = 10.6;

export interface PlayerSprintState {
  canEmptySprint: boolean;
  isSprinting: boolean;
  targetSpeed: number;
}

/**
 * Grants extra movement speed while holding Shift ONLY when the player's tank is empty (ammo <= 0).
 * As soon as the player recharges (ammo > 0), extra speed stops immediately until the tank empties again.
 */
export function computePlayerSprintState(params: {
  ammo: number;
  isShiftHeld: boolean;
  isMoving: boolean;
}): PlayerSprintState {
  const canEmptySprint = params.ammo <= 0;
  const isSprinting = canEmptySprint && params.isShiftHeld && params.isMoving;
  const targetSpeed =
    canEmptySprint && params.isShiftHeld ? EMPTY_TANK_SPRINT_SPEED : BASE_PLAYER_SPEED;
  return {
    canEmptySprint,
    isSprinting,
    targetSpeed,
  };
}

/**
 * Pure mirror of the tree proximity dither formula so tests can verify fade range.
 */
export function computeTreeProximityVisibility(
  distanceToTree: number,
  minVisibility = 0.14,
  innerRadius = 1.8,
  outerRadius = 4.4,
): number {
  const t = Math.max(0, Math.min(1, (distanceToTree - innerRadius) / (outerRadius - innerRadius)));
  const smooth = t * t * (3 - 2 * t);
  const fadeAmount = 1 - smooth;
  return 1 - fadeAmount * (1 - minVisibility);
}

export const DIZZY_BOMB_RADIUS = 3.4;
export const DIZZY_DURATION_SECONDS = 3.0;
export const DIZZY_SPAWN_INTERVAL = 14.0;

/**
 * Returns IDs of opposing-team troopers caught within the Dizzy Bomb's small AoE radius.
 */
export function findDizzyVictims(
  bombX: number,
  bombZ: number,
  throwerRole: 'hero' | 'villain',
  troopers: ReadonlyArray<{ id: number; role: 'hero' | 'villain'; x: number; z: number }>,
  radius = DIZZY_BOMB_RADIUS,
): number[] {
  const rSq = radius * radius;
  const victims: number[] = [];
  for (let i = 0; i < troopers.length; i++) {
    const t = troopers[i];
    if (t.role === throwerRole) continue;
    const dx = t.x - bombX;
    const dz = t.z - bombZ;
    if (dx * dx + dz * dz <= rSq) {
      victims.push(t.id);
    }
  }
  return victims;
}

export function stepDizzyTimer(
  currentTimer: number,
  dt: number,
): { nextTimer: number; isDizzy: boolean } {
  const nextTimer = Math.max(0, currentTimer - Math.max(0, dt));
  return {
    nextTimer,
    isDizzy: nextTimer > 0.001,
  };
}

