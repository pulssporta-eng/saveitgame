import { ObstacleCircle } from './gameMechanics';
import { TerrainSimulation } from './terrainState';
import { TrooperRole } from './trooperBuilder';

export type BotAiState = 'expand' | 'recharge' | 'pickupGrenade' | 'pickupDizzy';

export interface BotAgentSnapshot {
  id: number;
  role: TrooperRole;
  x: number;
  z: number;
  ammo: number;
  hasGrenade: boolean;
  hasDizzyBomb?: boolean;
  isDizzy?: boolean;
  targetX: number;
  targetZ: number;
  retargetTimer: number;
  aiState: BotAiState;
  sweepPhase: number;
}

export interface BotEnvironmentContext {
  terrain: TerrainSimulation;
  obstacles: ReadonlyArray<ObstacleCircle>;
  allTroopers: ReadonlyArray<{ id: number; role?: TrooperRole; x: number; z: number }>;
  teamOrb: { active: boolean; x: number; z: number };
  teamGrenadePickup: { active: boolean; x: number; z: number };
  grenadePickupClaimedByCloserTeammate: boolean;
  teamDizzyPickup?: { active: boolean; x: number; z: number };
  dizzyPickupClaimedByCloserTeammate?: boolean;
  elapsed: number;
  dt: number;
}

export interface BotDecisionOutput {
  nextState: BotAiState;
  moveDirX: number;
  moveDirZ: number;
  aimX: number;
  aimZ: number;
  shouldFire: boolean;
  shouldThrowGrenade: boolean;
  shouldThrowDizzy: boolean;
  targetX: number;
  targetZ: number;
  retargetTimer: number;
}

export function decideBotState(params: {
  ammo: number;
  hasGrenade: boolean;
  hasDizzyBomb?: boolean;
  teamOrbActive: boolean;
  teamGrenadeActive: boolean;
  distToGrenade: number;
  claimedByCloserTeammate: boolean;
  teamDizzyActive?: boolean;
  distToDizzy?: number;
  dizzyClaimedByCloserTeammate?: boolean;
}): BotAiState {
  if (params.ammo <= 0 && params.teamOrbActive) {
    return 'recharge';
  }
  if (
    !params.hasGrenade &&
    params.teamGrenadeActive &&
    !params.claimedByCloserTeammate &&
    params.distToGrenade < 28
  ) {
    return 'pickupGrenade';
  }
  if (
    !params.hasDizzyBomb &&
    params.teamDizzyActive &&
    !params.dizzyClaimedByCloserTeammate &&
    (params.distToDizzy ?? Infinity) < 26
  ) {
    return 'pickupDizzy';
  }
  return 'expand';
}

export function computeSteeredDirection(
  x: number,
  z: number,
  goalX: number,
  goalZ: number,
  agentId: number,
  arenaHalfSize: number,
  obstacles: ReadonlyArray<ObstacleCircle>,
  otherTroopers: ReadonlyArray<{ id: number; x: number; z: number }>,
): { dirX: number; dirZ: number; distToGoal: number } {
  const gx = goalX - x;
  const gz = goalZ - z;
  const distToGoal = Math.hypot(gx, gz);
  if (distToGoal < 0.05) {
    return { dirX: 0, dirZ: 0, distToGoal: 0 };
  }

  let steerX = gx / distToGoal;
  let steerZ = gz / distToGoal;

  // Avoid tree trunks with smooth tangential slide + radial push
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    const ox = x - obs.x;
    const oz = z - obs.z;
    const avoidR = obs.radius + 1.35;
    const dSq = ox * ox + oz * oz;
    if (dSq < avoidR * avoidR && dSq > 1e-5) {
      const d = Math.sqrt(dSq);
      const strength = ((avoidR - d) / avoidR) * 1.85;
      const nx = ox / d;
      const nz = oz / d;
      // Tangential component helps bot slide smoothly past trunk instead of oscillating
      const side = (agentId % 2 === 0 ? 1 : -1);
      steerX += (nx + -nz * 0.65 * side) * strength;
      steerZ += (nz + nx * 0.65 * side) * strength;
    }
  }

  // Keep slight personal spacing from other troopers
  for (let i = 0; i < otherTroopers.length; i++) {
    const other = otherTroopers[i];
    if (other.id === agentId) continue;
    const tx = x - other.x;
    const tz = z - other.z;
    const minSep = 2.0;
    const dSq = tx * tx + tz * tz;
    if (dSq < minSep * minSep && dSq > 1e-5) {
      const d = Math.sqrt(dSq);
      const push = ((minSep - d) / minSep) * 1.15;
      steerX += (tx / d) * push;
      steerZ += (tz / d) * push;
    }
  }

  // Soft boundary push away from perimeter curbs
  const margin = arenaHalfSize - 1.6;
  if (Math.abs(x) > margin) steerX -= Math.sign(x) * 1.5;
  if (Math.abs(z) > margin) steerZ -= Math.sign(z) * 1.5;

  const mag = Math.hypot(steerX, steerZ);
  if (mag < 1e-4) {
    return { dirX: gx / distToGoal, dirZ: gz / distToGoal, distToGoal };
  }
  return {
    dirX: steerX / mag,
    dirZ: steerZ / mag,
    distToGoal,
  };
}

