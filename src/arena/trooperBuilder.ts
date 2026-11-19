import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ArenaTextureLibrary } from './proceduralTextures';

export type TrooperRole = 'hero' | 'villain';

export interface TrooperRig {
  role: TrooperRole;
  root: THREE.Group;
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftHip: THREE.Group;
  rightHip: THREE.Group;
  leftKnee: THREE.Group;
  rightKnee: THREE.Group;
  leftAnkle: THREE.Group;
  rightAnkle: THREE.Group;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftElbow: THREE.Group;
  rightElbow: THREE.Group;
  weaponGroup: THREE.Group;
  muzzleAnchor: THREE.Object3D;
  tankCore: THREE.Mesh;
  tankCoreHalfHeight: number;
  tankCoreMat: THREE.MeshStandardMaterial;
  visorMat: THREE.MeshStandardMaterial;
  dizzyHaloGroup: THREE.Group;
  dispose: () => void;
}

export interface FirstPersonWeaponRig {
  role: TrooperRole;
  root: THREE.Group;
  weaponPivot: THREE.Group;
  leftForearm: THREE.Group;
  muzzleAnchor: THREE.Object3D;
  energyMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

/**
 * Seamless chunky-muscular tapered body silhouette matching vodeni_model & vatreni_model
 * (wide muscular chest curving seamlessly with no neck into a rounded head).
 */
function createSeamlessTrooperBodyGeometry(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.24, 0.02),
    new THREE.Vector2(0.29, 0.14), // waist
    new THREE.Vector2(0.39, 0.36), // muscular chest / lats
    new THREE.Vector2(0.38, 0.50), // shoulder slope
    new THREE.Vector2(0.30, 0.68), // head base (no neck)
    new THREE.Vector2(0.26, 0.84), // forehead
    new THREE.Vector2(0.18, 0.96), // crown curve
    new THREE.Vector2(0.0, 1.01),
  ];
  const geo = new THREE.LatheGeometry(pts, 26);
  // Subtle front-to-back muscular depth compression so silhouette is heroically broad
  geo.scale(1.06, 1.0, 0.82);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Open triangular blaster rear stock matching the reference weapon silhouettes.
 */
function createOpenTriangleStockGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.08);
  shape.lineTo(-0.28, 0.02);
  shape.lineTo(-0.31, -0.22);
  shape.lineTo(0, -0.05);
  shape.closePath();

  const hole = new THREE.Path();
  hole.moveTo(-0.05, 0.03);
  hole.lineTo(-0.23, -0.01);
  hole.lineTo(-0.25, -0.15);
  hole.lineTo(-0.05, -0.04);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.055,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.012,
    bevelThickness: 0.012,
  });
  geo.center();
  // Rotate so length goes along Z (rear -Z) and height along Y
  geo.rotateY(Math.PI / 2);
  return geo;
}

/**
 * Sculpted teardrop/flame lobe for Water pompadour wave or Fire flame crown.
 */
function createWaveFlameLobeGeometry(curveOffsetX: number, curveOffsetZ: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.11, 14, 14);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, (y + 0.11) / 0.22));
    const taper = 1.0 - t * 0.72;
    pos.setXYZ(
      i,
      x * taper + curveOffsetX * t * t,
      y * 1.85 + 0.12,
      z * taper + curveOffsetZ * t * t,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds the signature two-handed Water Blaster or Fire Flamethrower rifle
 * matching vodeni_model_11c5c386.jpg and vatreni_model_264086e1.jpg.
 */
function populateSignatureBlaster(
  target: THREE.Group,
  isHero: boolean,
  mats: {
    bodyMat: THREE.Material;
    accentMat: THREE.Material;
    darkMat: THREE.Material;
    energyMat: THREE.Material;
    glassMat: THREE.Material;
    tankCoreMat: THREE.Material;
    copperHoseMat: THREE.Material;
    gaugeFaceMat: THREE.Material;
  },
  trackGeo: <T extends THREE.BufferGeometry>(g: T) => T,
): {
  muzzleAnchor: THREE.Object3D;
  tankCore: THREE.Mesh;
  tankCoreHalfHeight: number;
} {
  const {
    bodyMat,
    accentMat,
    darkMat,
    energyMat,
    glassMat,
    tankCoreMat,
    copperHoseMat,
    gaugeFaceMat,
  } = mats;

  // 1. Main Receiver Housing
  const receiver = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(0.135, 0.17, 0.46, 2, 0.03)),
    bodyMat,
  );
  receiver.position.set(0, 0.02, 0.05);
  target.add(receiver);

  // Side accent housing plate
  const sidePlate = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(0.155, 0.105, 0.22, 2, 0.02)),
    accentMat,
  );
  sidePlate.position.set(0, 0.035, 0.04);
  target.add(sidePlate);

  // Glowing side elemental chamber window (cyan plasma or molten fire tube)
  const chamberTube = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.23, 12)),
    energyMat,
  );
  chamberTube.rotation.x = Math.PI / 2;
  chamberTube.position.set(0, 0.04, 0.20);
  target.add(chamberTube);

  // Upper sight rail / frame shroud
  const topShroud = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(0.115, 0.075, 0.34, 2, 0.02)),
    darkMat,
  );
  topShroud.position.set(0, 0.10, 0.24);
  target.add(topShroud);

  // 2. Open Triangular Stock at Rear
  const stockMesh = new THREE.Mesh(trackGeo(createOpenTriangleStockGeometry()), bodyMat);
  stockMesh.position.set(0, -0.05, -0.26);
  target.add(stockMesh);

  // Pistol Grip
  const pistolGrip = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(0.068, 0.15, 0.08, 2, 0.018)),
    darkMat,
  );
  pistolGrip.position.set(0, -0.095, -0.05);
  pistolGrip.rotation.x = 0.26;
  target.add(pistolGrip);

  // Front Pump Foregrip (bright cyan for Hero, dark matte gunmetal for Villain)
  const pumpGrip = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(0.118, 0.095, 0.24, 2, 0.025)),
    isHero ? accentMat : darkMat,
  );
  pumpGrip.position.set(0, -0.085, 0.36);
  target.add(pumpGrip);

  const underRail = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 10)),
    darkMat,
  );
  underRail.rotation.x = Math.PI / 2;
  underRail.position.set(0, -0.045, 0.35);
  target.add(underRail);

  // 3. Twin Stacked Barrels & Glowing Front Nozzles (exact reference silhouette)
  for (const [by, r] of [
    [0.068, 0.036],
    [-0.004, 0.031],
  ] as const) {
    const barrelBody = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r * 0.85, r * 0.85, 0.30, 12)),
      darkMat,
    );
    barrelBody.rotation.x = Math.PI / 2;
    barrelBody.position.set(0, by, 0.48);
    target.add(barrelBody);

    const nozzleRing = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r * 1.28, r * 1.32, 0.09, 12)),
      bodyMat,
    );
    nozzleRing.rotation.x = Math.PI / 2;
    nozzleRing.position.set(0, by, 0.61);
    target.add(nozzleRing);

    const tipGlow = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(r * 0.72, r * 0.72, 0.03, 12)),
      energyMat,
    );
    tipGlow.rotation.x = Math.PI / 2;
    tipGlow.position.set(0, by, 0.655);
    target.add(tipGlow);
  }

  // 4. Signature Top-Mounted Translucent Water / Molten Lava Bottle Tank
  const tankGroup = new THREE.Group();
  tankGroup.position.set(0, 0.22, -0.04);
  tankGroup.rotation.x = -Math.PI * 0.42;
  target.add(tankGroup);

  const bottleHeight = 0.29;
  const bottleRadius = 0.088;
  const tankCoreHalfHeight = (bottleHeight * 0.82) * 0.5;

  const tankCore = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(bottleRadius * 0.74, bottleRadius * 0.74, bottleHeight * 0.82, 14)),
    tankCoreMat,
  );
  tankGroup.add(tankCore);

  const tankGlass = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(bottleRadius, bottleHeight * 0.64, 6, 16)),
    glassMat,
  );
  tankGroup.add(tankGlass);

  const bottleCap = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.056, 0.068, 0.055, 12)),
    bodyMat,
  );
  bottleCap.position.y = bottleHeight * 0.56;
  tankGroup.add(bottleCap);

  // Curved rear feed pipe from bottle into back of receiver
  const feedCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.20, -0.17),
    new THREE.Vector3(0, 0.14, -0.23),
    new THREE.Vector3(0, 0.06, -0.16),
  ]);
  const feedPipe = new THREE.Mesh(
    trackGeo(new THREE.TubeGeometry(feedCurve, 14, 0.025, 8, false)),
    glassMat,
  );
  target.add(feedPipe);

  // 5. Villain-Specific Side Pressure Gauge + Looping Copper-Braided Fuel Hose
  if (!isHero) {
    for (const s of [-1, 1]) {
      const gaugeRim = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.042, 0.042, 0.022, 14)),
        darkMat,
      );
      gaugeRim.rotation.z = Math.PI / 2;
      gaugeRim.position.set(s * 0.078, 0.02, -0.03);
      target.add(gaugeRim);

      const gaugeFace = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 12)),
        gaugeFaceMat,
      );
      gaugeFace.rotation.z = Math.PI / 2;
      gaugeFace.position.set(s * 0.079, 0.02, -0.03);
      target.add(gaugeFace);
    }

    const hoseLoopCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.06, -0.01, 0.14),
      new THREE.Vector3(-0.08, -0.22, 0.12),
      new THREE.Vector3(-0.07, -0.29, -0.03),
      new THREE.Vector3(-0.05, -0.17, -0.15),
      new THREE.Vector3(-0.03, -0.02, -0.12),
    ]);
    const hoseLoop = new THREE.Mesh(
      trackGeo(new THREE.TubeGeometry(hoseLoopCurve, 22, 0.02, 8, false)),
      copperHoseMat,
    );
    target.add(hoseLoop);
  }

  const muzzleAnchor = new THREE.Object3D();
  muzzleAnchor.position.set(0, 0.038, 0.72);
  target.add(muzzleAnchor);

  return {
    muzzleAnchor,
    tankCore,
    tankCoreHalfHeight,
  };
}

