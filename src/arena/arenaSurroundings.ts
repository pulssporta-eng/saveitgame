import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ArenaTextureLibrary } from './proceduralTextures';
import { mulberry32 } from './terrainMath';

export interface ArenaSurroundingsController {
  update: (elapsed: number) => void;
  dispose: () => void;
}

interface CloudMotionSpec {
  baseAngle: number;
  radius: number;
  baseY: number;
  speed: number;
  bobAmp: number;
  bobPhase: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  yaw: number;
}

function createCurvedEcoFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Sleek cyan-azure curtain wall glass base reflecting the sunset sky
  const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bgGrad.addColorStop(0, '#9be4fa');
  bgGrad.addColorStop(0.35, '#4da8d4');
  bgGrad.addColorStop(0.75, '#2b6f99');
  bgGrad.addColorStop(1, '#1d4d6e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Diagonal warm sky reflection shimmer across glass facade
  const reflGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height * 0.7);
  reflGrad.addColorStop(0, 'rgba(255, 240, 224, 0.06)');
  reflGrad.addColorStop(0.38, 'rgba(255, 232, 206, 0.34)');
  reflGrad.addColorStop(0.55, 'rgba(186, 235, 255, 0.16)');
  reflGrad.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
  ctx.fillStyle = reflGrad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fine architectural curtain-wall mullions & sleek silver floor bands
  const cols = 16;
  const rows = 20;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;

  for (let c = 0; c < cols; c++) {
    ctx.fillStyle = 'rgba(215, 235, 248, 0.38)';
    ctx.fillRect(c * cellW, 0, 2, canvas.height);
  }

  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = '#e8f1fa';
    ctx.fillRect(0, r * cellH, canvas.width, 4);
    ctx.fillStyle = 'rgba(15, 45, 72, 0.45)';
    ctx.fillRect(0, r * cellH + 4, canvas.width, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createForgeArmorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#403532';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rows = 14;
  const cols = 6;
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;
  const rng = mulberry32(9917);

  for (let r = 0; r < rows; r++) {
    ctx.fillStyle = '#241d1d';
    ctx.fillRect(0, r * cellH, canvas.width, 4);
    for (let c = 0; c < cols; c++) {
      const px = c * cellW + 3;
      const py = r * cellH + 5;
      const pw = cellW - 6;
      const ph = cellH - 7;
      const tone = rng();
      ctx.fillStyle = tone > 0.65 ? '#66534b' : tone > 0.3 ? '#4f413c' : '#382f2c';
      ctx.fillRect(px, py, pw, ph);

      ctx.fillStyle = 'rgba(255, 206, 162, 0.14)';
      ctx.fillRect(px, py, pw, 2);

      if (rng() > 0.88) {
        ctx.fillStyle = '#fb923c';
        ctx.fillRect(px + pw * 0.3, py + ph * 0.35, pw * 0.4, 3);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function createLedFloodTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 128, 64);

  const cols = 8;
  const rows = 4;
  const cw = 128 / cols;
  const ch = 64 / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? '#f0fdff' : '#bae6fd';
      ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createWaterfallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, '#22d3ee');
  grad.addColorStop(0.22, '#7dd3fc');
  grad.addColorStop(0.5, '#f0fbff');
  grad.addColorStop(0.78, '#7dd3fc');
  grad.addColorStop(1, '#22d3ee');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const rng = mulberry32(7312);
  for (let i = 0; i < 190; i++) {
    const x = rng() * canvas.width;
    const y = rng() * canvas.height;
    const h = 18 + rng() * 52;
    const w = 1.5 + rng() * 3.5;
    ctx.fillStyle = rng() > 0.42 ? 'rgba(255, 255, 255, 0.72)' : 'rgba(186, 240, 255, 0.5)';
    ctx.fillRect(x, y, w, h);
    if (y + h > canvas.height) {
      ctx.fillRect(x, y - canvas.height, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createVolumetricCloudGeometry(seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed);
  const parts: THREE.BufferGeometry[] = [];
  const puffDefs = [
    { x: 0, y: 0.7, z: 0, rx: 3.1, ry: 1.55, rz: 2.3 },
    { x: -2.4, y: 0.35, z: 0.45, rx: 2.35, ry: 1.15, rz: 1.85 },
    { x: 2.5, y: 0.42, z: -0.35, rx: 2.45, ry: 1.25, rz: 1.9 },
    { x: 0.75, y: 1.25, z: 0.7, rx: 1.95, ry: 1.25, rz: 1.65 },
    { x: -1.15, y: 0.95, z: -0.7, rx: 1.9, ry: 1.1, rz: 1.55 },
    { x: 4.1, y: -0.1, z: 0.35, rx: 1.75, ry: 0.85, rz: 1.4 },
    { x: -3.9, y: -0.08, z: -0.25, rx: 1.7, ry: 0.85, rz: 1.4 },
    { x: 1.8, y: -0.18, z: 1.1, rx: 1.55, ry: 0.75, rz: 1.25 },
  ];

  // Warm peach-apricot tops and soft periwinkle-lavender undersides matching reference sky
  const topColor = new THREE.Color(0xffdec2);
  const midColor = new THREE.Color(0xf2d1dc);
  const bottomColor = new THREE.Color(0x9a9dc4);
  const tmpColor = new THREE.Color();

  for (const puff of puffDefs) {
    const g = new THREE.SphereGeometry(1, 12, 9);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const lump =
        1 +
        0.075 * Math.sin(vx * 3.3 + seed) * Math.cos(vz * 3.1) +
        0.03 * (rng() - 0.5);
      const px = vx * puff.rx * lump + puff.x;
      const ySquash = vy < 0 ? 0.46 : 1.05;
      const py = vy * puff.ry * ySquash * lump + puff.y;
      const pz = vz * puff.rz * lump + puff.z;
      pos.setXYZ(i, px, py, pz);

      const tShade = THREE.MathUtils.clamp((vy + 0.9) * 0.52, 0, 1);
      if (tShade < 0.5) {
        tmpColor.lerpColors(bottomColor, midColor, tShade * 2);
      } else {
        tmpColor.lerpColors(midColor, topColor, (tShade - 0.5) * 2);
      }
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    parts.push(g);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function createFloatingIslandRockGeometry(
  topRadiusX: number,
  topRadiusZ: number,
  height: number,
  sides: number,
  seed: number,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(1, 0.22, height, sides, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const tDown = THREE.MathUtils.clamp((height * 0.5 - y) / height, 0, 1);
    const angle = Math.atan2(z, x);
    const ledge =
      tDown > 0.06
        ? 1 +
          0.17 * Math.sin(angle * 5 + seed) +
          0.11 * Math.cos(y * 0.85 + angle * 3 - seed) +
          0.08 * Math.sin(tDown * Math.PI * 3.0)
        : 1 + 0.06 * Math.sin(angle * 4 + seed);
    pos.setX(i, x * topRadiusX * ledge);
    pos.setZ(i, z * topRadiusZ * ledge);
  }
  geo.computeVertexNormals();
  return geo;
}

function createCurvedOvalTowerGeometry(w: number, d: number, h: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, w * 0.5, d * 0.5, 0, Math.PI * 2, false, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: 0.12,
    bevelSegments: 2,
    curveSegments: 18,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function createCanyonRockClusterGeometry(
  baseR: number,
  height: number,
  isFlatMesa: boolean,
  seed: number,
): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tiers = isFlatMesa ? 3 : 4;
  for (let t = 0; t < tiers; t++) {
    const frac = t / tiers;
    const tierH = height * (isFlatMesa ? 0.38 : 0.34);
    const rTop = baseR * (1 - frac * (isFlatMesa ? 0.22 : 0.32)) * (isFlatMesa ? 0.92 : 0.58);
    const rBot = baseR * (1 - frac * (isFlatMesa ? 0.18 : 0.26));
    const g = new THREE.CylinderGeometry(rTop, rBot, tierH, 6 + (t % 2), 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const py = pos.getY(i);
      const pz = pos.getZ(i);
      const ang = Math.atan2(pz, px);
      const crag = 1 + 0.22 * Math.sin(ang * 3 + seed + t) + 0.12 * Math.cos(py * 1.4 - seed);
      pos.setX(i, px * crag);
      pos.setZ(i, pz * crag);
    }
    g.rotateY(seed + t * 0.55);
    g.translate(
      Math.sin(seed + t * 1.7) * baseR * 0.14,
      frac * height * 0.72 + tierH * 0.5,
      Math.cos(seed + t * 1.9) * baseR * 0.14,
    );
    g.computeVertexNormals();
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  return merged;
}

export function buildArenaSurroundings(
  arenaRoot: THREE.Group,
  arenaSpan: number,
  textures: ArenaTextureLibrary,
  isSoftwareGl: boolean,
): ArenaSurroundingsController {
  const disposables: Array<{ dispose: () => void }> = [];
  const half = arenaSpan * 0.5;
  const scale = half / 20;

  const surrGroup = new THREE.Group();
  surrGroup.name = 'ArenaSunsetOceanSurroundings';
  arenaRoot.add(surrGroup);

  const uWaterTime = { value: 0 };

  // -------------------------------------------------------------------------
  // Shared Textures & Materials
  // -------------------------------------------------------------------------
  const ecoFacadeTex = createCurvedEcoFacadeTexture();
  const forgeArmorTex = createForgeArmorTexture();
  const ledFloodTex = createLedFloodTexture();
  const waterfallTex = createWaterfallTexture();
  disposables.push(ecoFacadeTex, forgeArmorTex, ledFloodTex, waterfallTex);

  const whiteRibMat = new THREE.MeshStandardMaterial({
    color: 0xeef4fb,
    roughness: 0.28,
    metalness: 0.34,
  });
  const silverTrimMat = new THREE.MeshStandardMaterial({
    color: 0xc5d2e3,
    roughness: 0.28,
    metalness: 0.52,
  });
  const darkSlateMat = new THREE.MeshStandardMaterial({
    color: 0x2b3342,
    roughness: 0.44,
    metalness: 0.56,
  });
  const ecoGlassMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: ecoFacadeTex,
    roughness: 0.14,
    metalness: 0.52,
    envMapIntensity: 1.1,
  });
  const cyanGlowMat = new THREE.MeshStandardMaterial({
    color: 0x5cc4d8,
    emissive: 0x0e7490,
    emissiveIntensity: 0.32,
    roughness: 0.24,
    metalness: 0.25,
  });
  const cyanBridgeGlassMat = new THREE.MeshStandardMaterial({
    color: 0x5ec6db,
    emissive: 0x0e7490,
    emissiveIntensity: 0.15,
    transparent: true,
    opacity: 0.34,
    roughness: 0.2,
    metalness: 0.18,
    side: THREE.DoubleSide,
  });
  const ecoTurfMat = new THREE.MeshStandardMaterial({
    color: 0x56a844,
    map: textures.meadow.map,
    bumpMap: textures.meadow.bumpMap,
    bumpScale: 0.04,
    roughness: 0.84,
    metalness: 0.02,
  });
  const lagoonPoolMat = new THREE.MeshStandardMaterial({
    color: 0x2299b5,
    emissive: 0x063f52,
    emissiveIntensity: 0.12,
    roughness: 0.16,
    metalness: 0.3,
  });
  const islandRockMat = new THREE.MeshStandardMaterial({
    color: 0x6e655e,
    map: textures.cliff.map,
    bumpMap: textures.cliff.bumpMap,
    bumpScale: 0.1,
    roughness: 0.92,
    metalness: 0.04,
  });
  const sandstoneCliffMat = new THREE.MeshStandardMaterial({
    color: 0xc97b49,
    map: textures.cliff.map,
    bumpMap: textures.cliff.bumpMap,
    bumpScale: 0.14,
    roughness: 0.88,
    metalness: 0.03,
  });
  const sandstoneTopMat = new THREE.MeshStandardMaterial({
    color: 0xe3a872,
    map: textures.sand.map,
    roughness: 0.86,
    metalness: 0.02,
  });
  const forgeBodyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: forgeArmorTex,
    roughness: 0.38,
    metalness: 0.54,
  });
  const forgeBronzeMat = new THREE.MeshStandardMaterial({
    color: 0x735d52,
    roughness: 0.42,
    metalness: 0.56,
  });
  const forgeDarkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x272225,
    roughness: 0.38,
    metalness: 0.66,
  });
  const moltenOrangeMat = new THREE.MeshStandardMaterial({
    color: 0xff942e,
    emissive: 0xff5200,
    emissiveIntensity: 1.65,
    roughness: 0.24,
    metalness: 0.18,
  });
  const ledFaceMat = new THREE.MeshStandardMaterial({
    color: 0xeaf6fc,
    map: ledFloodTex,
    emissive: 0x99d9ea,
    emissiveMap: ledFloodTex,
    emissiveIntensity: 0.52,
    roughness: 0.24,
    metalness: 0.1,
  });

  disposables.push(
    whiteRibMat,
    silverTrimMat,
    darkSlateMat,
    ecoGlassMat,
    cyanGlowMat,
    cyanBridgeGlassMat,
    ecoTurfMat,
    lagoonPoolMat,
    islandRockMat,
    sandstoneCliffMat,
    sandstoneTopMat,
    forgeBodyMat,
    forgeBronzeMat,
    forgeDarkSteelMat,
    moltenOrangeMat,
    ledFaceMat,
  );

  // -------------------------------------------------------------------------
  // 1. Vast Glistening Cerulean Sunset Ocean Surface (y = -28)
  // -------------------------------------------------------------------------
  const oceanGeo = new THREE.CircleGeometry(460, 64);
  oceanGeo.rotateX(-Math.PI / 2);
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x1a5485,
    roughness: 0.24,
    metalness: 0.36,
    envMapIntensity: 0.62,
  });
  oceanMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = uWaterTime;
    shader.uniforms.uSunDir = { value: new THREE.Vector3(0.76, 0.31, -0.57).normalize() };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vOceanWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vOceanWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uWaterTime;
         uniform vec3 uSunDir;
         varying vec3 vOceanWorldPos;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         vec2 wp = vOceanWorldPos.xz;
         float w1 = sin(wp.x * 0.42 + wp.y * 0.28 + uWaterTime * 1.15);
         float w2 = cos(wp.y * 0.56 - wp.x * 0.31 - uWaterTime * 0.95);
         float w3 = sin((wp.x * 0.85 - wp.y * 0.72) + cos(wp.x * 0.25) * 1.8 + uWaterTime * 1.45) * 0.6;
         float waveCrest = clamp((w1 + w2 + w3) * 0.22 + 0.5, 0.0, 1.0);
         vec3 deepSea = vec3(0.06, 0.22, 0.42);
         vec3 midSea = vec3(0.14, 0.38, 0.58);
         diffuseColor.rgb = mix(deepSea, midSea, waveCrest);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         float rWave = sin(vOceanWorldPos.x * 0.85 + uWaterTime * 1.4) * cos(vOceanWorldPos.z * 0.75 - uWaterTime * 1.2);
         roughnessFactor = clamp(0.14 + rWave * 0.06, 0.08, 0.28);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         vec3 viewDirW = normalize(cameraPosition - vOceanWorldPos);
         vec3 waveN = normalize(vec3(
           sin(vOceanWorldPos.x * 0.95 + vOceanWorldPos.z * 0.45 + uWaterTime * 1.5) * 0.10,
           1.0,
           cos(vOceanWorldPos.z * 0.88 - vOceanWorldPos.x * 0.38 - uWaterTime * 1.3) * 0.10
         ));
         vec3 halfV = normalize(uSunDir + viewDirW);
         float sunSpec = pow(max(dot(waveN, halfV), 0.0), 42.0);
         float sunTrack = pow(max(dot(waveN, halfV), 0.0), 7.5);
         float fresnel = pow(1.0 - max(dot(viewDirW, vec3(0.0, 1.0, 0.0)), 0.0), 3.0);
         totalEmissiveRadiance += vec3(1.0, 0.78, 0.52) * (sunSpec * 0.34 + sunTrack * 0.08);
         totalEmissiveRadiance += vec3(0.24, 0.44, 0.68) * fresnel * 0.06;`,
      );
  };
  oceanMat.customProgramCacheKey = () => 'save-it-sunset-ocean-v4';

  const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
  oceanMesh.name = 'SunsetOceanSurface';
  oceanMesh.position.y = -28;
  surrGroup.add(oceanMesh);
  disposables.push(oceanGeo, oceanMat);

  // -------------------------------------------------------------------------
  // 2. Arena Translucent Cyan Energy Perimeter Barrier & 4 Side Floodlight Towers
  // -------------------------------------------------------------------------
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x4db8cc,
    emissive: 0x0c5f73,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.14,
    roughness: 0.18,
    metalness: 0.1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const barrierRimMat = new THREE.MeshStandardMaterial({
    color: 0x7dd3e8,
    emissive: 0x0e7490,
    emissiveIntensity: 0.34,
    transparent: true,
    opacity: 0.56,
    roughness: 0.2,
  });
  disposables.push(barrierMat, barrierRimMat);

  const barrierHeight = 1.4;
  const barrierSpan = arenaSpan - 0.35;
  const barrierOffset = half + 0.48;
  const barrierNSGeo = new THREE.PlaneGeometry(barrierSpan, barrierHeight);
  const barrierEWGeo = new THREE.PlaneGeometry(barrierSpan, barrierHeight);
  barrierEWGeo.rotateY(Math.PI / 2);
  const rimNSGeo = new THREE.BoxGeometry(barrierSpan, 0.08, 0.08);
  const rimEWGeo = new THREE.BoxGeometry(0.08, 0.08, barrierSpan);
  disposables.push(barrierNSGeo, barrierEWGeo, rimNSGeo, rimEWGeo);

  const barrierSpecs: Array<[number, number, THREE.BufferGeometry, THREE.BufferGeometry]> = [
    [0, -barrierOffset, barrierNSGeo, rimNSGeo],
    [0, barrierOffset, barrierNSGeo, rimNSGeo],
    [-barrierOffset, 0, barrierEWGeo, rimEWGeo],
    [barrierOffset, 0, barrierEWGeo, rimEWGeo],
  ];
  for (const [bx, bz, wallGeo, topRimGeo] of barrierSpecs) {
    const wall = new THREE.Mesh(wallGeo, barrierMat);
    wall.position.set(bx, 0.54 + barrierHeight * 0.5, bz);
    const topRim = new THREE.Mesh(topRimGeo, barrierRimMat);
    topRim.position.set(bx, 0.54 + barrierHeight, bz);
    const baseRim = new THREE.Mesh(topRimGeo, barrierRimMat);
    baseRim.position.set(bx, 0.54, bz);
    surrGroup.add(wall, topRim, baseRim);
  }

  // 4 Sleek Side-Midpoint Stadium Floodlight Pylons (tucked outside the stone curb)
  const podRockGeo = createFloatingIslandRockGeometry(1.45, 1.45, 3.0, 8, 13.7);
  const podCapGeo = new THREE.CylinderGeometry(1.4, 1.58, 0.48, 8);
  const floodBaseGeo = new THREE.CylinderGeometry(0.68, 0.95, 1.3, 8);
  const floodMastGeo = new THREE.BoxGeometry(0.36, 5.4, 0.56);
  const floodStrutGeo = new THREE.BoxGeometry(0.2, 4.2, 0.24);
  const floodHeadFrameGeo = new THREE.BoxGeometry(2.35, 0.78, 0.6);
  const floodLedPlaneGeo = new THREE.PlaneGeometry(2.1, 0.56);
  disposables.push(
    podRockGeo,
    podCapGeo,
    floodBaseGeo,
    floodMastGeo,
    floodStrutGeo,
    floodHeadFrameGeo,
    floodLedPlaneGeo,
  );

  const floodSideOffset = half + 2.6;
  const floodMounts: Array<[number, number, boolean, number]> = [
    [-floodSideOffset, -half * 0.18, true, 1.0],
    [0, -(half + 2.7), true, 1.0],
    [floodSideOffset, -half * 0.18, false, 1.0],
    [0, half + 2.5, false, 0.78],
  ];
  for (const [fx, fz, isHeroSide, hScale] of floodMounts) {
    const tower = new THREE.Group();
    tower.position.set(fx, -1.2, fz);
    tower.lookAt(0, -1.2, 0);

    const podRock = new THREE.Mesh(podRockGeo, isHeroSide ? islandRockMat : sandstoneCliffMat);
    podRock.position.y = -1.65;
    const podCap = new THREE.Mesh(podCapGeo, darkSlateMat);
    podCap.position.y = 0.02;

    const base = new THREE.Mesh(floodBaseGeo, silverTrimMat);
    base.position.y = 0.72;

    const mast = new THREE.Mesh(floodMastGeo, darkSlateMat);
    mast.scale.y = hScale;
    mast.position.set(0, 3.45 * hScale, 0.28);
    mast.rotation.x = 0.14;

    const strut = new THREE.Mesh(floodStrutGeo, silverTrimMat);
    strut.scale.y = hScale;
    strut.position.set(0, 2.95 * hScale, -0.12);
    strut.rotation.x = 0.22;

    const head = new THREE.Mesh(floodHeadFrameGeo, darkSlateMat);
    head.position.set(0, 6.05 * hScale, 0.92);
    head.rotation.x = 0.36;

    const ledPanel = new THREE.Mesh(floodLedPlaneGeo, ledFaceMat);
    ledPanel.position.set(0, 5.95 * hScale, 1.24);
    ledPanel.rotation.x = 0.36;

    tower.add(podRock, podCap, base, mast, strut, head, ledPanel);
    surrGroup.add(tower);
  }

  // -------------------------------------------------------------------------
  // Shared Foliage & Waterfall Helpers
  // -------------------------------------------------------------------------
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
  const waterfallFoamGeo = new THREE.CylinderGeometry(1.0, 1.38, 0.45, 12);
  disposables.push(boxGeo, cylGeo, waterfallFoamGeo);

  const waterfallMat = new THREE.MeshStandardMaterial({
    color: 0xe6f8ff,
    map: waterfallTex,
    emissive: 0x0e5e7a,
    emissiveIntensity: 0.14,
    transparent: true,
    opacity: 0.88,
    roughness: 0.2,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  waterfallMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = uWaterTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n varying vec2 vWfUv;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n vWfUv = uv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n uniform float uWaterTime;\n varying vec2 vWfUv;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         vec2 scrollUv = vec2(vWfUv.x, fract(vWfUv.y * 1.4 + uWaterTime * 1.4));
         vec4 wfSample = texture2D(map, scrollUv);
         float crestFoam = smoothstep(0.82, 1.0, vWfUv.y) * 0.52 + smoothstep(0.22, 0.0, vWfUv.y) * 0.62;
         diffuseColor.rgb = mix(wfSample.rgb, vec3(0.92, 0.97, 1.0), crestFoam);`,
      );
  };
  waterfallMat.customProgramCacheKey = () => 'save-it-waterfall-scroll-v4';

  const foamMat = new THREE.MeshStandardMaterial({
    color: 0xeef9ff,
    emissive: 0x67b6d6,
    emissiveIntensity: 0.1,
    transparent: true,
    opacity: 0.84,
    roughness: 0.65,
    metalness: 0.0,
  });
  disposables.push(waterfallMat, foamMat);

  const addWaterfall = (
    parent: THREE.Group,
    x: number,
    topY: number,
    z: number,
    width: number,
    dropHeight: number,
    rotY: number,
  ) => {
    const wfGroup = new THREE.Group();
    wfGroup.position.set(x, topY, z);
    wfGroup.rotation.y = rotY;

    const curtainGeo = new THREE.PlaneGeometry(width, dropHeight, 1, 6);
    const pos = curtainGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const py = pos.getY(i);
      const tDown = (dropHeight * 0.5 - py) / dropHeight;
      pos.setZ(i, Math.pow(Math.min(1, tDown * 1.4), 0.55) * (width * 0.36));
    }
    curtainGeo.computeVertexNormals();
    disposables.push(curtainGeo);

    const curtain = new THREE.Mesh(curtainGeo, waterfallMat);
    curtain.position.y = -dropHeight * 0.5;
    wfGroup.add(curtain);

    const topLip = new THREE.Mesh(waterfallFoamGeo, foamMat);
    topLip.scale.set(width * 0.54, 0.52, 0.54);
    topLip.position.set(0, -0.04, width * 0.12);
    wfGroup.add(topLip);

    const splashPool = new THREE.Mesh(waterfallFoamGeo, foamMat);
    splashPool.scale.set(width * 0.95, 0.86, 0.78);
    splashPool.position.set(0, -dropHeight + 0.15, width * 0.38);
    wfGroup.add(splashPool);

    parent.add(wfGroup);
  };

  const addCyanEnergyBridge = (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    width: number,
  ) => {
    const p1 = new THREE.Vector3(x1, y1, z1);
    const p2 = new THREE.Vector3(x2, y2, z2);
    const len = p1.distanceTo(p2);
    const mid = p1.clone().add(p2).multiplyScalar(0.5);

    const bridge = new THREE.Group();
    bridge.position.copy(mid);
    bridge.lookAt(p2);

    const deck = new THREE.Mesh(boxGeo, cyanBridgeGlassMat);
    deck.scale.set(width, 0.1, len);
    bridge.add(deck);

    for (const sx of [-width * 0.5, width * 0.5]) {
      const railTop = new THREE.Mesh(boxGeo, cyanGlowMat);
      railTop.scale.set(0.08, 0.08, len);
      railTop.position.set(sx, 0.34, 0);

      const railBottom = new THREE.Mesh(boxGeo, cyanGlowMat);
      railBottom.scale.set(0.08, 0.08, len);
      railBottom.position.set(sx, 0.03, 0);

      const glassWall = new THREE.Mesh(boxGeo, cyanBridgeGlassMat);
      glassWall.scale.set(0.04, 0.3, len);
      glassWall.position.set(sx, 0.18, 0);

      bridge.add(railTop, railBottom, glassWall);
    }

    surrGroup.add(bridge);
  };

  // Instanced lush green & pink cherry-blossom foliage clusters
  const shrubTransforms: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; hex: number }> = [];
  const shrubRng = mulberry32(82104);
  const addShrubCluster = (
    wx: number,
    wy: number,
    wz: number,
    count: number,
    spread: number,
    isBlossomMix: boolean,
  ) => {
    for (let i = 0; i < count; i++) {
      const a = shrubRng() * Math.PI * 2;
      const r = Math.sqrt(shrubRng()) * spread;
      const s = 0.52 + shrubRng() * 0.65;
      const isPink = isBlossomMix && shrubRng() > 0.5;
      const hex = isPink
        ? shrubRng() > 0.5
          ? 0xf472b6
          : 0xf9a8d4
        : shrubRng() > 0.5
          ? 0x3b8f28
          : 0x5ab840;
      shrubTransforms.push({
        x: wx + Math.cos(a) * r,
        y: wy + s * 0.42,
        z: wz + Math.sin(a) * r,
        sx: s * (0.95 + shrubRng() * 0.32),
        sy: s * (0.76 + shrubRng() * 0.32),
        sz: s * (0.95 + shrubRng() * 0.32),
        hex,
      });
    }
  };

  // -------------------------------------------------------------------------
  // 3. HERO LEFT (-X) SLEEK CURVED ECO-SKYSCRAPERS, TERRACES & WATERFALLS
  // -------------------------------------------------------------------------
  const addCurvedEcoTower = (
    parent: THREE.Group,
    worldOffsetX: number,
    worldOffsetY: number,
    worldOffsetZ: number,
    x: number,
    yBase: number,
    z: number,
    w: number,
    d: number,
    h: number,
    yaw: number,
  ) => {
    const tower = new THREE.Group();
    tower.position.set(x, yBase, z);
    tower.rotation.y = yaw;

    // 3 stepped curved glass curtain-wall tiers with protruding silver terrace balconies & recessed foliage
    const t1H = h * 0.38;
    const t2H = h * 0.34;
    const t3H = h * 0.28;
    const t1Geo = createCurvedOvalTowerGeometry(w, d, t1H);
    const t2Geo = createCurvedOvalTowerGeometry(w * 0.88, d * 0.88, t2H);
    const t3Geo = createCurvedOvalTowerGeometry(w * 0.76, d * 0.76, t3H);
    disposables.push(t1Geo, t2Geo, t3Geo);

    const t1Mesh = new THREE.Mesh(t1Geo, ecoGlassMat);
    const t2Mesh = new THREE.Mesh(t2Geo, ecoGlassMat);
    t2Mesh.position.y = t1H;
    const t3Mesh = new THREE.Mesh(t3Geo, ecoGlassMat);
    t3Mesh.position.y = t1H + t2H;
    tower.add(t1Mesh, t2Mesh, t3Mesh);

    const terraceHeights = [
      { y: t1H, rx: w * 0.56, rz: d * 0.56, shrubR: w * 0.36 },
      { y: t1H + t2H, rx: w * 0.5, rz: d * 0.5, shrubR: w * 0.31 },
    ];
    for (const th of terraceHeights) {
      const collar = new THREE.Mesh(cylGeo, whiteRibMat);
      collar.scale.set(th.rx, 0.42, th.rz);
      collar.position.y = th.y;
      const ledgeTurf = new THREE.Mesh(cylGeo, ecoTurfMat);
      ledgeTurf.scale.set(th.rx * 0.94, 0.24, th.rz * 0.94);
      ledgeTurf.position.y = th.y + 0.25;
      tower.add(collar, ledgeTurf);

      const wx = worldOffsetX + x;
      const wy = worldOffsetY + yBase + th.y + 0.36;
      const wz = worldOffsetZ + z;
      addShrubCluster(wx, wy, wz, 5, th.shrubR, false);
    }

    // Dual sculpted silver-white sail-fin spines framing the curved glass facade
    for (const side of [-1, 1]) {
      const sailSpine = new THREE.Mesh(cylGeo, whiteRibMat);
      sailSpine.scale.set(w * 0.12, h + 0.9, d * 0.44);
      sailSpine.position.set(side * w * 0.44, (h + 0.9) * 0.5, 0);
      tower.add(sailSpine);
    }

    // Slanted architectural sail-crown + rooftop living garden + cyan accent rim
    const crownCap = new THREE.Mesh(cylGeo, whiteRibMat);
    crownCap.scale.set(w * 0.43, 0.9, d * 0.43);
    crownCap.position.set(0, h + 0.32, 0);
    crownCap.rotation.z = 0.18;
    tower.add(crownCap);

    const roofGarden = new THREE.Mesh(cylGeo, ecoTurfMat);
    roofGarden.scale.set(w * 0.35, 0.26, d * 0.35);
    roofGarden.position.set(0, h + 0.82, 0);
    roofGarden.rotation.z = 0.18;
    tower.add(roofGarden);

    const skyBeacon = new THREE.Mesh(cylGeo, cyanGlowMat);
    skyBeacon.scale.set(w * 0.41, 0.14, d * 0.41);
    skyBeacon.position.set(0, h - 0.12, 0);
    tower.add(skyBeacon);

    addShrubCluster(
      worldOffsetX + x,
      worldOffsetY + yBase + h + 0.9,
      worldOffsetZ + z,
      4,
      w * 0.24,
      false,
    );

    parent.add(tower);
  };

  // 3A. Main West Hero Eco-Skyscraper Island
  const heroMainPos = { x: -(half + 12.2 * scale), y: -1.8, z: -2.2 * scale };
  const heroDistrict = new THREE.Group();
  heroDistrict.position.set(heroMainPos.x, heroMainPos.y, heroMainPos.z);
  surrGroup.add(heroDistrict);

  const heroMainRockGeo = createFloatingIslandRockGeometry(12.2 * scale, 13.6 * scale, 14.5, 14, 4.3);
  disposables.push(heroMainRockGeo);
  const heroMainRock = new THREE.Mesh(heroMainRockGeo, islandRockMat);
  heroMainRock.position.y = -7.3;
  heroDistrict.add(heroMainRock);

  const heroDeck = new THREE.Mesh(cylGeo, silverTrimMat);
  heroDeck.scale.set(12.1 * scale, 0.68, 13.4 * scale);
  heroDeck.position.y = 0.15;
  heroDistrict.add(heroDeck);

  const heroTurf = new THREE.Mesh(cylGeo, ecoTurfMat);
  heroTurf.scale.set(11.6 * scale, 0.4, 12.9 * scale);
  heroTurf.position.y = 0.54;
  heroDistrict.add(heroTurf);

  const mainLagoon = new THREE.Mesh(cylGeo, lagoonPoolMat);
  mainLagoon.scale.set(4.5 * scale, 0.2, 7.6 * scale);
  mainLagoon.position.set(5.4 * scale, 0.7, 1.0 * scale);
  heroDistrict.add(mainLagoon);

  // 3 Sleek Stepped Curved Eco-Skyscrapers framed comfortably inside top-left viewport
  addCurvedEcoTower(heroDistrict, heroMainPos.x, heroMainPos.y, heroMainPos.z, -3.5 * scale, 0.72, -4.4 * scale, 5.2, 3.8, 18.5, 0.26);
  addCurvedEcoTower(heroDistrict, heroMainPos.x, heroMainPos.y, heroMainPos.z, -1.2 * scale, 0.72, 1.6 * scale, 4.6, 3.5, 13.8, 0.18);
  addCurvedEcoTower(heroDistrict, heroMainPos.x, heroMainPos.y, heroMainPos.z, 1.5 * scale, 0.72, 6.2 * scale, 4.0, 3.2, 9.2, 0.12);

  addShrubCluster(heroMainPos.x + 3.8 * scale, heroMainPos.y + 0.72, heroMainPos.z - 5.4 * scale, 8, 3.0 * scale, true);
  addShrubCluster(heroMainPos.x + 2.5 * scale, heroMainPos.y + 0.72, heroMainPos.z + 7.5 * scale, 6, 2.8 * scale, false);
  addShrubCluster(heroMainPos.x - 5.6 * scale, heroMainPos.y + 0.72, heroMainPos.z + 3.2 * scale, 7, 2.9 * scale, true);

  addCyanEnergyBridge(
    heroMainPos.x - 3.4 * scale,
    heroMainPos.y + 10.6,
    heroMainPos.z - 4.2 * scale,
    heroMainPos.x - 1.2 * scale,
    heroMainPos.y + 9.4,
    heroMainPos.z + 1.6 * scale,
    0.85,
  );

  // 3B. Back-Left (-X, -Z) Waterfall Eco-Tower Island
  const heroBackPos = { x: -(half + 5.8 * scale), y: -0.9, z: -(half + 10.8 * scale) };
  const heroBackIsle = new THREE.Group();
  heroBackIsle.position.set(heroBackPos.x, heroBackPos.y, heroBackPos.z);
  surrGroup.add(heroBackIsle);

  const heroBackRockGeo = createFloatingIslandRockGeometry(8.8 * scale, 8.5 * scale, 13.0, 11, 19.2);
  disposables.push(heroBackRockGeo);
  const heroBackRock = new THREE.Mesh(heroBackRockGeo, islandRockMat);
  heroBackRock.position.y = -6.5;
  const heroBackTurf = new THREE.Mesh(cylGeo, ecoTurfMat);
  heroBackTurf.scale.set(8.6 * scale, 0.54, 8.3 * scale);
  heroBackTurf.position.y = 0.22;
  const heroBackPool = new THREE.Mesh(cylGeo, lagoonPoolMat);
  heroBackPool.scale.set(4.4 * scale, 0.18, 3.8 * scale);
  heroBackPool.position.set(2.0 * scale, 0.45, 3.4 * scale);
  heroBackIsle.add(heroBackRock, heroBackTurf, heroBackPool);

  addCurvedEcoTower(heroBackIsle, heroBackPos.x, heroBackPos.y, heroBackPos.z, -1.4 * scale, 0.48, -1.2 * scale, 4.4, 3.5, 13.5, -0.2);
  addShrubCluster(heroBackPos.x - 4.0 * scale, heroBackPos.y + 0.48, heroBackPos.z + 2.2 * scale, 7, 2.5 * scale, true);
  addWaterfall(heroBackIsle, 2.1 * scale, 0.38, 7.2 * scale, 2.8 * scale, 14.5, 0.14);

  addCyanEnergyBridge(
    heroBackPos.x - 1.4 * scale,
    heroBackPos.y + 8.6,
    heroBackPos.z - 1.2 * scale,
    heroMainPos.x - 3.5 * scale,
    heroMainPos.y + 10.8,
    heroMainPos.z - 4.4 * scale,
    0.85,
  );

  // 3C. Front-Left (-X, +Z) Stepped Eco-Terrace & Double-Waterfall Island
  const heroFrontPos = { x: -(half + 11.2 * scale), y: -1.9, z: half + 4.8 * scale };
  const heroFrontIsle = new THREE.Group();
  heroFrontIsle.position.set(heroFrontPos.x, heroFrontPos.y, heroFrontPos.z);
  surrGroup.add(heroFrontIsle);

  const hfUpperRockGeo = createFloatingIslandRockGeometry(9.6 * scale, 8.6 * scale, 12.5, 12, 31.4);
  const hfLowerRockGeo = createFloatingIslandRockGeometry(7.8 * scale, 7.4 * scale, 10.5, 10, 47.8);
  disposables.push(hfUpperRockGeo, hfLowerRockGeo);

  const hfUpperRock = new THREE.Mesh(hfUpperRockGeo, islandRockMat);
  hfUpperRock.position.set(1.0 * scale, -6.2, -1.2 * scale);
  const hfUpperTurf = new THREE.Mesh(cylGeo, ecoTurfMat);
  hfUpperTurf.scale.set(9.4 * scale, 0.52, 8.4 * scale);
  hfUpperTurf.position.set(1.0 * scale, 0.22, -1.2 * scale);

  const hfLowerRock = new THREE.Mesh(hfLowerRockGeo, islandRockMat);
  hfLowerRock.position.set(-2.5 * scale, -8.2, 4.2 * scale);
  const hfLowerTurf = new THREE.Mesh(cylGeo, ecoTurfMat);
  hfLowerTurf.scale.set(7.6 * scale, 0.48, 7.2 * scale);
  hfLowerTurf.position.set(-2.5 * scale, -3.0, 4.2 * scale);

  const hfPoolUpper = new THREE.Mesh(cylGeo, lagoonPoolMat);
  hfPoolUpper.scale.set(3.8 * scale, 0.18, 3.4 * scale);
  hfPoolUpper.position.set(3.0 * scale, 0.44, -0.2 * scale);

  const hfPoolLower = new THREE.Mesh(cylGeo, lagoonPoolMat);
  hfPoolLower.scale.set(3.8 * scale, 0.18, 3.3 * scale);
  hfPoolLower.position.set(-1.8 * scale, -2.75, 4.8 * scale);

  heroFrontIsle.add(hfUpperRock, hfUpperTurf, hfLowerRock, hfLowerTurf, hfPoolUpper, hfPoolLower);

  addCurvedEcoTower(heroFrontIsle, heroFrontPos.x, heroFrontPos.y, heroFrontPos.z, -4.2 * scale, 0.44, -2.0 * scale, 4.6, 3.4, 7.0, 0.42);
  addShrubCluster(heroFrontPos.x + 1.5 * scale, heroFrontPos.y + 0.48, heroFrontPos.z - 4.2 * scale, 8, 3.0 * scale, true);
  addShrubCluster(heroFrontPos.x - 1.0 * scale, heroFrontPos.y + 0.48, heroFrontPos.z + 2.4 * scale, 7, 2.8 * scale, true);
  addShrubCluster(heroFrontPos.x - 2.4 * scale, heroFrontPos.y - 2.7, heroFrontPos.z + 4.4 * scale, 8, 2.9 * scale, true);

  addWaterfall(heroFrontIsle, 4.2 * scale, 0.4, 3.8 * scale, 3.0 * scale, 15.5, 0.56);
  addWaterfall(heroFrontIsle, -0.8 * scale, -2.78, 9.8 * scale, 2.8 * scale, 14.5, 0.36);

  // Sleek cyan energy bridge connecting the arena's left edge directly to the Eco-Terrace
  addCyanEnergyBridge(
    -(half + 1.1),
    0.42,
    half * 0.44,
    heroFrontPos.x + 4.8 * scale,
    heroFrontPos.y + 0.56,
    heroFrontPos.z - 1.4 * scale,
    1.5,
  );
  addCyanEnergyBridge(
    heroFrontPos.x - 0.8 * scale,
    heroFrontPos.y + 0.56,
    heroFrontPos.z - 6.4 * scale,
    heroMainPos.x + 1.4 * scale,
    heroMainPos.y + 0.74,
    heroMainPos.z + 7.4 * scale,
    1.25,
  );

  // Populate instanced green & pink cherry-blossom shrubs
  const shrubGeo = new THREE.IcosahedronGeometry(0.64, 1);
  const shrubMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.02,
  });
  disposables.push(shrubGeo, shrubMat);
  const shrubInstanced = new THREE.InstancedMesh(shrubGeo, shrubMat, Math.max(1, shrubTransforms.length));
  shrubInstanced.name = 'HeroEcoBlossomShrubs';
  const dummy = new THREE.Object3D();
  const tmpColor = new THREE.Color();
  for (let i = 0; i < shrubTransforms.length; i++) {
    const s = shrubTransforms[i];
    dummy.position.set(s.x, s.y, s.z);
    dummy.rotation.set(0, i * 1.1, 0);
    dummy.scale.set(s.sx, s.sy, s.sz);
    dummy.updateMatrix();
    shrubInstanced.setMatrixAt(i, dummy.matrix);
    tmpColor.setHex(s.hex);
    shrubInstanced.setColorAt(i, tmpColor);
  }
  shrubInstanced.instanceMatrix.needsUpdate = true;
  if (shrubInstanced.instanceColor) shrubInstanced.instanceColor.needsUpdate = true;
  shrubInstanced.computeBoundingSphere();
  surrGroup.add(shrubInstanced);

  // -------------------------------------------------------------------------
  // 4. VILLAIN RIGHT (+X) TWIN FORGE TOWERS, REFINERY & CANYON MESAS
  // -------------------------------------------------------------------------
  const addCurvedCoolantPipe = (
    parent: THREE.Group,
    pts: THREE.Vector3[],
    radius: number,
  ) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const pipeGeo = new THREE.TubeGeometry(curve, 12, radius, 8, false);
    disposables.push(pipeGeo);
    const pipe = new THREE.Mesh(pipeGeo, forgeBronzeMat);
    parent.add(pipe);
  };

  const addHeavyForgeTower = (
    parent: THREE.Group,
    x: number,
    yBase: number,
    z: number,
    w: number,
    h: number,
    d: number,
  ) => {
    const fg = new THREE.Group();
    fg.position.set(x, yBase, z);

    const plinth = new THREE.Mesh(boxGeo, forgeDarkSteelMat);
    plinth.scale.set(w * 1.24, 2.0, d * 1.24);
    plinth.position.y = 1.0;
    fg.add(plinth);

    const hull = new THREE.Mesh(boxGeo, forgeBodyMat);
    hull.scale.set(w, h, d);
    hull.position.y = h * 0.5 + 1.0;
    fg.add(hull);

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const rib = new THREE.Mesh(boxGeo, forgeBronzeMat);
        rib.scale.set(w * 0.24, h * 0.92, d * 0.24);
        rib.position.set(sx * w * 0.44, h * 0.46 + 1.0, sz * d * 0.44);
        fg.add(rib);
      }
    }

    for (const fz of [-1, 1]) {
      const slit = new THREE.Mesh(boxGeo, moltenOrangeMat);
      slit.scale.set(w * 0.24, h * 0.66, 0.24);
      slit.position.set(0, h * 0.52 + 1.0, fz * (d * 0.5 + 0.04));
      fg.add(slit);
    }

    for (const sx of [-1, 1]) {
      addCurvedCoolantPipe(
        fg,
        [
          new THREE.Vector3(sx * w * 0.46, 4.4, 0),
          new THREE.Vector3(sx * w * 0.78, 3.6, d * 0.14),
          new THREE.Vector3(sx * w * 0.84, 1.8, d * 0.2),
          new THREE.Vector3(sx * w * 0.65, 0.4, d * 0.2),
        ],
        0.4,
      );
    }

    const crown = new THREE.Mesh(boxGeo, forgeDarkSteelMat);
    crown.scale.set(w * 1.12, 1.2, d * 1.12);
    crown.position.y = h + 1.3;
    fg.add(crown);

    const furnaceGlow = new THREE.Mesh(cylGeo, moltenOrangeMat);
    furnaceGlow.scale.set(w * 0.38, 0.85, d * 0.38);
    furnaceGlow.position.y = h + 1.98;
    fg.add(furnaceGlow);

    parent.add(fg);
  };

  const addCanyonRockClusters = (
    parent: THREE.Group,
    specs: Array<{ x: number; y: number; z: number; r: number; h: number; flatMesa: boolean; seed: number }>,
  ) => {
    for (const sp of specs) {
      const geo = createCanyonRockClusterGeometry(sp.r, sp.h, sp.flatMesa, sp.seed);
      disposables.push(geo);
      const mesh = new THREE.Mesh(geo, sandstoneCliffMat);
      mesh.position.set(sp.x, sp.y, sp.z);
      parent.add(mesh);
    }
  };

  // 4A. Back-Right (+X, -Z) Twin Geothermal Forge Towers Plateau Island
  const twinForgePos = { x: half + 8.8 * scale, y: -1.6, z: -(half + 11.2 * scale) };
  const twinForgeIsle = new THREE.Group();
  twinForgeIsle.position.set(twinForgePos.x, twinForgePos.y, twinForgePos.z);
  twinForgeIsle.rotation.y = -0.22;
  surrGroup.add(twinForgeIsle);

  const tfRockGeo = createFloatingIslandRockGeometry(12.6 * scale, 9.4 * scale, 14.0, 12, 61.3);
  disposables.push(tfRockGeo);
  const tfRock = new THREE.Mesh(tfRockGeo, sandstoneCliffMat);
  tfRock.position.y = -7.0;
  const tfCap = new THREE.Mesh(cylGeo, sandstoneTopMat);
  tfCap.scale.set(12.3 * scale, 0.64, 9.2 * scale);
  tfCap.position.y = 0.2;
  const tfPlatform = new THREE.Mesh(boxGeo, forgeDarkSteelMat);
  tfPlatform.scale.set(16.2 * scale, 0.8, 8.4 * scale);
  tfPlatform.position.y = 0.65;
  twinForgeIsle.add(tfRock, tfCap, tfPlatform);

  addHeavyForgeTower(twinForgeIsle, -4.2 * scale, 0.85, 0, 4.4, 13.5, 4.4);
  addHeavyForgeTower(twinForgeIsle, 4.2 * scale, 0.85, 0, 4.4, 13.5, 4.4);

  const forgeBridgeFrame = new THREE.Mesh(boxGeo, forgeDarkSteelMat);
  forgeBridgeFrame.scale.set(8.6 * scale, 1.35, 2.0);
  forgeBridgeFrame.position.set(0, 10.8, 0);
  const forgeBridgeGlow = new THREE.Mesh(boxGeo, moltenOrangeMat);
  forgeBridgeGlow.scale.set(8.2 * scale, 0.48, 2.12);
  forgeBridgeGlow.position.set(0, 10.8, 0);
  twinForgeIsle.add(forgeBridgeFrame, forgeBridgeGlow);

  addCanyonRockClusters(twinForgeIsle, [
    { x: -9.2 * scale, y: 0.2, z: -1.6 * scale, r: 2.1, h: 5.2, flatMesa: true, seed: 2.1 },
    { x: 9.0 * scale, y: 0.2, z: 2.0 * scale, r: 2.2, h: 5.8, flatMesa: false, seed: 4.6 },
  ]);

  // 4B. Mid-Right (+X) Red-Rock Sandstone Canyon Mesas & Spire Outcrops
  const canyonPos = { x: half + 15.8 * scale, y: -2.0, z: -1.2 * scale };
  const canyonIsle = new THREE.Group();
  canyonIsle.position.set(canyonPos.x, canyonPos.y, canyonPos.z);
  surrGroup.add(canyonIsle);

  const canyonRockGeo = createFloatingIslandRockGeometry(10.8 * scale, 11.4 * scale, 14.0, 11, 77.9);
  disposables.push(canyonRockGeo);
  const canyonRock = new THREE.Mesh(canyonRockGeo, sandstoneCliffMat);
  canyonRock.position.y = -7.0;
  const canyonTop = new THREE.Mesh(cylGeo, sandstoneTopMat);
  canyonTop.scale.set(10.5 * scale, 0.56, 11.0 * scale);
  canyonTop.position.y = 0.2;
  canyonIsle.add(canyonRock, canyonTop);

  addCanyonRockClusters(canyonIsle, [
    { x: -1.6 * scale, y: 0.3, z: -3.0 * scale, r: 2.9, h: 8.2, flatMesa: true, seed: 1.4 },
    { x: 2.8 * scale, y: 0.3, z: 1.8 * scale, r: 3.1, h: 9.8, flatMesa: false, seed: 3.2 },
    { x: 0.6 * scale, y: 0.3, z: -0.4 * scale, r: 2.3, h: 6.4, flatMesa: true, seed: 5.5 },
    { x: -3.6 * scale, y: 0.3, z: 3.2 * scale, r: 2.0, h: 5.0, flatMesa: false, seed: 7.1 },
    { x: 4.4 * scale, y: 0.3, z: -4.0 * scale, r: 1.9, h: 6.0, flatMesa: true, seed: 9.3 },
  ]);

  // 4C. Front-Right (+X, +Z) Heavy Industrial Refinery Fortress Island
  const refineryPos = { x: half + 11.8 * scale, y: -2.4, z: half + 6.5 * scale };
  const refineryIsle = new THREE.Group();
  refineryIsle.position.set(refineryPos.x, refineryPos.y, refineryPos.z);
  refineryIsle.rotation.y = -0.34;
  surrGroup.add(refineryIsle);

  const refRockGeo = createFloatingIslandRockGeometry(12.2 * scale, 11.0 * scale, 13.8, 12, 93.1);
  disposables.push(refRockGeo);
  const refRock = new THREE.Mesh(refRockGeo, sandstoneCliffMat);
  refRock.position.y = -6.9;
  const refCap = new THREE.Mesh(cylGeo, sandstoneTopMat);
  refCap.scale.set(12.0 * scale, 0.58, 10.8 * scale);
  refCap.position.y = 0.2;
  refineryIsle.add(refRock, refCap);

  const refDeck = new THREE.Mesh(boxGeo, forgeDarkSteelMat);
  refDeck.scale.set(12.0 * scale, 2.0, 9.8 * scale);
  refDeck.position.set(1.0 * scale, 1.2, 0.8 * scale);
  refineryIsle.add(refDeck);

  addHeavyForgeTower(refineryIsle, 1.2 * scale, 2.0, 0.8 * scale, 5.2, 10.2, 5.2);

  const sideBunker = new THREE.Mesh(boxGeo, forgeBronzeMat);
  sideBunker.scale.set(5.2 * scale, 4.2, 6.2 * scale);
  sideBunker.position.set(-3.4 * scale, 3.2, 1.6 * scale);
  const sideGlow = new THREE.Mesh(boxGeo, moltenOrangeMat);
  sideGlow.scale.set(0.3, 2.8, 2.0);
  sideGlow.position.set(-6.1 * scale, 3.4, 1.6 * scale);
  refineryIsle.add(sideBunker, sideGlow);

  addCanyonRockClusters(refineryIsle, [
    { x: -6.8 * scale, y: 0.3, z: -4.2 * scale, r: 2.4, h: 6.8, flatMesa: true, seed: 11.2 },
    { x: -4.6 * scale, y: 0.3, z: -6.0 * scale, r: 1.8, h: 4.4, flatMesa: false, seed: 14.4 },
    { x: 8.0 * scale, y: 0.3, z: -3.6 * scale, r: 2.0, h: 5.6, flatMesa: true, seed: 16.8 },
  ]);

  // -------------------------------------------------------------------------
  // 5. Soft Horizon Cumulus Sunset Clouds (no blobs under arena floor)
  // -------------------------------------------------------------------------
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0x7c6278,
    emissiveIntensity: 0.34,
    transparent: true,
    opacity: 0.9,
    roughness: 0.98,
    metalness: 0.0,
  });
  disposables.push(cloudMat);

  const highCloudGeoA = createVolumetricCloudGeometry(101);
  const highCloudGeoB = createVolumetricCloudGeometry(209);
  disposables.push(highCloudGeoA, highCloudGeoB);

  const cloudRng = mulberry32(202607);
  const highSpecsA: CloudMotionSpec[] = [];
  const highSpecsB: CloudMotionSpec[] = [];

  const highCountTotal = isSoftwareGl ? 32 : 44;
  for (let i = 0; i < highCountTotal; i++) {
    const spec: CloudMotionSpec = {
      baseAngle: (i / highCountTotal) * Math.PI * 2 + (cloudRng() - 0.5) * 0.2,
      radius: half + 98 + cloudRng() * 115,
      baseY: 2 + cloudRng() * 26,
      speed: 0.004 + cloudRng() * 0.007,
      bobAmp: 0.35 + cloudRng() * 0.55,
      bobPhase: cloudRng() * Math.PI * 2,
      scaleX: 5.0 + cloudRng() * 5.2,
      scaleY: 2.2 + cloudRng() * 1.9,
      scaleZ: 3.6 + cloudRng() * 3.4,
      yaw: cloudRng() * Math.PI * 2,
    };
    if (i % 2 === 0) highSpecsA.push(spec);
    else highSpecsB.push(spec);
  }

  const highCloudsA = new THREE.InstancedMesh(highCloudGeoA, cloudMat, highSpecsA.length);
  const highCloudsB = new THREE.InstancedMesh(highCloudGeoB, cloudMat, highSpecsB.length);
  highCloudsA.name = 'SkyVolumetricCloudsA';
  highCloudsB.name = 'SkyVolumetricCloudsB';

  surrGroup.add(highCloudsA, highCloudsB);

  const updateCloudGroup = (
    mesh: THREE.InstancedMesh,
    specs: CloudMotionSpec[],
    elapsed: number,
  ) => {
    for (let i = 0; i < specs.length; i++) {
      const s = specs[i];
      const ang = s.baseAngle + elapsed * s.speed;
      dummy.position.set(
        Math.cos(ang) * s.radius,
        s.baseY + Math.sin(elapsed * 0.55 + s.bobPhase) * s.bobAmp,
        Math.sin(ang) * s.radius,
      );
      dummy.rotation.set(0, s.yaw - ang * 0.4, 0);
      dummy.scale.set(s.scaleX, s.scaleY, s.scaleZ);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  updateCloudGroup(highCloudsA, highSpecsA, 0);
  updateCloudGroup(highCloudsB, highSpecsB, 0);
  highCloudsA.computeBoundingSphere();
  highCloudsB.computeBoundingSphere();

  return {
    update: (elapsed: number) => {
      uWaterTime.value = elapsed;
      moltenOrangeMat.emissiveIntensity = 1.55 + Math.sin(elapsed * 2.8) * 0.18;
      updateCloudGroup(highCloudsA, highSpecsA, elapsed);
      updateCloudGroup(highCloudsB, highSpecsB, elapsed);
    },
    dispose: () => {
      arenaRoot.remove(surrGroup);
      disposables.forEach((d) => d.dispose());
    },
  };
}
