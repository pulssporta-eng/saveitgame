import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createArenaTextureLibrary, ArenaTextureLibrary } from './proceduralTextures';
import {
  ARENA_HALF_SIZE,
  ARENA_SPAN,
  ArenaEcosystemData,
  buildArenaEcosystem,
  getTerrainHeight,
  MicroDetailInstance,
  mulberry32,
  TERRAIN_SEGMENTS,
  TreePlacement,
} from './terrainMath';
import {
  TerrainSimulation,
  TerrainStepResult,
} from './terrainState';
import {
  DynamicVegetationManager,
  MAX_FLOWER_INSTANCES,
  MAX_GRASS_INSTANCES,
} from './dynamicVegetation';
import { DynamicTreeManager } from './dynamicTrees';
import {
  ArenaSurroundingsController,
  buildArenaSurroundings,
} from './arenaSurroundings';

export interface SharedArenaEnvironment {
  textures: ArenaTextureLibrary;
  envRenderTarget: THREE.WebGLRenderTarget;
  sunLight: THREE.DirectionalLight;
  dispose: () => void;
}

export interface BuildArenaOptions {
  arenaSpan?: number;
  terrainSegments?: number;
  spawnAvoidPoints?: ReadonlyArray<{ x: number; z: number }>;
  sharedEnv?: SharedArenaEnvironment;
  seed?: number;
}

export interface TreeFadeUniforms {
  uTreePlayerPos: { value: THREE.Vector3 };
  uTreeCamPos: { value: THREE.Vector3 };
  uTreeFadeEnabled: { value: number };
}

export interface WindUniforms {
  uWindTime: { value: number };
}

export interface BuiltArenaResources {
  arenaRoot: THREE.Group;
  arenaSpan: number;
  arenaHalfSize: number;
  terrainMesh: THREE.Mesh;
  terrainSim: TerrainSimulation;
  vegetation: DynamicVegetationManager;
  trees: DynamicTreeManager;
  surroundings: ArenaSurroundingsController;
  treeObstacles: Array<{ x: number; z: number; radius: number }>;
  treeFadeUniforms: TreeFadeUniforms;
  windUniforms: WindUniforms;
  syncTerrain: (stepResult: TerrainStepResult) => void;
  sunLight: THREE.DirectionalLight;
  dustPoints: THREE.Points;
  textures: ArenaTextureLibrary;
  envRenderTarget: THREE.WebGLRenderTarget;
  dispose: () => void;
}

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _normal = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _tiltQuat = new THREE.Quaternion();
const _euler = new THREE.Euler();

function computeTerrainNormal(
  x: number,
  z: number,
  arenaHalfSize: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const eps = 0.22;
  const hL = getTerrainHeight(Math.max(-arenaHalfSize, x - eps), z, arenaHalfSize);
  const hR = getTerrainHeight(Math.min(arenaHalfSize, x + eps), z, arenaHalfSize);
  const hD = getTerrainHeight(x, Math.max(-arenaHalfSize, z - eps), arenaHalfSize);
  const hU = getTerrainHeight(x, Math.min(arenaHalfSize, z + eps), arenaHalfSize);
  return out.set(hL - hR, 2 * eps, hD - hU).normalize();
}

function createContinuousTerrainGeometry(terrainSim: TerrainSimulation): THREE.BufferGeometry {
  // Slight +0.18 overlap tucks cleanly inside the perimeter stone curb
  const geo = new THREE.PlaneGeometry(
    terrainSim.terrainExtent,
    terrainSim.terrainExtent,
    terrainSim.terrainSegments,
    terrainSim.terrainSegments,
  );
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainSim.heights[i]);
  }

  geo.setAttribute('aBiomeMask', new THREE.BufferAttribute(new Float32Array(terrainSim.biomeMasks), 1));
  geo.setAttribute('aScorch', new THREE.BufferAttribute(new Float32Array(terrainSim.scorches), 1));
  geo.computeVertexNormals();
  return geo;
}

function syncTerrainGeometry(
  geo: THREE.BufferGeometry,
  sim: TerrainSimulation,
  stepResult: TerrainStepResult,
): void {
  if (!stepResult.hasDirty) return;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const norm = geo.attributes.normal as THREE.BufferAttribute;
  const maskAttr = geo.attributes.aBiomeMask as THREE.BufferAttribute;
  const scorchAttr = geo.attributes.aScorch as THREE.BufferAttribute;

  const gridRes = sim.gridRes;
  const pad = 2;
  const minIx = Math.max(0, stepResult.minIx - pad);
  const maxIx = Math.min(gridRes - 1, stepResult.maxIx + pad);
  const minIz = Math.max(0, stepResult.minIz - pad);
  const maxIz = Math.min(gridRes - 1, stepResult.maxIz + pad);

  for (let iz = minIz; iz <= maxIz; iz++) {
    const row = iz * gridRes;
    for (let ix = minIx; ix <= maxIx; ix++) {
      const idx = row + ix;
      pos.setY(idx, sim.heights[idx]);
      maskAttr.setX(idx, sim.biomeMasks[idx]);
      scorchAttr.setX(idx, sim.scorches[idx]);
    }
  }

  // Recompute smooth central-difference normals only across the dirty patch
  const twoDx = 2 * (sim.terrainExtent / sim.terrainSegments);
  for (let iz = Math.max(1, minIz); iz <= Math.min(gridRes - 2, maxIz); iz++) {
    const row = iz * gridRes;
    for (let ix = Math.max(1, minIx); ix <= Math.min(gridRes - 2, maxIx); ix++) {
      const idx = row + ix;
      const hL = sim.heights[idx - 1];
      const hR = sim.heights[idx + 1];
      const hD = sim.heights[idx - gridRes];
      const hU = sim.heights[idx + gridRes];
      _normal.set(hL - hR, twoDx, hD - hU).normalize();
      norm.setXYZ(idx, _normal.x, _normal.y, _normal.z);
    }
  }

  pos.needsUpdate = true;
  norm.needsUpdate = true;
  maskAttr.needsUpdate = true;
  scorchAttr.needsUpdate = true;
}

