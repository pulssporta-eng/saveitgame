export type BindableAction =
  | 'moveForward'
  | 'moveBackward'
  | 'moveLeft'
  | 'moveRight'
  | 'sprintBoost'
  | 'throwGrenade'
  | 'throwDizzy'
  | 'toggleFirstPerson'
  | 'toggleCamera'
  | 'toggleOrbit'
  | 'pauseMenu';

export type KeybindMap = Record<BindableAction, string>;

export type PreferredCameraMode = 'thirdPerson' | 'firstPerson' | 'follow';

export interface GameSettings {
  masterVolume: number; // 0..100
  musicVolume: number; // 0..100
  sfxVolume: number; // 0..100
  muted: boolean;
  mouseSensitivity: number; // 0.3..2.5
  invertY: boolean;
  defaultCameraMode: PreferredCameraMode;
  fovBoost: number; // -8..14
  screenShake: boolean;
  showCrosshair: boolean;
  showMinimap: boolean;
  keybinds: KeybindMap;
}

export const SETTINGS_STORAGE_KEY = 'save-it-arena-settings-v1';

export const DEFAULT_KEYBINDS: KeybindMap = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  sprintBoost: 'ShiftLeft',
  throwGrenade: 'Space',
  throwDizzy: 'KeyF',
  toggleFirstPerson: 'KeyV',
  toggleCamera: 'KeyB',
  toggleOrbit: 'KeyC',
  pauseMenu: 'Escape',
};

export const ACTION_LABELS: ReadonlyArray<{
  action: BindableAction;
  label: string;
  hint: string;
}> = [
  { action: 'moveForward', label: 'Move Forward', hint: 'Walk or sprint ahead' },
  { action: 'moveBackward', label: 'Move Backward', hint: 'Step back' },
  { action: 'moveLeft', label: 'Strafe Left', hint: 'Sidestep left' },
  { action: 'moveRight', label: 'Strafe Right', hint: 'Sidestep right' },
  { action: 'sprintBoost', label: 'Empty-Tank Boost', hint: 'Hold for extra speed when tank is 0' },
  { action: 'throwGrenade', label: 'Throw Elemental Bomb', hint: 'Large 6m territory blast' },
  { action: 'throwDizzy', label: 'Throw Dizzy Bomb', hint: '3s stun in close range' },
  { action: 'toggleFirstPerson', label: 'Toggle 1st Person', hint: 'Switch 1st / 3rd view' },
  { action: 'toggleCamera', label: 'Cycle 3rd / Overhead', hint: 'Switch chase / top view' },
  { action: 'toggleOrbit', label: 'Free Orbit Camera', hint: 'Inspect arena freely' },
  { action: 'pauseMenu', label: 'Pause Menu', hint: 'Pause match & open settings' },
];

export function createDefaultSettings(): GameSettings {
  return {
    masterVolume: 85,
    musicVolume: 65,
    sfxVolume: 90,
    muted: false,
    mouseSensitivity: 1.0,
    invertY: false,
    defaultCameraMode: 'thirdPerson',
    fovBoost: 0,
    screenShake: true,
    showCrosshair: true,
    showMinimap: true,
    keybinds: { ...DEFAULT_KEYBINDS },
  };
}

export function clampSettings(input: Partial<GameSettings> | null | undefined): GameSettings {
  const def = createDefaultSettings();
  if (!input) return def;

  const clampNum = (v: unknown, min: number, max: number, fallback: number): number => {
    if (typeof v !== 'number' || Number.isNaN(v)) return fallback;
    return Math.max(min, Math.min(max, v));
  };

  const mergedBinds: KeybindMap = { ...DEFAULT_KEYBINDS };
  if (input.keybinds && typeof input.keybinds === 'object') {
    (Object.keys(DEFAULT_KEYBINDS) as BindableAction[]).forEach((act) => {
      const code = input.keybinds?.[act];
      if (typeof code === 'string' && code.trim().length > 0) {
        mergedBinds[act] = code;
      }
    });
  }

  const cam = input.defaultCameraMode;
  const defaultCameraMode: PreferredCameraMode =
    cam === 'firstPerson' || cam === 'follow' || cam === 'thirdPerson'
      ? cam
      : def.defaultCameraMode;

  return {
    masterVolume: Math.round(clampNum(input.masterVolume, 0, 100, def.masterVolume)),
    musicVolume: Math.round(clampNum(input.musicVolume, 0, 100, def.musicVolume)),
    sfxVolume: Math.round(clampNum(input.sfxVolume, 0, 100, def.sfxVolume)),
    muted: typeof input.muted === 'boolean' ? input.muted : def.muted,
    mouseSensitivity: Math.round(clampNum(input.mouseSensitivity, 0.3, 2.5, def.mouseSensitivity) * 20) / 20,
    invertY: typeof input.invertY === 'boolean' ? input.invertY : def.invertY,
    defaultCameraMode,
    fovBoost: Math.round(clampNum(input.fovBoost, -8, 14, def.fovBoost)),
    screenShake: typeof input.screenShake === 'boolean' ? input.screenShake : def.screenShake,
    showCrosshair: typeof input.showCrosshair === 'boolean' ? input.showCrosshair : def.showCrosshair,
    showMinimap: typeof input.showMinimap === 'boolean' ? input.showMinimap : def.showMinimap,
    keybinds: mergedBinds,
  };
}

export function loadSettings(): GameSettings {
  if (typeof window === 'undefined') return createDefaultSettings();
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return createDefaultSettings();
    return clampSettings(JSON.parse(raw) as Partial<GameSettings>);
  } catch {
    return createDefaultSettings();
  }
}

export function saveSettings(settings: GameSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / restricted iframe errors
  }
}

/**
 * Rebinds an action to `newCode`. If another action already uses `newCode`,
 * the two actions cleanly swap codes so no binding is ever orphaned.
 */
export function rebindControl(
  settings: GameSettings,
  action: BindableAction,
  newCode: string,
): GameSettings {
  if (!newCode) return settings;
  const normalizedCode = newCode === 'ShiftRight' ? 'ShiftLeft' : newCode;
  const previousCode = settings.keybinds[action];
  if (previousCode === normalizedCode) return settings;

  const nextBinds: KeybindMap = { ...settings.keybinds };
  for (const key of Object.keys(nextBinds) as BindableAction[]) {
    if (key !== action && nextBinds[key] === normalizedCode) {
      nextBinds[key] = previousCode;
    }
  }
  nextBinds[action] = normalizedCode;

  return {
    ...settings,
    keybinds: nextBinds,
  };
}

export function matchesActionKey(code: string, boundCode: string): boolean {
  if (boundCode === 'ShiftLeft' || boundCode === 'ShiftRight') {
    return code === 'ShiftLeft' || code === 'ShiftRight';
  }
  return code === boundCode;
}

export function formatKeyCode(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  switch (code) {
    case 'Space':
      return 'SPACE';
    case 'ShiftLeft':
    case 'ShiftRight':
      return 'SHIFT';
    case 'ControlLeft':
    case 'ControlRight':
      return 'CTRL';
    case 'AltLeft':
    case 'AltRight':
      return 'ALT';
    case 'Escape':
      return 'ESC';
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case 'Tab':
      return 'TAB';
    case 'Enter':
      return 'ENTER';
    default:
      return code.toUpperCase();
  }
}
