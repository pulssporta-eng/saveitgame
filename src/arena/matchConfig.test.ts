import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceRoundSeries,
  computeTeamSpawnPositions,
  computeTeamTerritoryPercents,
  formatMatchTimer,
  getCountdownState,
  getLoadingStageLabel,
  getMatchModeConfig,
  MATCH_DURATION_SECONDS,
  resolveMatchOutcome,
  ROUND_DURATION_SECONDS,
  RoundOutcome,
  TOTAL_ROUNDS,
} from './matchConfig';
import { TerrainSimulation } from './terrainState';

test('match modes map 1v1..4v4 to 30x30..60x60 arenas with 4x 60s rounds', () => {
  assert.equal(TOTAL_ROUNDS, 4);
  assert.equal(ROUND_DURATION_SECONDS, 60);
  assert.equal(MATCH_DURATION_SECONDS, 60);
  const m1 = getMatchModeConfig('1v1');
  const m2 = getMatchModeConfig('2v2');
  const m3 = getMatchModeConfig('3v3');
  const m4 = getMatchModeConfig('4v4');

  assert.deepEqual(
    [m1, m2, m3, m4].map((m) => [m.teamSize, m.arenaSpan]),
    [
      [1, 30],
      [2, 40],
      [3, 50],
      [4, 60],
    ],
  );
});

test('formatMatchTimer formats 01:00 round clock and flags final 15 seconds', () => {
  const start = formatMatchTimer(60);
  assert.equal(start.formatted, '01:00');
  assert.equal(start.isFinalStretch, false);

  const mid = formatMatchTimer(32.2);
  assert.equal(mid.formatted, '00:33');
  assert.equal(mid.isFinalStretch, false);

  const urgent = formatMatchTimer(14.1);
  assert.equal(urgent.formatted, '00:15');
  assert.equal(urgent.isFinalStretch, true);

  const lastSec = formatMatchTimer(0.4);
  assert.equal(lastSec.formatted, '00:01');
  assert.equal(lastSec.isFinalStretch, true);

  const done = formatMatchTimer(0);
  assert.equal(done.formatted, '00:00');
  assert.equal(done.isFinalStretch, false);
});

test('advanceRoundSeries clinches early on 3:0 without a 4th round and plays 4th round when needed', () => {
  // 1) 3:0 Hero sweep ends immediately after Round 3
  let history: RoundOutcome[] = [];
  const r1 = advanceRoundSeries(history, 0.62);
  assert.equal(r1.heroRoundsWon, 1);
  assert.equal(r1.seriesOver, false);
  assert.equal(r1.nextRoundNumber, 2);

  history = r1.roundHistory;
  const r2 = advanceRoundSeries(history, 0.58);
  assert.equal(r2.heroRoundsWon, 2);
  assert.equal(r2.seriesOver, false); // Opponent could still tie 2-2
  assert.equal(r2.nextRoundNumber, 3);

  history = r2.roundHistory;
  const r3 = advanceRoundSeries(history, 0.55);
  assert.equal(r3.heroRoundsWon, 3);
  assert.equal(r3.villainRoundsWon, 0);
  assert.equal(r3.seriesOver, true);
  assert.equal(r3.clinchedEarly, true);
  assert.equal(r3.seriesWinner, 'hero');
  assert.equal(r3.nextRoundNumber, null);
  assert.equal(r3.roundHistory.length, 3);

  // 2) 0:3 Villain sweep also ends immediately after Round 3
  const v1 = advanceRoundSeries([], 0.38);
  const v2 = advanceRoundSeries(v1.roundHistory, 0.41);
  const v3 = advanceRoundSeries(v2.roundHistory, 0.44);
  assert.equal(v3.heroRoundsWon, 0);
  assert.equal(v3.villainRoundsWon, 3);
  assert.equal(v3.seriesOver, true);
  assert.equal(v3.clinchedEarly, true);
  assert.equal(v3.seriesWinner, 'villain');

  // 3) 2:1 continues into Round 4, and resolves 3:1 or 2:2 after Round 4
  const c1 = advanceRoundSeries([], 0.6); // H 1-0
  const c2 = advanceRoundSeries(c1.roundHistory, 0.4); // V 1-1
  const c3 = advanceRoundSeries(c2.roundHistory, 0.6); // H 2-1
  assert.equal(c3.seriesOver, false);
  assert.equal(c3.clinchedEarly, false);
  assert.equal(c3.nextRoundNumber, 4);

  const c4Hero = advanceRoundSeries(c3.roundHistory, 0.54);
  assert.equal(c4Hero.seriesOver, true);
  assert.equal(c4Hero.clinchedEarly, false);
  assert.equal(c4Hero.heroRoundsWon, 3);
  assert.equal(c4Hero.villainRoundsWon, 1);
  assert.equal(c4Hero.seriesWinner, 'hero');

  // 4) Tied after 4 rounds (2:2) advances to Final Round 5 instead of ending in draw
  const c4Tie = advanceRoundSeries(c3.roundHistory, 0.42);
  assert.equal(c4Tie.seriesOver, false);
  assert.equal(c4Tie.tiebreakerTriggered, true);
  assert.equal(c4Tie.heroRoundsWon, 2);
  assert.equal(c4Tie.villainRoundsWon, 2);
  assert.equal(c4Tie.nextRoundNumber, 5);

  const r5Hero = advanceRoundSeries(c4Tie.roundHistory, 0.56);
  assert.equal(r5Hero.seriesOver, true);
  assert.equal(r5Hero.tiebreakerTriggered, true);
  assert.equal(r5Hero.heroRoundsWon, 3);
  assert.equal(r5Hero.villainRoundsWon, 2);
  assert.equal(r5Hero.seriesWinner, 'hero');
  assert.equal(r5Hero.roundHistory.length, 5);
});

