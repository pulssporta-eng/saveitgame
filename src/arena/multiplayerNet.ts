import { MatchModeId } from './matchConfig';
import { TrooperRole } from './trooperBuilder';

export interface OnlinePlayerSync {
  uid: string;
  displayName: string;
  team: TrooperRole;
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

export interface OnlineBotSync {
  slotKey: string;
  role: TrooperRole;
  x: number;
  y: number;
  z: number;
  yaw: number;
  walkPhase: number;
  spraying: boolean;
  dizzyTimer: number;
}

export interface OnlineRoomSnapshot {
  roomCode: string;
  modeId: MatchModeId;
  hostUid: string;
  phase: 'countdown' | 'playing' | 'roundEnd' | 'ended';
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
  roundHistory: Array<{
    roundNumber: number;
    winner: TrooperRole | 'draw';
    heroPercent: number;
    villainPercent: number;
  }>;
  players: OnlinePlayerSync[];
  bots: OnlineBotSync[];
  rematchVotes?: string[];
}

export interface OnlineBrushEvent {
  fromUid: string;
  role: TrooperRole;
  x: number;
  z: number;
  radius: number;
  strength: number;
}

export interface OnlineGrenadeEvent {
  fromUid: string;
  role: TrooperRole;
  originX: number;
  originY: number;
  originZ: number;
  targetX: number;
  targetZ: number;
  flightDuration: number;
}

export interface OnlineDizzyEvent {
  fromUid: string;
  role: TrooperRole;
  x: number;
  z: number;
  blastRadius: number;
  hitUids: string[];
}

export interface MultiplayerClientHandlers {
  onWelcome?: (yourSlotIndex: number, snapshot: OnlineRoomSnapshot) => void;
  onState?: (snapshot: OnlineRoomSnapshot) => void;
  onBrush?: (evt: OnlineBrushEvent) => void;
  onGrenade?: (evt: OnlineGrenadeEvent) => void;
  onDizzy?: (evt: OnlineDizzyEvent) => void;
  onRoundReset?: (roundNumber: number, snapshot: OnlineRoomSnapshot) => void;
  onDisconnect?: () => void;
}

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private reconnectTimer: number | null = null;
  private lastPoseSentAt = 0;
  private lastBotsSentAt = 0;
  private readonly handlers: MultiplayerClientHandlers;
  readonly joinParams: {
    roomCode: string;
    uid: string;
    displayName: string;
    team: TrooperRole;
    modeId: MatchModeId;
    hostUid: string;
  };

  constructor(
    joinParams: {
      roomCode: string;
      uid: string;
      displayName: string;
      team: TrooperRole;
      modeId: MatchModeId;
      hostUid: string;
    },
    handlers: MultiplayerClientHandlers,
  ) {
    this.joinParams = joinParams;
    this.handlers = handlers;
    this.connect();
  }