export function stepBotAi(
  bot: BotAgentSnapshot,
  ctx: BotEnvironmentContext,
  rng: () => number = Math.random,
): BotDecisionOutput {
  if (bot.isDizzy) {
    return {
      nextState: bot.aiState,
      moveDirX: 0,
      moveDirZ: 0,
      aimX: bot.targetX,
      aimZ: bot.targetZ,
      shouldFire: false,
      shouldThrowGrenade: false,
      shouldThrowDizzy: false,
      targetX: bot.targetX,
      targetZ: bot.targetZ,
      retargetTimer: Math.max(0, bot.retargetTimer - ctx.dt),
    };
  }

  const { terrain, teamOrb, teamGrenadePickup, teamDizzyPickup } = ctx;
  const distToGrenade = teamGrenadePickup.active
    ? Math.hypot(teamGrenadePickup.x - bot.x, teamGrenadePickup.z - bot.z)
    : Infinity;
  const distToDizzy = teamDizzyPickup?.active
    ? Math.hypot(teamDizzyPickup.x - bot.x, teamDizzyPickup.z - bot.z)
    : Infinity;

  const nextState = decideBotState({
    ammo: bot.ammo,
    hasGrenade: bot.hasGrenade,
    hasDizzyBomb: bot.hasDizzyBomb,
    teamOrbActive: teamOrb.active,
    teamGrenadeActive: teamGrenadePickup.active,
    distToGrenade,
    claimedByCloserTeammate: ctx.grenadePickupClaimedByCloserTeammate,
    teamDizzyActive: teamDizzyPickup?.active,
    distToDizzy,
    dizzyClaimedByCloserTeammate: ctx.dizzyPickupClaimedByCloserTeammate,
  });

  let targetX = bot.targetX;
  let targetZ = bot.targetZ;
  let retargetTimer = bot.retargetTimer - ctx.dt;

  // 1. Ammo Recharge State: sprint straight toward personal glowing Recharge Sign
  if (nextState === 'recharge') {
    const steered = computeSteeredDirection(
      bot.x,
      bot.z,
      teamOrb.x,
      teamOrb.z,
      bot.id,
      terrain.arenaHalfSize,
      ctx.obstacles,
      ctx.allTroopers,
    );
    return {
      nextState,
      moveDirX: steered.dirX,
      moveDirZ: steered.dirZ,
      aimX: teamOrb.x,
      aimZ: teamOrb.z,
      shouldFire: false,
      shouldThrowGrenade: false,
      shouldThrowDizzy: false,
      targetX,
      targetZ,
      retargetTimer: Math.max(0, retargetTimer),
    };
  }

  // 2. Grenade Pickup State: move straight to pickup
  if (nextState === 'pickupGrenade') {
    const steered = computeSteeredDirection(
      bot.x,
      bot.z,
      teamGrenadePickup.x,
      teamGrenadePickup.z,
      bot.id,
      terrain.arenaHalfSize,
      ctx.obstacles,
      ctx.allTroopers,
    );
    const curTargetEnemy =
      bot.role === 'hero'
        ? terrain.sampleTargetBiome(targetX, targetZ)
        : 1 - terrain.sampleTargetBiome(targetX, targetZ);
    const opportunisticFire = bot.ammo > 15 && curTargetEnemy > 0.35 && Math.hypot(targetX - bot.x, targetZ - bot.z) < 7.2;

    return {
      nextState,
      moveDirX: steered.dirX,
      moveDirZ: steered.dirZ,
      aimX: opportunisticFire ? targetX : teamGrenadePickup.x,
      aimZ: opportunisticFire ? targetZ : teamGrenadePickup.z,
      shouldFire: opportunisticFire,
      shouldThrowGrenade: false,
      shouldThrowDizzy: false,
      targetX,
      targetZ,
      retargetTimer: Math.max(0, retargetTimer),
    };
  }

  // 2b. Dizzy Bomb Pickup State: move straight to Dizzy pickup
  if (nextState === 'pickupDizzy' && teamDizzyPickup) {
    const steered = computeSteeredDirection(
      bot.x,
      bot.z,
      teamDizzyPickup.x,
      teamDizzyPickup.z,
      bot.id,
      terrain.arenaHalfSize,
      ctx.obstacles,
      ctx.allTroopers,
    );
    return {
      nextState,
      moveDirX: steered.dirX,
      moveDirZ: steered.dirZ,
      aimX: teamDizzyPickup.x,
      aimZ: teamDizzyPickup.z,
      shouldFire: false,
      shouldThrowGrenade: false,
      shouldThrowDizzy: false,
      targetX,
      targetZ,
      retargetTimer: Math.max(0, retargetTimer),
    };
  }

  // 2c. Throw Dizzy Bomb right near an opponent within range
  if (bot.hasDizzyBomb) {
    let closestEnemy: { x: number; z: number; dist: number } | null = null;
    for (let i = 0; i < ctx.allTroopers.length; i++) {
      const other = ctx.allTroopers[i];
      if (!other.role || other.role === bot.role) continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (!closestEnemy || d < closestEnemy.dist) {
        closestEnemy = { x: other.x, z: other.z, dist: d };
      }
    }
    if (closestEnemy && closestEnemy.dist <= 13.5 && closestEnemy.dist >= 2.2) {
      return {
        nextState,
        moveDirX: 0,
        moveDirZ: 0,
        aimX: closestEnemy.x,
        aimZ: closestEnemy.z,
        shouldFire: false,
        shouldThrowGrenade: false,
        shouldThrowDizzy: true,
        targetX: closestEnemy.x,
        targetZ: closestEnemy.z,
        retargetTimer: 0.4,
      };
    }
  }

  // 3. Territory Expansion State (+ Smart Grenade Cluster Throw)
  if (bot.hasGrenade) {
    const cluster = terrain.findEnemyTerritoryTarget(bot.role, bot.x, bot.z, true, rng);
    const distCluster = Math.hypot(cluster.x - bot.x, cluster.z - bot.z);
    if (distCluster <= 15.8 && distCluster >= 3.2 && cluster.enemyDensity >= 0.42) {
      return {
        nextState,
        moveDirX: 0,
        moveDirZ: 0,
        aimX: cluster.x,
        aimZ: cluster.z,
        shouldFire: false,
        shouldThrowGrenade: true,
        shouldThrowDizzy: false,
        targetX: cluster.x,
        targetZ: cluster.z,
        retargetTimer: 0.4,
      };
    }
    // Move within comfortable throw distance of the dense enemy cluster
    const steered = computeSteeredDirection(
      bot.x,
      bot.z,
      cluster.x,
      cluster.z,
      bot.id,
      terrain.arenaHalfSize,
      ctx.obstacles,
      ctx.allTroopers,
    );
    return {
      nextState,
      moveDirX: steered.dirX,
      moveDirZ: steered.dirZ,
      aimX: cluster.x,
      aimZ: cluster.z,
      shouldFire: false,
      shouldThrowGrenade: false,
      shouldThrowDizzy: false,
      targetX: cluster.x,
      targetZ: cluster.z,
      retargetTimer: 0.4,
    };
  }

  // Check if current target patch is already converted to friendly territory
  const targetBiome = terrain.sampleTargetBiome(targetX, targetZ);
  const targetEnemyAmount = bot.role === 'hero' ? targetBiome : 1 - targetBiome;
  if (retargetTimer <= 0 || targetEnemyAmount < 0.25) {
    const nextPatch = terrain.findEnemyTerritoryTarget(bot.role, bot.x, bot.z, false, rng);
    targetX = nextPatch.x;
    targetZ = nextPatch.z;
    retargetTimer = 2.0 + rng() * 1.4;
  }

  const distToTarget = Math.hypot(targetX - bot.x, targetZ - bot.z);
  let moveDirX = 0;
  let moveDirZ = 0;

  // Desired firing stance: advance if > 5.8m away, strafe gently around target if inside range
  if (distToTarget > 5.6) {
    const steered = computeSteeredDirection(
      bot.x,
      bot.z,
      targetX,
      targetZ,
      bot.id,
      terrain.arenaHalfSize,
      ctx.obstacles,
      ctx.allTroopers,
    );
    moveDirX = steered.dirX;
    moveDirZ = steered.dirZ;
  } else if (distToTarget < 2.2) {
    // Step back slightly while keeping stream on enemy patch
    const awayX = bot.x + (bot.x - targetX) * 1.5;
    const awayZ = bot.z + (bot.z - targetZ) * 1.5;
    const steered = computeSteeredDirection(
      bot.x,
      bot.z,
      awayX,
      awayZ,
      bot.id,
      terrain.arenaHalfSize,
      ctx.obstacles,
      ctx.allTroopers,
    );
    moveDirX = steered.dirX * 0.7;
    moveDirZ = steered.dirZ * 0.7;
  } else {
    // Gentle lateral strafe while sweeping stream across enemy ground
    const dx = (targetX - bot.x) / Math.max(0.01, distToTarget);
    const dz = (targetZ - bot.z) / Math.max(0.01, distToTarget);
    const strafeSign = Math.sin(ctx.elapsed * 0.75 + bot.sweepPhase) >= 0 ? 1 : -1;
    const goalX = bot.x + (-dz * strafeSign + dx * 0.15) * 3.0;
    const goalZ = bot.z + (dx * strafeSign + dz * 0.15) * 3.0;
    const steered = computeSteeredDirection(
      bot.x,
      bot.z,
      goalX,
      goalZ,
      bot.id,
      terrain.arenaHalfSize,
      ctx.obstacles,
      ctx.allTroopers,
    );
    moveDirX = steered.dirX * 0.65;
    moveDirZ = steered.dirZ * 0.65;
  }

  // Sweep aim subtly across neighboring enemy ground while firing
  const sweepAngle = ctx.elapsed * 2.4 + bot.sweepPhase;
  const aimX = Math.max(
    -terrain.arenaHalfSize + 0.6,
    Math.min(terrain.arenaHalfSize - 0.6, targetX + Math.cos(sweepAngle) * 1.15),
  );
  const aimZ = Math.max(
    -terrain.arenaHalfSize + 0.6,
    Math.min(terrain.arenaHalfSize - 0.6, targetZ + Math.sin(sweepAngle) * 1.15),
  );
  const shouldFire = bot.ammo > 0 && distToTarget < 7.8;

  return {
    nextState,
    moveDirX,
    moveDirZ,
    aimX,
    aimZ,
    shouldFire,
    shouldThrowGrenade: false,
    shouldThrowDizzy: false,
    targetX,
    targetZ,
    retargetTimer,
  };
}
