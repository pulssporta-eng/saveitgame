import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../firebase';
import {
  ensureUserProfileDocs,
  joinLobbyByCode,
  LobbyMember,
  OnlineLobby,
  recordOnlineMatchResult,
  subscribeMyPublicProfile,
  UserPublicProfile,
} from '../arena/firebaseService';
import {
  ArenaController,
  CAMERA_PRESETS,
  CameraMode,
  CameraPresetId,
  mountSaveItArena,
} from '../arena/SaveItArenaScene';
import {
  formatMatchTimer,
  getCountdownState,
  getLoadingStageLabel,
  getMatchModeConfig,
  MATCH_DURATION_SECONDS,
  MAX_ROUNDS_WITH_TIEBREAKER,
  MatchModeId,
  MatchOutcome,
  MatchPhase,
  RoundOutcome,
  TOTAL_ROUNDS,
} from '../arena/matchConfig';
import {
  formatKeyCode,
  GameSettings,
  loadSettings,
  saveSettings,
} from '../arena/gameSettings';
import {
  QuickPlayClient,
  QuickPlayTicket,
} from '../arena/multiplayerNet';
import { arenaSound } from '../arena/soundFx';
import {
  OnlinePlayerSummary,
  resolveCareerDisplayStats,
} from '../arena/podiumAndRematch';
import { TrooperRole } from '../arena/trooperBuilder';
import { AuthModal } from './AuthModal';
import { LoadingOverlay } from './LoadingOverlay';
import { LobbyOverlay } from './LobbyOverlay';
import { MultiplayerHubModal } from './MultiplayerHubModal';
import { PostMatchOverlay } from './PostMatchOverlay';
import { QuickPlayOverlay } from './QuickPlayOverlay';
import { SettingsModal } from './SettingsModal';

function WaterEmblemIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden="true">
      <path
        d="M12 2.5C12 2.5 5.5 10.2 5.5 14.8C5.5 18.5 8.4 21.5 12 21.5C15.6 21.5 18.5 18.5 18.5 14.8C18.5 10.2 12 2.5 12 2.5Z"
        fill="currentColor"
        stroke="#0a1620"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9.4 14.5C9.4 16.2 10.4 17.6 11.8 18.1"
        fill="none"
        stroke="#e0fbff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FireEmblemIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} aria-hidden="true">
      <path
        d="M12.6 2.3C12.6 2.3 17.5 7.2 17.5 12.2C17.5 13.6 17.0 14.9 16.3 15.9C16.8 14.6 16.4 12.9 15.4 12.0C15.4 12.0 15.1 14.8 13.3 15.8C13.9 13.7 13.1 10.8 11.0 9.0C11.0 9.0 11.2 11.6 9.5 13.2C8.8 12.5 8.5 11.4 8.6 10.4C6.9 11.9 6.2 14.2 6.6 16.4C7.2 19.4 9.6 21.5 12.5 21.5C16.1 21.5 19.0 18.6 19.0 14.6C19.0 9.0 12.6 2.3 12.6 2.3Z"
        fill="currentColor"
        stroke="#1c0b06"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        d="M11 5L6 9H3V15H6L11 19V5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      {muted ? (
        <path
          d="M16 9L21 15M21 9L16 15"
          fill="none"
          stroke="#ff6b57"
          strokeWidth="2"
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