test('computeTeamTerritoryPercents and resolveMatchOutcome resolve Hero/Villain victory accurately', () => {
  const pct = computeTeamTerritoryPercents(0.5424);
  assert.equal(pct.heroPercent, 54.2);
  assert.equal(pct.villainPercent, 45.8);
  assert.equal(Math.round((pct.heroPercent + pct.villainPercent) * 10) / 10, 100);

  const heroWin = resolveMatchOutcome('hero', 0.568);
  assert.equal(heroWin.winner, 'hero');
  assert.equal(heroWin.playerWon, true);

  const villainDefeat = resolveMatchOutcome('villain', 0.568);
  assert.equal(villainDefeat.winner, 'hero');
  assert.equal(villainDefeat.playerWon, false);

  const villainWin = resolveMatchOutcome('villain', 0.382);
  assert.equal(villainWin.winner, 'villain');
  assert.equal(villainWin.playerWon, true);
});

test('computeTeamSpawnPositions places N troopers on home side inside scaled bounds', () => {
  for (const mode of ['1v1', '2v2', '3v3', '4v4'] as const) {
    const cfg = getMatchModeConfig(mode);
    const half = cfg.arenaSpan * 0.5;
    const heroes = computeTeamSpawnPositions(cfg.teamSize, half, 'hero');
    const villains = computeTeamSpawnPositions(cfg.teamSize, half, 'villain');
    assert.equal(heroes.length, cfg.teamSize);
    assert.equal(villains.length, cfg.teamSize);
    for (const h of heroes) {
      assert.ok(h.x < -3, `hero spawn x=${h.x} should be on meadow side`);
      assert.ok(Math.abs(h.z) < half - 2);
    }
    for (const v of villains) {
      assert.ok(v.x > 3, `villain spawn x=${v.x} should be on desert side`);
      assert.ok(Math.abs(v.z) < half - 2);
    }
  }
});

test('scaled TerrainSimulation starts balanced ~50/50 across 30x30 and 60x60 arenas', () => {
  const small = new TerrainSimulation(30, 144);
  const massive = new TerrainSimulation(60, 216);
  assert.equal(small.arenaHalfSize, 15);
  assert.equal(massive.arenaHalfSize, 30);
  assert.ok(Math.abs(small.getMeadowRatio() - 0.5) < 0.08);
  assert.ok(Math.abs(massive.getMeadowRatio() - 0.5) < 0.08);
});

test('getCountdownState and getLoadingStageLabel map countdown beats and loading stages', () => {
  assert.equal(getCountdownState(3.0).label, '3');
  assert.equal(getCountdownState(2.2).value, 3);
  assert.equal(getCountdownState(1.95).label, '2');
  assert.equal(getCountdownState(1.1).value, 2);
  assert.equal(getCountdownState(0.8).label, '1');
  assert.equal(getCountdownState(0.05).value, 1);
  assert.equal(getCountdownState(0).label, 'GO!');

  assert.equal(getLoadingStageLabel(0.1), 'Sculpting Dual-Biome Terrain...');
  assert.equal(getLoadingStageLabel(0.45), 'Growing Meadow & Desert Ecosystem...');
  assert.equal(getLoadingStageLabel(0.75), 'Deploying Sky Islands & Squads...');
  assert.equal(getLoadingStageLabel(0.95), 'Ready for Battle!');
});
