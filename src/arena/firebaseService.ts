import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { getMatchModeConfig, MatchModeId } from './matchConfig';
import { TrooperRole } from './trooperBuilder';
import {
  deriveAvatarTag,
  deriveFallbackDisplayName,
  generateLobbyCode,
  normalizeLobbyCode,
  sanitizeDisplayNameInput,
  validateDisplayName,
  validateLobbyCode,
  validateLobbyTitle,
} from './accountValidation';

export type LobbyVisibility = 'public' | 'friends';
export type LobbyStatus = 'waiting' | 'in_match' | 'finished';

export interface UserPublicProfile {
  uid: string;
  displayName: string;
  preferredTeam: TrooperRole;
  avatarTag: string;
  matchesPlayed: number;
  wins: number;
  roundsWon: number;
  bestScore?: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface UserPrivateAccount {
  uid: string;
  email: string;
  authProvider: 'google' | 'password';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface OnlineLobby {
  code: string;
  hostUid: string;
  hostName: string;
  title: string;
  mode: MatchModeId;
  visibility: LobbyVisibility;
  status: LobbyStatus;
  maxPlayers: number;
  memberCount: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface LobbyMember {
  lobbyCode: string;
  uid: string;
  displayName: string;
  team: TrooperRole;
  ready: boolean;
  isHost: boolean;
  joinedAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export function formatFirebaseAuthError(err: unknown): {
  message: string;
  needsConsoleEmailEnable?: boolean;
} {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/operation-not-allowed') {
    return {
      needsConsoleEmailEnable: true,
      message:
        'Email/Password sign-in is not yet enabled in your Firebase Console (Authentication → Sign-in method → Email/Password). Enable it there or click "Continue with Google" below for instant access.',
    };
  }
  if (code === 'auth/email-already-in-use') {
    return { message: 'An account with this email already exists. Switch to Log In.' };
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return { message: 'Incorrect email or password.' };
  }
  if (code === 'auth/weak-password') {
    return { message: 'Password must be at least 6 characters.' };
  }
  if (code === 'auth/popup-closed-by-user') {
    return { message: 'Google Sign-In popup was closed before completing login.' };
  }
  if (code === 'auth/popup-blocked') {
    return { message: 'Browser blocked the sign-in popup. Please allow popups for this site and try again.' };
  }
  if (code === 'auth/unauthorized-domain') {
    return {
      message:
        'This domain is not authorized for Google Sign-In in Firebase Console (Authentication → Settings → Authorized domains).',
    };
  }
  return { message: msg.replace(/^Firebase:\s*/i, '') || 'Authentication failed.' };
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  if (cred.user.emailVerified) {
    await ensureUserProfileDocs(cred.user);
  }
  return cred.user;
}

export async function signUpWithEmailPassword(
  email: string,
  password: string,
  desiredName: string,
): Promise<User> {
  const cleanName = sanitizeDisplayNameInput(desiredName) || deriveFallbackDisplayName(email, null);
  const nameErr = validateDisplayName(cleanName);
  if (nameErr) throw new Error(nameErr);

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(cred.user, { displayName: cleanName });
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function signInWithEmailPassword(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (cred.user.emailVerified) {
    await ensureUserProfileDocs(cred.user);
  }
  return cred.user;
}

export async function resendVerificationEmail(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function refreshVerifiedUser(user: User): Promise<User> {
  await reload(user);
  const refreshed = auth.currentUser ?? user;
  if (refreshed.emailVerified) {
    await ensureUserProfileDocs(refreshed);
  }
  return refreshed;
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserProfileDocs(
  user: User,
  preferredTeam: TrooperRole = 'hero',
): Promise<UserPublicProfile | null> {
  if (!user.emailVerified) return null;

  const publicPath = `users/${user.uid}/public/profile`;
  const privatePath = `users/${user.uid}/private/account`;
  const publicRef = doc(db, 'users', user.uid, 'public', 'profile');
  const privateRef = doc(db, 'users', user.uid, 'private', 'account');

  const safeName = deriveFallbackDisplayName(user.email, user.displayName);
  const providerId = user.providerData.some((p) => p.providerId === 'google.com')
    ? 'google'
    : 'password';
  const safeEmail = (user.email ?? `${user.uid}@saveit.local`).slice(0, 120);

  let existingPublic: UserPublicProfile | null = null;
  try {
    const snap = await getDoc(publicRef);
    if (snap.exists()) {
      existingPublic = snap.data() as UserPublicProfile;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }

  let hasPrivate = false;
  try {
    const privSnap = await getDoc(privateRef);
    hasPrivate = privSnap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, privatePath);
  }

  if (!existingPublic) {
    const freshPublic: UserPublicProfile = {
      uid: user.uid,
      displayName: safeName,
      preferredTeam,
      avatarTag: deriveAvatarTag(safeName),
      matchesPlayed: 0,
      wins: 0,
      roundsWon: 0,
      bestScore: 0,
    };
    try {
      await setDoc(publicRef, {
        ...freshPublic,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, publicPath);
    }
    existingPublic = freshPublic;
  }

  if (!hasPrivate) {
    try {
      await setDoc(privateRef, {
        uid: user.uid,
        email: safeEmail,
        authProvider: providerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, privatePath);
    }
  }

  return existingPublic;
}

export function subscribeMyPublicProfile(
  uid: string,
  onData: (profile: UserPublicProfile | null) => void,
): () => void {
  const path = `users/${uid}/public/profile`;
  const ref = doc(db, 'users', uid, 'public', 'profile');
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? (snap.data() as UserPublicProfile) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export async function updateMyPublicProfile(
  uid: string,
  patch: { displayName?: string; preferredTeam?: TrooperRole },
): Promise<void> {
  const path = `users/${uid}/public/profile`;
  const ref = doc(db, 'users', uid, 'public', 'profile');
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (patch.displayName !== undefined) {
    const clean = sanitizeDisplayNameInput(patch.displayName);
    const err = validateDisplayName(clean);
    if (err) throw new Error(err);
    payload.displayName = clean;
    payload.avatarTag = deriveAvatarTag(clean);
  }
  if (patch.preferredTeam !== undefined) {
    payload.preferredTeam = patch.preferredTeam;
  }

  try {
    await updateDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordOnlineMatchResult(
  uid: string,
  didWinSeries: boolean,
  roundsWonDelta: number,
  territoryScorePct = 0,
): Promise<UserPublicProfile | null> {
  const path = `users/${uid}/public/profile`;
  const ref = doc(db, 'users', uid, 'public', 'profile');
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const prev = snap.data() as UserPublicProfile;
    const nextMatches = Math.min(1000000, (prev.matchesPlayed ?? 0) + 1);
    const nextWins = Math.min(nextMatches, (prev.wins ?? 0) + (didWinSeries ? 1 : 0));
    const nextRounds = Math.min(
      5000000,
      (prev.roundsWon ?? 0) + Math.max(0, Math.floor(roundsWonDelta)),
    );
    const safeScore = Math.round(Math.max(0, Math.min(100, territoryScorePct)) * 10) / 10;
    const nextBestScore = Math.max(prev.bestScore ?? 0, safeScore);
    await updateDoc(ref, {
      matchesPlayed: nextMatches,
      wins: nextWins,
      roundsWon: nextRounds,
      bestScore: nextBestScore,
      updatedAt: serverTimestamp(),
    });
    return {
      ...prev,
      matchesPlayed: nextMatches,
      wins: nextWins,
      roundsWon: nextRounds,
      bestScore: nextBestScore,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createOnlineLobby(params: {
  hostUid: string;
  hostName: string;
  title: string;
  mode: MatchModeId;
  visibility: LobbyVisibility;
  team: TrooperRole;
}): Promise<string> {
  const titleClean = params.title.trim().slice(0, 40);
  const titleErr = validateLobbyTitle(titleClean);
  if (titleErr) throw new Error(titleErr);

  const safeHostName = deriveFallbackDisplayName(null, params.hostName);
  const maxPlayers = getMatchModeConfig(params.mode).teamSize * 2;

  let code = generateLobbyCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existingSnap = await getDoc(doc(db, 'lobbies', code)).catch((error) =>
      handleFirestoreError(error, OperationType.GET, `lobbies/${code}`),
    );
    if (!existingSnap.exists()) break;
    code = generateLobbyCode();
  }

  const lobbyRef = doc(db, 'lobbies', code);
  const memberRef = doc(db, 'lobbies', code, 'members', params.hostUid);
  const batch = writeBatch(db);

  batch.set(lobbyRef, {
    code,
    hostUid: params.hostUid,
    hostName: safeHostName,
    title: titleClean,
    mode: params.mode,
    visibility: params.visibility,
    status: 'waiting',
    maxPlayers,
    memberCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(memberRef, {
    lobbyCode: code,
    uid: params.hostUid,
    displayName: safeHostName,
    team: params.team,
    ready: true,
    isHost: true,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `lobbies/${code}`);
  }

  return code;
}

export async function joinLobbyByCode(
  rawCode: string,
  member: { uid: string; displayName: string; team: TrooperRole },
): Promise<OnlineLobby> {
  const code = normalizeLobbyCode(rawCode);
  const codeErr = validateLobbyCode(code);
  if (codeErr) throw new Error(codeErr);

  const lobbyPath = `lobbies/${code}`;
  const lobbyRef = doc(db, 'lobbies', code);
  let lobbySnap;
  try {
    lobbySnap = await getDoc(lobbyRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, lobbyPath);
  }

  if (!lobbySnap.exists()) {
    throw new Error(`Lobby "${code}" was not found. Double-check the 6-character invite code.`);
  }

  const lobby = lobbySnap.data() as OnlineLobby;
  if (lobby.status === 'finished') {
    throw new Error(`Lobby "${code}" has already finished.`);
  }

  const memberRef = doc(db, 'lobbies', code, 'members', member.uid);
  const existingMemberSnap = await getDoc(memberRef).catch((error) =>
    handleFirestoreError(error, OperationType.GET, `${lobbyPath}/members/${member.uid}`),
  );

  const safeName = deriveFallbackDisplayName(null, member.displayName);

  if (!existingMemberSnap.exists()) {
    if (lobby.memberCount >= lobby.maxPlayers) {
      throw new Error(`Lobby "${code}" is full (${lobby.memberCount}/${lobby.maxPlayers} players).`);
    }

    const batch = writeBatch(db);
    batch.set(memberRef, {
      lobbyCode: code,
      uid: member.uid,
      displayName: safeName,
      team: member.team,
      ready: false,
      isHost: lobby.hostUid === member.uid,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.update(lobbyRef, {
      memberCount: Math.min(lobby.maxPlayers, lobby.memberCount + 1),
      updatedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${lobbyPath}/members/${member.uid}`);
    }
  }

  return lobby;
}

export async function updateLobbyMemberState(
  lobbyCode: string,
  uid: string,
  patch: { team?: TrooperRole; ready?: boolean; displayName?: string },
): Promise<void> {
  const path = `lobbies/${lobbyCode}/members/${uid}`;
  const ref = doc(db, 'lobbies', lobbyCode, 'members', uid);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.team !== undefined) payload.team = patch.team;
  if (patch.ready !== undefined) payload.ready = patch.ready;
  if (patch.displayName !== undefined) {
    payload.displayName = deriveFallbackDisplayName(null, patch.displayName);
  }
  try {
    await updateDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateLobbyHostConfig(
  lobbyCode: string,
  patch: {
    title?: string;
    mode?: MatchModeId;
    visibility?: LobbyVisibility;
    status?: LobbyStatus;
  },
): Promise<void> {
  const path = `lobbies/${lobbyCode}`;
  const ref = doc(db, 'lobbies', lobbyCode);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (patch.title !== undefined) {
    const titleErr = validateLobbyTitle(patch.title);
    if (titleErr) throw new Error(titleErr);
    payload.title = patch.title.trim().slice(0, 40);
  }
  if (patch.mode !== undefined) {
    payload.mode = patch.mode;
    payload.maxPlayers = getMatchModeConfig(patch.mode).teamSize * 2;
  }
  if (patch.visibility !== undefined) payload.visibility = patch.visibility;
  if (patch.status !== undefined) payload.status = patch.status;

  try {
    await updateDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function leaveOnlineLobby(
  lobbyCode: string,
  uid: string,
  currentMemberCount: number,
  isHost: boolean,
): Promise<void> {
  const lobbyPath = `lobbies/${lobbyCode}`;
  const lobbyRef = doc(db, 'lobbies', lobbyCode);
  const memberRef = doc(db, 'lobbies', lobbyCode, 'members', uid);
  const batch = writeBatch(db);

  batch.delete(memberRef);
  if (isHost) {
    batch.update(lobbyRef, {
      status: 'finished',
      memberCount: Math.max(0, currentMemberCount - 1),
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.update(lobbyRef, {
      memberCount: Math.max(0, currentMemberCount - 1),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, lobbyPath);
  }
}

export function subscribePublicLobbies(
  onData: (lobbies: OnlineLobby[]) => void,
): () => void {
  const path = 'lobbies';
  const q = query(
    collection(db, 'lobbies'),
    where('visibility', '==', 'public'),
    where('status', '==', 'waiting'),
    limit(20),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as OnlineLobby)
        .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}

export function subscribeLobby(
  lobbyCode: string,
  onData: (lobby: OnlineLobby | null) => void,
): () => void {
  const path = `lobbies/${lobbyCode}`;
  return onSnapshot(
    doc(db, 'lobbies', lobbyCode),
    (snap) => {
      onData(snap.exists() ? (snap.data() as OnlineLobby) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    },
  );
}

export function subscribeLobbyMembers(
  lobbyCode: string,
  onData: (members: LobbyMember[]) => void,
): () => void {
  const path = `lobbies/${lobbyCode}/members`;
  return onSnapshot(
    collection(db, 'lobbies', lobbyCode, 'members'),
    (snap) => {
      const list = snap.docs
        .map((d) => d.data() as LobbyMember)
        .sort((a, b) => {
          if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
          return (a.joinedAt?.toMillis() ?? 0) - (b.joinedAt?.toMillis() ?? 0);
        });
      onData(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    },
  );
}
