import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import {
  MODE_METRICS,
  MultiplayerRoom,
  type NetBotSyncSample,
  type NetModeId,
  type NetTeam,
} from './server/multiplayerRoom.ts';
import { QuickPlayManager, type QuickPlayTicket } from './server/matchmaking.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

interface ClientConn {
  ws: WebSocket;
  roomCode: string | null;
  uid: string | null;
  quickPlayUid: string | null;
}

const rooms = new Map<string, MultiplayerRoom>();
const roomClients = new Map<string, Set<ClientConn>>();
const quickPlay = new QuickPlayManager();
const quickPlaySockets = new Map<string, ClientConn>();

function getOrCreateRoom(roomCode: string, modeId: NetModeId, hostUid: string): MultiplayerRoom {
  let room = rooms.get(roomCode);
  if (!room) {
    room = new MultiplayerRoom(roomCode, modeId, hostUid);
    rooms.set(roomCode, room);
    roomClients.set(roomCode, new Set());
  }
  return room;
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoom(roomCode: string, payload: unknown, exceptUid?: string): void {
  const clients = roomClients.get(roomCode);
  if (!clients) return;
  const serialized = JSON.stringify(payload);
  for (const conn of clients) {
    if (exceptUid && conn.uid === exceptUid) continue;
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(serialized);
    }
  }
}

