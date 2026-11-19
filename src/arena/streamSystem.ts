import * as THREE from 'three';
import { TerrainSimulation } from './terrainState';

interface WaterDrop {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

interface SplashDrop {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

interface FlameParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseSize: number;
  seed: number;
}

interface EmberParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

interface SmokeParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseSize: number;
}

const MAX_WATER = 520;
const MAX_SPLASH = 360;
const MAX_FLAME = 520;
const MAX_EMBER = 280;
const MAX_SMOKE = 200;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _dir = new THREE.Vector3();
const _forward = new THREE.Vector3(0, 0, 1);
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _normal = new THREE.Vector3();

export interface ElementalStreamCallbacks {
  onWaterImpact: (wx: number, wz: number) => void;
  onFireImpact: (wx: number, wz: number) => void;
}

export class ElementalStreamSystem {
  readonly waterLight: THREE.PointLight;
  readonly fireLight: THREE.PointLight;
  readonly reticleGroup: THREE.Group;

  private readonly reticleOuterMat: THREE.MeshBasicMaterial;
  private readonly reticleInnerMat: THREE.MeshBasicMaterial;
  private readonly reticleInnerRing: THREE.Mesh;

  private readonly waterMesh: THREE.InstancedMesh;
  private readonly splashMesh: THREE.InstancedMesh;
  private readonly flameMesh: THREE.InstancedMesh;
  private readonly emberMesh: THREE.InstancedMesh;
  private readonly smokeMesh: THREE.InstancedMesh;

  private readonly waterPool: WaterDrop[] = [];
  private readonly splashPool: SplashDrop[] = [];
  private readonly flamePool: FlameParticle[] = [];
  private readonly emberPool: EmberParticle[] = [];
  private readonly smokePool: SmokeParticle[] = [];

  private waterCursor = 0;
  private splashCursor = 0;
  private flameCursor = 0;
  private emberCursor = 0;
  private smokeCursor = 0;

  private waterEmitAcc = 0;
  private fireEmitAcc = 0;
  private randSeed = 918273;

  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(parent: THREE.Group) {
    // 1. Dynamic Stream PointLights (real-time colored ground illumination)
    this.waterLight = new THREE.PointLight(0x16e4ff, 0, 12, 1.5);
    this.fireLight = new THREE.PointLight(0xff6a14, 0, 13, 1.5);
    parent.add(this.waterLight, this.fireLight);

    // 2. Glowing 3D Floor Targeting Reticle
    this.reticleGroup = new THREE.Group();
    this.reticleGroup.name = 'TargetingReticle';

    this.reticleOuterMat = new THREE.MeshBasicMaterial({
      color: 0x22efff,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.reticleInnerMat = new THREE.MeshBasicMaterial({
      color: 0xb8fbff,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const outerRingGeo = new THREE.RingGeometry(0.62, 0.72, 36);
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRing = new THREE.Mesh(outerRingGeo, this.reticleOuterMat);

    const innerRingGeo = new THREE.RingGeometry(0.28, 0.34, 24, 1, 0, Math.PI * 1.55);
    innerRingGeo.rotateX(-Math.PI / 2);
    this.reticleInnerRing = new THREE.Mesh(innerRingGeo, this.reticleInnerMat);
    this.reticleInnerRing.position.y = 0.004;

    const centerDotGeo = new THREE.CircleGeometry(0.11, 16);
    centerDotGeo.rotateX(-Math.PI / 2);
    const centerDot = new THREE.Mesh(centerDotGeo, this.reticleInnerMat);
    centerDot.position.y = 0.008;

    const tickGeo = new THREE.PlaneGeometry(0.06, 0.22);
    tickGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const tick = new THREE.Mesh(tickGeo, this.reticleOuterMat);
      tick.position.set(Math.sin(a) * 0.82, 0.004, Math.cos(a) * 0.82);
      tick.rotation.y = a;
      this.reticleGroup.add(tick);
    }

    this.reticleGroup.add(outerRing, this.reticleInnerRing, centerDot);
    parent.add(this.reticleGroup);
    this.disposables.push(
      outerRingGeo,
      innerRingGeo,
      centerDotGeo,
      tickGeo,
      this.reticleOuterMat,
      this.reticleInnerMat,
    );

    // 3. Water Stream & Splash Instanced Pools
    const waterGeo = new THREE.SphereGeometry(0.112, 8, 6);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x26cbe8,
      emissive: 0x06648f,
      emissiveIntensity: 0.34,
      roughness: 0.1,
      metalness: 0.1,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08,
    });
    this.waterMesh = new THREE.InstancedMesh(waterGeo, waterMat, MAX_WATER);
    this.waterMesh.name = 'WaterStreamDroplets';
    this.waterMesh.frustumCulled = false;

    const splashGeo = new THREE.SphereGeometry(0.072, 6, 5);
    const splashMat = new THREE.MeshStandardMaterial({
      color: 0x9ce7f5,
      emissive: 0x0e7490,
      emissiveIntensity: 0.28,
      roughness: 0.14,
      metalness: 0.08,
    });
    this.splashMesh = new THREE.InstancedMesh(splashGeo, splashMat, MAX_SPLASH);
    this.splashMesh.name = 'WaterSplashDroplets';
    this.splashMesh.frustumCulled = false;

    // 4. Fire Stream, Embers & Smoke Pools
    const flameGeo = new THREE.IcosahedronGeometry(0.165, 1);
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff5a08,
      emissiveIntensity: 1.35,
      roughness: 0.35,
      metalness: 0.0,
    });
    this.flameMesh = new THREE.InstancedMesh(flameGeo, flameMat, MAX_FLAME);
    this.flameMesh.name = 'FireStreamFlames';
    this.flameMesh.frustumCulled = false;

