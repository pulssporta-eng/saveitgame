import * as THREE from 'three';

export interface PBRTextureSet {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

export interface ArenaTextureLibrary {
  meadow: PBRTextureSet;
  sand: PBRTextureSet;
  stone: PBRTextureSet;
  cliff: PBRTextureSet;
  metalTrim: PBRTextureSet;
  bark: PBRTextureSet;
  dryBark: PBRTextureSet;
  foliageLeaf: {
    map: THREE.CanvasTexture;
    alphaMap: THREE.CanvasTexture;
  };
  dryFoliage: {
    map: THREE.CanvasTexture;
    alphaMap: THREE.CanvasTexture;
  };
  crackedEarth: {
    map: THREE.CanvasTexture;
    bumpMap: THREE.CanvasTexture;
    alphaMap: THREE.CanvasTexture;
  };
  dustSprite: THREE.CanvasTexture;
  ribbedHoseBump: THREE.CanvasTexture;
  magmaArmorMap: THREE.CanvasTexture;
  magmaArmorEmissive: THREE.CanvasTexture;
  contactShadow: THREE.CanvasTexture;
  flameSprite: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function hashPeriodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  let h = (px * 374761393 + py * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

function periodicNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);

  const n00 = hashPeriodic(ix, iy, period, seed);
  const n10 = hashPeriodic(ix + 1, iy, period, seed);
  const n01 = hashPeriodic(ix, iy + 1, period, seed);
  const n11 = hashPeriodic(ix + 1, iy + 1, period, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function periodicFbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  for (let i = 0; i < octaves; i++) {
    sum += amp * periodicNoise(u, v, p, seed + i * 131);
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

function configureTexture(
  canvas: HTMLCanvasElement,
  isColor: boolean,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMeadowPBRTextures(maxAnisotropy: number): PBRTextureSet {
  const size = 512;
  const albedoCanvas = makeCanvas(size);
  const bumpCanvas = makeCanvas(size);
  const roughCanvas = makeCanvas(size);

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      const macro = periodicFbm(u, v, 4, 4, 101);
      const micro = periodicFbm(u, v, 16, 3, 409);
      const grain = hashPeriodic(x, y, size, 991);

      // Rich organic soil + mossy turf base
      const soilMask = Math.max(0, Math.min(1, (0.42 - macro) * 2.5));
      const baseR = 48 + macro * 42 + micro * 20 + grain * 10 + soilMask * 26;
      const baseG = 92 + macro * 56 + micro * 26 + grain * 12 - soilMask * 22;
      const baseB = 34 + macro * 20 + micro * 12 + grain * 6 - soilMask * 8;

      aImg.data[idx] = Math.min(255, Math.max(0, baseR));
      aImg.data[idx + 1] = Math.min(255, Math.max(0, baseG));
      aImg.data[idx + 2] = Math.min(255, Math.max(0, baseB));
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.min(255, Math.max(0, 95 + macro * 65 + micro * 55 + grain * 30 - soilMask * 45));
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      // Soil is rougher (~235), lush grass blades slightly waxier (~165)
      const roughVal = Math.min(255, Math.max(135, 175 + soilMask * 58 + (1 - micro) * 28));
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  // Overlay crisp organic grass blade micro-strokes (tiled across boundaries)
  const rng = seededRng(5150);
  const bladeCount = 5200;
  for (let i = 0; i < bladeCount; i++) {
    const cx = rng() * size;
    const cy = rng() * size;
    const len = 5 + rng() * 11;
    const angle = (rng() - 0.5) * 1.4 - Math.PI * 0.5;
    const dx = Math.cos(angle) * len;
    const dy = Math.sin(angle) * len;
    const tone = rng();

    const rCol = tone > 0.88 ? 112 : tone > 0.45 ? 74 : 50;
    const gCol = tone > 0.88 ? 142 : tone > 0.45 ? 132 : 102;
    const bCol = tone > 0.88 ? 58 : tone > 0.45 ? 48 : 36;

    const drawWrapped = (ox: number, oy: number) => {
      aCtx.strokeStyle = `rgba(${rCol}, ${gCol}, ${bCol}, 0.52)`;
      aCtx.lineWidth = 1.0 + rng() * 1.2;
      aCtx.beginPath();
      aCtx.moveTo(cx + ox, cy + oy);
      aCtx.quadraticCurveTo(cx + ox + dx * 0.4, cy + oy + dy * 0.65, cx + ox + dx, cy + oy + dy);
      aCtx.stroke();

      bCtx.strokeStyle = `rgba(225, 225, 225, 0.32)`;
      bCtx.lineWidth = 1.1;
      bCtx.beginPath();
      bCtx.moveTo(cx + ox, cy + oy);
      bCtx.lineTo(cx + ox + dx, cy + oy + dy);
      bCtx.stroke();

      rCtx.strokeStyle = `rgba(148, 148, 148, 0.28)`;
      rCtx.lineWidth = 1.1;
      rCtx.beginPath();
      rCtx.moveTo(cx + ox, cy + oy);
      rCtx.lineTo(cx + ox + dx, cy + oy + dy);
      rCtx.stroke();
    };

    drawWrapped(0, 0);
    if (cx < 16) drawWrapped(size, 0);
    if (cx > size - 16) drawWrapped(-size, 0);
    if (cy < 16) drawWrapped(0, size);
    if (cy > size - 16) drawWrapped(0, -size);
  }

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy),
    bumpMap: configureTexture(bumpCanvas, false, maxAnisotropy),
    roughnessMap: configureTexture(roughCanvas, false, maxAnisotropy),
  };
}

function createSaharaSandPBRTextures(maxAnisotropy: number): PBRTextureSet {
  const size = 512;
  const albedoCanvas = makeCanvas(size);
  const bumpCanvas = makeCanvas(size);
  const roughCanvas = makeCanvas(size);

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      // Periodic wind-ripple waves with organic drift
      const warp = periodicFbm(u, v, 3, 3, 701) * 0.48;
      const ripplePhase = (u * 10 + v * 4 + warp * 3.5) * Math.PI * 2;
      // Asymmetric aeolian sand ripple profile
      const s = Math.sin(ripplePhase);
      const asym = Math.pow((s + 1) * 0.5, 0.72);
      const secondaryRipple = Math.sin((u * 22 - v * 6 + warp * 4.0) * Math.PI * 2) * 0.14;
      const ripple = Math.max(0, Math.min(1, asym * 0.86 + secondaryRipple + 0.08));

      const macro = periodicFbm(u, v, 4, 3, 811);
      const grain = hashPeriodic(x, y, size, 317);
      const sparkle = grain > 0.965 ? 1 : 0;

      // Warm Sahara golden ochre to sun-bleached sand crest
      const r = 186 + ripple * 42 + macro * 18 + grain * 14;
      const g = 142 + ripple * 36 + macro * 15 + grain * 12;
      const b = 86 + ripple * 24 + macro * 10 + grain * 10;

      aImg.data[idx] = Math.min(255, Math.max(0, r));
      aImg.data[idx + 1] = Math.min(255, Math.max(0, g));
      aImg.data[idx + 2] = Math.min(255, Math.max(0, b));
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.min(255, Math.max(0, 65 + ripple * 145 + grain * 38));
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      // Quartz grain sparkle vs matte sand trough
      const roughVal = sparkle ? 105 : Math.min(255, Math.max(150, 222 - ripple * 42 + grain * 24));
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy),
    bumpMap: configureTexture(bumpCanvas, false, maxAnisotropy),
    roughnessMap: configureTexture(roughCanvas, false, maxAnisotropy),
  };
}

function createRockStrataTextures(
  maxAnisotropy: number,
  warmTone: boolean,
  repeatX: number,
  repeatY: number,
): PBRTextureSet {
  const size = 512;
  const albedoCanvas = makeCanvas(size);
  const bumpCanvas = makeCanvas(size);
  const roughCanvas = makeCanvas(size);

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      const macro = periodicFbm(u, v, 4, 4, warmTone ? 1121 : 2231);
      const strataWave = Math.sin((v * 14 + macro * 2.2) * Math.PI * 2) * 0.5 + 0.5;
      const crackNoise = Math.abs(periodicFbm(u, v, 8, 3, 3341) - 0.5) * 2.0;
      const crevice = crackNoise < 0.08 ? 1 - crackNoise / 0.08 : 0;
      const grain = hashPeriodic(x, y, size, 5501);

      const base = 0.66 + macro * 0.28 + strataWave * 0.16 - crevice * 0.26;
      const r = warmTone ? base * 198 + grain * 14 : base * 165 + grain * 12;
      const g = warmTone ? base * 182 + grain * 12 : base * 158 + grain * 12;
      const b = warmTone ? base * 158 + grain * 10 : base * 148 + grain * 12;

      aImg.data[idx] = Math.min(255, Math.max(0, r));
      aImg.data[idx + 1] = Math.min(255, Math.max(0, g));
      aImg.data[idx + 2] = Math.min(255, Math.max(0, b));
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.min(255, Math.max(0, 95 + strataWave * 70 + macro * 65 - crevice * 90 + grain * 22));
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      const roughVal = Math.min(255, Math.max(150, 215 - strataWave * 28 + crevice * 35 + grain * 18));
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy, repeatX, repeatY),
    bumpMap: configureTexture(bumpCanvas, false, maxAnisotropy, repeatX, repeatY),
    roughnessMap: configureTexture(roughCanvas, false, maxAnisotropy, repeatX, repeatY),
  };
}

