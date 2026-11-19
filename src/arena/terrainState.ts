import {
  ARENA_HALF_SIZE,
  ARENA_SPAN,
  getBiomeMask,
  getTerrainHeight,
  TERRAIN_SEGMENTS,
} from './terrainMath';

export const TERRAIN_EXTENT = ARENA_SPAN + 0.18;
export const GRID_RES = TERRAIN_SEGMENTS + 1;
export const VERTEX_COUNT = GRID_RES * GRID_RES;

export interface BrushResult {
  changed: boolean;
  convertedToMeadow: number;
  convertedToDesert: number;
}

export interface TerrainStepResult {
  hasDirty: boolean;
  minIx: number;
  maxIx: number;
  minIz: number;
  maxIz: number;
}

export class TerrainSimulation {
  readonly arenaSpan: number;
  readonly arenaHalfSize: number;
  readonly terrainSegments: number;
  readonly gridRes: number;
  readonly vertexCount: number;
  readonly terrainExtent: number;

  readonly baseHeights: Float32Array;
  readonly heights: Float32Array;
  readonly targetHeights: Float32Array;
  readonly biomeMasks: Float32Array;
  readonly targetBiomes: Float32Array;
  readonly scorches: Float32Array;

  private readonly activeIndices = new Set<number>();
  private readonly halfExtent: number;
  private readonly cellSize: number;
  private cachedMeadowRatio = 0.5;
  private ratioCounter = 0;

  constructor(arenaSpan = ARENA_SPAN, terrainSegments = TERRAIN_SEGMENTS) {
    this.arenaSpan = arenaSpan;
    this.arenaHalfSize = arenaSpan * 0.5;
    this.terrainSegments = terrainSegments;
    this.gridRes = terrainSegments + 1;
    this.vertexCount = this.gridRes * this.gridRes;
    this.terrainExtent = arenaSpan + 0.18;
    this.halfExtent = this.terrainExtent * 0.5;
    this.cellSize = this.terrainExtent / terrainSegments;

    this.baseHeights = new Float32Array(this.vertexCount);
    this.heights = new Float32Array(this.vertexCount);
    this.targetHeights = new Float32Array(this.vertexCount);
    this.biomeMasks = new Float32Array(this.vertexCount);
    this.targetBiomes = new Float32Array(this.vertexCount);
    this.scorches = new Float32Array(this.vertexCount);

    let meadowCount = 0;
    for (let iz = 0; iz < this.gridRes; iz++) {
      const rawZ = -this.halfExtent + iz * this.cellSize;
      const cz = Math.max(-this.arenaHalfSize, Math.min(this.arenaHalfSize, rawZ));
      for (let ix = 0; ix < this.gridRes; ix++) {
        const rawX = -this.halfExtent + ix * this.cellSize;
        const cx = Math.max(-this.arenaHalfSize, Math.min(this.arenaHalfSize, rawX));
        const idx = iz * this.gridRes + ix;

        const h = getTerrainHeight(cx, cz, this.arenaHalfSize);
        const mask = getBiomeMask(cx, cz);
        this.baseHeights[idx] = h;
        this.heights[idx] = h;
        this.targetHeights[idx] = h;
        this.biomeMasks[idx] = mask;
        this.targetBiomes[idx] = mask;
        this.scorches[idx] = 0;
        if (mask < 0.5) meadowCount++;
      }
    }
    this.cachedMeadowRatio = meadowCount / this.vertexCount;
  }

  worldXAt(ix: number): number {
    return -this.halfExtent + ix * this.cellSize;
  }

  worldZAt(iz: number): number {
    return -this.halfExtent + iz * this.cellSize;
  }

  sampleHeight(x: number, z: number): number {
    const fx = Math.max(0, Math.min(this.terrainSegments, (x + this.halfExtent) / this.cellSize));
    const fz = Math.max(0, Math.min(this.terrainSegments, (z + this.halfExtent) / this.cellSize));
    const ix0 = Math.min(this.terrainSegments - 1, Math.floor(fx));
    const iz0 = Math.min(this.terrainSegments - 1, Math.floor(fz));
    const tx = fx - ix0;
    const tz = fz - iz0;

    const i00 = iz0 * this.gridRes + ix0;
    const i10 = i00 + 1;
    const i01 = i00 + this.gridRes;
    const i11 = i01 + 1;

    const h0 = this.heights[i00] + (this.heights[i10] - this.heights[i00]) * tx;
    const h1 = this.heights[i01] + (this.heights[i11] - this.heights[i01]) * tx;
    return h0 + (h1 - h0) * tz;
  }

