import { FormEvent, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  createOnlineLobby,
  joinLobbyByCode,
  leaveOnlineLobby,
  LobbyMember,
  LobbyVisibility,
  OnlineLobby,
  subscribeLobby,
  subscribeLobbyMembers,
  subscribePublicLobbies,
  updateLobbyHostConfig,
  updateLobbyMemberState,
  UserPublicProfile,
} from '../arena/firebaseService';
import { MATCH_MODES, MatchModeId } from '../arena/matchConfig';
import { TrooperRole } from '../arena/trooperBuilder';
import { normalizeLobbyCode } from '../arena/accountValidation';
import { arenaSound } from '../arena/soundFx';

interface MultiplayerHubModalProps {
  open: boolean;
  authReady: boolean;
  authUser: User | null;
  profile: UserPublicProfile | null;
  defaultTeam: TrooperRole;
  defaultMode: MatchModeId;
  activeLobbyCode: string | null;
  onSetActiveLobbyCode: (code: string | null) => void;
  onOpenAuth: () => void;
  onLaunchOnlineMatch: (lobby: OnlineLobby, members: LobbyMember[]) => void;
  onClose: () => void;
}

export function MultiplayerHubModal({
  open,
  authReady,
  authUser,
  profile,
  defaultTeam,
  defaultMode,
  activeLobbyCode,
  onSetActiveLobbyCode,
  onOpenAuth,
  onLaunchOnlineMatch,
  onClose,
}: MultiplayerHubModalProps) {
  const [roomTitle, setRoomTitle] = useState(() =>
    profile?.displayName ? `${profile.displayName}'s Squad` : 'Squad Battle',
  );
  const [createMode, setCreateMode] = useState<MatchModeId>(defaultMode);
  const [visibility, setVisibility] = useState<LobbyVisibility>('friends');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [publicLobbies, setPublicLobbies] = useState<OnlineLobby[]>([]);
  const [activeLobby, setActiveLobby] = useState<OnlineLobby | null>(null);
  const [members, setMembers] = useState<LobbyMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);

  const isVerifiedSignedIn = Boolean(authReady && authUser && authUser.emailVerified);
  const displayName = profile?.displayName || authUser?.displayName || 'Trooper';

  useEffect(() => {
    if (profile?.displayName) {
      setRoomTitle((prev) =>
        prev === 'Squad Battle' ? `${profile.displayName}'s Squad` : prev,
      );
    }
  }, [profile?.displayName]);

  // Only attach onSnapshot listeners when authReady && user && verified
  useEffect(() => {
    if (!open || !isVerifiedSignedIn) {
      setPublicLobbies([]);
      return;
    }
    const unsub = subscribePublicLobbies((list) => setPublicLobbies(list));
    return () => unsub();
  }, [open, isVerifiedSignedIn]);

  useEffect(() => {
    if (!isVerifiedSignedIn || !activeLobbyCode) {
      setActiveLobby(null);
      setMembers([]);
      return;
    }
    const unsubLobby = subscribeLobby(activeLobbyCode, (lobby) => {
      setActiveLobby(lobby);
    });
    const unsubMembers = subscribeLobbyMembers(activeLobbyCode, (list) => {
      setMembers(list);
    });
    return () => {
      unsubLobby();
      unsubMembers();
    };
  }, [isVerifiedSignedIn, activeLobbyCode]);

  // Synchronously launch into 3D online arena as soon as host sets status -> 'in_match'
  useEffect(() => {
    if (!activeLobby || !authUser || !isVerifiedSignedIn) return;
    if (activeLobby.status === 'in_match') {
      onLaunchOnlineMatch(activeLobby, members);
    }
  }, [activeLobby, members, authUser, isVerifiedSignedIn, onLaunchOnlineMatch]);

  if (!open) return null;

  const handleCreateLobby = async (e: FormEvent) => {
    e.preventDefault();
    if (!authUser) return;
    arenaSound.playUiClick();
    setBusy(true);
    setErrorMsg(null);
    try {
      const code = await createOnlineLobby({
        hostUid: authUser.uid,
        hostName: displayName,
        title: roomTitle,
        mode: createMode,
        visibility,
        team: defaultTeam,
      });
      onSetActiveLobbyCode(code);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create lobby.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinCode = async (rawCode: string) => {
    if (!authUser) return;
    arenaSound.playUiClick();
    setBusy(true);
    setErrorMsg(null);
    try {
      const joined = await joinLobbyByCode(rawCode, {
        uid: authUser.uid,
        displayName,
        team: defaultTeam,
      });
      onSetActiveLobbyCode(joined.code);
      setJoinCodeInput('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not join lobby.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveLobby = async () => {
    if (!authUser || !activeLobby) return;
    arenaSound.playUiClick();
    setBusy(true);
    try {
      await leaveOnlineLobby(
        activeLobby.code,
        authUser.uid,
        activeLobby.memberCount,
        activeLobby.hostUid === authUser.uid,
      );
      onSetActiveLobbyCode(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to leave lobby.');
    } finally {
      setBusy(false);
    }
  };

  const myMember = members.find((m) => m.uid === authUser?.uid);
  const isHost = Boolean(activeLobby && authUser && activeLobby.hostUid === authUser.uid);

  const handleCopyInvite = async () => {
    if (!activeLobby) return;
    arenaSound.playUiClick();
    const url = `${window.location.origin}/?lobby=${activeLobby.code}`;
    try {
      await navigator.clipboard.writeText(`${activeLobby.code} (${url})`);
      setCopiedNotice(true);
      window.setTimeout(() => setCopiedNotice(false), 2000);
    } catch {
      setCopiedNotice(false);
    }
  };

  const handleStartOnlineMatch = async () => {
    if (!activeLobby || !isHost) return;
    arenaSound.playUiClick();
    setBusy(true);
    setErrorMsg(null);
    try {
      await updateLobbyHostConfig(activeLobby.code, { status: 'in_match' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not launch online match.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Online Multiplayer and Friend Lobbies"
      data-testid="multiplayer-hub-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(6,8,13,0.90)] p-4 text-[#f6f1e9]"
    >
      <div className="w-full max-w-[760px] max-h-[90vh] overflow-y-auto rounded-2xl border border-white/20 bg-[linear-gradient(160deg,rgba(24,27,36,0.99),rgba(13,15,21,0.99))] p-6 shadow-[0_28px_80px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#38efff]">
              Online Multiplayer · Friend Lobbies
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-wide text-white">
              {activeLobby ? activeLobby.title : 'Create or Join Online Arena'}
            </h2>
          </div>
          <button
            type="button"
            data-testid="mp-close-btn"
            onClick={() => {
              arenaSound.playUiClick();
              onClose();
            }}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white"
          >
            Back to Lobby
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-400/40 bg-red-950/60 px-4 py-2.5 text-xs text-red-100"
          >
            {errorMsg}
          </div>
        )}

        {/* Gate when not signed in or unverified */}
        {!isVerifiedSignedIn ? (
          <div className="mt-6 rounded-xl border border-cyan-400/30 bg-cyan-950/25 p-6 text-center">
            <h3 className="font-display text-xl font-bold text-white">
              {authUser ? 'Verify Your Email to Play Online' : 'Sign In Required for Online Play'}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-300">
              Create your Save It account or log in with Google so friends can see your Trooper
              handle, invite you to private lobbies, and track your career wins in Firebase.
            </p>
            <button
              type="button"
              data-testid="mp-open-auth-btn"
              onClick={() => {
                arenaSound.playUiClick();
                onOpenAuth();
              }}
              className="mt-4 rounded-xl bg-[linear-gradient(100deg,#30f0ff,#ffd147)] px-6 py-2.5 font-display text-sm font-black uppercase tracking-[0.1em] text-[#09131a] hover:brightness-110"
            >
              {authUser ? 'Check Verification / Switch to Google' : 'Sign Up or Log In'}
            </button>
          </div>
        ) : activeLobby ? (
          /* STAGING ROOM INSIDE AN ACTIVE LOBBY */
          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-cyan-400/35 bg-[rgba(10,32,44,0.65)] p-4">
              <div>
                <div className="text-[10px] font-bold tracking-[0.18em] uppercase text-cyan-200">
                  {activeLobby.visibility === 'friends'
                    ? 'Private Friend Lobby Code'
                    : 'Public Room Code'}
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <span
                    data-testid="active-lobby-code"
                    className="font-display text-3xl font-black tracking-[0.22em] text-[#38efff]"
                  >
                    {activeLobby.code}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyInvite}
                    className="rounded-lg border border-cyan-300/40 bg-cyan-400/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/25"
                  >
                    {copiedNotice ? 'Copied!' : 'Copy Invite'}
                  </button>
                </div>
              </div>

              <div className="text-right text-xs text-slate-300">
                <div className="font-bold uppercase tracking-wider text-white">
                  {activeLobby.mode} · {members.length}/{activeLobby.maxPlayers} Humans
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  Open slots fill automatically with AI troopers
                </div>
              </div>
            </div>

            {/* Player Roster */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(['hero', 'villain'] as TrooperRole[]).map((teamKey) => {
                const teamMembers = members.filter((m) => m.team === teamKey);
                const isHeroTeam = teamKey === 'hero';
                return (
                  <div
                    key={teamKey}
                    className={`rounded-xl border p-3.5 ${
                      isHeroTeam
                        ? 'border-cyan-400/30 bg-[rgba(8,36,52,0.55)]'
                        : 'border-orange-400/30 bg-[rgba(52,20,10,0.55)]'
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span
                        className={`font-display text-sm font-bold uppercase tracking-wider ${
                          isHeroTeam ? 'text-[#5eeeff]' : 'text-[#ff9c63]'
                        }`}
                      >
                        {isHeroTeam ? 'Heroes · Water' : 'Villains · Fire'}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-300">
                        {teamMembers.length} Joined
                      </span>
                    </div>

                    <div className="mt-2.5 space-y-2">
                      {teamMembers.length === 0 ? (
                        <p className="text-xs italic text-slate-400">AI squad bots on standby</p>
                      ) : (
                        teamMembers.map((m) => (
                          <div
                            key={m.uid}
                            className="flex items-center justify-between rounded-lg bg-black/35 px-3 py-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-bold text-white truncate">
                                {m.displayName}
                              </span>
                              {m.isHost && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                                  Host
                                </span>
                              )}
                            </div>
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider ${
                                m.ready ? 'text-emerald-300' : 'text-slate-400'
                              }`}
                            >
                              {m.ready ? 'Ready' : 'Waiting'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Member & Host Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              <div className="flex flex-wrap items-center gap-2">
                {myMember && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setErrorMsg(null);
                        void updateLobbyMemberState(activeLobby.code, myMember.uid, {
                          team: myMember.team === 'hero' ? 'villain' : 'hero',
                        }).catch((err) =>
                          setErrorMsg(err instanceof Error ? err.message : 'Failed to switch team.'),
                        );
                      }}
                      className="rounded-lg border border-white/20 bg-white/5 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-slate-100 hover:bg-white/10"
                    >
                      Switch to {myMember.team === 'hero' ? 'Villain' : 'Hero'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setErrorMsg(null);
                        void updateLobbyMemberState(activeLobby.code, myMember.uid, {
                          ready: !myMember.ready,
                        }).catch((err) =>
                          setErrorMsg(err instanceof Error ? err.message : 'Failed to update ready status.'),
                        );
                      }}
                      className={`rounded-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wider ${
                        myMember.ready
                          ? 'border border-emerald-400/50 bg-emerald-500/20 text-emerald-200'
                          : 'border border-white/20 bg-white/10 text-white'
                      }`}
                    >
                      {myMember.ready ? 'Ready ✓' : 'Mark Ready'}
                    </button>
                  </>
                )}

                {isHost && (
                  <select
                    aria-label="Lobby match mode"
                    value={activeLobby.mode}
                    onChange={(e) => {
                      setErrorMsg(null);
                      void updateLobbyHostConfig(activeLobby.code, {
                        mode: e.target.value as MatchModeId,
                      }).catch((err) =>
                        setErrorMsg(err instanceof Error ? err.message : 'Failed to update mode.'),
                      );
                    }}
                    className="rounded-lg border border-white/20 bg-black/50 px-3 py-2 text-xs font-bold text-white focus:border-cyan-400 focus:outline-none"
                  >
                    {MATCH_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.gridLabel})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleLeaveLobby}
                  className="rounded-lg border border-red-400/35 bg-red-500/15 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-red-200 hover:bg-red-500/25"
                >
                  {isHost ? 'Close Room' : 'Leave Room'}
                </button>

                {isHost ? (
                  <button
                    type="button"
                    data-testid="launch-online-match-btn"
                    disabled={busy}
                    onClick={handleStartOnlineMatch}
                    className="rounded-xl bg-[linear-gradient(100deg,#30f0ff_0%,#85e6be_44%,#ffd147_100%)] px-6 py-2.5 font-display text-sm font-black uppercase tracking-[0.1em] text-[#09131a] shadow-[0_10px_28px_rgba(48,240,255,0.35)] hover:brightness-110 disabled:opacity-50"
                  >
                    Launch Online Match
                  </button>
                ) : (
                  <span className="text-xs font-semibold text-cyan-200">
                    Waiting for host {activeLobby.hostName} to launch...
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* BROWSE PUBLIC ROOMS / JOIN BY CODE / CREATE FRIEND LOBBY */
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Column: Create Custom Lobby */}
            <form
              onSubmit={handleCreateLobby}
              className="flex flex-col justify-between rounded-xl border border-white/15 bg-black/35 p-4 space-y-3.5"
            >
              <div className="space-y-3">
                <h3 className="font-display text-base font-bold uppercase tracking-wider text-[#ffd147]">
                  Create Your Lobby
                </h3>

                <div>
                  <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-slate-300">
                    Room Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    data-testid="create-lobby-title"
                    value={roomTitle}
                    onChange={(e) => setRoomTitle(e.target.value)}
                    placeholder="Friday Squad"
                    className="mt-1 w-full rounded-lg border border-white/20 bg-black/50 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-slate-300">
                    Team Size
                  </label>
                  <div className="mt-1 grid grid-cols-4 gap-1.5">
                    {MATCH_MODES.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCreateMode(m.id)}
                        className={`rounded-lg py-1.5 text-xs font-bold border transition-colors ${
                          createMode === m.id
                            ? 'border-amber-400 bg-amber-400/20 text-amber-100'
                            : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-slate-300">
                    Lobby Privacy
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibility('friends')}
                      className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                        visibility === 'friends'
                          ? 'border-cyan-400 bg-cyan-400/15 text-cyan-100'
                          : 'border-white/15 bg-white/5 text-slate-300'
                      }`}
                    >
                      <div className="font-bold">Friends Only</div>
                      <div className="text-[10px] opacity-80">Join via 6-char code</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility('public')}
                      className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                        visibility === 'public'
                          ? 'border-cyan-400 bg-cyan-400/15 text-cyan-100'
                          : 'border-white/15 bg-white/5 text-slate-300'
                      }`}
                    >
                      <div className="font-bold">Public Room</div>
                      <div className="text-[10px] opacity-80">Listed for all players</div>
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                data-testid="create-lobby-submit"
                className="w-full rounded-xl bg-[linear-gradient(100deg,#30f0ff_0%,#ffd147_100%)] py-2.5 font-display text-sm font-black uppercase tracking-[0.1em] text-[#09131a] hover:brightness-110 disabled:opacity-50"
              >
                {busy ? 'Creating...' : 'Create Lobby'}
              </button>
            </form>

            {/* Right Column: Join by Friend Code + Open Public Rooms */}
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-white/15 bg-black/35 p-4">
                <h3 className="font-display text-base font-bold uppercase tracking-wider text-[#5eeeff]">
                  Join Friend by Code
                </h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleJoinCode(joinCodeInput);
                  }}
                  className="mt-2.5 flex gap-2"
                >
                  <input
                    type="text"
                    maxLength={6}
                    data-testid="join-code-input"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(normalizeLobbyCode(e.target.value))}
                    placeholder="A7K9P2"
                    className="flex-1 rounded-lg border border-white/20 bg-black/50 px-3 py-2 font-mono text-sm font-bold tracking-[0.22em] uppercase text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || joinCodeInput.length < 6}
                    data-testid="join-code-submit"
                    className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-black uppercase tracking-wider text-[#08161d] hover:brightness-110 disabled:opacity-45"
                  >
                    Join
                  </button>
                </form>
              </div>

              <div className="flex-1 rounded-xl border border-white/15 bg-black/35 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider text-slate-200">
                    Public Online Rooms
                  </h3>
                  <span className="text-[11px] text-slate-400">{publicLobbies.length} Open</span>
                </div>

                <div className="mt-2.5 space-y-2 max-h-[210px] overflow-y-auto pr-1">
                  {publicLobbies.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-400">
                      No public lobbies open right now. Create one or enter a friend&apos;s code!
                    </p>
                  ) : (
                    publicLobbies.map((room) => (
                      <div
                        key={room.code}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-white">{room.title}</div>
                          <div className="text-[10px] text-slate-400">
                            Host {room.hostName} · {room.mode} · {room.memberCount}/
                            {room.maxPlayers}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={busy || room.memberCount >= room.maxPlayers}
                          onClick={() => void handleJoinCode(room.code)}
                          className="shrink-0 rounded-lg border border-cyan-400/40 bg-cyan-400/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-400/25 disabled:opacity-40"
                        >
                          {room.memberCount >= room.maxPlayers ? 'Full' : 'Join'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