function createBrushedMetalTextures(maxAnisotropy: number): PBRTextureSet {
  const size = 256;
  const albedoCanvas = makeCanvas(size);
  const bumpCanvas = makeCanvas(size);
  const roughCanvas = makeCanvas(size);

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const streak = periodicNoise(0.15, v, 48, 707);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      const fine = periodicNoise(u, v * 3, 24, 909);
      const patina = periodicFbm(u, v, 4, 3, 313);
      const val = 0.72 + streak * 0.16 + fine * 0.08 - patina * 0.12;

      // Brushed champagne bronze / weathered gunmetal-gold
      aImg.data[idx] = Math.min(255, Math.max(0, val * 188));
      aImg.data[idx + 1] = Math.min(255, Math.max(0, val * 164));
      aImg.data[idx + 2] = Math.min(255, Math.max(0, val * 124));
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.min(255, Math.max(0, 110 + streak * 65 + fine * 35));
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      const roughVal = Math.min(255, Math.max(55, 74 + patina * 52 + (1 - streak) * 28));
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy, 6, 1),
    bumpMap: configureTexture(bumpCanvas, false, maxAnisotropy, 6, 1),
    roughnessMap: configureTexture(roughCanvas, false, maxAnisotropy, 6, 1),
  };
}

function createCrackedEarthTextures(maxAnisotropy: number) {
  const size = 256;
  const albedoCanvas = makeCanvas(size);
  const bumpCanvas = makeCanvas(size);
  const alphaCanvas = makeCanvas(size);

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const alCtx = alphaCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const alImg = alCtx.createImageData(size, size);

  const rng = seededRng(8842);
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 34; i++) {
    pts.push({ x: rng(), y: rng() });
  }

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      let d1 = 999;
      let d2 = 999;
      for (let i = 0; i < pts.length; i++) {
        const dx = u - pts[i].x;
        const dy = v - pts[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < d1) {
          d2 = d1;
          d1 = dist;
        } else if (dist < d2) {
          d2 = dist;
        }
      }

      const edgeDist = d2 - d1;
      const crack = edgeDist < 0.016 ? 1 - edgeDist / 0.016 : 0;
      const radialDist = Math.sqrt((u - 0.5) * (u - 0.5) + (v - 0.5) * (v - 0.5)) * 2;
      const edgeWobble = periodicNoise(u, v, 6, 404) * 0.28;
      const alpha = Math.max(0, Math.min(1, (0.86 - radialDist + edgeWobble) * 1.9)) * 0.85;

      const grain = hashPeriodic(x, y, size, 129);
      const clayR = 198 - crack * 68 + grain * 12;
      const clayG = 162 - crack * 58 + grain * 10;
      const clayB = 114 - crack * 44 + grain * 8;

      aImg.data[idx] = Math.max(0, Math.min(255, clayR));
      aImg.data[idx + 1] = Math.max(0, Math.min(255, clayG));
      aImg.data[idx + 2] = Math.max(0, Math.min(255, clayB));
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.max(0, Math.min(255, 200 - crack * 140 + grain * 18));
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      const aVal = Math.round(alpha * 255);
      alImg.data[idx] = aVal;
      alImg.data[idx + 1] = aVal;
      alImg.data[idx + 2] = aVal;
      alImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  alCtx.putImageData(alImg, 0, 0);

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy),
    bumpMap: configureTexture(bumpCanvas, false, maxAnisotropy),
    alphaMap: configureTexture(alphaCanvas, false, maxAnisotropy),
  };
}