function createContinuousTerrainMaterial(
  textures: ArenaTextureLibrary,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.02,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMeadowMap = { value: textures.meadow.map };
    shader.uniforms.uMeadowBumpMap = { value: textures.meadow.bumpMap };
    shader.uniforms.uMeadowRoughMap = { value: textures.meadow.roughnessMap };
    shader.uniforms.uSandMap = { value: textures.sand.map };
    shader.uniforms.uSandBumpMap = { value: textures.sand.bumpMap };
    shader.uniforms.uSandRoughMap = { value: textures.sand.roughnessMap };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute float aBiomeMask;
        attribute float aScorch;
        varying float vBiomeMask;
        varying float vScorch;
        varying vec3 vTerrainWorldPos;
        `,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vBiomeMask = aBiomeMask;
        vScorch = aScorch;
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform sampler2D uMeadowMap;
        uniform sampler2D uMeadowBumpMap;
        uniform sampler2D uMeadowRoughMap;
        uniform sampler2D uSandMap;
        uniform sampler2D uSandBumpMap;
        uniform sampler2D uSandRoughMap;
        varying float vBiomeMask;
        varying float vScorch;
        varying vec3 vTerrainWorldPos;

        float terrainHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        float terrainNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(terrainHash(i + vec2(0.0, 0.0)), terrainHash(i + vec2(1.0, 0.0)), u.x),
            mix(terrainHash(i + vec2(0.0, 1.0)), terrainHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        vec3 perturbTerrainNormal(vec3 surf_pos, vec3 surf_norm, float heightVal, float bumpStrength) {
          vec3 vSigmaX = normalize(dFdx(surf_pos));
          vec3 vSigmaY = normalize(dFdy(surf_pos));
          vec3 vN = surf_norm;
          vec3 R1 = cross(vSigmaY, vN);
          vec3 R2 = cross(vN, vSigmaX);
          float fDet = dot(vSigmaX, R1);
          float dHx = dFdx(heightVal) * bumpStrength;
          float dHy = dFdy(heightVal) * bumpStrength;
          vec3 vGrad = sign(fDet) * (dHx * R1 + dHy * R2);
          return normalize(abs(fDet) * surf_norm - vGrad);
        }
        `,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        #include <map_fragment>
        vec2 tUv1 = vTerrainWorldPos.xz * 0.28;
        vec2 tUv2 = (mat2(0.8, -0.6, 0.6, 0.8) * vTerrainWorldPos.xz) * 0.13 + vec2(0.37, 0.71);
        float tDetail = terrainNoise(vTerrainWorldPos.xz * 0.65) * 0.6 + terrainNoise(vTerrainWorldPos.xz * 1.9) * 0.4;
        float tEdgeMask = smoothstep(0.08, 0.92, vBiomeMask + (tDetail - 0.5) * 0.28);

        vec3 mAlbedo = mix(texture2D(uMeadowMap, tUv1).rgb, texture2D(uMeadowMap, tUv2).rgb, 0.42);
        vec3 sAlbedo = mix(texture2D(uSandMap, tUv1 * 0.92).rgb, texture2D(uSandMap, tUv2 * 0.86).rgb, 0.36);

        float tMacroVar = terrainNoise(vTerrainWorldPos.xz * 0.22);
        mAlbedo *= mix(vec3(0.84, 0.92, 0.79), vec3(1.12, 1.08, 0.90), tMacroVar);
        sAlbedo *= mix(vec3(0.92, 0.88, 0.82), vec3(1.09, 1.04, 0.96), tMacroVar);

        float tTransBand = smoothstep(0.0, 0.45, tEdgeMask) * (1.0 - smoothstep(0.45, 0.95, tEdgeMask));
        vec3 tBlended = mix(mAlbedo, sAlbedo, tEdgeMask);
        tBlended = mix(tBlended, vec3(0.36, 0.29, 0.17), tTransBand * 0.22);

        if (vScorch > 0.01) {
          float emberCrack = smoothstep(0.46, 0.86, terrainNoise(vTerrainWorldPos.xz * 4.4));
          vec3 charCol = vec3(0.045, 0.032, 0.025);
          vec3 emberCol = vec3(1.85, 0.44, 0.04) * emberCrack;
          tBlended = mix(tBlended, charCol, clamp(vScorch * 0.9, 0.0, 0.9));
          totalEmissiveRadiance += emberCol * vScorch * 1.35;
        }

        float tHeightShade = clamp(0.89 + vTerrainWorldPos.y * 0.13, 0.76, 1.12);
        diffuseColor.rgb *= tBlended * tHeightShade;
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        float mRough = mix(texture2D(uMeadowRoughMap, tUv1).g, texture2D(uMeadowRoughMap, tUv2).g, 0.42);
        float sRough = mix(texture2D(uSandRoughMap, tUv1 * 0.92).g, texture2D(uSandRoughMap, tUv2 * 0.86).g, 0.36);
        roughnessFactor *= mix(mRough, sRough, tEdgeMask);
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        #include <normal_fragment_maps>
        float mBump = mix(texture2D(uMeadowBumpMap, tUv1).g, texture2D(uMeadowBumpMap, tUv2).g, 0.42);
        float sBump = mix(texture2D(uSandBumpMap, tUv1 * 0.92).g, texture2D(uSandBumpMap, tUv2 * 0.86).g, 0.36);
        float tBumpH = mix(mBump, sBump, tEdgeMask);
        float tBumpStrength = mix(1.45, 2.05, tEdgeMask);
        normal = perturbTerrainNormal(-vViewPosition, normal, tBumpH, tBumpStrength);
        `,
      );
  };

  mat.customProgramCacheKey = () => 'save-it-continuous-dual-biome-terrain-v2';
  return mat;
}

/**
 * Generates a tapered organic wood tube along a 3D spline with seamless UVs
 * and optional root-collar flare near t = 0.
 */
function createTaperedLimbGeometry(
  points: THREE.Vector3[],
  tubularSegs: number,
  radialSegs: number,
  radiusStart: number,
  radiusEnd: number,
  rootFlare = 0,
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const curveLen = curve.getLength();

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const pt = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];

    const flare = rootFlare > 0 && t < 0.22 ? Math.pow(1 - t / 0.22, 1.8) * rootFlare : 0;
    const baseR = radiusStart * (1 - t) + radiusEnd * t + flare;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      // Subtle organic fluted root buttresses at base
      const flute =
        rootFlare > 0 && t < 0.24
          ? 1 + Math.sin(theta * 4.0) * 0.18 * (1 - t / 0.24)
          : 1;
      const r = Math.max(0.004, baseR * flute);

      const vx = pt.x + r * (cosT * N.x + sinT * B.x);
      const vy = pt.y + r * (cosT * N.y + sinT * B.y);
      const vz = pt.z + r * (cosT * N.z + sinT * B.z);

      positions.push(vx, vy, vz);
      uvs.push(u, t * Math.max(0.5, curveLen * 0.45));
    }
  }

  const stride = radialSegs + 1;
  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds a multi-part botanical foliage cloud out of intersecting angled leaf-card quads
 * with baked radial ambient-occlusion vertex colors for lush 3D volume.
 */
function createBotanicalCanopyGeometry(
  clusters: Array<{ cx: number; cy: number; cz: number; rx: number; ry: number; rz: number; cards: number }>,
  cardBaseSize: number,
  flatTop: boolean,
  seed: number,
): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];

  for (const cl of clusters) {
    for (let i = 0; i < cl.cards; i++) {
      const phi = Math.acos(1 - 2 * rng());
      const theta = rng() * Math.PI * 2;
      const dist = Math.pow(rng(), 0.55);

      const lx = Math.sin(phi) * Math.cos(theta) * cl.rx * dist;
      const ly = Math.cos(phi) * cl.ry * dist * (flatTop ? 0.42 : 1.0);
      const lz = Math.sin(phi) * Math.sin(theta) * cl.rz * dist;

      const s = cardBaseSize * (0.72 + rng() * 0.52);
      const card = new THREE.PlaneGeometry(s, s * (flatTop ? 0.85 : 1.0));

      if (flatTop) {
        card.rotateX(-Math.PI * 0.5 + (rng() - 0.5) * 0.42);
        card.rotateY(rng() * Math.PI * 2);
        card.rotateZ((rng() - 0.5) * 0.3);
      } else {
        card.rotateX((rng() - 0.5) * 1.9);
        card.rotateY(rng() * Math.PI * 2);
        card.rotateZ((rng() - 0.5) * 1.4);
      }
      card.translate(cl.cx + lx, cl.cy + ly, cl.cz + lz);

      // Bake crown shading gradient (sunlit top outer tips vs shaded inner foliage)
      const count = card.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const crownHeightFactor = Math.max(0.55, Math.min(1.22, 0.72 + (ly / Math.max(0.25, cl.ry)) * 0.35 + dist * 0.2));
      for (let v = 0; v < count; v++) {
        colors[v * 3] = crownHeightFactor;
        colors[v * 3 + 1] = crownHeightFactor * 1.02;
        colors[v * 3 + 2] = crownHeightFactor * 0.94;
      }
      card.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      parts.push(card);
    }
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

function createLushOakGeometries(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const woodParts: THREE.BufferGeometry[] = [];

  // Main gnarled trunk
  woodParts.push(
    createTaperedLimbGeometry(
      [
        new THREE.Vector3(0, -0.05, 0),
        new THREE.Vector3(0.04, 0.55, -0.02),
        new THREE.Vector3(-0.03, 1.2, 0.04),
        new THREE.Vector3(0.02, 1.78, 0.01),
      ],
      10,
      8,
      0.24,
      0.13,
      0.14,
    ),
  );

  // 4 root buttresses gripping soil
  for (let r = 0; r < 4; r++) {
    const a = (r / 4) * Math.PI * 2 + 0.35;
    woodParts.push(
      createTaperedLimbGeometry(
        [
          new THREE.Vector3(Math.cos(a) * 0.08, 0.35, Math.sin(a) * 0.08),
          new THREE.Vector3(Math.cos(a) * 0.25, 0.1, Math.sin(a) * 0.25),
          new THREE.Vector3(Math.cos(a) * 0.42, -0.06, Math.sin(a) * 0.42),
        ],
        5,
        5,
        0.1,
        0.03,
      ),
    );
  }

  // 5 spreading primary limbs + forked secondary boughs
  const limbTargets = [
    new THREE.Vector3(0.88, 2.38, 0.42),
    new THREE.Vector3(-0.85, 2.45, 0.52),
    new THREE.Vector3(0.35, 2.52, -0.88),
    new THREE.Vector3(-0.62, 2.32, -0.68),
    new THREE.Vector3(0.06, 2.86, 0.08),
  ];

  for (let i = 0; i < limbTargets.length; i++) {
    const end = limbTargets[i];
    const startY = i === 4 ? 1.68 : 1.38 + (i % 2) * 0.16;
    const mid = new THREE.Vector3(end.x * 0.52, (startY + end.y) * 0.5 + 0.12, end.z * 0.52);
    woodParts.push(
      createTaperedLimbGeometry(
        [new THREE.Vector3(0, startY, 0), mid, end],
        6,
        6,
        0.105,
        0.042,
      ),
    );
    // Secondary fork
    const forkEnd = new THREE.Vector3(end.x * 1.18 + 0.2, end.y + 0.34, end.z * 1.15 - 0.18);
    woodParts.push(
      createTaperedLimbGeometry([mid.clone(), forkEnd], 4, 5, 0.058, 0.022),
    );
  }

  const trunk = mergeGeometries(woodParts, false);
  woodParts.forEach((p) => p.dispose());
  trunk.computeVertexNormals();

  const canopy = createBotanicalCanopyGeometry(
    [
      { cx: 0.0, cy: 2.85, cz: 0.0, rx: 0.92, ry: 0.72, rz: 0.92, cards: 22 },
      { cx: 0.82, cy: 2.42, cz: 0.38, rx: 0.74, ry: 0.58, rz: 0.72, cards: 16 },
      { cx: -0.78, cy: 2.46, cz: 0.46, rx: 0.72, ry: 0.56, rz: 0.74, cards: 16 },
      { cx: 0.32, cy: 2.54, cz: -0.82, rx: 0.72, ry: 0.56, rz: 0.72, cards: 15 },
      { cx: -0.58, cy: 2.34, cz: -0.62, rx: 0.68, ry: 0.52, rz: 0.68, cards: 14 },
    ],
    0.88,
    false,
    8081,
  );

  return { trunk, canopy };
}

function createLushBirchGeometries(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const woodParts: THREE.BufferGeometry[] = [];

  // Slender graceful main stem
  woodParts.push(
    createTaperedLimbGeometry(
      [
        new THREE.Vector3(0, -0.05, 0),
        new THREE.Vector3(-0.08, 0.85, 0.05),
        new THREE.Vector3(0.06, 1.85, -0.04),
        new THREE.Vector3(0.02, 2.82, 0.03),
      ],
      10,
      7,
      0.145,
      0.048,
      0.08,
    ),
  );

  // Twin slender companion stem
  woodParts.push(
    createTaperedLimbGeometry(
      [
        new THREE.Vector3(0.05, -0.04, 0.04),
        new THREE.Vector3(0.24, 0.82, 0.18),
        new THREE.Vector3(0.38, 1.75, 0.22),
        new THREE.Vector3(0.46, 2.42, 0.16),
      ],
      8,
      6,
      0.095,
      0.032,
    ),
  );

  const branchSpecs = [
    [new THREE.Vector3(0.02, 1.55, 0), new THREE.Vector3(-0.48, 2.24, 0.32)],
    [new THREE.Vector3(0.04, 1.92, -0.02), new THREE.Vector3(0.42, 2.62, -0.42)],
    [new THREE.Vector3(0.03, 2.15, 0.01), new THREE.Vector3(-0.36, 2.85, -0.35)],
    [new THREE.Vector3(0.32, 1.55, 0.18), new THREE.Vector3(0.75, 2.18, 0.36)],
  ];
  for (const [s, e] of branchSpecs) {
    const mid = s.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.14, 0));
    woodParts.push(createTaperedLimbGeometry([s, mid, e], 5, 5, 0.048, 0.018));
  }

  const trunk = mergeGeometries(woodParts, false);
  woodParts.forEach((p) => p.dispose());
  trunk.computeVertexNormals();

  const canopy = createBotanicalCanopyGeometry(
    [
      { cx: 0.02, cy: 2.85, cz: 0.02, rx: 0.68, ry: 0.72, rz: 0.68, cards: 20 },
      { cx: -0.44, cy: 2.28, cz: 0.28, rx: 0.52, ry: 0.48, rz: 0.52, cards: 14 },
      { cx: 0.52, cy: 2.34, cz: 0.18, rx: 0.56, ry: 0.52, rz: 0.56, cards: 15 },
      { cx: 0.32, cy: 2.65, cz: -0.34, rx: 0.48, ry: 0.46, rz: 0.48, cards: 12 },
    ],
    0.78,
    false,
    6041,
  );

  return { trunk, canopy };
}

function createDryDeadwoodGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  // Twisted weathered trunk
  parts.push(
    createTaperedLimbGeometry(
      [
        new THREE.Vector3(0, -0.06, 0),
        new THREE.Vector3(0.12, 0.48, -0.08),
        new THREE.Vector3(-0.08, 1.05, 0.1),
        new THREE.Vector3(0.05, 1.55, 0.02),
      ],
      10,
      7,
      0.22,
      0.11,
      0.12,
    ),
  );

  // Exposed gnarled desert root claws
  for (let r = 0; r < 4; r++) {
    const a = (r / 4) * Math.PI * 2 + 0.52;
    parts.push(
      createTaperedLimbGeometry(
        [
          new THREE.Vector3(Math.cos(a) * 0.08, 0.28, Math.sin(a) * 0.08),
          new THREE.Vector3(Math.cos(a) * 0.34, 0.06, Math.sin(a) * 0.34),
          new THREE.Vector3(Math.cos(a + 0.22) * 0.58, -0.08, Math.sin(a + 0.22) * 0.58),
        ],
        5,
        5,
        0.085,
        0.022,
      ),
    );
  }

  // Jagged twisted dead boughs & stark leafless twigs
  const limbs: Array<[THREE.Vector3[], number, number]> = [
    [
      [
        new THREE.Vector3(-0.04, 1.15, 0.06),
        new THREE.Vector3(-0.52, 1.62, 0.24),
        new THREE.Vector3(-0.98, 2.08, 0.12),
        new THREE.Vector3(-1.18, 2.38, 0.26),
      ],
      0.095,
      0.015,
    ],
    [
      [
        new THREE.Vector3(-0.52, 1.62, 0.24),
        new THREE.Vector3(-0.62, 1.98, 0.62),
        new THREE.Vector3(-0.82, 2.22, 0.78),
      ],
      0.052,
      0.012,
    ],
    [
      [
        new THREE.Vector3(0.05, 1.48, 0.02),
        new THREE.Vector3(0.56, 1.92, -0.22),
        new THREE.Vector3(0.95, 2.42, -0.35),
        new THREE.Vector3(1.12, 2.68, -0.18),
      ],
      0.088,
      0.014,
    ],
    [
      [
        new THREE.Vector3(0.56, 1.92, -0.22),
        new THREE.Vector3(0.76, 1.85, 0.25),
        new THREE.Vector3(1.06, 2.04, 0.44),
      ],
      0.048,
      0.012,
    ],
    [
      [
        new THREE.Vector3(0.02, 1.38, 0.04),
        new THREE.Vector3(-0.18, 2.05, -0.44),
        new THREE.Vector3(-0.28, 2.55, -0.68),
      ],
      0.072,
      0.013,
    ],
    [
      [
        new THREE.Vector3(0.06, 0.92, -0.05),
        new THREE.Vector3(0.55, 1.24, 0.34),
        new THREE.Vector3(0.78, 1.38, 0.56),
      ],
      0.058,
      0.012,
    ],
  ];

  for (const [pts, r0, r1] of limbs) {
    parts.push(createTaperedLimbGeometry(pts, 6, 5, r0, r1));
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

function createDeadwoodLushCanopyGeometry(): THREE.BufferGeometry {
  return createBotanicalCanopyGeometry(
    [
      { cx: 0.04, cy: 2.38, cz: -0.05, rx: 0.85, ry: 0.62, rz: 0.85, cards: 18 },
      { cx: -1.02, cy: 2.24, cz: 0.22, rx: 0.66, ry: 0.50, rz: 0.66, cards: 14 },
      { cx: -0.72, cy: 2.12, cz: 0.68, rx: 0.56, ry: 0.44, rz: 0.56, cards: 11 },
      { cx: 1.0, cy: 2.54, cz: -0.22, rx: 0.68, ry: 0.52, rz: 0.68, cards: 14 },
      { cx: 0.94, cy: 1.98, cz: 0.36, rx: 0.54, ry: 0.42, rz: 0.54, cards: 11 },
      { cx: -0.24, cy: 2.48, cz: -0.58, rx: 0.58, ry: 0.46, rz: 0.58, cards: 12 },
      { cx: 0.68, cy: 1.35, cz: 0.48, rx: 0.48, ry: 0.38, rz: 0.48, cards: 10 },
    ],
    0.84,
    false,
    7321,
  );
}

function createDryAcaciaGeometries(): { trunk: THREE.BufferGeometry; canopy: THREE.BufferGeometry } {
  const woodParts: THREE.BufferGeometry[] = [];

  // Wind-bent gnarled acacia trunk
  woodParts.push(
    createTaperedLimbGeometry(
      [
        new THREE.Vector3(0, -0.06, 0),
        new THREE.Vector3(0.14, 0.52, 0.06),
        new THREE.Vector3(0.22, 1.12, -0.04),
        new THREE.Vector3(0.18, 1.56, 0.02),
      ],
      9,
      7,
      0.19,
      0.1,
      0.11,
    ),
  );

  // Exposed dry roots
  for (let r = 0; r < 3; r++) {
    const a = (r / 3) * Math.PI * 2 + 0.8;
    woodParts.push(
      createTaperedLimbGeometry(
        [
          new THREE.Vector3(Math.cos(a) * 0.08, 0.25, Math.sin(a) * 0.08),
          new THREE.Vector3(Math.cos(a) * 0.36, 0.02, Math.sin(a) * 0.36),
          new THREE.Vector3(Math.cos(a) * 0.52, -0.08, Math.sin(a) * 0.52),
        ],
        4,
        5,
        0.075,
        0.02,
      ),
    );
  }

  // Wide flat-spreading umbrella limbs
  const spokes = [
    new THREE.Vector3(1.18, 2.26, 0.38),
    new THREE.Vector3(-0.98, 2.18, 0.62),
    new THREE.Vector3(0.24, 2.34, -1.08),
    new THREE.Vector3(-0.76, 2.12, -0.68),
  ];
  for (const end of spokes) {
    const start = new THREE.Vector3(0.18, 1.46, 0.02);
    const mid = start.clone().lerp(end, 0.52).add(new THREE.Vector3(0, -0.06, 0));
    woodParts.push(createTaperedLimbGeometry([start, mid, end], 6, 5, 0.076, 0.025));
  }

  const trunk = mergeGeometries(woodParts, false);
  woodParts.forEach((p) => p.dispose());
  trunk.computeVertexNormals();

  // Flat-topped sparse parched desert canopy pads
  const canopy = createBotanicalCanopyGeometry(
    [
      { cx: 0.22, cy: 2.42, cz: 0.0, rx: 1.05, ry: 0.28, rz: 0.96, cards: 14 },
      { cx: 1.05, cy: 2.3, cz: 0.32, rx: 0.72, ry: 0.22, rz: 0.68, cards: 10 },
      { cx: -0.88, cy: 2.22, cz: 0.52, rx: 0.68, ry: 0.22, rz: 0.66, cards: 10 },
      { cx: 0.16, cy: 2.36, cz: -0.95, rx: 0.66, ry: 0.2, rz: 0.66, cards: 9 },
    ],
    0.84,
    true,
    9213,
  );

  return { trunk, canopy };
}

function createGrassTuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const bladeConfigs = [
    { angle: 0.0, tilt: 0.28, height: 0.26, width: 0.036, offset: 0.0 },
    { angle: 1.1, tilt: 0.34, height: 0.22, width: 0.032, offset: 0.03 },
    { angle: 2.2, tilt: 0.25, height: 0.28, width: 0.038, offset: 0.025 },
    { angle: 3.4, tilt: 0.38, height: 0.2, width: 0.03, offset: 0.035 },
    { angle: 4.6, tilt: 0.31, height: 0.24, width: 0.034, offset: 0.028 },
    { angle: 5.5, tilt: 0.22, height: 0.18, width: 0.028, offset: 0.04 },
  ];

  for (const cfg of bladeConfigs) {
    const segs = 3;
    const positions: number[] = [];
    const indices: number[] = [];
    const cosA = Math.cos(cfg.angle);
    const sinA = Math.sin(cfg.angle);
    const perpX = -sinA;
    const perpZ = cosA;

    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const w = cfg.width * (1 - t * 0.92);
      const y = cfg.height * t;
      const bend = cfg.tilt * t * t * cfg.height * 1.4;
      const cx = cosA * (cfg.offset + bend);
      const cz = sinA * (cfg.offset + bend);

      positions.push(cx - perpX * w * 0.5, y, cz - perpZ * w * 0.5);
      positions.push(cx + perpX * w * 0.5, y, cz + perpZ * w * 0.5);
    }

    for (let s = 0; s < segs; s++) {
      const i0 = s * 2;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      indices.push(i0, i1, i2, i1, i3, i2);
    }

    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    blade.setIndex(indices);
    blade.computeVertexNormals();
    blades.push(blade);
  }

  const merged = mergeGeometries(blades, false);
  blades.forEach((b) => b.dispose());
  merged.computeVertexNormals();
  return merged;
}

function createWildflowerStemGeometry(): THREE.BufferGeometry {
  const stem = new THREE.CylinderGeometry(0.008, 0.012, 0.22, 5);
  stem.translate(0, 0.11, 0);

  const leafA = new THREE.ConeGeometry(0.024, 0.075, 4);
  leafA.rotateZ(Math.PI * 0.38);
  leafA.translate(0.025, 0.08, 0);

  const leafB = new THREE.ConeGeometry(0.022, 0.07, 4);
  leafB.rotateZ(-Math.PI * 0.36);
  leafB.rotateY(1.8);
  leafB.translate(-0.02, 0.11, 0.015);

  const merged = mergeGeometries([stem, leafA, leafB], false);
  stem.dispose();
  leafA.dispose();
  leafB.dispose();
  merged.computeVertexNormals();
  return merged;
}

function createWildflowerBlossomGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const petalCount = 5;
  for (let i = 0; i < petalCount; i++) {
    const a = (i / petalCount) * Math.PI * 2;
    const petal = new THREE.SphereGeometry(0.024, 6, 4);
    petal.scale(1.15, 0.36, 0.72);
    petal.rotateY(a);
    petal.translate(Math.cos(a) * 0.028, 0.225, Math.sin(a) * 0.028);
    parts.push(petal);
  }
  const bud = new THREE.SphereGeometry(0.018, 6, 4);
  bud.scale(1, 0.65, 1);
  bud.translate(0, 0.228, 0);
  parts.push(bud);

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

function createSculptedRockGeometry(
  radius: number,
  detail: number,
  flattenY: number,
  seed: number,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const n =
      Math.sin(vx * 18.3 + seed) * 0.16 +
      Math.cos(vz * 21.7 - seed * 1.7) * 0.14 +
      Math.sin((vx + vy + vz) * 14.1 + seed * 0.5) * 0.12;
    const scale = 1 + n;
    const newY = vy < 0 ? vy * flattenY * 0.35 : vy * flattenY * scale;
    pos.setXYZ(i, vx * scale, newY, vz * scale);
  }
  geo.computeBoundingBox();
  const minY = geo.boundingBox!.min.y;
  geo.translate(0, -minY, 0);
  geo.computeVertexNormals();
  return geo;
}

function createDryShrubGeometry(): THREE.BufferGeometry {
  const branches: THREE.BufferGeometry[] = [];
  const specs = [
    { rx: 0.22, rz: 0.32, h: 0.26, r: 0.013, y: 0 },
    { rx: -0.35, rz: 0.2, h: 0.24, r: 0.012, y: 0 },
    { rx: 0.14, rz: -0.38, h: 0.28, r: 0.013, y: 0 },
    { rx: -0.25, rz: -0.26, h: 0.2, r: 0.011, y: 0 },
    { rx: 0.45, rz: 0.06, h: 0.17, r: 0.009, y: 0.04 },
    { rx: -0.1, rz: 0.48, h: 0.16, r: 0.009, y: 0.05 },
  ];

  for (const s of specs) {
    const twig = new THREE.CylinderGeometry(s.r * 0.35, s.r, s.h, 5);
    twig.translate(0, s.h * 0.5, 0);
    twig.rotateX(s.rx);
    twig.rotateZ(s.rz);
    twig.translate(0, s.y, 0);
    branches.push(twig);
  }

  const merged = mergeGeometries(branches, false);
  branches.forEach((b) => b.dispose());
  merged.computeVertexNormals();
  return merged;
}

function createSquareCliffTierGeometry(
  topHalfExtent: number,
  bottomHalfExtent: number,
  height: number,
  cragAmplitude: number,
  taperSquareToOctagon: number,
  seed: number,
): THREE.BufferGeometry {
  const radialSegs = 48;
  const heightSegs = 5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let iy = 0; iy <= heightSegs; iy++) {
    const v = iy / heightSegs;
    const y = (v - 0.5) * height;
    const halfExt = bottomHalfExtent + (topHalfExtent - bottomHalfExtent) * v;
    const roundness = (1 - v) * taperSquareToOctagon;

    for (let ix = 0; ix <= radialSegs; ix++) {
      const u = ix / radialSegs;
      const angle = u * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const maxAxis = Math.max(Math.abs(cosA), Math.abs(sinA));
      const sqX = cosA / maxAxis;
      const sqZ = sinA / maxAxis;
      const baseX = sqX * (1 - roundness) + cosA * roundness;
      const baseZ = sqZ * (1 - roundness) + sinA * roundness;

      const edgeMask = Math.pow(1 - v, 0.65);
      const ridge =
        Math.sin(angle * 8 + seed) * 0.42 +
        Math.cos(angle * 15 - v * 4.5 + seed * 1.4) * 0.34 +
        Math.sin(angle * 24 + v * 7.0) * 0.24;
      const strataLedge = Math.sin(v * Math.PI * 4.0) * 0.35;
      const disp = (ridge + strataLedge) * cragAmplitude * edgeMask;

      const x = baseX * halfExt + cosA * disp;
      const z = baseZ * halfExt + sinA * disp;
      const yWarp = y + Math.sin(angle * 9 + seed) * 0.16 * edgeMask;

      positions.push(x, yWarp, z);
      uvs.push(u * 4, v);
    }
  }

  const stride = radialSegs + 1;
  for (let iy = 0; iy < heightSegs; iy++) {
    for (let ix = 0; ix < radialSegs; ix++) {
      const a = iy * stride + ix;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const bottomCenterIdx = positions.length / 3;
  positions.push(0, -height * 0.5 - 0.35, 0);
  uvs.push(0.5, 0);
  for (let ix = 0; ix < radialSegs; ix++) {
    indices.push(bottomCenterIdx, ix, ix + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createAtmosphericSkyDome(sunDir: THREE.Vector3): THREE.Mesh {
  const skyGeo = new THREE.SphereGeometry(320, 48, 32);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uSunDir: { value: sunDir.clone().normalize() },
      uZenithColor: { value: new THREE.Color(0x526ea8) },
      uMidSkyColor: { value: new THREE.Color(0x98b0da) },
      uHorizonCoolColor: { value: new THREE.Color(0xb8c6de) },
      uHorizonWarmColor: { value: new THREE.Color(0xf6c397) },
      uRoseTintColor: { value: new THREE.Color(0xe69eb2) },
      uOceanMistColor: { value: new THREE.Color(0x6e8cb2) },
      uSunColor: { value: new THREE.Color(0xfff1cc) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uZenithColor;
      uniform vec3 uMidSkyColor;
      uniform vec3 uHorizonCoolColor;
      uniform vec3 uHorizonWarmColor;
      uniform vec3 uRoseTintColor;
      uniform vec3 uOceanMistColor;
      uniform vec3 uSunColor;
      varying vec3 vWorldDir;

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = dir.y;
        float sunDot = max(dot(dir, uSunDir), 0.0);
        float sunAzimuth = pow(clamp(dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z))) * 0.5 + 0.5, 0.0, 1.0), 1.6);

        vec3 horizonCol = mix(uHorizonCoolColor, uRoseTintColor, smoothstep(0.15, 0.65, sunAzimuth));
        horizonCol = mix(horizonCol, uHorizonWarmColor, smoothstep(0.42, 0.96, sunAzimuth));

        vec3 col;
        if (h >= 0.0) {
          float tMid = smoothstep(0.0, 0.28, h);
          float tZen = smoothstep(0.18, 0.82, h);
          vec3 midCol = mix(uMidSkyColor, uRoseTintColor * 0.96 + vec3(0.06), smoothstep(0.45, 0.98, sunAzimuth) * 0.35);
          col = mix(horizonCol, midCol, tMid);
          col = mix(col, uZenithColor, tZen);
        } else {
          float tVoid = smoothstep(0.0, -0.35, h);
          vec3 lowMist = mix(uOceanMistColor, horizonCol * 0.85, sunAzimuth * 0.55);
          col = mix(horizonCol, lowMist, tVoid);
        }

        // Warm sunset halo & subtle radial sunbeam rays from back-right sun
        float horizonBand = pow(1.0 - min(abs(h), 1.0), 3.6);
        float horizonGlow = horizonBand * pow(sunDot, 1.8);
        float solarHalo = pow(sunDot, 10.0) * 0.34 + pow(sunDot, 140.0) * 0.72;

        vec3 sunRight = normalize(cross(vec3(0.0, 1.0, 0.0), uSunDir));
        vec3 sunUp = cross(uSunDir, sunRight);
        float rayAng = atan(dot(dir, sunUp), dot(dir, sunRight));
        float rays = (0.5 + 0.5 * sin(rayAng * 9.0 + 0.4)) * 0.6 + (0.5 + 0.5 * cos(rayAng * 17.0 - 1.1)) * 0.4;
        float rayMask = pow(sunDot, 4.5) * smoothstep(-0.04, 0.35, h) * (1.0 - smoothstep(0.35, 0.85, h));

        col += uSunColor * (horizonGlow * 0.24 + solarHalo + rays * rayMask * 0.16);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const skyMesh = new THREE.Mesh(skyGeo, skyMat);
  skyMesh.name = 'AtmosphericSkyDome';
  return skyMesh;
}

function populateInstancedMesh(
  mesh: THREE.InstancedMesh,
  instances: MicroDetailInstance[],
  arenaHalfSize: number,
  alignToTerrain = false,
): void {
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i];
    if (alignToTerrain) {
      computeTerrainNormal(inst.x, inst.z, arenaHalfSize, _normal);
      _quat.setFromUnitVectors(_up, _normal);
      _euler.set(inst.rotX, inst.rotY, inst.rotZ);
      _tiltQuat.setFromEuler(_euler);
      _quat.multiply(_tiltQuat);
      _dummy.quaternion.copy(_quat);
      _dummy.position.set(
        inst.x + _normal.x * 0.025,
        inst.y + _normal.y * 0.025,
        inst.z + _normal.z * 0.025,
      );
    } else {
      _dummy.position.set(inst.x, inst.y, inst.z);
      _dummy.rotation.set(inst.rotX, inst.rotY, inst.rotZ);
    }
    _dummy.scale.set(inst.scaleX, inst.scaleY, inst.scaleZ);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
    _color.setHex(inst.tintHex);
    mesh.setColorAt(i, _color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

export function createSharedArenaEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): SharedArenaEnvironment {
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Environment Reflections (RoomEnvironment + PMREMGenerator)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envRenderTarget.texture;
  scene.environmentIntensity = 0.48;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // 2. Procedural Golden-Sunset Sky Dome & Horizon Fog (sun positioned back-right +X, -Z)
  const sunDir = new THREE.Vector3(0.76, 0.31, -0.57).normalize();

  const skyDome = createAtmosphericSkyDome(sunDir);
  scene.add(skyDome);
  disposables.push(skyDome.geometry, skyDome.material as THREE.Material);

  scene.fog = new THREE.FogExp2(0xc4b8c6, 0.00165);

  // 3. Physically Balanced 3-Point Golden-Hour Lighting
  const sunLight = new THREE.DirectionalLight(0xffdfb0, 2.45);
  sunLight.position.copy(sunDir).multiplyScalar(68);
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight.target);
  scene.add(sunLight);

  if (!isSoftwareGl) {
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 155;
    const d = 28;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.00045;
    sunLight.shadow.normalBias = 0.024;
    sunLight.shadow.radius = 2.4;
  }

  const hemiLight = new THREE.HemisphereLight(0xa3c4f5, 0x6b5647, 0.94);
  hemiLight.position.set(0, 44, 0);
  scene.add(hemiLight);

  const rimLight = new THREE.DirectionalLight(0xa8c8f8, 0.48);
  rimLight.position.set(-sunDir.x * 48, 22, -sunDir.z * 48);
  scene.add(rimLight);

  // 4. Procedural PBR Textures
  const textures = createArenaTextureLibrary(renderer);

  return {
    textures,
    envRenderTarget,
    sunLight,
    dispose: () => {
      textures.dispose();
      envRenderTarget.dispose();
      disposables.forEach((d) => d.dispose());
    },
  };
}

export function buildSaveItArena(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  options: BuildArenaOptions = {},
): BuiltArenaResources {
  const arenaSpan = options.arenaSpan ?? ARENA_SPAN;
  const arenaHalfSize = arenaSpan * 0.5;
  const terrainSegments = options.terrainSegments ?? TERRAIN_SEGMENTS;
  const areaScale = (arenaSpan / ARENA_SPAN) ** 2;
  const ownsSharedEnv = !options.sharedEnv;
  const sharedEnv = options.sharedEnv ?? createSharedArenaEnvironment(scene, renderer, isSoftwareGl);

  const arenaRoot = new THREE.Group();
  arenaRoot.name = 'SaveItArenaRoot';
  scene.add(arenaRoot);

  const disposables: Array<{ dispose: () => void }> = [];
  const { textures, envRenderTarget, sunLight } = sharedEnv;

  if (!isSoftwareGl) {
    const d = Math.max(22, arenaHalfSize * 1.38);
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.camera.updateProjectionMatrix();
  }

  // 5. Continuous Sculpted Organic Dual-Biome Terrain (Normal Rolling Floor — No Square Tiles)
  const terrainSim = new TerrainSimulation(arenaSpan, terrainSegments);
  const terrainGeo = createContinuousTerrainGeometry(terrainSim);
  const terrainMat = createContinuousTerrainMaterial(textures);
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.name = 'ContinuousDualBiomeTerrain';
  terrainMesh.castShadow = !isSoftwareGl;
  terrainMesh.receiveShadow = !isSoftwareGl;
  arenaRoot.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // 6. Generate Deterministic Ecosystem (Trees + Micro-Details)
  const eco: ArenaEcosystemData = buildArenaEcosystem(
    options.seed ?? 20261117,
    arenaHalfSize,
    options.spawnAvoidPoints,
  );

  const treeFadeUniforms: TreeFadeUniforms = {
    uTreePlayerPos: { value: new THREE.Vector3(0, 0, 0) },
    uTreeCamPos: { value: new THREE.Vector3(0, 10, 20) },
    uTreeFadeEnabled: { value: 0 },
  };
  const windUniforms: WindUniforms = {
    uWindTime: { value: 0 },
  };

  const applyTreeSeeThroughShader = (
    mat: THREE.MeshStandardMaterial,
    minVisibility: number,
    windSwayAmp: number,
    cacheKey: string,
  ) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTreePlayerPos = treeFadeUniforms.uTreePlayerPos;
      shader.uniforms.uTreeCamPos = treeFadeUniforms.uTreeCamPos;
      shader.uniforms.uTreeFadeEnabled = treeFadeUniforms.uTreeFadeEnabled;
      shader.uniforms.uTreeMinVis = { value: minVisibility };
      shader.uniforms.uWindTime = windUniforms.uWindTime;
      shader.uniforms.uTreeWindAmp = { value: windSwayAmp };

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform float uWindTime;
          uniform float uTreeWindAmp;
          varying vec3 vTreeWorldPos;
          varying vec3 vTreeOriginWorld;
          `,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          float treeHeightFactor = smoothstep(0.45, 3.6, transformed.y);
          float treePhase = 0.0;
          #ifdef USE_INSTANCING
            treePhase = instanceMatrix[3][0] * 0.43 + instanceMatrix[3][2] * 0.37;
          #endif
          float breezeWave = sin(uWindTime * 1.45 + treePhase) + 0.35 * sin(uWindTime * 2.9 + treePhase * 1.7 + transformed.y * 0.8);
          float breezeCross = cos(uWindTime * 1.15 + treePhase * 1.3);
          transformed.x += breezeWave * uTreeWindAmp * treeHeightFactor;
          transformed.z += breezeCross * uTreeWindAmp * 0.55 * treeHeightFactor;
          `,
        )
        .replace(
          '#include <project_vertex>',
          /* glsl */ `
          #include <project_vertex>
          vec4 stWorldPos = vec4( transformed, 1.0 );
          vec4 stTreeOrigin = vec4( 0.0, 0.0, 0.0, 1.0 );
          #ifdef USE_INSTANCING
            stWorldPos = instanceMatrix * stWorldPos;
            stTreeOrigin = instanceMatrix * stTreeOrigin;
          #endif
          vTreeWorldPos = ( modelMatrix * stWorldPos ).xyz;
          vTreeOriginWorld = ( modelMatrix * stTreeOrigin ).xyz;
          `,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform vec3 uTreePlayerPos;
          uniform vec3 uTreeCamPos;
          uniform float uTreeFadeEnabled;
          uniform float uTreeMinVis;
          varying vec3 vTreeWorldPos;
          varying vec3 vTreeOriginWorld;

          float treeBayer4(vec2 coord) {
            int ix = int(mod(coord.x, 4.0));
            int iy = int(mod(coord.y, 4.0));
            int idx = ix + iy * 4;
            if (idx == 0) return 0.5 / 16.0;
            if (idx == 1) return 8.5 / 16.0;
            if (idx == 2) return 2.5 / 16.0;
            if (idx == 3) return 10.5 / 16.0;
            if (idx == 4) return 12.5 / 16.0;
            if (idx == 5) return 4.5 / 16.0;
            if (idx == 6) return 14.5 / 16.0;
            if (idx == 7) return 6.5 / 16.0;
            if (idx == 8) return 3.5 / 16.0;
            if (idx == 9) return 11.5 / 16.0;
            if (idx == 10) return 1.5 / 16.0;
            if (idx == 11) return 9.5 / 16.0;
            if (idx == 12) return 15.5 / 16.0;
            if (idx == 13) return 7.5 / 16.0;
            if (idx == 14) return 13.5 / 16.0;
            return 5.5 / 16.0;
          }
          `,
        )
        .replace(
          '#include <alphatest_fragment>',
          /* glsl */ `
          #include <alphatest_fragment>
          if (uTreeFadeEnabled > 0.5) {
            float dPlayerTree = length(vTreeOriginWorld.xz - uTreePlayerPos.xz);
            float nearTree = 1.0 - smoothstep(1.8, 4.4, dPlayerTree);

            float dPlayerFrag = length(vTreeWorldPos.xz - uTreePlayerPos.xz);
            float nearFrag = 1.0 - smoothstep(1.6, 3.8, dPlayerFrag);

            vec3 playerFocus = uTreePlayerPos + vec3(0.0, 1.35, 0.0);
            vec3 seg = playerFocus - uTreeCamPos;
            float segLenSq = max(dot(seg, seg), 0.0001);
            float tSeg = clamp(dot(vTreeWorldPos - uTreeCamPos, seg) / segLenSq, 0.0, 1.0);
            vec3 closestPt = uTreeCamPos + seg * tSeg;
            float distToSight = length(vTreeWorldPos - closestPt);
            float camBlocking = (1.0 - smoothstep(1.0, 2.35, distToSight)) * step(0.02, tSeg) * (1.0 - step(0.98, tSeg));

            float nearCam = 1.0 - smoothstep(1.2, 3.2, length(vTreeWorldPos - uTreeCamPos));

            float fadeAmt = max(max(nearTree, nearFrag), max(camBlocking, nearCam));
            float visibility = mix(1.0, uTreeMinVis, clamp(fadeAmt, 0.0, 1.0));
            if (visibility < 0.995 && visibility < treeBayer4(gl_FragCoord.xy)) {
              discard;
            }
          }
          `,
        );
    };
    mat.customProgramCacheKey = () => cacheKey;
  };

  // 7. Multi-Part 3D Trees — Lush Green Meadow Trees & Dry Gnarled Desert Trees
  const oakBarkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.bark.map,
    bumpMap: textures.bark.bumpMap,
    bumpScale: 0.055,
    roughnessMap: textures.bark.roughnessMap,
    roughness: 0.94,
    metalness: 0.02,
  });
  const birchBarkMat = new THREE.MeshStandardMaterial({
    color: 0xeae2d2,
    map: textures.bark.map,
    bumpMap: textures.bark.bumpMap,
    bumpScale: 0.032,
    roughnessMap: textures.bark.roughnessMap,
    roughness: 0.88,
    metalness: 0.02,
  });
  const dryBarkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.dryBark.map,
    bumpMap: textures.dryBark.bumpMap,
    bumpScale: 0.065,
    roughnessMap: textures.dryBark.roughnessMap,
    roughness: 0.95,
    metalness: 0.02,
  });
  const lushCanopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.foliageLeaf.map,
    alphaMap: textures.foliageLeaf.alphaMap,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.02,
  });
  const dryCanopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.dryFoliage.map,
    alphaMap: textures.dryFoliage.alphaMap,
    alphaTest: 0.44,
    side: THREE.DoubleSide,
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.01,
  });

  applyTreeSeeThroughShader(oakBarkMat, 0.22, 0.068, 'save-it-tree-bark-fade-wind-v2');
  applyTreeSeeThroughShader(birchBarkMat, 0.22, 0.08, 'save-it-tree-bark-fade-wind-v2');
  applyTreeSeeThroughShader(dryBarkMat, 0.22, 0.045, 'save-it-tree-bark-fade-wind-v2');
  applyTreeSeeThroughShader(lushCanopyMat, 0.12, 0.22, 'save-it-tree-canopy-fade-wind-v2');
  applyTreeSeeThroughShader(dryCanopyMat, 0.12, 0.13, 'save-it-tree-canopy-fade-wind-v2');

  disposables.push(oakBarkMat, birchBarkMat, dryBarkMat, lushCanopyMat, dryCanopyMat);

  const oakTrees = eco.meadowTrees.filter((t) => t.style === 'lush_oak');
  const birchTrees = eco.meadowTrees.filter((t) => t.style === 'lush_birch');
  const deadwoodTrees = eco.desertTrees.filter((t) => t.style === 'dry_deadwood');
  const acaciaTrees = eco.desertTrees.filter((t) => t.style === 'dry_acacia');

  let oakTrunkMesh: THREE.InstancedMesh | undefined;
  let oakCanopyMesh: THREE.InstancedMesh | undefined;
  if (oakTrees.length > 0) {
    const oak = createLushOakGeometries();
    oakTrunkMesh = new THREE.InstancedMesh(oak.trunk, oakBarkMat, oakTrees.length);
    oakTrunkMesh.name = 'MeadowOakTrunks';
    oakTrunkMesh.castShadow = !isSoftwareGl;
    oakTrunkMesh.receiveShadow = !isSoftwareGl;

    oakCanopyMesh = new THREE.InstancedMesh(oak.canopy, lushCanopyMat, oakTrees.length);
    oakCanopyMesh.name = 'MeadowOakCanopies';
    oakCanopyMesh.castShadow = !isSoftwareGl;
    oakCanopyMesh.receiveShadow = !isSoftwareGl;

    arenaRoot.add(oakTrunkMesh, oakCanopyMesh);
    disposables.push(oak.trunk, oak.canopy);
  }

  let birchTrunkMesh: THREE.InstancedMesh | undefined;
  let birchCanopyMesh: THREE.InstancedMesh | undefined;
  if (birchTrees.length > 0) {
    const birch = createLushBirchGeometries();
    birchTrunkMesh = new THREE.InstancedMesh(birch.trunk, birchBarkMat, birchTrees.length);
    birchTrunkMesh.name = 'MeadowBirchTrunks';
    birchTrunkMesh.castShadow = !isSoftwareGl;
    birchTrunkMesh.receiveShadow = !isSoftwareGl;

    birchCanopyMesh = new THREE.InstancedMesh(birch.canopy, lushCanopyMat, birchTrees.length);
    birchCanopyMesh.name = 'MeadowBirchCanopies';
    birchCanopyMesh.castShadow = !isSoftwareGl;
    birchCanopyMesh.receiveShadow = !isSoftwareGl;

    arenaRoot.add(birchTrunkMesh, birchCanopyMesh);
    disposables.push(birch.trunk, birch.canopy);
  }

  let deadMesh: THREE.InstancedMesh | undefined;
  let deadLushCanopyMesh: THREE.InstancedMesh | undefined;
  if (deadwoodTrees.length > 0) {
    const deadGeo = createDryDeadwoodGeometry();
    deadMesh = new THREE.InstancedMesh(deadGeo, dryBarkMat, deadwoodTrees.length);
    deadMesh.name = 'DesertDeadwoodTrees';
    deadMesh.castShadow = !isSoftwareGl;
    deadMesh.receiveShadow = !isSoftwareGl;

    const deadLushGeo = createDeadwoodLushCanopyGeometry();
    deadLushCanopyMesh = new THREE.InstancedMesh(
      deadLushGeo,
      lushCanopyMat,
      deadwoodTrees.length,
    );
    deadLushCanopyMesh.name = 'DesertDeadwoodLushCanopies';
    deadLushCanopyMesh.castShadow = !isSoftwareGl;
    deadLushCanopyMesh.receiveShadow = !isSoftwareGl;

    arenaRoot.add(deadMesh, deadLushCanopyMesh);
    disposables.push(deadGeo, deadLushGeo);
  }

  let acaciaTrunkMesh: THREE.InstancedMesh | undefined;
  let acaciaDryCanopyMesh: THREE.InstancedMesh | undefined;
  let acaciaLushCanopyMesh: THREE.InstancedMesh | undefined;
  if (acaciaTrees.length > 0) {
    const acacia = createDryAcaciaGeometries();
    acaciaTrunkMesh = new THREE.InstancedMesh(acacia.trunk, dryBarkMat, acaciaTrees.length);
    acaciaTrunkMesh.name = 'DesertAcaciaTrunks';
    acaciaTrunkMesh.castShadow = !isSoftwareGl;
    acaciaTrunkMesh.receiveShadow = !isSoftwareGl;

    acaciaDryCanopyMesh = new THREE.InstancedMesh(
      acacia.canopy,
      dryCanopyMat,
      acaciaTrees.length,
    );
    acaciaDryCanopyMesh.name = 'DesertAcaciaDryCanopies';
    acaciaDryCanopyMesh.castShadow = !isSoftwareGl;
    acaciaDryCanopyMesh.receiveShadow = !isSoftwareGl;

    acaciaLushCanopyMesh = new THREE.InstancedMesh(
      acacia.canopy,
      lushCanopyMat,
      acaciaTrees.length,
    );
    acaciaLushCanopyMesh.name = 'DesertAcaciaLushCanopies';
    acaciaLushCanopyMesh.castShadow = !isSoftwareGl;
    acaciaLushCanopyMesh.receiveShadow = !isSoftwareGl;

    arenaRoot.add(acaciaTrunkMesh, acaciaDryCanopyMesh, acaciaLushCanopyMesh);
    disposables.push(acacia.trunk, acacia.canopy);
  }

  const trees = new DynamicTreeManager({
    oakTrees,
    oakTrunks: oakTrunkMesh,
    oakCanopies: oakCanopyMesh,
    birchTrees,
    birchTrunks: birchTrunkMesh,
    birchCanopies: birchCanopyMesh,
    deadwoodTrees,
    deadwoodTrunks: deadMesh,
    deadwoodLushCanopies: deadLushCanopyMesh,
    acaciaTrees,
    acaciaTrunks: acaciaTrunkMesh,
    acaciaDryCanopies: acaciaDryCanopyMesh,
    acaciaLushCanopies: acaciaLushCanopyMesh,
  });

  // 8. Dynamic Instanced 3D Vegetation (Pre-Allocated Pools for Water Growth & Fire Burn)
  const maxGrassPool = Math.max(MAX_GRASS_INSTANCES, Math.round(MAX_GRASS_INSTANCES * areaScale));
  const maxFlowerPool = Math.max(MAX_FLOWER_INSTANCES, Math.round(MAX_FLOWER_INSTANCES * areaScale));

  const applyVegetationWindShader = (
    mat: THREE.MeshStandardMaterial,
    swayAmp: number,
    heightScale: number,
    cacheKey: string,
  ) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = windUniforms.uWindTime;
      shader.uniforms.uVegWindAmp = { value: swayAmp };
      shader.uniforms.uVegHeightScale = { value: heightScale };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform float uWindTime;
          uniform float uVegWindAmp;
          uniform float uVegHeightScale;
          `,
        )
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `
          #include <begin_vertex>
          float vegHeightFactor = clamp(transformed.y / uVegHeightScale, 0.0, 1.35);
          float vegWX = 0.0;
          float vegWZ = 0.0;
          #ifdef USE_INSTANCING
            vegWX = instanceMatrix[3][0];
            vegWZ = instanceMatrix[3][2];
          #endif
          float gust = sin(uWindTime * 2.25 + vegWX * 0.45 + vegWZ * 0.34)
                     + 0.42 * sin(uWindTime * 4.1 + vegWX * 0.92 - vegWZ * 0.68);
          float crossGust = cos(uWindTime * 1.85 + vegWX * 0.35 - vegWZ * 0.48);
          transformed.x += gust * uVegWindAmp * vegHeightFactor * vegHeightFactor;
          transformed.z += crossGust * uVegWindAmp * 0.52 * vegHeightFactor * vegHeightFactor;
          `,
        );
    };
    mat.customProgramCacheKey = () => cacheKey;
  };

  const grassGeo = createGrassTuftGeometry();
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  applyVegetationWindShader(grassMat, 0.10, 0.24, 'save-it-grass-wind-v1');
  const grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, maxGrassPool);
  grassMesh.name = 'MeadowGrassTufts';
  grassMesh.castShadow = !isSoftwareGl;
  grassMesh.receiveShadow = !isSoftwareGl;
  arenaRoot.add(grassMesh);
  disposables.push(grassGeo, grassMat);

  const stemGeo = createWildflowerStemGeometry();
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x4f7d32,
    roughness: 0.74,
    metalness: 0.02,
  });
  applyVegetationWindShader(stemMat, 0.085, 0.26, 'save-it-stem-wind-v1');
  const stemMesh = new THREE.InstancedMesh(stemGeo, stemMat, maxFlowerPool);
  stemMesh.name = 'MeadowFlowerStems';
  stemMesh.castShadow = !isSoftwareGl;
  arenaRoot.add(stemMesh);

  const blossomGeo = createWildflowerBlossomGeometry();
  const blossomMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.52,
    metalness: 0.04,
  });
  applyVegetationWindShader(blossomMat, 0.085, 0.26, 'save-it-blossom-wind-v1');
  const blossomMesh = new THREE.InstancedMesh(blossomGeo, blossomMat, maxFlowerPool);
  blossomMesh.name = 'MeadowFlowerBlossoms';
  arenaRoot.add(blossomMesh);
  disposables.push(stemGeo, stemMat, blossomGeo, blossomMat);

  const allTreePlacements = [...eco.meadowTrees, ...eco.desertTrees];
  const vegetation = new DynamicVegetationManager(
    grassMesh,
    stemMesh,
    blossomMesh,
    eco.grassTufts,
    eco.wildflowers,
    allTreePlacements,
    arenaHalfSize,
    maxGrassPool,
    maxFlowerPool,
  );
  const treeObstacles = allTreePlacements.map((t) => ({
    x: t.x,
    z: t.z,
    radius: 0.62 * t.scale,
  }));

  const mossyStoneGeo = createSculptedRockGeometry(0.155, 1, 0.72, 19.3);
  const mossyStoneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stone.map,
    bumpMap: textures.stone.bumpMap,
    bumpScale: 0.035,
    roughnessMap: textures.stone.roughnessMap,
    roughness: 0.88,
    metalness: 0.04,
  });
  const mossyStoneMesh = new THREE.InstancedMesh(
    mossyStoneGeo,
    mossyStoneMat,
    Math.max(1, eco.mossyStones.length),
  );
  mossyStoneMesh.name = 'MeadowMossyStones';
  mossyStoneMesh.castShadow = !isSoftwareGl;
  mossyStoneMesh.receiveShadow = !isSoftwareGl;
  populateInstancedMesh(mossyStoneMesh, eco.mossyStones, arenaHalfSize);
  arenaRoot.add(mossyStoneMesh);
  disposables.push(mossyStoneGeo, mossyStoneMat);

  // 9. Instanced 3D Micro-Details — Right Half (Arid Sahara Desert)
  const crackedGeo = new THREE.PlaneGeometry(0.84, 0.84);
  crackedGeo.rotateX(-Math.PI / 2);
  const crackedMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.crackedEarth.map,
    bumpMap: textures.crackedEarth.bumpMap,
    bumpScale: 0.04,
    alphaMap: textures.crackedEarth.alphaMap,
    transparent: true,
    depthWrite: false,
    roughness: 0.94,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const crackedMesh = new THREE.InstancedMesh(
    crackedGeo,
    crackedMat,
    Math.max(1, eco.crackedPatches.length),
  );
  crackedMesh.name = 'DesertCrackedEarthPatches';
  crackedMesh.receiveShadow = !isSoftwareGl;
  populateInstancedMesh(crackedMesh, eco.crackedPatches, arenaHalfSize, true);
  arenaRoot.add(crackedMesh);
  disposables.push(crackedGeo, crackedMat);

  const desertRockGeo = createSculptedRockGeometry(0.145, 1, 0.68, 42.7);
  const desertRockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: textures.stone.map,
    bumpMap: textures.stone.bumpMap,
    bumpScale: 0.04,
    roughnessMap: textures.stone.roughnessMap,
    roughness: 0.86,
    metalness: 0.05,
  });
  const desertRockMesh = new THREE.InstancedMesh(
    desertRockGeo,
    desertRockMat,
    Math.max(1, eco.desertRocks.length),
  );
  desertRockMesh.name = 'DesertRocks';
  desertRockMesh.castShadow = !isSoftwareGl;
  desertRockMesh.receiveShadow = !isSoftwareGl;
  populateInstancedMesh(desertRockMesh, eco.desertRocks, arenaHalfSize);
  arenaRoot.add(desertRockMesh);
  disposables.push(desertRockGeo, desertRockMat);

  const dryShrubGeo = createDryShrubGeometry();
  const dryShrubMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.01,
  });
  const dryShrubMesh = new THREE.InstancedMesh(
    dryShrubGeo,
    dryShrubMat,
    Math.max(1, eco.dryShrubs.length),
  );
  dryShrubMesh.name = 'DesertDryShrubs';
  dryShrubMesh.castShadow = !isSoftwareGl;
  dryShrubMesh.receiveShadow = !isSoftwareGl;
  populateInstancedMesh(dryShrubMesh, eco.dryShrubs, arenaHalfSize);
  arenaRoot.add(dryShrubMesh);
  disposables.push(dryShrubGeo, dryShrubMat);

  // 10. Polished Arena Border Trim (Weathered Stone Curbs + Brushed Bronze Rails + Corner Bastions)
  const borderGroup = new THREE.Group();
  borderGroup.name = 'ArenaBorderTrim';
  arenaRoot.add(borderGroup);

  const stoneTrimMat = new THREE.MeshStandardMaterial({
    color: 0xa49e93,
    map: textures.stone.map,
    bumpMap: textures.stone.bumpMap,
    bumpScale: 0.045,
    roughnessMap: textures.stone.roughnessMap,
    roughness: 0.94,
    metalness: 0.01,
    envMapIntensity: 0.22,
  });
  const brushedMetalMat = new THREE.MeshStandardMaterial({
    color: 0x7e6d56,
    map: textures.metalTrim.map,
    bumpMap: textures.metalTrim.bumpMap,
    bumpScale: 0.018,
    roughnessMap: textures.metalTrim.roughnessMap,
    metalness: 0.34,
    roughness: 0.68,
    envMapIntensity: 0.26,
  });
  const plinthStoneMat = new THREE.MeshStandardMaterial({
    color: 0xa49e93,
    map: textures.stone.map.clone(),
    bumpMap: textures.stone.bumpMap.clone(),
    bumpScale: 0.04,
    roughnessMap: textures.stone.roughnessMap.clone(),
    roughness: 0.94,
    metalness: 0.01,
    envMapIntensity: 0.22,
  });
  plinthStoneMat.map!.repeat.set(1, 1);
  plinthStoneMat.bumpMap!.repeat.set(1, 1);
  plinthStoneMat.roughnessMap!.repeat.set(1, 1);
  plinthStoneMat.map!.needsUpdate = true;
  plinthStoneMat.bumpMap!.needsUpdate = true;
  plinthStoneMat.roughnessMap!.needsUpdate = true;

  const meadowBedMat = new THREE.MeshStandardMaterial({
    color: 0x3b4a2b,
    roughness: 0.96,
    metalness: 0.02,
  });
  const desertBedMat = new THREE.MeshStandardMaterial({
    color: 0xa6895d,
    roughness: 0.94,
    metalness: 0.02,
  });
  disposables.push(
    stoneTrimMat,
    plinthStoneMat,
    plinthStoneMat.map!,
    plinthStoneMat.bumpMap!,
    plinthStoneMat.roughnessMap!,
    brushedMetalMat,
    meadowBedMat,
    desertBedMat,
  );

  // Foundation bed tucked neatly beneath continuous terrain hollows (even when scorched to -0.30)
  const halfBedGeo = new THREE.BoxGeometry(arenaSpan * 0.5 + 0.6, 1.4, arenaSpan + 1.2);
  const meadowBedMesh = new THREE.Mesh(halfBedGeo, meadowBedMat);
  meadowBedMesh.position.set(-arenaSpan * 0.25 - 0.15, -1.12, 0);
  meadowBedMesh.receiveShadow = !isSoftwareGl;

  const desertBedMesh = new THREE.Mesh(halfBedGeo, desertBedMat);
  desertBedMesh.position.set(arenaSpan * 0.25 + 0.15, -1.12, 0);
  desertBedMesh.receiveShadow = !isSoftwareGl;
  borderGroup.add(meadowBedMesh, desertBedMesh);
  disposables.push(halfBedGeo);

  const arenaHalf = arenaHalfSize;
  const curbWidth = 1.36;
  const curbHeight = 1.58;
  const curbOffset = arenaHalf + curbWidth * 0.5 - 0.04;
  const curbLength = arenaSpan + curbWidth * 2 - 0.04;

  const curbNSGeo = new RoundedBoxGeometry(curbLength, curbHeight, curbWidth, 3, 0.11);
  const curbEWGeo = new RoundedBoxGeometry(curbWidth, curbHeight, arenaSpan + 0.06, 3, 0.11);
  disposables.push(curbNSGeo, curbEWGeo);

  const curbPositions: Array<[number, number, number, THREE.BufferGeometry]> = [
    [0, -0.35, -curbOffset, curbNSGeo],
    [0, -0.35, curbOffset, curbNSGeo],
    [-curbOffset, -0.35, 0, curbEWGeo],
    [curbOffset, -0.35, 0, curbEWGeo],
  ];
  for (const [cx, cy, cz, geo] of curbPositions) {
    const curb = new THREE.Mesh(geo, stoneTrimMat);
    curb.position.set(cx, cy, cz);
    curb.castShadow = !isSoftwareGl;
    curb.receiveShadow = !isSoftwareGl;
    borderGroup.add(curb);
  }

  const railThickness = 0.18;
  const railHeight = 0.22;
  const innerRailOffset = arenaHalf + 0.05;
  const outerRailOffset = arenaHalf + curbWidth - 0.12;
  const railNSGeo = new RoundedBoxGeometry(arenaSpan + 0.24, railHeight, railThickness, 2, 0.03);
  const railEWGeo = new RoundedBoxGeometry(railThickness, railHeight, arenaSpan + 0.24, 2, 0.03);
  const outerRailNSGeo = new RoundedBoxGeometry(curbLength + 0.04, railHeight, railThickness, 2, 0.03);
  const outerRailEWGeo = new RoundedBoxGeometry(railThickness, railHeight, curbLength - 0.16, 2, 0.03);
  disposables.push(railNSGeo, railEWGeo, outerRailNSGeo, outerRailEWGeo);

  const railSpecs: Array<[number, number, number, THREE.BufferGeometry]> = [
    [0, 0.42, -innerRailOffset, railNSGeo],
    [0, 0.42, innerRailOffset, railNSGeo],
    [-innerRailOffset, 0.42, 0, railEWGeo],
    [innerRailOffset, 0.42, 0, railEWGeo],
    [0, 0.42, -outerRailOffset, outerRailNSGeo],
    [0, 0.42, outerRailOffset, outerRailNSGeo],
    [-outerRailOffset, 0.42, 0, outerRailEWGeo],
    [outerRailOffset, 0.42, 0, outerRailEWGeo],
  ];
  for (const [rx, ry, rz, geo] of railSpecs) {
    const rail = new THREE.Mesh(geo, brushedMetalMat);
    rail.position.set(rx, ry, rz);
    rail.castShadow = !isSoftwareGl;
    rail.receiveShadow = !isSoftwareGl;
    borderGroup.add(rail);
  }

  const plinthBaseGeo = new RoundedBoxGeometry(1.98, 1.98, 1.98, 3, 0.14);
  const plinthCapGeo = new RoundedBoxGeometry(1.42, 0.26, 1.42, 3, 0.06);
  const plinthFinialGeo = new THREE.CylinderGeometry(0.28, 0.44, 0.34, 8);
  disposables.push(plinthBaseGeo, plinthCapGeo, plinthFinialGeo);

  const corners = [
    [-curbOffset, -curbOffset],
    [curbOffset, -curbOffset],
    [-curbOffset, curbOffset],
    [curbOffset, curbOffset],
  ];
  for (const [cx, cz] of corners) {
    const cornerGroup = new THREE.Group();
    cornerGroup.position.set(cx, 0, cz);

    const base = new THREE.Mesh(plinthBaseGeo, plinthStoneMat);
    base.position.y = -0.24;
    base.castShadow = !isSoftwareGl;
    base.receiveShadow = !isSoftwareGl;

    const cap = new THREE.Mesh(plinthCapGeo, brushedMetalMat);
    cap.position.y = 0.78;
    cap.castShadow = !isSoftwareGl;
    cap.receiveShadow = !isSoftwareGl;

    const finial = new THREE.Mesh(plinthFinialGeo, brushedMetalMat);
    finial.position.y = 1.04;
    finial.castShadow = !isSoftwareGl;

    cornerGroup.add(base, cap, finial);
    borderGroup.add(cornerGroup);
  }

  const dividerGeo = new RoundedBoxGeometry(0.42, 0.24, 1.46, 2, 0.04);
  disposables.push(dividerGeo);
  for (const dz of [-curbOffset, curbOffset]) {
    const marker = new THREE.Mesh(dividerGeo, brushedMetalMat);
    marker.position.set(0, 0.44, dz);
    marker.castShadow = !isSoftwareGl;
    borderGroup.add(marker);
  }

  // 11. Layered Cliff / Rocky Floating Island Base Underneath (scaled proportionally with arenaSpan)
  const islandScale = arenaSpan / ARENA_SPAN;
  const islandGroup = new THREE.Group();
  islandGroup.name = 'FloatingIslandBase';
  arenaRoot.add(islandGroup);

  const cliffMat = new THREE.MeshStandardMaterial({
    color: 0xd2c8ba,
    map: textures.cliff.map,
    bumpMap: textures.cliff.bumpMap,
    bumpScale: 0.14,
    roughnessMap: textures.cliff.roughnessMap,
    roughness: 0.92,
    metalness: 0.04,
  });
  const deepCliffMat = new THREE.MeshStandardMaterial({
    color: 0xa49f9b,
    map: textures.cliff.map,
    bumpMap: textures.cliff.bumpMap,
    bumpScale: 0.16,
    roughnessMap: textures.cliff.roughnessMap,
    roughness: 0.95,
    metalness: 0.05,
  });
  disposables.push(cliffMat, deepCliffMat);

  const upperTierGeo = createSquareCliffTierGeometry(
    21.25 * islandScale,
    16.4 * islandScale,
    5.2 * islandScale,
    1.15 * islandScale,
    0.3,
    11.2,
  );
  const upperTier = new THREE.Mesh(upperTierGeo, cliffMat);
  upperTier.position.set(0, -1.12 - 2.6 * islandScale, 0);
  upperTier.castShadow = !isSoftwareGl;
  upperTier.receiveShadow = !isSoftwareGl;
  islandGroup.add(upperTier);

  const midTierGeo = createSquareCliffTierGeometry(
    16.8 * islandScale,
    10.4 * islandScale,
    5.6 * islandScale,
    1.55 * islandScale,
    0.7,
    29.4,
  );
  const midTier = new THREE.Mesh(midTierGeo, cliffMat);
  midTier.position.set(0, -1.12 - 7.28 * islandScale, 0);
  midTier.castShadow = !isSoftwareGl;
  midTier.receiveShadow = !isSoftwareGl;
  islandGroup.add(midTier);

  const lowerTierGeo = createSquareCliffTierGeometry(
    10.8 * islandScale,
    1.9 * islandScale,
    6.4 * islandScale,
    1.35 * islandScale,
    0.95,
    53.7,
  );
  const lowerTier = new THREE.Mesh(lowerTierGeo, deepCliffMat);
  lowerTier.position.set(0, -1.12 - 12.48 * islandScale, 0);
  lowerTier.receiveShadow = !isSoftwareGl;
  islandGroup.add(lowerTier);
  disposables.push(upperTierGeo, midTierGeo, lowerTierGeo);

  const cragGeo = createSculptedRockGeometry(1.45, 1, 2.2, 77.1);
  cragGeo.computeBoundingBox();
  const cragMaxY = cragGeo.boundingBox!.max.y;
  cragGeo.translate(0, -cragMaxY, 0);

  const cragCount = 20;
  const cragMesh = new THREE.InstancedMesh(cragGeo, cliffMat, cragCount);
  cragMesh.name = 'IslandCliffButtresses';
  cragMesh.castShadow = !isSoftwareGl;
  cragMesh.receiveShadow = !isSoftwareGl;

  for (let i = 0; i < cragCount; i++) {
    const a = (i / cragCount) * Math.PI * 2 + 0.14;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    const maxAxis = Math.max(Math.abs(cosA), Math.abs(sinA));
    const baseExtent = (14.2 + (i % 3) * 1.4) * islandScale;
    const px = (cosA / maxAxis) * baseExtent * 0.55 + cosA * baseExtent * 0.45;
    const pz = (sinA / maxAxis) * baseExtent * 0.55 + sinA * baseExtent * 0.45;
    const scaleH = (1.05 + (i % 4) * 0.28) * islandScale;
    _dummy.position.set(px, -1.55 - (i % 3) * 0.85 * islandScale, pz);
    _dummy.rotation.set(0.14 * Math.sin(i), a + 0.4, 0.14 * Math.cos(i));
    _dummy.scale.set(
      (1.65 + (i % 2) * 0.45) * islandScale,
      scaleH,
      (1.55 + (i % 3) * 0.35) * islandScale,
    );
    _dummy.updateMatrix();
    cragMesh.setMatrixAt(i, _dummy.matrix);
    _color.setHex(i % 2 === 0 ? 0xd9cfc2 : 0xc1b8ae);
    cragMesh.setColorAt(i, _color);
  }
  cragMesh.instanceMatrix.needsUpdate = true;
  if (cragMesh.instanceColor) cragMesh.instanceColor.needsUpdate = true;
  cragMesh.computeBoundingSphere();
  islandGroup.add(cragMesh);
  disposables.push(cragGeo);

  // 12. Subtle Floating Golden Atmospheric Dust Motes
  const dustCount = Math.round(240 * Math.max(0.8, areaScale));
  const dustPositions = new Float32Array(dustCount * 3);
  const dustExtent = arenaSpan + 2;
  for (let i = 0; i < dustCount; i++) {
    const px = ((i * 73) % 100) / 100 - 0.5;
    const pz = ((i * 137) % 100) / 100 - 0.5;
    const py = ((i * 53) % 100) / 100;
    dustPositions[i * 3] = px * dustExtent;
    dustPositions[i * 3 + 1] = 0.6 + py * 7.5;
    dustPositions[i * 3 + 2] = pz * dustExtent;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    size: 0.22,
    map: textures.dustSprite,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  dustPoints.name = 'AtmosphericDustMotes';
  arenaRoot.add(dustPoints);
  disposables.push(dustGeo, dustMat);

  // 13. Detailed Modern Sky-Island Surroundings, Corner Stadium Pylons & Volumetric Clouds
  const surroundings = buildArenaSurroundings(arenaRoot, arenaSpan, textures, isSoftwareGl);

  return {
    arenaRoot,
    arenaSpan,
    arenaHalfSize,
    terrainMesh,
    terrainSim,
    vegetation,
    trees,
    surroundings,
    treeObstacles,
    treeFadeUniforms,
    windUniforms,
    syncTerrain: (stepResult: TerrainStepResult) => syncTerrainGeometry(terrainGeo, terrainSim, stepResult),
    sunLight,
    dustPoints,
    textures,
    envRenderTarget,
    dispose: () => {
      surroundings.dispose();
      scene.remove(arenaRoot);
      if (ownsSharedEnv) {
        sharedEnv.dispose();
      }
      disposables.forEach((d) => d.dispose());
    },
  };
}
