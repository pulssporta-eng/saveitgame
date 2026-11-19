import * as THREE from 'three';
import { TreePlacement } from './terrainMath';
import { TerrainSimulation } from './terrainState';
import { computeTreeTargetLushness, stepScalarToward } from './gameMechanics';

export interface DynamicTreeBatches {
  oakTrees: TreePlacement[];
  oakTrunks?: THREE.InstancedMesh;
  oakCanopies?: THREE.InstancedMesh;

  birchTrees: TreePlacement[];
  birchTrunks?: THREE.InstancedMesh;
  birchCanopies?: THREE.InstancedMesh;

  deadwoodTrees: TreePlacement[];
  deadwoodTrunks?: THREE.InstancedMesh;
  deadwoodLushCanopies?: THREE.InstancedMesh;

  acaciaTrees: TreePlacement[];
  acaciaTrunks?: THREE.InstancedMesh;
  acaciaDryCanopies?: THREE.InstancedMesh;
  acaciaLushCanopies?: THREE.InstancedMesh;
}

interface TreeRuntimeState {
  species: 'oak' | 'birch' | 'deadwood' | 'acacia';
  index: number;
  placement: TreePlacement;
  lushness: number;
  targetLushness: number;
  currentY: number;
  lushColor: THREE.Color;
  dryBarkColor: THREE.Color;
  livingBarkColor: THREE.Color;
}

const _dummy = new THREE.Object3D();
const _col = new THREE.Color();
const _parchedLeaf = new THREE.Color(0x9a7836);
const _sproutLeaf = new THREE.Color(0x88b044);
const _lushEmerald = new THREE.Color(0x4c8c38);
const _lushAcacia = new THREE.Color(0x4e8e38);
const _oakLivingBark = new THREE.Color(0xc9beae);
const _birchLivingBark = new THREE.Color(0xf2ece0);
const _dryCharredBark = new THREE.Color(0x6e6256);
const _desertLivingBark = new THREE.Color(0x785a3d);

