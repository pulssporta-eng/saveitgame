import * as THREE from 'three';
import { ARENA_HALF_SIZE, MicroDetailInstance, TreePlacement } from './terrainMath';
import { TerrainSimulation } from './terrainState';

export const MAX_GRASS_INSTANCES = 4800;
export const MAX_FLOWER_INSTANCES = 960;

const CELL_DIM = 40;
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

const GRASS_PALETTE = [0x6e9e44, 0x568736, 0x82b053, 0x4b752f];
const FLOWER_PALETTE = [0xfbe67b, 0xfcfaf2, 0xe0ccf8, 0xf7a488];

interface VegetationSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  baseSX: number;
  baseSY: number;
  baseSZ: number;
  curScale: number;
  targetScale: number;
  cellIdx: number;
}

export class DynamicVegetationManager {
  private readonly grassMesh: THREE.InstancedMesh;
  private readonly stemMesh: THREE.InstancedMesh;
  private readonly blossomMesh: THREE.InstancedMesh;

  private readonly arenaHalfSize: number;
  private readonly cellDim: number;
  private readonly maxGrass: number;
  private readonly maxFlowers: number;

  private readonly grassSlots: VegetationSlot[] = [];
  private readonly flowerSlots: VegetationSlot[] = [];

  private readonly grassCells: number[][];
  private readonly flowerCells: number[][];

  private readonly animatingGrass = new Set<number>();
  private readonly animatingFlowers = new Set<number>();
  private readonly treeObstacles: Array<{ x: number; z: number }>;

  private nextFreeGrass = 0;
  private nextFreeFlower = 0;
  private randState = 48151623;

  constructor(
    grassMesh: THREE.InstancedMesh,
    stemMesh: THREE.InstancedMesh,
    blossomMesh: THREE.InstancedMesh,
    initialGrass: MicroDetailInstance[],
    initialFlowers: MicroDetailInstance[],
    trees: TreePlacement[],
    arenaHalfSize = ARENA_HALF_SIZE,
    maxGrass = MAX_GRASS_INSTANCES,
    maxFlowers = MAX_FLOWER_INSTANCES,
  ) {
    this.grassMesh = grassMesh;
    this.stemMesh = stemMesh;
    this.blossomMesh = blossomMesh;
    this.arenaHalfSize = arenaHalfSize;
    this.cellDim = Math.max(20, Math.ceil(arenaHalfSize * 2));
    this.maxGrass = maxGrass;
    this.maxFlowers = maxFlowers;
    this.grassCells = Array.from({ length: this.cellDim * this.cellDim }, () => []);
    this.flowerCells = Array.from({ length: this.cellDim * this.cellDim }, () => []);
    this.treeObstacles = trees.map((t) => ({ x: t.x, z: t.z }));

    for (let i = 0; i < this.maxGrass; i++) {
      if (i < initialGrass.length) {
        const g = initialGrass[i];
        const cellIdx = this.toCellIndex(g.x, g.z);
        this.grassSlots.push({
          active: true,
          x: g.x,
          y: g.y,
          z: g.z,
          rotX: g.rotX,
          rotY: g.rotY,
          rotZ: g.rotZ,
          baseSX: g.scaleX,
          baseSY: g.scaleY,
          baseSZ: g.scaleZ,
          curScale: 1,
          targetScale: 1,
          cellIdx,
        });
        this.grassCells[cellIdx].push(i);
        this.applyGrassMatrix(i, this.grassSlots[i]);
        _color.setHex(g.tintHex);
        this.grassMesh.setColorAt(i, _color);
        this.nextFreeGrass = i + 1;
      } else {
        this.grassSlots.push({
          active: false,
          x: 0,
          y: -50,
          z: 0,
          rotX: 0,
          rotY: 0,
          rotZ: 0,
          baseSX: 1,
          baseSY: 1,
          baseSZ: 1,
          curScale: 0,
          targetScale: 0,
          cellIdx: -1,
        });
        this.hideSlot(this.grassMesh, i);
        _color.setHex(GRASS_PALETTE[i % GRASS_PALETTE.length]);
        this.grassMesh.setColorAt(i, _color);
      }
    }
    this.grassMesh.instanceMatrix.needsUpdate = true;
    if (this.grassMesh.instanceColor) this.grassMesh.instanceColor.needsUpdate = true;
    this.grassMesh.computeBoundingSphere();

    for (let i = 0; i < this.maxFlowers; i++) {
      if (i < initialFlowers.length) {
        const f = initialFlowers[i];
        const cellIdx = this.toCellIndex(f.x, f.z);
        this.flowerSlots.push({
          active: true,
          x: f.x,
          y: f.y,
          z: f.z,
          rotX: f.rotX,
          rotY: f.rotY,
          rotZ: f.rotZ,
          baseSX: f.scaleX,
          baseSY: f.scaleY,
          baseSZ: f.scaleZ,
          curScale: 1,
          targetScale: 1,
          cellIdx,
        });
        this.flowerCells[cellIdx].push(i);
        this.applyFlowerMatrix(i, this.flowerSlots[i]);
        _color.setHex(f.tintHex);
        this.blossomMesh.setColorAt(i, _color);
        this.nextFreeFlower = i + 1;
      } else {
        this.flowerSlots.push({
          active: false,
          x: 0,
          y: -50,
          z: 0,
          rotX: 0,
          rotY: 0,
          rotZ: 0,
          baseSX: 1,
          baseSY: 1,
          baseSZ: 1,
          curScale: 0,
          targetScale: 0,
          cellIdx: -1,
        });
        this.hideSlot(this.stemMesh, i);
        this.hideSlot(this.blossomMesh, i);
        _color.setHex(FLOWER_PALETTE[i % FLOWER_PALETTE.length]);
        this.blossomMesh.setColorAt(i, _color);
      }
    }
    this.stemMesh.instanceMatrix.needsUpdate = true;
    this.blossomMesh.instanceMatrix.needsUpdate = true;
    if (this.blossomMesh.instanceColor) this.blossomMesh.instanceColor.needsUpdate = true;
    this.stemMesh.computeBoundingSphere();
    this.blossomMesh.computeBoundingSphere();
  }

