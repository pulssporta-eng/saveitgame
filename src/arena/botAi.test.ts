import test from 'node:test';
import assert from 'node:assert/strict';
import { BotAgentSnapshot, computeSteeredDirection, decideBotState, stepBotAi } from './botAi';
import { TerrainSimulation } from './terrainState';

function makeBot(overrides: Partial<BotAgentSnapshot> = {}): BotAgentSnapshot {
  return {
    id: 1,
    role: 'hero',
    x: -6,
    z: 0,
    ammo: 80,
    hasGrenade: false,
    targetX: 4,
    targetZ: 0,
    retargetTimer: 1.5,
    aiState: 'expand',
    sweepPhase: 0,
    ...overrides,
  };
}

test('bot immediately prioritizes recharge orb when ammo hits 0', () => {
  const terrain = new TerrainSimulation(40, 96);
  const state = decideBotState({
    ammo: 0,
    hasGrenade: false,
    teamOrbActive: true,
    teamGrenadeActive: true,
    distToGrenade: 4,
    claimedByCloserTeammate: false,
  });
  assert.equal(state, 'recharge');

  const out = stepBotAi(makeBot({ ammo: 0, x: -5, z: 0 }), {
    terrain,
    obstacles: [],
    allTroopers: [],
    teamOrb: { active: true, x: 7, z: 4 },
    teamGrenadePickup: { active: false, x: 0, z: 0 },
    grenadePickupClaimedByCloserTeammate: false,
    elapsed: 10,
    dt: 0.05,
  });
  assert.equal(out.nextState, 'recharge');
  assert.equal(out.shouldFire, false);
  assert.ok(out.moveDirX > 0.7);
  assert.ok(out.moveDirZ > 0.2);
});

test('bot collects nearby team grenade pickup and throws it at dense enemy territory cluster', () => {
  const terrain = new TerrainSimulation(40, 96);

  // 1. Seeks grenade pickup when available & unclaimed
  const pickupOut = stepBotAi(makeBot({ ammo: 75, hasGrenade: false, x: -3, z: 1 }), {
    terrain,
    obstacles: [],
    allTroopers: [],
    teamOrb: { active: false, x: 0, z: 0 },
    teamGrenadePickup: { active: true, x: 2, z: 1 },
    grenadePickupClaimedByCloserTeammate: false,
    elapsed: 16,
    dt: 0.05,
  });
  assert.equal(pickupOut.nextState, 'pickupGrenade');
  assert.ok(pickupOut.moveDirX > 0.9);

  // 2. Throws grenade onto dense enemy (desert) cluster once carrying grenade
  let seed = 0.2;
  const rng = () => {
    seed = (seed + 0.17) % 1;
    return seed;
  };
  const throwOut = stepBotAi(makeBot({ role: 'hero', ammo: 75, hasGrenade: true, x: 1.5, z: 0 }), {
    terrain,
    obstacles: [],
    allTroopers: [],
    teamOrb: { active: false, x: 0, z: 0 },
    teamGrenadePickup: { active: false, x: 0, z: 0 },
    grenadePickupClaimedByCloserTeammate: false,
    elapsed: 18,
    dt: 0.05,
  }, rng);
  assert.equal(throwOut.nextState, 'expand');
  assert.equal(throwOut.shouldThrowGrenade, true);
  assert.ok(throwOut.aimX > 1.0, `Hero bot should aim grenade into enemy desert, got x=${throwOut.aimX}`);
});

test('bot expands into enemy territory and steers around tree obstacles', () => {
  const terrain = new TerrainSimulation(40, 96);
  const expandOut = stepBotAi(makeBot({ role: 'villain', ammo: 90, x: 2, z: 0, targetX: -3, targetZ: 0 }), {
    terrain,
    obstacles: [],
    allTroopers: [],
    teamOrb: { active: false, x: 0, z: 0 },
    teamGrenadePickup: { active: false, x: 0, z: 0 },
    grenadePickupClaimedByCloserTeammate: false,
    elapsed: 5,
    dt: 0.05,
  });
  assert.equal(expandOut.nextState, 'expand');
  assert.equal(expandOut.shouldFire, true);

  // Obstacle avoidance pushes around a tree placed directly on the path
  const steered = computeSteeredDirection(0, 0, 10, 0, 2, 20, [{ x: 1.0, z: 0.05, radius: 0.7 }], []);
  assert.ok(Math.abs(steered.dirZ) > 0.15, 'Bot steering should deflect tangentially around tree trunk');
});

test('dizzy bot cannot move or shoot, and bot with dizzy bomb targets close enemy', () => {
  const terrain = new TerrainSimulation(40, 96);

  const dizzyOut = stepBotAi(makeBot({ isDizzy: true, ammo: 90, x: -3, z: 0 }), {
    terrain,
    obstacles: [],
    allTroopers: [],
    teamOrb: { active: false, x: 0, z: 0 },
    teamGrenadePickup: { active: false, x: 0, z: 0 },
    grenadePickupClaimedByCloserTeammate: false,
    elapsed: 5,
    dt: 0.05,
  });
  assert.equal(dizzyOut.moveDirX, 0);
  assert.equal(dizzyOut.moveDirZ, 0);
  assert.equal(dizzyOut.shouldFire, false);

  const throwOut = stepBotAi(makeBot({ role: 'hero', hasDizzyBomb: true, ammo: 90, x: -2, z: 0 }), {
    terrain,
    obstacles: [],
    allTroopers: [
      { id: 1, role: 'hero', x: -2, z: 0 },
      { id: 2, role: 'villain', x: 5, z: 1 },
    ],
    teamOrb: { active: false, x: 0, z: 0 },
    teamGrenadePickup: { active: false, x: 0, z: 0 },
    grenadePickupClaimedByCloserTeammate: false,
    elapsed: 10,
    dt: 0.05,
  });
  assert.equal(throwOut.shouldThrowDizzy, true);
  assert.equal(throwOut.aimX, 5);
  assert.equal(throwOut.aimZ, 1);
});