function smooth01(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export class DynamicTreeManager {
  private readonly batches: DynamicTreeBatches;
  private readonly trees: TreeRuntimeState[] = [];
  private syncCooldown = 0;

  constructor(batches: DynamicTreeBatches) {
    this.batches = batches;

    const register = (
      list: TreePlacement[],
      species: TreeRuntimeState['species'],
      initialLush: number,
    ) => {
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const livingBark =
          species === 'oak'
            ? _oakLivingBark.clone()
            : species === 'birch'
              ? _birchLivingBark.clone()
              : _desertLivingBark.clone();
        const dryBark =
          species === 'oak' || species === 'birch'
            ? _dryCharredBark.clone()
            : new THREE.Color(p.tintHex);
        const lushColor =
          species === 'oak' || species === 'birch'
            ? new THREE.Color(p.tintHex)
            : species === 'deadwood'
              ? _lushEmerald.clone()
              : _lushAcacia.clone();

        const state: TreeRuntimeState = {
          species,
          index: i,
          placement: p,
          lushness: initialLush,
          targetLushness: initialLush,
          currentY: p.y,
          lushColor,
          dryBarkColor: dryBark,
          livingBarkColor: livingBark,
        };
        this.trees.push(state);
        this.applyTreeVisuals(state);
      }
    };

    register(batches.oakTrees, 'oak', 1);
    register(batches.birchTrees, 'birch', 1);
    register(batches.deadwoodTrees, 'deadwood', 0);
    register(batches.acaciaTrees, 'acacia', 0);

    this.flushAllFlags();
  }

  private setMeshInstance(
    mesh: THREE.InstancedMesh | undefined,
    idx: number,
    p: TreePlacement,
    y: number,
    scale: number,
    color: THREE.Color,
  ): void {
    if (!mesh) return;
    _dummy.position.set(p.x, y, p.z);
    _dummy.rotation.set(p.leanX, p.rotY, p.leanZ);
    _dummy.scale.setScalar(Math.max(0.001, scale));
    _dummy.updateMatrix();
    mesh.setMatrixAt(idx, _dummy.matrix);
    mesh.setColorAt(idx, color);
  }

  private applyTreeVisuals(state: TreeRuntimeState): void {
    const { species, index, placement: p, lushness, currentY } = state;

    // Bark color smoothly dries or re-hydrates
    _col.copy(state.dryBarkColor).lerp(state.livingBarkColor, lushness);

    if (species === 'oak') {
      this.setMeshInstance(this.batches.oakTrunks, index, p, currentY, p.scale, _col);
      const leafFade = smooth01(0.15, 0.88, lushness);
      _col.copy(_parchedLeaf).lerp(state.lushColor, leafFade);
      const canopyScale = p.scale * smooth01(0.06, 0.86, lushness);
      this.setMeshInstance(this.batches.oakCanopies, index, p, currentY, canopyScale, _col);
    } else if (species === 'birch') {
      this.setMeshInstance(this.batches.birchTrunks, index, p, currentY, p.scale, _col);
      const leafFade = smooth01(0.15, 0.88, lushness);
      _col.copy(_parchedLeaf).lerp(state.lushColor, leafFade);
      const canopyScale = p.scale * smooth01(0.06, 0.86, lushness);
      this.setMeshInstance(this.batches.birchCanopies, index, p, currentY, canopyScale, _col);
    } else if (species === 'deadwood') {
      this.setMeshInstance(this.batches.deadwoodTrunks, index, p, currentY, p.scale, _col);
      const leafGrow = smooth01(0.12, 0.92, lushness);
      _col.copy(_sproutLeaf).lerp(state.lushColor, smooth01(0.2, 0.95, lushness));
      this.setMeshInstance(
        this.batches.deadwoodLushCanopies,
        index,
        p,
        currentY,
        p.scale * leafGrow,
        _col,
      );
    } else if (species === 'acacia') {
      this.setMeshInstance(this.batches.acaciaTrunks, index, p, currentY, p.scale, _col);
      const dryScale = p.scale * (1 - smooth01(0.1, 0.76, lushness));
      _col.setHex(p.tintHex);
      this.setMeshInstance(this.batches.acaciaDryCanopies, index, p, currentY, dryScale, _col);

      const lushScale = p.scale * 1.12 * smooth01(0.16, 0.9, lushness);
      _col.copy(_sproutLeaf).lerp(state.lushColor, smooth01(0.2, 0.95, lushness));
      this.setMeshInstance(this.batches.acaciaLushCanopies, index, p, currentY, lushScale, _col);
    }
  }

  private markDirtyForSpecies(species: TreeRuntimeState['species']): void {
    const mark = (mesh?: THREE.InstancedMesh) => {
      if (!mesh) return;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    if (species === 'oak') {
      mark(this.batches.oakTrunks);
      mark(this.batches.oakCanopies);
    } else if (species === 'birch') {
      mark(this.batches.birchTrunks);
      mark(this.batches.birchCanopies);
    } else if (species === 'deadwood') {
      mark(this.batches.deadwoodTrunks);
      mark(this.batches.deadwoodLushCanopies);
    } else {
      mark(this.batches.acaciaTrunks);
      mark(this.batches.acaciaDryCanopies);
      mark(this.batches.acaciaLushCanopies);
    }
  }

  private flushAllFlags(): void {
    const all: Array<THREE.InstancedMesh | undefined> = [
      this.batches.oakTrunks,
      this.batches.oakCanopies,
      this.batches.birchTrunks,
      this.batches.birchCanopies,
      this.batches.deadwoodTrunks,
      this.batches.deadwoodLushCanopies,
      this.batches.acaciaTrunks,
      this.batches.acaciaDryCanopies,
      this.batches.acaciaLushCanopies,
    ];
    for (const mesh of all) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.computeBoundingSphere();
    }
  }

  private sampleSurroundingBiome(terrain: TerrainSimulation, x: number, z: number): number {
    const r = 0.92;
    const c = terrain.sampleBiome(x, z);
    const n = terrain.sampleBiome(x, z - r);
    const s = terrain.sampleBiome(x, z + r);
    const e = terrain.sampleBiome(x + r, z);
    const w = terrain.sampleBiome(x - r, z);
    const ringAvg = (n + s + e + w) * 0.25;
    return c * 0.6 + ringAvg * 0.4;
  }

  step(dt: number, terrain: TerrainSimulation, terrainChanged: boolean): void {
    this.syncCooldown -= dt;
    const shouldSampleTerrain = terrainChanged || this.syncCooldown <= 0;
    if (shouldSampleTerrain) {
      this.syncCooldown = 0.16;
    }

    const dirtySpecies = new Set<TreeRuntimeState['species']>();

    for (let i = 0; i < this.trees.length; i++) {
      const t = this.trees[i];
      if (shouldSampleTerrain) {
        const avgBiome = this.sampleSurroundingBiome(terrain, t.placement.x, t.placement.z);
        t.targetLushness = computeTreeTargetLushness(avgBiome);
      }

      const nextLush = stepScalarToward(t.lushness, t.targetLushness, 2.8, dt);
      const targetY = terrain.sampleHeight(t.placement.x, t.placement.z) - 0.08;
      const nextY = stepScalarToward(t.currentY, targetY, 8.0, dt);

      if (Math.abs(nextLush - t.lushness) > 0.0008 || Math.abs(nextY - t.currentY) > 0.001) {
        t.lushness = nextLush;
        t.currentY = nextY;
        this.applyTreeVisuals(t);
        dirtySpecies.add(t.species);
      }
    }

    for (const sp of dirtySpecies) {
      this.markDirtyForSpecies(sp);
    }
  }
}
