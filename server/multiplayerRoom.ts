export type NetTeam = 'hero' | 'villain';
export type NetModeId = '1v1' | '2v2' | '3v3' | '4v4';
export type NetPhase = 'countdown' | 'playing' | 'roundEnd' | 'ended';

export interface NetRoundOutcome {
  roundNumber: number;
  winner: NetTeam | 'draw';
  heroPercent: number;
  villainPercent: number;
}

export interface NetPlayerState {
  uid: string;
  displayName: string;
  team: NetTeam;
  slotIndex: number;
  isHost: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  walkPhase: number;
  spraying: boolean;
  dizzyTimer: number;
  ammo: number;
  hasGrenade: boolean;
  hasDizzyBomb: boolean;
}

export interface NetBotSyncSample {
  slotKey: string;
  role: NetTeam;
  x: number;
  y: number;
  z: number;
  yaw: number;
  walkPhase: number;
  spraying: boolean;
  dizzyTimer: number;
}

export interface RoomSnapshot {
  roomCode: string;
  modeId: NetModeId;
  hostUid: string;
  phase: NetPhase;
  currentRound: number;
  totalRounds: number;
  heroRoundsWon: number;
  villainRoundsWon: number;
  tiebreakerTriggered: boolean;
  countdownRemainingSeconds: number;
  timeRemainingSeconds: number;
  roundTransitionRemaining: number;
  heroPercent: number;
  villainPercent: number;
  roundHistory: NetRoundOutcome[];
  players: NetPlayerState[];
  bots: NetBotSyncSample[];
  rematchVotes: string[];
}

export interface RoomModeMetrics {
  teamSize: number;
  arenaSpan: number;
}

export const MODE_METRICS: Record<NetModeId, RoomModeMetrics> = {
  '1v1': { teamSize: 1, arenaSpan: 30 },
  '2v2': { teamSize: 2, arenaSpan: 40 },
  '3v3': { teamSize: 3, arenaSpan: 50 },
  '4v4': { teamSize: 4, arenaSpan: 60 },
};

const TOTAL_REG_ROUNDS = 4;
const MAX_ROUNDS = 5;
const ROUND_DURATION = 60;
const COUNTDOWN_DURATION = 3;
const ROUND_TRANSITION_DURATION = 3.2;
const COMPACT_GRID_SEGMENTS = 40;
const COMPACT_GRID_RES = COMPACT_GRID_SEGMENTS + 1;

function computeTeamSpawn(
  teamSize: number,
  arenaHalfSize: number,
  role: NetTeam,
  slotIndex: number,
): { x: number; z: number; yaw: number } {
  const count = Math.max(1, Math.min(4, teamSize));
  const clampedSlot = Math.max(0, Math.min(count - 1, slotIndex));
  const homeX = (role === 'hero' ? -1 : 1) * Math.min(arenaHalfSize - 4.2, arenaHalfSize * 0.56);
  const yaw = role === 'hero' ? Math.PI * 0.5 : -Math.PI * 0.5;
  const zSpan = Math.min(arenaHalfSize * 1.15, Math.max(6, (count - 1) * 6.2));
  const t = count === 1 ? 0.5 : clampedSlot / (count - 1);
  const z = (t - 0.5) * zSpan;
  const stagger = count > 1 ? (clampedSlot % 2 === 0 ? -1 : 1) * 1.15 : 0;
  return { x: homeX + stagger, z, yaw };
}

function initialBiomeMask(x: number, z: number): number {
  const seam = Math.sin(z * 0.09) * 1.4 + Math.cos(z * 0.21) * 0.7;
  const d = x - seam;
  const t = Math.max(0, Math.min(1, (d + 1.15) / 2.3));
  return t * t * (3 - 2 * t);
}

export class AuthoritativeTerrainGrid {
  readonly arenaSpan: number;
  readonly arenaHalfSize: number;
  readonly masks: Float32Array;
  private readonly cellSize: number;
  private meadowRatio = 0.5;