function createBarkTextures(maxAnisotropy: number, isDry: boolean): PBRTextureSet {
  const size = 256;
  const albedoCanvas = makeCanvas(size);
  const bumpCanvas = makeCanvas(size);
  const roughCanvas = makeCanvas(size);

  const aCtx = albedoCanvas.getContext('2d')!;
  const bCtx = bumpCanvas.getContext('2d')!;
  const rCtx = roughCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const bImg = bCtx.createImageData(size, size);
  const rImg = rCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      const warp = periodicFbm(u, v, 4, 3, isDry ? 412 : 912) * 0.28;
      const furrow = Math.sin((u * 14 + warp * 5.0) * Math.PI * 2) * 0.5 + 0.5;
      const detail = periodicFbm(u * 2, v, 8, 3, isDry ? 715 : 315);
      const grain = hashPeriodic(x, y, size, 619);

      const ridge = Math.pow(furrow, 0.75) * 0.65 + detail * 0.35;
      if (isDry) {
        // Sun-bleached weathered driftwood / parched desert bark
        const r = 132 + ridge * 68 + grain * 14;
        const g = 114 + ridge * 58 + grain * 12;
        const b = 90 + ridge * 46 + grain * 10;
        aImg.data[idx] = Math.min(255, r);
        aImg.data[idx + 1] = Math.min(255, g);
        aImg.data[idx + 2] = Math.min(255, b);
      } else {
        // Rich dark umber oak bark with subtle moss hints in grooves
        const moss = furrow < 0.25 && detail > 0.54 ? (0.25 - furrow) * 2.5 : 0;
        const r = 68 + ridge * 54 + grain * 10 - moss * 14;
        const g = 52 + ridge * 42 + grain * 8 + moss * 36;
        const b = 38 + ridge * 28 + grain * 6 - moss * 10;
        aImg.data[idx] = Math.min(255, Math.max(0, r));
        aImg.data[idx + 1] = Math.min(255, Math.max(0, g));
        aImg.data[idx + 2] = Math.min(255, Math.max(0, b));
      }
      aImg.data[idx + 3] = 255;

      const bumpVal = Math.min(255, Math.max(0, 50 + ridge * 175 + grain * 25));
      bImg.data[idx] = bumpVal;
      bImg.data[idx + 1] = bumpVal;
      bImg.data[idx + 2] = bumpVal;
      bImg.data[idx + 3] = 255;

      const roughVal = Math.min(255, Math.max(185, 240 - ridge * 42 + grain * 16));
      rImg.data[idx] = roughVal;
      rImg.data[idx + 1] = roughVal;
      rImg.data[idx + 2] = roughVal;
      rImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy, 2, 3),
    bumpMap: configureTexture(bumpCanvas, false, maxAnisotropy, 2, 3),
    roughnessMap: configureTexture(roughCanvas, false, maxAnisotropy, 2, 3),
  };
}