  sampleBiome(x: number, z: number): number {
    const fx = Math.max(0, Math.min(this.terrainSegments, (x + this.halfExtent) / this.cellSize));
    const fz = Math.max(0, Math.min(this.terrainSegments, (z + this.halfExtent) / this.cellSize));
    const ix0 = Math.min(this.terrainSegments - 1, Math.floor(fx));
    const iz0 = Math.min(this.terrainSegments - 1, Math.floor(fz));
    const tx = fx - ix0;
    const tz = fz - iz0;

    const i00 = iz0 * this.gridRes + ix0;
    const i10 = i00 + 1;
    const i01 = i00 + this.gridRes;
    const i11 = i01 + 1;

    const b0 = this.biomeMasks[i00] + (this.biomeMasks[i10] - this.biomeMasks[i00]) * tx;
    const b1 = this.biomeMasks[i01] + (this.biomeMasks[i11] - this.biomeMasks[i01]) * tx;
    return b0 + (b1 - b0) * tz;
  }

  sampleTargetBiome(x: number, z: number): number {
    const fx = Math.max(0, Math.min(this.terrainSegments, (x + this.halfExtent) / this.cellSize));
    const fz = Math.max(0, Math.min(this.terrainSegments, (z + this.halfExtent) / this.cellSize));
    const ix0 = Math.min(this.terrainSegments - 1, Math.floor(fx));
    const iz0 = Math.min(this.terrainSegments - 1, Math.floor(fz));
    const tx = fx - ix0;
    const tz = fz - iz0;

    const i00 = iz0 * this.gridRes + ix0;
    const i10 = i00 + 1;
    const i01 = i00 + this.gridRes;
    const i11 = i01 + 1;

    const b0 = this.targetBiomes[i00] + (this.targetBiomes[i10] - this.targetBiomes[i00]) * tx;
    const b1 = this.targetBiomes[i01] + (this.targetBiomes[i11] - this.targetBiomes[i01]) * tx;
    return b0 + (b1 - b0) * tz;
  }

  private isPerimeterPinned(ix: number, iz: number): boolean {
    return ix <= 2 || ix >= this.terrainSegments - 2 || iz <= 2 || iz >= this.terrainSegments - 2;
  }

  applyWaterBrush(wx: number, wz: number, radius: number, strength = 1.0): BrushResult {
    const minIx = Math.max(1, Math.floor((wx - radius + this.halfExtent) / this.cellSize));
    const maxIx = Math.min(
      this.terrainSegments - 1,
      Math.ceil((wx + radius + this.halfExtent) / this.cellSize),
    );
    const minIz = Math.max(1, Math.floor((wz - radius + this.halfExtent) / this.cellSize));
    const maxIz = Math.min(
      this.terrainSegments - 1,
      Math.ceil((wz + radius + this.halfExtent) / this.cellSize),
    );

    let changed = false;
    let convertedToMeadow = 0;
    const rSq = radius * radius;

    for (let iz = minIz; iz <= maxIz; iz++) {
      const vz = this.worldZAt(iz);
      const dz = vz - wz;
      for (let ix = minIx; ix <= maxIx; ix++) {
        const vx = this.worldXAt(ix);
        const dx = vx - wx;
        const distSq = dx * dx + dz * dz;
        if (distSq > rSq) continue;

        const dist = Math.sqrt(distSq);
        const falloff = Math.pow(1 - dist / radius, 1.35) * strength;
        const idx = iz * this.gridRes + ix;

        const prevTargetBiome = this.targetBiomes[idx];
        const nextBiome = Math.max(0, prevTargetBiome - falloff * 0.95);
        if (prevTargetBiome >= 0.5 && nextBiome < 0.5) {
          convertedToMeadow++;
        }
        this.targetBiomes[idx] = nextBiome;
        this.scorches[idx] = Math.max(0, this.scorches[idx] - falloff * 1.5);

        if (!this.isPerimeterPinned(ix, iz)) {
          // Water raises desert sand smoothly into lush raised meadow turf
          const edgeDist = Math.min(this.arenaHalfSize - Math.abs(vx), this.arenaHalfSize - Math.abs(vz));
          const borderFactor = Math.max(0, Math.min(1, edgeDist / 2.6));
          const lushLift = (0.34 + (1 - this.biomeMasks[idx]) * 0.04) * borderFactor;
          const desiredH = Math.min(1.68, this.baseHeights[idx] + lushLift);
          if (desiredH > this.targetHeights[idx]) {
            this.targetHeights[idx] =
              this.targetHeights[idx] + (desiredH - this.targetHeights[idx]) * Math.min(1, falloff);
          }
        }

        this.activeIndices.add(idx);
        changed = true;
      }
    }

    return { changed, convertedToMeadow, convertedToDesert: 0 };
  }

