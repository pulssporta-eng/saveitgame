import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePodiumStagingSlots,
  formatRematchButtonText,
  REMATCH_COUNTDOWN_SECONDS,
  resolveCareerDisplayStats,
  summarizeRematchStatus,
} from './podiumAndRematch.ts';

test('computePodiumStagingSlots centers winning squad on podium and places defeated team off to flanks', () => {
  const solo = computePodiumStagingSlots({ winnerCount: 1, loserCount: 1 });
  assert.equal(solo.winners.length, 1);
  assert.equal(solo.winners[0].x, 0);
  assert.equal(solo.winners[0].onPodium, true);
  assert.equal(solo.losers.length, 1);
  assert.ok(Math.abs(solo.losers[0].x) >= 3.4);
  assert.equal(solo.losers[0].onPodium, false);

  const squad4 = computePodiumStagingSlots({ winnerCount: 4, loserCount: 4 });
  assert.equal(squad4.winners.length, 4);
  for (const w of squad4.winners) {
    assert.ok(Math.abs(w.x) <= 2.1, `winner slot ${w.x} fits inside podium deck`);
  }
  assert.equal(squad4.losers.length, 4);
  for (const l of squad4.losers) {
    assert.ok(Math.abs(l.x) >= 3.4, `loser slot ${l.x} placed clear of center podium`);
  }
});

test('summarizeRematchStatus computes live Rematch Ready X / Y counts and per-player checkmarks', () => {
  const players = [
    { uid: 'u1', displayName: 'AquaHost', team: 'hero' as const, isHost: true },
    { uid: 'u2', displayName: 'MagmaMate', team: 'villain' as const, isHost: false },
  ];

  const none = summarizeRematchStatus(players, [], 'u1');
  assert.equal(none.voteCount, 0);
  assert.equal(none.totalHumans, 2);
  assert.equal(none.hasLocalVoted, false);
  assert.equal(none.allAgreed, false);
  assert.equal(none.label, 'Rematch Ready: 0 / 2');

  const partial = summarizeRematchStatus(players, ['u1'], 'u1');
  assert.equal(partial.voteCount, 1);
  assert.equal(partial.hasLocalVoted, true);
  assert.equal(partial.allAgreed, false);
  assert.equal(partial.label, 'Rematch Ready: 1 / 2');
  assert.equal(partial.playerChips[0].voted, true);
  assert.equal(partial.playerChips[0].isLocal, true);
  assert.equal(partial.playerChips[1].voted, false);

  const ready = summarizeRematchStatus(players, ['u1', 'u2'], 'u2');
  assert.equal(ready.voteCount, 2);
  assert.equal(ready.allAgreed, true);
  assert.equal(ready.label, 'Rematch Ready: 2 / 2');
});

test('resolveCareerDisplayStats prioritizes cloud profile stats and preserves max bestScore', () => {
  const stats = resolveCareerDisplayStats({
    playerTeam: 'hero',
    matchOutcome: {
      winner: 'hero',
      playerWon: true,
      heroPercent: 61.8,
      villainPercent: 38.2,
      heroRoundsWon: 3,
      villainRoundsWon: 1,
      clinchedEarly: false,
      tiebreakerPlayed: false,
      roundHistory: [],
    },
    cloudProfile: {
      displayName: 'TideCaptain',
      matchesPlayed: 7,
      wins: 5,
      bestScore: 54.2,
    },
    fallbackHandle: 'Guest',
    sessionStats: { matchesPlayed: 1, wins: 1, bestScore: 61.8 },
    isCloudSynced: true,
  });

  assert.equal(stats.trooperHandle, 'TideCaptain');
  assert.equal(stats.territoryPaintedPct, 61.8);
  assert.equal(stats.matchesPlayed, 7);
  assert.equal(stats.wins, 5);
  assert.equal(stats.bestScore, 61.8);
  assert.equal(stats.isCloudSynced, true);
});

test('formatRematchButtonText formats 60s countdown cleanly for solo and voted online states', () => {
  assert.equal(REMATCH_COUNTDOWN_SECONDS, 60);
  assert.equal(
    formatRematchButtonText({
      secondsLeft: 59,
      isOnline: false,
      hasVotedRematch: false,
      voteCount: 0,
      totalHumans: 1,
    }),
    'Rematch · 59S',
  );
  assert.equal(
    formatRematchButtonText({
      secondsLeft: 42,
      isOnline: true,
      hasVotedRematch: true,
      voteCount: 1,
      totalHumans: 2,
    }),
    'Voted ✓ (1/2) · 42S',
  );
  assert.equal(
    formatRematchButtonText({
      secondsLeft: -3,
      isOnline: false,
      hasVotedRematch: false,
      voteCount: 0,
      totalHumans: 1,
    }),
    'Rematch · 0S',
  );
});