function createFoliageClusterTextures(maxAnisotropy: number, isDry: boolean) {
  const size = 256;
  const albedoCanvas = makeCanvas(size);
  const alphaCanvas = makeCanvas(size);
  const aCtx = albedoCanvas.getContext('2d')!;
  const alCtx = alphaCanvas.getContext('2d')!;

  // Base neutral fill so non-cutout interior has rich leaf depth
  aCtx.fillStyle = isDry ? '#7d734f' : '#2d5c24';
  aCtx.fillRect(0, 0, size, size);
  alCtx.fillStyle = '#000000';
  alCtx.fillRect(0, 0, size, size);

  const rng = seededRng(isDry ? 9421 : 4711);
  const leafCount = isDry ? 95 : 190;

  for (let i = 0; i < leafCount; i++) {
    const cx = 24 + rng() * (size - 48);
    const cy = 24 + rng() * (size - 48);
    const angle = rng() * Math.PI * 2;
    const len = isDry ? 14 + rng() * 14 : 18 + rng() * 18;
    const wid = isDry ? 4 + rng() * 4 : 8 + rng() * 8;
    const tone = rng();

    aCtx.save();
    aCtx.translate(cx, cy);
    aCtx.rotate(angle);

    if (isDry) {
      aCtx.fillStyle =
        tone > 0.6 ? '#b09d6b' : tone > 0.3 ? '#938354' : '#7a6c44';
    } else {
      aCtx.fillStyle =
        tone > 0.7 ? '#75b249' : tone > 0.35 ? '#4c8e34' : '#356c26';
    }

    aCtx.beginPath();
    aCtx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
    aCtx.fill();

    // Leaf midrib highlight
    aCtx.strokeStyle = isDry ? 'rgba(220,205,165,0.45)' : 'rgba(175,225,120,0.45)';
    aCtx.lineWidth = 1.2;
    aCtx.beginPath();
    aCtx.moveTo(-len * 0.75, 0);
    aCtx.lineTo(len * 0.75, 0);
    aCtx.stroke();
    aCtx.restore();

    alCtx.save();
    alCtx.translate(cx, cy);
    alCtx.rotate(angle);
    alCtx.fillStyle = '#ffffff';
    alCtx.beginPath();
    alCtx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2);
    alCtx.fill();
    alCtx.restore();
  }

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy),
    alphaMap: configureTexture(alphaCanvas, false, maxAnisotropy),
  };
}

function createDustSpriteTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 240, 200, 1)');
  grad.addColorStop(0.35, 'rgba(255, 224, 165, 0.55)');
  grad.addColorStop(1, 'rgba(255, 210, 140, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRibbedHoseBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const rib = Math.pow(Math.sin(v * Math.PI * 24) * 0.5 + 0.5, 0.7);
    const val = Math.round(55 + rib * 185);
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      img.data[idx] = val;
      img.data[idx + 1] = val;
      img.data[idx + 2] = val;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return configureTexture(canvas, false, maxAnisotropy, 1, 8);
}

function createMagmaArmorTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
} {
  const size = 256;
  const albedoCanvas = makeCanvas(size);
  const emissiveCanvas = makeCanvas(size);
  const aCtx = albedoCanvas.getContext('2d')!;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const aImg = aCtx.createImageData(size, size);
  const eImg = eCtx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const idx = (y * size + x) * 4;

      const n1 = Math.abs(periodicFbm(u, v, 4, 3, 601) - 0.5) * 2.0;
      const n2 = Math.abs(periodicFbm(u * 1.35 + 0.2, v * 1.35 - 0.1, 6, 3, 977) - 0.5) * 2.0;
      const crackA = n1 < 0.09 ? 1 - n1 / 0.09 : 0;
      const crackB = n2 < 0.065 ? 1 - n2 / 0.065 : 0;
      const crack = Math.min(1, Math.max(crackA, crackB * 0.85));
      const patchShade = periodicFbm(u, v, 3, 2, 307);

      // Vivid crimson-red magma body with glowing yellow-orange lava fissures
      const baseR = 188 + patchShade * 38 + crack * 55;
      const baseG = 26 + patchShade * 20 + Math.pow(crack, 0.85) * 185;
      const baseB = 18 + patchShade * 12 + Math.pow(crack, 1.8) * 38;

      aImg.data[idx] = Math.min(255, baseR);
      aImg.data[idx + 1] = Math.min(255, baseG);
      aImg.data[idx + 2] = Math.min(255, baseB);
      aImg.data[idx + 3] = 255;

      const emR = Math.min(255, 22 + Math.pow(crack, 0.65) * 233);
      const emG = Math.min(255, 4 + Math.pow(crack, 1.05) * 205);
      const emB = Math.min(255, Math.pow(crack, 2.1) * 55);

      eImg.data[idx] = emR;
      eImg.data[idx + 1] = emG;
      eImg.data[idx + 2] = emB;
      eImg.data[idx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  eCtx.putImageData(eImg, 0, 0);

  return {
    map: configureTexture(albedoCanvas, true, maxAnisotropy, 1, 1),
    emissiveMap: configureTexture(emissiveCanvas, true, maxAnisotropy, 1, 1),
  };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(8, 10, 12, 0.85)');
  grad.addColorStop(0.55, 'rgba(8, 10, 12, 0.42)');
  grad.addColorStop(1, 'rgba(8, 10, 12, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createFlameSpriteTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = makeCanvas(size);
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 252, 230, 1)');
  grad.addColorStop(0.32, 'rgba(255, 195, 95, 0.88)');
  grad.addColorStop(0.68, 'rgba(235, 90, 20, 0.35)');
  grad.addColorStop(1, 'rgba(120, 30, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function createArenaTextureLibrary(renderer: THREE.WebGLRenderer): ArenaTextureLibrary {
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

  const meadow = createMeadowPBRTextures(maxAnisotropy);
  const sand = createSaharaSandPBRTextures(maxAnisotropy);
  const stone = createRockStrataTextures(maxAnisotropy, true, 4, 1);
  const cliff = createRockStrataTextures(maxAnisotropy, false, 3, 2);
  const metalTrim = createBrushedMetalTextures(maxAnisotropy);
  const bark = createBarkTextures(maxAnisotropy, false);
  const dryBark = createBarkTextures(maxAnisotropy, true);
  const foliageLeaf = createFoliageClusterTextures(maxAnisotropy, false);
  const dryFoliage = createFoliageClusterTextures(maxAnisotropy, true);
  const crackedEarth = createCrackedEarthTextures(maxAnisotropy);
  const dustSprite = createDustSpriteTexture();
  const ribbedHoseBump = createRibbedHoseBumpTexture(maxAnisotropy);
  const magmaArmor = createMagmaArmorTextures(maxAnisotropy);
  const contactShadow = createContactShadowTexture();
  const flameSprite = createFlameSpriteTexture();

  return {
    meadow,
    sand,
    stone,
    cliff,
    metalTrim,
    bark,
    dryBark,
    foliageLeaf,
    dryFoliage,
    crackedEarth,
    dustSprite,
    ribbedHoseBump,
    magmaArmorMap: magmaArmor.map,
    magmaArmorEmissive: magmaArmor.emissiveMap,
    contactShadow,
    flameSprite,
    dispose: () => {
      for (const set of [meadow, sand, stone, cliff, metalTrim, bark, dryBark]) {
        set.map.dispose();
        set.bumpMap.dispose();
        set.roughnessMap.dispose();
      }
      foliageLeaf.map.dispose();
      foliageLeaf.alphaMap.dispose();
      dryFoliage.map.dispose();
      dryFoliage.alphaMap.dispose();
      crackedEarth.map.dispose();
      crackedEarth.bumpMap.dispose();
      crackedEarth.alphaMap.dispose();
      dustSprite.dispose();
      ribbedHoseBump.dispose();
      magmaArmor.map.dispose();
      magmaArmor.emissiveMap.dispose();
      contactShadow.dispose();
      flameSprite.dispose();
    },
  };
}