  applyFireBrush(wx: number, wz: number, radius: number, strength = 1.0): BrushResult {
    const minIx = Math.max(1, Math.floor((wx - radius + this.halfExtent) / this.cellSize));
    const maxIx = Math.min(
      this.terrainSegments - 1,
      Math.ceil((wx + radius + this.halfExtent) / this.cellSize),
    );
    const minIz = Math.max(1, Math.floor((wz - radius + this.halfExtent) / this.cellSize));
    const maxIz = Math.min(
      this.terrainSegments - 1,
      Math.ceil((wz + radius + this.halfExtent) / this.cellSize),
    );

    let changed = false;
    let convertedToDesert = 0;
    const rSq = radius * radius;

    for (let iz = minIz; iz <= maxIz; iz++) {
      const vz = this.worldZAt(iz);
      const dz = vz - wz;
      for (let ix = minIx; ix <= maxIx; ix++) {
        const vx = this.worldXAt(ix);
        const dx = vx - wx;
        const distSq = dx * dx + dz * dz;
        if (distSq > rSq) continue;

        const dist = Math.sqrt(distSq);
        const falloff = Math.pow(1 - dist / radius, 1.3) * strength;
        const idx = iz * this.gridRes + ix;

        const prevTargetBiome = this.targetBiomes[idx];
        const nextBiome = Math.min(1, prevTargetBiome + falloff * 0.95);
        if (prevTargetBiome < 0.5 && nextBiome >= 0.5) {
          convertedToDesert++;
        }
        this.targetBiomes[idx] = nextBiome;

        // Briefly ignite grass with scorching orange-black ember glow
        if (this.biomeMasks[idx] < 0.85 || prevTargetBiome < 0.85) {
          this.scorches[idx] = Math.min(1, Math.max(this.scorches[idx], falloff * 1.15));
        }

        if (!this.isPerimeterPinned(ix, iz)) {
          // Fire lowers turf slightly as vegetation burns away into dry sand
          const edgeDist = Math.min(this.arenaHalfSize - Math.abs(vx), this.arenaHalfSize - Math.abs(vz));
          const borderFactor = Math.max(0, Math.min(1, edgeDist / 2.6));
          const desiredH = Math.max(-0.3, this.baseHeights[idx] - 0.24 * borderFactor);
          if (desiredH < this.targetHeights[idx]) {
            this.targetHeights[idx] =
              this.targetHeights[idx] + (desiredH - this.targetHeights[idx]) * Math.min(1, falloff);
          }
        }

        this.activeIndices.add(idx);
        changed = true;
      }
    }

    return { changed, convertedToMeadow: 0, convertedToDesert };
  }

  applyWaterExplosion(wx: number, wz: number, radius: number): BrushResult {
    return this.applyWaterBrush(wx, wz, radius, 1.85);
  }

  applyFireExplosion(wx: number, wz: number, radius: number): BrushResult {
    return this.applyFireBrush(wx, wz, radius, 1.85);
  }

