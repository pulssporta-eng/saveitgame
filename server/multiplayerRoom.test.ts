import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerRoom } from './multiplayerRoom.ts';

test('MultiplayerRoom assigns opposing spawns and syncs brush territory updates', () => {
  const room = new MultiplayerRoom('ROOM01', '2v2', 'u1');
  const p1 = room.joinPlayer({ uid: 'u1', displayName: 'AquaHost', team: 'hero', isHost: true });
  const p2 = room.joinPlayer({ uid: 'u2', displayName: 'MagmaFriend', team: 'villain', isHost: false });
  const p3 = room.joinPlayer({ uid: 'u3', displayName: 'AquaMate', team: 'hero', isHost: false });

  assert.equal(p1.slotIndex, 0);
  assert.equal(p3.slotIndex, 1);
  assert.equal(p2.slotIndex, 0);
  assert.ok(p1.x < 0, 'hero spawns on west side');
  assert.ok(p2.x > 0, 'villain spawns on east side');

  // Apply water brush on villain desert side -> heroPercent rises above 50%
  room.terrain.applyBrush('hero', 8, 0, 5.5, 1.5);
  const snap = room.getSnapshot();
  assert.ok(snap.heroPercent > 50, `Expected heroPercent > 50, got ${snap.heroPercent}`);
});

test('MultiplayerRoom handles dizzy bomb stun and 3:0 early clinch / 2:2 tiebreaker R5 progression', () => {
  const room = new MultiplayerRoom('CLN001', '1v1', 'u1');
  const h = room.joinPlayer({ uid: 'u1', displayName: 'HeroOne', team: 'hero', isHost: true });
  const v = room.joinPlayer({ uid: 'u2', displayName: 'VillainOne', team: 'villain', isHost: false });

  // Stun test
  v.x = 5;
  v.z = 5;
  const hit = room.applyDizzyBurst(h.uid, 'hero', 6, 5, 4.5);
  assert.deepEqual(hit, ['u2']);
  assert.equal(v.dizzyTimer, 3.0);

  // Win Rounds 1, 2, 3 as hero -> early clinch (3:0) without Round 4
  for (let r = 1; r <= 3; r++) {
    room.step(3.1); // pass countdown
    assert.equal(room.phase, 'playing');
    room.terrain.applyBrush('hero', 6, 0, 6.0, 2.0);
    const res = room.step(60.1);
    assert.ok(res.roundEnded);
    assert.equal(res.roundEnded.winner, 'hero');
    if (r < 3) {
      assert.equal(room.phase, 'roundEnd');
      const trans = room.step(3.3);
      assert.equal(trans.roundReset, true);
    } else {
      assert.equal(res.seriesEnded, true);
      assert.equal(room.phase, 'ended');
      assert.equal(room.heroRoundsWon, 3);
      assert.equal(room.villainRoundsWon, 0);
    }
  }

  // Tie 2-2 after Round 4 -> Final Tiebreaker Round 5
  const tieRoom = new MultiplayerRoom('TIE005', '1v1', 'u1');
  tieRoom.joinPlayer({ uid: 'u1', displayName: 'HeroOne', team: 'hero', isHost: true });
  tieRoom.joinPlayer({ uid: 'u2', displayName: 'VillainOne', team: 'villain', isHost: false });

  const winners: Array<'hero' | 'villain'> = ['hero', 'villain', 'hero', 'villain'];
  for (let i = 0; i < winners.length; i++) {
    tieRoom.step(3.1);
    if (winners[i] === 'hero') {
      tieRoom.terrain.applyBrush('hero', 6, 0, 6.0, 2.0);
    } else {
      tieRoom.terrain.applyBrush('villain', -6, 0, 6.0, 2.0);
    }
    tieRoom.step(60.1);
    tieRoom.step(3.3);
  }
  assert.equal(tieRoom.currentRound, 5);
  assert.equal(tieRoom.totalRounds, 5);
  assert.equal(tieRoom.tiebreakerTriggered, true);
});

test('MultiplayerRoom synchronized rematch voting tracks active players and auto-resets series when all agree', () => {
  const room = new MultiplayerRoom('REM002', '2v2', 'u1');
  room.joinPlayer({ uid: 'u1', displayName: 'HostAqua', team: 'hero', isHost: true });
  room.joinPlayer({ uid: 'u2', displayName: 'PeerMagma', team: 'villain', isHost: false });

  // Reach series end (3:0 hero clinch)
  for (let r = 1; r <= 3; r++) {
    room.step(3.1);
    room.terrain.applyBrush('hero', 6, 0, 6.0, 2.0);
    room.step(60.1);
    if (r < 3) room.step(3.3);
  }
  assert.equal(room.phase, 'ended');

  // First vote does not reset yet
  const v1 = room.voteRematch('u1');
  assert.equal(v1.voted, true);
  assert.equal(v1.allAgreed, false);
  assert.deepEqual(room.getSnapshot().rematchVotes, ['u1']);

  // Unknown uid cannot vote
  const invalid = room.voteRematch('ghost');
  assert.equal(invalid.voted, false);

  // Second connected player votes -> allAgreed true -> restartSeries resets everything
  const v2 = room.voteRematch('u2');
  assert.equal(v2.voted, true);
  assert.equal(v2.allAgreed, true);
  room.restartSeries();

  const resetSnap = room.getSnapshot();
  assert.equal(resetSnap.currentRound, 1);
  assert.equal(resetSnap.heroRoundsWon, 0);
  assert.equal(resetSnap.villainRoundsWon, 0);
  assert.equal(resetSnap.phase, 'countdown');
  assert.equal(resetSnap.timeRemainingSeconds, 60);
  assert.deepEqual(resetSnap.rematchVotes, []);
  assert.equal(resetSnap.roundHistory.length, 0);

  // Disconnecting clears vote cleanly so remaining player isn't blocked
  room.voteRematch('u1');
  room.removePlayer('u2', Date.now());
  assert.equal(room.areAllConnectedPlayersAgreedRematch(), true);
});

