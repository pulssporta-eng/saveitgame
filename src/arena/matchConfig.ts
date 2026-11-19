import { TrooperRole } from './trooperBuilder';

export type MatchModeId = '1v1' | '2v2' | '3v3' | '4v4';
export type MatchPhase = 'menu' | 'loading' | 'countdown' | 'playing' | 'roundEnd' | 'ended';

export interface MatchModeConfig {
  id: MatchModeId;
  label: string;
  arenaLabel: string;
  teamSize: number;
  arenaSpan: number;
  gridLabel: string;
  terrainSegments: number;
}

export const TOTAL_ROUNDS = 4;
export const MAX_ROUNDS_WITH_TIEBREAKER = 5;
export const ROUND_DURATION_SECONDS = 60;
export const MATCH_DURATION_SECONDS = ROUND_DURATION_SECONDS;
export const ROUND_TRANSITION_SECONDS = 3.2;
export const FINAL_COUNTDOWN_THRESHOLD = 15;
export const COUNTDOWN_SECONDS = 3;
export const GO_BANNER_DURATION_SECONDS = 0.75;

export interface CountdownDisplayState {
  value: 3 | 2 | 1 | 0;
  label: '3' | '2' | '1' | 'GO!';
  beatProgress: number; // 0 -> 1 within current beat
}

export function getCountdownState(remainingSeconds: number): CountdownDisplayState {
  if (remainingSeconds > 2) {
    return {
      value: 3,
      label: '3',
      beatProgress: Math.max(0, Math.min(1, 3 - remainingSeconds)),
    };
  }
  if (remainingSeconds > 1) {
    return {
      value: 2,
      label: '2',
      beatProgress: Math.max(0, Math.min(1, 2 - remainingSeconds)),
    };
  }
  if (remainingSeconds > 0) {
    return {
      value: 1,
      label: '1',
      beatProgress: Math.max(0, Math.min(1, 1 - remainingSeconds)),
    };
  }
  return {
    value: 0,
    label: 'GO!',
    beatProgress: 1,
  };
}

export const LOADING_STAGES: ReadonlyArray<{ minProgress: number; label: string }> = [
  { minProgress: 0, label: 'Sculpting Dual-Biome Terrain...' },
  { minProgress: 0.35, label: 'Growing Meadow & Desert Ecosystem...' },
  { minProgress: 0.65, label: 'Deploying Sky Islands & Squads...' },
  { minProgress: 0.88, label: 'Ready for Battle!' },
];

export function getLoadingStageLabel(progress: number): string {
  let label = LOADING_STAGES[0].label;
  for (let i = 0; i < LOADING_STAGES.length; i++) {
    if (progress >= LOADING_STAGES[i].minProgress) {
      label = LOADING_STAGES[i].label;
    }
  }
  return label;
}

export const MATCH_MODES: readonly MatchModeConfig[] = [
  {
    id: '1v1',
    label: '1v1',
    arenaLabel: 'Small Arena',
    teamSize: 1,
    arenaSpan: 30,
    gridLabel: '30×30',
    terrainSegments: 144,
  },
  {
    id: '2v2',
    label: '2v2',
    arenaLabel: 'Medium Arena',
    teamSize: 2,
    arenaSpan: 40,
    gridLabel: '40×40',
    terrainSegments: 168,
  },
  {
    id: '3v3',
    label: '3v3',
    arenaLabel: 'Large Arena',
    teamSize: 3,
    arenaSpan: 50,
    gridLabel: '50×50',
    terrainSegments: 192,
  },
  {
    id: '4v4',
    label: '4v4',
    arenaLabel: 'Massive Arena',
    teamSize: 4,
    arenaSpan: 60,
    gridLabel: '60×60',
    terrainSegments: 216,
  },
];

export function getMatchModeConfig(id: MatchModeId): MatchModeConfig {
  return MATCH_MODES.find((m) => m.id === id) ?? MATCH_MODES[1];
}

export function formatMatchTimer(secondsRemaining: number): {
  formatted: string;
  wholeSeconds: number;
  isFinalStretch: boolean;
} {
  const wholeSeconds = Math.max(0, Math.ceil(secondsRemaining));
  const mins = Math.floor(wholeSeconds / 60);
  const secs = wholeSeconds % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return {
    formatted,
    wholeSeconds,
    isFinalStretch: wholeSeconds > 0 && wholeSeconds <= FINAL_COUNTDOWN_THRESHOLD,
  };
}

export function computeTeamTerritoryPercents(meadowRatio: number): {
  heroPercent: number;
  villainPercent: number;
} {
  const clamped = Math.max(0, Math.min(1, meadowRatio));
  const heroPercent = Math.round(clamped * 1000) / 10;
  const villainPercent = Math.round((100 - heroPercent) * 10) / 10;
  return { heroPercent, villainPercent };
}

export interface RoundOutcome {
  roundNumber: number;
  winner: TrooperRole | 'draw';
  heroPercent: number;
  villainPercent: number;
}

export interface SeriesProgressionResult {
  heroRoundsWon: number;
  villainRoundsWon: number;
  roundHistory: RoundOutcome[];
  lastRound: RoundOutcome;
  seriesOver: boolean;
  clinchedEarly: boolean;
  tiebreakerTriggered: boolean;
  seriesWinner: TrooperRole | 'draw' | null;
  nextRoundNumber: number | null;
}

export interface MatchOutcome {
  winner: TrooperRole | 'draw';
  playerWon: boolean;
  heroPercent: number;
  villainPercent: number;
  heroRoundsWon: number;
  villainRoundsWon: number;
  clinchedEarly: boolean;
  tiebreakerPlayed: boolean;
  roundHistory: RoundOutcome[];
}