export function buildArmoredTrooper(
  role: TrooperRole,
  textures: ArenaTextureLibrary,
  isSoftwareGl: boolean,
): TrooperRig {
  const isHero = role === 'hero';
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // 1. Stylized Character & Weapon Materials matching reference images
  const skinMat = trackMat(
    isHero
      ? new THREE.MeshPhysicalMaterial({
          color: 0x45baff,
          roughness: 0.22,
          metalness: 0.05,
          clearcoat: 0.85,
          clearcoatRoughness: 0.14,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: textures.magmaArmorMap,
          emissiveMap: textures.magmaArmorEmissive,
          emissive: new THREE.Color(0xff7208),
          emissiveIntensity: 1.55,
          roughness: 0.26,
          metalness: 0.08,
          clearcoat: 0.55,
          clearcoatRoughness: 0.2,
        }),
  );

  const hairMat = trackMat(
    isHero
      ? new THREE.MeshPhysicalMaterial({
          color: 0x165ce8,
          roughness: 0.18,
          metalness: 0.08,
          clearcoat: 0.92,
          clearcoatRoughness: 0.1,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xffa61a,
          emissive: 0xff5a00,
          emissiveIntensity: 1.75,
          roughness: 0.3,
          metalness: 0.05,
        }),
  );

  const flameTipMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffe552,
      emissive: 0xffb81c,
      emissiveIntensity: 2.1,
      roughness: 0.25,
      metalness: 0.05,
    }),
  );

  const shortsMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x121b2c : 0x1a191e,
      roughness: 0.72,
      metalness: 0.08,
    }),
  );

  const frameMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x101318,
      roughness: 0.28,
      metalness: 0.32,
    }),
  );

  const visorMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x0c7892 : 0xa83208,
      emissive: isHero ? 0x065c76 : 0x8c2200,
      emissiveIntensity: 0.55,
      roughness: 0.08,
      metalness: 0.72,
    }),
  );

  const teethMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbfaf6,
      roughness: 0.32,
      metalness: 0.02,
    }),
  );

  const mouthInnerMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x1b0b0c,
      roughness: 0.85,
      metalness: 0.0,
    }),
  );

  const weaponBodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x1b6fe0 : 0xc72318,
      roughness: 0.34,
      metalness: 0.36,
    }),
  );

  const weaponAccentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x35e2ef : 0x3a373f,
      roughness: 0.28,
      metalness: 0.26,
    }),
  );

  const weaponDarkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x222630,
      roughness: 0.42,
      metalness: 0.45,
    }),
  );

  const energyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x6ef8ff : 0xffaa24,
      emissive: isHero ? 0x00e1ff : 0xff4500,
      emissiveIntensity: 2.25,
      roughness: 0.18,
      metalness: 0.1,
    }),
  );

  const tankCoreMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x38efff : 0xff7b14,
      emissive: isHero ? 0x00c8ff : 0xff3b00,
      emissiveIntensity: 2.05,
      roughness: 0.2,
      metalness: 0.1,
    }),
  );

  const tankGlassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: isHero ? 0xc2f8ff : 0x3a2016,
      transparent: true,
      opacity: isHero ? 0.46 : 0.42,
      roughness: 0.1,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      depthWrite: false,
    }),
  );

  const copperHoseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9c6234,
      bumpMap: textures.ribbedHoseBump,
      bumpScale: 0.04,
      roughness: 0.56,
      metalness: 0.35,
    }),
  );

  const gaugeFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.4,
      metalness: 0.05,
    }),
  );

  const dizzyStarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffe44d,
      emissive: 0xffb800,
      emissiveIntensity: 2.4,
      roughness: 0.2,
      metalness: 0.2,
    }),
  );

  const contactShadowMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: textures.contactShadow,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
    }),
  );

  const setShadow = (obj: THREE.Object3D) => {
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = !isSoftwareGl;
        child.receiveShadow = !isSoftwareGl;
      }
    });
  };

  // 2. Root & Ground Contact Shadow (origin y=0 at boot soles)
  const root = new THREE.Group();
  root.name = isHero ? 'HeroWaterTrooper' : 'VillainFireTrooper';

  const shadowDisc = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.66, 24)), contactShadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.03;
  root.add(shadowDisc);

  // 3. Pelvis (Dark Shorts) & Chunky Muscular Legs grounded strictly at y=0
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.64, 0);
  root.add(pelvis);

  const shortsWaist = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.285, 0.305, 0.22, 18)),
    shortsMat,
  );
  shortsWaist.scale.set(1.06, 1.0, 0.84);
  shortsWaist.position.y = 0.04;
  pelvis.add(shortsWaist);

  const buildLeg = (
    sideSign: number,
  ): { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group } => {
    const hip = new THREE.Group();
    hip.position.set(sideSign * 0.165, -0.02, 0);
    pelvis.add(hip);

    // Short leg cuff
    const shortLeg = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.135, 0.125, 0.15, 14)),
      shortsMat,
    );
    shortLeg.position.y = -0.06;
    hip.add(shortLeg);

    // Muscular upper thigh
    const thigh = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.105, 0.15, 6, 12)),
      skinMat,
    );
    thigh.position.y = -0.17;
    hip.add(thigh);

    const knee = new THREE.Group();
    knee.position.set(0, -0.28, 0.015);
    hip.add(knee);

    // Tapered calf
    const calf = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.095, 0.14, 6, 12)),
      skinMat,
    );
    calf.position.y = -0.14;
    knee.add(calf);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.27, -0.01);
    knee.add(ankle);

    // Smooth stylized chunky foot grounded at y = -0.07 -> 0.64 - 0.02 - 0.28 - 0.27 - 0.07 = 0.0
    const foot = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.105, 14, 12)),
      skinMat,
    );
    foot.scale.set(0.95, 0.66, 1.45);
    foot.position.set(0, 0.0, 0.055);
    ankle.add(foot);

    return { hip, knee, ankle };
  };

  const leftLeg = buildLeg(1);
  const rightLeg = buildLeg(-1);

  // 4. Seamless Muscular Tapered Torso & Head Dome
  const torso = new THREE.Group();
  torso.position.set(0, 0.10, 0);
  pelvis.add(torso);

  const bodyMesh = new THREE.Mesh(trackGeo(createSeamlessTrooperBodyGeometry()), skinMat);
  torso.add(bodyMesh);

  // Sculpted Chest Pectorals & Abs Contours (just like vodeni & vatreni models)
  const pecGeo = trackGeo(new THREE.SphereGeometry(0.16, 14, 12));
  for (const s of [-1, 1]) {
    const pec = new THREE.Mesh(pecGeo, skinMat);
    pec.scale.set(1.26, 0.82, 0.44);
    pec.position.set(s * 0.15, 0.41, 0.195);
    torso.add(pec);
  }
  const abGeo = trackGeo(new THREE.SphereGeometry(0.068, 10, 8));
  for (let row = 0; row < 2; row++) {
    for (const s of [-1, 1]) {
      const ab = new THREE.Mesh(abGeo, skinMat);
      ab.scale.set(1.12, 0.86, 0.44);
      ab.position.set(s * 0.072, 0.23 - row * 0.11, 0.238 - row * 0.014);
      torso.add(ab);
    }
  }

  // Head Group (Sunglasses, Smile/Grin, Water Pompadour OR Flame Crown)
  const head = new THREE.Group();
  head.position.set(0, 0.72, 0.02);
  torso.add(head);

  // Sleek Black Sunglasses Frame + Tinted Mirrored Lenses
  const glassesGroup = new THREE.Group();
  glassesGroup.position.set(0, 0.06, 0.212);
  head.add(glassesGroup);

  const bridge = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.07, 0.024, 0.026)),
    frameMat,
  );
  bridge.position.set(0, 0.024, 0.015);
  glassesGroup.add(bridge);

  const browBar = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(0.36, 0.024, 0.026, 2, 0.008)),
    frameMat,
  );
  browBar.position.set(0, 0.044, 0.012);
  glassesGroup.add(browBar);

  for (const s of [-1, 1]) {
    const frameRim = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(0.158, 0.112, 0.026, 2, 0.036)),
      frameMat,
    );
    frameRim.position.set(s * 0.095, 0.0, 0.0);
    frameRim.rotation.z = isHero ? -s * 0.05 : s * 0.08;
    frameRim.rotation.y = s * 0.18;
    glassesGroup.add(frameRim);

    const lens = new THREE.Mesh(
      trackGeo(new RoundedBoxGeometry(0.132, 0.086, 0.02, 2, 0.03)),
      visorMat,
    );
    lens.position.set(s * 0.095, 0.0, 0.011);
    lens.rotation.z = isHero ? -s * 0.05 : s * 0.08;
    lens.rotation.y = s * 0.18;
    glassesGroup.add(lens);

    // Temple arm wrapping to side of head
    const arm = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.02, 0.02, 0.21)),
      frameMat,
    );
    arm.position.set(s * 0.178, 0.024, -0.09);
    glassesGroup.add(arm);
  }

  // Cheerful Smile (Hero) / Confident Grin (Villain)
  const mouthCavity = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.07, 12, 10)),
    mouthInnerMat,
  );
  mouthCavity.scale.set(1.18, 0.58, 0.4);
  mouthCavity.position.set(0, -0.085, 0.235);
  head.add(mouthCavity);

  const teethArc = new THREE.Mesh(
    trackGeo(new RoundedBoxGeometry(0.12, 0.036, 0.03, 2, 0.012)),
    teethMat,
  );
  teethArc.position.set(0, -0.072, 0.252);
  head.add(teethArc);

  // Iconic Hair / Crown on Top of Head
  const crownGroup = new THREE.Group();
  crownGroup.position.set(0, 0.22, 0.0);
  head.add(crownGroup);

  if (isHero) {
    // Swept Glossy Royal-Blue Water-Wave Pompadour Curls (matching vodeni_model)
    const waveSpecs: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      rx: number;
      rz: number;
      cx: number;
      cz: number;
    }> = [
      { x: -0.01, y: 0.02, z: 0.03, sx: 1.35, sy: 1.35, sz: 1.25, rx: -0.25, rz: 0.16, cx: -0.08, cz: -0.14 },
      { x: 0.09, y: 0.0, z: 0.02, sx: 0.95, sy: 1.05, sz: 1.0, rx: -0.18, rz: -0.34, cx: 0.06, cz: -0.10 },
      { x: -0.10, y: -0.02, z: 0.01, sx: 0.85, sy: 0.9, sz: 0.95, rx: -0.14, rz: 0.42, cx: -0.09, cz: -0.08 },
      { x: 0.0, y: 0.0, z: -0.07, sx: 1.05, sy: 1.05, sz: 1.0, rx: -0.45, rz: 0.05, cx: 0.0, cz: -0.12 },
    ];
    for (const w of waveSpecs) {
      const lobe = new THREE.Mesh(trackGeo(createWaveFlameLobeGeometry(w.cx, w.cz)), hairMat);
      lobe.scale.set(w.sx, w.sy, w.sz);
      lobe.position.set(w.x, w.y, w.z);
      lobe.rotation.set(w.rx, 0, w.rz);
      crownGroup.add(lobe);
    }
  } else {
    // Blazing Fiery Flame Crown (matching vatreni_model)
    const flameSpecs: Array<{
      x: number;
      y: number;
      z: number;
      sx: number;
      sy: number;
      sz: number;
      rx: number;
      rz: number;
      cx: number;
      cz: number;
      bright: boolean;
    }> = [
      { x: 0.0, y: 0.04, z: 0.0, sx: 1.35, sy: 1.45, sz: 1.15, rx: -0.08, rz: 0.04, cx: 0.04, cz: -0.05, bright: true },
      { x: -0.10, y: 0.0, z: 0.02, sx: 1.05, sy: 1.15, sz: 0.95, rx: 0.06, rz: 0.28, cx: -0.06, cz: -0.03, bright: false },
      { x: 0.11, y: 0.0, z: 0.02, sx: 1.05, sy: 1.15, sz: 0.95, rx: 0.06, rz: -0.30, cx: 0.06, cz: -0.03, bright: false },
      { x: -0.05, y: 0.01, z: -0.07, sx: 1.0, sy: 1.2, sz: 0.95, rx: -0.22, rz: 0.16, cx: -0.03, cz: -0.06, bright: true },
      { x: 0.06, y: 0.01, z: -0.07, sx: 1.0, sy: 1.2, sz: 0.95, rx: -0.22, rz: -0.16, cx: 0.03, cz: -0.06, bright: true },
    ];
    for (const f of flameSpecs) {
      const tongue = new THREE.Mesh(
        trackGeo(createWaveFlameLobeGeometry(f.cx, f.cz)),
        f.bright ? flameTipMat : hairMat,
      );
      tongue.scale.set(f.sx, f.sy, f.sz);
      tongue.position.set(f.x, f.y, f.z);
      tongue.rotation.set(f.rx, 0, f.rz);
      crownGroup.add(tongue);
    }
  }

  // Spinning Dizzy Stars Halo (shown only while stunned for 3 seconds)
  const dizzyHaloGroup = new THREE.Group();
  dizzyHaloGroup.position.set(0, 0.56, 0);
  dizzyHaloGroup.visible = false;
  head.add(dizzyHaloGroup);

  const starGeo = trackGeo(new THREE.OctahedronGeometry(0.075, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const star = new THREE.Mesh(starGeo, dizzyStarMat);
    star.position.set(Math.cos(a) * 0.34, Math.sin(a * 2) * 0.04, Math.sin(a) * 0.34);
    dizzyHaloGroup.add(star);
  }

  // 5. Thick Muscular Arms + Rounded Hands Gripping Blaster
  const buildArm = (
    sideSign: number,
    isRightWeaponHand: boolean,
  ): { shoulder: THREE.Group; elbow: THREE.Group } => {
    const shoulder = new THREE.Group();
    shoulder.position.set(sideSign * 0.39, 0.42, 0.03);
    torso.add(shoulder);

    // Muscular rounded deltoid shoulder
    const deltoid = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.165, 14, 12)),
      skinMat,
    );
    deltoid.scale.set(1.06, 1.04, 0.96);
    shoulder.add(deltoid);

    // Thick muscular bicep
    const bicep = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.115, 0.16, 6, 12)),
      skinMat,
    );
    bicep.position.set(sideSign * 0.04, -0.15, 0.0);
    shoulder.add(bicep);

    const elbow = new THREE.Group();
    elbow.position.set(sideSign * 0.04, -0.26, 0.01);
    elbow.rotation.x = isRightWeaponHand ? -0.78 : -0.92;
    elbow.rotation.y = isRightWeaponHand ? 0.14 : -0.44;
    shoulder.add(elbow);

    const forearm = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.095, 0.15, 6, 12)),
      skinMat,
    );
    forearm.position.y = -0.11;
    elbow.add(forearm);

    // Rounded mitten hand gripping weapon
    const hand = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.092, 12, 10)),
      skinMat,
    );
    hand.scale.set(0.95, 1.15, 1.0);
    hand.position.y = -0.23;
    elbow.add(hand);

    return { shoulder, elbow };
  };

  const leftArm = buildArm(1, false);
  const leftShoulder = leftArm.shoulder;
  const leftElbow = leftArm.elbow;
  leftShoulder.rotation.set(-0.56, -0.24, -0.18);

  const rightArm = buildArm(-1, true);
  const rightShoulder = rightArm.shoulder;
  const rightElbow = rightArm.elbow;
  rightShoulder.rotation.set(-0.62, 0.08, 0.12);

  // 6. Signature Two-Handed Water / Fire Blaster
  const weaponGroup = new THREE.Group();
  weaponGroup.position.set(-0.18, 0.17, 0.36);
  torso.add(weaponGroup);

  const gunParts = populateSignatureBlaster(
    weaponGroup,
    isHero,
    {
      bodyMat: weaponBodyMat,
      accentMat: weaponAccentMat,
      darkMat: weaponDarkMat,
      energyMat,
      glassMat: tankGlassMat,
      tankCoreMat,
      copperHoseMat,
      gaugeFaceMat,
    },
    trackGeo,
  );

  setShadow(root);

  return {
    role,
    root,
    pelvis,
    torso,
    head,
    leftHip: leftLeg.hip,
    rightHip: rightLeg.hip,
    leftKnee: leftLeg.knee,
    rightKnee: rightLeg.knee,
    leftAnkle: leftLeg.ankle,
    rightAnkle: rightLeg.ankle,
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    weaponGroup,
    muzzleAnchor: gunParts.muzzleAnchor,
    tankCore: gunParts.tankCore,
    tankCoreHalfHeight: gunParts.tankCoreHalfHeight,
    tankCoreMat,
    visorMat,
    dizzyHaloGroup,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

/**
 * Builds a foreground First-Person Weapon Viewmodel rig matching the signature
 * top-bottle Water & Fire blasters from vodeni_model and vatreni_model.
 */
export function buildFirstPersonWeaponRig(
  role: TrooperRole,
  textures: ArenaTextureLibrary,
  isSoftwareGl: boolean,
): FirstPersonWeaponRig {
  const isHero = role === 'hero';
  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const skinMat = trackMat(
    isHero
      ? new THREE.MeshPhysicalMaterial({
          color: 0x45baff,
          roughness: 0.22,
          metalness: 0.05,
          clearcoat: 0.85,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          map: textures.magmaArmorMap,
          emissiveMap: textures.magmaArmorEmissive,
          emissive: new THREE.Color(0xff7208),
          emissiveIntensity: 1.5,
          roughness: 0.26,
          metalness: 0.08,
          clearcoat: 0.55,
        }),
  );

  const bodyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x1b6fe0 : 0xc72318,
      roughness: 0.34,
      metalness: 0.36,
    }),
  );

  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x35e2ef : 0x3a373f,
      roughness: 0.28,
      metalness: 0.26,
    }),
  );

  const darkMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x222630,
      roughness: 0.42,
      metalness: 0.45,
    }),
  );

  const energyMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isHero ? 0x6ef8ff : 0xffaa24,
      emissive: isHero ? 0x00e1ff : 0xff4500,
      emissiveIntensity: 2.3,
      roughness: 0.18,
      metalness: 0.1,
    }),
  );

  const glassMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: isHero ? 0xc2f8ff : 0x3a2016,
      transparent: true,
      opacity: isHero ? 0.46 : 0.42,
      roughness: 0.1,
      metalness: 0.12,
      clearcoat: 1.0,
      depthWrite: false,
    }),
  );

  const copperHoseMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x9c6234,
      bumpMap: textures.ribbedHoseBump,
      bumpScale: 0.04,
      roughness: 0.56,
      metalness: 0.35,
    }),
  );

  const gaugeFaceMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      roughness: 0.4,
      metalness: 0.05,
    }),
  );

  const root = new THREE.Group();
  root.name = isHero ? 'FirstPersonHeroWeapon' : 'FirstPersonVillainWeapon';
  root.visible = false;

  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.30, -0.31, -0.50);
  weaponPivot.rotation.set(0.03, Math.PI + 0.08, 0);
  weaponPivot.scale.setScalar(0.76);
  root.add(weaponPivot);

  const gunParts = populateSignatureBlaster(
    weaponPivot,
    isHero,
    {
      bodyMat,
      accentMat,
      darkMat,
      energyMat,
      glassMat,
      tankCoreMat: energyMat,
      copperHoseMat,
      gaugeFaceMat,
    },
    trackGeo,
  );

  // Stylized chunky muscular arms gripping the signature blaster
  const rightArm = new THREE.Group();
  rightArm.position.set(-0.04, -0.10, -0.05);
  weaponPivot.add(rightArm);

  const rHand = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.072, 12, 10)), skinMat);
  rHand.position.set(0, 0.035, 0.01);
  const rForearm = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.075, 0.18, 6, 12)),
    skinMat,
  );
  rForearm.rotation.x = Math.PI * 0.42;
  rForearm.position.set(-0.03, -0.02, -0.16);
  rightArm.add(rHand, rForearm);

  const leftForearm = new THREE.Group();
  leftForearm.position.set(0.14, -0.09, 0.26);
  weaponPivot.add(leftForearm);

  const lHand = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.07, 12, 10)), skinMat);
  lHand.position.set(-0.09, 0.05, 0.05);
  const lArmMesh = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.072, 0.18, 6, 12)),
    skinMat,
  );
  lArmMesh.rotation.set(Math.PI * 0.42, -0.38, 0);
  lArmMesh.position.set(0.02, -0.02, -0.12);
  leftForearm.add(lHand, lArmMesh);

  if (!isSoftwareGl) {
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = false;
        obj.receiveShadow = true;
      }
    });
  }

  return {
    role,
    root,
    weaponPivot,
    leftForearm,
    muzzleAnchor: gunParts.muzzleAnchor,
    energyMat,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

interface RigAnimState {
  lastElapsed: number;
  moving: number;
  strideDir: number;
  localX: number;
  localZ: number;
  turnRate: number;
  firing: number;
  dizzy: number;
  pelvisY: number;
  torsoTwist: number;
  torsoLean: number;
}

const rigAnimStates = new WeakMap<TrooperRig, RigAnimState>();

function getRigAnimState(rig: TrooperRig, elapsed: number): RigAnimState {
  let st = rigAnimStates.get(rig);
  if (!st) {
    st = {
      lastElapsed: elapsed,
      moving: 0,
      strideDir: 1,
      localX: 0,
      localZ: 0,
      turnRate: 0,
      firing: 0,
      dizzy: 0,
      pelvisY: 0.64,
      torsoTwist: 0,
      torsoLean: 0,
    };
    rigAnimStates.set(rig, st);
  }
  return st;
}

function dampAlpha(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * Math.max(0.001, Math.min(0.05, dt)));
}

