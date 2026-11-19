import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Pure Rule-Engine & Blueprint Verification Suite for Save It Multiplayer.
 * Verifies every Dirty Dozen adversarial payload from security_spec.md against
 * the blueprint constraints and asserts all security invariants in firestore.rules.
 */

interface AuthContext {
  uid: string;
  emailVerified: boolean;
}

const VALID_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_CODE = /^[A-Z0-9]{6}$/;
const VALID_NAME = /^[a-zA-Z0-9_ -]{2,24}$/;
const SERVER_TIME = '__SERVER_TIME__';

function evaluateRulePolicy(
  op: 'get' | 'list' | 'create' | 'update' | 'delete',
  pathSegments: string[],
  auth: AuthContext | null,
  incoming: Record<string, unknown> | null,
  existing: Record<string, unknown> | null,
  parentLobby: Record<string, unknown> | null = null,
): 'ALLOW' | 'PERMISSION_DENIED' {
  if (!auth) return 'PERMISSION_DENIED';

  // /users/{userId}/public/{docId}
  if (pathSegments[0] === 'users' && pathSegments[2] === 'public' && pathSegments.length === 4) {
    const userId = pathSegments[1];
    const docId = pathSegments[3];
    if (op === 'list') return 'PERMISSION_DENIED';
    if (op === 'get') {
      return VALID_ID.test(userId) && docId === 'profile' ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (!auth.emailVerified || auth.uid !== userId || !VALID_ID.test(userId) || docId !== 'profile') {
      return 'PERMISSION_DENIED';
    }
    if (!incoming) return 'PERMISSION_DENIED';
    const required = [
      'uid',
      'displayName',
      'preferredTeam',
      'avatarTag',
      'matchesPlayed',
      'wins',
      'roundsWon',
      'createdAt',
      'updatedAt',
    ];
    const allowed = [...required, 'bestScore'];
    const keys = Object.keys(incoming);
    if (!required.every((k) => keys.includes(k)) || !keys.every((k) => allowed.includes(k))) {
      return 'PERMISSION_DENIED';
    }
    if (
      'bestScore' in incoming &&
      (typeof incoming.bestScore !== 'number' ||
        !Number.isFinite(incoming.bestScore) ||
        incoming.bestScore < 0 ||
        incoming.bestScore > 100)
    ) {
      return 'PERMISSION_DENIED';
    }
    if (
      incoming.uid !== userId ||
      incoming.uid !== auth.uid ||
      typeof incoming.displayName !== 'string' ||
      !VALID_NAME.test(incoming.displayName)
    ) {
      return 'PERMISSION_DENIED';
    }
    if (op === 'create') {
      return incoming.createdAt === SERVER_TIME && incoming.updatedAt === SERVER_TIME
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (op === 'update' && existing) {
      return incoming.createdAt === existing.createdAt && incoming.updatedAt === SERVER_TIME
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    return 'PERMISSION_DENIED';
  }

  // /users/{userId}/private/{docId}
  if (pathSegments[0] === 'users' && pathSegments[2] === 'private' && pathSegments.length === 4) {
    const userId = pathSegments[1];
    const docId = pathSegments[3];
    if (op === 'list') return 'PERMISSION_DENIED';
    if (op === 'get') {
      return auth.uid === userId && VALID_ID.test(userId) && docId === 'account'
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (!auth.emailVerified || auth.uid !== userId || docId !== 'account') return 'PERMISSION_DENIED';
    return 'ALLOW';
  }

  // /lobbies/{lobbyId}
  if (pathSegments[0] === 'lobbies' && pathSegments.length === 2) {
    const lobbyId = pathSegments[1];
    if (op === 'list') {
      if (!existing) return 'PERMISSION_DENIED';
      return existing.visibility === 'public' || existing.hostUid === auth.uid
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (!VALID_CODE.test(lobbyId)) return 'PERMISSION_DENIED';
    if (op === 'get') return 'ALLOW';
    if (!auth.emailVerified) return 'PERMISSION_DENIED';
    if (op === 'create' && incoming) {
      const allowed = [
        'code',
        'hostUid',
        'hostName',
        'title',
        'mode',
        'visibility',
        'status',
        'maxPlayers',
        'memberCount',
        'createdAt',
        'updatedAt',
      ];
      const keys = Object.keys(incoming);
      if (!allowed.every((k) => keys.includes(k)) || !keys.every((k) => allowed.includes(k))) {
        return 'PERMISSION_DENIED';
      }
      if (
        incoming.code !== lobbyId ||
        incoming.hostUid !== auth.uid ||
        incoming.status !== 'waiting' ||
        typeof incoming.title !== 'string' ||
        incoming.title.length < 2 ||
        incoming.title.length > 40 ||
        incoming.createdAt !== SERVER_TIME ||
        incoming.updatedAt !== SERVER_TIME
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (op === 'update' && incoming && existing) {
      if (existing.status === 'finished') return 'PERMISSION_DENIED';
      if (incoming.hostUid !== existing.hostUid || incoming.code !== existing.code) {
        return 'PERMISSION_DENIED';
      }
      if (incoming.updatedAt !== SERVER_TIME) return 'PERMISSION_DENIED';
      const changed = Object.keys(incoming).filter((k) => incoming[k] !== existing[k]);
      const isHost = existing.hostUid === auth.uid;
      if (isHost) {
        return changed.every((k) =>
          ['title', 'mode', 'visibility', 'status', 'maxPlayers', 'memberCount', 'updatedAt'].includes(k),
        )
          ? 'ALLOW'
          : 'PERMISSION_DENIED';
      }
      return changed.every((k) => ['memberCount', 'updatedAt'].includes(k))
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    return 'PERMISSION_DENIED';
  }

  // /lobbies/{lobbyId}/members/{memberUid}
  if (pathSegments[0] === 'lobbies' && pathSegments[2] === 'members' && pathSegments.length === 4) {
    const lobbyId = pathSegments[1];
    const memberUid = pathSegments[3];
    if (!VALID_CODE.test(lobbyId) || !VALID_ID.test(memberUid)) return 'PERMISSION_DENIED';
    if (!auth.emailVerified) return 'PERMISSION_DENIED';
    if (!parentLobby || parentLobby.status === 'finished') return 'PERMISSION_DENIED';
    if (memberUid !== auth.uid) return 'PERMISSION_DENIED';
    return 'ALLOW';
  }

  return 'PERMISSION_DENIED';
}

test('firestore.rules file exists and contains all mandatory Eight-Pillar gates', () => {
  const rulesText = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');
  assert.match(rulesText, /rules_version = '2';/);
  assert.match(rulesText, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(rulesText, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesText, /isValidUserPublicProfile\(incoming\(\), userId\)/);
  assert.match(rulesText, /isValidUserPrivateAccount\(incoming\(\), userId\)/);
  assert.match(rulesText, /isValidOnlineLobby\(incoming\(\), lobbyId\)/);
  assert.match(rulesText, /isValidLobbyMember\(incoming\(\), lobbyId, memberUid\)/);
  assert.match(rulesText, /existing\(\)\.status != 'finished'/);
  assert.match(rulesText, /allow list: if isSignedIn\(\)\s*&& \(existing\(\)\.visibility == 'public' \|\| existing\(\)\.hostUid == request\.auth\.uid\);/);
  assert.match(rulesText, /match \/users\/\{userId\}\/private\/\{docId\}/);
});

test('Dirty Dozen #1-6: User profile PII, verification, UID spoofing, shadow fields, and scraping are denied', () => {
  // 1. Unauthenticated profile read
  assert.equal(evaluateRulePolicy('get', ['users', 'u1', 'public', 'profile'], null, null, null), 'PERMISSION_DENIED');

  // 2. Cross-user PII read
  assert.equal(
    evaluateRulePolicy('get', ['users', 'u1', 'private', 'account'], { uid: 'u2', emailVerified: true }, null, null),
    'PERMISSION_DENIED',
  );

  const validProfile = {
    uid: 'u1',
    displayName: 'AquaHero',
    preferredTeam: 'hero',
    avatarTag: 'AH',
    matchesPlayed: 0,
    wins: 0,
    roundsWon: 0,
    createdAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
  };

  // 3. Unverified email write
  assert.equal(
    evaluateRulePolicy('create', ['users', 'u1', 'public', 'profile'], { uid: 'u1', emailVerified: false }, validProfile, null),
    'PERMISSION_DENIED',
  );

  // 4. UID spoofing on create
  assert.equal(
    evaluateRulePolicy('create', ['users', 'u1', 'public', 'profile'], { uid: 'u2', emailVerified: true }, validProfile, null),
    'PERMISSION_DENIED',
  );

  // 5. Shadow field injection
  assert.equal(
    evaluateRulePolicy(
      'create',
      ['users', 'u1', 'public', 'profile'],
      { uid: 'u1', emailVerified: true },
      { ...validProfile, isAdmin: true },
      null,
    ),
    'PERMISSION_DENIED',
  );

  // 6. Public profile list scraping
  assert.equal(
    evaluateRulePolicy('list', ['users', 'u1', 'public', 'profile'], { uid: 'u2', emailVerified: true }, null, validProfile),
    'PERMISSION_DENIED',
  );
});

test('Dirty Dozen #7-12: Lobby timestamp spoofing, friend lobby scraping, hijack, terminal lock, member hijack, ID poisoning', () => {
  const validLobby = {
    code: 'ABC123',
    hostUid: 'u1',
    hostName: 'AquaHero',
    title: 'Squad Night',
    mode: '2v2',
    visibility: 'friends',
    status: 'waiting',
    maxPlayers: 4,
    memberCount: 1,
    createdAt: SERVER_TIME,
    updatedAt: SERVER_TIME,
  };

  // 7. Fake timestamp spoofing
  assert.equal(
    evaluateRulePolicy(
      'create',
      ['lobbies', 'ABC123'],
      { uid: 'u1', emailVerified: true },
      { ...validLobby, createdAt: '2020-01-01T00:00:00Z' },
      null,
    ),
    'PERMISSION_DENIED',
  );

  // 8. Private friend lobby scraping by non-host
  assert.equal(
    evaluateRulePolicy('list', ['lobbies', 'ABC123'], { uid: 'u2', emailVerified: true }, null, validLobby),
    'PERMISSION_DENIED',
  );

  // 9. Non-host lobby hijack (changing status)
  assert.equal(
    evaluateRulePolicy(
      'update',
      ['lobbies', 'ABC123'],
      { uid: 'u2', emailVerified: true },
      { ...validLobby, status: 'in_match' },
      validLobby,
    ),
    'PERMISSION_DENIED',
  );

  // 10. Terminal state mutation
  assert.equal(
    evaluateRulePolicy(
      'update',
      ['lobbies', 'ABC123'],
      { uid: 'u1', emailVerified: true },
      { ...validLobby, status: 'waiting' },
      { ...validLobby, status: 'finished' },
    ),
    'PERMISSION_DENIED',
  );

  // 11. Member hijack
  assert.equal(
    evaluateRulePolicy(
      'update',
      ['lobbies', 'ABC123', 'members', 'u1'],
      { uid: 'u2', emailVerified: true },
      { team: 'villain' },
      { team: 'hero' },
      validLobby,
    ),
    'PERMISSION_DENIED',
  );

  // 12. Resource / ID poisoning
  assert.equal(
    evaluateRulePolicy(
      'create',
      ['lobbies', 'THIS_ID_IS_WAY_TOO_LONG_AND_INVALID'],
      { uid: 'u1', emailVerified: true },
      { ...validLobby, code: 'THIS_ID_IS_WAY_TOO_LONG_AND_INVALID', title: 'X'.repeat(50000) },
      null,
    ),
    'PERMISSION_DENIED',
  );
});
