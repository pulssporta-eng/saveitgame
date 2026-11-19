export const ARENA_HALF_SIZE = 20.0;
export const ARENA_SPAN = 40.0;
export const TERRAIN_SEGMENTS = 192;

export type BiomeType = 'meadow' | 'desert';
export type TreeStyle = 'lush_oak' | 'lush_birch' | 'dry_deadwood' | 'dry_acacia';

export interface TreePlacement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  leanX: number;
  leanZ: number;
  style: TreeStyle;
  tintHex: number;
}

export interface MicroDetailInstance {
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotY: number;
  rotX: number;
  rotZ: number;
  tintHex: number;
}

export interface ArenaEcosystemData {
  meadowTrees: TreePlacement[];
  desertTrees: TreePlacement[];
  grassTufts: MicroDetailInstance[];
  wildflowers: MicroDetailInstance[];
  mossyStones: MicroDetailInstance[];
  crackedPatches: MicroDetailInstance[];
  desertRocks: MicroDetailInstance[];
  dryShrubs: MicroDetailInstance[];
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2D(ix: number, iz: number, seed = 1337): number {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function smoothstep(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function valueNoise2D(x: number, z: number, seed = 1337): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(x - ix);
  const fz = smoothstep(z - iz);

  const v00 = hash2D(ix, iz, seed);
  const v10 = hash2D(ix + 1, iz, seed);
  const v01 = hash2D(ix, iz + 1, seed);
  const v11 = hash2D(ix + 1, iz + 1, seed);

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fz);
}

export function fbm2D(x: number, z: number, octaves = 4, seed = 1337): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, z * frequency, seed + i * 97);
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }

  return value / norm;
}

/**
 * Smooth perimeter falloff so the continuous terrain meets the weathered stone curb cleanly.
 */
export function getPerimeterDampFactor(
  x: number,
  z: number,
  arenaHalfSize = ARENA_HALF_SIZE,
): number {
  const edgeDist = Math.min(arenaHalfSize - Math.abs(x), arenaHalfSize - Math.abs(z));
  return smoothstep(edgeDist / 2.8);
}

/**
 * Organic meandering biome mask at world (x, z):
 * 0.0 = pure Lush Meadow (left half), 1.0 = pure Arid Sahara Desert (right half).
 */
export function getBiomeMask(x: number, z: number): number {
  const curveNoise = (fbm2D(x * 0.09 + 3.1, z * 0.09 - 7.4, 3, 2117) - 0.5) * 5.2;
  const microNoise = (fbm2D(x * 0.28, z * 0.28, 2, 5407) - 0.5) * 1.4;
  const shiftedX = x + curveNoise + microNoise;
  return smoothstep((shiftedX + 1.6) / 3.2);
}

/**
 * Continuous surface heightfield y(x, z) across the arena.
 * Blends rolling organic meadow knolls into wind-sculpted Sahara sand dunes.
 */
export function getTerrainHeight(
  x: number,
  z: number,
  arenaHalfSize = ARENA_HALF_SIZE,
): number {
  const damp = getPerimeterDampFactor(x, z, arenaHalfSize);
  const desertMask = getBiomeMask(x, z);

  // Meadow elevation: soft rolling grass hills & mossy hollows
  const meadowBroad = fbm2D(x * 0.075 + 10.4, z * 0.075 - 3.2, 4, 4101);
  const meadowDetail = fbm2D(x * 0.24 + 2.1, z * 0.24 + 7.7, 3, 9012);
  const meadowH = (meadowBroad - 0.36) * 1.45 + (meadowDetail - 0.5) * 0.26;

  // Desert elevation: sweeping asymmetric wind-carved Sahara sand dunes
  const duneWarp = (fbm2D(x * 0.055 - 4.5, z * 0.055 + 11.3, 3, 7319) - 0.5) * 3.4;
  const phase = x * 0.23 + z * 0.14 + duneWarp;
  const rawWave = Math.sin(phase);
  // Crisp asymmetric dune ridge profile (gentle windward slope, steeper leeward slip-face)
  const ridge = 1.0 - Math.abs(Math.sin(phase * 0.5 + 0.35 * Math.cos(phase)));
  const duneBase = Math.pow(ridge, 1.35) * 1.15 + ((rawWave + 1) * 0.5) * 0.25;
  const secondaryDune = fbm2D(x * 0.11 + 21.0, z * 0.11 - 8.0, 3, 5511);
  const desertH = duneBase + (secondaryDune - 0.48) * 0.42 - 0.12;

  const blended = lerp(meadowH, desertH, desertMask);
  const result = Math.max(-0.15, blended * damp);
  return result === 0 ? 0 : result;
}

