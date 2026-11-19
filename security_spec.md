# Save It Multiplayer — Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: User emails live exclusively at `/users/{userId}/private/account` and may only be read or written by `request.auth.uid == userId`. Public trooper handles and aggregate match stats live separately at `/users/{userId}/public/profile`.
2. **Verified Identity & Anti-Spoofing**: All writes require `request.auth != null && request.auth.token.email_verified == true`. Any `uid` or `hostUid` field written on creation must strictly equal `request.auth.uid`, and immutable identity/timestamp fields (`uid`, `hostUid`, `code`, `createdAt`, `joinedAt`) cannot be altered after creation.
3. **Host-Only Room Authority & Lifecycle Locking**: Only `hostUid` may change a lobby's `status` (`waiting` → `in_match` → `finished`), `mode`, or `title`, and once `status == 'finished'`, no further updates are permitted.
4. **Master Gate Subcollection Sync**: A `LobbyMember` document under `/lobbies/{lobbyId}/members/{memberUid}` cannot exist unless `/lobbies/{lobbyId}` exists and is not `finished`, and `lobbyCode` must strictly equal `{lobbyId}`.
5. **Private Friend Lobby Protection**: `allow list` on `/lobbies` only exposes documents where `visibility == 'public' || hostUid == request.auth.uid`, preventing scraping of private friend lobbies while permitting direct `get` by 6-character invite code.
6. **Strict Schema & Bounds**: Every write validates required + allowed keys (`hasAll` + `hasOnly` on create, `affectedKeys().hasOnly(...)` on update), strict `.size()` bounds, regex ID checks, and server timestamps (`request.time`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return `PERMISSION_DENIED`)
1. **Unauthenticated Profile Read**: Unauthenticated client attempts `get /users/u1/public/profile` → Denied (`request.auth != null` fails).
2. **Cross-User PII Read**: Signed-in user `u2` attempts `get /users/u1/private/account` → Denied (`userId == request.auth.uid` fails).
3. **Unverified Email Write**: Signed-in user with `email_verified: false` attempts `create /users/u1/public/profile` → Denied (`email_verified == true` fails).
4. **UID Spoofing on Profile Create**: User `u2` creates `/users/u1/public/profile` or sets `data.uid = 'u1'` → Denied (`uid == request.auth.uid` & `isOwner` fail).
5. **Shadow / Ghost Field Injection**: User `u1` creates profile with extra `{ isAdmin: true }` → Denied (`keys().hasOnly(...)` fails).
6. **Public Profile List Scraping**: Signed-in user attempts `list /users/u1/public` → Denied (`allow list: if false`).
7. **Fake Timestamp Spoofing**: User `u1` creates lobby with backdated `createdAt` instead of `request.time` → Denied (`createdAt == request.time` fails).
8. **Private Friend Lobby Scraping**: Non-host `u2` queries `list /lobbies` without filtering `visibility == 'public'` (hitting a `'friends'` lobby) → Denied (`resource.data.visibility == 'public' || resource.data.hostUid == request.auth.uid` fails).
9. **Non-Host Lobby Hijack**: Player `u2` updates lobby `hostUid` or `status: 'in_match'` on a lobby hosted by `u1` → Denied (Host action gate fails).
10. **Terminal State Mutation**: Host `u1` attempts to revert a `finished` lobby back to `waiting` → Denied (`existing().status != 'finished'` fails).
11. **Member Team Hijack**: Player `u2` tries to update `/lobbies/ABC123/members/u1` → Denied (`memberUid == request.auth.uid` fails).
12. **Resource / ID Poisoning**: Attacker writes `/lobbies/THIS_ID_IS_WAY_TOO_LONG_AND_INVALID` or injects a 50KB `title` → Denied (`isValidLobbyId` & `title.size() <= 40` fail).