export function resolveRoundWinner(
  heroPercent: number,
  villainPercent: number,
): TrooperRole | 'draw' {
  if (heroPercent > villainPercent) return 'hero';
  if (villainPercent > heroPercent) return 'villain';
  return 'draw';
}

export function advanceRoundSeries(
  prevHistory: ReadonlyArray<RoundOutcome>,
  meadowRatio: number,
): SeriesProgressionResult {
  const roundNumber = prevHistory.length + 1;
  const { heroPercent, villainPercent } = computeTeamTerritoryPercents(meadowRatio);
  const winner = resolveRoundWinner(heroPercent, villainPercent);
  const lastRound: RoundOutcome = {
    roundNumber,
    winner,
    heroPercent,
    villainPercent,
  };
  const roundHistory = [...prevHistory, lastRound];

  let heroRoundsWon = 0;
  let villainRoundsWon = 0;
  for (let i = 0; i < roundHistory.length; i++) {
    if (roundHistory[i].winner === 'hero') heroRoundsWon++;
    else if (roundHistory[i].winner === 'villain') villainRoundsWon++;
  }

  const remainingRegRounds = Math.max(0, TOTAL_ROUNDS - roundHistory.length);
  // Early clinch when trailing team cannot catch or tie even by winning all remaining regulation rounds (e.g. 3:0 after Round 3)
  const clinchedEarly =
    remainingRegRounds > 0 && Math.abs(heroRoundsWon - villainRoundsWon) > remainingRegRounds;

  // If all 4 regulation rounds finish in a tie, proceed to Final Tiebreaker Round 5
  const isTiedAfterFour = roundHistory.length === TOTAL_ROUNDS && heroRoundsWon === villainRoundsWon;
  const tiebreakerTriggered =
    isTiedAfterFour || roundHistory.length >= MAX_ROUNDS_WITH_TIEBREAKER;
  const seriesOver =
    clinchedEarly ||
    roundHistory.length >= MAX_ROUNDS_WITH_TIEBREAKER ||
    (roundHistory.length >= TOTAL_ROUNDS && heroRoundsWon !== villainRoundsWon);

  let seriesWinner: TrooperRole | 'draw' | null = null;
  if (seriesOver) {
    if (heroRoundsWon > villainRoundsWon) {
      seriesWinner = 'hero';
    } else if (villainRoundsWon > heroRoundsWon) {
      seriesWinner = 'villain';
    } else {
      seriesWinner = 'draw';
    }
  }

  return {
    heroRoundsWon,
    villainRoundsWon,
    roundHistory,
    lastRound,
    seriesOver,
    clinchedEarly,
    tiebreakerTriggered,
    seriesWinner,
    nextRoundNumber: seriesOver ? null : roundNumber + 1,
  };
}

export function resolveMatchOutcome(
  playerTeam: TrooperRole,
  meadowRatio: number,
  series?: Pick<
    SeriesProgressionResult,
    | 'heroRoundsWon'
    | 'villainRoundsWon'
    | 'clinchedEarly'
    | 'tiebreakerTriggered'
    | 'roundHistory'
    | 'seriesWinner'
  >,
): MatchOutcome {
  const fallbackPercents = computeTeamTerritoryPercents(meadowRatio);
  if (series && series.seriesWinner !== null) {
    const finalRound = series.roundHistory[series.roundHistory.length - 1];
    return {
      winner: series.seriesWinner,
      playerWon: series.seriesWinner === playerTeam,
      heroPercent: finalRound ? finalRound.heroPercent : fallbackPercents.heroPercent,
      villainPercent: finalRound ? finalRound.villainPercent : fallbackPercents.villainPercent,
      heroRoundsWon: series.heroRoundsWon,
      villainRoundsWon: series.villainRoundsWon,
      clinchedEarly: series.clinchedEarly,
      tiebreakerPlayed: series.roundHistory.length >= MAX_ROUNDS_WITH_TIEBREAKER,
      roundHistory: series.roundHistory,
    };
  }
  const { heroPercent, villainPercent } = fallbackPercents;

  const winner = resolveRoundWinner(heroPercent, villainPercent);
  return {
    winner,
    playerWon: winner === playerTeam,
    heroPercent,
    villainPercent,
    heroRoundsWon: winner === 'hero' ? 1 : 0,
    villainRoundsWon: winner === 'villain' ? 1 : 0,
    clinchedEarly: false,
    tiebreakerPlayed: false,
    roundHistory: [{ roundNumber: 1, winner, heroPercent, villainPercent }],
  };
}

export function computeTeamSpawnPositions(
  teamSize: number,
  arenaHalfSize: number,
  role: TrooperRole,
): Array<{ x: number; z: number; yaw: number }> {
  const count = Math.max(1, Math.min(4, Math.floor(teamSize)));
  const homeX = (role === 'hero' ? -1 : 1) * Math.min(arenaHalfSize - 4.2, arenaHalfSize * 0.56);
  const yaw = role === 'hero' ? Math.PI * 0.5 : -Math.PI * 0.5;
  const zSpan = Math.min(arenaHalfSize * 1.15, Math.max(6, (count - 1) * 6.2));
  const positions: Array<{ x: number; z: number; yaw: number }> = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const z = (t - 0.5) * zSpan;
    // Slight staggered formation in X for multi-trooper squads
    const stagger = count > 1 ? ((i % 2 === 0 ? -1 : 1) * 1.15) : 0;
    positions.push({
      x: homeX + stagger,
      z,
      yaw,
    });
  }

  return positions;
}