export function buildArenaEcosystem(
  seed = 20261117,
  arenaHalfSize = ARENA_HALF_SIZE,
  spawnAvoidPoints?: ReadonlyArray<{ x: number; z: number }>,
): ArenaEcosystemData {
  const rng = mulberry32(seed);
  const areaScale = (arenaHalfSize / ARENA_HALF_SIZE) ** 2;
  const meadowTrees: TreePlacement[] = [];
  const desertTrees: TreePlacement[] = [];
  const grassTufts: MicroDetailInstance[] = [];
  const wildflowers: MicroDetailInstance[] = [];
  const mossyStones: MicroDetailInstance[] = [];
  const crackedPatches: MicroDetailInstance[] = [];
  const desertRocks: MicroDetailInstance[] = [];
  const dryShrubs: MicroDetailInstance[] = [];

  const allTrees: Array<{ x: number; z: number; minDist: number }> = [];

  const canPlaceTree = (x: number, z: number, minDist: number): boolean => {
    if (Math.abs(x) > arenaHalfSize - 2.4 || Math.abs(z) > arenaHalfSize - 2.4) return false;
    // Keep spawn clearings and immediate follow-camera sightlines unobstructed
    if (Math.hypot(x - (-7.5), z - 1.0) < 2.6 || Math.hypot(x - (-5.2), z - 4.4) < 2.7) return false;
    if (Math.hypot(x - 7.5, z - (-1.0)) < 2.6 || Math.hypot(x - 9.8, z - 2.4) < 2.7) return false;
    if (spawnAvoidPoints) {
      for (let i = 0; i < spawnAvoidPoints.length; i++) {
        if (Math.hypot(x - spawnAvoidPoints[i].x, z - spawnAvoidPoints[i].z) < 2.8) return false;
      }
    }
    for (const t of allTrees) {
      const dx = t.x - x;
      const dz = t.z - z;
      if (dx * dx + dz * dz < Math.max(minDist, t.minDist) ** 2) return false;
    }
    return true;
  };

  // 1. Place lush green trees on Meadow side (biomeMask < 0.28)
  const lushTints = [0x4c8c38, 0x3d7b2e, 0x5d9d40, 0x458534];
  const targetMeadowTrees = Math.round(22 * areaScale);
  const maxTreeAttempts = Math.round(500 * Math.max(1, areaScale));
  const innerSpan = arenaHalfSize - 2.2;
  let attempts = 0;
  while (meadowTrees.length < targetMeadowTrees && attempts < maxTreeAttempts) {
    attempts++;
    const x = -innerSpan + rng() * (innerSpan - 1.8);
    const z = -innerSpan + rng() * (innerSpan * 2);
    const mask = getBiomeMask(x, z);
    if (mask > 0.24) continue;
    const minDist = 3.1 + rng() * 1.4;
    if (!canPlaceTree(x, z, minDist)) continue;

    const y = getTerrainHeight(x, z, arenaHalfSize);
    const style: TreeStyle = rng() < 0.65 ? 'lush_oak' : 'lush_birch';
    meadowTrees.push({
      x,
      y: y - 0.08, // sink root collar slightly into organic ground
      z,
      rotY: rng() * Math.PI * 2,
      scale: 0.78 + rng() * 0.56,
      leanX: (rng() - 0.5) * 0.08,
      leanZ: (rng() - 0.5) * 0.08,
      style,
      tintHex: lushTints[Math.floor(rng() * lushTints.length)],
    });
    allTrees.push({ x, z, minDist });
  }

  // 2. Place dry, gnarled desert trees on Sahara side (biomeMask > 0.72)
  const dryTints = [0xb9a88e, 0xa8967d, 0xc4b59b, 0x9b8c76];
  const targetDesertTrees = Math.round(15 * areaScale);
  attempts = 0;
  while (desertTrees.length < targetDesertTrees && attempts < maxTreeAttempts) {
    attempts++;
    const x = 1.8 + rng() * (innerSpan - 1.8);
    const z = -innerSpan + rng() * (innerSpan * 2);
    const mask = getBiomeMask(x, z);
    if (mask < 0.76) continue;
    const minDist = 3.6 + rng() * 1.8;
    if (!canPlaceTree(x, z, minDist)) continue;

    const y = getTerrainHeight(x, z, arenaHalfSize);
    const style: TreeStyle = rng() < 0.58 ? 'dry_deadwood' : 'dry_acacia';
    desertTrees.push({
      x,
      y: y - 0.08,
      z,
      rotY: rng() * Math.PI * 2,
      scale: 0.72 + rng() * 0.52,
      leanX: (rng() - 0.5) * 0.14,
      leanZ: (rng() - 0.5) * 0.14,
      style,
      tintHex: dryTints[Math.floor(rng() * dryTints.length)],
    });
    allTrees.push({ x, z, minDist });
  }

  // 3. Scatter micro-details across continuous terrain
  const flowerPalette = [0xfbe67b, 0xfcfaf2, 0xe0ccf8, 0xf7a488];
  const grassPalette = [0x6e9e44, 0x568736, 0x82b053, 0x4b752f];
  const stonePalette = [0xc4cebd, 0xb4bfaa, 0xd4dcd0, 0xa7b39f];
  const desertRockPalette = [0xe4be90, 0xd6ae7f, 0xedcda2, 0xc79e72];
  const shrubPalette = [0x9c8b63, 0x8b7b53, 0xab9a71, 0x7f754d];

  const isNearTree = (x: number, z: number, radius: number) => {
    for (const t of allTrees) {
      const dx = t.x - x;
      const dz = t.z - z;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  };

  const marginSpan = arenaHalfSize - 0.8;
  // Grass tufts across meadow & border fade
  const grassAttempts = Math.round(2400 * areaScale);
  for (let i = 0; i < grassAttempts; i++) {
    const x = -marginSpan + rng() * (marginSpan + 2.3);
    const z = -marginSpan + rng() * (marginSpan * 2);
    const mask = getBiomeMask(x, z);
    if (rng() < mask * 1.1) continue;
    const y = getTerrainHeight(x, z, arenaHalfSize);
    const s = (0.85 + rng() * 0.45) * (1 - mask * 0.35);
    grassTufts.push({
      x,
      y: y - 0.015,
      z,
      scaleX: s,
      scaleY: s * (0.9 + rng() * 0.45),
      scaleZ: s,
      rotY: rng() * Math.PI * 2,
      rotX: (rng() - 0.5) * 0.14,
      rotZ: (rng() - 0.5) * 0.14,
      tintHex: grassPalette[Math.floor(rng() * grassPalette.length)],
    });
  }

  // Wildflowers in meadow patches
  const flowerAttempts = Math.round(480 * areaScale);
  for (let i = 0; i < flowerAttempts; i++) {
    const x = -(arenaHalfSize - 1.0) + rng() * (arenaHalfSize);
    const z = -(arenaHalfSize - 1.0) + rng() * ((arenaHalfSize - 1.0) * 2);
    const mask = getBiomeMask(x, z);
    if (mask > 0.35) continue;
    const patch = fbm2D(x * 0.25 + 5, z * 0.25 - 4, 2, 3303);
    if (patch < 0.46) continue;
    const y = getTerrainHeight(x, z, arenaHalfSize);
    const s = 0.85 + rng() * 0.35;
    wildflowers.push({
      x,
      y: y - 0.01,
      z,
      scaleX: s,
      scaleY: s * (0.9 + rng() * 0.3),
      scaleZ: s,
      rotY: rng() * Math.PI * 2,
      rotX: (rng() - 0.5) * 0.1,
      rotZ: (rng() - 0.5) * 0.1,
      tintHex: flowerPalette[Math.floor(rng() * flowerPalette.length)],
    });
  }

  // Mossy stones on meadow
  const stoneAttempts = Math.round(160 * areaScale);
  for (let i = 0; i < stoneAttempts; i++) {
    const x = -(arenaHalfSize - 1.2) + rng() * (arenaHalfSize - 0.5);
    const z = -(arenaHalfSize - 1.2) + rng() * ((arenaHalfSize - 1.2) * 2);
    if (getBiomeMask(x, z) > 0.42 || isNearTree(x, z, 0.75)) continue;
    const y = getTerrainHeight(x, z, arenaHalfSize);
    const s = 0.85 + rng() * 0.75;
    mossyStones.push({
      x,
      y: y - 0.03,
      z,
      scaleX: s * (0.9 + rng() * 0.35),
      scaleY: s * (0.6 + rng() * 0.3),
      scaleZ: s * (0.9 + rng() * 0.35),
      rotY: rng() * Math.PI * 2,
      rotX: (rng() - 0.5) * 0.2,
      rotZ: (rng() - 0.5) * 0.2,
      tintHex: stonePalette[Math.floor(rng() * stonePalette.length)],
    });
  }

  // Cracked dry earth patches in desert troughs
  const crackedAttempts = Math.round(240 * areaScale);
  for (let i = 0; i < crackedAttempts; i++) {
    const x = -1.0 + rng() * arenaHalfSize;
    const z = -(arenaHalfSize - 1.2) + rng() * ((arenaHalfSize - 1.2) * 2);
    const mask = getBiomeMask(x, z);
    if (mask < 0.55 || isNearTree(x, z, 0.8)) continue;
    const y = getTerrainHeight(x, z, arenaHalfSize);
    if (y > 0.32) continue;
    const s = 0.9 + rng() * 0.65;
    crackedPatches.push({
      x,
      y: y + 0.02,
      z,
      scaleX: s,
      scaleY: 1,
      scaleZ: s * (0.85 + rng() * 0.3),
      rotY: rng() * Math.PI * 2,
      rotX: 0,
      rotZ: 0,
      tintHex: 0xead8ba,
    });
  }

  // Desert sandstone rocks
  const desertRockAttempts = Math.round(180 * areaScale);
  for (let i = 0; i < desertRockAttempts; i++) {
    const x = -0.5 + rng() * (arenaHalfSize - 0.7);
    const z = -(arenaHalfSize - 1.2) + rng() * ((arenaHalfSize - 1.2) * 2);
    if (getBiomeMask(x, z) < 0.48 || isNearTree(x, z, 0.75)) continue;
    const y = getTerrainHeight(x, z, arenaHalfSize);
    const s = 0.85 + rng() * 0.8;
    desertRocks.push({
      x,
      y: y - 0.03,
      z,
      scaleX: s * (0.9 + rng() * 0.4),
      scaleY: s * (0.55 + rng() * 0.3),
      scaleZ: s * (0.9 + rng() * 0.4),
      rotY: rng() * Math.PI * 2,
      rotX: (rng() - 0.5) * 0.22,
      rotZ: (rng() - 0.5) * 0.22,
      tintHex: desertRockPalette[Math.floor(rng() * desertRockPalette.length)],
    });
  }

  // Dry desert scrub shrubs
  const shrubAttempts = Math.round(210 * areaScale);
  for (let i = 0; i < shrubAttempts; i++) {
    const x = 0.2 + rng() * (arenaHalfSize - 1.4);
    const z = -(arenaHalfSize - 1.2) + rng() * ((arenaHalfSize - 1.2) * 2);
    if (getBiomeMask(x, z) < 0.55 || isNearTree(x, z, 0.65)) continue;
    const y = getTerrainHeight(x, z, arenaHalfSize);
    const s = 0.85 + rng() * 0.5;
    dryShrubs.push({
      x,
      y: y - 0.015,
      z,
      scaleX: s,
      scaleY: s * (0.85 + rng() * 0.4),
      scaleZ: s,
      rotY: rng() * Math.PI * 2,
      rotX: (rng() - 0.5) * 0.14,
      rotZ: (rng() - 0.5) * 0.14,
      tintHex: shrubPalette[Math.floor(rng() * shrubPalette.length)],
    });
  }

  return {
    meadowTrees,
    desertTrees,
    grassTufts,
    wildflowers,
    mossyStones,
    crackedPatches,
    desertRocks,
    dryShrubs,
  };
}