export function animateFirstPersonWeapon(
  rig: FirstPersonWeaponRig,
  elapsed: number,
  walkPhase: number,
  speedNorm: number,
  isFiring: boolean,
  ammoRatio: number,
  throwProgress: number,
  isDizzy = false,
): void {
  const moving = Math.min(1.35, Math.max(0, speedNorm));
  const idle = Math.max(0, 1 - moving);

  const dizzyWobbleX = isDizzy ? Math.sin(elapsed * 9.5) * 0.035 : 0;
  const dizzyWobbleZ = isDizzy ? Math.cos(elapsed * 8.2) * 0.14 : 0;

  // Smooth cosine double-frequency stride lift (no sharp bounce cusp)
  const smoothStrideLift = (1 - Math.cos(walkPhase * 2)) * 0.5;
  const bobX = Math.cos(walkPhase) * 0.016 * moving + dizzyWobbleX;
  const bobY = smoothStrideLift * 0.02 * moving + Math.sin(elapsed * 2.1) * 0.005 * idle;
  const recoilZ = isFiring ? 0.036 + Math.sin(elapsed * 42) * 0.012 : 0;
  const recoilPitch = isFiring ? 0.042 + Math.sin(elapsed * 42) * 0.011 : 0;
  const throwDip = Math.sin(throwProgress * Math.PI) * 0.09;

  rig.weaponPivot.position.set(0.30 + bobX, -0.31 - bobY - throwDip, -0.50 + recoilZ);
  rig.weaponPivot.rotation.set(
    0.03 + recoilPitch - throwDip * 1.4,
    Math.PI + 0.08 + bobX * 0.65,
    Math.sin(walkPhase) * 0.026 * moving + dizzyWobbleZ,
  );

  const throwSwing = Math.sin(throwProgress * Math.PI);
  rig.leftForearm.position.set(0.14 - throwSwing * 0.16, -0.09 + throwSwing * 0.18, 0.26 + throwSwing * 0.18);
  rig.leftForearm.rotation.set(-throwSwing * 0.65, 0, 0);

  const clamped = Math.max(0, Math.min(1, ammoRatio));
  rig.energyMat.emissiveIntensity = (0.45 + clamped * 1.95) + (isFiring ? 0.7 : 0);
}

