import { ObstacleCircle } from './gameMechanics';
import { TerrainSimulation } from './terrainState';
import { TrooperRole } from './trooperBuilder';
import { worldToMinimapCoord, worldYawToCanvasAngle } from './cameraAndMinimapMath';

export interface MinimapActor {
  role: TrooperRole;
  isPlayer: boolean;
  x: number;
  z: number;
  yaw: number;
}

export interface MinimapPickupMarker {
  role: TrooperRole;
  kind: 'orb' | 'grenade' | 'dizzy';
  active: boolean;
  x: number;
  z: number;
}

export interface MinimapDrawInput {
  terrain: TerrainSimulation;
  obstacles: ReadonlyArray<ObstacleCircle>;
  actors: ReadonlyArray<MinimapActor>;
  pickups: ReadonlyArray<MinimapPickupMarker>;
  playerTeam: TrooperRole;
  cameraYaw: number;
  aimX: number;
  aimZ: number;
  showAimMarker: boolean;
  elapsed: number;
}

const TERRAIN_SAMPLE_RES = 56;

export class MinimapRenderer {
  private readonly terrainCanvas: HTMLCanvasElement;
  private readonly terrainCtx: CanvasRenderingContext2D;
  private readonly terrainImage: ImageData;

  constructor() {
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = TERRAIN_SAMPLE_RES;
    this.terrainCanvas.height = TERRAIN_SAMPLE_RES;
    const ctx = this.terrainCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create offscreen minimap terrain context');
    }
    this.terrainCtx = ctx;
    this.terrainImage = ctx.createImageData(TERRAIN_SAMPLE_RES, TERRAIN_SAMPLE_RES);
  }

  private updateTerrainRaster(terrain: TerrainSimulation): void {
    const data = this.terrainImage.data;
    const gridRes = terrain.gridRes;
    const denom = TERRAIN_SAMPLE_RES - 1;

    for (let py = 0; py < TERRAIN_SAMPLE_RES; py++) {
      const iz = Math.min(gridRes - 1, Math.round((py / denom) * (gridRes - 1)));
      const rowOffset = iz * gridRes;
      for (let px = 0; px < TERRAIN_SAMPLE_RES; px++) {
        const ix = Math.min(gridRes - 1, Math.round((px / denom) * (gridRes - 1)));
        const idx = rowOffset + ix;
        const mask = terrain.biomeMasks[idx];
        const scorch = terrain.scorches[idx];

        // Lush meadow (#2c8f4f) <-> Warm Sahara desert (#cfa25e)
        let r = 44 + mask * (207 - 44);
        let g = 143 + mask * (162 - 143);
        let b = 79 + mask * (94 - 79);

        // Subtle elevation shading + scorch ember highlight
        const h = terrain.heights[idx];
        const shade = Math.max(0.84, Math.min(1.16, 0.96 + h * 0.12));
        r *= shade;
        g *= shade;
        b *= shade;

        if (scorch > 0.05) {
          const s = Math.min(1, scorch);
          r = r * (1 - s * 0.55) + 235 * (s * 0.55);
          g = g * (1 - s * 0.68) + 88 * (s * 0.68);
          b = b * (1 - s * 0.85) + 20 * (s * 0.85);
        }

        const outIdx = (py * TERRAIN_SAMPLE_RES + px) * 4;
        data[outIdx] = Math.max(0, Math.min(255, r));
        data[outIdx + 1] = Math.max(0, Math.min(255, g));
        data[outIdx + 2] = Math.max(0, Math.min(255, b));
        data[outIdx + 3] = 255;
      }
    }

    this.terrainCtx.putImageData(this.terrainImage, 0, 0);
  }

  draw(canvas: HTMLCanvasElement, input: MinimapDrawInput): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = Math.max(120, Math.round(canvas.clientWidth || 168));
    const cssHeight = Math.max(120, Math.round(canvas.clientHeight || 168));
    const targetW = Math.round(cssWidth * dpr);
    const targetH = Math.round(cssHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mapSize = cssWidth;
    const half = input.terrain.arenaHalfSize;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, mapSize, mapSize);

    // 1. Live Biome Territory Background
    this.updateTerrainRaster(input.terrain);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.terrainCanvas, 0, 0, mapSize, mapSize);

    // 2. Subtle Tactical 4x4 Grid & Center Border Line
    ctx.strokeStyle = 'rgba(12, 16, 22, 0.24)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const pos = (i / 4) * mapSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, mapSize);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(mapSize, pos);
      ctx.stroke();
    }

    // 3. Tree Cover Dots
    for (let i = 0; i < input.obstacles.length; i++) {
      const obs = input.obstacles[i];
      const pt = worldToMinimapCoord(obs.x, obs.z, half, mapSize);
      ctx.fillStyle = 'rgba(15, 22, 18, 0.42)';
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Collectible Orbs & Elemental Grenade Pickups
    const pulse = 0.5 + 0.5 * Math.sin(input.elapsed * 5.2);
    for (let i = 0; i < input.pickups.length; i++) {
      const p = input.pickups[i];
      if (!p.active) continue;
      const pt = worldToMinimapCoord(p.x, p.z, half, mapSize);
      const isHeroPickup = p.role === 'hero';
      const color = isHeroPickup ? '#32f2ff' : '#ff681f';

      if (p.kind === 'orb') {
        ctx.strokeStyle = isHeroPickup
          ? `rgba(50, 242, 255, ${0.5 + pulse * 0.45})`
          : `rgba(255, 104, 31, ${0.5 + pulse * 0.45})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, 4.5 + pulse * 2.4, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, 2.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'dizzy') {
        // Violet-gold spinning star badge for Dizzy Bomb pickup
        ctx.save();
        ctx.translate(pt.px, pt.py);
        ctx.rotate(input.elapsed * 2.2);
        ctx.fillStyle = '#d946ef';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (let s = 0; s < 8; s++) {
          const r = s % 2 === 0 ? 4.4 : 1.9;
          const a = (s / 8) * Math.PI * 2;
          if (s === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      } else {
        // Diamond grenade marker
        ctx.save();
        ctx.translate(pt.px, pt.py);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = color;
        ctx.strokeStyle = '#090c12';
        ctx.lineWidth = 1.2;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.strokeRect(-3, -3, 6, 6);
        ctx.restore();
      }
    }

    // 5. Player Aim Target Pip
    if (input.showAimMarker) {
      const aimPt = worldToMinimapCoord(input.aimX, input.aimZ, half, mapSize);
      ctx.strokeStyle = input.playerTeam === 'hero' ? 'rgba(180, 252, 255, 0.8)' : 'rgba(255, 206, 150, 0.8)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(aimPt.px, aimPt.py, 2.8, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 6. Teammates, Enemies & Player View-Cone + Directional Arrow
    let playerActor: MinimapActor | null = null;
    for (let i = 0; i < input.actors.length; i++) {
      const actor = input.actors[i];
      if (actor.isPlayer) {
        playerActor = actor;
        continue;
      }
      const pt = worldToMinimapCoord(actor.x, actor.z, half, mapSize);
      const isHero = actor.role === 'hero';
      const isAlly = actor.role === input.playerTeam;
      ctx.fillStyle = isHero ? '#24e6ff' : '#ff4d1a';
      ctx.strokeStyle = isAlly ? '#ffffff' : '#111318';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(pt.px, pt.py, isAlly ? 3.5 : 3.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (playerActor) {
      const pPt = worldToMinimapCoord(playerActor.x, playerActor.z, half, mapSize);
      const camAngle = worldYawToCanvasAngle(input.cameraYaw);
      const playerAngle = worldYawToCanvasAngle(playerActor.yaw);

      // Camera FOV view cone
      const coneRadius = 24;
      const halfFov = 0.44;
      const coneGrad = ctx.createRadialGradient(pPt.px, pPt.py, 2, pPt.px, pPt.py, coneRadius);
      coneGrad.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
      coneGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
      ctx.fillStyle = coneGrad;
      ctx.beginPath();
      ctx.moveTo(pPt.px, pPt.py);
      ctx.arc(pPt.px, pPt.py, coneRadius, camAngle - halfFov, camAngle + halfFov);
      ctx.closePath();
      ctx.fill();

      // Player directional chevron
      ctx.save();
      ctx.translate(pPt.px, pPt.py);
      ctx.rotate(playerAngle);
      ctx.fillStyle = playerActor.role === 'hero' ? '#8bf8ff' : '#ffb06b';
      ctx.strokeStyle = '#090c12';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(7.2, 0);
      ctx.lineTo(-4.6, 4.4);
      ctx.lineTo(-2.4, 0);
      ctx.lineTo(-4.6, -4.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
}
