import * as THREE from 'three';
import { computeParabolicLaunch, DIZZY_BOMB_RADIUS, GRENADE_AOE_RADIUS } from './gameMechanics';
import { TerrainSimulation } from './terrainState';
import { TrooperRole } from './trooperBuilder';

export type BombKind = 'elemental' | 'dizzy';

export interface PersonalRechargeSign {
  ownerId: number;
  role: TrooperRole;
  isViewerOwner: boolean;
  active: boolean;
  x: number;
  z: number;
  root: THREE.Group;
  core: THREE.Mesh;
  ringA: THREE.Mesh;
  ringB: THREE.Mesh;
  signGroup: THREE.Group;
  orbiters: THREE.Mesh[];
  beam: THREE.Mesh;
  halo: THREE.Mesh;
}

export interface PersonalBombPickup {
  ownerId: number;
  role: TrooperRole;
  kind: BombKind;
  isViewerOwner: boolean;
  active: boolean;
  x: number;
  z: number;
  root: THREE.Group;
  body: THREE.Group;
  halo: THREE.Mesh;
}

interface ActiveThrownGrenade {
  active: boolean;
  kind: BombKind;
  role: TrooperRole;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  flightElapsed: number;
  flightTime: number;
  mesh: THREE.Group;
  heroCore: THREE.Mesh;
  villainCore: THREE.Mesh;
  dizzyCore: THREE.Mesh;
  dizzyRing: THREE.Mesh;
}

interface ShockwavePulse {
  active: boolean;
  kind: BombKind;
  role: TrooperRole;
  targetRadius: number;
  age: number;
  duration: number;
  ringMesh: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  domeMesh: THREE.Mesh;
  domeMat: THREE.MeshBasicMaterial;
}

export interface GrenadeImpactEvent {
  kind: BombKind;
  role: TrooperRole;
  x: number;
  y: number;
  z: number;
  radius: number;
}

const MAX_THROWN_GRENADES = 8;

export class PickupAndGrenadeSystem {
  readonly personalSigns = new Map<number, PersonalRechargeSign>();
  readonly personalGrenades = new Map<number, PersonalBombPickup>();
  readonly personalDizzyBombs = new Map<number, PersonalBombPickup>();