/**
 * Updates procedural idle breathing, smoothly damped athletic running gait,
 * turning bank, grenade throw arc, and Dizzy Bomb 3-second stun wobble + spinning star halo.
 */
export function animateTrooperRig(
  rig: TrooperRig,
  elapsed: number,
  walkPhase: number,
  speedNorm: number,
  localVelX: number,
  localVelZ: number,
  isFiring: boolean,
  ammoRatio = 1,
  turnRate = 0,
  throwProgress = 0,
  isDizzy = false,
): void {
  const st = getRigAnimState(rig, elapsed);
  const dt = Math.max(0.001, Math.min(0.05, elapsed - st.lastElapsed || 0.016));
  st.lastElapsed = elapsed;

  const targetMoving = isDizzy ? 0 : Math.min(1.45, Math.max(0, speedNorm));
  const targetStrideDir = localVelZ < -0.18 ? -1 : 1;

  const aMove = dampAlpha(12, dt);
  const aDir = dampAlpha(10, dt);
  const aPose = dampAlpha(16, dt);

  st.moving += (targetMoving - st.moving) * aMove;
  st.strideDir += (targetStrideDir - st.strideDir) * aDir;
  st.localX += (localVelX - st.localX) * aMove;
  st.localZ += (localVelZ - st.localZ) * aMove;
  st.turnRate += (turnRate - st.turnRate) * aMove;
  st.firing += ((isFiring && !isDizzy ? 1 : 0) - st.firing) * dampAlpha(18, dt);
  st.dizzy += ((isDizzy ? 1 : 0) - st.dizzy) * dampAlpha(14, dt);

  const moving = Math.min(1, st.moving);
  const sprintBoost = Math.max(0, st.moving - 1);
  const idleWeight = 1 - moving;
  const phaseOffset = rig.role === 'hero' ? 0 : 1.7;

  // 1. Pelvis: smooth harmonic double-frequency float (C1 continuous, zero sharp bounces)
  const breath = Math.sin(elapsed * 2.3 + phaseOffset);
  const idleShiftX = Math.sin(elapsed * 1.05 + phaseOffset) * 0.025 * idleWeight;
  const harmonicLift = (1 - Math.cos(walkPhase * 2)) * 0.5; // smooth 0..1 wave
  const strideBounce = (harmonicLift * 0.072 - 0.028) * (moving + sprintBoost * 0.35);
  const fireCrouch = -0.024 * st.firing;

  const targetPelvisY = 0.64 + strideBounce + breath * 0.014 * idleWeight + fireCrouch;
  st.pelvisY += (targetPelvisY - st.pelvisY) * aPose;
  rig.pelvis.position.y = st.pelvisY;

  const strideSwayX = Math.sin(walkPhase) * 0.032 * moving;
  rig.pelvis.position.x =
    st.dizzy * Math.sin(elapsed * 6.5) * 0.045 +
    (1 - st.dizzy) * (idleShiftX + strideSwayX);

  const bankTurn = Math.max(-0.18, Math.min(0.18, st.turnRate * 0.062));
  const dizzyTiltX = Math.sin(elapsed * 5.8) * 0.16;
  const dizzyTiltZ = Math.cos(elapsed * 6.4) * 0.20;
  const runTiltX = Math.max(-0.22, Math.min(0.32, st.localZ * 0.22)) - 0.045 * st.firing;
  const runTiltZ = Math.max(-0.22, Math.min(0.22, -st.localX * 0.17 + bankTurn)) + idleShiftX * 0.6;

  const targetTiltX = runTiltX * (1 - st.dizzy) + dizzyTiltX * st.dizzy;
  const targetTiltZ = runTiltZ * (1 - st.dizzy) + dizzyTiltZ * st.dizzy;

  rig.pelvis.rotation.x += (targetTiltX - rig.pelvis.rotation.x) * aPose;
  rig.pelvis.rotation.z += (targetTiltZ - rig.pelvis.rotation.z) * aPose;
  const targetPelvisYaw = Math.sin(walkPhase) * 0.14 * moving;
  rig.pelvis.rotation.y += (targetPelvisYaw - rig.pelvis.rotation.y) * aPose;

  // 2. Fluid Articulated Running Gait (smooth swing-phase knee drive & ankle heel/toe roll)
  const forwardMag = Math.min(1.15, Math.hypot(st.localZ, st.localX * 0.6));
  const strafeWeight = Math.max(-1, Math.min(1, st.localX));

  const sinW = Math.sin(walkPhase) * st.strideDir;
  const cosW = Math.cos(walkPhase) * st.strideDir;
  const hipAmplitude = 0.66 + sprintBoost * 0.22;

  const targetLeftHipX = sinW * hipAmplitude * moving * forwardMag;
  const targetRightHipX = -sinW * hipAmplitude * moving * forwardMag;
  rig.leftHip.rotation.x += (targetLeftHipX - rig.leftHip.rotation.x) * aPose;
  rig.rightHip.rotation.x += (targetRightHipX - rig.rightHip.rotation.x) * aPose;

  const strafeStep = Math.sin(walkPhase) * 0.19 * strafeWeight * moving;
  rig.leftHip.rotation.z += (0.04 * idleWeight + strafeStep - rig.leftHip.rotation.z) * aPose;
  rig.rightHip.rotation.z += (-0.04 * idleWeight - strafeStep - rig.rightHip.rotation.z) * aPose;

  // Smooth knee flexion: high knee tuck during forward swing (cosW < 0), gentle cushion during stance
  const leftSwingKnee = (0.5 - 0.5 * cosW) * (0.86 + sprintBoost * 0.24);
  const leftStanceKnee = (0.5 + 0.5 * Math.max(0, sinW)) * 0.24;
  const rightSwingKnee = (0.5 + 0.5 * cosW) * (0.86 + sprintBoost * 0.24);
  const rightStanceKnee = (0.5 + 0.5 * Math.max(0, -sinW)) * 0.24;

  const targetLeftKnee = (0.06 + Math.max(leftSwingKnee, leftStanceKnee)) * moving + 0.04 * idleWeight;
  const targetRightKnee = (0.06 + Math.max(rightSwingKnee, rightStanceKnee)) * moving + 0.04 * idleWeight;
  rig.leftKnee.rotation.x += (targetLeftKnee - rig.leftKnee.rotation.x) * aPose;
  rig.rightKnee.rotation.x += (targetRightKnee - rig.rightKnee.rotation.x) * aPose;

  // Smooth ankle toe-off & heel-strike articulation
  const targetLeftAnkle = (-sinW * 0.34 - (0.5 + 0.5 * cosW) * 0.18) * moving;
  const targetRightAnkle = (sinW * 0.34 - (0.5 - 0.5 * cosW) * 0.18) * moving;
  rig.leftAnkle.rotation.x += (targetLeftAnkle - rig.leftAnkle.rotation.x) * aPose;
  rig.rightAnkle.rotation.x += (targetRightAnkle - rig.rightAnkle.rotation.x) * aPose;

  // 3. Upper-Body Counter-Twist, Lean & Dizzy Halo
  const throwArc = Math.sin(throwProgress * Math.PI);
  const throwTwist = -throwArc * 0.46;

  const targetTorsoTwist = -Math.sin(walkPhase) * 0.15 * moving + throwTwist;
  const targetTorsoLean =
    (0.08 + sprintBoost * 0.14) * moving +
    breath * 0.022 * idleWeight +
    throwArc * 0.18 +
    (st.firing * Math.sin(elapsed * 42) * 0.016);
  st.torsoTwist += (targetTorsoTwist - st.torsoTwist) * aPose;
  st.torsoLean += (targetTorsoLean - st.torsoLean) * aPose;

  rig.torso.rotation.y = st.torsoTwist;
  rig.torso.rotation.x = st.torsoLean;

  const idleHeadScan = Math.sin(elapsed * 0.82 + phaseOffset) * 0.12 * idleWeight;
  const headTurnLead = Math.max(-0.28, Math.min(0.28, -st.turnRate * 0.09));
  const targetHeadY =
    st.dizzy * Math.sin(elapsed * 7.2) * 0.32 +
    (1 - st.dizzy) * (-rig.torso.rotation.y * 0.45 + idleHeadScan + headTurnLead);
  const targetHeadX =
    st.dizzy * Math.cos(elapsed * 6.0) * 0.14 +
    (1 - st.dizzy) * (-0.05 * moving + breath * 0.018 * idleWeight);
  const targetHeadZ =
    st.dizzy * Math.sin(elapsed * 5.2) * 0.16 +
    (1 - st.dizzy) * (-bankTurn * 0.32);

  rig.head.rotation.y += (targetHeadY - rig.head.rotation.y) * aPose;
  rig.head.rotation.x += (targetHeadX - rig.head.rotation.x) * aPose;
  rig.head.rotation.z += (targetHeadZ - rig.head.rotation.z) * aPose;

  rig.dizzyHaloGroup.visible = isDizzy;
  if (isDizzy) {
    rig.dizzyHaloGroup.rotation.y = elapsed * 5.4;
    rig.dizzyHaloGroup.position.y = 0.56 + Math.sin(elapsed * 8.0) * 0.04;
  }

  // 4. Signature Blaster Carry, Fluid Arm Pump & Throw Motion
  const recoilZ = st.firing * (Math.sin(elapsed * 45) * 0.024 - 0.03);
  const bobWepY = harmonicLift * 0.022 * moving;
  rig.weaponGroup.position.set(
    -0.18 + Math.cos(walkPhase) * 0.014 * moving,
    0.17 + bobWepY + breath * 0.012 * idleWeight,
    0.36 + recoilZ,
  );
  rig.weaponGroup.rotation.set(
    -0.04 * st.firing + Math.sin(walkPhase * 2) * 0.025 * moving + st.dizzy * 0.25,
    Math.cos(walkPhase) * 0.038 * moving,
    Math.sin(walkPhase) * 0.042 * moving,
  );

  const armPump = Math.sin(walkPhase) * (0.17 + sprintBoost * 0.07) * moving;
  const targetLShoulderX = -0.56 + armPump + breath * 0.025 - throwArc * 1.45;
  const targetLShoulderZ = -0.18 + throwArc * 0.35;
  const targetLElbowX = -0.92 - (0.5 + 0.5 * Math.cos(walkPhase)) * 0.16 * moving + throwArc * 0.55;

  const targetRShoulderX = -0.62 - armPump * 0.85 + breath * 0.025 - 0.05 * st.firing;
  const targetRElbowX = -0.78 - (0.5 - 0.5 * Math.cos(walkPhase)) * 0.14 * moving;

  rig.leftShoulder.rotation.x += (targetLShoulderX - rig.leftShoulder.rotation.x) * aPose;
  rig.leftShoulder.rotation.z += (targetLShoulderZ - rig.leftShoulder.rotation.z) * aPose;
  rig.leftElbow.rotation.x += (targetLElbowX - rig.leftElbow.rotation.x) * aPose;

  rig.rightShoulder.rotation.x += (targetRShoulderX - rig.rightShoulder.rotation.x) * aPose;
  rig.rightElbow.rotation.x += (targetRElbowX - rig.rightElbow.rotation.x) * aPose;

  // 5. Top-Bottle Tank Liquid/Magma Depletion & Sunglasses Sheen
  const clampedAmmo = Math.max(0, Math.min(1, ammoRatio));
  const visualFill = Math.max(0.02, clampedAmmo);
  rig.tankCore.scale.y = visualFill;
  rig.tankCore.position.y = -rig.tankCoreHalfHeight * (1 - visualFill);
  rig.tankCore.visible = clampedAmmo > 0.005;

  const lowPulse = clampedAmmo > 0 && clampedAmmo < 0.22 ? 0.55 + 0.45 * Math.sin(elapsed * 12) : 1;
  const baseGlow = (0.35 + clampedAmmo * 1.8) * lowPulse;
  rig.tankCoreMat.emissiveIntensity = baseGlow + 0.55 * st.firing;
  rig.visorMat.emissiveIntensity = 0.55 + Math.sin(elapsed * 2.1) * 0.08;
}