  private getWsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }

  private connect(): void {
    if (this.closedByUser) return;
    try {
      const ws = new WebSocket(this.getWsUrl());
      this.ws = ws;

      ws.addEventListener('open', () => {
        this.send({
          type: 'join',
          ...this.joinParams,
        });
      });

      ws.addEventListener('message', (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const type = String(msg.type || '');
        if (type === 'welcome' && msg.snapshot) {
          this.handlers.onWelcome?.(
            Number(msg.yourSlotIndex) || 0,
            msg.snapshot as OnlineRoomSnapshot,
          );
        } else if (type === 'state' && msg.snapshot) {
          this.handlers.onState?.(msg.snapshot as OnlineRoomSnapshot);
        } else if (type === 'brush') {
          this.handlers.onBrush?.(msg as unknown as OnlineBrushEvent);
        } else if (type === 'grenade') {
          this.handlers.onGrenade?.(msg as unknown as OnlineGrenadeEvent);
        } else if (type === 'dizzy') {
          this.handlers.onDizzy?.(msg as unknown as OnlineDizzyEvent);
        } else if (type === 'roundReset' && msg.snapshot) {
          this.handlers.onRoundReset?.(
            Number(msg.roundNumber) || 1,
            msg.snapshot as OnlineRoomSnapshot,
          );
        }
      });

      ws.addEventListener('close', () => {
        this.handlers.onDisconnect?.();
        if (!this.closedByUser) {
          this.reconnectTimer = window.setTimeout(() => this.connect(), 1400);
        }
      });
    } catch {
      if (!this.closedByUser) {
        this.reconnectTimer = window.setTimeout(() => this.connect(), 1800);
      }
    }
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  sendPoseThrottled(pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    walkPhase: number;
    spraying: boolean;
    ammo: number;
    hasGrenade: boolean;
    hasDizzyBomb: boolean;
  }): void {
    const now = performance.now();
    if (now - this.lastPoseSentAt < 45) return;
    this.lastPoseSentAt = now;
    this.send({ type: 'pose', ...pose });
  }

  sendBrush(role: TrooperRole, x: number, z: number, radius: number, strength: number): void {
    this.send({ type: 'brush', role, x, z, radius, strength });
  }

  sendGrenade(
    role: TrooperRole,
    originX: number,
    originY: number,
    originZ: number,
    targetX: number,
    targetZ: number,
    flightDuration: number,
  ): void {
    this.send({
      type: 'grenade',
      role,
      originX,
      originY,
      originZ,
      targetX,
      targetZ,
      flightDuration,
    });
  }

  sendDizzy(role: TrooperRole, x: number, z: number, blastRadius: number): void {
    this.send({ type: 'dizzy', role, x, z, blastRadius });
  }

  sendBotsThrottled(bots: OnlineBotSync[]): void {
    const now = performance.now();
    if (now - this.lastBotsSentAt < 50) return;
    this.lastBotsSentAt = now;
    this.send({ type: 'bots', bots });
  }

  sendRematchVote(): void {
    this.send({ type: 'rematch_vote' });
  }

  sendRestartSeries(): void {
    this.send({ type: 'restart' });
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export interface QuickPlayPlayerInfo {
  uid: string;
  displayName: string;
  team: TrooperRole;
  isGuest: boolean;
}

export interface QuickPlayTicket {
  roomCode: string;
  modeId: MatchModeId;
  hostUid: string;
  status: 'searching' | 'launching';
  maxPlayers: number;
  teamSize: number;
  humanCount: number;
  aiBotFillCount: number;
  backfillSecondsRemaining: number;
  players: QuickPlayPlayerInfo[];
}

export interface QuickPlayClientHandlers {
  onUpdate: (ticket: QuickPlayTicket) => void;
  onLaunch: (ticket: QuickPlayTicket) => void;
  onError?: (message: string) => void;
}

export class QuickPlayClient {
  private ws: WebSocket | null = null;
  private closedByUser = false;

  constructor(
    params: {
      uid: string;
      displayName: string;
      preferredTeam: TrooperRole;
      modeId: MatchModeId;
      isGuest: boolean;
    },
    handlers: QuickPlayClientHandlers,
  ) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    try {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.addEventListener('open', () => {
        if (this.closedByUser) return;
        ws.send(
          JSON.stringify({
            type: 'quickplay_join',
            ...params,
          }),
        );
      });

      ws.addEventListener('message', (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const type = String(msg.type || '');
        if (type === 'quickplay_update' && msg.ticket) {
          handlers.onUpdate(msg.ticket as QuickPlayTicket);
        } else if (type === 'quickplay_launch' && msg.ticket) {
          handlers.onLaunch(msg.ticket as QuickPlayTicket);
        }
      });

      ws.addEventListener('error', () => {
        if (!this.closedByUser) {
          handlers.onError?.('Unable to connect to matchmaking server.');
        }
      });

      ws.addEventListener('close', () => {
        if (!this.closedByUser) {
          handlers.onError?.('Matchmaking connection closed.');
        }
      });
    } catch {
      handlers.onError?.('Unable to open WebSocket matchmaking connection.');
    }
  }

  cancel(): void {
    this.closedByUser = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'quickplay_cancel' }));
    }
    this.ws?.close();
    this.ws = null;
  }

  closeWithoutCancel(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }
}
