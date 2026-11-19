import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MatchModeConfig,
  MatchOutcome,
  MAX_ROUNDS_WITH_TIEBREAKER,
  TOTAL_ROUNDS,
} from '../arena/matchConfig';
import {
  CareerDisplayStats,
  formatRematchButtonText,
  OnlinePlayerSummary,
  REMATCH_COUNTDOWN_SECONDS,
  summarizeRematchStatus,
} from '../arena/podiumAndRematch';
import { TrooperRole } from '../arena/trooperBuilder';

interface PostMatchOverlayProps {
  matchOutcome: MatchOutcome;
  playerTeam: TrooperRole;
  modeCfg: MatchModeConfig;
  careerStats: CareerDisplayStats;
  isOnline: boolean;
  onlineRoomCode: string | null;
  localPlayerUid: string | null;
  onlinePlayers: OnlinePlayerSummary[];
  rematchVotes: string[];
  onRematch: (btn: HTMLButtonElement) => void;
  onQuitToMenu: (btn?: HTMLButtonElement) => void;
}

function ControllerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7.5 6.5h9a5 5 0 0 1 4.91 5.93l-.84 4.35a2.6 2.6 0 0 1-4.38 1.38L14.3 16.3H9.7l-1.89 1.86a2.6 2.6 0 0 1-4.38-1.38l-.84-4.35A5 5 0 0 1 7.5 6.5Zm.8 3.2v1.6H6.7v1.5h1.6v1.6h1.5v-1.6h1.6v-1.5H9.8V9.7H8.3Zm7.2.5a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Zm2.2 2.2a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Z"
      />
    </svg>
  );
}

function GearExitIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.62-.94l-.36-2.54a.49.49 0 0 0-.49-.42h-3.84a.49.49 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.04.71 1.62.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.62-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
      />
    </svg>
  );
}