  constructor(arenaSpan: number) {
    this.arenaSpan = arenaSpan;
    this.arenaHalfSize = arenaSpan * 0.5;
    this.cellSize = arenaSpan / COMPACT_GRID_SEGMENTS;
    this.masks = new Float32Array(COMPACT_GRID_RES * COMPACT_GRID_RES);
    this.reset();
  }

  reset(): void {
    let meadow = 0;
    for (let iz = 0; iz < COMPACT_GRID_RES; iz++) {
      const z = -this.arenaHalfSize + iz * this.cellSize;
      for (let ix = 0; ix < COMPACT_GRID_RES; ix++) {
        const x = -this.arenaHalfSize + ix * this.cellSize;
        const m = initialBiomeMask(x, z);
        this.masks[iz * COMPACT_GRID_RES + ix] = m;
        if (m < 0.5) meadow++;
      }
    }
    this.meadowRatio = meadow / this.masks.length;
  }

  applyBrush(role: NetTeam, wx: number, wz: number, radius: number, strength: number): void {
    const minIx = Math.max(0, Math.floor((wx - radius + this.arenaHalfSize) / this.cellSize));
    const maxIx = Math.min(
      COMPACT_GRID_SEGMENTS,
      Math.ceil((wx + radius + this.arenaHalfSize) / this.cellSize),
    );
    const minIz = Math.max(0, Math.floor((wz - radius + this.arenaHalfSize) / this.cellSize));
    const maxIz = Math.min(
      COMPACT_GRID_SEGMENTS,
      Math.ceil((wz + radius + this.arenaHalfSize) / this.cellSize),
    );

    const rSq = radius * radius;
    const exponent = role === 'hero' ? 1.35 : 1.3;

    for (let iz = minIz; iz <= maxIz; iz++) {
      const vz = -this.arenaHalfSize + iz * this.cellSize;
      const dz = vz - wz;
      for (let ix = minIx; ix <= maxIx; ix++) {
        const vx = -this.arenaHalfSize + ix * this.cellSize;
        const dx = vx - wx;
        const distSq = dx * dx + dz * dz;
        if (distSq > rSq) continue;
        const dist = Math.sqrt(distSq);
        const falloff = Math.pow(1 - dist / radius, exponent) * strength;
        const idx = iz * COMPACT_GRID_RES + ix;
        if (role === 'hero') {
          this.masks[idx] = Math.max(0, this.masks[idx] - falloff * 0.95);
        } else {
          this.masks[idx] = Math.min(1, this.masks[idx] + falloff * 0.95);
        }
      }
    }

    let meadow = 0;
    for (let i = 0; i < this.masks.length; i++) {
      if (this.masks[i] < 0.5) meadow++;
    }
    this.meadowRatio = meadow / this.masks.length;
  }

  getPercents(): { heroPercent: number; villainPercent: number } {
    const heroPercent = Math.round(Math.max(0, Math.min(1, this.meadowRatio)) * 1000) / 10;
    const villainPercent = Math.round((100 - heroPercent) * 10) / 10;
    return { heroPercent, villainPercent };
  }
}

export class MultiplayerRoom {
  readonly roomCode: string;
  modeId: NetModeId;
  hostUid: string;
  phase: NetPhase = 'countdown';
  currentRound = 1;
  totalRounds = TOTAL_REG_ROUNDS;
  heroRoundsWon = 0;
  villainRoundsWon = 0;
  tiebreakerTriggered = false;
  countdownRemainingSeconds = COUNTDOWN_DURATION;
  timeRemainingSeconds = ROUND_DURATION;
  roundTransitionRemaining = 0;
  roundHistory: NetRoundOutcome[] = [];
  readonly terrain: AuthoritativeTerrainGrid;
  readonly players = new Map<string, NetPlayerState>();
  readonly rematchVotes = new Set<string>();
  bots: NetBotSyncSample[] = [];
  emptySinceMs: number | null = null;

