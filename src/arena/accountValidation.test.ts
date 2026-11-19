import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveAvatarTag,
  deriveFallbackDisplayName,
  generateLobbyCode,
  LOBBY_CODE_REGEX,
  normalizeLobbyCode,
  sanitizeDisplayNameInput,
  validateDisplayName,
  validateEmailInput,
  validateLobbyCode,
  validateLobbyTitle,
  validatePasswordInput,
} from './accountValidation';

test('display name sanitization and validation match firebase-blueprint.json bounds', () => {
  assert.equal(sanitizeDisplayNameInput('  Hydro_Ace!@#  '), 'Hydro_Ace');
  assert.equal(validateDisplayName('Hydro Ace'), null);
  assert.ok(validateDisplayName('A') !== null);
  assert.ok(validateDisplayName('A'.repeat(25)) !== null);
  assert.equal(deriveAvatarTag('Hydro Ace'), 'HY');
  assert.equal(deriveFallbackDisplayName('wave.rider@example.com', null), 'waverider');
});

test('lobby code normalization, generation, and validation match 6-char uppercase pattern', () => {
  assert.equal(normalizeLobbyCode('a7-k9p2!'), 'A7K9P2');
  assert.equal(validateLobbyCode('a7k9p2'), null);
  assert.ok(validateLobbyCode('ABC') !== null);

  for (let i = 0; i < 20; i++) {
    const code = generateLobbyCode();
    assert.match(code, LOBBY_CODE_REGEX);
  }
});

test('lobby title, email, and password validation enforce schema constraints', () => {
  assert.equal(validateLobbyTitle('Friday Squad'), null);
  assert.ok(validateLobbyTitle('X') !== null);
  assert.ok(validateLobbyTitle('X'.repeat(41)) !== null);
  assert.equal(validateEmailInput('player@saveit.gg'), null);
  assert.ok(validateEmailInput('bad-email') !== null);
  assert.equal(validatePasswordInput('secret99'), null);
  assert.ok(validatePasswordInput('123') !== null);
});
