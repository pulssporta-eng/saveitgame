export const DISPLAY_NAME_REGEX = /^[a-zA-Z0-9_ -]{2,24}$/;
export const LOBBY_CODE_REGEX = /^[A-Z0-9]{6}$/;
export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

export function sanitizeDisplayNameInput(raw: string): string {
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9_ -]/g, '')
    .slice(0, 24);
}

export function validateDisplayName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return 'Trooper name must be at least 2 characters.';
  if (trimmed.length > 24) return 'Trooper name must be 24 characters or fewer.';
  if (!DISPLAY_NAME_REGEX.test(trimmed)) {
    return 'Use only letters, numbers, spaces, hyphens, or underscores.';
  }
  return null;
}

export function normalizeLobbyCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function validateLobbyCode(raw: string): string | null {
  const code = normalizeLobbyCode(raw);
  if (!LOBBY_CODE_REGEX.test(code)) {
    return 'Lobby code must be 6 letters/numbers (e.g. A7K9P2).';
  }
  return null;
}

export function validateLobbyTitle(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 2) return 'Room title must be at least 2 characters.';
  if (trimmed.length > 40) return 'Room title must be 40 characters or fewer.';
  return null;
}

export function validateEmailInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 120 || !trimmed.includes('@') || !trimmed.includes('.')) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePasswordInput(raw: string): string | null {
  if (raw.length < 6) return 'Password must be at least 6 characters.';
  if (raw.length > 128) return 'Password is too long.';
  return null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateLobbyCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(rng() * CODE_ALPHABET.length) % CODE_ALPHABET.length;
    code += CODE_ALPHABET[idx];
  }
  return code;
}

export function deriveAvatarTag(displayName: string): string {
  const clean = displayName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length >= 2) return clean.slice(0, 2);
  if (clean.length === 1) return `${clean}T`;
  return 'ST';
}

export function deriveFallbackDisplayName(email?: string | null, name?: string | null): string {
  const fromName = name ? sanitizeDisplayNameInput(name) : '';
  if (fromName.length >= 2) return fromName;
  const prefix = email ? email.split('@')[0] ?? '' : '';
  const fromEmail = sanitizeDisplayNameInput(prefix);
  if (fromEmail.length >= 2) return fromEmail;
  return 'Trooper';
}