  constructor(roomCode: string, modeId: NetModeId, hostUid: string) {
    this.roomCode = roomCode;
    this.modeId = modeId;
    this.hostUid = hostUid;
    this.terrain = new AuthoritativeTerrainGrid(MODE_METRICS[modeId].arenaSpan);
  }

  private allocateSlotIndex(team: NetTeam, uid: string): number {
    const existing = this.players.get(uid);
    if (existing && existing.team === team) return existing.slotIndex;

    const metrics = MODE_METRICS[this.modeId];
    const usedSlots = new Set<number>();
    for (const p of this.players.values()) {
      if (p.uid !== uid && p.team === team) {
        usedSlots.add(p.slotIndex);
      }
    }
    for (let slot = 0; slot < metrics.teamSize; slot++) {
      if (!usedSlots.has(slot)) return slot;
    }
    return this.players.size % metrics.teamSize;
  }

  joinPlayer(params: {
    uid: string;
    displayName: string;
    team: NetTeam;
    isHost: boolean;
  }): NetPlayerState {
    this.emptySinceMs = null;
    this.rematchVotes.delete(params.uid);
    if (params.isHost) {
      this.hostUid = params.uid;
    }
    const existing = this.players.get(params.uid);
    const metrics = MODE_METRICS[this.modeId];
    const arenaHalfSize = metrics.arenaSpan * 0.5;
    const slotIndex = this.allocateSlotIndex(params.team, params.uid);

    if (existing && existing.team === params.team) {
      existing.displayName = params.displayName;
      existing.isHost = params.isHost || existing.isHost;
      return existing;
    }

    const spawn = computeTeamSpawn(metrics.teamSize, arenaHalfSize, params.team, slotIndex);
    const player: NetPlayerState = {
      uid: params.uid,
      displayName: params.displayName,
      team: params.team,
      slotIndex,
      isHost: params.isHost,
      x: spawn.x,
      y: 0.65,
      z: spawn.z,
      yaw: spawn.yaw,
      pitch: 0,
      walkPhase: 0,
      spraying: false,
      dizzyTimer: 0,
      ammo: 100,
      hasGrenade: false,
      hasDizzyBomb: false,
    };
    this.players.set(params.uid, player);
    return player;
  }

  removePlayer(uid: string, nowMs: number): void {
    this.players.delete(uid);
    this.rematchVotes.delete(uid);
    if (this.players.size === 0) {
      this.emptySinceMs = nowMs;
    }
  }

  areAllConnectedPlayersAgreedRematch(): boolean {
    if (this.players.size === 0) return false;
    for (const uid of this.players.keys()) {
      if (!this.rematchVotes.has(uid)) return false;
    }
    return true;
  }

  voteRematch(uid: string): { voted: boolean; allAgreed: boolean } {
    if (!this.players.has(uid)) {
      return { voted: false, allAgreed: false };
    }
    this.rematchVotes.add(uid);
    return {
      voted: true,
      allAgreed: this.areAllConnectedPlayersAgreedRematch(),
    };
  }