  readonly thrownPool: ActiveThrownGrenade[] = [];
  private readonly explosionLight: THREE.PointLight;
  private readonly shockwaves: ShockwavePulse[] = [];

  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(
    parent: THREE.Group,
    trooperOwners: ReadonlyArray<{ id: number; role: TrooperRole; isPlayer: boolean }>,
  ) {
    const sharedPickupAssets = this.createSharedPickupAssets();

    for (let i = 0; i < trooperOwners.length; i++) {
      const owner = trooperOwners[i];
      const sign = this.createRechargeSignVisual(owner.id, owner.role, owner.isPlayer, parent);
      this.personalSigns.set(owner.id, sign);

      const grenade = this.createGrenadePickupVisual(
        owner.id,
        owner.role,
        owner.isPlayer,
        parent,
        sharedPickupAssets,
      );
      this.personalGrenades.set(owner.id, grenade);

      const dizzy = this.createDizzyPickupVisual(
        owner.id,
        owner.role,
        owner.isPlayer,
        parent,
        sharedPickupAssets,
      );
      this.personalDizzyBombs.set(owner.id, dizzy);
    }

    // Pooled thrown grenade & dizzy bomb meshes
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x262c36,
      metalness: 0.85,
      roughness: 0.25,
    });
    const bandGeo = new THREE.CylinderGeometry(0.19, 0.19, 0.09, 14);
    const capGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.08, 10);
    const coreGeo = new THREE.OctahedronGeometry(0.18, 2);
    const dizzyRingGeo = new THREE.TorusGeometry(0.26, 0.032, 8, 20);
    const heroCoreMat = new THREE.MeshStandardMaterial({
      color: 0x8ef9ff,
      emissive: 0x00e5ff,
      emissiveIntensity: 2.6,
      roughness: 0.15,
    });
    const villainCoreMat = new THREE.MeshStandardMaterial({
      color: 0xff8a47,
      emissive: 0xff3b00,
      emissiveIntensity: 2.7,
      roughness: 0.18,
    });
    const dizzyCoreMat = new THREE.MeshStandardMaterial({
      color: 0xe879f9,
      emissive: 0xa855f7,
      emissiveIntensity: 2.6,
      roughness: 0.18,
    });
    const dizzyRingMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      emissive: 0xfacc15,
      emissiveIntensity: 2.3,
      roughness: 0.2,
    });

    for (let i = 0; i < MAX_THROWN_GRENADES; i++) {
      const mesh = new THREE.Group();
      mesh.visible = false;
      const band = new THREE.Mesh(bandGeo, shellMat);
      const cap = new THREE.Mesh(capGeo, shellMat);
      cap.position.y = 0.2;
      const heroCore = new THREE.Mesh(coreGeo, heroCoreMat);
      const villainCore = new THREE.Mesh(coreGeo, villainCoreMat);
      const dizzyCore = new THREE.Mesh(coreGeo, dizzyCoreMat);
      const dizzyRing = new THREE.Mesh(dizzyRingGeo, dizzyRingMat);
      dizzyRing.rotation.x = Math.PI * 0.35;
      mesh.add(band, cap, heroCore, villainCore, dizzyCore, dizzyRing);
      parent.add(mesh);

      this.thrownPool.push({
        active: false,
        kind: 'elemental',
        role: 'hero',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        flightElapsed: 0,
        flightTime: 1,
        mesh,
        heroCore,
        villainCore,
        dizzyCore,
        dizzyRing,
      });
    }

    // Dynamic explosion flash PointLight
    this.explosionLight = new THREE.PointLight(0x22eeff, 0, 22, 1.4);
    parent.add(this.explosionLight);

    // Pooled shockwave rings & blast domes
    for (let i = 0; i < 6; i++) {
      const ringGeo = new THREE.RingGeometry(0.76, 1.0, 48);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x22eeff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.visible = false;

      const domeGeo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const domeMat = new THREE.MeshBasicMaterial({
        color: 0x22eeff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const domeMesh = new THREE.Mesh(domeGeo, domeMat);
      domeMesh.visible = false;

      parent.add(ringMesh, domeMesh);
      this.shockwaves.push({
        active: false,
        kind: 'elemental',
        role: 'hero',
        targetRadius: GRENADE_AOE_RADIUS,
        age: 0,
        duration: 0.55,
        ringMesh,
        ringMat,
        domeMesh,
        domeMat,
      });
      this.disposables.push(ringGeo, ringMat, domeGeo, domeMat);
    }

    this.disposables.push(
      shellMat,
      bandGeo,
      capGeo,
      coreGeo,
      dizzyRingGeo,
      heroCoreMat,
      villainCoreMat,
      dizzyCoreMat,
      dizzyRingMat,
    );
  }

  private createRechargeSignVisual(
    ownerId: number,
    role: TrooperRole,
    isViewerOwner: boolean,
    parent: THREE.Group,
  ): PersonalRechargeSign {
    const isHero = role === 'hero';
    const root = new THREE.Group();
    root.visible = false;
    root.name = isHero ? `PersonalBlueRechargeSign_${ownerId}` : `PersonalRedRechargeSign_${ownerId}`;

    // Vivid Blue for Hero (Water), vivid Red for Villain (Fire)
    const baseHex = isHero ? 0x24b4ff : 0xff2b1f;
    const emissiveHex = isHero ? 0x0090ff : 0xff1e0e;
    const brightHex = isHero ? 0x9ef4ff : 0xff9f8c;

    const coreGeo = new THREE.SphereGeometry(0.4, 20, 16);
    const coreMat = new THREE.MeshPhysicalMaterial({
      color: baseHex,
      emissive: emissiveHex,
      emissiveIntensity: 2.3,
      roughness: 0.12,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 1.15;
    root.add(core);

    const ringGeo = new THREE.TorusGeometry(0.64, 0.042, 10, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: brightHex,
      emissive: baseHex,
      emissiveIntensity: 2.1,
      roughness: 0.2,
    });
    const ringA = new THREE.Mesh(ringGeo, ringMat);
    ringA.position.y = 1.15;
    const ringB = new THREE.Mesh(ringGeo, ringMat);
    ringB.position.y = 1.15;
    root.add(ringA, ringB);

    // Floating 3D Recharge Sign Crest (Hexagonal frame + downward pointer arrow + glowing core sign)
    const signGroup = new THREE.Group();
    signGroup.position.y = 2.45;
    root.add(signGroup);

    const signFrameGeo = new THREE.TorusGeometry(0.46, 0.055, 8, 6);
    const signFrameMat = new THREE.MeshStandardMaterial({
      color: brightHex,
      emissive: emissiveHex,
      emissiveIntensity: 2.4,
      roughness: 0.18,
      metalness: 0.45,
    });
    const signFrame = new THREE.Mesh(signFrameGeo, signFrameMat);
    signGroup.add(signFrame);

    const signDiamondGeo = new THREE.OctahedronGeometry(0.24, 0);
    signDiamondGeo.scale(0.85, 1.2, 0.45);
    const signDiamond = new THREE.Mesh(signDiamondGeo, coreMat);
    signGroup.add(signDiamond);

    const arrowGeo = new THREE.ConeGeometry(0.2, 0.34, 4);
    arrowGeo.rotateX(Math.PI);
    const arrowMesh = new THREE.Mesh(arrowGeo, signFrameMat);
    arrowMesh.position.y = -0.62;
    signGroup.add(arrowMesh);

    const orbiterGeo = isHero ? new THREE.SphereGeometry(0.08, 8, 6) : new THREE.OctahedronGeometry(0.09, 0);
    const orbiterMat = new THREE.MeshStandardMaterial({
      color: brightHex,
      emissive: baseHex,
      emissiveIntensity: 2.6,
      roughness: 0.18,
    });
    const orbiters: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(orbiterGeo, orbiterMat);
      root.add(m);
      orbiters.push(m);
    }

    // Soft vertical beacon beam so the owner can spot their personal sign across the arena
    const beamGeo = new THREE.CylinderGeometry(0.16, 0.56, 8.2, 18, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color: baseHex,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 4.15;
    root.add(beam);

    const haloGeo = new THREE.RingGeometry(0.76, 1.06, 32);
    haloGeo.rotateX(-Math.PI / 2);
    const haloMat = new THREE.MeshBasicMaterial({
      color: baseHex,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.06;
    root.add(halo);

    parent.add(root);
    this.disposables.push(
      coreGeo,
      coreMat,
      ringGeo,
      ringMat,
      signFrameGeo,
      signFrameMat,
      signDiamondGeo,
      arrowGeo,
      orbiterGeo,
      orbiterMat,
      beamGeo,
      beamMat,
      haloGeo,
      haloMat,
    );

    return {
      ownerId,
      role,
      isViewerOwner,
      active: false,
      x: 0,
      z: 0,
      root,
      core,
      ringA,
      ringB,
      signGroup,
      orbiters,
      beam,
      halo,
    };
  }

  private createSharedPickupAssets() {
    const gCoreGeo = new THREE.OctahedronGeometry(0.28, 2);
    const gHeroCoreMat = new THREE.MeshStandardMaterial({
      color: 0x99fbff,
      emissive: 0x00e5ff,
      emissiveIntensity: 2.3,
      roughness: 0.16,
      metalness: 0.15,
    });
    const gVillainCoreMat = new THREE.MeshStandardMaterial({
      color: 0xff6333,
      emissive: 0xe61c00,
      emissiveIntensity: 2.3,
      roughness: 0.16,
      metalness: 0.15,
    });
    const gHeroCasingMat = new THREE.MeshStandardMaterial({
      color: 0x1b3044,
      metalness: 0.85,
      roughness: 0.24,
    });
    const gVillainCasingMat = new THREE.MeshStandardMaterial({
      color: 0x22181c,
      metalness: 0.85,
      roughness: 0.24,
    });
    const gBandGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.12, 16);
    const gCollarGeo = new THREE.CylinderGeometry(0.11, 0.16, 0.12, 12);
    const gPinGeo = new THREE.TorusGeometry(0.08, 0.018, 6, 16);
    const gHeroPinMat = new THREE.MeshStandardMaterial({
      color: 0xe0b457,
      metalness: 0.9,
      roughness: 0.2,
    });
    const gVillainPinMat = new THREE.MeshStandardMaterial({
      color: 0xff8c2b,
      metalness: 0.9,
      roughness: 0.2,
    });
    const gHaloGeo = new THREE.RingGeometry(0.55, 0.72, 28);
    gHaloGeo.rotateX(-Math.PI / 2);
    const gHeroHaloMat = new THREE.MeshBasicMaterial({
      color: 0x26f0ff,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const gVillainHaloMat = new THREE.MeshBasicMaterial({
      color: 0xff3b14,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const dSphereGeo = new THREE.SphereGeometry(0.24, 18, 14);
    const dSphereMat = new THREE.MeshStandardMaterial({
      color: 0xd946ef,
      emissive: 0x9333ea,
      emissiveIntensity: 2.2,
      roughness: 0.16,
      metalness: 0.25,
    });
    const dRingGeo = new THREE.TorusGeometry(0.39, 0.036, 8, 28);
    const dStarMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 2.4,
      roughness: 0.18,
    });
    const dMiniStarGeo = new THREE.OctahedronGeometry(0.068, 0);
    const dCapGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.11, 10);
    const dHeroCapMat = new THREE.MeshStandardMaterial({
      color: 0x164e63,
      metalness: 0.8,
      roughness: 0.25,
    });
    const dVillainCapMat = new THREE.MeshStandardMaterial({
      color: 0x451a03,
      metalness: 0.8,
      roughness: 0.25,
    });
    const dHaloGeo = new THREE.RingGeometry(0.52, 0.72, 28);
    dHaloGeo.rotateX(-Math.PI / 2);
    const dHaloMat = new THREE.MeshBasicMaterial({
      color: 0xd946ef,
      transparent: true,
      opacity: 0.78,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.disposables.push(
      gCoreGeo,
      gHeroCoreMat,
      gVillainCoreMat,
      gHeroCasingMat,
      gVillainCasingMat,
      gBandGeo,
      gCollarGeo,
      gPinGeo,
      gHeroPinMat,
      gVillainPinMat,
      gHaloGeo,
      gHeroHaloMat,
      gVillainHaloMat,
      dSphereGeo,
      dSphereMat,
      dRingGeo,
      dStarMat,
      dMiniStarGeo,
      dCapGeo,
      dHeroCapMat,
      dVillainCapMat,
      dHaloGeo,
      dHaloMat,
    );

    return {
      gCoreGeo,
      gHeroCoreMat,
      gVillainCoreMat,
      gHeroCasingMat,
      gVillainCasingMat,
      gBandGeo,
      gCollarGeo,
      gPinGeo,
      gHeroPinMat,
      gVillainPinMat,
      gHaloGeo,
      gHeroHaloMat,
      gVillainHaloMat,
      dSphereGeo,
      dSphereMat,
      dRingGeo,
      dStarMat,
      dMiniStarGeo,
      dCapGeo,
      dHeroCapMat,
      dVillainCapMat,
      dHaloGeo,
      dHaloMat,
    };
  }

  private createGrenadePickupVisual(
    ownerId: number,
    role: TrooperRole,
    isViewerOwner: boolean,
    parent: THREE.Group,
    assets: ReturnType<PickupAndGrenadeSystem['createSharedPickupAssets']>,
  ): PersonalBombPickup {
    const isHero = role === 'hero';
    const root = new THREE.Group();
    root.visible = false;
    root.name = isHero ? `PersonalHeroGrenade_${ownerId}` : `PersonalVillainGrenade_${ownerId}`;

    const body = new THREE.Group();
    body.position.y = 0.95;
    root.add(body);

    const core = new THREE.Mesh(
      assets.gCoreGeo,
      isHero ? assets.gHeroCoreMat : assets.gVillainCoreMat,
    );
    body.add(core);

    const casingMat = isHero ? assets.gHeroCasingMat : assets.gVillainCasingMat;
    const band = new THREE.Mesh(assets.gBandGeo, casingMat);
    body.add(band);

    const collar = new THREE.Mesh(assets.gCollarGeo, casingMat);
    collar.position.y = 0.28;
    body.add(collar);

    const pin = new THREE.Mesh(
      assets.gPinGeo,
      isHero ? assets.gHeroPinMat : assets.gVillainPinMat,
    );
    pin.position.set(0.09, 0.34, 0);
    body.add(pin);

    const halo = new THREE.Mesh(
      assets.gHaloGeo,
      isHero ? assets.gHeroHaloMat : assets.gVillainHaloMat,
    );
    halo.position.y = 0.05;
    root.add(halo);

    parent.add(root);

    return {
      ownerId,
      role,
      kind: 'elemental',
      isViewerOwner,
      active: false,
      x: 0,
      z: 0,
      root,
      body,
      halo,
    };
  }

  private createDizzyPickupVisual(
    ownerId: number,
    role: TrooperRole,
    isViewerOwner: boolean,
    parent: THREE.Group,
    assets: ReturnType<PickupAndGrenadeSystem['createSharedPickupAssets']>,
  ): PersonalBombPickup {
    const isHero = role === 'hero';
    const root = new THREE.Group();
    root.visible = false;
    root.name = isHero ? `PersonalHeroDizzy_${ownerId}` : `PersonalVillainDizzy_${ownerId}`;

    const body = new THREE.Group();
    body.position.y = 0.98;
    root.add(body);

    body.add(new THREE.Mesh(assets.dSphereGeo, assets.dSphereMat));

    const ring = new THREE.Mesh(assets.dRingGeo, assets.dStarMat);
    ring.rotation.x = Math.PI * 0.34;
    body.add(ring);

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const star = new THREE.Mesh(assets.dMiniStarGeo, assets.dStarMat);
      star.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.18, Math.sin(a) * 0.4);
      body.add(star);
    }

    const cap = new THREE.Mesh(
      assets.dCapGeo,
      isHero ? assets.dHeroCapMat : assets.dVillainCapMat,
    );
    cap.position.y = 0.25;
    body.add(cap);

    const halo = new THREE.Mesh(assets.dHaloGeo, assets.dHaloMat);
    halo.position.y = 0.05;
    root.add(halo);

    parent.add(root);

    return {
      ownerId,
      role,
      kind: 'dizzy',
      isViewerOwner,
      active: false,
      x: 0,
      z: 0,
      root,
      body,
      halo,
    };
  }

  getSignForOwner(ownerId: number): PersonalRechargeSign | undefined {
    return this.personalSigns.get(ownerId);
  }

  getGrenadePickupForOwner(ownerId: number): PersonalBombPickup | undefined {
    return this.personalGrenades.get(ownerId);
  }

  getDizzyPickupForOwner(ownerId: number): PersonalBombPickup | undefined {
    return this.personalDizzyBombs.get(ownerId);
  }

  spawnPersonalSign(ownerId: number, x: number, z: number, terrain: TerrainSimulation): void {
    const sign = this.personalSigns.get(ownerId);
    if (!sign) return;
    sign.active = true;
    sign.x = x;
    sign.z = z;
    sign.root.position.set(x, terrain.sampleHeight(x, z), z);
    // Only the owner player sees their personal recharge sign in the 3D scene
    sign.root.visible = sign.isViewerOwner;
  }

  clearPersonalSign(ownerId: number): void {
    const sign = this.personalSigns.get(ownerId);
    if (!sign) return;
    sign.active = false;
    sign.root.visible = false;
  }

  spawnPersonalGrenade(ownerId: number, x: number, z: number, terrain: TerrainSimulation): void {
    const g = this.personalGrenades.get(ownerId);
    if (!g) return;
    g.active = true;
    g.x = x;
    g.z = z;
    g.root.position.set(x, terrain.sampleHeight(x, z), z);
    // Only the owner player can see their personal elemental grenade pickup
    g.root.visible = g.isViewerOwner;
  }

  clearPersonalGrenade(ownerId: number): void {
    const g = this.personalGrenades.get(ownerId);
    if (!g) return;
    g.active = false;
    g.root.visible = false;
  }

  spawnPersonalDizzy(ownerId: number, x: number, z: number, terrain: TerrainSimulation): void {
    const d = this.personalDizzyBombs.get(ownerId);
    if (!d) return;
    d.active = true;
    d.x = x;
    d.z = z;
    d.root.position.set(x, terrain.sampleHeight(x, z), z);
    // Only the owner player can see their personal dizzy bomb pickup
    d.root.visible = d.isViewerOwner;
  }

  clearPersonalDizzy(ownerId: number): void {
    const d = this.personalDizzyBombs.get(ownerId);
    if (!d) return;
    d.active = false;
    d.root.visible = false;
  }

  launchGrenade(
    role: TrooperRole,
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
  ): boolean {
    return this.launchProjectile('elemental', role, startX, startY, startZ, targetX, targetY, targetZ);
  }

  launchDizzyBomb(
    role: TrooperRole,
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
  ): boolean {
    return this.launchProjectile('dizzy', role, startX, startY, startZ, targetX, targetY, targetZ);
  }

  private launchProjectile(
    kind: BombKind,
    role: TrooperRole,
    startX: number,
    startY: number,
    startZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
  ): boolean {
    const slot = this.thrownPool.find((g) => !g.active);
    if (!slot) return false;
    const launch = computeParabolicLaunch(startX, startY, startZ, targetX, targetY, targetZ, 18.0);
    slot.active = true;
    slot.kind = kind;
    slot.role = role;
    slot.x = startX;
    slot.y = startY;
    slot.z = startZ;
    slot.vx = launch.vx;
    slot.vy = launch.vy;
    slot.vz = launch.vz;
    slot.flightElapsed = 0;
    slot.flightTime = launch.flightTime;

    slot.mesh.position.set(startX, startY, startZ);
    slot.heroCore.visible = kind === 'elemental' && role === 'hero';
    slot.villainCore.visible = kind === 'elemental' && role === 'villain';
    slot.dizzyCore.visible = kind === 'dizzy';
    slot.dizzyRing.visible = kind === 'dizzy';
    slot.mesh.visible = true;
    return true;
  }

  private triggerShockwave(
    role: TrooperRole,
    kind: BombKind,
    x: number,
    y: number,
    z: number,
  ): void {
    const isHero = role === 'hero';
    const isDizzy = kind === 'dizzy';
    this.explosionLight.color.setHex(isDizzy ? 0xd946ef : isHero ? 0x1eeeff : 0xff5a12);
    this.explosionLight.position.set(x, y + 1.8, z);
    this.explosionLight.intensity = isDizzy ? 14.0 : 18.0;

    const slot = this.shockwaves.find((s) => !s.active) ?? this.shockwaves[0];
    slot.active = true;
    slot.kind = kind;
    slot.role = role;
    slot.targetRadius = isDizzy ? DIZZY_BOMB_RADIUS : GRENADE_AOE_RADIUS;
    slot.age = 0;
    slot.duration = isDizzy ? 0.48 : 0.58;
    slot.ringMat.color.setHex(isDizzy ? 0xfacc15 : isHero ? 0x66f6ff : 0xff6e1a);
    slot.domeMat.color.setHex(isDizzy ? 0xc026d3 : isHero ? 0x22e8ff : 0xff4500);
    slot.ringMesh.position.set(x, y + 0.12, z);
    slot.domeMesh.position.set(x, y + 0.04, z);
    slot.ringMesh.visible = true;
    slot.domeMesh.visible = true;
  }

  step(
    dt: number,
    elapsed: number,
    terrain: TerrainSimulation,
  ): GrenadeImpactEvent[] {
    // 1. Animate active Personal Recharge Signs (only viewer-owned sign has root.visible === true)
    this.personalSigns.forEach((sign) => {
      if (!sign.active || !sign.isViewerOwner) return;
      const groundY = terrain.sampleHeight(sign.x, sign.z);
      const bob = Math.sin(elapsed * 3.2) * 0.16;
      sign.root.position.set(sign.x, groundY, sign.z);
      sign.core.position.y = 1.15 + bob;
      sign.core.rotation.y = elapsed * 1.9;

      sign.ringA.position.y = 1.15 + bob;
      sign.ringA.rotation.set(Math.PI * 0.28, elapsed * 2.4, elapsed * 1.1);
      sign.ringB.position.y = 1.15 + bob;
      sign.ringB.rotation.set(-Math.PI * 0.32, -elapsed * 2.1, elapsed * 0.8);

      sign.signGroup.position.y = 2.45 + Math.sin(elapsed * 4.1) * 0.18;
      sign.signGroup.rotation.y = elapsed * 2.2;

      for (let i = 0; i < sign.orbiters.length; i++) {
        const a = elapsed * 3.6 + (i / sign.orbiters.length) * Math.PI * 2;
        const r = 0.7 + Math.sin(elapsed * 4 + i) * 0.08;
        sign.orbiters[i].position.set(
          Math.cos(a) * r,
          1.15 + bob + Math.sin(a * 2 + elapsed * 3) * 0.22,
          Math.sin(a) * r,
        );
        sign.orbiters[i].rotation.y = elapsed * 4;
      }
      sign.halo.scale.setScalar(1 + Math.sin(elapsed * 4.5) * 0.09);
    });

    // 2. Animate active Personal Collectible Grenade & Dizzy Bomb Pickups (visible only to owner)
    this.personalGrenades.forEach((gp) => {
      if (!gp.active || !gp.isViewerOwner) return;
      const groundY = terrain.sampleHeight(gp.x, gp.z);
      gp.root.position.set(gp.x, groundY, gp.z);
      gp.body.position.y = 0.92 + Math.sin(elapsed * 3.6 + (gp.role === 'hero' ? 0.5 : 2.1)) * 0.14;
      gp.body.rotation.y = elapsed * 2.2;
      gp.body.rotation.z = Math.sin(elapsed * 2.0) * 0.14;
      gp.halo.scale.setScalar(1 + Math.sin(elapsed * 5.0) * 0.09);
    });

    this.personalDizzyBombs.forEach((dp) => {
      if (!dp.active || !dp.isViewerOwner) return;
      const groundY = terrain.sampleHeight(dp.x, dp.z);
      dp.root.position.set(dp.x, groundY, dp.z);
      dp.body.position.y = 0.98 + Math.sin(elapsed * 4.4 + (dp.role === 'hero' ? 1.0 : 2.8)) * 0.16;
      dp.body.rotation.y = elapsed * 3.4;
      dp.body.rotation.z = Math.sin(elapsed * 3.0) * 0.18;
      dp.halo.scale.setScalar(1 + Math.sin(elapsed * 6.0) * 0.11);
    });

    // 3. Step In-Flight Parabolic Grenades & Dizzy Bombs
    const impacts: GrenadeImpactEvent[] = [];
    for (let i = 0; i < this.thrownPool.length; i++) {
      const slot = this.thrownPool[i];
      if (!slot.active) continue;

      slot.flightElapsed += dt;
      slot.vy -= 18.0 * dt;
      slot.x += slot.vx * dt;
      slot.y += slot.vy * dt;
      slot.z += slot.vz * dt;

      slot.mesh.position.set(slot.x, slot.y, slot.z);
      slot.mesh.rotation.x += dt * 11;
      slot.mesh.rotation.z += dt * 8.5;

      const groundY = terrain.sampleHeight(slot.x, slot.z);
      if (slot.y <= groundY + 0.12 || slot.flightElapsed >= slot.flightTime) {
        const iy = groundY;
        const radius = slot.kind === 'dizzy' ? DIZZY_BOMB_RADIUS : GRENADE_AOE_RADIUS;
        impacts.push({
          kind: slot.kind,
          role: slot.role,
          x: slot.x,
          y: iy,
          z: slot.z,
          radius,
        });
        this.triggerShockwave(slot.role, slot.kind, slot.x, iy, slot.z);
        slot.active = false;
        slot.mesh.visible = false;
      }
    }

    // 4. Decay Explosion Flash & Shockwaves
    if (this.explosionLight.intensity > 0.02) {
      this.explosionLight.intensity *= Math.exp(-8.5 * dt);
      if (this.explosionLight.intensity <= 0.02) {
        this.explosionLight.intensity = 0;
      }
    }

    for (let i = 0; i < this.shockwaves.length; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.age += dt;
      const t = Math.min(1, sw.age / sw.duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const radiusScale = 0.45 + easeOut * (sw.targetRadius * 1.04);

      sw.ringMesh.scale.setScalar(radiusScale);
      sw.ringMat.opacity = (1 - t) * 0.88;

      sw.domeMesh.scale.set(
        radiusScale * 0.9,
        0.4 + easeOut * (sw.kind === 'dizzy' ? 1.35 : 2.1),
        radiusScale * 0.9,
      );
      sw.domeMat.opacity = (1 - t) * (1 - t) * 0.34;

      if (t >= 1) {
        sw.active = false;
        sw.ringMesh.visible = false;
        sw.domeMesh.visible = false;
      }
    }

    return impacts;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