function GrenadeIcon({ role, armed }: { role: TrooperRole; armed: boolean }) {
  const isHero = role === 'hero';
  const fill = armed ? (isHero ? '#3df4ff' : '#ff5218') : '#3b3733';
  const trim = armed ? (isHero ? '#0d3f54' : '#4a180a') : '#221f1c';
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
      <rect x="9.5" y="2.5" width="5" height="3.2" rx="1" fill="#9ca3af" stroke="#0c0a09" strokeWidth="1.2" />
      <circle cx="16.5" cy="4.2" r="2.1" fill="none" stroke={armed ? '#e8bd62' : '#57534e'} strokeWidth="1.5" />
      <path
        d="M7 9.5C7 7.1 9.2 5.6 12 5.6C14.8 5.6 17 7.1 17 9.5V15.4C17 18.6 14.8 21 12 21C9.2 21 7 18.6 7 15.4V9.5Z"
        fill={fill}
        stroke="#0a0908"
        strokeWidth="1.6"
      />
      <rect x="6.4" y="11.2" width="11.2" height="2.6" rx="0.8" fill={trim} stroke="#0a0908" strokeWidth="1" />
      {armed && (
        <path
          d="M9.5 8.5C9.5 7.7 10.6 7.3 11.7 7.3"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function DizzyBombIcon({ armed }: { armed: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 shrink-0" aria-hidden="true">
      <ellipse
        cx="12"
        cy="13"
        rx="8.2"
        ry="3.6"
        transform="rotate(-24 12 13)"
        fill="none"
        stroke={armed ? '#fde047' : '#57534e'}
        strokeWidth="1.4"
      />
      <circle
        cx="12"
        cy="13"
        r="5.2"
        fill={armed ? '#d946ef' : '#3b3733'}
        stroke="#0a0908"
        strokeWidth="1.5"
      />
      <rect x="10.2" y="5.4" width="3.6" height="2.6" rx="0.8" fill="#9ca3af" stroke="#0c0a09" strokeWidth="1.1" />
      <path
        d="M17.8 6.2L18.5 7.9L20.3 8.1L18.9 9.2L19.4 11L17.8 10L16.2 11L16.7 9.2L15.3 8.1L17.1 7.9Z"
        fill={armed ? '#fde047' : '#6b7280'}
      />
    </svg>
  );
}

function FirstPersonCrosshair({
  role,
  empty,
}: {
  role: TrooperRole;
  empty: boolean;
}) {
  const accent = empty ? '#ff5c4d' : role === 'hero' ? '#3cf3ff' : '#ff8a36';
  const outline = 'rgba(10, 10, 10, 0.8)';
  return (
    <div
      aria-label="First-person aiming crosshair"
      className="pointer-events-none fixed left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
    >
      <svg viewBox="0 0 40 40" className="w-10 h-10" aria-hidden="true">
        <circle cx="20" cy="20" r="10.5" fill="none" stroke={outline} strokeWidth="3.2" opacity="0.65" />
        <line x1="20" y1="3" x2="20" y2="11" stroke={outline} strokeWidth="3.4" strokeLinecap="round" />
        <line x1="20" y1="29" x2="20" y2="37" stroke={outline} strokeWidth="3.4" strokeLinecap="round" />
        <line x1="3" y1="20" x2="11" y2="20" stroke={outline} strokeWidth="3.4" strokeLinecap="round" />
        <line x1="29" y1="20" x2="37" y2="20" stroke={outline} strokeWidth="3.4" strokeLinecap="round" />
        <circle
          cx="20"
          cy="20"
          r="10.5"
          fill="none"
          stroke={accent}
          strokeWidth="1.35"
          strokeDasharray={empty ? '3 3' : 'none'}
          opacity={empty ? '0.9' : '0.68'}
        />
        <line x1="20" y1="3.5" x2="20" y2="10.5" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
        <line x1="20" y1="29.5" x2="20" y2="36.5" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
        <line x1="3.5" y1="20" x2="10.5" y2="20" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
        <line x1="29.5" y1="20" x2="36.5" y2="20" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
        <circle cx="20" cy="20" r="1.8" fill={accent} stroke={outline} strokeWidth="0.9" />
      </svg>
    </div>
  );
}

export function ArenaViewport() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ArenaController | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Lobby selection state
  const [selectedTeam, setSelectedTeam] = useState<TrooperRole>('hero');
  const [selectedMode, setSelectedMode] = useState<MatchModeId>('2v2');

  // Firebase Auth, Guest & Multiplayer state
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserPublicProfile | null>(null);
  const [guestProfile, setGuestProfile] = useState<{ uid: string; displayName: string } | null>(
    null,
  );
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [activeLobbyCode, setActiveLobbyCode] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const code = new URLSearchParams(window.location.search).get('lobby');
    return code ? code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : null;
  });
  const [quickPlayOpen, setQuickPlayOpen] = useState(false);
  const [quickPlayTicket, setQuickPlayTicket] = useState<QuickPlayTicket | null>(null);
  const [quickPlayError, setQuickPlayError] = useState<string | null>(null);
  const [quickPlayLocalUid, setQuickPlayLocalUid] = useState('');
  const quickPlayClientRef = useRef<QuickPlayClient | null>(null);
  const pendingQuickPlayRef = useRef(false);
  const [isOnlineMatch, setIsOnlineMatch] = useState(false);
  const [onlineRoomCode, setOnlineRoomCode] = useState<string | null>(null);
  const [onlinePlayerCount, setOnlinePlayerCount] = useState(0);
  const [localOnlineUid, setLocalOnlineUid] = useState<string | null>(null);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerSummary[]>([]);
  const [rematchVotes, setRematchVotes] = useState<string[]>([]);
  const [sessionCareerStats, setSessionCareerStats] = useState({
    matchesPlayed: 0,
    wins: 0,
    bestScore: 0,
  });
  const launchedOnlineKeyRef = useRef<string | null>(null);
  const recordedOutcomeRef = useRef<boolean>(false);

  // Settings & Pause state
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Live match HUD state
  const [matchPhase, setMatchPhase] = useState<MatchPhase>('menu');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<MatchModeId>('2v2');
  const [playerTeam, setPlayerTeam] = useState<TrooperRole>('hero');
  const [cameraMode, setCameraMode] = useState<CameraMode>('thirdPerson');
  const [activePreset, setActivePreset] = useState<CameraPresetId>('isometric');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingHeading, setLoadingHeading] = useState<string>('Match Prep');
  const [loadingStage, setLoadingStage] = useState<string>(() => getLoadingStageLabel(0));
  const [countdownRemaining, setCountdownRemaining] = useState<number>(0);
  const [goBannerRemaining, setGoBannerRemaining] = useState<number>(0);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(MATCH_DURATION_SECONDS);
  const [heroPercent, setHeroPercent] = useState<number>(50);
  const [villainPercent, setVillainPercent] = useState<number>(50);
  const [playerAmmo, setPlayerAmmo] = useState<number>(100);
  const [playerHasGrenade, setPlayerHasGrenade] = useState<boolean>(false);
  const [playerHasDizzyBomb, setPlayerHasDizzyBomb] = useState<boolean>(false);
  const [playerDizzyRemaining, setPlayerDizzyRemaining] = useState<number>(0);
  const [teamOrbActive, setTeamOrbActive] = useState<boolean>(false);
  const [isBoostSprinting, setIsBoostSprinting] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(settings.muted);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [totalRounds, setTotalRounds] = useState<number>(TOTAL_ROUNDS);
  const [heroRoundsWon, setHeroRoundsWon] = useState<number>(0);
  const [villainRoundsWon, setVillainRoundsWon] = useState<number>(0);
  const [tiebreakerTriggered, setTiebreakerTriggered] = useState<boolean>(false);
  const [roundHistory, setRoundHistory] = useState<RoundOutcome[]>([]);
  const [lastRoundOutcome, setLastRoundOutcome] = useState<RoundOutcome | null>(null);
  const [roundTransitionRemaining, setRoundTransitionRemaining] = useState<number>(0);
  const [matchOutcome, setMatchOutcome] = useState<MatchOutcome | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [minimapCollapsed, setMinimapCollapsed] = useState(!settings.showMinimap);
  const [contextLost, setContextLost] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  useEffect(() => {
    document.body.dataset.state =
      matchPhase === 'playing' && isPaused ? 'paused' : matchPhase;
  }, [matchPhase, isPaused]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (user && user.emailVerified) {
        void ensureUserProfileDocs(user).catch((err) => console.error(err));
      } else {
        setUserProfile(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified) {
      setUserProfile(null);
      return;
    }
    const unsub = subscribeMyPublicProfile(authUser.uid, (prof) => {
      setUserProfile(prof);
    });
    return () => unsub();
  }, [authReady, authUser]);

  // Handle ?lobby=XXXXXX invite links automatically
  useEffect(() => {
    if (!pendingInviteCode || !authReady) return;
    if (!authUser || !authUser.emailVerified) {
      setAuthModalOpen(true);
      return;
    }
    const code = pendingInviteCode;
    setPendingInviteCode(null);
    const displayName = userProfile?.displayName || authUser.displayName || 'Trooper';
    void joinLobbyByCode(code, {
      uid: authUser.uid,
      displayName,
      team: selectedTeam,
    })
      .then((joined) => {
        setActiveLobbyCode(joined.code);
        setMultiplayerOpen(true);
      })
      .catch((err) => console.error(err));
  }, [pendingInviteCode, authReady, authUser, userProfile?.displayName, selectedTeam]);

  useEffect(() => {
    if (matchPhase !== 'playing' && settingsOpen && matchPhase === 'ended') {
      setSettingsOpen(false);
    }
  }, [matchPhase, settingsOpen]);

  useEffect(() => {
    if (!isPaused && matchPhase === 'playing' && settingsOpen) {
      setSettingsOpen(false);
    }
  }, [isPaused, matchPhase, settingsOpen]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let controller: ArenaController;
    try {
      controller = mountSaveItArena(container, {
        onContextLost: (lost) => setContextLost(lost),
        onHudChange: (snapshot) => {
          setMatchPhase(snapshot.matchPhase);
          setIsPaused(snapshot.isPaused);
          setActiveMode(snapshot.matchMode);
          setPlayerTeam(snapshot.playerTeam);
          setCameraMode(snapshot.cameraMode);
          setLoadingProgress(snapshot.loadingProgress);
          setLoadingHeading(snapshot.loadingHeading);
          setLoadingStage(snapshot.loadingStage);
          setCountdownRemaining(snapshot.countdownRemainingSeconds);
          setGoBannerRemaining(snapshot.goBannerRemainingSeconds);
          setTimeRemainingSeconds(snapshot.timeRemainingSeconds);
          setHeroPercent(snapshot.heroPercent);
          setVillainPercent(snapshot.villainPercent);
          setPlayerAmmo(snapshot.playerAmmo);
          setPlayerHasGrenade(snapshot.playerHasGrenade);
          setPlayerHasDizzyBomb(snapshot.playerHasDizzyBomb);
          setPlayerDizzyRemaining(snapshot.playerDizzyRemaining);
          setTeamOrbActive(snapshot.teamOrbActive);
          setIsBoostSprinting(snapshot.isBoostSprinting);
          setIsMuted(snapshot.isMuted);
          setCurrentRound(snapshot.currentRound);
          setTotalRounds(snapshot.totalRounds);
          setHeroRoundsWon(snapshot.heroRoundsWon);
          setVillainRoundsWon(snapshot.villainRoundsWon);
          setTiebreakerTriggered(snapshot.tiebreakerTriggered);
          setRoundHistory(snapshot.roundHistory);
          setLastRoundOutcome(snapshot.lastRoundOutcome);
          setRoundTransitionRemaining(snapshot.roundTransitionRemaining);
          setMatchOutcome(snapshot.matchOutcome);
          setIsOnlineMatch(snapshot.isOnline);
          setOnlineRoomCode(snapshot.onlineRoomCode);
          setOnlinePlayerCount(snapshot.onlinePlayerCount);
          setLocalOnlineUid(snapshot.localPlayerUid);
          setOnlinePlayers(snapshot.onlinePlayers);
          setRematchVotes(snapshot.rematchVotes);
        },
      });
    } catch (err) {
      console.error('Failed to mount Save It 3D arena:', err);
      setWebglError(
        err instanceof Error ? err.message : 'Unable to initialize 3D WebGL arena.',
      );
      return;
    }
    controllerRef.current = controller;
    controller.updateSettings(loadSettings());

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const teamParam: TrooperRole = params.get('team') === 'villain' ? 'villain' : 'hero';
      const roomParam = params.get('room');
      const modeParam = (params.get('mode') as MatchModeId) || '2v2';
      setSelectedTeam(teamParam);
      if (roomParam) {
        const uidParam = params.get('uid') || `guest-${Math.random().toString(36).slice(2, 8)}`;
        const nameParam = params.get('name') || (teamParam === 'hero' ? 'AquaGuest' : 'MagmaGuest');
        const hostUidParam = params.get('hostUid') || uidParam;
        controller.startMatch(teamParam, modeParam, {
          skipIntro: true,
          onlineSession: {
            roomCode: roomParam.toUpperCase(),
            hostUid: hostUidParam,
            playerUid: uidParam,
            displayName: nameParam,
            team: teamParam,
            modeId: modeParam,
          },
        });
      } else {
        controller.startMatch(teamParam, '2v2', { skipIntro: true });
      }
    }

    return () => {
      quickPlayClientRef.current?.cancel();
      quickPlayClientRef.current = null;
      controller.dispose();
      controllerRef.current = null;
    };
  }, []);

  // Persist online / session match stats & bestScore once per finished series
  useEffect(() => {
    if (matchPhase === 'ended' && matchOutcome && !recordedOutcomeRef.current) {
      recordedOutcomeRef.current = true;
      const myTerritoryPct =
        playerTeam === 'hero' ? matchOutcome.heroPercent : matchOutcome.villainPercent;
      setSessionCareerStats((prev) => ({
        matchesPlayed: prev.matchesPlayed + 1,
        wins: prev.wins + (matchOutcome.playerWon ? 1 : 0),
        bestScore: Math.max(prev.bestScore, myTerritoryPct),
      }));

      if (authUser?.emailVerified) {
        const myRounds =
          playerTeam === 'hero' ? matchOutcome.heroRoundsWon : matchOutcome.villainRoundsWon;
        void recordOnlineMatchResult(
          authUser.uid,
          matchOutcome.playerWon,
          myRounds,
          myTerritoryPct,
        )
          .then((updated) => {
            if (updated) setUserProfile(updated);
          })
          .catch((err) => console.error(err));
      }
    }
    if (matchPhase === 'menu' || matchPhase === 'countdown' || matchPhase === 'loading') {
      recordedOutcomeRef.current = false;
    }
  }, [matchPhase, matchOutcome, authUser, playerTeam]);

  useEffect(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    if (
      (matchPhase === 'playing' || matchPhase === 'countdown') &&
      !minimapCollapsed &&
      settings.showMinimap
    ) {
      controller.setMinimapCanvas(minimapCanvasRef.current);
    } else {
      controller.setMinimapCanvas(null);
    }
  }, [matchPhase, minimapCollapsed, settings.showMinimap]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (settingsOpen) return;
      if (e.key === 'n' || e.key === 'N') {
        const nextMuted = controllerRef.current?.toggleMute();
        if (typeof nextMuted === 'boolean') {
          setSettings((prev) => {
            const updated = { ...prev, muted: nextMuted };
            saveSettings(updated);
            return updated;
          });
        }
        return;
      }
      if (matchPhase !== 'playing' || isPaused) return;
      if (e.key === 'h' || e.key === 'H') {
        setControlsCollapsed((prev) => !prev);
      } else if (e.key === 'm' || e.key === 'M') {
        setMinimapCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [matchPhase, isPaused, settingsOpen]);

  const handleSettingsChange = (nextSettings: GameSettings) => {
    setSettings(nextSettings);
    setMinimapCollapsed(!nextSettings.showMinimap);
    setIsMuted(nextSettings.muted);
    saveSettings(nextSettings);
    controllerRef.current?.updateSettings(nextSettings);
  };

  const handleStartMatch = (btn: HTMLButtonElement) => {
    btn.blur();
    arenaSound.playUiClick();
    launchedOnlineKeyRef.current = null;
    setSettingsOpen(false);
    setControlsCollapsed(false);
    controllerRef.current?.startMatch(selectedTeam, selectedMode);
  };

  const launchQuickPlayQueue = useCallback(
    (identity: { uid: string; displayName: string; isGuest: boolean }) => {
      quickPlayClientRef.current?.cancel();
      quickPlayClientRef.current = null;
      launchedOnlineKeyRef.current = null;
      setMultiplayerOpen(false);
      setAuthModalOpen(false);
      setSettingsOpen(false);
      setQuickPlayError(null);
      setQuickPlayTicket(null);
      setQuickPlayLocalUid(identity.uid);
      setQuickPlayOpen(true);

      const client = new QuickPlayClient(
        {
          uid: identity.uid,
          displayName: identity.displayName,
          preferredTeam: selectedTeam,
          modeId: selectedMode,
          isGuest: identity.isGuest,
        },
        {
          onUpdate: (ticket) => {
            setQuickPlayTicket(ticket);
          },
          onLaunch: (ticket) => {
            setQuickPlayTicket(ticket);
            client.closeWithoutCancel();
            if (quickPlayClientRef.current === client) {
              quickPlayClientRef.current = null;
            }
            const assignedTeam: TrooperRole =
              ticket.players.find((p) => p.uid === identity.uid)?.team ?? selectedTeam;
            setQuickPlayOpen(false);
            setControlsCollapsed(false);
            setSelectedTeam(assignedTeam);
            setSelectedMode(ticket.modeId);
            controllerRef.current?.startMatch(assignedTeam, ticket.modeId, {
              onlineSession: {
                roomCode: ticket.roomCode,
                hostUid: ticket.hostUid,
                playerUid: identity.uid,
                displayName: identity.displayName,
                team: assignedTeam,
                modeId: ticket.modeId,
              },
            });
          },
          onError: (msg) => {
            setQuickPlayError(msg);
          },
        },
      );
      quickPlayClientRef.current = client;
    },
    [selectedMode, selectedTeam],
  );

  // Auto-resume Quick Play immediately once player completes sign-in / email verification
  useEffect(() => {
    if (!pendingQuickPlayRef.current) return;
    if (authUser && authUser.emailVerified) {
      pendingQuickPlayRef.current = false;
      const displayName =
        userProfile?.displayName ||
        authUser.displayName ||
        authUser.email?.split('@')[0] ||
        'Trooper';
      launchQuickPlayQueue({
        uid: authUser.uid,
        displayName,
        isGuest: false,
      });
    }
  }, [authUser, userProfile?.displayName, launchQuickPlayQueue]);

  const handleQuickPlay = (btn: HTMLButtonElement) => {
    btn.blur();
    arenaSound.playUiClick();
    if (authUser && authUser.emailVerified) {
      const displayName =
        userProfile?.displayName ||
        authUser.displayName ||
        authUser.email?.split('@')[0] ||
        'Trooper';
      launchQuickPlayQueue({ uid: authUser.uid, displayName, isGuest: false });
      return;
    }
    if (guestProfile) {
      launchQuickPlayQueue({
        uid: guestProfile.uid,
        displayName: guestProfile.displayName,
        isGuest: true,
      });
      return;
    }
    pendingQuickPlayRef.current = true;
    setAuthModalOpen(true);
  };

  const handleContinueAsGuest = () => {
    const existing = guestProfile;
    const guest =
      existing ?? {
        uid: `guest-${Math.random().toString(36).slice(2, 8)}`,
        displayName: `Guest_${Math.floor(1000 + Math.random() * 9000)}`,
      };
    if (!existing) {
      setGuestProfile(guest);
    }
    setAuthModalOpen(false);
    if (pendingQuickPlayRef.current) {
      pendingQuickPlayRef.current = false;
      launchQuickPlayQueue({
        uid: guest.uid,
        displayName: guest.displayName,
        isGuest: true,
      });
    }
  };

  const handleCancelQuickPlay = () => {
    quickPlayClientRef.current?.cancel();
    quickPlayClientRef.current = null;
    setQuickPlayOpen(false);
    setQuickPlayTicket(null);
    setQuickPlayError(null);
  };

  const handleLaunchOnlineMatch = useCallback(
    (lobby: OnlineLobby, members: LobbyMember[]) => {
      if (!authUser) return;
      const launchKey = `${lobby.code}:${lobby.updatedAt?.toMillis() ?? 'now'}`;
      if (launchedOnlineKeyRef.current === launchKey) return;
      launchedOnlineKeyRef.current = launchKey;

      const myMember = members.find((m) => m.uid === authUser.uid);
      const myTeam: TrooperRole = myMember?.team ?? selectedTeam;
      const myName =
        myMember?.displayName || userProfile?.displayName || authUser.displayName || 'Trooper';

      setMultiplayerOpen(false);
      setSettingsOpen(false);
      setControlsCollapsed(false);
      setSelectedTeam(myTeam);
      setSelectedMode(lobby.mode);

      controllerRef.current?.startMatch(myTeam, lobby.mode, {
        onlineSession: {
          roomCode: lobby.code,
          hostUid: lobby.hostUid,
          playerUid: authUser.uid,
          displayName: myName,
          team: myTeam,
          modeId: lobby.mode,
        },
      });
    },
    [authUser, selectedTeam, userProfile?.displayName],
  );

  const handleReturnToMenu = (btn?: HTMLButtonElement) => {
    btn?.blur();
    arenaSound.playUiClick();
    launchedOnlineKeyRef.current = null;
    setActiveLobbyCode(null);
    setSettingsOpen(false);
    controllerRef.current?.returnToMenu();
  };

  const handleRematch = (btn: HTMLButtonElement) => {
    btn.blur();
    arenaSound.playUiClick();
    setSettingsOpen(false);
    setControlsCollapsed(false);
    controllerRef.current?.voteRematch();
  };

  const handleToggleMute = (btn: HTMLButtonElement) => {
    btn.blur();
    const nextMuted = controllerRef.current?.toggleMute();
    if (typeof nextMuted === 'boolean') {
      setSettings((prev) => {
        const updated = { ...prev, muted: nextMuted };
        saveSettings(updated);
        return updated;
      });
    }
  };

  const handleSetCameraMode = (mode: CameraMode, btn: HTMLButtonElement) => {
    setCameraMode(mode);
    controllerRef.current?.setCameraMode(mode);
    btn.blur();
  };

  const handleSelectPreset = (id: CameraPresetId, btn: HTMLButtonElement) => {
    setActivePreset(id);
    setCameraMode('orbit');
    controllerRef.current?.setPreset(id);
    btn.blur();
  };

  const timer = formatMatchTimer(timeRemainingSeconds);
  const modeCfg = getMatchModeConfig(activeMode);
  const isHero = playerTeam === 'hero';
  const isLowAmmo = playerAmmo > 0 && playerAmmo <= 20;
  const isEmptyAmmo = playerAmmo <= 0;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#12161d] select-none">
      {/* Isolated WebGL canvas mount */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full" />

      {/* Context lost graceful fallback */}
      {contextLost && (
        <div
          role="alert"
          className="absolute inset-0 z-40 flex items-center justify-center bg-stone-950/90 text-stone-100"
        >
          <div className="px-6 py-4 rounded-xl bg-stone-900 border border-stone-700 text-center">
            <h2 className="text-lg font-semibold">3D Graphics Context Paused</h2>
            <p className="mt-1 text-sm text-stone-300">
              Waiting for WebGL context restoration.
            </p>
          </div>
        </div>
      )}

      {/* WebGL initialization error fallback */}
      {webglError && (
        <div
          role="alert"
          className="absolute inset-0 z-50 flex items-center justify-center bg-[#0e1118] text-[#f6f1e9] p-6"
        >
          <div className="max-w-md rounded-2xl border border-red-400/35 bg-[#151923] p-6 text-center shadow-2xl">
            <h2 className="font-display text-xl font-bold uppercase text-white">
              3D Arena Renderer Unavailable
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{webglError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold uppercase tracking-wider text-[#08161d] hover:brightness-110"
            >
              Reload Arena
            </button>
          </div>
        </div>
      )}

      {/* MAIN MENU / LOBBY OVERLAY */}
      {matchPhase === 'menu' &&
        !settingsOpen &&
        !authModalOpen &&
        !multiplayerOpen &&
        !quickPlayOpen &&
        !contextLost &&
        !webglError && (
        <LobbyOverlay
          selectedTeam={selectedTeam}
          selectedMode={selectedMode}
          isMuted={isMuted}
          settings={settings}
          authUser={authUser}
          userProfile={userProfile}
          guestProfile={guestProfile}
          onSelectTeam={(team) => {
            arenaSound.playUiClick();
            setSelectedTeam(team);
          }}
          onSelectMode={(mode) => {
            arenaSound.playUiClick();
            setSelectedMode(mode);
          }}
          onQuickPlay={handleQuickPlay}
          onStartMatch={handleStartMatch}
          onOpenMultiplayer={(btn) => {
            btn.blur();
            arenaSound.playUiClick();
            setMultiplayerOpen(true);
          }}
          onOpenAuth={(btn) => {
            btn.blur();
            arenaSound.playUiClick();
            pendingQuickPlayRef.current = false;
            setAuthModalOpen(true);
          }}
          onOpenSettings={(btn) => {
            btn.blur();
            arenaSound.playUiClick();
            setSettingsOpen(true);
          }}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* LOADING SCREEN (Uses Lobby Hero Artwork + Live Progress) */}
      {matchPhase === 'loading' && !contextLost && (
        <LoadingOverlay
          team={playerTeam}
          modeId={activeMode}
          progress={loadingProgress}
          heading={loadingHeading}
          stageLabel={loadingStage}
          roundLabel={
            loadingHeading === 'Lobby Showcase'
              ? undefined
              : currentRound === MAX_ROUNDS_WITH_TIEBREAKER || tiebreakerTriggered
                ? 'Final Tiebreaker · R5'
                : `Round ${currentRound}/${totalRounds}`
          }
        />
      )}

      {/* ACTIVE MATCH HUD (Visible in Countdown & Playing) */}
      {(matchPhase === 'playing' || matchPhase === 'countdown') && (
        <>
          {matchPhase === 'playing' &&
            settings.showCrosshair &&
            !isPaused &&
            (cameraMode === 'firstPerson' || cameraMode === 'thirdPerson') &&
            !contextLost && <FirstPersonCrosshair role={playerTeam} empty={isEmptyAmmo} />}

          {/* 3, 2, 1, GO! PRE-MATCH COUNTDOWN OVERLAY */}
          {(matchPhase === 'countdown' || (matchPhase === 'playing' && goBannerRemaining > 0.02)) &&
            !isPaused &&
            !contextLost && (() => {
              const cd = getCountdownState(matchPhase === 'countdown' ? countdownRemaining : 0);
              const isGo = cd.value === 0;
              const isTiebreaker = currentRound === MAX_ROUNDS_WITH_TIEBREAKER;
              const beatScale = isGo ? 1.06 : 1.18 - cd.beatProgress * 0.22;
              return (
                <div
                  data-testid="countdown-overlay"
                  aria-live="assertive"
                  className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-center"
                >
                  <div
                    className="flex flex-col items-center px-8 py-5 rounded-3xl bg-[rgba(9,12,19,0.78)] border border-white/15 shadow-[0_24px_64px_rgba(0,0,0,0.72)] transition-transform duration-75"
                    style={{ transform: `scale(${beatScale.toFixed(3)})` }}
                  >
                    <span className="text-[11px] font-bold tracking-[0.26em] uppercase text-[#cbd5e1]">
                      {isGo
                        ? isTiebreaker
                          ? 'Final Tiebreaker Live!'
                          : `Round ${currentRound} Live!`
                        : isTiebreaker
                          ? 'Final Tiebreaker · Round 5 of 5'
                          : `Round ${currentRound} of ${totalRounds} · Get Ready`}
                    </span>
                    <span
                      data-testid="countdown-value"
                      className={`mt-1 font-display text-7xl sm:text-8xl font-black italic tracking-tight leading-none drop-shadow-[0_6px_16px_rgba(0,0,0,0.9)] ${
                        isGo
                          ? 'bg-[linear-gradient(180deg,#fef08a_15%,#facc15_55%,#f97316_95%)] bg-clip-text text-transparent'
                          : isHero
                            ? 'bg-[linear-gradient(180deg,#ffffff_12%,#7ceeff_55%,#0284c7_95%)] bg-clip-text text-transparent'
                            : 'bg-[linear-gradient(180deg,#fff7ed_12%,#fb923c_55%,#dc2626_95%)] bg-clip-text text-transparent'
                      }`}
                    >
                      {cd.label}
                    </span>
                  </div>
                </div>
              );
            })()}

          {playerDizzyRemaining > 0.05 && !isPaused && (
            <div
              data-testid="player-dizzy-banner"
              className="pointer-events-none fixed top-24 left-1/2 z-20 -translate-x-1/2 px-4 py-1.5 rounded-xl bg-[rgba(88,28,135,0.92)] border border-[#facc15] shadow-[0_0_24px_rgba(217,70,239,0.55)] text-xs font-bold tracking-[0.14em] uppercase text-[#fef08a] whitespace-nowrap"
            >
              DIZZY! CAN&apos;T MOVE · {playerDizzyRemaining.toFixed(1)}s
            </div>
          )}

          <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 sm:p-5">
            {/* Top Row: Pause, Lobby & Sound (Left) · 3-Min Timer & Territory Bar (Center) · Tactical Navigation Map (Right) */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
              <div className="flex items-center gap-2 justify-start">
                <button
                  type="button"
                  data-testid="hud-pause-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    arenaSound.playUiClick();
                    controllerRef.current?.togglePause();
                  }}
                  className="pointer-events-auto px-3 py-1.5 rounded-lg bg-[rgba(14,17,24,0.88)] hover:bg-[rgba(24,29,40,0.94)] border border-white/20 text-xs font-semibold text-[#faf6ee] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  Pause [{formatKeyCode(settings.keybinds.pauseMenu)}]
                </button>
                <button
                  type="button"
                  onClick={(e) => handleReturnToMenu(e.currentTarget)}
                  className="pointer-events-auto px-3 py-1.5 rounded-lg bg-[rgba(14,17,24,0.84)] hover:bg-[rgba(24,29,40,0.92)] border border-white/15 text-xs font-medium text-[#dfe3ec] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  Lobby
                </button>
                <button
                  type="button"
                  onClick={(e) => handleToggleMute(e.currentTarget)}
                  aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
                  className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[rgba(14,17,24,0.84)] hover:bg-[rgba(24,29,40,0.92)] border border-white/15 text-xs font-medium text-[#dfe3ec] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400"
                >
                  <SoundIcon muted={isMuted} />
                  <span className="hidden sm:inline">{isMuted ? 'Muted' : 'Sound'}</span>
                </button>
                {isOnlineMatch && onlineRoomCode && (
                  <span
                    data-testid="online-hud-badge"
                    className="px-2.5 py-1.5 rounded-lg bg-[rgba(10,36,52,0.88)] border border-[#38efff]/45 text-[11px] font-bold tracking-wider uppercase text-[#7ceeff] whitespace-nowrap shrink-0"
                  >
                    Room {onlineRoomCode} · {onlinePlayerCount} Online
                  </span>
                )}
              </div>

              <div
                aria-label="Match timer and territory control"
                className={`flex flex-col gap-1.5 px-4 py-2 rounded-2xl bg-[linear-gradient(155deg,rgba(14,18,27,0.90),rgba(8,10,16,0.84))] border shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_40px_rgba(0,0,0,0.55)] w-full max-w-[440px] min-w-[270px] transition-colors ${
                  timer.isFinalStretch
                    ? 'border-[#ff4d4d] shadow-[0_0_24px_rgba(239,68,68,0.38)]'
                    : 'border-white/15'
                }`}
              >
                {/* Round & Series Score Strip */}
                <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/10 text-[10px] font-bold tracking-[0.14em] uppercase">
                  <div className="flex items-center gap-1" aria-label={`Heroes rounds won: ${heroRoundsWon}`}>
                    {Array.from({ length: totalRounds }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`w-2 h-2 rounded-[2px] border ${
                          idx < heroRoundsWon
                            ? 'bg-[#36e8ff] border-[#8ceeff] shadow-[0_0_6px_rgba(54,232,255,0.65)]'
                            : 'bg-white/5 border-white/20'
                        }`}
                      />
                    ))}
                  </div>
                  <span
                    data-testid="round-series-badge"
                    className="text-[#e2e8f0] tabular-nums whitespace-nowrap"
                  >
                    Round {currentRound}/{totalRounds} ·{' '}
                    <span className="text-[#4fe8ff]">{heroRoundsWon}</span>
                    <span className="text-white/45 mx-1">—</span>
                    <span className="text-[#ff8347]">{villainRoundsWon}</span>
                  </span>
                  <div className="flex items-center gap-1" aria-label={`Villains rounds won: ${villainRoundsWon}`}>
                    {Array.from({ length: totalRounds }).map((_, idx) => (
                      <span
                        key={idx}
                        className={`w-2 h-2 rounded-[2px] border ${
                          idx < villainRoundsWon
                            ? 'bg-[#ff6a2b] border-[#ffab78] shadow-[0_0_6px_rgba(255,106,43,0.65)]'
                            : 'bg-white/5 border-white/20'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 items-center gap-2">
                  {/* Heroes % */}
                  <div className="flex items-center gap-1.5 justify-start">
                    <span className="text-[#36e8ff]">
                      <WaterEmblemIcon className="w-4 h-4" />
                    </span>
                    <div className="flex flex-col leading-none">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-[#8ceeff]">
                        Heroes
                      </span>
                      <span
                        data-testid="hero-percent"
                        className="mt-0.5 font-display text-base font-bold text-[#e6fcff] tabular-nums"
                      >
                        {heroPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Countdown Clock */}
                  <div className="flex flex-col items-center justify-center">
                    <span
                      data-testid="match-timer"
                      className={`font-display text-2xl sm:text-[26px] font-bold tracking-wider leading-none tabular-nums ${
                        timer.isFinalStretch
                          ? 'text-[#ff5252]'
                          : 'text-[#faf6ee]'
                      }`}
                    >
                      {timer.formatted}
                    </span>
                    <span className="mt-0.5 text-[10px] font-medium tracking-[0.14em] uppercase text-[#9ca3b4] whitespace-nowrap">
                      {modeCfg.label} · {modeCfg.gridLabel}
                    </span>
                  </div>

                  {/* Villains % */}
                  <div className="flex items-center gap-1.5 justify-end text-right">
                    <div className="flex flex-col leading-none">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-[#ffab78]">
                        Villains
                      </span>
                      <span
                        data-testid="villain-percent"
                        className="mt-0.5 font-display text-base font-bold text-[#fff3eb] tabular-nums"
                      >
                        {villainPercent.toFixed(1)}%
                      </span>
                    </div>
                    <span className="text-[#ff6a2b]">
                      <FireEmblemIcon className="w-4 h-4" />
                    </span>
                  </div>
                </div>

                {/* Split Territory Control Progress Bar */}
                <div
                  role="progressbar"
                  aria-label={`Territory control: Heroes ${heroPercent.toFixed(1)}%, Villains ${villainPercent.toFixed(1)}%`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(heroPercent)}
                  className="relative w-full h-2 rounded-full overflow-hidden bg-[#2b140d] flex border border-white/10"
                >
                  <div
                    className="h-full bg-[linear-gradient(90deg,#12b8ff,#2dd4bf)] transition-all duration-200"
                    style={{ width: `${heroPercent}%` }}
                  />
                  <div
                    className="h-full bg-[linear-gradient(90deg,#f97316,#dc2626)] transition-all duration-200"
                    style={{ width: `${villainPercent}%` }}
                  />
                  {/* Center 50% marker */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-white/45"
                  />
                </div>
              </div>

              {/* Top-Right Tactical Navigation Map */}
              <div className="flex justify-end">
                {settings.showMinimap && (
                <div className="pointer-events-auto flex flex-col items-end gap-1.5">
                {minimapCollapsed ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      setMinimapCollapsed(false);
                      e.currentTarget.blur();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[rgba(14,17,24,0.86)] hover:bg-[rgba(24,29,40,0.92)] border border-white/15 text-xs font-medium text-[#dfe3ec] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    Map [M]
                  </button>
                ) : (
                  <div
                    aria-label="Arena navigation map"
                    data-testid="navigation-minimap"
                    className="flex flex-col gap-1.5 p-2 rounded-2xl bg-[linear-gradient(155deg,rgba(14,18,27,0.92),rgba(8,10,16,0.86))] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_40px_rgba(0,0,0,0.58)]"
                  >
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#c7ccd6] whitespace-nowrap">
                        Radar · {modeCfg.gridLabel}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          setMinimapCollapsed(true);
                          e.currentTarget.blur();
                        }}
                        aria-label="Hide navigation map"
                        className="text-[10px] font-medium text-[#9ca3b4] hover:text-white transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
                      >
                        [M]
                      </button>
                    </div>

                    <div className="relative rounded-xl overflow-hidden border border-white/15 bg-[#0e141a]">
                      <canvas
                        ref={minimapCanvasRef}
                        data-testid="minimap-canvas"
                        className="block w-[156px] h-[156px] sm:w-[168px] sm:h-[168px]"
                      />
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute top-1 left-1/2 -translate-x-1/2 text-[9px] font-bold tracking-widest text-white/75 drop-shadow"
                      >
                        N
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-1 px-1 text-[10px] text-[#a7aebc] whitespace-nowrap">
                      <span>▲ You</span>
                      <span>◆ Bomb</span>
                      <span>✦ Dizzy</span>
                      <span>◎ Sign</span>
                    </div>
                  </div>
                )}
                </div>
                )}
              </div>
            </div>

            {/* Bottom Combat HUD (Ammo Tank + Grenade) & Camera Dock */}
            <div className="flex flex-col items-center gap-2">
              <div className="pointer-events-none flex items-stretch gap-2.5 px-3.5 py-2.5 rounded-xl bg-[rgba(14,17,24,0.88)] border border-white/15 shadow-2xl">
                {/* Ammo Tank Bar */}
                <div className="flex flex-col justify-between gap-1.5 min-w-[230px] sm:min-w-[268px]">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={`text-[10px] font-bold tracking-[0.14em] uppercase ${
                        isEmptyAmmo
                          ? 'text-[#ff7866]'
                          : isHero
                            ? 'text-[#7ceeff]'
                            : 'text-[#ffad72]'
                      }`}
                    >
                      {isEmptyAmmo && teamOrbActive
                        ? isHero
                          ? 'TANK EMPTY · COLLECT BLUE SIGN'
                          : 'CORE EMPTY · COLLECT RED SIGN'
                        : isLowAmmo
                          ? isHero
                            ? 'HYDRO TANK · LOW'
                            : 'MAGMA CORE · LOW'
                          : isHero
                            ? 'HYDRO TANK'
                            : 'MAGMA CORE'}
                    </span>
                    <span
                      className="font-display text-lg font-bold leading-none text-[#f8f1e4] tabular-nums"
                      aria-label={`Ammo ${playerAmmo} of 100`}
                    >
                      {playerAmmo}
                      <span className="text-[11px] font-medium text-[#9f9382]">/100</span>
                    </span>
                  </div>

                  <div
                    role="meter"
                    aria-label={`${isHero ? 'Hydro Tank' : 'Magma Core'} ammo`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={playerAmmo}
                    className="relative h-2.5 w-full rounded-full overflow-hidden bg-[rgba(8,8,8,0.82)] border border-white/10"
                  >
                    <div
                      className="h-full transition-all duration-150"
                      style={{
                        width: `${playerAmmo}%`,
                        backgroundColor: isEmptyAmmo
                          ? '#ef4444'
                          : isHero
                            ? '#1eeaff'
                            : '#ff6614',
                        boxShadow: isEmptyAmmo
                          ? 'none'
                          : isHero
                            ? '0 0 12px rgba(30,234,255,0.7)'
                            : '0 0 12px rgba(255,102,20,0.75)',
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 flex justify-evenly">
                      <span className="h-full w-px bg-[rgba(14,17,24,0.55)]" />
                      <span className="h-full w-px bg-[rgba(14,17,24,0.55)]" />
                      <span className="h-full w-px bg-[rgba(14,17,24,0.55)]" />
                    </div>
                  </div>

                  {isEmptyAmmo && (
                    <div
                      data-testid="empty-tank-boost-hint"
                      className={`text-[10px] font-bold tracking-[0.12em] uppercase ${
                        isBoostSprinting ? 'text-[#fde047]' : 'text-[#93e6ff]'
                      }`}
                    >
                      {isBoostSprinting
                        ? `EXTRA SPEED ACTIVE [${formatKeyCode(settings.keybinds.sprintBoost)}]`
                        : `HOLD [${formatKeyCode(settings.keybinds.sprintBoost)}] FOR EXTRA SPEED UNTIL RECHARGE`}
                    </div>
                  )}
                </div>

                <span aria-hidden="true" className="w-px bg-white/15" />

                {/* Elemental Grenade Slot */}
                <div
                  aria-label={
                    playerHasGrenade
                      ? `Grenade ready: ${formatKeyCode(settings.keybinds.throwGrenade)} or Right Click`
                      : 'Grenade slot empty'
                  }
                  className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all ${
                    playerHasGrenade
                      ? isHero
                        ? 'bg-[rgba(14,116,144,0.34)] border-[#38efff] shadow-[0_0_12px_rgba(56,239,255,0.28)]'
                        : 'bg-[rgba(154,36,14,0.38)] border-[#ff642e] shadow-[0_0_12px_rgba(255,100,46,0.3)]'
                      : 'bg-[rgba(10,10,10,0.55)] border-white/10 opacity-75'
                  }`}
                >
                  <GrenadeIcon role={playerTeam} armed={playerHasGrenade} />
                  <div className="flex flex-col leading-tight">
                    <span
                      className={`text-[10px] font-bold tracking-wider uppercase ${
                        playerHasGrenade ? 'text-[#f8f3ea]' : 'text-[#9e9487]'
                      }`}
                    >
                      {playerHasGrenade
                        ? isHero
                          ? 'Hydro Grenade'
                          : 'Magma Grenade'
                        : 'Grenade Slot'}
                    </span>
                    <span className="text-[10px] font-medium text-[#cbbda6] whitespace-nowrap">
                      {playerHasGrenade
                        ? `[${formatKeyCode(settings.keybinds.throwGrenade)} / RIGHT CLICK]`
                        : 'Empty · 15s Drop'}
                    </span>
                  </div>
                </div>

                <span aria-hidden="true" className="w-px bg-white/15" />

                {/* Dizzy Bomb Slot */}
                <div
                  data-testid="dizzy-bomb-slot"
                  aria-label={
                    playerHasDizzyBomb
                      ? 'Dizzy Bomb ready: press F to throw near opponent'
                      : 'Dizzy Bomb slot empty'
                  }
                  className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border transition-all ${
                    playerHasDizzyBomb
                      ? 'bg-[rgba(112,26,117,0.44)] border-[#e879f9] shadow-[0_0_14px_rgba(217,70,239,0.38)]'
                      : 'bg-[rgba(10,10,10,0.55)] border-white/10 opacity-75'
                  }`}
                >
                  <DizzyBombIcon armed={playerHasDizzyBomb} />
                  <div className="flex flex-col leading-tight">
                    <span
                      className={`text-[10px] font-bold tracking-wider uppercase ${
                        playerHasDizzyBomb ? 'text-[#fef08a]' : 'text-[#9e9487]'
                      }`}
                    >
                      {playerHasDizzyBomb ? 'Dizzy Bomb' : 'Dizzy Slot'}
                    </span>
                    <span className="text-[10px] font-medium text-[#d8b4fe] whitespace-nowrap">
                      {playerHasDizzyBomb
                        ? `[${formatKeyCode(settings.keybinds.throwDizzy)}] THROW · 3s STUN`
                        : 'Empty · 14s Drop'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  setControlsCollapsed((prev) => !prev);
                  e.currentTarget.blur();
                }}
                aria-expanded={!controlsCollapsed}
                className="pointer-events-auto px-3.5 py-1.5 rounded-lg bg-[rgba(16,19,26,0.84)] hover:bg-[rgba(28,33,44,0.92)] border border-white/15 text-xs font-medium text-[#e4e6ed] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {controlsCollapsed ? '▴ Show Controls [H]' : '▾ Hide Controls [H]'}
              </button>

              <div
                className={`pointer-events-auto transition-all duration-200 ease-out ${
                  controlsCollapsed
                    ? 'translate-y-8 opacity-0 pointer-events-none h-0 overflow-hidden'
                    : 'translate-y-0 opacity-100'
                }`}
              >
                <div className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[rgba(14,17,24,0.88)] border border-white/15 shadow-xl max-w-[94vw]">
                  <div
                    role="group"
                    aria-label="Camera mode"
                    className="flex items-center gap-1 p-0.5 rounded-lg bg-[rgba(8,10,15,0.75)] border border-white/10"
                  >
                    <button
                      type="button"
                      onClick={(e) => handleSetCameraMode('thirdPerson', e.currentTarget)}
                      aria-pressed={cameraMode === 'thirdPerson'}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        cameraMode === 'thirdPerson'
                          ? 'bg-[#d9a65a] text-[#1c1813]'
                          : 'text-[#e5dac7] hover:bg-white/10'
                      }`}
                    >
                      3rd Person [{formatKeyCode(settings.keybinds.toggleCamera)}]
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSetCameraMode('follow', e.currentTarget)}
                      aria-pressed={cameraMode === 'follow'}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        cameraMode === 'follow'
                          ? 'bg-[#c58e49] text-[#1c1813]'
                          : 'text-[#e5dac7] hover:bg-white/10'
                      }`}
                    >
                      Overhead
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSetCameraMode('firstPerson', e.currentTarget)}
                      aria-pressed={cameraMode === 'firstPerson'}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-cyan-400 ${
                        cameraMode === 'firstPerson'
                          ? 'bg-[#22b8cf] text-[#08171c]'
                          : 'text-[#e5dac7] hover:bg-white/10'
                      }`}
                    >
                      1st Person [{formatKeyCode(settings.keybinds.toggleFirstPerson)}]
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleSetCameraMode('orbit', e.currentTarget)}
                      aria-pressed={cameraMode === 'orbit'}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                        cameraMode === 'orbit'
                          ? 'bg-[#465a70] text-[#f3f8fc]'
                          : 'text-[#e5dac7] hover:bg-white/10'
                      }`}
                    >
                      Orbit [{formatKeyCode(settings.keybinds.toggleOrbit)}]
                    </button>
                  </div>

                  {cameraMode === 'orbit' && (
                    <>
                      <span aria-hidden="true" className="mx-1 h-4 w-px bg-white/15" />
                      {CAMERA_PRESETS.map((preset) => {
                        const isActive = activePreset === preset.id;
                        return (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={(e) => handleSelectPreset(preset.id, e.currentTarget)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                              isActive
                                ? 'bg-[#e2b46d] text-[#1c1813]'
                                : 'text-[#e5dac7] hover:bg-white/10'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </>
                  )}

                  <span aria-hidden="true" className="hidden md:inline-block mx-1.5 h-4 w-px bg-white/15" />
                  <span className="hidden sm:inline-block px-1.5 text-xs text-[#b8bec9] whitespace-nowrap">
                    {cameraMode === 'firstPerson'
                      ? `${formatKeyCode(settings.keybinds.moveForward)}${formatKeyCode(settings.keybinds.moveLeft)}${formatKeyCode(settings.keybinds.moveBackward)}${formatKeyCode(settings.keybinds.moveRight)} Move · ${formatKeyCode(settings.keybinds.sprintBoost)} Boost · Click Fire · ${formatKeyCode(settings.keybinds.throwGrenade)} Grenade · ${formatKeyCode(settings.keybinds.throwDizzy)} Dizzy · ${formatKeyCode(settings.keybinds.pauseMenu)} Pause`
                      : cameraMode === 'thirdPerson'
                        ? `${formatKeyCode(settings.keybinds.moveForward)}${formatKeyCode(settings.keybinds.moveLeft)}${formatKeyCode(settings.keybinds.moveBackward)}${formatKeyCode(settings.keybinds.moveRight)} Move · ${formatKeyCode(settings.keybinds.sprintBoost)} Boost · Mouse / Q-E Look · Click Fire · ${formatKeyCode(settings.keybinds.throwGrenade)} Grenade · ${formatKeyCode(settings.keybinds.throwDizzy)} Dizzy · ${formatKeyCode(settings.keybinds.pauseMenu)} Pause`
                        : cameraMode === 'follow'
                          ? `${formatKeyCode(settings.keybinds.moveForward)}${formatKeyCode(settings.keybinds.moveLeft)}${formatKeyCode(settings.keybinds.moveBackward)}${formatKeyCode(settings.keybinds.moveRight)} Move · ${formatKeyCode(settings.keybinds.sprintBoost)} Boost · Mouse Aim · Click Fire · ${formatKeyCode(settings.keybinds.throwGrenade)} Grenade · ${formatKeyCode(settings.keybinds.throwDizzy)} Dizzy`
                          : `Drag Orbit · Right-Drag Pan · Scroll Zoom · ${formatKeyCode(settings.keybinds.toggleCamera)} 3rd · ${formatKeyCode(settings.keybinds.toggleFirstPerson)} 1st`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* IN-GAME PAUSE MENU */}
          {isPaused && !settingsOpen && !contextLost && (
            <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center p-4 sm:p-6 bg-[rgba(5,7,12,0.64)]">
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Match Paused"
                data-testid="pause-modal"
                className="w-full max-w-[400px] rounded-2xl bg-[linear-gradient(155deg,rgba(15,19,29,0.96),rgba(8,10,16,0.94))] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_28px_72px_rgba(0,0,0,0.8)] p-6 text-[#f4efe6]"
              >
                <div className="text-center">
                  <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#9ca3b4]">
                    Round {currentRound}/{totalRounds} · {modeCfg.label} · {timer.formatted} Left
                  </span>
                  <h2 className="mt-1.5 font-display text-3xl font-bold tracking-wider uppercase text-[#faf6ee] leading-none">
                    Match Paused
                  </h2>
                  <p className="mt-2 text-xs text-[#b5b9c4]">
                    Press [{formatKeyCode(settings.keybinds.pauseMenu)}] anytime to resume
                  </p>
                </div>

                <div className="mt-6 flex flex-col gap-2.5">
                  <button
                    type="button"
                    data-testid="pause-resume-btn"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      arenaSound.playUiClick();
                      controllerRef.current?.setPaused(false);
                    }}
                    className={`w-full py-3 px-4 rounded-xl font-display text-sm font-bold tracking-[0.12em] uppercase transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white ${
                      isHero
                        ? 'bg-[linear-gradient(90deg,#0ea5c6,#14b8a6)] text-[#04181e] shadow-[0_0_24px_rgba(34,211,238,0.34)] hover:brightness-110'
                        : 'bg-[linear-gradient(90deg,#dc2626,#ea580c)] text-[#fff8f3] shadow-[0_0_24px_rgba(239,68,68,0.34)] hover:brightness-110'
                    }`}
                  >
                    Resume Match
                  </button>

                  <button
                    type="button"
                    data-testid="pause-settings-btn"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      arenaSound.playUiClick();
                      setSettingsOpen(true);
                    }}
                    className="w-full py-3 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 font-display text-sm font-bold tracking-[0.12em] uppercase text-[#f4efe6] transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-cyan-400"
                  >
                    Settings &amp; Controls
                  </button>

                  <button
                    type="button"
                    data-testid="pause-restart-btn"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      arenaSound.playUiClick();
                      setSettingsOpen(false);
                      controllerRef.current?.restartMatch();
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-xs font-semibold tracking-[0.12em] uppercase text-[#d8dde6] transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    Restart Match
                  </button>

                  <button
                    type="button"
                    data-testid="pause-lobby-btn"
                    onClick={(e) => handleReturnToMenu(e.currentTarget)}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-xs font-semibold tracking-[0.12em] uppercase text-[#b8bec9] transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    Return to Lobby
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* BETWEEN-ROUNDS TRANSITION OVERLAY */}
      {matchPhase === 'roundEnd' && lastRoundOutcome && !contextLost && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 sm:p-6 bg-[rgba(5,8,14,0.45)]">
          <div
            role="dialog"
            aria-label="Round Complete"
            data-testid="round-end-modal"
            className={`w-full max-w-[450px] rounded-2xl bg-[linear-gradient(155deg,rgba(14,18,27,0.94),rgba(8,10,16,0.90))] border p-6 text-[#f4efe6] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_28px_72px_rgba(0,0,0,0.75)] ${
              lastRoundOutcome.winner === 'draw'
                ? 'border-[#e6be78]/60'
                : lastRoundOutcome.winner === playerTeam
                  ? 'border-[#34e8ff]/70'
                  : 'border-[#ff5a3c]/70'
            }`}
          >
            <div className="text-center">
              <span className="text-[11px] font-semibold tracking-[0.18em] uppercase text-[#a8aebc]">
                Round {lastRoundOutcome.roundNumber} of {totalRounds} Complete · {modeCfg.label}
              </span>
              <h2
                data-testid="round-outcome-heading"
                className={`mt-1.5 font-display text-3xl sm:text-4xl font-bold tracking-wider uppercase leading-none ${
                  lastRoundOutcome.winner === 'draw'
                    ? 'text-[#f3cb7d]'
                    : lastRoundOutcome.winner === playerTeam
                      ? 'text-[#4cf2ff]'
                      : 'text-[#ff6448]'
                }`}
              >
                {lastRoundOutcome.winner === 'draw'
                  ? 'Round Draw'
                  : lastRoundOutcome.winner === 'hero'
                    ? 'Heroes Take Round'
                    : 'Villains Take Round'}
              </h2>
              {tiebreakerTriggered && lastRoundOutcome.roundNumber === TOTAL_ROUNDS && (
                <p
                  data-testid="tiebreaker-unlocked-banner"
                  className="mt-2 inline-block px-3 py-1 rounded-lg bg-[rgba(234,179,8,0.16)] border border-[#facc15]/50 text-[11px] font-bold tracking-[0.12em] uppercase text-[#fde047]"
                >
                  Tied {heroRoundsWon}–{villainRoundsWon} After 4 Rounds · Final Round 5 Unlocked!
                </p>
              )}
            </div>

            {/* Series Scoreboard */}
            <div className="mt-5 p-3.5 rounded-xl bg-white/[0.04] border border-white/10">
              <div className="flex items-center justify-between text-xs font-bold tracking-wider uppercase">
                <span className="text-[#7ceeff]">Heroes</span>
                <span data-testid="round-end-series-score" className="font-display text-2xl text-white tabular-nums">
                  {heroRoundsWon} <span className="text-white/40">—</span> {villainRoundsWon}
                </span>
                <span className="text-[#ffab78]">Villains</span>
              </div>

              <div
                className={`mt-3 grid gap-2 ${
                  totalRounds >= MAX_ROUNDS_WITH_TIEBREAKER ? 'grid-cols-5' : 'grid-cols-4'
                }`}
              >
                {Array.from({ length: totalRounds }).map((_, idx) => {
                  const r = roundHistory[idx];
                  const isHeroWin = r?.winner === 'hero';
                  const isVillainWin = r?.winner === 'villain';
                  const isDraw = r?.winner === 'draw';
                  return (
                    <div
                      key={idx}
                      className={`py-1.5 px-2 rounded-lg border text-center text-[11px] font-bold tracking-wider uppercase ${
                        isHeroWin
                          ? 'bg-[rgba(14,116,144,0.34)] border-[#36e8ff]/70 text-[#baf7ff]'
                          : isVillainWin
                            ? 'bg-[rgba(154,36,14,0.38)] border-[#ff6a2b]/70 text-[#ffd2ba]'
                            : isDraw
                              ? 'bg-[rgba(161,98,7,0.32)] border-[#f3cb7d]/60 text-[#fef08a]'
                              : idx + 1 === MAX_ROUNDS_WITH_TIEBREAKER
                                ? 'bg-[rgba(234,179,8,0.1)] border-[#facc15]/40 text-[#fde047]'
                                : 'bg-white/[0.03] border-white/10 text-white/40'
                      }`}
                    >
                      R{idx + 1}
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between text-xs text-[#cbd5e1] tabular-nums">
                <span>Meadow {lastRoundOutcome.heroPercent.toFixed(1)}%</span>
                <span>Desert {lastRoundOutcome.villainPercent.toFixed(1)}%</span>
              </div>
              <div className="mt-1.5 w-full h-2.5 rounded-full overflow-hidden bg-[#2b140d] flex border border-white/10">
                <div
                  className="h-full bg-[linear-gradient(90deg,#12b8ff,#2dd4bf)]"
                  style={{ width: `${lastRoundOutcome.heroPercent}%` }}
                />
                <div
                  className="h-full bg-[linear-gradient(90deg,#f97316,#dc2626)]"
                  style={{ width: `${lastRoundOutcome.villainPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center gap-2.5">
              <button
                type="button"
                data-testid="next-round-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  arenaSound.playUiClick();
                  controllerRef.current?.advanceRound();
                }}
                className="w-full py-3 px-5 rounded-xl font-display text-sm font-bold tracking-[0.12em] uppercase bg-[linear-gradient(90deg,#30f0ff,#ffd147)] text-[#09131a] shadow-[0_0_24px_rgba(48,240,255,0.28)] hover:brightness-110 transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
              >
                {lastRoundOutcome.roundNumber + 1 === MAX_ROUNDS_WITH_TIEBREAKER
                  ? 'Start Final Round 5'
                  : `Start Round ${lastRoundOutcome.roundNumber + 1}`}
              </button>
              <span className="text-[11px] font-medium tracking-wider uppercase text-[#9ca3b4] tabular-nums">
                Next round in {Math.max(1, Math.ceil(roundTransitionRemaining))}s
              </span>
            </div>
          </div>
        </div>
      )}

      {/* POST-MATCH 3D PODIUM VICTORY / DEFEAT OVERLAY & SYNCHRONIZED REMATCH */}
      {matchPhase === 'ended' && matchOutcome && !contextLost && (
        <PostMatchOverlay
          matchOutcome={matchOutcome}
          playerTeam={playerTeam}
          modeCfg={modeCfg}
          careerStats={resolveCareerDisplayStats({
            playerTeam,
            matchOutcome,
            cloudProfile: userProfile,
            fallbackHandle:
              onlinePlayers.find((p) => p.uid === localOnlineUid)?.displayName ||
              userProfile?.displayName ||
              authUser?.displayName ||
              guestProfile?.displayName ||
              (playerTeam === 'hero' ? 'AquaTrooper' : 'MagmaTrooper'),
            sessionStats: sessionCareerStats,
            isCloudSynced: Boolean(authUser?.emailVerified && userProfile),
          })}
          isOnline={isOnlineMatch}
          onlineRoomCode={onlineRoomCode}
          localPlayerUid={localOnlineUid}
          onlinePlayers={onlinePlayers}
          rematchVotes={rematchVotes}
          onRematch={handleRematch}
          onQuitToMenu={handleReturnToMenu}
        />
      )}

      {/* SETTINGS MODAL (Accessible from Lobby & In-Game Pause Menu) */}
      <SettingsModal
        open={settingsOpen}
        showLobbyBackdrop={matchPhase === 'menu'}
        title={matchPhase === 'playing' ? 'Match Settings' : 'Settings'}
        subtitle={
          matchPhase === 'playing'
            ? 'Paused · Audio · Controls · Display'
            : 'Audio · Controls · Display'
        }
        settings={settings}
        onChange={handleSettingsChange}
        onClose={() => setSettingsOpen(false)}
        onListeningChange={(listening) => controllerRef.current?.setKeybindListening(listening)}
      />

      {/* QUICK PLAY INSTANT MATCHMAKING OVERLAY */}
      <QuickPlayOverlay
        open={quickPlayOpen && matchPhase === 'menu'}
        modeId={selectedMode}
        preferredTeam={selectedTeam}
        localUid={quickPlayLocalUid}
        ticket={quickPlayTicket}
        errorMsg={quickPlayError}
        onCancel={handleCancelQuickPlay}
      />

      {/* MULTIPLAYER HUB & FRIEND LOBBIES MODAL */}
      <MultiplayerHubModal
        open={multiplayerOpen && matchPhase === 'menu'}
        authReady={authReady}
        authUser={authUser}
        profile={userProfile}
        defaultTeam={selectedTeam}
        defaultMode={selectedMode}
        activeLobbyCode={activeLobbyCode}
        onSetActiveLobbyCode={setActiveLobbyCode}
        onOpenAuth={() => {
          pendingQuickPlayRef.current = false;
          setAuthModalOpen(true);
        }}
        onLaunchOnlineMatch={handleLaunchOnlineMatch}
        onClose={() => setMultiplayerOpen(false)}
      />

      {/* ACCOUNT SIGN UP / LOGIN / PROFILE MODAL (stacks above Multiplayer Hub) */}
      <AuthModal
        open={authModalOpen}
        authUser={authUser}
        profile={userProfile}
        quickPlayMode={pendingQuickPlayRef.current ? selectedMode : null}
        onContinueAsGuest={handleContinueAsGuest}
        onClose={() => {
          if (!auth.currentUser || !auth.currentUser.emailVerified) {
            pendingQuickPlayRef.current = false;
          }
          setAuthModalOpen(false);
        }}
      />
    </div>
  );
}
