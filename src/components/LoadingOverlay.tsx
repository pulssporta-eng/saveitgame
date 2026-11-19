import { getMatchModeConfig, MatchModeId } from '../arena/matchConfig';
import { TrooperRole } from '../arena/trooperBuilder';

interface LoadingOverlayProps {
  team: TrooperRole;
  modeId: MatchModeId;
  progress: number;
  stageLabel: string;
  heading?: string;
  roundLabel?: string;
}

export function LoadingOverlay({
  team,
  modeId,
  progress,
  stageLabel,
  heading = 'Match Prep',
  roundLabel,
}: LoadingOverlayProps) {
  const modeCfg = getMatchModeConfig(modeId);
  const isHero = team === 'hero';
  const clampedPct = Math.max(0, Math.min(100, Math.round(progress * 100)));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading match"
      data-testid="loading-screen"
      className="fixed inset-0 z-30 overflow-hidden bg-[#0e0b10] text-[#f6f1e9] select-none"
    >
      {/* Full-bleed Lobby Backdrop Artwork */}
      <img
        src="/assets/aistudio/loby_f8724db9.jpg"
        alt="Hero Water Trooper and Villain Fire Trooper preparing for battle"
        referrerPolicy="no-referrer"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center select-none"
      />

      {/* Atmospheric Vignette & Edge Scrims masking baked-in UI zones while spotlighting both Troopers */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_36%_26%_at_13%_9%,rgba(9,16,20,0.99)_0%,rgba(9,16,20,0.95)_58%,rgba(9,16,20,0.52)_80%,transparent_98%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-[34%] min-w-[320px] bg-[linear-gradient(90deg,transparent_0%,rgba(10,8,12,0.78)_35%,rgba(8,7,11,0.97)_78%,rgba(7,6,10,0.99)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[132px] bg-[linear-gradient(180deg,rgba(10,10,14,0.98)_0%,rgba(10,10,14,0.82)_44%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px] bg-[linear-gradient(0deg,rgba(7,9,14,0.99)_0%,rgba(7,9,14,0.92)_54%,transparent_100%)]"
      />

      {/* Foreground Loading Layout */}
      <div className="relative z-10 flex flex-col justify-between w-full h-full px-5 sm:px-8 pt-4 pb-6 sm:pb-8">
        {/* Top Wordmark & Mode Pill */}
        <div className="flex items-start justify-between gap-4">
          <div className="font-display text-[48px] sm:text-[60px] font-black italic tracking-[-0.03em] leading-[0.95] flex items-baseline gap-2 drop-shadow-[0_6px_14px_rgba(0,0,0,0.9)] pl-1">
            <span className="bg-[linear-gradient(180deg,#ffffff_12%,#8df7ff_48%,#0284c7_94%)] bg-clip-text text-transparent drop-shadow-[0_4px_0_#072b42]">
              SAVE
            </span>
            <span className="bg-[linear-gradient(180deg,#fff7c2_12%,#fbbf24_48%,#ea580c_94%)] bg-clip-text text-transparent drop-shadow-[0_4px_0_#4a1705]">
              IT
            </span>
          </div>

          <div className="px-4 py-2 rounded-lg bg-[rgba(12,15,24,0.9)] border border-white/15 text-xs font-semibold tracking-[0.14em] uppercase text-[#e6ecf5] shadow-lg">
            {roundLabel ? `${roundLabel} · ` : ''}
            {modeCfg.label} · {modeCfg.gridLabel} Arena
          </div>
        </div>

        {/* Bottom Docked Battle Deployment Card */}
        <div className="w-full max-w-[700px] mx-auto rounded-2xl bg-[linear-gradient(155deg,rgba(13,17,27,0.95),rgba(7,9,15,0.94))] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_28px_72px_rgba(0,0,0,0.85)] p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Selected Trooper Identity */}
            <div className="flex items-center gap-3.5">
              <div
                className={`relative w-14 h-14 rounded-xl overflow-hidden border-2 shrink-0 ${
                  isHero
                    ? 'border-[#38bdf8] shadow-[0_0_18px_rgba(56,189,248,0.4)]'
                    : 'border-[#fb923c] shadow-[0_0_18px_rgba(251,146,60,0.4)]'
                }`}
              >
                <img
                  src={
                    isHero
                      ? '/assets/aistudio/vodeni_model_11c5c386.jpg'
                      : '/assets/aistudio/vatreni_model_264086e1.jpg'
                  }
                  alt={isHero ? 'Hero Trooper' : 'Villain Trooper'}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#9ca3b4]">
                  Deploying As
                </div>
                <div
                  className={`font-display text-xl sm:text-2xl font-bold tracking-wider uppercase leading-tight ${
                    isHero ? 'text-[#7ceeff]' : 'text-[#ffad72]'
                  }`}
                >
                  {isHero ? 'Hero Trooper' : 'Villain Trooper'}
                </div>
                <div className="text-xs text-[#c7ccd6]">
                  {isHero ? 'Restore Lush Meadow · Hydro Tank' : 'Spread Volcanic Desert · Magma Core'}
                </div>
              </div>
            </div>

            {/* Percentage Readout */}
            <div className="text-left sm:text-right">
              <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#9ca3b4]">
                {heading}
              </div>
              <div className="font-display text-3xl font-black tabular-nums text-[#faf6ee] leading-none mt-0.5">
                {clampedPct}%
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4">
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={clampedPct}
              data-testid="loading-progress-bar"
              className="w-full h-3 rounded-full overflow-hidden bg-[#090c12] border border-white/10"
            >
              <div
                className="h-full transition-all duration-200 ease-out"
                style={{
                  width: `${clampedPct}%`,
                  background: isHero
                    ? 'linear-gradient(90deg, #0ea5e9, #22d3ee, #34d399)'
                    : 'linear-gradient(90deg, #dc2626, #f97316, #facc15)',
                  boxShadow: isHero
                    ? '0 0 16px rgba(34,211,238,0.65)'
                    : '0 0 16px rgba(249,115,22,0.65)',
                }}
              />
            </div>

            <div className="mt-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
              <span
                data-testid="loading-stage-label"
                className="font-semibold tracking-wide text-[#e5e9f0]"
              >
                {stageLabel}
              </span>
              <span className="text-[#9ca3b4]">
                Tip: Empty tank unlocks SHIFT speed boost until you grab your recharge sign.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