  /**
   * Probes candidate locations across the arena to find either the nearest worthwhile
   * enemy territory patch (for stream expansion) or the densest enemy cluster (for grenades).
   */
  findEnemyTerritoryTarget(
    role: 'hero' | 'villain',
    fromX: number,
    fromZ: number,
    preferDenseCluster: boolean,
    rng: () => number = Math.random,
  ): { x: number; z: number; enemyDensity: number } {
    const bound = this.arenaHalfSize - 2.2;
    const samples = preferDenseCluster ? 28 : 22;
    let bestX = role === 'hero' ? bound * 0.45 : -bound * 0.45;
    let bestZ = 0;
    let bestScore = -Infinity;
    let bestDensity = 0;

    for (let i = 0; i < samples; i++) {
      const cx = -bound + rng() * (bound * 2);
      const cz = -bound + rng() * (bound * 2);

      // Measure 5-point neighborhood enemy control ratio (0..1)
      const r = preferDenseCluster ? 3.4 : 1.5;
      const pts = [
        this.sampleTargetBiome(cx, cz),
        this.sampleTargetBiome(cx + r, cz),
        this.sampleTargetBiome(cx - r, cz),
        this.sampleTargetBiome(cx, cz + r),
        this.sampleTargetBiome(cx, cz - r),
      ];
      let enemySum = 0;
      for (let p = 0; p < pts.length; p++) {
        // Hero wants to convert desert (biome -> 1.0); Villain wants to convert meadow (biome -> 0.0)
        enemySum += role === 'hero' ? pts[p] : 1 - pts[p];
      }
      const enemyDensity = enemySum / pts.length;
      const dist = Math.hypot(cx - fromX, cz - fromZ);

      let score: number;
      if (preferDenseCluster) {
        // Grenades prefer high enemy density within comfortable throw range (4m..17m)
        const rangePenalty = dist < 3.5 ? (3.5 - dist) * 0.14 : dist > 17 ? (dist - 17) * 0.08 : 0;
        score = enemyDensity * 1.4 - rangePenalty;
      } else {
        // Stream expansion balances high enemy density with proximity so bots sweep smoothly
        score = enemyDensity * 1.35 - dist * 0.032;
      }

      if (score > bestScore) {
        bestScore = score;
        bestX = cx;
        bestZ = cz;
        bestDensity = enemyDensity;
      }
    }

    return { x: bestX, z: bestZ, enemyDensity: bestDensity };
  }

  step(dt: number): TerrainStepResult {
    if (this.activeIndices.size === 0) {
      return { hasDirty: false, minIx: 0, maxIx: 0, minIz: 0, maxIz: 0 };
    }

    const hBlend = 1 - Math.exp(-6.2 * dt);
    const bBlend = 1 - Math.exp(-5.0 * dt);
    const scorchDecay = 0.82 * dt;

    let minIx = this.gridRes;
    let maxIx = -1;
    let minIz = this.gridRes;
    let maxIz = -1;

    for (const idx of this.activeIndices) {
      const dh = this.targetHeights[idx] - this.heights[idx];
      const db = this.targetBiomes[idx] - this.biomeMasks[idx];
      const ds = this.scorches[idx];

      let stillActive = false;

      if (Math.abs(dh) > 0.0015) {
        this.heights[idx] += dh * hBlend;
        stillActive = true;
      } else {
        this.heights[idx] = this.targetHeights[idx];
      }

      if (Math.abs(db) > 0.002) {
        this.biomeMasks[idx] += db * bBlend;
        stillActive = true;
      } else {
        this.biomeMasks[idx] = this.targetBiomes[idx];
      }

      if (ds > 0.004) {
        this.scorches[idx] = Math.max(0, ds - scorchDecay);
        stillActive = true;
      } else {
        this.scorches[idx] = 0;
      }

      const ix = idx % this.gridRes;
      const iz = Math.floor(idx / this.gridRes);
      if (ix < minIx) minIx = ix;
      if (ix > maxIx) maxIx = ix;
      if (iz < minIz) minIz = iz;
      if (iz > maxIz) maxIz = iz;

      if (!stillActive) {
        this.activeIndices.delete(idx);
      }
    }

    this.ratioCounter++;
    if (this.ratioCounter >= 8 || this.activeIndices.size === 0) {
      this.ratioCounter = 0;
      let meadowCount = 0;
      for (let i = 0; i < this.vertexCount; i += 4) {
        if (this.biomeMasks[i] < 0.5) meadowCount++;
      }
      this.cachedMeadowRatio = meadowCount / Math.ceil(this.vertexCount / 4);
    }

    return {
      hasDirty: maxIx >= minIx && maxIz >= minIz,
      minIx,
      maxIx,
      minIz,
      maxIz,
    };
  }

  getMeadowRatio(): number {
    return this.cachedMeadowRatio;
  }
}
