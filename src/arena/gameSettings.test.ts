import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampSettings,
  createDefaultSettings,
  formatKeyCode,
  matchesActionKey,
  rebindControl,
} from './gameSettings';

test('default settings clamp safely and format key codes cleanly', () => {
  const def = createDefaultSettings();
  assert.equal(def.masterVolume, 85);
  assert.equal(def.musicVolume, 65);
  assert.equal(def.sfxVolume, 90);
  assert.equal(def.keybinds.throwDizzy, 'KeyF');

  const clamped = clampSettings({
    masterVolume: 180,
    musicVolume: -15,
    mouseSensitivity: 9.0,
    fovBoost: -40,
  });
  assert.equal(clamped.masterVolume, 100);
  assert.equal(clamped.musicVolume, 0);
  assert.equal(clamped.mouseSensitivity, 2.5);
  assert.equal(clamped.fovBoost, -8);

  assert.equal(formatKeyCode('KeyW'), 'W');
  assert.equal(formatKeyCode('Space'), 'SPACE');
  assert.equal(formatKeyCode('ShiftLeft'), 'SHIFT');
  assert.equal(formatKeyCode('Escape'), 'ESC');
});

test('rebindControl swaps conflicting keybindings instead of leaving actions unbound', () => {
  const def = createDefaultSettings();
  // Rebind throwDizzy (was KeyF) to Space (was throwGrenade)
  const updated = rebindControl(def, 'throwDizzy', 'Space');
  assert.equal(updated.keybinds.throwDizzy, 'Space');
  assert.equal(updated.keybinds.throwGrenade, 'KeyF');

  // Rebind moveForward to ArrowUp (unused) leaves other binds intact
  const moved = rebindControl(updated, 'moveForward', 'ArrowUp');
  assert.equal(moved.keybinds.moveForward, 'ArrowUp');
  assert.equal(moved.keybinds.moveBackward, 'KeyS');

  // ShiftLeft matches both left and right shift
  assert.equal(matchesActionKey('ShiftRight', def.keybinds.sprintBoost), true);
  assert.equal(matchesActionKey('ShiftLeft', def.keybinds.sprintBoost), true);
});
