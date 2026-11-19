import { getMatchModeConfig, MatchModeId } from '../arena/matchConfig';
import { QuickPlayTicket } from '../arena/multiplayerNet';
import { TrooperRole } from '../arena/trooperBuilder';
import { arenaSound } from '../arena/soundFx';

interface QuickPlayOverlayProps {
  open: boolean;
  modeId: MatchModeId;
  preferredTeam: TrooperRole;
  localUid: string;
  ticket: QuickPlayTicket | null;
  errorMsg: string | null;
  onCancel: () => void;
}

export function QuickPlayOverlay({
  open,
  modeId,
  preferredTeam,
  localUid,
  ticket,
  errorMsg,
  onCancel,
}: QuickPlayOverlayProps) {
  if (!open) return null;

  const modeCfg = getMatchModeConfig(ticket?.modeId ?? modeId);
  const maxPlayers = ticket?.maxPlayers ?? modeCfg.teamSize * 2;
  const humanCount = ticket?.humanCount ?? 1;
  const aiBotCount = ticket?.aiBotFillCount ?? Math.max(0, maxPlayers - humanCount);
  const secondsLeft = ticket?.backfillSecondsRemaining ?? 15;
  const isLaunching = ticket?.status === 'launching';
  const myAssignedTeam =
    ticket?.players.find((p) => p.uid === localUid)?.team ?? preferredTeam;
  const progressPct = isLaunching
    ? 100
    : Math.max(0, Math.min(100, ((15 - secondsLeft) / 15) * 100));

  const heroHumans = ticket?.players.filter((p) => p.team === 'hero') ?? [];
  const villainHumans = ticket?.players.filter((p) => p.team === 'villain') ?? [];

  return (
    <div
      role="dialog"
      aria-label="Quick Play Matchmaking"
      data-testid="quickplay-overlay"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(5,8,15,0.86)] p-4 text-[#f6f1e9]"
    >
      <div className="w-full max-w-[540px] rounded-2xl border border-[#38efff]/45 bg-[linear-gradient(155deg,rgba(16,24,36,0.98),rgba(10,13,21,0.99))] p-6 shadow-[0_28px_84px_rgba(0,0,0,0.88),0_0_48px_rgba(48,240,255,0.16)]">
        {/* Top Status Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  isLaunching
                    ? 'bg-emerald-400 shadow-[0_0_12px_#34d399]'
                    : 'bg-[#38efff] animate-pulse shadow-[0_0_12px_#38efff]'
                }`}
              />
              <span className="text-[11px] font-bold tracking-[0.22em] uppercase text-[#5eeeff]">
                Quick Play · {modeCfg.label} ({modeCfg.gridLabel})
              </span>
            </div>
            <h2
              data-testid="quickplay-heading"
              className="mt-1.5 font-display text-2xl sm:text-3xl font-black italic tracking-wide uppercase text-white"
            >
              {isLaunching ? 'Match Found · Deploying!' : 'Finding Match...'}
            </h2>
          </div>

          <div className="text-right shrink-0">
            <div
              data-testid="quickplay-player-count"
              className="font-display text-xl font-black text-[#ffd147] tabular-nums"
            >
              {humanCount} / {maxPlayers}
            </div>
            <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-slate-400">
              Players Found
            </div>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-400/45 bg-red-950/60 px-4 py-2.5 text-xs text-red-100"
          >
            {errorMsg}
          </div>
        )}

        {/* Smart Bot Backfill Countdown Bar */}
        <div className="mt-5 rounded-xl border border-white/10 bg-black/35 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-200">
              {isLaunching
                ? aiBotCount > 0
                  ? `Deploying with ${humanCount} human & ${aiBotCount} AI bots`
                  : 'All human slots filled — starting instant match!'
                : `Smart AI Bot Backfill in ${secondsLeft}s`}
            </span>
            <span
              data-testid="quickplay-timer"
              className="font-display text-base font-black text-[#38efff] tabular-nums"
            >
              {isLaunching ? 'LIVE' : `${secondsLeft}s`}
            </span>
          </div>

          <div className="mt-2.5 h-2.5 w-full overflow-hidden rounded-full bg-white/10 border border-white/10">
            <div
              className={`h-full transition-all duration-300 ${
                isLaunching
                  ? 'bg-[linear-gradient(90deg,#34d399,#30f0ff)]'
                  : 'bg-[linear-gradient(90deg,#30f0ff,#ffd147)]'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Your Team:{' '}
              <strong
                className={
                  myAssignedTeam === 'hero' ? 'text-[#5eeeff]' : 'text-[#ff9c63]'
                }
              >
                {myAssignedTeam === 'hero' ? 'Heroes (Water)' : 'Villains (Fire)'}
              </strong>
            </span>
            {ticket && (
              <span className="font-mono text-[11px] text-slate-300">
                Room {ticket.roomCode}
              </span>
            )}
          </div>
        </div>

        {/* Live Squad Slots Preview */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {(['hero', 'villain'] as TrooperRole[]).map((teamKey) => {
            const isHero = teamKey === 'hero';
            const teamHumans = isHero ? heroHumans : villainHumans;
            const teamSize = ticket?.teamSize ?? modeCfg.teamSize;
            return (
              <div
                key={teamKey}
                className={`rounded-xl border p-3 ${
                  isHero
                    ? 'border-cyan-400/30 bg-[rgba(8,36,52,0.5)]'
                    : 'border-orange-400/30 bg-[rgba(52,20,10,0.5)]'
                }`}
              >
                <div
                  className={`text-[11px] font-bold uppercase tracking-wider ${
                    isHero ? 'text-[#5eeeff]' : 'text-[#ff9c63]'
                  }`}
                >
                  {isHero ? 'Heroes' : 'Villains'} ({teamHumans.length}/{teamSize})
                </div>
                <div className="mt-2 space-y-1.5">
                  {Array.from({ length: teamSize }).map((_, idx) => {
                    const p = teamHumans[idx];
                    return (
                      <div
                        key={idx}
                        className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${
                          p
                            ? 'bg-black/45 text-white border border-white/10'
                            : 'bg-white/[0.03] text-slate-400 border border-dashed border-white/10'
                        }`}
                      >
                        <span className="truncate font-semibold">
                          {p
                            ? p.displayName
                            : isLaunching
                              ? 'AI Trooper (Backfill)'
                              : 'Searching / AI Standby'}
                        </span>
                        {p?.uid === localUid && (
                          <span className="ml-1 shrink-0 text-[10px] font-bold uppercase text-[#ffd147]">
                            You
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cancel Action */}
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={isLaunching}
            data-testid="quickplay-cancel-btn"
            onClick={() => {
              arenaSound.playUiClick();
              onCancel();
            }}
            className="w-full sm:w-auto rounded-xl border border-red-400/40 bg-red-500/15 px-6 py-2.5 text-xs font-bold uppercase tracking-[0.14em] text-red-100 hover:bg-red-500/25 disabled:opacity-45"
          >
            Cancel Search
          </button>
        </div>
      </div>
    </div>
  );
}
