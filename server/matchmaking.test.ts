import test from 'node:test';
import assert from 'node:assert/strict';
import { QuickPlayManager } from './matchmaking.ts';

test('QuickPlayManager matches same-mode players, auto-balances teams, and launches immediately when full', () => {
  const mgr = new QuickPlayManager(15);

  // Player 1 creates 2v2 room as hero
  const r1 = mgr.joinQueue({
    uid: 'p1',
    displayName: 'Alpha',
    preferredTeam: 'hero',
    modeId: '2v2',
  });
  assert.equal(r1.launchedNow, false);
  assert.equal(r1.ticket.modeId, '2v2');
  assert.equal(r1.ticket.maxPlayers, 4);
  assert.equal(r1.ticket.humanCount, 1);
  assert.equal(r1.ticket.hostUid, 'p1');
  assert.equal(r1.ticket.backfillSecondsRemaining, 15);

  // Separate 1v1 request must NOT join 2v2 room
  const rOther = mgr.joinQueue({
    uid: 'solo1',
    displayName: 'Duelist',
    preferredTeam: 'hero',
    modeId: '1v1',
  });
  assert.notEqual(rOther.ticket.roomCode, r1.ticket.roomCode);

  // Player 2 joins same 2v2 room as hero (2nd hero slot)
  const r2 = mgr.joinQueue({
    uid: 'p2',
    displayName: 'Bravo',
    preferredTeam: 'hero',
    modeId: '2v2',
  });
  assert.equal(r2.ticket.roomCode, r1.ticket.roomCode);
  assert.equal(r2.ticket.humanCount, 2);
  assert.equal(r2.ticket.players[1].team, 'hero');

  // Player 3 also prefers hero, but hero team is full (2/2), so auto-balances to villain
  const r3 = mgr.joinQueue({
    uid: 'p3',
    displayName: 'Charlie',
    preferredTeam: 'hero',
    modeId: '2v2',
  });
  assert.equal(r3.ticket.roomCode, r1.ticket.roomCode);
  assert.equal(r3.ticket.players[2].team, 'villain');
  assert.equal(r3.launchedNow, false);

  // Player 4 fills 4/4 -> immediate launch without waiting for timer
  const r4 = mgr.joinQueue({
    uid: 'p4',
    displayName: 'Delta',
    preferredTeam: 'villain',
    modeId: '2v2',
  });
  assert.equal(r4.launchedNow, true);
  assert.equal(r4.ticket.status, 'launching');
  assert.equal(r4.ticket.humanCount, 4);
  assert.equal(r4.ticket.aiBotFillCount, 0);
});

test('QuickPlayManager ticks 15s bot backfill timer, handles cancellation, and launches partial rooms with AI bots', () => {
  const mgr = new QuickPlayManager(15);

  const p1 = mgr.joinQueue({
    uid: 'host1',
    displayName: 'GuestOne',
    preferredTeam: 'villain',
    modeId: '3v3',
    isGuest: true,
  });
  const p2 = mgr.joinQueue({
    uid: 'friend2',
    displayName: 'AquaFriend',
    preferredTeam: 'hero',
    modeId: '3v3',
  });
  assert.equal(p2.ticket.roomCode, p1.ticket.roomCode);
  assert.equal(p2.ticket.humanCount, 2);
  assert.equal(p2.ticket.aiBotFillCount, 4);

  // Step 5 seconds -> remaining becomes 10s
  const tick5 = mgr.step(5);
  assert.equal(tick5.launched.length, 0);
  assert.equal(tick5.updated[0].backfillSecondsRemaining, 10);

  // Original host cancels -> friend2 becomes host
  const cancelRes = mgr.cancelQueue('host1');
  assert.ok(cancelRes.updatedTicket);
  assert.equal(cancelRes.updatedTicket.hostUid, 'friend2');
  assert.equal(cancelRes.updatedTicket.humanCount, 1);

  // Step remaining 10 seconds -> launches with 1 human + 5 AI bots
  const tickEnd = mgr.step(10.1);
  assert.equal(tickEnd.launched.length, 1);
  assert.equal(tickEnd.launched[0].roomCode, p1.ticket.roomCode);
  assert.equal(tickEnd.launched[0].status, 'launching');
  assert.equal(tickEnd.launched[0].humanCount, 1);
  assert.equal(tickEnd.launched[0].aiBotFillCount, 5);
});