/**
 * Animates a trooper on or beside the Post-Match 3D Victory Podium.
 * Zero per-frame heap allocations.
 */
export function animateTrooperPodiumPose(
  rig: TrooperRig,
  elapsed: number,
  pose: 'victory' | 'defeat' | 'draw',
  slotOffset = 0,
): void {
  rig.dizzyHaloGroup.visible = false;
  rig.tankCore.scale.y = 1;
  rig.tankCore.position.y = 0;
  rig.tankCore.visible = true;

  if (pose === 'victory') {
    const phase = elapsed * 4.4 + slotOffset * 1.15;
    const rawWave = Math.sin(phase);
    const jumpArc = Math.max(0, rawWave);
    const airLift = Math.pow(jumpArc, 0.72) * 0.46;
    const crouchCatch = Math.max(0, -rawWave) * 0.06;

    // Energetic celebratory jump & cheer bounce
    rig.pelvis.position.set(Math.sin(phase * 0.5) * 0.04, 0.64 + airLift - crouchCatch, 0);
    rig.pelvis.rotation.set(-0.05 * jumpArc, Math.sin(phase * 0.5) * 0.14, 0);

    // Legs tuck smoothly mid-jump and absorb landing
    const kneeFlex = 0.08 + jumpArc * 0.52 + crouchCatch * 4.5;
    rig.leftHip.rotation.set(-jumpArc * 0.36, 0, 0.08);
    rig.rightHip.rotation.set(-jumpArc * 0.28, 0, -0.08);
    rig.leftKnee.rotation.set(kneeFlex, 0, 0);
    rig.rightKnee.rotation.set(kneeFlex * 0.92, 0, 0);
    rig.leftAnkle.rotation.set(jumpArc * 0.25, 0, 0);
    rig.rightAnkle.rotation.set(jumpArc * 0.22, 0, 0);

    // Heroic chest tilt & crowd cheer glance
    rig.torso.rotation.set(-0.08 + jumpArc * 0.06, Math.sin(phase * 0.5) * 0.16, 0);
    rig.head.rotation.set(-0.14 - jumpArc * 0.1, Math.sin(elapsed * 2.2 + slotOffset) * 0.24, 0);

    // Left arm flex / fist pump high in celebration
    const pump = Math.cos(phase * 2) * 0.28;
    rig.leftShoulder.rotation.set(-2.15 + pump, 0, -0.45);
    rig.leftElbow.rotation.set(-1.18 + pump * 0.35, 0, 0);

    // Right arm & Watergun/Firegun raised and pumping skyward!
    const wepPump = Math.sin(phase * 2) * 0.24;
    rig.rightShoulder.rotation.set(-2.42 + wepPump, 0, 0.22);
    rig.rightElbow.rotation.set(-0.42, 0, 0);
    rig.weaponGroup.position.set(-0.34, 0.88 + Math.sin(phase * 2) * 0.09, 0.12);
    rig.weaponGroup.rotation.set(-1.18 + wepPump * 0.85, -0.16, 0.24);

    rig.tankCoreMat.emissiveIntensity = 1.9 + Math.sin(elapsed * 6.5) * 0.4;
    rig.visorMat.emissiveIntensity = 0.92 + Math.sin(elapsed * 4.0) * 0.12;
    return;
  }

  if (pose === 'defeat') {
    const sigh = Math.sin(elapsed * 1.55 + slotOffset);
    rig.pelvis.position.set(0, 0.58 + sigh * 0.012, 0);
    rig.pelvis.rotation.set(0.08, 0, 0);

    rig.leftHip.rotation.set(-0.12, 0, 0.05);
    rig.rightHip.rotation.set(-0.08, 0, -0.05);
    rig.leftKnee.rotation.set(0.24, 0, 0);
    rig.rightKnee.rotation.set(0.2, 0, 0);
    rig.leftAnkle.rotation.set(-0.08, 0, 0);
    rig.rightAnkle.rotation.set(-0.08, 0, 0);

    // Slumped shoulders and bowed shaking head
    rig.torso.rotation.set(0.32 + sigh * 0.025, 0, 0);
    rig.head.rotation.set(0.38 + sigh * 0.04, Math.sin(elapsed * 1.15 + slotOffset) * 0.18, 0);

    rig.leftShoulder.rotation.set(0.18, 0, -0.14);
    rig.leftElbow.rotation.set(-0.22, 0, 0);
    rig.rightShoulder.rotation.set(0.2, 0, 0.16);
    rig.rightElbow.rotation.set(-0.26, 0, 0);

    rig.weaponGroup.position.set(-0.24, -0.08, 0.26);
    rig.weaponGroup.rotation.set(0.72, 0.08, 0.18);

    rig.tankCoreMat.emissiveIntensity = 0.28;
    rig.visorMat.emissiveIntensity = 0.22;
    return;
  }

  // Draw: confident salute stance
  const breath = Math.sin(elapsed * 2.1 + slotOffset);
  rig.pelvis.position.set(0, 0.64 + breath * 0.014, 0);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.leftHip.rotation.set(0, 0, 0.04);
  rig.rightHip.rotation.set(0, 0, -0.04);
  rig.leftKnee.rotation.set(0.04, 0, 0);
  rig.rightKnee.rotation.set(0.04, 0, 0);
  rig.leftAnkle.rotation.set(0, 0, 0);
  rig.rightAnkle.rotation.set(0, 0, 0);
  rig.torso.rotation.set(0.02 * breath, 0, 0);
  rig.head.rotation.set(-0.02, Math.sin(elapsed * 0.9 + slotOffset) * 0.12, 0);
  rig.leftShoulder.rotation.set(-0.46, 0, -0.16);
  rig.leftElbow.rotation.set(-0.82, 0, 0);
  rig.rightShoulder.rotation.set(-0.52, 0, 0.12);
  rig.rightElbow.rotation.set(-0.74, 0, 0);
  rig.weaponGroup.position.set(-0.18, 0.17 + breath * 0.012, 0.36);
  rig.weaponGroup.rotation.set(0, 0, 0);
  rig.tankCoreMat.emissiveIntensity = 1.25;
  rig.visorMat.emissiveIntensity = 0.55;
}

