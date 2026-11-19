import { User } from 'firebase/auth';
import { UserPublicProfile } from '../arena/firebaseService';
import { formatKeyCode, GameSettings } from '../arena/gameSettings';
import { getMatchModeConfig, MATCH_MODES, MatchModeId } from '../arena/matchConfig';
import { TrooperRole } from '../arena/trooperBuilder';

interface LobbyOverlayProps {
  selectedTeam: TrooperRole;
  selectedMode: MatchModeId;
  isMuted: boolean;
  settings: GameSettings;
  authUser: User | null;
  userProfile: UserPublicProfile | null;
  guestProfile: { uid: string; displayName: string } | null;
  onSelectTeam: (team: TrooperRole) => void;
  onSelectMode: (mode: MatchModeId) => void;
  onQuickPlay: (btn: HTMLButtonElement) => void;
  onStartMatch: (btn: HTMLButtonElement) => void;
  onOpenMultiplayer: (btn: HTMLButtonElement) => void;
  onOpenAuth: (btn: HTMLButtonElement) => void;
  onOpenSettings: (btn: HTMLButtonElement) => void;
  onToggleMute: (btn: HTMLButtonElement) => void;
}

function WaterBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
      <path
        d="M12 2.5C12 2.5 5.5 10.2 5.5 14.8C5.5 18.5 8.4 21.5 12 21.5C15.6 21.5 18.5 18.5 18.5 14.8C18.5 10.2 12 2.5 12 2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FireBadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
      <path
        d="M12.6 2.3C12.6 2.3 17.5 7.2 17.5 12.2C17.5 13.6 17.0 14.9 16.3 15.9C16.8 14.6 16.4 12.9 15.4 12.0C15.4 12.0 15.1 14.8 13.3 15.8C13.9 13.7 13.1 10.8 11.0 9.0C11.0 9.0 11.2 11.6 9.5 13.2C8.8 12.5 8.5 11.4 8.6 10.4C6.9 11.9 6.2 14.2 6.6 16.4C7.2 19.4 9.6 21.5 12.5 21.5C16.1 21.5 19.0 18.6 19.0 14.6C19.0 9.0 12.6 2.3 12.6 2.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.1 7.1 0 0 0-1.62-.94l-.36-2.54a.49.49 0 0 0-.49-.42h-3.84a.49.49 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.4 1.04.71 1.62.94l.36 2.54c.05.24.25.42.49.42h3.84c.24 0 .44-.18.49-.42l.36-2.54c.58-.23 1.12-.54 1.62-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2Z"
      />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        d="M11 5L6 9H3V15H6L11 19V5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      {muted ? (
        <path
          d="M16 9L21 15M21 9L16 15"
          fill="none"
          stroke="#ff6b57"
          strokeWidth="2.1"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M15.5 8.5C16.8 9.8 16.8 14.2 15.5 15.5M18.3 6.2C20.8 8.7 20.8 15.3 18.3 17.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function LobbyOverlay({
  selectedTeam,
  selectedMode,
  isMuted,
  settings,
  authUser,
  userProfile,
  guestProfile,
  onSelectTeam,
  onSelectMode,
  onQuickPlay,
  onStartMatch,
  onOpenMultiplayer,
  onOpenAuth,
  onOpenSettings,
  onToggleMute,
}: LobbyOverlayProps) {
  const activeModeCfg = getMatchModeConfig(selectedMode);
  const signedInName =
    userProfile?.displayName ||
    authUser?.displayName ||
    (authUser ? authUser.email?.split('@')[0] : null) ||
    guestProfile?.displayName ||
    null;

  return (
    <div
      role="dialog"
      aria-label="Save It Match Setup"
      data-testid="lobby-screen"
      className="fixed inset-0 z-20 overflow-hidden bg-[#120d10] text-[#f6f1e9]"
    >
      {/* Full-bleed Hero Lobby Backdrop Artwork */}
      <img
        src="/assets/aistudio/loby_f8724db9.jpg"
        alt="Hero Water Trooper and Villain Fire Trooper standing on the arena pedestal"
        referrerPolicy="no-referrer"
        className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center select-none"
      />

      {/* Scrims cleanly mask baked-in UI zones in the background artwork while keeping both troopers vivid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_34%_24%_at_13%_9%,rgba(9,20,16,0.99)_0%,rgba(9,20,16,0.94)_56%,rgba(9,20,16,0.55)_76%,transparent_96%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[132px] bg-[linear-gradient(180deg,rgba(12,10,13,0.99)_0%,rgba(12,10,13,0.92)_38%,rgba(12,10,13,0.55)_72%,transparent_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-full lg:w-[540px] bg-[linear-gradient(90deg,transparent_0%,rgba(16,8,10,0.88)_14%,rgba(14,7,9,0.99)_24%,rgba(12,6,8,0.995)_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[72px] bg-[linear-gradient(0deg,rgba(10,11,15,0.99)_0%,rgba(10,11,15,0.88)_52%,transparent_100%)]"
      />

      {/* Foreground Interactive Lobby Layout */}
      <div className="relative z-10 flex flex-col justify-between w-full h-full px-5 sm:px-8 pt-3.5 sm:pt-4 pb-3">
        {/* TOP HEADER BAR: Brand Logo · Match Tagline · Settings & Sound */}
        <header className="flex items-start justify-between gap-4">
          {/* Left: Stylized Beveled SAVE IT Wordmark */}
          <div className="shrink-0 select-none pl-1">
            <h1
              aria-label="Save It"
              className="font-display text-[48px] sm:text-[64px] font-black italic tracking-[-0.03em] leading-[0.95] flex items-baseline gap-2 drop-shadow-[0_6px_14px_rgba(0,0,0,0.9)]"
            >
              <span className="bg-[linear-gradient(180deg,#ffffff_12%,#8df7ff_48%,#0284c7_94%)] bg-clip-text text-transparent drop-shadow-[0_4px_0_#072b42]">
                SAVE
              </span>
              <span className="bg-[linear-gradient(180deg,#fff7c2_12%,#fbbf24_48%,#ea580c_94%)] bg-clip-text text-transparent drop-shadow-[0_4px_0_#4a1705]">
                IT
              </span>
            </h1>
          </div>

          {/* Center: Elemental Territory Arena · 3-Minute Match */}
          <div className="hidden md:flex flex-col items-center pt-1.5 px-4 max-w-[540px] flex-1">
            <p className="text-sm lg:text-[15px] font-semibold tracking-[0.16em] uppercase text-[#faf5ed] whitespace-nowrap drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
              4 Rounds × 1:00 · Tie Goes to Final Round 5
            </p>
            <div className="relative w-full max-w-[460px] mt-2 flex items-center justify-center">
              <span className="w-full h-[1.5px] bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.68)_50%,transparent_100%)]" />
              <span
                aria-hidden="true"
                className="absolute -bottom-[6px] w-2.5 h-2.5 rotate-45 border-r-[1.5px] border-b-[1.5px] border-white/80 bg-[#141013]"
              />
            </div>
          </div>

          {/* Right: Account, Settings & Sound */}
          <div className="flex items-center gap-2.5 shrink-0 pt-1">
            <button
              type="button"
              data-testid="lobby-auth-btn"
              onClick={(e) => onOpenAuth(e.currentTarget)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-bold tracking-[0.1em] uppercase shadow-[0_6px_18px_rgba(0,0,0,0.55)] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                authUser && authUser.emailVerified
                  ? 'bg-[rgba(14,54,72,0.92)] hover:bg-[rgba(20,72,96,0.96)] border-[#38efff]/60 text-[#d8fbff]'
                  : 'bg-[rgba(48,34,14,0.94)] hover:bg-[rgba(68,48,18,0.98)] border-[#f3b955]/60 text-[#ffe6b0]'
              }`}
            >
              <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-white/15 font-mono text-[10px]">
                {userProfile?.avatarTag || (authUser ? 'ID' : guestProfile ? 'G' : '+')}
              </span>
              <span>
                {authUser
                  ? authUser.emailVerified
                    ? `${signedInName} · ${userProfile?.wins ?? 0}W`
                    : 'Verify Email'
                  : guestProfile
                    ? `${guestProfile.displayName} (Guest)`
                    : 'Sign Up / Log In'}
              </span>
            </button>

            <button
              type="button"
              data-testid="lobby-settings-btn"
              onClick={(e) => onOpenSettings(e.currentTarget)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[rgba(34,26,28,0.94)] hover:bg-[rgba(50,39,42,0.98)] border border-white/25 text-xs font-bold tracking-[0.12em] uppercase text-[#f6f1e9] shadow-[0_6px_18px_rgba(0,0,0,0.55)] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <GearIcon />
              <span>Settings</span>
            </button>

            <button
              type="button"
              onClick={(e) => onToggleMute(e.currentTarget)}
              aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[rgba(34,26,28,0.94)] hover:bg-[rgba(50,39,42,0.98)] border border-white/25 text-xs font-bold tracking-[0.12em] uppercase text-[#f6f1e9] shadow-[0_6px_18px_rgba(0,0,0,0.55)] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
            >
              <SpeakerIcon muted={isMuted} />
              <span>{isMuted ? 'Muted' : 'Sound'}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/25 font-mono text-[10px] font-bold leading-none text-[#e5e9f0]">
                N
              </kbd>
            </button>
          </div>
        </header>

        {/* CENTER / RIGHT SELECTION DOCK */}
        <div className="flex-1 flex items-center justify-end py-1">
          <aside className="w-full max-w-[392px] flex flex-col gap-2.5">
            {/* Panel 1: CHOOSE TROOPER */}
            <section
              aria-label="Choose Trooper"
              className="rounded-xl bg-[linear-gradient(160deg,rgba(44,27,28,0.96),rgba(22,13,15,0.98))] border border-white/20 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_22px_52px_rgba(0,0,0,0.75)]"
            >
              <div className="flex items-baseline justify-between mb-2.5">
                <h2 className="font-display text-sm font-bold tracking-[0.12em] uppercase text-[#faf5ed]">
                  Choose Trooper
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Hero Trooper Card */}
                <button
                  type="button"
                  data-testid="select-hero-trooper"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectTeam('hero');
                  }}
                  aria-pressed={selectedTeam === 'hero'}
                  className={`group relative h-[154px] rounded-xl overflow-hidden text-left transition-all bg-[radial-gradient(circle_at_50%_34%,#7dd3fc_0%,#0ea5e9_52%,#0c4a6e_100%)] focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                    selectedTeam === 'hero'
                      ? 'border-2 border-[#39f0ff] shadow-[0_0_26px_rgba(57,240,255,0.45)]'
                      : 'border border-white/20 opacity-85 hover:opacity-100 hover:border-white/40'
                  }`}
                >
                  <img
                    src="/assets/aistudio/vodeni_model_11c5c386.jpg"
                    alt="Hero Trooper Water & Meadow"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover object-[50%_18%] scale-105 mix-blend-multiply brightness-110 contrast-105 transition-transform duration-200 group-hover:scale-110"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,36,56,0.04)_0%,rgba(6,28,46,0.22)_54%,rgba(5,16,28,0.94)_100%)]"
                  />
                  <span className="absolute top-2 left-2 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-[rgba(8,38,56,0.92)] border border-[#39f0ff]/75 text-[#49f3ff] shadow">
                    <WaterBadgeIcon />
                  </span>
                  <div className="relative z-10 flex flex-col justify-end h-full p-2.5 text-center">
                    <div className="text-[13px] font-bold leading-tight text-[#ffffff] whitespace-nowrap drop-shadow">
                      Hero Trooper
                    </div>
                    <div className="text-[11px] font-medium text-[#9aefff] whitespace-nowrap">
                      (Water &amp; Meadow)
                    </div>
                  </div>
                </button>

                {/* Villain Trooper Card */}
                <button
                  type="button"
                  data-testid="select-villain-trooper"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectTeam('villain');
                  }}
                  aria-pressed={selectedTeam === 'villain'}
                  className={`group relative h-[154px] rounded-xl overflow-hidden text-left transition-all bg-[radial-gradient(circle_at_50%_34%,#fdba74_0%,#f97316_50%,#9a1f0c_100%)] focus-visible:outline-2 focus-visible:outline-orange-400 ${
                    selectedTeam === 'villain'
                      ? 'border-2 border-[#ff6b2b] shadow-[0_0_26px_rgba(255,107,43,0.48)]'
                      : 'border border-white/20 opacity-85 hover:opacity-100 hover:border-white/40'
                  }`}
                >
                  <img
                    src="/assets/aistudio/vatreni_model_264086e1.jpg"
                    alt="Villain Trooper Fire & Desert"
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover object-[50%_18%] scale-105 mix-blend-multiply brightness-110 contrast-105 transition-transform duration-200 group-hover:scale-110"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-[linear-gradient(180deg,rgba(44,12,6,0.04)_0%,rgba(44,12,6,0.22)_54%,rgba(28,8,5,0.94)_100%)]"
                  />
                  <span className="absolute top-2 left-2 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-[rgba(58,16,8,0.92)] border border-[#ff7a33]/75 text-[#ff8b42] shadow">
                    <FireBadgeIcon />
                  </span>
                  <div className="relative z-10 flex flex-col justify-end h-full p-2.5 text-center">
                    <div className="text-[13px] font-bold leading-tight text-[#ffffff] whitespace-nowrap drop-shadow">
                      Villain Trooper
                    </div>
                    <div className="text-[11px] font-medium text-[#ffc4a3] whitespace-nowrap">
                      (Fire &amp; Desert)
                    </div>
                  </div>
                </button>
              </div>

              <div className="mt-3 flex items-center justify-center gap-2 text-[11px] font-medium">
                <span className="text-[#5eeeff]">Restore Lush Meadow</span>
                <span className="text-[10px] font-bold tracking-wider uppercase text-white/65">
                  VS
                </span>
                <span className="text-[#ff9c63]">Spread Wasteland</span>
              </div>
            </section>

            {/* Panel 2: ARENA SIZE & MODE */}
            <section
              aria-label="Arena Size & Mode"
              className="rounded-xl bg-[linear-gradient(160deg,rgba(44,27,28,0.96),rgba(22,13,15,0.98))] border border-white/20 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_22px_52px_rgba(0,0,0,0.75)]"
            >
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="font-display text-sm font-bold tracking-[0.12em] uppercase text-[#faf5ed]">
                  Arena Size &amp; Mode
                </h2>
                <span className="text-xs font-semibold text-[#d3cad0] tabular-nums">
                  {activeModeCfg.label} · {activeModeCfg.gridLabel}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {MATCH_MODES.map((mode) => {
                  const active = selectedMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      data-testid={`select-mode-${mode.id}`}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onSelectMode(mode.id);
                      }}
                      aria-pressed={active}
                      className={`flex flex-col items-center justify-center py-2.5 px-3 rounded-lg transition-all focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        active
                          ? 'bg-[rgba(243,185,85,0.20)] border-2 border-[#f3b955] text-[#fff8eb] shadow-[0_0_20px_rgba(243,185,85,0.3)]'
                          : 'bg-white/[0.05] border border-white/20 text-[#d8d3d6] hover:bg-white/[0.11] hover:border-white/35'
                      }`}
                    >
                      <span className="font-display text-base font-bold leading-tight">
                        {mode.label}
                      </span>
                      <span className="mt-0.5 text-[11px] font-medium opacity-85 tabular-nums whitespace-nowrap">
                        ({mode.gridLabel})
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Primary CTAs: Quick Play + Solo Match + Custom Friend Lobbies */}
            <div className="pt-0.5 flex flex-col gap-2">
              <button
                type="button"
                data-testid="quick-play-btn"
                onClick={(e) => onQuickPlay(e.currentTarget)}
                style={{
                  clipPath: 'polygon(14px 0%, 100% 0%, calc(100% - 14px) 100%, 0% 100%)',
                }}
                className="w-full py-3.5 px-6 bg-[linear-gradient(100deg,#30f0ff_0%,#85e6be_44%,#ffd147_100%)] text-[#09131a] font-display text-[22px] font-black tracking-[0.08em] uppercase shadow-[0_14px_40px_rgba(48,240,255,0.44)] hover:brightness-110 active:scale-[0.985] transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
              >
                Quick Play · {activeModeCfg.label}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="start-match-btn"
                  onClick={(e) => onStartMatch(e.currentTarget)}
                  className="py-2.5 px-3 rounded-xl bg-[rgba(28,34,46,0.95)] border border-amber-300/45 text-[#fff4dc] font-display text-xs font-bold tracking-[0.12em] uppercase shadow-[0_8px_22px_rgba(0,0,0,0.5)] hover:border-amber-300 hover:bg-[rgba(40,46,60,0.98)] transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  Start Solo Match
                </button>

                <button
                  type="button"
                  data-testid="open-multiplayer-btn"
                  onClick={(e) => onOpenMultiplayer(e.currentTarget)}
                  className="py-2.5 px-3 rounded-xl bg-[linear-gradient(100deg,rgba(18,38,56,0.96),rgba(34,20,38,0.96))] border border-[#38efff]/55 text-[#d9fbff] font-display text-xs font-bold tracking-[0.12em] uppercase shadow-[0_8px_22px_rgba(0,0,0,0.5)] hover:border-[#38efff] hover:brightness-110 transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  Friend Lobbies
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* BOTTOM CONTROLS STRIP */}
        <footer className="flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-6 py-2 rounded-xl bg-[rgba(13,15,20,0.97)] border border-white/20 shadow-[0_10px_28px_rgba(0,0,0,0.8)] text-xs text-[#dfd9d1]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/25 font-mono text-[10px] font-bold text-white">
                {formatKeyCode(settings.keybinds.moveForward)}{' '}
                {formatKeyCode(settings.keybinds.moveLeft)}{' '}
                {formatKeyCode(settings.keybinds.moveBackward)}{' '}
                {formatKeyCode(settings.keybinds.moveRight)}
              </kbd>
              <span>Move</span>
            </span>
            <span aria-hidden="true" className="text-white/35">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/25 font-mono text-[10px] font-bold text-white">
                {formatKeyCode(settings.keybinds.sprintBoost)}
              </kbd>
              <span>Boost (Empty)</span>
            </span>
            <span aria-hidden="true" className="text-white/35">
              ·
            </span>
            <span className="whitespace-nowrap">Click Spray</span>
            <span aria-hidden="true" className="text-white/35">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/25 font-mono text-[10px] font-bold text-white">
                {formatKeyCode(settings.keybinds.throwGrenade)}
              </kbd>
              <span>Grenade</span>
            </span>
            <span aria-hidden="true" className="text-white/35">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/25 font-mono text-[10px] font-bold text-white">
                {formatKeyCode(settings.keybinds.throwDizzy)}
              </kbd>
              <span>Dizzy</span>
            </span>
            <span aria-hidden="true" className="text-white/35">
              ·
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/25 font-mono text-[10px] font-bold text-white">
                {formatKeyCode(settings.keybinds.toggleFirstPerson)}
              </kbd>
              <span>1st Person</span>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
