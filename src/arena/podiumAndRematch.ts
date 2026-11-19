import { MatchOutcome } from './matchConfig';
import { TrooperRole } from './trooperBuilder';

export interface OnlinePlayerSummary {
  uid: string;
  displayName: string;
  team: TrooperRole;
  isHost: boolean;
}

export interface RematchVoteChip extends OnlinePlayerSummary {
  voted: boolean;
  isLocal: boolean;
}

export interface RematchStatusSummary {
  totalHumans: number;
  voteCount: number;
  hasLocalVoted: boolean;
  allAgreed: boolean;
  label: string;
  playerChips: RematchVoteChip[];
}

export interface PodiumTransform {
  x: number;
  z: number;
  yaw: number;
  onPodium: boolean;
}

/**
 * Computes deterministic non-overlapping world staging coordinates for winning troopers
 * standing atop the central 3D Victory Podium and losing troopers off to the side flanks.
 */
export function computePodiumStagingSlots(params: {
  winnerCount: number;
  loserCount: number;
}): {
  winners: PodiumTransform[];
  losers: PodiumTransform[];
} {
  const winners: PodiumTransform[] = [];
  const losers: PodiumTransform[] = [];

  const wc = Math.max(0, Math.floor(params.winnerCount));
  const spacingW = wc <= 1 ? 0 : Math.min(1.38, 3.8 / (wc - 1));
  for (let i = 0; i < wc; i++) {
    const offset = wc === 1 ? 0 : (i - (wc - 1) * 0.5) * spacingW;
    // Slight chevron curve on the podium deck so all squad members stay clearly framed
    const depth = wc > 1 ? -Math.abs(offset) * 0.22 + 0.16 : 0.18;
    winners.push({
      x: offset,
      z: depth,
      yaw: -offset * 0.08,
      onPodium: true,
    });
  }

  const lc = Math.max(0, Math.floor(params.loserCount));
  for (let i = 0; i < lc; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const rank = Math.floor(i / 2);
    const x = side * (3.55 + rank * 0.95);
    const z = -1.55 - rank * 0.72;
    losers.push({
      x,
      z,
      yaw: side > 0 ? -0.32 : 0.32,
      onPodium: false,
    });
  }

  return { winners, losers };
}

/**
 * Computes live multiplayer Rematch Readiness summary and per-player checkmark flags.
 */
export function summarizeRematchStatus(
  onlinePlayers: ReadonlyArray<OnlinePlayerSummary>,
  rematchVotes: ReadonlyArray<string>,
  localUid: string | null,
): RematchStatusSummary {
  const voteSet = new Set(rematchVotes);
  const playerChips: RematchVoteChip[] = onlinePlayers.map((p) => ({
    ...p,
    voted: voteSet.has(p.uid),
    isLocal: localUid !== null && p.uid === localUid,
  }));

  const voteCount = playerChips.filter((c) => c.voted).length;
  const totalHumans = playerChips.length;
  const hasLocalVoted = localUid !== null && voteSet.has(localUid);
  const allAgreed = totalHumans > 0 && voteCount >= totalHumans;

  return {
    totalHumans,
    voteCount,
    hasLocalVoted,
    allAgreed,
    label: `Rematch Ready: ${voteCount} / ${Math.max(1, totalHumans)}`,
    playerChips,
  };
}

export interface CareerDisplayStats {
  trooperHandle: string;
  territoryPaintedPct: number;
  matchesPlayed: number;
  wins: number;
  bestScore: number;
  isCloudSynced: boolean;
}

export function resolveCareerDisplayStats(params: {
  playerTeam: TrooperRole;
  matchOutcome: MatchOutcome;
  cloudProfile: {
    displayName: string;
    matchesPlayed: number;
    wins: number;
    bestScore?: number;
  } | null;
  fallbackHandle: string;
  sessionStats: {
    matchesPlayed: number;
    wins: number;
    bestScore: number;
  };
  isCloudSynced: boolean;
}): CareerDisplayStats {
  const territoryPaintedPct =
    params.playerTeam === 'hero'
      ? params.matchOutcome.heroPercent
      : params.matchOutcome.villainPercent;

  if (params.isCloudSynced && params.cloudProfile) {
    return {
      trooperHandle: params.cloudProfile.displayName || params.fallbackHandle,
      territoryPaintedPct,
      matchesPlayed: params.cloudProfile.matchesPlayed,
      wins: params.cloudProfile.wins,
      bestScore: Math.max(params.cloudProfile.bestScore ?? 0, territoryPaintedPct),
      isCloudSynced: true,
    };
  }

  return {
    trooperHandle: params.fallbackHandle,
    territoryPaintedPct,
    matchesPlayed: params.sessionStats.matchesPlayed,
    wins: params.sessionStats.wins,
    bestScore: Math.max(params.sessionStats.bestScore, territoryPaintedPct),
    isCloudSynced: false,
  };
}

export const REMATCH_COUNTDOWN_SECONDS = 60;

export function formatRematchButtonText(params: {
  secondsLeft: number;
  isOnline: boolean;
  hasVotedRematch: boolean;
  voteCount: number;
  totalHumans: number;
}): string {
  const secs = Math.max(0, Math.floor(params.secondsLeft));
  if (params.isOnline && params.hasVotedRematch) {
    return `Voted ✓ (${params.voteCount}/${Math.max(1, params.totalHumans)}) · ${secs}S`;
  }
  return `Rematch · ${secs}S`;
}