  private rand(): number {
    this.randState = (this.randState * 1664525 + 1013904223) >>> 0;
    return this.randState / 4294967296;
  }

  private toCellIndex(x: number, z: number): number {
    const cx = Math.max(0, Math.min(this.cellDim - 1, Math.floor(x + this.arenaHalfSize)));
    const cz = Math.max(0, Math.min(this.cellDim - 1, Math.floor(z + this.arenaHalfSize)));
    return cz * this.cellDim + cx;
  }

  private isNearTree(x: number, z: number): boolean {
    for (let i = 0; i < this.treeObstacles.length; i++) {
      const dx = this.treeObstacles[i].x - x;
      const dz = this.treeObstacles[i].z - z;
      if (dx * dx + dz * dz < 0.55) return true;
    }
    return false;
  }

  private hideSlot(mesh: THREE.InstancedMesh, index: number): void {
    _dummy.position.set(0, -50, 0);
    _dummy.scale.set(0, 0, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(index, _dummy.matrix);
  }

  private applyGrassMatrix(index: number, s: VegetationSlot): void {
    _dummy.position.set(s.x, s.y, s.z);
    _dummy.rotation.set(s.rotX, s.rotY, s.rotZ);
    _dummy.scale.set(s.baseSX * s.curScale, s.baseSY * s.curScale, s.baseSZ * s.curScale);
    _dummy.updateMatrix();
    this.grassMesh.setMatrixAt(index, _dummy.matrix);
  }

  private applyFlowerMatrix(index: number, s: VegetationSlot): void {
    _dummy.position.set(s.x, s.y, s.z);
    _dummy.rotation.set(s.rotX, s.rotY, s.rotZ);
    _dummy.scale.set(s.baseSX * s.curScale, s.baseSY * s.curScale, s.baseSZ * s.curScale);
    _dummy.updateMatrix();
    this.stemMesh.setMatrixAt(index, _dummy.matrix);
    this.blossomMesh.setMatrixAt(index, _dummy.matrix);
  }

  burnAt(wx: number, wz: number, radius: number): void {
    const minCx = Math.max(0, Math.floor(wx - radius + this.arenaHalfSize));
    const maxCx = Math.min(this.cellDim - 1, Math.floor(wx + radius + this.arenaHalfSize));
    const minCz = Math.max(0, Math.floor(wz - radius + this.arenaHalfSize));
    const maxCz = Math.min(this.cellDim - 1, Math.floor(wz + radius + this.arenaHalfSize));
    const rSq = radius * radius;

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cellIdx = cz * this.cellDim + cx;

        const gList = this.grassCells[cellIdx];
        for (let k = 0; k < gList.length; k++) {
          const idx = gList[k];
          const s = this.grassSlots[idx];
          if (s.targetScale === 0) continue;
          const dx = s.x - wx;
          const dz = s.z - wz;
          if (dx * dx + dz * dz <= rSq) {
            s.targetScale = 0;
            this.animatingGrass.add(idx);
          }
        }

        const fList = this.flowerCells[cellIdx];
        for (let k = 0; k < fList.length; k++) {
          const idx = fList[k];
          const s = this.flowerSlots[idx];
          if (s.targetScale === 0) continue;
          const dx = s.x - wx;
          const dz = s.z - wz;
          if (dx * dx + dz * dz <= rSq) {
            s.targetScale = 0;
            this.animatingFlowers.add(idx);
          }
        }
      }
    }
  }

  growAt(wx: number, wz: number, radius: number, terrain: TerrainSimulation): void {
    const minCx = Math.max(0, Math.floor(wx - radius + this.arenaHalfSize));
    const maxCx = Math.min(this.cellDim - 1, Math.floor(wx + radius + this.arenaHalfSize));
    const minCz = Math.max(0, Math.floor(wz - radius + this.arenaHalfSize));
    const maxCz = Math.min(this.cellDim - 1, Math.floor(wz + radius + this.arenaHalfSize));
    const rSq = radius * radius;

    for (let cz = minCz; cz <= maxCz; cz++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cellIdx = cz * this.cellDim + cx;

        // 1. Re-sprout previously burned tufts inside radius
        const gList = this.grassCells[cellIdx];
        let activeInCell = 0;
        for (let k = 0; k < gList.length; k++) {
          const idx = gList[k];
          const s = this.grassSlots[idx];
          const dx = s.x - wx;
          const dz = s.z - wz;
          if (dx * dx + dz * dz <= rSq && s.targetScale === 0) {
            s.active = true;
            s.y = terrain.sampleHeight(s.x, s.z) - 0.015;
            s.curScale = Math.max(0.05, s.curScale);
            s.targetScale = 1;
            this.animatingGrass.add(idx);
          }
          if (s.targetScale > 0) activeInCell++;
        }

        const fList = this.flowerCells[cellIdx];
        let activeFlowersInCell = 0;
        for (let k = 0; k < fList.length; k++) {
          const idx = fList[k];
          const s = this.flowerSlots[idx];
          const dx = s.x - wx;
          const dz = s.z - wz;
          if (dx * dx + dz * dz <= rSq && s.targetScale === 0) {
            s.active = true;
            s.y = terrain.sampleHeight(s.x, s.z) - 0.01;
            s.curScale = Math.max(0.05, s.curScale);
            s.targetScale = 1;
            this.animatingFlowers.add(idx);
          }
          if (s.targetScale > 0) activeFlowersInCell++;
        }

        // 2. Spawn new grass tufts & wildflowers on newly converted desert soil
        const cellCenterX = -this.arenaHalfSize + cx + 0.5;
        const cellCenterZ = -this.arenaHalfSize + cz + 0.5;
        const dxC = cellCenterX - wx;
        const dzC = cellCenterZ - wz;
        if (dxC * dxC + dzC * dzC > (radius + 0.7) * (radius + 0.7)) continue;
        const effectiveBiome = Math.min(
          terrain.sampleBiome(cellCenterX, cellCenterZ),
          terrain.sampleTargetBiome(cellCenterX, cellCenterZ),
        );
        if (effectiveBiome > 0.65) continue;

        while (activeInCell < 4 && this.nextFreeGrass < this.maxGrass) {
          const gx = Math.max(-this.arenaHalfSize + 0.4, Math.min(this.arenaHalfSize - 0.4, -this.arenaHalfSize + cx + this.rand()));
          const gz = Math.max(-this.arenaHalfSize + 0.4, Math.min(this.arenaHalfSize - 0.4, -this.arenaHalfSize + cz + this.rand()));
          if (this.isNearTree(gx, gz)) {
            activeInCell++;
            continue;
          }
          const idx = this.nextFreeGrass++;
          const slot = this.grassSlots[idx];
          const sc = 0.85 + this.rand() * 0.45;
          slot.active = true;
          slot.x = gx;
          slot.y = terrain.sampleHeight(gx, gz) - 0.015;
          slot.z = gz;
          slot.rotX = (this.rand() - 0.5) * 0.14;
          slot.rotY = this.rand() * Math.PI * 2;
          slot.rotZ = (this.rand() - 0.5) * 0.14;
          slot.baseSX = sc;
          slot.baseSY = sc * (0.9 + this.rand() * 0.45);
          slot.baseSZ = sc;
          slot.curScale = 0.04;
          slot.targetScale = 1;
          slot.cellIdx = cellIdx;
          this.grassCells[cellIdx].push(idx);
          this.animatingGrass.add(idx);
          activeInCell++;
        }

        if (activeFlowersInCell < 1 && this.rand() < 0.35 && this.nextFreeFlower < this.maxFlowers) {
          const fx = Math.max(-this.arenaHalfSize + 0.5, Math.min(this.arenaHalfSize - 0.5, -this.arenaHalfSize + cx + this.rand()));
          const fz = Math.max(-this.arenaHalfSize + 0.5, Math.min(this.arenaHalfSize - 0.5, -this.arenaHalfSize + cz + this.rand()));
          if (!this.isNearTree(fx, fz)) {
            const idx = this.nextFreeFlower++;
            const slot = this.flowerSlots[idx];
            const sc = 0.85 + this.rand() * 0.35;
            slot.active = true;
            slot.x = fx;
            slot.y = terrain.sampleHeight(fx, fz) - 0.01;
            slot.z = fz;
            slot.rotX = (this.rand() - 0.5) * 0.1;
            slot.rotY = this.rand() * Math.PI * 2;
            slot.rotZ = (this.rand() - 0.5) * 0.1;
            slot.baseSX = sc;
            slot.baseSY = sc * (0.9 + this.rand() * 0.3);
            slot.baseSZ = sc;
            slot.curScale = 0.04;
            slot.targetScale = 1;
            slot.cellIdx = cellIdx;
            this.flowerCells[cellIdx].push(idx);
            this.animatingFlowers.add(idx);
          }
        }
      }
    }
  }

  step(dt: number, terrain: TerrainSimulation): void {
    const growBlend = 1 - Math.exp(-8.5 * dt);
    const burnBlend = 1 - Math.exp(-15.0 * dt);

    if (this.animatingGrass.size > 0) {
      for (const idx of this.animatingGrass) {
        const s = this.grassSlots[idx];
        const blend = s.targetScale > s.curScale ? growBlend : burnBlend;
        s.curScale += (s.targetScale - s.curScale) * blend;
        s.y = terrain.sampleHeight(s.x, s.z) - 0.015;

        if (Math.abs(s.targetScale - s.curScale) < 0.02) {
          s.curScale = s.targetScale;
          if (s.curScale === 0) {
            s.active = false;
            this.hideSlot(this.grassMesh, idx);
          } else {
            this.applyGrassMatrix(idx, s);
          }
          this.animatingGrass.delete(idx);
        } else {
          this.applyGrassMatrix(idx, s);
        }
      }
      this.grassMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.animatingFlowers.size > 0) {
      for (const idx of this.animatingFlowers) {
        const s = this.flowerSlots[idx];
        const blend = s.targetScale > s.curScale ? growBlend : burnBlend;
        s.curScale += (s.targetScale - s.curScale) * blend;
        s.y = terrain.sampleHeight(s.x, s.z) - 0.01;

        if (Math.abs(s.targetScale - s.curScale) < 0.02) {
          s.curScale = s.targetScale;
          if (s.curScale === 0) {
            s.active = false;
            this.hideSlot(this.stemMesh, idx);
            this.hideSlot(this.blossomMesh, idx);
          } else {
            this.applyFlowerMatrix(idx, s);
          }
          this.animatingFlowers.delete(idx);
        } else {
          this.applyFlowerMatrix(idx, s);
        }
      }
      this.stemMesh.instanceMatrix.needsUpdate = true;
      this.blossomMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