  updatePlayerPose(
    uid: string,
    pose: Partial<
      Pick<
        NetPlayerState,
        'x' | 'y' | 'z' | 'yaw' | 'pitch' | 'walkPhase' | 'spraying' | 'ammo' | 'hasGrenade' | 'hasDizzyBomb'
      >
    >,
  ): void {
    const p = this.players.get(uid);
    if (!p) return;
    const half = MODE_METRICS[this.modeId].arenaSpan * 0.5 - 0.85;
    if (typeof pose.x === 'number' && Number.isFinite(pose.x)) {
      p.x = Math.max(-half, Math.min(half, pose.x));
    }
    if (typeof pose.y === 'number' && Number.isFinite(pose.y)) {
      p.y = Math.max(-1, Math.min(8, pose.y));
    }
    if (typeof pose.z === 'number' && Number.isFinite(pose.z)) {
      p.z = Math.max(-half, Math.min(half, pose.z));
    }
    if (typeof pose.yaw === 'number' && Number.isFinite(pose.yaw)) p.yaw = pose.yaw;
    if (typeof pose.pitch === 'number' && Number.isFinite(pose.pitch)) p.pitch = pose.pitch;
    if (typeof pose.walkPhase === 'number' && Number.isFinite(pose.walkPhase)) {
      p.walkPhase = pose.walkPhase;
    }
    if (typeof pose.spraying === 'boolean') p.spraying = pose.spraying;
    if (typeof pose.ammo === 'number' && Number.isFinite(pose.ammo)) {
      p.ammo = Math.max(0, Math.min(100, Math.round(pose.ammo)));
    }
    if (typeof pose.hasGrenade === 'boolean') p.hasGrenade = pose.hasGrenade;
    if (typeof pose.hasDizzyBomb === 'boolean') p.hasDizzyBomb = pose.hasDizzyBomb;
  }

  applyDizzyBurst(throwerUid: string, role: NetTeam, x: number, z: number, blastRadius: number): string[] {
    const hitUids: string[] = [];
    for (const p of this.players.values()) {
      if (p.uid === throwerUid || p.team === role) continue;
      if (Math.hypot(p.x - x, p.z - z) <= blastRadius) {
        p.dizzyTimer = 3.0;
        p.spraying = false;
        hitUids.push(p.uid);
      }
    }
    return hitUids;
  }

  resetForNextRound(): void {
    this.rematchVotes.clear();
    this.terrain.reset();
    const metrics = MODE_METRICS[this.modeId];
    const half = metrics.arenaSpan * 0.5;
    for (const p of this.players.values()) {
      const spawn = computeTeamSpawn(metrics.teamSize, half, p.team, p.slotIndex);
      p.x = spawn.x;
      p.y = 0.65;
      p.z = spawn.z;
      p.yaw = spawn.yaw;
      p.spraying = false;
      p.dizzyTimer = 0;
      p.ammo = 100;
      p.hasGrenade = false;
      p.hasDizzyBomb = false;
    }
    this.timeRemainingSeconds = ROUND_DURATION;
    this.countdownRemainingSeconds = COUNTDOWN_DURATION;
    this.phase = 'countdown';
  }

  restartSeries(): void {
    this.rematchVotes.clear();
    this.currentRound = 1;
    this.totalRounds = TOTAL_REG_ROUNDS;
    this.heroRoundsWon = 0;
    this.villainRoundsWon = 0;
    this.tiebreakerTriggered = false;
    this.roundHistory = [];
    this.roundTransitionRemaining = 0;
    this.resetForNextRound();
  }