    const emberGeo = new THREE.OctahedronGeometry(0.052, 0);
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xff8814,
      emissiveIntensity: 1.65,
      roughness: 0.25,
    });
    this.emberMesh = new THREE.InstancedMesh(emberGeo, emberMat, MAX_EMBER);
    this.emberMesh.name = 'FireStreamEmbers';
    this.emberMesh.frustumCulled = false;

    const smokeGeo = new THREE.IcosahedronGeometry(0.16, 1);
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0x332c28,
      roughness: 0.96,
      metalness: 0.0,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_SMOKE);
    this.smokeMesh.name = 'FireStreamSmoke';
    this.smokeMesh.frustumCulled = false;

    parent.add(this.waterMesh, this.splashMesh, this.flameMesh, this.emberMesh, this.smokeMesh);
    this.disposables.push(
      waterGeo,
      waterMat,
      splashGeo,
      splashMat,
      flameGeo,
      flameMat,
      emberGeo,
      emberMat,
      smokeGeo,
      smokeMat,
    );

    // Zero-initialize pools and matrices
    for (let i = 0; i < MAX_WATER; i++) {
      this.waterPool.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1 });
      this.hideInstance(this.waterMesh, i);
    }
    for (let i = 0; i < MAX_SPLASH; i++) {
      this.splashPool.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1 });
      this.hideInstance(this.splashMesh, i);
    }
    for (let i = 0; i < MAX_FLAME; i++) {
      this.flamePool.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        baseSize: 1,
        seed: i * 1.37,
      });
      this.hideInstance(this.flameMesh, i);
      this.flameMesh.setColorAt(i, _color.setHex(0xff7711));
    }
    if (this.flameMesh.instanceColor) {
      this.flameMesh.instanceColor.needsUpdate = true;
    }
    for (let i = 0; i < MAX_EMBER; i++) {
      this.emberPool.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1 });
      this.hideInstance(this.emberMesh, i);
    }
    for (let i = 0; i < MAX_SMOKE; i++) {
      this.smokePool.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        baseSize: 1,
      });
      this.hideInstance(this.smokeMesh, i);
    }
  }

  private nextRand(): number {
    this.randSeed = (this.randSeed * 1664525 + 1013904223) >>> 0;
    return this.randSeed / 4294967296;
  }

  private hideInstance(mesh: THREE.InstancedMesh, index: number): void {
    _dummy.position.set(0, -100, 0);
    _dummy.scale.set(0, 0, 0);
    _dummy.updateMatrix();
    mesh.setMatrixAt(index, _dummy.matrix);
  }

  updateReticle(
    x: number,
    z: number,
    terrain: TerrainSimulation,
    role: 'hero' | 'villain',
    elapsed: number,
  ): void {
    const half = terrain.arenaHalfSize;
    const cx = Math.max(-half + 0.35, Math.min(half - 0.35, x));
    const cz = Math.max(-half + 0.35, Math.min(half - 0.35, z));
    const y = terrain.sampleHeight(cx, cz);

    const eps = 0.25;
    const hL = terrain.sampleHeight(cx - eps, cz);
    const hR = terrain.sampleHeight(cx + eps, cz);
    const hD = terrain.sampleHeight(cx, cz - eps);
    const hU = terrain.sampleHeight(cx, cz + eps);
    _normal.set(hL - hR, 2 * eps, hD - hU).normalize();

    _quat.setFromUnitVectors(_up, _normal);
    this.reticleGroup.quaternion.copy(_quat);
    this.reticleGroup.position.set(
      cx + _normal.x * 0.05,
      y + _normal.y * 0.05,
      cz + _normal.z * 0.05,
    );

    const pulse = 1 + Math.sin(elapsed * 5.2) * 0.06;
    this.reticleGroup.scale.setScalar(pulse);
    this.reticleInnerRing.rotation.y = elapsed * 2.1;

    if (role === 'hero') {
      this.reticleOuterMat.color.setHex(0x1eeaff);
      this.reticleInnerMat.color.setHex(0xc8fbff);
    } else {
      this.reticleOuterMat.color.setHex(0xff520a);
      this.reticleInnerMat.color.setHex(0xffc07a);
    }
  }

  emitStream(
    role: 'hero' | 'villain',
    muzzlePos: THREE.Vector3,
    targetPos: THREE.Vector3,
    dt: number,
    elapsed: number,
    emitRate = 175,
    updatePointLight = true,
  ): void {
    _dir.subVectors(targetPos, muzzlePos);
    const dist = Math.max(1.2, _dir.length());
    _dir.normalize();

    if (role === 'hero') {
      this.waterEmitAcc = Math.min(6, this.waterEmitAcc + dt * emitRate);
      while (this.waterEmitAcc >= 1) {
        this.waterEmitAcc -= 1;
        const speed = Math.min(28, Math.max(16.5, dist * 2.35));
        const p = this.waterPool[this.waterCursor];
        this.waterCursor = (this.waterCursor + 1) % MAX_WATER;

        p.active = true;
        p.x = muzzlePos.x + (this.nextRand() - 0.5) * 0.06;
        p.y = muzzlePos.y + (this.nextRand() - 0.5) * 0.06;
        p.z = muzzlePos.z + (this.nextRand() - 0.5) * 0.06;
        p.vx = _dir.x * speed + (this.nextRand() - 0.5) * 1.0;
        const flightTime = dist / speed;
        p.vy = _dir.y * speed + 0.5 * 13.5 * flightTime + (this.nextRand() - 0.5) * 0.65;
        p.vz = _dir.z * speed + (this.nextRand() - 0.5) * 1.0;
        p.life = 0;
        p.maxLife = Math.min(1.25, flightTime + 0.42);
        p.size = 0.85 + this.nextRand() * 0.55;
      }

      if (updatePointLight) {
        this.waterLight.position.lerpVectors(muzzlePos, targetPos, 0.72);
        this.waterLight.position.y += 1.1;
        this.waterLight.intensity += (2.4 - this.waterLight.intensity) * Math.min(1, dt * 16);
      }
    } else {
      this.fireEmitAcc = Math.min(6, this.fireEmitAcc + dt * emitRate);
      while (this.fireEmitAcc >= 1) {
        this.fireEmitAcc -= 1;
        const speed = Math.min(25, Math.max(15.5, dist * 2.25));
        const p = this.flamePool[this.flameCursor];
        this.flameCursor = (this.flameCursor + 1) % MAX_FLAME;

        p.active = true;
        p.x = muzzlePos.x + (this.nextRand() - 0.5) * 0.07;
        p.y = muzzlePos.y + (this.nextRand() - 0.5) * 0.07;
        p.z = muzzlePos.z + (this.nextRand() - 0.5) * 0.07;
        p.vx = _dir.x * speed + (this.nextRand() - 0.5) * 1.35;
        p.vy = _dir.y * speed - 0.45 + (this.nextRand() - 0.5) * 0.85;
        p.vz = _dir.z * speed + (this.nextRand() - 0.5) * 1.35;
        p.life = 0;
        p.maxLife = Math.min(1.15, dist / speed + 0.35);
        p.baseSize = 0.82 + this.nextRand() * 0.62;
      }

      if (updatePointLight) {
        this.fireLight.position.lerpVectors(muzzlePos, targetPos, 0.68);
        this.fireLight.position.y += 1.25;
        const flicker = 3.8 + Math.sin(elapsed * 37) * 0.6 + Math.cos(elapsed * 23) * 0.35;
        this.fireLight.intensity += (flicker - this.fireLight.intensity) * Math.min(1, dt * 18);
      }
    }
  }

  private spawnSplashBurst(x: number, y: number, z: number): void {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const sp = this.splashPool[this.splashCursor];
      this.splashCursor = (this.splashCursor + 1) % MAX_SPLASH;

      const angle = this.nextRand() * Math.PI * 2;
      const outSpeed = 1.6 + this.nextRand() * 3.2;
      sp.active = true;
      sp.x = x;
      sp.y = y + 0.04;
      sp.z = z;
      sp.vx = Math.cos(angle) * outSpeed;
      sp.vy = 2.0 + this.nextRand() * 2.8;
      sp.vz = Math.sin(angle) * outSpeed;
      sp.life = 0;
      sp.maxLife = 0.28 + this.nextRand() * 0.22;
      sp.size = 0.7 + this.nextRand() * 0.75;
    }
  }

  private spawnFireImpactBurst(x: number, y: number, z: number): void {
    for (let i = 0; i < 2; i++) {
      const em = this.emberPool[this.emberCursor];
      this.emberCursor = (this.emberCursor + 1) % MAX_EMBER;
      const angle = this.nextRand() * Math.PI * 2;
      const outSpeed = 1.2 + this.nextRand() * 3.0;
      em.active = true;
      em.x = x + (this.nextRand() - 0.5) * 0.35;
      em.y = y + 0.06;
      em.z = z + (this.nextRand() - 0.5) * 0.35;
      em.vx = Math.cos(angle) * outSpeed;
      em.vy = 2.4 + this.nextRand() * 3.4;
      em.vz = Math.sin(angle) * outSpeed;
      em.life = 0;
      em.maxLife = 0.38 + this.nextRand() * 0.35;
      em.size = 0.75 + this.nextRand() * 0.65;
    }

    if (this.nextRand() < 0.55) {
      const sm = this.smokePool[this.smokeCursor];
      this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE;
      sm.active = true;
      sm.x = x + (this.nextRand() - 0.5) * 0.5;
      sm.y = y + 0.15;
      sm.z = z + (this.nextRand() - 0.5) * 0.5;
      sm.vx = (this.nextRand() - 0.5) * 0.75;
      sm.vy = 1.5 + this.nextRand() * 1.4;
      sm.vz = (this.nextRand() - 0.5) * 0.75;
      sm.life = 0;
      sm.maxLife = 0.75 + this.nextRand() * 0.55;
      sm.baseSize = 0.7 + this.nextRand() * 0.8;
    }
  }

  spawnEmptySputter(role: 'hero' | 'villain', muzzlePos: THREE.Vector3, aimPos: THREE.Vector3): void {
    _dir.subVectors(aimPos, muzzlePos).normalize();
    if (role === 'hero') {
      for (let i = 0; i < 3; i++) {
        const sp = this.splashPool[this.splashCursor];
        this.splashCursor = (this.splashCursor + 1) % MAX_SPLASH;
        sp.active = true;
        sp.x = muzzlePos.x;
        sp.y = muzzlePos.y;
        sp.z = muzzlePos.z;
        sp.vx = _dir.x * (2.2 + this.nextRand() * 1.4) + (this.nextRand() - 0.5) * 1.2;
        sp.vy = 0.7 + this.nextRand() * 0.9;
        sp.vz = _dir.z * (2.2 + this.nextRand() * 1.4) + (this.nextRand() - 0.5) * 1.2;
        sp.life = 0;
        sp.maxLife = 0.22 + this.nextRand() * 0.12;
        sp.size = 0.55 + this.nextRand() * 0.35;
      }
    } else {
      for (let i = 0; i < 2; i++) {
        const sm = this.smokePool[this.smokeCursor];
        this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE;
        sm.active = true;
        sm.x = muzzlePos.x;
        sm.y = muzzlePos.y;
        sm.z = muzzlePos.z;
        sm.vx = _dir.x * 2.0 + (this.nextRand() - 0.5) * 0.8;
        sm.vy = 0.9 + this.nextRand() * 0.7;
        sm.vz = _dir.z * 2.0 + (this.nextRand() - 0.5) * 0.8;
        sm.life = 0;
        sm.maxLife = 0.36 + this.nextRand() * 0.18;
        sm.baseSize = 0.5 + this.nextRand() * 0.3;
      }
    }
  }

  spawnBurst(
    role: 'hero' | 'villain',
    x: number,
    y: number,
    z: number,
    count: number,
    power = 1.0,
  ): void {
    if (role === 'hero') {
      for (let i = 0; i < count; i++) {
        const sp = this.splashPool[this.splashCursor];
        this.splashCursor = (this.splashCursor + 1) % MAX_SPLASH;
        const angle = this.nextRand() * Math.PI * 2;
        const speed = (2.6 + this.nextRand() * 6.8) * power;
        sp.active = true;
        sp.x = x + (this.nextRand() - 0.5) * 0.4;
        sp.y = y + 0.15;
        sp.z = z + (this.nextRand() - 0.5) * 0.4;
        sp.vx = Math.cos(angle) * speed;
        sp.vy = (3.4 + this.nextRand() * 5.6) * power;
        sp.vz = Math.sin(angle) * speed;
        sp.life = 0;
        sp.maxLife = 0.45 + this.nextRand() * 0.38;
        sp.size = (0.95 + this.nextRand() * 0.95) * Math.min(1.5, power);
      }
    } else {
      for (let i = 0; i < count; i++) {
        const em = this.emberPool[this.emberCursor];
        this.emberCursor = (this.emberCursor + 1) % MAX_EMBER;
        const angle = this.nextRand() * Math.PI * 2;
        const speed = (2.8 + this.nextRand() * 7.2) * power;
        em.active = true;
        em.x = x + (this.nextRand() - 0.5) * 0.45;
        em.y = y + 0.18;
        em.z = z + (this.nextRand() - 0.5) * 0.45;
        em.vx = Math.cos(angle) * speed;
        em.vy = (3.6 + this.nextRand() * 6.2) * power;
        em.vz = Math.sin(angle) * speed;
        em.life = 0;
        em.maxLife = 0.48 + this.nextRand() * 0.42;
        em.size = (1.05 + this.nextRand() * 0.9) * Math.min(1.5, power);
      }

      const smokeCount = Math.min(16, Math.ceil(count * 0.35));
      for (let i = 0; i < smokeCount; i++) {
        const sm = this.smokePool[this.smokeCursor];
        this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE;
        const angle = this.nextRand() * Math.PI * 2;
        const speed = (1.1 + this.nextRand() * 2.8) * power;
        sm.active = true;
        sm.x = x + (this.nextRand() - 0.5) * 0.9;
        sm.y = y + 0.3;
        sm.z = z + (this.nextRand() - 0.5) * 0.9;
        sm.vx = Math.cos(angle) * speed;
        sm.vy = (2.2 + this.nextRand() * 2.4) * power;
        sm.vz = Math.sin(angle) * speed;
        sm.life = 0;
        sm.maxLife = 0.85 + this.nextRand() * 0.55;
        sm.baseSize = (1.1 + this.nextRand() * 0.95) * Math.min(1.4, power);
      }
    }
  }

  update(
    dt: number,
    isFiringHero: boolean,
    isFiringVillain: boolean,
    terrain: TerrainSimulation,
    callbacks: ElementalStreamCallbacks,
  ): void {
    if (!isFiringHero) {
      this.waterLight.intensity *= Math.exp(-10 * dt);
      if (this.waterLight.intensity < 0.02) this.waterLight.intensity = 0;
    }
    if (!isFiringVillain) {
      this.fireLight.intensity *= Math.exp(-10 * dt);
      if (this.fireLight.intensity < 0.02) this.fireLight.intensity = 0;
    }

    // 1. Update Water Stream Droplets
    let waterDirty = false;
    for (let i = 0; i < MAX_WATER; i++) {
      const p = this.waterPool[i];
      if (!p.active) continue;
      waterDirty = true;

      p.life += dt;
      p.vy -= 14.0 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const half = terrain.arenaHalfSize;
      const inArena = Math.abs(p.x) <= half && Math.abs(p.z) <= half;
      const groundY = inArena ? terrain.sampleHeight(p.x, p.z) : -99;

      if (inArena && p.y <= groundY + 0.04) {
        p.active = false;
        this.hideInstance(this.waterMesh, i);
        this.spawnSplashBurst(p.x, groundY, p.z);
        callbacks.onWaterImpact(p.x, p.z);
        continue;
      }

      if (p.life >= p.maxLife || p.y < -8) {
        p.active = false;
        this.hideInstance(this.waterMesh, i);
        continue;
      }

      _dir.set(p.vx, p.vy, p.vz).normalize();
      _quat.setFromUnitVectors(_forward, _dir);
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.quaternion.copy(_quat);
      _dummy.scale.set(p.size * 0.85, p.size * 0.85, p.size * 2.15);
      _dummy.updateMatrix();
      this.waterMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (waterDirty) this.waterMesh.instanceMatrix.needsUpdate = true;

    // 2. Update Water Splash Droplets
    let splashDirty = false;
    for (let i = 0; i < MAX_SPLASH; i++) {
      const sp = this.splashPool[i];
      if (!sp.active) continue;
      splashDirty = true;

      sp.life += dt;
      sp.vy -= 13.5 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.z += sp.vz * dt;

      if (sp.life >= sp.maxLife) {
        sp.active = false;
        this.hideInstance(this.splashMesh, i);
        continue;
      }

      const fade = 1 - sp.life / sp.maxLife;
      _dummy.position.set(sp.x, sp.y, sp.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.setScalar(sp.size * fade);
      _dummy.updateMatrix();
      this.splashMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (splashDirty) this.splashMesh.instanceMatrix.needsUpdate = true;

    // 3. Update Fire Stream Flames
    let flameDirty = false;
    let flameColorDirty = false;
    for (let i = 0; i < MAX_FLAME; i++) {
      const f = this.flamePool[i];
      if (!f.active) continue;
      flameDirty = true;
      flameColorDirty = true;

      f.life += dt;
      // Gentle thermal curl without overshooting ground reticle
      f.vy += 0.65 * dt;
      f.vx += Math.sin(f.life * 22 + f.seed) * 1.8 * dt;
      f.vz += Math.cos(f.life * 19 + f.seed) * 1.8 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;

      const half = terrain.arenaHalfSize;
      const inArena = Math.abs(f.x) <= half && Math.abs(f.z) <= half;
      const groundY = inArena ? terrain.sampleHeight(f.x, f.z) : -99;

      if (inArena && f.y <= groundY + 0.08) {
        f.active = false;
        this.hideInstance(this.flameMesh, i);
        this.spawnFireImpactBurst(f.x, groundY, f.z);
        callbacks.onFireImpact(f.x, f.z);
        continue;
      }

      if (f.life >= f.maxLife || f.y < -8) {
        f.active = false;
        this.hideInstance(this.flameMesh, i);
        continue;
      }

      const t = f.life / f.maxLife;
      const scale = f.baseSize * (0.75 + t * 1.45) * (1 - Math.pow(t, 3));
      _dummy.position.set(f.x, f.y, f.z);
      _dummy.rotation.set(f.life * 4 + f.seed, f.life * 3, 0);
      _dummy.scale.setScalar(Math.max(0.01, scale));
      _dummy.updateMatrix();
      this.flameMesh.setMatrixAt(i, _dummy.matrix);

      // White-hot muzzle -> golden orange -> crimson ember tail
      if (t < 0.25) {
        _color.setHex(0xffe07d);
      } else if (t < 0.65) {
        _color.setHex(0xff6b08);
      } else {
        _color.setHex(0xc92204);
      }
      this.flameMesh.setColorAt(i, _color);
    }
    if (flameDirty) this.flameMesh.instanceMatrix.needsUpdate = true;
    if (flameColorDirty && this.flameMesh.instanceColor) {
      this.flameMesh.instanceColor.needsUpdate = true;
    }

    // 4. Update Embers
    let emberDirty = false;
    for (let i = 0; i < MAX_EMBER; i++) {
      const em = this.emberPool[i];
      if (!em.active) continue;
      emberDirty = true;

      em.life += dt;
      em.vy -= 5.2 * dt;
      em.x += em.vx * dt;
      em.y += em.vy * dt;
      em.z += em.vz * dt;

      if (em.life >= em.maxLife) {
        em.active = false;
        this.hideInstance(this.emberMesh, i);
        continue;
      }

      const fade = 1 - em.life / em.maxLife;
      _dummy.position.set(em.x, em.y, em.z);
      _dummy.rotation.set(em.life * 8, em.life * 6, 0);
      _dummy.scale.setScalar(em.size * fade);
      _dummy.updateMatrix();
      this.emberMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (emberDirty) this.emberMesh.instanceMatrix.needsUpdate = true;

    // 5. Update Smoke Wisps
    let smokeDirty = false;
    for (let i = 0; i < MAX_SMOKE; i++) {
      const sm = this.smokePool[i];
      if (!sm.active) continue;
      smokeDirty = true;

      sm.life += dt;
      sm.vx *= Math.exp(-1.5 * dt);
      sm.vz *= Math.exp(-1.5 * dt);
      sm.x += sm.vx * dt;
      sm.y += sm.vy * dt;
      sm.z += sm.vz * dt;

      if (sm.life >= sm.maxLife) {
        sm.active = false;
        this.hideInstance(this.smokeMesh, i);
        continue;
      }

      const t = sm.life / sm.maxLife;
      const puffScale = sm.baseSize * (0.65 + t * 1.9) * Math.sin(Math.min(1, (1 - t) * 1.4) * Math.PI * 0.5);
      _dummy.position.set(sm.x, sm.y, sm.z);
      _dummy.rotation.set(sm.life * 1.2, sm.life * 1.5, 0);
      _dummy.scale.setScalar(Math.max(0.01, puffScale));
      _dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(i, _dummy.matrix);
    }
    if (smokeDirty) this.smokeMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