function broadcastQuickPlayTicket(type: 'quickplay_update' | 'quickplay_launch', ticket: QuickPlayTicket): void {
  if (type === 'quickplay_launch') {
    getOrCreateRoom(ticket.roomCode, ticket.modeId, ticket.hostUid);
  }
  const serialized = JSON.stringify({ type, ticket });
  for (const player of ticket.players) {
    const conn = quickPlaySockets.get(player.uid);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(serialized);
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      activeRooms: rooms.size,
      quickPlayRooms: quickPlay.rooms.size,
      timestamp: Date.now(),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const conn: ClientConn = { ws, roomCode: null, uid: null, quickPlayUid: null };

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = String(msg.type || '');

      if (type === 'quickplay_join') {
        const uid = String(msg.uid || '').slice(0, 128);
        if (!uid) return;
        const modeRaw = String(msg.modeId || '2v2') as NetModeId;
        const modeId: NetModeId = modeRaw in MODE_METRICS ? modeRaw : '2v2';
        const preferredTeam: NetTeam = msg.preferredTeam === 'villain' ? 'villain' : 'hero';
        const displayName = String(msg.displayName || 'Trooper').slice(0, 24);
        const isGuest = Boolean(msg.isGuest);

        conn.quickPlayUid = uid;
        quickPlaySockets.set(uid, conn);

        const res = quickPlay.joinQueue({
          uid,
          displayName,
          preferredTeam,
          modeId,
          isGuest,
        });
        broadcastQuickPlayTicket(res.launchedNow ? 'quickplay_launch' : 'quickplay_update', res.ticket);
        return;
      }

      if (type === 'quickplay_cancel') {
        const targetUid = conn.quickPlayUid || String(msg.uid || '').slice(0, 128);
        if (targetUid) {
          quickPlaySockets.delete(targetUid);
          conn.quickPlayUid = null;
          const res = quickPlay.cancelQueue(targetUid);
          if (res.updatedTicket) {
            broadcastQuickPlayTicket('quickplay_update', res.updatedTicket);
          }
        }
        sendJson(ws, { type: 'quickplay_cancelled' });
        return;
      }

      if (type === 'join') {
        const roomCode = String(msg.roomCode || '')
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, '')
          .slice(0, 12);
        const uid = String(msg.uid || '').slice(0, 128);
        if (!roomCode || !uid) return;

        const modeRaw = String(msg.modeId || '2v2') as NetModeId;
        const modeId: NetModeId = modeRaw in MODE_METRICS ? modeRaw : '2v2';
        const team: NetTeam = msg.team === 'villain' ? 'villain' : 'hero';
        const displayName = String(msg.displayName || 'Trooper').slice(0, 24);
        const hostUid = String(msg.hostUid || uid).slice(0, 128);
        const isHost = hostUid === uid;

        // Clean up previous room membership if switching rooms on same socket
        if (conn.roomCode && conn.uid) {
          const prevClients = roomClients.get(conn.roomCode);
          prevClients?.delete(conn);
          rooms.get(conn.roomCode)?.removePlayer(conn.uid, Date.now());
        }

        const room = getOrCreateRoom(roomCode, modeId, hostUid);
        if (isHost && room.modeId !== modeId && room.players.size <= 1) {
          room.modeId = modeId;
        }
        const player = room.joinPlayer({ uid, displayName, team, isHost });
        conn.roomCode = roomCode;
        conn.uid = uid;

        let clients = roomClients.get(roomCode);
        if (!clients) {
          clients = new Set();
          roomClients.set(roomCode, clients);
        }
        clients.add(conn);

        sendJson(ws, {
          type: 'welcome',
          yourUid: uid,
          yourSlotIndex: player.slotIndex,
          snapshot: room.getSnapshot(),
        });
        broadcastRoom(roomCode, { type: 'state', snapshot: room.getSnapshot() });
        return;
      }

      if (!conn.roomCode || !conn.uid) return;
      const room = rooms.get(conn.roomCode);
      if (!room) return;

      if (type === 'pose') {
        room.updatePlayerPose(conn.uid, {
          x: typeof msg.x === 'number' ? msg.x : undefined,
          y: typeof msg.y === 'number' ? msg.y : undefined,
          z: typeof msg.z === 'number' ? msg.z : undefined,
          yaw: typeof msg.yaw === 'number' ? msg.yaw : undefined,
          pitch: typeof msg.pitch === 'number' ? msg.pitch : undefined,
          walkPhase: typeof msg.walkPhase === 'number' ? msg.walkPhase : undefined,
          spraying: typeof msg.spraying === 'boolean' ? msg.spraying : undefined,
          ammo: typeof msg.ammo === 'number' ? msg.ammo : undefined,
          hasGrenade: typeof msg.hasGrenade === 'boolean' ? msg.hasGrenade : undefined,
          hasDizzyBomb: typeof msg.hasDizzyBomb === 'boolean' ? msg.hasDizzyBomb : undefined,
        });
        return;
      }

      if (type === 'brush') {
        const role: NetTeam = msg.role === 'villain' ? 'villain' : 'hero';
        const x = Number(msg.x);
        const z = Number(msg.z);
        const radius = Math.max(0.5, Math.min(8, Number(msg.radius) || 2.2));
        const strength = Math.max(0.05, Math.min(2.5, Number(msg.strength) || 0.7));
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        room.terrain.applyBrush(role, x, z, radius, strength);
        broadcastRoom(
          conn.roomCode,
          { type: 'brush', fromUid: conn.uid, role, x, z, radius, strength },
          conn.uid,
        );
        return;
      }

      if (type === 'grenade') {
        const role: NetTeam = msg.role === 'villain' ? 'villain' : 'hero';
        broadcastRoom(
          conn.roomCode,
          {
            type: 'grenade',
            fromUid: conn.uid,
            role,
            originX: Number(msg.originX) || 0,
            originY: Number(msg.originY) || 1.2,
            originZ: Number(msg.originZ) || 0,
            targetX: Number(msg.targetX) || 0,
            targetZ: Number(msg.targetZ) || 0,
            flightDuration: Math.max(0.25, Math.min(2.5, Number(msg.flightDuration) || 0.7)),
          },
          conn.uid,
        );
        return;
      }

      if (type === 'dizzy') {
        const role: NetTeam = msg.role === 'villain' ? 'villain' : 'hero';
        const x = Number(msg.x);
        const z = Number(msg.z);
        const blastRadius = Math.max(1, Math.min(10, Number(msg.blastRadius) || 4.4));
        if (!Number.isFinite(x) || !Number.isFinite(z)) return;
        const hitUids = room.applyDizzyBurst(conn.uid, role, x, z, blastRadius);
        broadcastRoom(conn.roomCode, {
          type: 'dizzy',
          fromUid: conn.uid,
          role,
          x,
          z,
          blastRadius,
          hitUids,
        });
        return;
      }

      if (type === 'bots') {
        // Authoritative host (or first connected client) relays bot motion
        const firstUid = room.players.keys().next().value;
        if (conn.uid === room.hostUid || conn.uid === firstUid) {
          if (Array.isArray(msg.bots)) {
            room.bots = (msg.bots as NetBotSyncSample[]).slice(0, 8);
          }
        }
        return;
      }

      if (type === 'rematch_vote') {
        if (room.phase !== 'ended') {
          sendJson(ws, { type: 'state', snapshot: room.getSnapshot() });
          return;
        }
        const res = room.voteRematch(conn.uid);
        if (res.allAgreed) {
          room.restartSeries();
          broadcastRoom(conn.roomCode, {
            type: 'roundReset',
            roundNumber: room.currentRound,
            snapshot: room.getSnapshot(),
          });
        } else {
          broadcastRoom(conn.roomCode, {
            type: 'state',
            snapshot: room.getSnapshot(),
          });
        }
        return;
      }

      if (!IS_PROD && type === 'debug_finish_series') {
        const winnerTeam: NetTeam = msg.winnerTeam === 'villain' ? 'villain' : 'hero';
        room.finishSeriesForTest(winnerTeam);
        broadcastRoom(conn.roomCode, {
          type: 'state',
          snapshot: room.getSnapshot(),
        });
        return;
      }

      if (type === 'restart') {
        const canRestart =
          conn.uid === room.hostUid &&
          (room.phase !== 'ended' ||
            room.areAllConnectedPlayersAgreedRematch() ||
            room.players.size <= 1);
        if (canRestart || room.players.size <= 1) {
          room.restartSeries();
          broadcastRoom(conn.roomCode, {
            type: 'roundReset',
            roundNumber: room.currentRound,
            snapshot: room.getSnapshot(),
          });
        }
      }
    });

    ws.on('close', () => {
      if (conn.quickPlayUid) {
        const qpRoomCode = quickPlay.playerToRoom.get(conn.quickPlayUid);
        const qpRoom = qpRoomCode ? quickPlay.rooms.get(qpRoomCode) : undefined;
        quickPlaySockets.delete(conn.quickPlayUid);
        if (qpRoom && qpRoom.status === 'searching') {
          const res = quickPlay.cancelQueue(conn.quickPlayUid);
          if (res.updatedTicket) {
            broadcastQuickPlayTicket('quickplay_update', res.updatedTicket);
          }
        }
      }
      if (conn.roomCode && conn.uid) {
        const clients = roomClients.get(conn.roomCode);
        clients?.delete(conn);
        const room = rooms.get(conn.roomCode);
        room?.removePlayer(conn.uid, Date.now());
        if (room) {
          if (room.phase === 'ended' && room.areAllConnectedPlayersAgreedRematch()) {
            room.restartSeries();
            broadcastRoom(conn.roomCode, {
              type: 'roundReset',
              roundNumber: room.currentRound,
              snapshot: room.getSnapshot(),
            });
          } else {
            broadcastRoom(conn.roomCode, { type: 'state', snapshot: room.getSnapshot() });
          }
        }
      }
    });
  });

  // Authoritative 20Hz simulation & broadcast tick across active multiplayer & Quick Play rooms
  const TICK_MS = 50;
  setInterval(() => {
    const now = Date.now();
    const qpStep = quickPlay.step(TICK_MS / 1000, now);
    for (const ticket of qpStep.updated) {
      broadcastQuickPlayTicket('quickplay_update', ticket);
    }
    for (const ticket of qpStep.launched) {
      broadcastQuickPlayTicket('quickplay_launch', ticket);
    }

    for (const [code, room] of rooms.entries()) {
      if (room.emptySinceMs !== null && now - room.emptySinceMs > 120_000) {
        rooms.delete(code);
        roomClients.delete(code);
        continue;
      }
      if (room.players.size === 0) continue;

      const stepRes = room.step(TICK_MS / 1000);
      const snapshot = room.getSnapshot();

      if (stepRes.roundReset) {
        broadcastRoom(code, {
          type: 'roundReset',
          roundNumber: room.currentRound,
          snapshot,
        });
      } else {
        broadcastRoom(code, { type: 'state', snapshot });
      }
    }
  }, TICK_MS);

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, allowedHosts: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      }),
    );
    app.get('*', (req, res) => {
      if (req.path.startsWith('/assets/')) {
        res.status(404).end();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Save It arena + multiplayer server listening on http://localhost:${PORT}`);
  });
}

void startServer();