  step(dt: number): {
    roundEnded?: NetRoundOutcome;
    roundReset?: boolean;
    seriesEnded?: boolean;
  } {
    const events: {
      roundEnded?: NetRoundOutcome;
      roundReset?: boolean;
      seriesEnded?: boolean;
    } = {};

    for (const p of this.players.values()) {
      if (p.dizzyTimer > 0) {
        p.dizzyTimer = Math.max(0, p.dizzyTimer - dt);
      }
    }

    if (this.players.size === 0) {
      return events;
    }

    if (this.phase === 'countdown') {
      this.countdownRemainingSeconds = Math.max(0, this.countdownRemainingSeconds - dt);
      if (this.countdownRemainingSeconds <= 0) {
        this.phase = 'playing';
      }
      return events;
    }

    if (this.phase === 'playing') {
      this.timeRemainingSeconds = Math.max(0, this.timeRemainingSeconds - dt);
      if (this.timeRemainingSeconds <= 0) {
        const { heroPercent, villainPercent } = this.terrain.getPercents();
        const winner: NetTeam | 'draw' =
          heroPercent > villainPercent ? 'hero' : villainPercent > heroPercent ? 'villain' : 'draw';
        const outcome: NetRoundOutcome = {
          roundNumber: this.currentRound,
          winner,
          heroPercent,
          villainPercent,
        };
        this.roundHistory.push(outcome);
        if (winner === 'hero') this.heroRoundsWon++;
        else if (winner === 'villain') this.villainRoundsWon++;

        const remainingRegRounds = Math.max(0, TOTAL_REG_ROUNDS - this.roundHistory.length);
        const clinchedEarly =
          remainingRegRounds > 0 && Math.abs(this.heroRoundsWon - this.villainRoundsWon) > remainingRegRounds;
        const isTiedAfterFour =
          this.roundHistory.length === TOTAL_REG_ROUNDS && this.heroRoundsWon === this.villainRoundsWon;

        if (isTiedAfterFour) {
          this.tiebreakerTriggered = true;
          this.totalRounds = MAX_ROUNDS;
        }

        const seriesOver =
          clinchedEarly ||
          this.roundHistory.length >= MAX_ROUNDS ||
          (this.roundHistory.length >= TOTAL_REG_ROUNDS && this.heroRoundsWon !== this.villainRoundsWon);

        events.roundEnded = outcome;
        if (seriesOver) {
          this.phase = 'ended';
          events.seriesEnded = true;
        } else {
          this.phase = 'roundEnd';
          this.roundTransitionRemaining = ROUND_TRANSITION_DURATION;
        }
      }
      return events;
    }

    if (this.phase === 'roundEnd') {
      this.roundTransitionRemaining = Math.max(0, this.roundTransitionRemaining - dt);
      if (this.roundTransitionRemaining <= 0) {
        this.currentRound++;
        this.resetForNextRound();
        events.roundReset = true;
      }
    }

    return events;
  }

  finishSeriesForTest(winnerTeam: NetTeam): void {
    this.terrain.reset();
    const half = this.terrain.arenaHalfSize;
    if (winnerTeam === 'hero') {
      this.terrain.applyBrush('hero', half * 0.35, -half * 0.25, half * 0.65, 2.2);
      this.terrain.applyBrush('hero', half * 0.35, half * 0.25, half * 0.65, 2.2);
    } else {
      this.terrain.applyBrush('villain', -half * 0.35, -half * 0.25, half * 0.65, 2.2);
      this.terrain.applyBrush('villain', -half * 0.35, half * 0.25, half * 0.65, 2.2);
    }
    const { heroPercent, villainPercent } = this.terrain.getPercents();
    this.roundHistory = [1, 2, 3].map((roundNumber) => ({
      roundNumber,
      winner: winnerTeam,
      heroPercent,
      villainPercent,
    }));
    this.currentRound = 3;
    this.totalRounds = TOTAL_REG_ROUNDS;
    this.heroRoundsWon = winnerTeam === 'hero' ? 3 : 0;
    this.villainRoundsWon = winnerTeam === 'villain' ? 3 : 0;
    this.tiebreakerTriggered = false;
    this.timeRemainingSeconds = 0;
    this.roundTransitionRemaining = 0;
    this.phase = 'ended';
    this.rematchVotes.clear();
  }

  getSnapshot(): RoomSnapshot {
    const { heroPercent, villainPercent } = this.terrain.getPercents();
    return {
      roomCode: this.roomCode,
      modeId: this.modeId,
      hostUid: this.hostUid,
      phase: this.phase,
      currentRound: this.currentRound,
      totalRounds: this.totalRounds,
      heroRoundsWon: this.heroRoundsWon,
      villainRoundsWon: this.villainRoundsWon,
      tiebreakerTriggered: this.tiebreakerTriggered,
      countdownRemainingSeconds: this.countdownRemainingSeconds,
      timeRemainingSeconds: this.timeRemainingSeconds,
      roundTransitionRemaining: this.roundTransitionRemaining,
      heroPercent,
      villainPercent,
      roundHistory: [...this.roundHistory],
      players: Array.from(this.players.values()),
      bots: this.bots,
      rematchVotes: Array.from(this.rematchVotes),
    };
  }
}
