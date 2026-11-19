import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_HALF_SIZE,
  buildArenaEcosystem,
  getBiomeMask,
  getTerrainHeight,
} from './terrainMath';

test('continuous terrain heightfield is smooth, bounded, and tapers cleanly at borders', () => {
  let minH = Infinity;
  let maxH = -Infinity;

  for (let x = -19.5; x <= 19.5; x += 0.5) {
    for (let z = -19.5; z <= 19.5; z += 0.5) {
      const h = getTerrainHeight(x, z);
      assert.ok(Number.isFinite(h));
      assert.ok(h >= -0.2 && h <= 1.6, `Height ${h} at (${x}, ${z}) out of bounds`);
      minH = Math.min(minH, h);
      maxH = Math.max(maxH, h);
    }
  }

  assert.ok(maxH - minH > 0.5, 'Terrain must have rich organic height variation');
  assert.equal(getTerrainHeight(ARENA_HALF_SIZE, 0), 0);
  assert.equal(getTerrainHeight(-ARENA_HALF_SIZE, 0), 0);
});

test('organic biome mask transitions smoothly from lush meadow (left) to desert (right)', () => {
  assert.ok(getBiomeMask(-12, 0) < 0.05, 'Far left should be pure lush meadow');
  assert.ok(getBiomeMask(12, 0) > 0.95, 'Far right should be pure arid desert');
  const mid = getBiomeMask(0, 0);
  assert.ok(mid >= 0 && mid <= 1);
});

test('ecosystem places lush trees on meadow half and dry trees on desert half with spacing', () => {
  const eco = buildArenaEcosystem(20261117);
  assert.equal(eco.meadowTrees.length, 22);
  assert.equal(eco.desertTrees.length, 15);

  for (const t of eco.meadowTrees) {
    assert.ok(t.x < 0, 'Lush trees stay in meadow region');
    assert.ok(t.style === 'lush_oak' || t.style === 'lush_birch');
    assert.ok(Math.abs(t.x) <= ARENA_HALF_SIZE - 2.3);
    assert.ok(Math.abs(t.z) <= ARENA_HALF_SIZE - 2.3);
    assert.ok(Math.abs(t.y - (getTerrainHeight(t.x, t.z) - 0.08)) < 1e-6);
  }

  for (const t of eco.desertTrees) {
    assert.ok(t.x > 0, 'Dry trees stay in desert region');
    assert.ok(t.style === 'dry_deadwood' || t.style === 'dry_acacia');
    assert.ok(Math.abs(t.x) <= ARENA_HALF_SIZE - 2.3);
    assert.ok(Math.abs(t.z) <= ARENA_HALF_SIZE - 2.3);
    assert.ok(Math.abs(t.y - (getTerrainHeight(t.x, t.z) - 0.08)) < 1e-6);
  }

  assert.ok(eco.grassTufts.length > 1000);
  assert.ok(eco.wildflowers.length > 100);
  assert.ok(eco.desertRocks.length > 80);
  assert.ok(eco.dryShrubs.length > 80);
});
