import { useEffect, useState } from 'react';
import {
  ACTION_LABELS,
  BindableAction,
  createDefaultSettings,
  formatKeyCode,
  GameSettings,
  PreferredCameraMode,
  rebindControl,
} from '../arena/gameSettings';
import { arenaSound } from '../arena/soundFx';

type SettingsTab = 'audio' | 'controls' | 'display';

interface SettingsModalProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  showLobbyBackdrop?: boolean;
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onClose: () => void;
  onListeningChange?: (listening: boolean) => void;
}

export function SettingsModal({
  open,
  title = 'Settings',
  subtitle = 'Audio · Controls · Display',
  showLobbyBackdrop = false,
  settings,
  onChange,
  onClose,
  onListeningChange,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('audio');
  const [listeningAction, setListeningAction] = useState<BindableAction | null>(null);

  useEffect(() => {
    onListeningChange?.(Boolean(open && listeningAction));
  }, [open, listeningAction, onListeningChange]);

  useEffect(() => {
    if (!open) {
      setListeningAction(null);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) {
        e.preventDefault();
        e.stopPropagation();
        if (e.code === 'Escape' && listeningAction !== 'pauseMenu') {
          setListeningAction(null);
          return;
        }
        const updated = rebindControl(settings, listeningAction, e.code);
        onChange(updated);
        arenaSound.playUiClick();
        setListeningAction(null);
        return;
      }

      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        arenaSound.playUiClick();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, listeningAction, settings, onChange, onClose]);

  if (!open) return null;

  const handleResetDefaults = (btn: HTMLButtonElement) => {
    btn.blur();
    arenaSound.playUiClick();
    setListeningAction(null);
    onChange(createDefaultSettings());
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6 bg-[rgba(5,7,12,0.74)] overflow-hidden">
      {showLobbyBackdrop && (
        <>
          <img
            src="/assets/aistudio/loby_f8724db9.jpg"
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            data-testid="settings-lobby-backdrop"
            className="pointer-events-none absolute inset-0 w-full h-full object-cover object-center select-none"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_75%_at_50%_50%,rgba(8,10,16,0.68)_0%,rgba(6,8,13,0.92)_100%)]"
          />
        </>
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="settings-modal"
        className="relative z-10 w-full max-w-[580px] max-h-[88vh] flex flex-col rounded-2xl bg-[linear-gradient(155deg,rgba(14,18,28,0.99),rgba(8,10,16,0.98))] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_28px_72px_rgba(0,0,0,0.86)] text-[#f4efe6] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-white/10">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-wider uppercase text-[#faf6ee] leading-none">
              {title}
            </h2>
            <p className="mt-1 text-[11px] font-medium tracking-[0.14em] uppercase text-[#9ca3b4]">
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            data-testid="settings-close-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              arenaSound.playUiClick();
              onClose();
            }}
            aria-label="Close settings"
            className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-xs font-semibold text-[#e2e7f0] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
          >
            Done
          </button>
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Settings sections"
          className="grid grid-cols-3 gap-1.5 px-6 pt-3 pb-2 border-b border-white/10 bg-[rgba(6,8,13,0.45)]"
        >
          {(
            [
              { id: 'audio', label: 'Audio' },
              { id: 'controls', label: 'Controls' },
              { id: 'display', label: 'Display' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-testid={`settings-tab-${tab.id}`}
                aria-selected={active}
                onClick={(e) => {
                  e.currentTarget.blur();
                  arenaSound.playUiClick();
                  setListeningAction(null);
                  setActiveTab(tab.id);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold tracking-wider uppercase transition-all focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                  active
                    ? 'bg-[rgba(56,189,248,0.22)] border border-[#38bdf8]/60 text-[#e0f8ff] shadow-[0_0_16px_rgba(56,189,248,0.18)]'
                    : 'bg-white/[0.03] border border-transparent text-[#a8aebc] hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {activeTab === 'audio' && (
            <div role="tabpanel" aria-label="Audio settings" className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                <div>
                  <div className="text-sm font-semibold text-[#faf6ee]">Mute All Audio</div>
                  <div className="text-xs text-[#9ca3b4]">Quick shortcut: press [N] anytime</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.muted}
                    onChange={(e) => {
                      onChange({ ...settings, muted: e.target.checked });
                    }}
                    className="w-5 h-5 accent-cyan-400 rounded cursor-pointer"
                  />
                </label>
              </div>

              {(
                [
                  {
                    key: 'masterVolume',
                    label: 'Master Volume',
                    hint: 'Overall game output level',
                    value: settings.masterVolume,
                  },
                  {
                    key: 'musicVolume',
                    label: 'Music Volume',
                    hint: 'Lobby ambience & tension score',
                    value: settings.musicVolume,
                  },
                  {
                    key: 'sfxVolume',
                    label: 'Sound Effects',
                    hint: 'Water/fire sprays, footsteps, pickups, bombs',
                    value: settings.sfxVolume,
                  },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2"
                >
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-sm font-semibold text-[#faf6ee]">{item.label}</div>
                      <div className="text-xs text-[#9ca3b4]">{item.hint}</div>
                    </div>
                    <span className="font-display text-base font-bold text-[#7ceeff] tabular-nums">
                      {item.value}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    aria-label={item.label}
                    value={item.value}
                    onChange={(e) => {
                      const nextVal = Number(e.target.value);
                      onChange({ ...settings, [item.key]: nextVal });
                    }}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'controls' && (
            <div role="tabpanel" aria-label="Control settings" className="space-y-4">
              {/* Mouse Sensitivity */}
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#faf6ee]">Mouse Sensitivity</div>
                    <div className="text-xs text-[#9ca3b4]">
                      Applies to 1st-person and 3rd-person aim look
                    </div>
                  </div>
                  <span className="font-display text-base font-bold text-[#f3cb7d] tabular-nums">
                    {settings.mouseSensitivity.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.05}
                  aria-label="Mouse Sensitivity"
                  value={settings.mouseSensitivity}
                  onChange={(e) => {
                    onChange({ ...settings, mouseSensitivity: Number(e.target.value) });
                  }}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              {/* Invert Y & Default Camera */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
                  <div>
                    <div className="text-sm font-semibold text-[#faf6ee]">Invert Y-Axis</div>
                    <div className="text-xs text-[#9ca3b4]">Flip vertical look</div>
                  </div>
                  <input
                    type="checkbox"
                    aria-label="Invert Y-Axis"
                    checked={settings.invertY}
                    onChange={(e) => {
                      arenaSound.playUiClick();
                      onChange({ ...settings, invertY: e.target.checked });
                    }}
                    className="w-5 h-5 accent-amber-400 cursor-pointer"
                  />
                </div>

                <div className="flex flex-col justify-between p-3.5 rounded-xl bg-white/[0.04] border border-white/10 gap-1.5">
                  <label
                    htmlFor="default-camera-select"
                    className="text-sm font-semibold text-[#faf6ee]"
                  >
                    Default Camera
                  </label>
                  <select
                    id="default-camera-select"
                    value={settings.defaultCameraMode}
                    onChange={(e) => {
                      arenaSound.playUiClick();
                      onChange({
                        ...settings,
                        defaultCameraMode: e.target.value as PreferredCameraMode,
                      });
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-[#0d111a] border border-white/15 text-xs font-semibold text-[#f4efe6] focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    <option value="thirdPerson">3rd Person Chase</option>
                    <option value="firstPerson">1st Person</option>
                    <option value="follow">Overhead Follow</option>
                  </select>
                </div>
              </div>

              {/* Keybindings */}
              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between px-1">
                  <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#a8aebc]">
                    Keybindings
                  </span>
                  <span className="text-[11px] text-[#8d94a3]">
                    {listeningAction ? 'Press any key to assign...' : 'Click a key badge to rebind'}
                  </span>
                </div>
                <div className="divide-y divide-white/10 rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden">
                  {ACTION_LABELS.map((item) => {
                    const isListening = listeningAction === item.action;
                    return (
                      <div
                        key={item.action}
                        className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#faf6ee]">{item.label}</div>
                          <div className="text-[11px] text-[#949ba8] truncate">{item.hint}</div>
                        </div>
                        <button
                          type="button"
                          data-testid={`rebind-${item.action}`}
                          onClick={(e) => {
                            e.currentTarget.blur();
                            arenaSound.playUiClick();
                            setListeningAction(isListening ? null : item.action);
                          }}
                          className={`min-w-[84px] px-3 py-1.5 rounded-lg border text-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                            isListening
                              ? 'bg-[rgba(250,204,21,0.22)] border-[#facc15] text-[#fef08a] animate-pulse'
                              : 'bg-[#0e131e] hover:bg-[#182032] border-white/15 text-[#7ceeff]'
                          }`}
                        >
                          {isListening ? 'Press Key' : formatKeyCode(settings.keybinds[item.action])}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'display' && (
            <div role="tabpanel" aria-label="Display settings" className="space-y-4">
              <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-2">
                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="text-sm font-semibold text-[#faf6ee]">Field of View (FOV) Offset</div>
                    <div className="text-xs text-[#9ca3b4]">Adjust camera wideness</div>
                  </div>
                  <span className="font-display text-base font-bold text-[#7ceeff] tabular-nums">
                    {settings.fovBoost >= 0 ? `+${settings.fovBoost}°` : `${settings.fovBoost}°`}
                  </span>
                </div>
                <input
                  type="range"
                  min={-8}
                  max={14}
                  step={1}
                  aria-label="Field of View Offset"
                  value={settings.fovBoost}
                  onChange={(e) => {
                    onChange({ ...settings, fovBoost: Number(e.target.value) });
                  }}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              {(
                [
                  {
                    key: 'screenShake',
                    label: 'Explosion Camera Shake',
                    hint: 'Subtle blast impulse when grenades or dizzy bombs detonate',
                    checked: settings.screenShake,
                  },
                  {
                    key: 'showCrosshair',
                    label: 'Aiming Crosshair',
                    hint: 'Display center reticle in 1st & 3rd person modes',
                    checked: settings.showCrosshair,
                  },
                  {
                    key: 'showMinimap',
                    label: 'Tactical Radar Minimap',
                    hint: 'Show live territory radar in the top-right corner',
                    checked: settings.showMinimap,
                  },
                ] as const
              ).map((toggle) => (
                <div
                  key={toggle.key}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-white/[0.04] border border-white/10"
                >
                  <div>
                    <div className="text-sm font-semibold text-[#faf6ee]">{toggle.label}</div>
                    <div className="text-xs text-[#9ca3b4]">{toggle.hint}</div>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={toggle.label}
                    checked={toggle.checked}
                    onChange={(e) => {
                      arenaSound.playUiClick();
                      onChange({ ...settings, [toggle.key]: e.target.checked });
                    }}
                    className="w-5 h-5 accent-cyan-400 cursor-pointer shrink-0"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/10 bg-[rgba(6,8,13,0.55)]">
          <button
            type="button"
            data-testid="settings-reset-btn"
            onClick={(e) => handleResetDefaults(e.currentTarget)}
            className="px-3.5 py-2 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/15 text-xs font-semibold text-[#d3d8e2] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Reset to Defaults
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              arenaSound.playUiClick();
              onClose();
            }}
            className="px-5 py-2 rounded-lg bg-[linear-gradient(90deg,#0ea5c6,#14b8a6)] text-[#04181e] font-display text-xs font-bold tracking-[0.12em] uppercase hover:brightness-110 transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
          >
            Save & Close
          </button>
        </div>
      </div>
    </div>
  );
}
