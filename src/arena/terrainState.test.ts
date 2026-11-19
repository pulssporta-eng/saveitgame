import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainSimulation } from './terrainState';

test('water brush converts Sahara desert to lush meadow and raises elevation', () => {
  const sim = new TerrainSimulation();
  const x = 10;
  const z = 0;
  const beforeH = sim.sampleHeight(x, z);
  const beforeBiome = sim.sampleBiome(x, z);
  assert.ok(beforeBiome > 0.9, `expected pure desert (>0.9), got ${beforeBiome}`);

  const res = sim.applyWaterBrush(x, z, 1.5, 1.0);
  assert.equal(res.changed, true);
  assert.ok(res.convertedToMeadow > 0);

  for (let i = 0; i < 40; i++) {
    sim.step(0.05);
  }

  const afterH = sim.sampleHeight(x, z);
  const afterBiome = sim.sampleBiome(x, z);
  assert.ok(afterBiome < 0.25, `expected converted meadow (<0.25), got ${afterBiome}`);
  assert.ok(afterH > beforeH + 0.1, `expected water to raise height (${beforeH} -> ${afterH})`);
});

test('fire brush ignites scorch glow, lowers elevation, and converts meadow to desert', () => {
  const sim = new TerrainSimulation();
  const x = -10;
  const z = 0;
  const beforeH = sim.sampleHeight(x, z);
  const beforeBiome = sim.sampleBiome(x, z);
  assert.ok(beforeBiome < 0.1, `expected pure meadow (<0.1), got ${beforeBiome}`);

  const res = sim.applyFireBrush(x, z, 1.5, 1.0);
  assert.equal(res.changed, true);
  assert.ok(res.convertedToDesert > 0);

  // Immediately after fire hit, scorch glow is active
  sim.step(0.02);
  let maxScorch = 0;
  for (let i = 0; i < sim.scorches.length; i++) {
    if (sim.scorches[i] > maxScorch) maxScorch = sim.scorches[i];
  }
  assert.ok(maxScorch > 0.3, `expected active scorch glow (>0.3), got ${maxScorch}`);

  // After stepping ~2.2 seconds, scorch decays and meadow converts to desert
  for (let i = 0; i < 45; i++) {
    sim.step(0.05);
  }

  const afterH = sim.sampleHeight(x, z);
  const afterBiome = sim.sampleBiome(x, z);
  assert.ok(afterBiome > 0.75, `expected converted desert (>0.75), got ${afterBiome}`);
  assert.ok(afterH < beforeH - 0.08, `expected fire to lower height (${beforeH} -> ${afterH})`);
});

test('perimeter edges stay pinned at y=0 even under elemental brushes', () => {
  const sim = new TerrainSimulation();
  const initialCornerH = sim.sampleHeight(20, 20);
  sim.applyWaterBrush(19.9, 19.9, 1.8, 1.0);
  sim.applyFireBrush(-19.9, -19.9, 1.8, 1.0);
  for (let i = 0; i < 30; i++) {
    sim.step(0.05);
  }
  assert.ok(Math.abs(sim.sampleHeight(20, 20) - initialCornerH) < 1e-4);
  assert.ok(Math.abs(sim.sampleHeight(-20, -20)) < 1e-3);
});
