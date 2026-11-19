import { MODE_METRICS, type NetModeId, type NetTeam } from './multiplayerRoom.ts';

export const QUICK_PLAY_BACKFILL_SECONDS = 15;

export interface QuickPlayPlayer {
  uid: string;
  displayName: string;
  team: NetTeam;
  isGuest: boolean;
}

export type QuickPlayStatus = 'searching' | 'launching';

export interface QuickPlayTicket {
  roomCode: string;
  modeId: NetModeId;
  hostUid: string;
  status: QuickPlayStatus;
  maxPlayers: number;
  teamSize: number;
  humanCount: number;
  aiBotFillCount: number;
  backfillSecondsRemaining: number;
  players: QuickPlayPlayer[];
}

export interface QuickPlayRoomInternal {
  roomCode: string;
  modeId: NetModeId;
  hostUid: string;
  status: QuickPlayStatus;
  maxPlayers: number;
  teamSize: number;
  backfillRemaining: number;
  players: QuickPlayPlayer[];
  launchedAtMs: number | null;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function createRoomCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 25; attempt++) {
    let code = 'QP';
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!existing.has(code)) return code;
  }
  return `QP${Math.floor(1000 + Math.random() * 8999)}`;
}

export function assignBalancedTeam(
  players: QuickPlayPlayer[],
  preferredTeam: NetTeam,
  teamSize: number,
): NetTeam {
  const heroCount = players.filter((p) => p.team === 'hero').length;
  const villainCount = players.filter((p) => p.team === 'villain').length;

  if (preferredTeam === 'hero' && heroCount < teamSize) return 'hero';
  if (preferredTeam === 'villain' && villainCount < teamSize) return 'villain';

  if (heroCount < villainCount && heroCount < teamSize) return 'hero';
  if (villainCount < heroCount && villainCount < teamSize) return 'villain';
  return heroCount < teamSize ? 'hero' : 'villain';
}

export function toTicket(room: QuickPlayRoomInternal): QuickPlayTicket {
  const humanCount = room.players.length;
  return {
    roomCode: room.roomCode,
    modeId: room.modeId,
    hostUid: room.hostUid,
    status: room.status,
    maxPlayers: room.maxPlayers,
    teamSize: room.teamSize,
    humanCount,
    aiBotFillCount: Math.max(0, room.maxPlayers - humanCount),
    backfillSecondsRemaining:
      room.status === 'launching' ? 0 : Math.max(0, Math.ceil(room.backfillRemaining)),
    players: room.players.map((p) => ({ ...p })),
  };
}

export class QuickPlayManager {
  readonly rooms = new Map<string, QuickPlayRoomInternal>();
  readonly playerToRoom = new Map<string, string>();
  private readonly backfillDurationSeconds: number;

  constructor(backfillDurationSeconds = QUICK_PLAY_BACKFILL_SECONDS) {
    this.backfillDurationSeconds = backfillDurationSeconds;
  }

  joinQueue(params: {
    uid: string;
    displayName: string;
    preferredTeam: NetTeam;
    modeId: NetModeId;
    isGuest?: boolean;
  }): { ticket: QuickPlayTicket; launchedNow: boolean } {
    // If already queued, remove stale membership cleanly first
    this.cancelQueue(params.uid);

    const metrics = MODE_METRICS[params.modeId];
    const teamSize = metrics.teamSize;
    const maxPlayers = teamSize * 2;

    // 1. Search open public matchmaking room matching exact mode with free human slot
    let targetRoom: QuickPlayRoomInternal | undefined;
    for (const candidate of this.rooms.values()) {
      if (
        candidate.status === 'searching' &&
        candidate.modeId === params.modeId &&
        candidate.players.length < candidate.maxPlayers
      ) {
        targetRoom = candidate;
        break;
      }
    }

    // 2. Otherwise create a fresh public matchmaking room with this player as host
    if (!targetRoom) {
      const code = createRoomCode(new Set(this.rooms.keys()));
      targetRoom = {
        roomCode: code,
        modeId: params.modeId,
        hostUid: params.uid,
        status: 'searching',
        maxPlayers,
        teamSize,
        backfillRemaining: this.backfillDurationSeconds,
        players: [],
        launchedAtMs: null,
      };
      this.rooms.set(code, targetRoom);
    }

    const assignedTeam = assignBalancedTeam(targetRoom.players, params.preferredTeam, teamSize);
    targetRoom.players.push({
      uid: params.uid,
      displayName: params.displayName.trim().slice(0, 24) || 'Trooper',
      team: assignedTeam,
      isGuest: Boolean(params.isGuest),
    });
    this.playerToRoom.set(params.uid, targetRoom.roomCode);

    let launchedNow = false;
    if (targetRoom.players.length >= targetRoom.maxPlayers) {
      targetRoom.status = 'launching';
      targetRoom.backfillRemaining = 0;
      targetRoom.launchedAtMs = Date.now();
      launchedNow = true;
    }

    return {
      ticket: toTicket(targetRoom),
      launchedNow,
    };
  }

  cancelQueue(uid: string): { updatedTicket?: QuickPlayTicket; removedRoomCode?: string } {
    const code = this.playerToRoom.get(uid);
    if (!code) return {};
    this.playerToRoom.delete(uid);

    const room = this.rooms.get(code);
    if (!room) return { removedRoomCode: code };

    room.players = room.players.filter((p) => p.uid !== uid);
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return { removedRoomCode: code };
    }

    if (room.hostUid === uid) {
      room.hostUid = room.players[0].uid;
    }

    return { updatedTicket: toTicket(room) };
  }

  step(dt: number, nowMs = Date.now()): {
    updated: QuickPlayTicket[];
    launched: QuickPlayTicket[];
  } {
    const updated: QuickPlayTicket[] = [];
    const launched: QuickPlayTicket[] = [];

    for (const [code, room] of this.rooms.entries()) {
      if (room.status === 'launching') {
        if (room.launchedAtMs !== null && nowMs - room.launchedAtMs > 15_000) {
          for (const p of room.players) {
            if (this.playerToRoom.get(p.uid) === code) {
              this.playerToRoom.delete(p.uid);
            }
          }
          this.rooms.delete(code);
        }
        continue;
      }

      if (room.players.length === 0) {
        this.rooms.delete(code);
        continue;
      }

      const prevSec = Math.ceil(room.backfillRemaining);
      room.backfillRemaining = Math.max(0, room.backfillRemaining - dt);
      const nextSec = Math.ceil(room.backfillRemaining);

      if (room.backfillRemaining <= 0) {
        room.status = 'launching';
        room.launchedAtMs = nowMs;
        launched.push(toTicket(room));
      } else if (nextSec !== prevSec) {
        updated.push(toTicket(room));
      }
    }

    return { updated, launched };
  }
}