export function PostMatchOverlay({
  matchOutcome,
  playerTeam,
  modeCfg,
  careerStats,
  isOnline,
  onlineRoomCode,
  localPlayerUid,
  onlinePlayers,
  rematchVotes,
  onRematch,
  onQuitToMenu,
}: PostMatchOverlayProps) {
  const [rematchSecondsLeft, setRematchSecondsLeft] = useState(REMATCH_COUNTDOWN_SECONDS);
  const timerIdRef = useRef<number | null>(null);
  const timerStoppedRef = useRef(false);
  const onAutoQuitRef = useRef(onQuitToMenu);
  onAutoQuitRef.current = onQuitToMenu;

  const stopRematchTimer = useCallback(() => {
    timerStoppedRef.current = true;
    if (timerIdRef.current !== null) {
      window.clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    timerStoppedRef.current = false;
    const startedAtMs = Date.now();
    const deadlineMs = startedAtMs + REMATCH_COUNTDOWN_SECONDS * 1000;
    setRematchSecondsLeft(REMATCH_COUNTDOWN_SECONDS);

    timerIdRef.current = window.setInterval(() => {
      if (timerStoppedRef.current) return;
      const msLeft = deadlineMs - Date.now();
      const nextSeconds = Math.max(0, Math.ceil(msLeft / 1000));
      setRematchSecondsLeft(nextSeconds);
      if (msLeft <= 0) {
        stopRematchTimer();
        onAutoQuitRef.current();
      }
    }, 500);

    return () => {
      stopRematchTimer();
    };
  }, [stopRematchTimer]);

  const handleRematchClick = (btn: HTMLButtonElement) => {
    stopRematchTimer();
    onRematch(btn);
  };

  const handleQuitClick = (btn: HTMLButtonElement) => {
    stopRematchTimer();
    onQuitToMenu(btn);
  };

  const isDraw = matchOutcome.winner === 'draw';
  const winnerLabel =
    matchOutcome.winner === 'hero'
      ? 'WATER HEROES'
      : matchOutcome.winner === 'villain'
        ? 'FIRE VILLAINS'
        : 'ELEMENTAL TIE';

  const rematchSummary = isOnline
    ? summarizeRematchStatus(onlinePlayers, rematchVotes, localPlayerUid)
    : null;
  const hasVotedRematch = rematchSummary?.hasLocalVoted ?? false;

  const totalRoundBadges = matchOutcome.tiebreakerPlayed
    ? MAX_ROUNDS_WITH_TIEBREAKER
    : TOTAL_ROUNDS;

  const rematchButtonLabel = formatRematchButtonText({
    secondsLeft: rematchSecondsLeft,
    isOnline,
    hasVotedRematch,
    voteCount: rematchSummary?.voteCount ?? 0,
    totalHumans: rematchSummary?.totalHumans ?? 1,
  });

  const trooperAvatarSrc =
    playerTeam === 'hero'
      ? '/assets/aistudio/vodeni_model_11c5c386.jpg'
      : '/assets/aistudio/vatreni_model_264086e1.jpg';

  return (
    <div
      role="dialog"
      aria-label="Post-Match Summary"
      data-testid="post-match-overlay"
      className="fixed inset-0 z-20 overflow-y-auto overflow-x-hidden bg-[#0e0b10] text-[#f6f1e9] select-none"
    >
      {/* Full-bleed Illustrated Lobby Background (Hero Water Trooper Left + Villain Fire Trooper Right) */}
      <img
        src="/assets/aistudio/loby_f8724db9.jpg"
        alt="Water Hero Trooper and Fire Villain Trooper standing ready"
        referrerPolicy="no-referrer"
        className="pointer-events-none fixed inset-0 w-full h-full object-cover object-center select-none"
      />

      {/* Atmospheric Edge Scrims masking baked-in artwork UI zones while keeping both Troopers bright */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_36%_25%_at_13%_9%,rgba(9,16,22,0.99)_0%,rgba(9,16,22,0.95)_58%,rgba(9,16,22,0.52)_78%,transparent_96%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[120px] bg-[linear-gradient(180deg,rgba(10,10,14,0.99)_0%,rgba(10,10,14,0.94)_42%,rgba(10,10,14,0.55)_74%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-y-0 right-0 w-full lg:w-[590px] bg-[linear-gradient(90deg,transparent_0%,rgba(12,11,16,0.78)_14%,rgba(10,11,17,0.985)_26%,rgba(8,10,15,0.998)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 h-[84px] bg-[linear-gradient(0deg,rgba(8,10,15,0.99)_0%,rgba(8,10,15,0.88)_54%,transparent_100%)]"
      />

      {/* Foreground Glassmorphic Overlay Grid */}
      <div className="relative z-10 min-h-full w-full flex flex-col lg:flex-row lg:items-stretch justify-between gap-4 px-4 sm:px-8 py-4 sm:py-6">
        {/* TOP-LEFT BRAND LOGO */}
        <div className="shrink-0 flex items-start justify-between">
          <h1
            aria-label="Save It"
            className="font-display text-[44px] sm:text-[60px] font-black italic tracking-[-0.03em] leading-[0.95] flex items-baseline gap-2 drop-shadow-[0_6px_14px_rgba(0,0,0,0.9)] pl-1"
          >
            <span className="bg-[linear-gradient(180deg,#ffffff_12%,#8df7ff_48%,#0284c7_94%)] bg-clip-text text-transparent drop-shadow-[0_4px_0_#072b42]">
              SAVE
            </span>
            <span className="bg-[linear-gradient(180deg,#fff7c2_12%,#fbbf24_48%,#ea580c_94%)] bg-clip-text text-transparent drop-shadow-[0_4px_0_#4a1705]">
              IT
            </span>
          </h1>

          <span className="lg:hidden text-[11px] font-bold tracking-[0.14em] uppercase text-[#a8b3c4] pt-2">
            {modeCfg.label}
            {isOnline && onlineRoomCode ? ` · ${onlineRoomCode}` : ' · Solo'}
          </span>
        </div>

        {/* RIGHT COLUMN: TOP-RIGHT MATCH SUMMARY + BOTTOM-RIGHT PLAYER & REMATCH GLASS CARDS */}
        <div className="w-full lg:w-[552px] flex flex-col justify-between gap-4 lg:ml-auto">
          {/* 1. TOP-RIGHT MATCH SUMMARY GLASSMORPHISM CARD */}
          <header
            aria-label="Match Summary"
            className={`rounded-2xl bg-[rgba(11,16,25,0.68)] backdrop-blur-[14px] border p-4 sm:p-5 text-[#f4efe6] shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_20px_54px_rgba(0,0,0,0.72)] ${
              isDraw
                ? 'border-[#facc15]/60 shadow-[0_0_28px_rgba(250,204,21,0.20),inset_0_1px_0_rgba(255,255,255,0.22),0_20px_54px_rgba(0,0,0,0.72)]'
                : matchOutcome.playerWon
                  ? 'border-[#38efff]/65 shadow-[0_0_32px_rgba(56,239,255,0.22),inset_0_1px_0_rgba(255,255,255,0.22),0_20px_54px_rgba(0,0,0,0.72)]'
                  : 'border-[#38efff]/45 shadow-[0_0_26px_rgba(245,158,11,0.16),inset_0_1px_0_rgba(255,255,255,0.22),0_20px_54px_rgba(0,0,0,0.72)]'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-stretch gap-4">
              {/* Left Block: Team Banner + VICTORY/DEFEAT + Score */}
              <div className="sm:pr-5 sm:border-r sm:border-white/15 flex flex-col justify-between shrink-0">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#d8e1ed]">
                    {winnerLabel}
                  </p>
                  <h2
                    data-testid="match-outcome-heading"
                    className={`mt-0.5 font-display text-4xl sm:text-[44px] font-black italic tracking-tight uppercase leading-[0.95] drop-shadow-[0_4px_14px_rgba(0,0,0,0.75)] ${
                      isDraw
                        ? 'bg-[linear-gradient(180deg,#fef9c3_15%,#facc15_58%,#d97706_96%)] bg-clip-text text-transparent'
                        : 'bg-[linear-gradient(180deg,#ffffff_12%,#6ef3ff_55%,#0ea5e9_96%)] bg-clip-text text-transparent'
                    }`}
                  >
                    {isDraw ? 'DRAW' : matchOutcome.playerWon ? 'VICTORY!' : 'DEFEAT'}
                  </h2>
                </div>

                <div
                  data-testid="final-series-score"
                  className="mt-2.5 flex items-baseline gap-2 font-display text-base sm:text-lg font-extrabold tracking-wider uppercase tabular-nums"
                >
                  <span className="text-[#e2e8f0]">SCORE:</span>
                  <span className="text-[#4fe8ff]">{matchOutcome.heroRoundsWon}</span>
                  <span className="text-white/45">-</span>
                  <span className="text-[#ff9c59]">{matchOutcome.villainRoundsWon}</span>
                </div>
              </div>

              {/* Right Block: Circular Glowing Round Badges + Final Territory Split Progress Bar */}
              <div className="flex-1 flex flex-col justify-between gap-3 min-w-0">
                <div className="flex items-center justify-between sm:justify-start gap-2.5">
                  {Array.from({ length: totalRoundBadges }).map((_, idx) => {
                    const r = matchOutcome.roundHistory[idx];
                    if (!r) {
                      return (
                        <div
                          key={idx}
                          className="w-11 h-11 rounded-full border-2 border-white/15 bg-white/[0.04] flex items-center justify-center font-display text-xs font-bold text-white/40 shrink-0"
                        >
                          R{idx + 1}
                        </div>
                      );
                    }
                    const roundCode =
                      r.winner === 'hero' ? 'H' : r.winner === 'villain' ? 'V' : 'D';
                    return (
                      <div
                        key={idx}
                        className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-display text-[11px] font-extrabold tracking-tight tabular-nums shrink-0 ${
                          r.winner === 'hero'
                            ? 'bg-[#082f44]/85 border-[#38efff] text-[#cffaff] shadow-[0_0_16px_rgba(56,239,255,0.45)]'
                            : r.winner === 'villain'
                              ? 'bg-[#3d1609]/85 border-[#fb923c] text-[#ffe1c7] shadow-[0_0_16px_rgba(251,146,60,0.45)]'
                              : 'bg-[#3b2908]/85 border-[#facc15] text-[#fef08a] shadow-[0_0_16px_rgba(250,204,21,0.38)]'
                        }`}
                      >
                        R{r.roundNumber}-{roundCode}
                      </div>
                    );
                  })}
                </div>

                {/* Final Territory Split Bar */}
                <div>
                  <div className="w-full h-2.5 rounded-full bg-[#161a24] border border-white/15 flex items-center overflow-visible">
                    <div
                      className="h-full rounded-l-full bg-[linear-gradient(90deg,#0ea5e9,#38efff)] shadow-[0_0_12px_rgba(56,239,255,0.5)]"
                      style={{ width: `${matchOutcome.heroPercent}%` }}
                    />
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-3.5 -mx-[3px] rounded-full bg-white shadow-[0_0_10px_#ffffff] shrink-0 z-10"
                    />
                    <div
                      className="h-full rounded-r-full bg-[linear-gradient(90deg,#f97316,#ea580c)] shadow-[0_0_12px_rgba(249,115,22,0.45)]"
                      style={{ width: `${matchOutcome.villainPercent}%` }}
                    />
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold tabular-nums">
                    <span
                      data-testid="postmatch-hero-pct"
                      className="text-[#7ceeff] whitespace-nowrap"
                    >
                      {matchOutcome.heroPercent.toFixed(1)}% Meadow
                    </span>
                    <span className="text-[10px] tracking-[0.08em] text-[#a8b3c4] whitespace-nowrap">
                      Final Territory Split
                    </span>
                    <span
                      data-testid="postmatch-villain-pct"
                      className="text-[#ffab78] whitespace-nowrap"
                    >
                      {matchOutcome.villainPercent.toFixed(1)}% Desert
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* 2. BOTTOM-RIGHT PLAYER & REMATCH GLASSMORPHISM CARD */}
          <footer
            aria-label="Player Stats and Rematch Actions"
            className="rounded-2xl bg-[rgba(11,16,25,0.74)] backdrop-blur-[14px] border border-[#38efff]/45 p-4 text-[#f4efe6] shadow-[0_0_28px_rgba(56,239,255,0.14),inset_0_1px_0_rgba(255,255,255,0.2),0_22px_54px_rgba(0,0,0,0.78)]"
          >
            {/* Row 1: Trooper Avatar, Handle, FIRESTORE SAVED, Career Stat Columns */}
            <div
              data-testid="player-summary-pill"
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/12"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-11 h-11 rounded-xl overflow-hidden border-2 shrink-0 ${
                    playerTeam === 'hero'
                      ? 'border-[#38efff]/75 shadow-[0_0_14px_rgba(56,239,255,0.35)]'
                      : 'border-[#fb923c]/75 shadow-[0_0_14px_rgba(251,146,60,0.35)]'
                  }`}
                >
                  <img
                    src={trooperAvatarSrc}
                    alt={playerTeam === 'hero' ? 'Water Hero Avatar' : 'Fire Villain Avatar'}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-top"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#94a3b8]">
                    Trooper Handle
                  </div>
                  <p
                    data-testid="postmatch-trooper-handle"
                    className="font-display text-sm sm:text-base font-bold text-white truncate max-w-[155px]"
                  >
                    {careerStats.trooperHandle}
                  </p>
                  <div
                    className={`text-[9px] font-bold tracking-[0.14em] uppercase ${
                      careerStats.isCloudSynced ? 'text-emerald-300' : 'text-[#94a3b8]'
                    }`}
                  >
                    {careerStats.isCloudSynced ? 'FIRESTORE SAVED' : 'SESSION STATS'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2.5 sm:gap-3.5 text-center sm:text-left shrink-0 tabular-nums">
                <div>
                  <span className="block text-[9px] font-bold tracking-[0.1em] uppercase text-[#94a3b8]">
                    Painted
                  </span>
                  <span
                    data-testid="postmatch-painted-pct"
                    className={`font-display text-sm font-bold ${
                      playerTeam === 'hero' ? 'text-[#5cf2ff]' : 'text-[#ffab78]'
                    }`}
                  >
                    {careerStats.territoryPaintedPct.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-bold tracking-[0.1em] uppercase text-[#94a3b8]">
                    Matches
                  </span>
                  <span
                    data-testid="postmatch-career-matches"
                    className="font-display text-sm font-bold text-white"
                  >
                    {careerStats.matchesPlayed}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-bold tracking-[0.1em] uppercase text-[#94a3b8]">
                    Wins
                  </span>
                  <span
                    data-testid="postmatch-career-wins"
                    className="font-display text-sm font-bold text-emerald-300"
                  >
                    {careerStats.wins}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] font-bold tracking-[0.1em] uppercase text-[#94a3b8]">
                    Best Score
                  </span>
                  <span
                    data-testid="postmatch-career-best"
                    className="font-display text-sm font-bold text-[#fde047]"
                  >
                    {careerStats.bestScore.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Row 2: Rematch Ready Counter & Player Statuses */}
            <div
              data-testid="rematch-vote-panel"
              className="py-2.5 border-b border-white/12 flex flex-wrap items-center justify-between gap-2"
            >
              <span
                data-testid="rematch-ready-counter"
                className="text-xs font-bold tracking-[0.12em] uppercase text-[#e2e8f0] tabular-nums"
              >
                {isOnline && rematchSummary ? rematchSummary.label : 'REMATCH READY: 0 / 1'}
              </span>

              {isOnline && rematchSummary ? (
                <div className="flex flex-wrap items-center gap-2">
                  {rematchSummary.playerChips.map((chip) => (
                    <span
                      key={chip.uid}
                      data-testid={`rematch-chip-${chip.uid}`}
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        chip.voted
                          ? 'text-emerald-300'
                          : chip.team === 'hero'
                            ? 'text-[#7ceeff]'
                            : 'text-[#ffab78]'
                      }`}
                    >
                      {chip.voted && (
                        <svg
                          viewBox="0 0 16 16"
                          className="w-3.5 h-3.5 text-emerald-400 shrink-0"
                          aria-hidden="true"
                        >
                          <path
                            d="M3 8.5L6.3 11.8L13 4.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                      <span>{chip.displayName}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-xs font-semibold text-[#7ceeff] truncate max-w-[180px]">
                  {careerStats.trooperHandle}
                </span>
              )}
            </div>

            {/* Row 3: Action Buttons (Yellow-to-Cyan REMATCH + Dark Glass QUIT TO MENU) */}
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] gap-2.5">
              <button
                type="button"
                data-testid="postmatch-rematch-btn"
                disabled={isOnline && hasVotedRematch}
                onClick={(e) => handleRematchClick(e.currentTarget)}
                className={`min-h-[46px] py-2.5 px-5 rounded-xl font-display text-sm sm:text-[15px] font-black italic tracking-[0.08em] uppercase inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-white ${
                  isOnline && hasVotedRematch
                    ? 'bg-[linear-gradient(90deg,#15803d,#22c55e)] text-[#f0fdf4] border border-emerald-300/60 shadow-[0_0_22px_rgba(34,197,94,0.38)] cursor-default'
                    : 'bg-[linear-gradient(90deg,#d8ff2a_0%,#5ef2b6_52%,#2ceeff_100%)] text-[#07151c] shadow-[0_0_26px_rgba(78,242,184,0.45)] hover:brightness-110 active:scale-[0.99]'
                }`}
              >
                <ControllerIcon />
                <span>{rematchButtonLabel}</span>
              </button>

              <button
                type="button"
                data-testid="postmatch-quit-btn"
                onClick={(e) => handleQuitClick(e.currentTarget)}
                className="min-h-[46px] py-2.5 px-4 rounded-xl bg-[rgba(22,28,40,0.82)] hover:bg-[rgba(127,29,29,0.76)] border border-white/25 font-display text-xs sm:text-sm font-bold tracking-[0.1em] uppercase text-[#f1f5f9] inline-flex items-center justify-center gap-2 transition-all whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-red-400"
              >
                <GearExitIcon />
                <span>Quit to Menu</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
