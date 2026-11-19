import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  buildSaveItArena,
  BuiltArenaResources,
  createSharedArenaEnvironment,
  SharedArenaEnvironment,
} from './arenaBuilder';
import { mulberry32 } from './terrainMath';
import {
  animateFirstPersonWeapon,
  animateTrooperRig,
  buildArmoredTrooper,
  buildFirstPersonWeaponRig,
  FirstPersonWeaponRig,
  TrooperRig,
  TrooperRole,
} from './trooperBuilder';
import {
  OnlinePlayerSummary,
} from './podiumAndRematch';
import { ElementalStreamSystem } from './streamSystem';
import { PickupAndGrenadeSystem } from './pickupAndGrenadeSystem';
import { arenaSound } from './soundFx';
import {
  BASE_PLAYER_SPEED,
  computeFpsLookAndBasis,
  computePlayerSprintState,
  DIZZY_DURATION_SECONDS,
  DIZZY_SPAWN_INTERVAL,
  drainAmmo,
  findDizzyVictims,
  GRENADE_SPAWN_INTERVAL,
  isWithinPickupRadius,
  MAX_AMMO,
  ObstacleCircle,
  pickValidArenaPoint,
  stepDizzyTimer,
} from './gameMechanics';
import {
  advanceRoundSeries,
  computeTeamSpawnPositions,
  computeTeamTerritoryPercents,
  COUNTDOWN_SECONDS,
  getLoadingStageLabel,
  getMatchModeConfig,
  GO_BANNER_DURATION_SECONDS,
  MATCH_DURATION_SECONDS,
  MAX_ROUNDS_WITH_TIEBREAKER,
  MatchModeId,
  MatchOutcome,
  MatchPhase,
  resolveMatchOutcome,
  ROUND_TRANSITION_SECONDS,
  RoundOutcome,
  SeriesProgressionResult,
  TOTAL_ROUNDS,
} from './matchConfig';
import { BotAiState, stepBotAi } from './botAi';
import {
  clampThirdPersonPitch,
  computeThirdPersonCameraPose,
} from './cameraAndMinimapMath';
import { MinimapRenderer } from './minimapRenderer';
import {
  BindableAction,
  GameSettings,
  loadSettings,
  matchesActionKey,
} from './gameSettings';
import {
  MultiplayerClient,
  OnlineBotSync,
  OnlineRoomSnapshot,
} from './multiplayerNet';

export interface OnlineMatchSessionConfig {
  roomCode: string;
  hostUid: string;
  playerUid: string;
  displayName: string;
  team: TrooperRole;
  modeId: MatchModeId;
}

export type CameraPresetId = 'isometric' | 'meadow' | 'desert' | 'seam' | 'island';
export type CameraMode = 'thirdPerson' | 'follow' | 'firstPerson' | 'orbit';

export interface CameraPreset {
  id: CameraPresetId;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
}

export const CAMERA_PRESETS: CameraPreset[] = [
  {
    id: 'isometric',
    label: 'Tactical Isometric',
    position: [4, 24, 51],
    target: [0, 0.2, -1.0],
  },
  {
    id: 'meadow',
    label: 'Lush Meadow',
    position: [-16, 7.2, 14.5],
    target: [-10, 1.1, 0],
  },
  {
    id: 'desert',
    label: 'Sahara Dunes',
    position: [17, 7.2, 14.5],
    target: [10, 1.0, 0],
  },
  {
    id: 'seam',
    label: 'Biome Border',
    position: [0, 8.2, 17],
    target: [0, 0.8, 0],
  },
  {
    id: 'island',
    label: 'Island Base',
    position: [28, 11, 46],
    target: [0, -2.5, 0],
  },
];

export interface ArenaHudSnapshot {
  matchPhase: MatchPhase;
  isPaused: boolean;
  matchMode: MatchModeId;
  playerTeam: TrooperRole;
  activeRole: TrooperRole;
  cameraMode: CameraMode;
  loadingProgress: number;
  loadingHeading: string;
  loadingStage: string;
  countdownRemainingSeconds: number;
  goBannerRemainingSeconds: number;
  timeRemainingSeconds: number;
  heroPercent: number;
  villainPercent: number;
  playerAmmo: number;
  playerHasGrenade: boolean;
  playerHasDizzyBomb: boolean;
  playerDizzyRemaining: number;
  teamOrbActive: boolean;
  isBoostSprinting: boolean;
  isMuted: boolean;
  currentRound: number;
  totalRounds: number;
  heroRoundsWon: number;
  villainRoundsWon: number;
  tiebreakerTriggered: boolean;
  roundHistory: RoundOutcome[];
  lastRoundOutcome: RoundOutcome | null;
  roundTransitionRemaining: number;
  matchOutcome: MatchOutcome | null;
  isOnline: boolean;
  onlineRoomCode: string | null;
  onlinePlayerCount: number;
  localPlayerUid: string | null;
  onlinePlayers: OnlinePlayerSummary[];
  rematchVotes: string[];
}

export interface ArenaController {
  startMatch: (
    playerTeam: TrooperRole,
    modeId: MatchModeId,
    options?: { skipIntro?: boolean; onlineSession?: OnlineMatchSessionConfig },
  ) => void;
  advanceRound: () => void;
  voteRematch: () => void;
  returnToMenu: () => void;
  restartMatch: (options?: { skipIntro?: boolean }) => void;
  setPaused: (paused: boolean) => void;
  togglePause: () => boolean;
  setCameraMode: (mode: CameraMode) => void;
  setPreset: (presetId: CameraPresetId) => void;
  setMinimapCanvas: (canvas: HTMLCanvasElement | null) => void;
  toggleMute: () => boolean;
  updateSettings: (settings: GameSettings) => void;
  setKeybindListening: (listening: boolean) => void;
  dispose: () => void;
}

interface TrooperRuntime {
  id: number;
  slotIndex: number;
  role: TrooperRole;
  isBot: boolean;
  remoteUid?: string;
  remoteDisplayName?: string;
  remoteTargetX?: number;
  remoteTargetZ?: number;
  remoteYaw?: number;
  remoteSpraying?: boolean;
  rig: TrooperRig;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  turnRate: number;
  walkPhase: number;
  throwAnimTimer: number;
  patrolCenterX: number;
  patrolCenterZ: number;
  patrolAngle: number;
  ammo: number;
  hasGrenade: boolean;
  hasDizzyBomb: boolean;
  grenadeSpawnTimer: number;
  dizzySpawnTimer: number;
  dizzyTimer: number;
  emptyCooldown: number;
  aiState: BotAiState;
  aiTargetX: number;
  aiTargetZ: number;
  aiRetargetTimer: number;
  aiSweepPhase: number;
}

declare global {
  interface Window {
    __saveItDebug?: {
      setTimeRemaining: (seconds: number) => void;
      advanceRoundNow: () => void;
      finishMatchNow: (winnerRole?: TrooperRole) => void;
      boostTeamTerritory: (role: TrooperRole) => void;
      drainPlayerAmmo: () => void;
      givePlayerDizzyBomb: () => void;
      spawnPersonalBombsForAll: () => void;
      setOrbitCamera: (pos: [number, number, number], target: [number, number, number]) => void;
      getState: () => {
        matchPhase: MatchPhase;
        isPaused: boolean;
        matchMode: MatchModeId;
        cameraMode: CameraMode;
        arenaSpan: number;
        trooperCount: number;
        timeRemainingSeconds: number;
        currentRound: number;
        totalRounds: number;
        heroRoundsWon: number;
        villainRoundsWon: number;
        tiebreakerTriggered: boolean;
        roundHistory: RoundOutcome[];
        matchOutcome: MatchOutcome | null;
        playerPos: [number, number, number];
        playerYaw: number;
        playerAmmo: number;
        playerHasDizzyBomb: boolean;
        playerDizzyRemaining: number;
        playerSignActive: boolean;
        visibleSignCount: number;
        visibleGrenadeCount: number;
        visibleDizzyCount: number;
        isBoostSprinting: boolean;
        isMuted: boolean;
        cameraPos: [number, number, number];
        troopers: Array<{
          id: number;
          role: TrooperRole;
          isBot: boolean;
          x: number;
          z: number;
          dizzyTimer: number;
          hasDizzyBomb: boolean;
        }>;
      };
    };
  }
}

function detectSoftwareGl(): boolean {
  const probe = document.createElement('canvas');
  const gl = probe.getContext('webgl2') || probe.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

function shortestAngleDiff(current: number, target: number): number {
  let diff = (target - current + Math.PI) % (Math.PI * 2);
  if (diff < 0) diff += Math.PI * 2;
  return diff - Math.PI;
}

function resolveSpawnPoint(
  sx: number,
  sz: number,
  obstacles: ReadonlyArray<ObstacleCircle>,
): { x: number; z: number } {
  let px = sx;
  let pz = sz;
  for (let pass = 0; pass < 3; pass++) {
    for (const obs of obstacles) {
      const dx = px - obs.x;
      const dz = pz - obs.z;
      const minD = obs.radius + 0.72;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD * minD) {
        const d = Math.sqrt(dSq) || 0.01;
        px = obs.x + (dx / d) * minD;
        pz = obs.z + (dz / d) * minD;
      }
    }
  }
  return { x: px, z: pz };
}

const FOLLOW_OFFSET = new THREE.Vector3(6.4, 9.6, 11.2);

export function mountSaveItArena(
  container: HTMLElement,
  callbacks?: {
    onContextLost?: (lost: boolean) => void;
    onHudChange?: (snapshot: ArenaHudSnapshot) => void;
  },
): ArenaController {
  const isSoftwareGl = detectSoftwareGl();

  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('data-testid', 'arena-canvas');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const sharedEnv: SharedArenaEnvironment = createSharedArenaEnvironment(scene, renderer, isSoftwareGl);

  // Camera & Controls (added to scene so FPS viewmodels render cleanly)
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.14, 760);
  camera.rotation.order = 'YXZ';

  const fpHeroRig: FirstPersonWeaponRig = buildFirstPersonWeaponRig('hero', sharedEnv.textures, isSoftwareGl);
  const fpVillainRig: FirstPersonWeaponRig = buildFirstPersonWeaponRig('villain', sharedEnv.textures, isSoftwareGl);
  fpHeroRig.root.visible = false;
  fpVillainRig.root.visible = false;
  camera.add(fpHeroRig.root, fpVillainRig.root);
  scene.add(camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = !isSoftwareGl;
  controls.dampingFactor = 0.065;
  controls.rotateSpeed = 0.72;
  controls.panSpeed = 0.8;
  controls.zoomSpeed = 0.95;
  controls.minDistance = 5.0;
  controls.maxDistance = 105;
  controls.minPolarAngle = 0.14;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.screenSpacePanning = false;

  // Match & Arena State
  let currentSettings: GameSettings = loadSettings();
  arenaSound.applyAudioSettings(currentSettings);
  let matchPhase: MatchPhase = 'menu';
  let isPaused = false;
  let keybindListening = false;
  let currentMode: MatchModeId = '2v2';
  let playerTeam: TrooperRole = 'hero';
  let cameraMode: CameraMode = 'thirdPerson';
  let loadingProgress = 0;
  let loadingHeading = 'Match Prep';
  let loadingStage = getLoadingStageLabel(0);
  let countdownRemainingSeconds = COUNTDOWN_SECONDS;
  let goBannerRemainingSeconds = 0;
  let lastCountdownBeep = 0;
  let matchStartSeq = 0;
  const loadingTimerIds: number[] = [];
  let timeRemainingSeconds = MATCH_DURATION_SECONDS;
  let currentRound = 1;
  let heroRoundsWon = 0;
  let villainRoundsWon = 0;
  let tiebreakerTriggered = false;
  let roundHistory: RoundOutcome[] = [];
  let lastRoundOutcome: RoundOutcome | null = null;
  let roundTransitionRemaining = 0;
  let matchOutcome: MatchOutcome | null = null;
  let activeOnlineSession: OnlineMatchSessionConfig | null = null;
  let multiplayerClient: MultiplayerClient | null = null;
  let latestRoomSnapshot: OnlineRoomSnapshot | null = null;
  let localOnlineSlotIndex = 0;
  let onlineSprayBrushAccum = 0;
  let onlineBotBrushAccum = 0;

  let arena!: BuiltArenaResources;
  let streamSystem!: ElementalStreamSystem;
  let pickups!: PickupAndGrenadeSystem;
  let troopers: TrooperRuntime[] = [];
  let playerTrooper!: TrooperRuntime;
  let dustAttr!: THREE.BufferAttribute;
  let dustCount = 0;
  let minimapCanvas: HTMLCanvasElement | null = null;
  const minimapRenderer = new MinimapRenderer();

  let spawnRng = mulberry32(20261117);
  let aiRng = mulberry32(884217);

  let orbitTransitionActive = false;
  const desiredCamPos = new THREE.Vector3(28, 22, 28);
  const desiredTarget = new THREE.Vector3(0, 0.5, 0);

  let tpYaw = Math.PI * 0.5;
  let tpPitch = -0.22;
  let fpsYaw = Math.PI * 1.5;
  let fpsPitch = -0.14;
  let lastPointerClient: { x: number; y: number } | null = null;

  const keysPressed = new Set<string>();
  let shiftModifierHeld = false;
  const mouseNdc = new THREE.Vector2(0.18, -0.05);
  const _centerNdc = new THREE.Vector2(0, 0);
  let hasPointerMoved = false;
  let pointerFiring = false;
  let grenadeThrowQueued = false;
  let dizzyThrowQueued = false;
  let cameraTrauma = 0;
  let mouseAimWorld = new THREE.Vector3(0, 0, 0);

  const raycaster = new THREE.Raycaster();
  const fallbackPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _hitPoint = new THREE.Vector3();
  const _muzzlePos = new THREE.Vector3();
  const _botTargetPos = new THREE.Vector3();
  const _camForward = new THREE.Vector3();
  const _camRight = new THREE.Vector3();
  const _moveVec = new THREE.Vector3();

  let composer: EffectComposer | null = null;
  let bloomPass: UnrealBloomPass | null = null;
  if (!isSoftwareGl) {
    composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.08,
      0.3,
      1.25,
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
  }

  function exitPointerLockIfNeeded() {
    if (document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock?.();
    }
    lastPointerClient = null;
  }

  function clearHeldInputs() {
    keysPressed.clear();
    shiftModifierHeld = false;
    pointerFiring = false;
    grenadeThrowQueued = false;
    dizzyThrowQueued = false;
    arenaSound.setElementalSpray(null);
  }

  function syncVisibilityAndFpsPose() {
    const isPlayingFps =
      (matchPhase === 'playing' || matchPhase === 'countdown') && cameraMode === 'firstPerson';
    for (let i = 0; i < troopers.length; i++) {
      const t = troopers[i];
      t.rig.root.visible = !(isPlayingFps && t === playerTrooper);
    }
    fpHeroRig.root.visible = isPlayingFps && playerTeam === 'hero';
    fpVillainRig.root.visible = isPlayingFps && playerTeam === 'villain';
  }

  function snapFirstPersonCameraToPlayer(headBobY = 0, strafeRoll = 0) {
    const basis = computeFpsLookAndBasis(fpsYaw, fpsPitch);
    fpsPitch = basis.clampedPitch;
    playerTrooper.yaw = basis.charYaw;
    const eyeX = playerTrooper.x + Math.sin(playerTrooper.yaw) * 0.14;
    const eyeY = playerTrooper.y + 1.62 + headBobY;
    const eyeZ = playerTrooper.z + Math.cos(playerTrooper.yaw) * 0.14;
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.rotation.set(fpsPitch, fpsYaw, strafeRoll, 'YXZ');
    camera.updateMatrixWorld(true);
  }

  function snapFollowCameraToPlayer() {
    controls.target.set(playerTrooper.x, playerTrooper.y + 0.9, playerTrooper.z);
    camera.position.set(
      playerTrooper.x + FOLLOW_OFFSET.x,
      playerTrooper.y + FOLLOW_OFFSET.y,
      playerTrooper.z + FOLLOW_OFFSET.z,
    );
    controls.update();
  }

  function snapThirdPersonCameraToPlayer() {
    const pose = computeThirdPersonCameraPose({
      playerX: playerTrooper.x,
      playerY: playerTrooper.y,
      playerZ: playerTrooper.z,
      camYaw: tpYaw,
      camPitch: tpPitch,
      sampleGroundHeight: (gx, gz) => arena.terrainSim.sampleHeight(gx, gz),
    });
    camera.position.set(pose.camX, pose.camY, pose.camZ);
    controls.target.set(pose.lookX, pose.lookY, pose.lookZ);
    camera.lookAt(controls.target);
    camera.updateMatrixWorld(true);
    return pose;
  }

  function renderMinimapNow(elapsed: number) {
    if (!minimapCanvas || (matchPhase !== 'playing' && matchPhase !== 'countdown')) return;
    camera.getWorldDirection(_camForward);
    const camYaw = Math.atan2(_camForward.x, _camForward.z);
    const playerSign = pickups.getSignForOwner(playerTrooper.id);
    const playerGrenade = pickups.getGrenadePickupForOwner(playerTrooper.id);
    const playerDizzy = pickups.getDizzyPickupForOwner(playerTrooper.id);
    const personalPickups: Array<{
      role: TrooperRole;
      kind: 'orb' | 'grenade' | 'dizzy';
      active: boolean;
      x: number;
      z: number;
    }> = [];
    if (playerSign?.active) {
      personalPickups.push({
        role: playerSign.role,
        kind: 'orb',
        active: true,
        x: playerSign.x,
        z: playerSign.z,
      });
    }
    if (playerGrenade?.active) {
      personalPickups.push({
        role: playerGrenade.role,
        kind: 'grenade',
        active: true,
        x: playerGrenade.x,
        z: playerGrenade.z,
      });
    }
    if (playerDizzy?.active) {
      personalPickups.push({
        role: playerDizzy.role,
        kind: 'dizzy',
        active: true,
        x: playerDizzy.x,
        z: playerDizzy.z,
      });
    }

    minimapRenderer.draw(minimapCanvas, {
      terrain: arena.terrainSim,
      obstacles: arena.treeObstacles,
      actors: troopers.map((t) => ({
        role: t.role,
        isPlayer: t === playerTrooper,
        x: t.x,
        z: t.z,
        yaw: t.yaw,
      })),
      pickups: personalPickups,
      playerTeam,
      cameraYaw: camYaw,
      aimX: mouseAimWorld.x,
      aimZ: mouseAimWorld.z,
      showAimMarker: cameraMode !== 'orbit',
      elapsed,
    });
  }

  function resetSeriesState() {
    currentRound = 1;
    heroRoundsWon = 0;
    villainRoundsWon = 0;
    tiebreakerTriggered = false;
    roundHistory = [];
    lastRoundOutcome = null;
    roundTransitionRemaining = 0;
    matchOutcome = null;
  }

  function rebuildMatchScene(
    nextTeam: TrooperRole,
    modeId: MatchModeId,
    phase: MatchPhase,
    options?: { preserveSeries?: boolean; previewMenu?: boolean },
  ) {
    exitPointerLockIfNeeded();
    clearHeldInputs();
    orbitTransitionActive = false;
    cameraTrauma = 0;
    isPaused = false;
    arenaSound.setPaused(false);

    if (!options?.preserveSeries) {
      resetSeriesState();
    }

    playerTeam = nextTeam;
    currentMode = modeId;
    matchPhase = phase;
    timeRemainingSeconds = MATCH_DURATION_SECONDS;
    matchOutcome = null;
    spawnRng = mulberry32(20261117 + (phase === 'menu' ? 0 : 99 + currentRound * 37));
    aiRng = mulberry32(884217 + modeId.charCodeAt(0) * 31 + currentRound * 53);

    // Dispose prior arena & actors
    if (streamSystem) streamSystem.dispose();
    if (pickups) pickups.dispose();
    for (let i = 0; i < troopers.length; i++) {
      troopers[i].rig.dispose();
    }
    troopers = [];
    if (arena) arena.dispose();

    const modeCfg = getMatchModeConfig(modeId);
    const half = modeCfg.arenaSpan / 2;
    const heroSpawns = computeTeamSpawnPositions(modeCfg.teamSize, half, 'hero');
    const villainSpawns = computeTeamSpawnPositions(modeCfg.teamSize, half, 'villain');
    const spawnAvoidPoints = [...heroSpawns, ...villainSpawns].map((s) => ({ x: s.x, z: s.z }));

    arena = buildSaveItArena(scene, renderer, isSoftwareGl, {
      arenaSpan: modeCfg.arenaSpan,
      terrainSegments: modeCfg.terrainSegments,
      spawnAvoidPoints,
      sharedEnv,
      seed: 20261117 + modeCfg.arenaSpan * 17,
    });

    dustAttr = arena.dustPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    dustCount = dustAttr.count;
    controls.maxDistance = Math.max(88, arena.arenaHalfSize * 3.15);

    let nextId = 0;
    const spawnSquad = (
      role: TrooperRole,
      spawns: Array<{ x: number; z: number; yaw: number }>,
    ) => {
      for (let i = 0; i < spawns.length; i++) {
        const pt = resolveSpawnPoint(spawns[i].x, spawns[i].z, arena.treeObstacles);
        const rig = buildArmoredTrooper(role, sharedEnv.textures, isSoftwareGl);
        const y = arena.terrainSim.sampleHeight(pt.x, pt.z);
        rig.root.position.set(pt.x, y, pt.z);
        rig.root.rotation.y = spawns[i].yaw;
        arena.arenaRoot.add(rig.root);

        const isPlayer =
          role === playerTeam &&
          i === (activeOnlineSession ? Math.min(spawns.length - 1, localOnlineSlotIndex) : 0);
        const runtime: TrooperRuntime = {
          id: nextId++,
          slotIndex: i,
          role,
          isBot: !isPlayer,
          rig,
          x: pt.x,
          y,
          z: pt.z,
          vx: 0,
          vz: 0,
          yaw: spawns[i].yaw,
          turnRate: 0,
          walkPhase: i * 1.1,
          throwAnimTimer: 0,
          patrolCenterX: pt.x,
          patrolCenterZ: pt.z,
          patrolAngle: i * 1.7 + (role === 'villain' ? Math.PI : 0),
          ammo: MAX_AMMO,
          hasGrenade: false,
          hasDizzyBomb: false,
          grenadeSpawnTimer: isPlayer ? 11.5 : 10.2 + i * 1.2,
          dizzySpawnTimer: isPlayer ? 9.5 : 8.4 + i * 1.1,
          dizzyTimer: 0,
          emptyCooldown: 0,
          aiState: 'expand',
          aiTargetX: (role === 'hero' ? 1 : -1) * Math.min(half * 0.45, 8.5),
          aiTargetZ: pt.z,
          aiRetargetTimer: 0.25 + i * 0.35,
          aiSweepPhase: nextId * 1.618,
        };
        troopers.push(runtime);
        if (isPlayer) {
          playerTrooper = runtime;
        }
      }
    };

    spawnSquad('hero', heroSpawns);
    spawnSquad('villain', villainSpawns);
    if (!playerTrooper && troopers.length > 0) {
      playerTrooper = troopers[0];
      playerTrooper.isBot = false;
    }

    streamSystem = new ElementalStreamSystem(arena.arenaRoot);
    pickups = new PickupAndGrenadeSystem(
      arena.arenaRoot,
      troopers.map((t) => ({ id: t.id, role: t.role, isPlayer: t === playerTrooper })),
    );

    if (phase === 'menu' || options?.previewMenu) {
      cameraMode = 'thirdPerson';
      controls.enabled = false;
      camera.fov = 45;
      camera.updateProjectionMatrix();
      const orbitR = arena.arenaHalfSize * 2.15;
      camera.position.set(orbitR * 0.42, arena.arenaHalfSize * 0.96, orbitR * 0.91);
      controls.target.set(0, -0.5, 0);
      camera.lookAt(controls.target);
      streamSystem.reticleGroup.visible = false;
      arenaSound.setElementalSpray(null);
      arenaSound.setGameplayMusicState(false, 0);
      arenaSound.setLobbyMusicActive(true);
    } else {
      cameraMode = currentSettings.defaultCameraMode;
      controls.enabled = false;
      const baseFov =
        (cameraMode === 'firstPerson' ? 62 : cameraMode === 'thirdPerson' ? 52 : 45) +
        currentSettings.fovBoost;
      camera.fov = Math.max(38, Math.min(85, baseFov));
      camera.updateProjectionMatrix();
      tpYaw = playerTrooper.yaw;
      tpPitch = -0.22;
      fpsYaw = playerTrooper.yaw + Math.PI;
      fpsPitch = -0.14;
      const aheadX = playerTrooper.x + Math.sin(playerTrooper.yaw) * 7.5;
      const aheadZ = playerTrooper.z + Math.cos(playerTrooper.yaw) * 7.5;
      mouseAimWorld.set(aheadX, arena.terrainSim.sampleHeight(aheadX, aheadZ), aheadZ);
      if (cameraMode === 'firstPerson') {
        snapFirstPersonCameraToPlayer();
      } else if (cameraMode === 'follow') {
        snapFollowCameraToPlayer();
      } else {
        snapThirdPersonCameraToPlayer();
      }
      streamSystem.reticleGroup.visible = phase === 'playing';
      arenaSound.setLobbyMusicActive(false);
      arenaSound.setGameplayMusicState(phase === 'playing', 0);
      arenaSound.setElementalSpray(null);
    }

    syncVisibilityAndFpsPose();
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    emitHud(true);
    renderMinimapNow(0);
  }

  let lastReportedKey = '';
  let isPlayerBoostSprinting = false;
  const emitHud = (force = false) => {
    const fallbackPercents = computeTeamTerritoryPercents(
      arena.terrainSim.getMeadowRatio(),
    );
    const heroPercent =
      activeOnlineSession && latestRoomSnapshot
        ? latestRoomSnapshot.heroPercent
        : fallbackPercents.heroPercent;
    const villainPercent =
      activeOnlineSession && latestRoomSnapshot
        ? latestRoomSnapshot.villainPercent
        : fallbackPercents.villainPercent;
    const pAmmo = Math.round(playerTrooper.ammo);
    const timeKey = Math.ceil(timeRemainingSeconds);
    const loadKey = Math.round(loadingProgress * 100);
    const countdownKey = Math.ceil(countdownRemainingSeconds * 10);
    const goKey = Math.ceil(goBannerRemainingSeconds * 10);
    const dizzyKey = Math.ceil(playerTrooper.dizzyTimer * 10);
    const playerSign = pickups.getSignForOwner(playerTrooper.id);
    const teamOrbActive = Boolean(playerSign?.active);
    const muted = arenaSound.isMuted();
    const effectiveTotalRounds =
      tiebreakerTriggered ||
      currentRound > TOTAL_ROUNDS ||
      roundHistory.length > TOTAL_ROUNDS
        ? MAX_ROUNDS_WITH_TIEBREAKER
        : TOTAL_ROUNDS;
    const outcomeKey = matchOutcome ? `${matchOutcome.winner}:${matchOutcome.playerWon}` : 'none';
    const onlinePlayersList: OnlinePlayerSummary[] = latestRoomSnapshot
      ? latestRoomSnapshot.players.map((p) => ({
          uid: p.uid,
          displayName: p.displayName,
          team: p.team,
          isHost: p.isHost,
        }))
      : activeOnlineSession
        ? [
            {
              uid: activeOnlineSession.playerUid,
              displayName: activeOnlineSession.displayName,
              team: activeOnlineSession.team,
              isHost: activeOnlineSession.hostUid === activeOnlineSession.playerUid,
            },
          ]
        : [];
    const rematchVotes = latestRoomSnapshot?.rematchVotes ?? [];
    const onlineCount = onlinePlayersList.length;
    const onlineKey = activeOnlineSession
      ? `${activeOnlineSession.roomCode}:${onlineCount}:${onlinePlayersList.map((p) => p.uid).join(',')}:${rematchVotes.join(',')}`
      : 'offline';
    const seriesKey = `${currentRound}:${effectiveTotalRounds}:${heroRoundsWon}:${villainRoundsWon}:${tiebreakerTriggered}:${roundHistory.length}:${Math.ceil(roundTransitionRemaining * 10)}`;
    const key = `${matchPhase}:${isPaused}:${currentMode}:${playerTeam}:${cameraMode}:${loadKey}:${loadingHeading}:${loadingStage}:${countdownKey}:${goKey}:${timeKey}:${heroPercent.toFixed(1)}:${pAmmo}:${playerTrooper.hasGrenade}:${playerTrooper.hasDizzyBomb}:${dizzyKey}:${teamOrbActive}:${isPlayerBoostSprinting}:${muted}:${seriesKey}:${outcomeKey}:${onlineKey}`;

    if (force || key !== lastReportedKey) {
      lastReportedKey = key;
      callbacks?.onHudChange?.({
        matchPhase,
        isPaused,
        matchMode: currentMode,
        playerTeam,
        activeRole: playerTeam,
        cameraMode,
        loadingProgress,
        loadingHeading,
        loadingStage,
        countdownRemainingSeconds,
        goBannerRemainingSeconds,
        timeRemainingSeconds,
        heroPercent,
        villainPercent,
        playerAmmo: pAmmo,
        playerHasGrenade: playerTrooper.hasGrenade,
        playerHasDizzyBomb: playerTrooper.hasDizzyBomb,
        playerDizzyRemaining: playerTrooper.dizzyTimer,
        teamOrbActive,
        isBoostSprinting: isPlayerBoostSprinting,
        isMuted: muted,
        currentRound,
        totalRounds: effectiveTotalRounds,
        heroRoundsWon,
        villainRoundsWon,
        tiebreakerTriggered,
        roundHistory: [...roundHistory],
        lastRoundOutcome,
        roundTransitionRemaining,
        matchOutcome,
        isOnline: Boolean(activeOnlineSession),
        onlineRoomCode: activeOnlineSession?.roomCode ?? null,
        onlinePlayerCount: onlineCount,
        localPlayerUid: activeOnlineSession?.playerUid ?? null,
        onlinePlayers: onlinePlayersList,
        rematchVotes: [...rematchVotes],
      });
    }
  };

  // Initial Lobby / Rotating 3D Preview Arena (40x40 2v2 showcase)
  rebuildMatchScene('hero', '2v2', 'menu');

  const updatePointerNdc = (clientX: number, clientY: number) => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    mouseNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouseNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    hasPointerMoved = true;
  };

  let ignoreNextLockedMoves = 0;

  const onPointerLockChange = () => {
    if (document.pointerLockElement === renderer.domElement) {
      ignoreNextLockedMoves = 2;
    } else {
      lastPointerClient = null;
    }
  };

  function isActionHeld(action: BindableAction): boolean {
    const bound = currentSettings.keybinds[action];
    for (const code of keysPressed) {
      if (matchesActionKey(code, bound)) return true;
    }
    if (action === 'sprintBoost' && shiftModifierHeld && matchesActionKey('ShiftLeft', bound)) {
      return true;
    }
    return false;
  }

  function setPausedInternal(nextPaused: boolean) {
    if (matchPhase !== 'playing' || isPaused === nextPaused) return;
    isPaused = nextPaused;
    if (nextPaused) {
      exitPointerLockIfNeeded();
      clearHeldInputs();
      controls.enabled = false;
      arenaSound.setPaused(true);
    } else {
      lastTimeMs = performance.now();
      controls.enabled = cameraMode === 'orbit';
      arenaSound.setPaused(false);
    }
    emitHud(true);
  }

  const applyFpsLookDelta = (dx: number, dy: number, sensitivity: number) => {
    const clampedDx = Math.max(-64, Math.min(64, dx));
    const clampedDy = Math.max(-64, Math.min(64, dy));
    const sens = sensitivity * currentSettings.mouseSensitivity;
    const ySign = currentSettings.invertY ? -1 : 1;
    fpsYaw -= clampedDx * sens;
    fpsPitch = computeFpsLookAndBasis(fpsYaw, fpsPitch - clampedDy * sens * ySign).clampedPitch;
  };

  const applyThirdPersonLookDelta = (dx: number, dy: number, sensitivity: number) => {
    const clampedDx = Math.max(-64, Math.min(64, dx));
    const clampedDy = Math.max(-64, Math.min(64, dy));
    const sens = sensitivity * currentSettings.mouseSensitivity;
    const ySign = currentSettings.invertY ? -1 : 1;
    tpYaw -= clampedDx * sens;
    tpPitch = clampThirdPersonPitch(tpPitch - clampedDy * sens * ySign);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (matchPhase !== 'playing' || isPaused) return;
    updatePointerNdc(e.clientX, e.clientY);
    if (cameraMode === 'firstPerson' || cameraMode === 'thirdPerson') {
      if (document.pointerLockElement === renderer.domElement) {
        if (ignoreNextLockedMoves > 0) {
          ignoreNextLockedMoves--;
          return;
        }
        if (cameraMode === 'firstPerson') {
          applyFpsLookDelta(e.movementX, e.movementY, 0.0024);
        } else {
          applyThirdPersonLookDelta(e.movementX, e.movementY, 0.0026);
        }
      } else {
        if (!lastPointerClient) {
          lastPointerClient = { x: e.clientX, y: e.clientY };
          return;
        }
        const dx = e.clientX - lastPointerClient.x;
        const dy = e.clientY - lastPointerClient.y;
        lastPointerClient = { x: e.clientX, y: e.clientY };
        if (cameraMode === 'firstPerson') {
          applyFpsLookDelta(dx, dy, 0.0036);
        } else {
          applyThirdPersonLookDelta(dx, dy, 0.0034);
        }
      }
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    arenaSound.unlock();
    if (matchPhase !== 'playing' || isPaused || keybindListening) return;
    const targetEl = e.target instanceof Element ? e.target : null;
    if (targetEl?.closest('.pointer-events-auto')) return;
    if (
      targetEl &&
      targetEl !== renderer.domElement &&
      targetEl !== container &&
      targetEl !== document.body &&
      targetEl !== document.documentElement
    ) {
      return;
    }
    updatePointerNdc(e.clientX, e.clientY);
    if (cameraMode === 'firstPerson' || cameraMode === 'thirdPerson') {
      lastPointerClient = { x: e.clientX, y: e.clientY };
      if (document.pointerLockElement !== renderer.domElement) {
        try {
          const lockPromise = renderer.domElement.requestPointerLock?.() as unknown;
          if (lockPromise && typeof (lockPromise as Promise<void>).catch === 'function') {
            (lockPromise as Promise<void>).catch(() => {});
          }
        } catch {
          // Fallback to pointer delta
        }
      }
    }
    if (e.button === 0 && cameraMode !== 'orbit') {
      pointerFiring = true;
    } else if (e.button === 2 && cameraMode !== 'orbit') {
      grenadeThrowQueued = true;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.button === 0) {
      pointerFiring = false;
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    arenaSound.unlock();
    shiftModifierHeld = e.shiftKey;
    if (keybindListening || matchPhase !== 'playing') return;

    if (
      !e.repeat &&
      (matchesActionKey(e.code, currentSettings.keybinds.pauseMenu) ||
        (e.code === 'KeyP' && currentSettings.keybinds.pauseMenu === 'Escape'))
    ) {
      e.preventDefault();
      setPausedInternal(!isPaused);
      return;
    }

    if (isPaused) return;

    if (!e.repeat && matchesActionKey(e.code, currentSettings.keybinds.toggleCamera)) {
      setCameraModeInternal(cameraMode === 'thirdPerson' ? 'follow' : 'thirdPerson');
      return;
    }
    if (!e.repeat && matchesActionKey(e.code, currentSettings.keybinds.toggleOrbit)) {
      setCameraModeInternal(cameraMode === 'orbit' ? 'thirdPerson' : 'orbit');
      return;
    }
    if (!e.repeat && matchesActionKey(e.code, currentSettings.keybinds.toggleFirstPerson)) {
      setCameraModeInternal(cameraMode === 'firstPerson' ? 'thirdPerson' : 'firstPerson');
      return;
    }
    if (matchesActionKey(e.code, currentSettings.keybinds.throwGrenade)) {
      e.preventDefault();
      if (!e.repeat) {
        grenadeThrowQueued = true;
      }
      return;
    }
    if (matchesActionKey(e.code, currentSettings.keybinds.throwDizzy)) {
      e.preventDefault();
      if (!e.repeat) {
        dizzyThrowQueued = true;
      }
      return;
    }
    keysPressed.add(e.code);
  };

  const onKeyUp = (e: KeyboardEvent) => {
    shiftModifierHeld = e.shiftKey;
    keysPressed.delete(e.code);
  };

  const handleControlStart = () => {
    orbitTransitionActive = false;
  };

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    callbacks?.onContextLost?.(true);
  };
  const handleContextRestored = () => {
    callbacks?.onContextLost?.(false);
  };

  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  renderer.domElement.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearHeldInputs);
  document.addEventListener('visibilitychange', clearHeldInputs);
  controls.addEventListener('start', handleControlStart);
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const w = Math.max(Math.round(entry.contentRect.width), 1);
      const h = Math.max(Math.round(entry.contentRect.height), 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (composer && bloomPass) {
        composer.setSize(w, h);
        bloomPass.resolution.set(w, h);
      }
    }
  });
  resizeObserver.observe(container);

  function setCameraModeInternal(mode: CameraMode) {
    if (matchPhase !== 'playing' || cameraMode === mode) return;
    const prevMode = cameraMode;
    cameraMode = mode;
    controls.enabled = mode === 'orbit';
    orbitTransitionActive = false;
    streamSystem.reticleGroup.visible = mode !== 'orbit';

    if ((prevMode === 'firstPerson' || prevMode === 'thirdPerson') && mode !== 'firstPerson' && mode !== 'thirdPerson') {
      exitPointerLockIfNeeded();
      camera.rotation.z = 0;
    }

    if (mode === 'firstPerson') {
      pointerFiring = false;
      fpsYaw = (prevMode === 'thirdPerson' ? tpYaw : playerTrooper.yaw) + Math.PI;
      fpsPitch = prevMode === 'thirdPerson' ? clampThirdPersonPitch(tpPitch + 0.06) : -0.14;
      lastPointerClient = null;
      camera.fov = Math.max(38, Math.min(85, 62 + currentSettings.fovBoost));
      camera.updateProjectionMatrix();
      syncVisibilityAndFpsPose();
      snapFirstPersonCameraToPlayer();
    } else if (mode === 'thirdPerson') {
      pointerFiring = false;
      tpYaw =
        prevMode === 'firstPerson'
          ? computeFpsLookAndBasis(fpsYaw, fpsPitch).charYaw
          : playerTrooper.yaw;
      tpPitch = prevMode === 'firstPerson' ? clampThirdPersonPitch(fpsPitch - 0.06) : -0.22;
      lastPointerClient = null;
      camera.fov = Math.max(38, Math.min(85, 52 + currentSettings.fovBoost));
      camera.updateProjectionMatrix();
      syncVisibilityAndFpsPose();
      snapThirdPersonCameraToPlayer();
    } else {
      camera.fov = Math.max(38, Math.min(85, 45 + currentSettings.fovBoost));
      camera.updateProjectionMatrix();
      syncVisibilityAndFpsPose();
      if (mode === 'follow') {
        pointerFiring = false;
        if (isSoftwareGl) {
          snapFollowCameraToPlayer();
        }
      } else if (mode === 'orbit') {
        pointerFiring = false;
        desiredTarget.set(playerTrooper.x, playerTrooper.y + 0.9, playerTrooper.z);
        desiredCamPos.set(
          playerTrooper.x + 11.5,
          playerTrooper.y + 13.0,
          playerTrooper.z + 13.5,
        );
        if (isSoftwareGl) {
          camera.position.copy(desiredCamPos);
          controls.target.copy(desiredTarget);
          controls.update();
        } else {
          orbitTransitionActive = true;
        }
      }
    }
    emitHud(true);
    if (isSoftwareGl) renderOneFrame();
  }

  function resolveTrooperCollisions(t: TrooperRuntime) {
    const limit = arena.arenaHalfSize - 0.85;
    t.x = Math.max(-limit, Math.min(limit, t.x));
    t.z = Math.max(-limit, Math.min(limit, t.z));

    for (let i = 0; i < arena.treeObstacles.length; i++) {
      const obs = arena.treeObstacles[i];
      const dx = t.x - obs.x;
      const dz = t.z - obs.z;
      const minD = obs.radius + 0.45;
      const dSq = dx * dx + dz * dz;
      if (dSq < minD * minD) {
        const d = Math.sqrt(dSq) || 0.001;
        t.x = obs.x + (dx / d) * minD;
        t.z = obs.z + (dz / d) * minD;
      }
    }

    for (let i = 0; i < troopers.length; i++) {
      const other = troopers[i];
      if (other.id === t.id) continue;
      const ox = t.x - other.x;
      const oz = t.z - other.z;
      const minCharDist = 1.05;
      const odSq = ox * ox + oz * oz;
      if (odSq < minCharDist * minCharDist) {
        const d = Math.sqrt(odSq) || 0.001;
        t.x = other.x + (ox / d) * minCharDist;
        t.z = other.z + (oz / d) * minCharDist;
      }
    }

    t.x = Math.max(-limit, Math.min(limit, t.x));
    t.z = Math.max(-limit, Math.min(limit, t.z));
  }

  function finishMatch(series?: SeriesProgressionResult) {
    if (matchPhase === 'ended') return;
    matchPhase = 'ended';
    isPaused = false;
    timeRemainingSeconds = 0;
    roundTransitionRemaining = 0;
    isPlayerBoostSprinting = false;
    arenaSound.setPaused(false);
    arenaSound.setElementalSpray(null);
    arenaSound.setGameplayMusicState(false, 0);
    exitPointerLockIfNeeded();
    clearHeldInputs();
    controls.enabled = false;
    camera.fov = 45;
    camera.rotation.z = 0;
    camera.updateProjectionMatrix();
    streamSystem.reticleGroup.visible = false;
    syncVisibilityAndFpsPose();
    matchOutcome = resolveMatchOutcome(playerTeam, arena.terrainSim.getMeadowRatio(), series);
    arenaSound.playMatchEndFanfare(matchOutcome.playerWon);
    emitHud(true);
  }

  function advanceToNextRound() {
    if (matchPhase !== 'roundEnd') return;
    const seq = ++matchStartSeq;
    clearLoadingTimers();
    exitPointerLockIfNeeded();
    clearHeldInputs();
    isPaused = false;
    arenaSound.setPaused(false);
    arenaSound.setElementalSpray(null);
    arenaSound.setLobbyMusicActive(false);
    arenaSound.setGameplayMusicState(false, 0);

    currentRound = Math.min(MAX_ROUNDS_WITH_TIEBREAKER, roundHistory.length + 1);
    const isTiebreakerRound = currentRound === MAX_ROUNDS_WITH_TIEBREAKER;
    roundTransitionRemaining = 0;
    lastRoundOutcome = null;
    countdownRemainingSeconds = COUNTDOWN_SECONDS;
    lastCountdownBeep = 3;
    goBannerRemainingSeconds = 0;

    matchPhase = 'loading';
    loadingHeading = isTiebreakerRound ? 'Final Tiebreaker' : `Round ${currentRound} Prep`;
    loadingProgress = 0.2;
    loadingStage = isTiebreakerRound
      ? 'Preparing Final Round 5 Arena...'
      : `Preparing Round ${currentRound} Arena...`;
    emitHud(true);

    const scheduleStage = (delayMs: number, fn: () => void) => {
      const tid = window.setTimeout(() => {
        if (disposed || seq !== matchStartSeq) return;
        fn();
      }, delayMs);
      loadingTimerIds.push(tid);
    };

    scheduleStage(60, () => {
      loadingProgress = 0.48;
      loadingStage = getLoadingStageLabel(0.42);
      emitHud(true);
    });

    scheduleStage(130, () => {
      rebuildMatchScene(playerTeam, currentMode, 'loading', { preserveSeries: true });
      loadingHeading = isTiebreakerRound ? 'Final Tiebreaker' : `Round ${currentRound} Prep`;
      loadingProgress = 0.86;
      loadingStage = getLoadingStageLabel(0.85);
      emitHud(true);
    });

    scheduleStage(300, () => {
      loadingProgress = 1.0;
      loadingStage = getLoadingStageLabel(1.0);
      emitHud(true);
    });

    scheduleStage(460, () => {
      matchPhase = 'countdown';
      countdownRemainingSeconds = COUNTDOWN_SECONDS;
      lastCountdownBeep = 3;
      goBannerRemainingSeconds = 0;
      lastTimeMs = performance.now();
      arenaSound.playCountdownTick(3);
      syncVisibilityAndFpsPose();
      emitHud(true);
      renderMinimapNow((performance.now() - startTimeMs) / 1000);
      if (isSoftwareGl) renderOneFrame();
    });
  }

  function finishRound(
    overrideMeadowRatio?: number,
    overrideSeries?: SeriesProgressionResult,
  ) {
    if (matchPhase !== 'playing' && !overrideSeries) return;
    const seq = ++matchStartSeq;
    clearLoadingTimers();
    timeRemainingSeconds = 0;
    isPaused = false;
    isPlayerBoostSprinting = false;
    arenaSound.setPaused(false);
    arenaSound.setElementalSpray(null);
    arenaSound.setGameplayMusicState(false, 0);
    exitPointerLockIfNeeded();
    clearHeldInputs();
    controls.enabled = false;
    camera.fov = 45;
    camera.rotation.z = 0;
    camera.updateProjectionMatrix();
    streamSystem.reticleGroup.visible = false;

    const ratio =
      typeof overrideMeadowRatio === 'number'
        ? overrideMeadowRatio
        : arena.terrainSim.getMeadowRatio();
    const progression = overrideSeries ?? advanceRoundSeries(roundHistory, ratio);
    heroRoundsWon = progression.heroRoundsWon;
    villainRoundsWon = progression.villainRoundsWon;
    roundHistory = progression.roundHistory;
    lastRoundOutcome = progression.lastRound;
    tiebreakerTriggered = progression.tiebreakerTriggered;

    matchPhase = 'loading';
    loadingHeading = progression.seriesOver
      ? 'Match Complete'
      : progression.tiebreakerTriggered
        ? 'Tiebreaker Unlocked'
        : 'Round Complete';
    loadingProgress = 0.35;
    loadingStage = progression.seriesOver
      ? 'Finalizing Series Results...'
      : progression.tiebreakerTriggered
        ? 'Tied 2–2! Unlocking Final Round 5...'
        : `Tallying Round ${progression.lastRound.roundNumber} Territory...`;
    syncVisibilityAndFpsPose();
    emitHud(true);

    const scheduleStage = (delayMs: number, fn: () => void) => {
      const tid = window.setTimeout(() => {
        if (disposed || seq !== matchStartSeq) return;
        fn();
      }, delayMs);
      loadingTimerIds.push(tid);
    };

    scheduleStage(120, () => {
      loadingProgress = 0.78;
      loadingStage = progression.seriesOver
        ? 'Computing Final Match Results...'
        : progression.tiebreakerTriggered
          ? 'Preparing Final Tiebreaker Round 5...'
          : 'Preparing Round Summary...';
      emitHud(true);
    });

    scheduleStage(260, () => {
      loadingProgress = 1.0;
      emitHud(true);
    });

    scheduleStage(380, () => {
      if (progression.seriesOver) {
        finishMatch(progression);
      } else {
        matchPhase = 'roundEnd';
        roundTransitionRemaining = ROUND_TRANSITION_SECONDS;
        arenaSound.playRoundEndStinger(progression.lastRound.winner === playerTeam);
        emitHud(true);
      }
    });
  }

  let lastTimeMs = performance.now();
  const startTimeMs = lastTimeMs;
  let frameId = 0;
  let hudTimer = 0;
  let disposed = false;

  function afterDraw(cb: () => void) {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    if (!sync) {
      frameId = window.setTimeout(cb, 24);
      return;
    }
    const poll = () => {
      if (disposed) {
        gl.deleteSync(sync);
        return;
      }
      const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 8);
      } else {
        gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 24);
      }
    };
    frameId = window.setTimeout(poll, 8);
  }

  function driftDustMotes(dt: number, elapsed: number) {
    const bound = arena.arenaHalfSize + 1.2;
    for (let i = 0; i < dustCount; i++) {
      let y = dustAttr.getY(i) + dt * 0.16;
      let x = dustAttr.getX(i) + (Math.sin(elapsed * 0.48 + i) * 0.14 + 0.11) * dt;
      let z = dustAttr.getZ(i) + Math.cos(elapsed * 0.36 + i * 0.7) * 0.08 * dt;
      if (y > 8.6) y = 0.6;
      if (x > bound) x = -bound;
      if (x < -bound) x = bound;
      if (z > bound) z = -bound;
      if (z < -bound) z = bound;
      dustAttr.setXYZ(i, x, y, z);
    }
    dustAttr.needsUpdate = true;
  }

  function stepShowcaseMenu(dt: number, elapsed: number) {
    const orbitAngle = elapsed * 0.16 + 1.15;
    const orbitRadius = arena.arenaHalfSize * 2.15;
    camera.position.set(
      Math.cos(orbitAngle) * orbitRadius,
      arena.arenaHalfSize * 0.94 + Math.sin(elapsed * 0.35) * 0.9,
      Math.sin(orbitAngle) * orbitRadius,
    );
    controls.target.set(0, -0.5, 0);

    // Gentle readiness patrol on home sides
    for (let i = 0; i < troopers.length; i++) {
      const t = troopers[i];
      t.patrolAngle += dt * 0.45;
      const gx = t.patrolCenterX + Math.sin(t.patrolAngle) * 1.9;
      const gz = t.patrolCenterZ + Math.cos(t.patrolAngle * 0.8) * 2.1;
      const dx = gx - t.x;
      const dz = gz - t.z;
      const dist = Math.hypot(dx, dz);
      const spd = dist > 0.2 ? 1.55 : 0;
      const prevYaw = t.yaw;
      if (dist > 0.2) {
        t.vx = (dx / dist) * spd;
        t.vz = (dz / dist) * spd;
        t.x += t.vx * dt;
        t.z += t.vz * dt;
        resolveTrooperCollisions(t);
        const targetYaw = Math.atan2(t.vx, t.vz);
        t.yaw += shortestAngleDiff(t.yaw, targetYaw) * (1 - Math.exp(-5 * dt));
      } else {
        t.vx = 0;
        t.vz = 0;
      }
      t.turnRate += (shortestAngleDiff(prevYaw, t.yaw) / Math.max(dt, 0.005) - t.turnRate) * (1 - Math.exp(-8 * dt));
      t.y = arena.terrainSim.sampleHeight(t.x, t.z);
      t.walkPhase += spd * dt * 2.8;
      t.rig.root.position.set(t.x, t.y, t.z);
      t.rig.root.rotation.y = t.yaw;
      animateTrooperRig(
        t.rig,
        elapsed,
        t.walkPhase,
        spd / 6.2,
        0,
        spd / 6.2,
        false,
        t.ammo / MAX_AMMO,
        t.turnRate,
        0,
      );
    }

    driftDustMotes(dt, elapsed);
  }

  function stepRoundTransitionOrbit(dt: number, elapsed: number) {
    const orbitAngle = elapsed * 0.24 + 0.5;
    const orbitRadius = arena.arenaHalfSize * 1.42;
    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      Math.cos(orbitAngle) * orbitRadius,
      3.5,
      dt,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      arena.arenaHalfSize * 1.05,
      3.5,
      dt,
    );
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      Math.sin(orbitAngle) * orbitRadius,
      3.5,
      dt,
    );
    controls.target.x = THREE.MathUtils.damp(controls.target.x, 0, 4.0, dt);
    controls.target.y = THREE.MathUtils.damp(controls.target.y, 0.4, 4.0, dt);
    controls.target.z = THREE.MathUtils.damp(controls.target.z, 0, 4.0, dt);

    for (let i = 0; i < troopers.length; i++) {
      const t = troopers[i];
      animateTrooperRig(t.rig, elapsed, t.walkPhase, 0, 0, 0, false, t.ammo / MAX_AMMO, 0, 0);
    }

    pickups.step(dt, elapsed, arena.terrainSim);
    streamSystem.update(dt, false, false, arena.terrainSim, {
      onWaterImpact: () => {},
      onFireImpact: () => {},
    });
    driftDustMotes(dt, elapsed);
  }

  function stepCountdown(dt: number, elapsed: number) {
    countdownRemainingSeconds = Math.max(0, countdownRemainingSeconds - dt);

    const ceilSec = Math.ceil(countdownRemainingSeconds);
    if (ceilSec >= 1 && ceilSec < lastCountdownBeep) {
      lastCountdownBeep = ceilSec;
      arenaSound.playCountdownTick(ceilSec as 3 | 2 | 1);
    }

    for (let i = 0; i < troopers.length; i++) {
      const t = troopers[i];
      animateTrooperRig(
        t.rig,
        elapsed,
        t.walkPhase,
        0,
        0,
        0,
        false,
        t.ammo / MAX_AMMO,
        0,
        0,
        false,
      );
    }

    if (cameraMode === 'firstPerson') {
      snapFirstPersonCameraToPlayer();
    } else if (cameraMode === 'thirdPerson') {
      snapThirdPersonCameraToPlayer();
    } else if (cameraMode === 'follow') {
      snapFollowCameraToPlayer();
    }

    driftDustMotes(dt, elapsed);
    renderMinimapNow(elapsed);

    if (countdownRemainingSeconds <= 0) {
      matchPhase = 'playing';
      goBannerRemainingSeconds = GO_BANNER_DURATION_SECONDS;
      streamSystem.reticleGroup.visible = cameraMode !== 'orbit';
      arenaSound.playCountdownTick(0);
      arenaSound.setGameplayMusicState(true, 0);
      syncVisibilityAndFpsPose();
      emitHud(true);
    } else {
      emitHud(false);
    }
  }

  function stepPlayingMatch(dt: number, elapsed: number) {
    if (goBannerRemainingSeconds > 0) {
      goBannerRemainingSeconds = Math.max(0, goBannerRemainingSeconds - dt);
    }
    if (activeOnlineSession && latestRoomSnapshot) {
      timeRemainingSeconds = latestRoomSnapshot.timeRemainingSeconds;
    } else {
      timeRemainingSeconds = Math.max(0, timeRemainingSeconds - dt);
      if (timeRemainingSeconds <= 0) {
        finishRound();
        return;
      }
    }

    // Drive quiet in-game tension score based on remaining round progress + close territory race
    const roundProgress = 1 - Math.max(0, Math.min(1, timeRemainingSeconds / MATCH_DURATION_SECONDS));
    const meadowRatio =
      activeOnlineSession && latestRoomSnapshot
        ? latestRoomSnapshot.heroPercent / 100
        : arena.terrainSim.getMeadowRatio();
    const closeness = 1 - Math.min(1, Math.abs(meadowRatio - 0.5) * 4.2);
    const tension = Math.min(
      1,
      roundProgress * 0.85 + closeness * 0.15 * Math.min(1, roundProgress * 2.4),
    );
    arenaSound.setGameplayMusicState(true, tension);

    const half = arena.arenaHalfSize;
    const isFps = cameraMode === 'firstPerson';
    const isThirdPerson = cameraMode === 'thirdPerson';
    const modeCfg = getMatchModeConfig(currentMode);
    const botEmitRate = Math.max(90, 155 / Math.sqrt(Math.max(1, modeCfg.teamSize)));
    const playerEmitRate = 175;

    if (isThirdPerson) {
      const turnSpeed = 2.15;
      if (keysPressed.has('KeyQ')) tpYaw += turnSpeed * dt;
      if (keysPressed.has('KeyE')) tpYaw -= turnSpeed * dt;
    }

    for (let i = 0; i < troopers.length; i++) {
      troopers[i].throwAnimTimer = Math.max(0, troopers[i].throwAnimTimer - dt);
      troopers[i].emptyCooldown = Math.max(0, troopers[i].emptyCooldown - dt);
      troopers[i].dizzyTimer = stepDizzyTimer(troopers[i].dizzyTimer, dt).nextTimer;
    }

    // 1. Update Raycaster Floor Target & Aim Point for Player
    if (isFps) {
      snapFirstPersonCameraToPlayer();
      raycaster.setFromCamera(_centerNdc, camera);
      const hits = raycaster.intersectObject(arena.terrainMesh, false);
      if (hits.length > 0) {
        mouseAimWorld.copy(hits[0].point);
      } else {
        const basis = computeFpsLookAndBasis(fpsYaw, fpsPitch);
        const projX = Math.max(-half + 0.6, Math.min(half - 0.6, playerTrooper.x + basis.forwardX * 15));
        const projZ = Math.max(-half + 0.6, Math.min(half - 0.6, playerTrooper.z + basis.forwardZ * 15));
        mouseAimWorld.set(projX, arena.terrainSim.sampleHeight(projX, projZ), projZ);
      }
    } else if (isThirdPerson) {
      const pose = snapThirdPersonCameraToPlayer();
      raycaster.setFromCamera(_centerNdc, camera);
      const hits = raycaster.intersectObject(arena.terrainMesh, false);
      let hitValid = false;
      if (hits.length > 0) {
        const pt = hits[0].point;
        const toHitDot =
          (pt.x - playerTrooper.x) * pose.forwardX +
          (pt.z - playerTrooper.z) * pose.forwardZ;
        if (toHitDot > 0.65) {
          mouseAimWorld.copy(pt);
          hitValid = true;
        }
      }
      if (!hitValid) {
        const projX = Math.max(-half + 0.6, Math.min(half - 0.6, playerTrooper.x + pose.forwardX * 14));
        const projZ = Math.max(-half + 0.6, Math.min(half - 0.6, playerTrooper.z + pose.forwardZ * 14));
        mouseAimWorld.set(projX, arena.terrainSim.sampleHeight(projX, projZ), projZ);
      }
    } else if (hasPointerMoved) {
      raycaster.setFromCamera(mouseNdc, camera);
      const hits = raycaster.intersectObject(arena.terrainMesh, false);
      if (hits.length > 0) {
        mouseAimWorld.copy(hits[0].point);
      } else if (raycaster.ray.intersectPlane(fallbackPlane, _hitPoint)) {
        const cx = Math.max(-half + 0.5, Math.min(half - 0.5, _hitPoint.x));
        const cz = Math.max(-half + 0.5, Math.min(half - 0.5, _hitPoint.z));
        mouseAimWorld.set(cx, arena.terrainSim.sampleHeight(cx, cz), cz);
      }
    } else {
      const rx = Math.max(-half + 0.5, Math.min(half - 0.5, playerTrooper.x + Math.sin(playerTrooper.yaw) * 5.2));
      const rz = Math.max(-half + 0.5, Math.min(half - 0.5, playerTrooper.z + Math.cos(playerTrooper.yaw) * 5.2));
      mouseAimWorld.set(rx, arena.terrainSim.sampleHeight(rx, rz), rz);
    }

    streamSystem.updateReticle(
      mouseAimWorld.x,
      mouseAimWorld.z,
      arena.terrainSim,
      playerTeam,
      elapsed,
    );

    // 2. Player Movement & Aiming
    let inputX = 0;
    let inputZ = 0;
    if (
      isActionHeld('moveForward') ||
      (currentSettings.keybinds.moveForward === 'KeyW' && keysPressed.has('ArrowUp'))
    ) {
      inputZ += 1;
    }
    if (
      isActionHeld('moveBackward') ||
      (currentSettings.keybinds.moveBackward === 'KeyS' && keysPressed.has('ArrowDown'))
    ) {
      inputZ -= 1;
    }
    if (
      isActionHeld('moveRight') ||
      (currentSettings.keybinds.moveRight === 'KeyD' && keysPressed.has('ArrowRight'))
    ) {
      inputX += 1;
    }
    if (
      isActionHeld('moveLeft') ||
      (currentSettings.keybinds.moveLeft === 'KeyA' && keysPressed.has('ArrowLeft'))
    ) {
      inputX -= 1;
    }

    if (isFps) {
      const basis = computeFpsLookAndBasis(fpsYaw, fpsPitch);
      _camForward.set(basis.forwardX, 0, basis.forwardZ).normalize();
      _camRight.set(basis.rightX, 0, basis.rightZ).normalize();
    } else {
      camera.getWorldDirection(_camForward);
      _camForward.y = 0;
      if (_camForward.lengthSq() < 1e-4) _camForward.set(0, 0, -1);
      _camForward.normalize();
      _camRight.crossVectors(_camForward, THREE.Object3D.DEFAULT_UP).normalize();
    }

    _moveVec.set(0, 0, 0);
    if (inputX !== 0 || inputZ !== 0) {
      _moveVec.addScaledVector(_camForward, inputZ).addScaledVector(_camRight, inputX).normalize();
    }

    const isPlayerDizzy = playerTrooper.dizzyTimer > 0.001;
    const isShiftHeld = isActionHeld('sprintBoost');
    const isMoving = !isPlayerDizzy && (inputX !== 0 || inputZ !== 0);
    const sprintState = computePlayerSprintState({
      ammo: playerTrooper.ammo,
      isShiftHeld,
      isMoving,
    });
    isPlayerBoostSprinting = !isPlayerDizzy && sprintState.isSprinting;
    if (isPlayerDizzy) {
      playerTrooper.vx = 0;
      playerTrooper.vz = 0;
    } else {
      const moveSpeed = sprintState.targetSpeed;
      const accel = 1 - Math.exp(-14 * dt);
      playerTrooper.vx += (_moveVec.x * moveSpeed - playerTrooper.vx) * accel;
      playerTrooper.vz += (_moveVec.z * moveSpeed - playerTrooper.vz) * accel;
      playerTrooper.x += playerTrooper.vx * dt;
      playerTrooper.z += playerTrooper.vz * dt;
      resolveTrooperCollisions(playerTrooper);
    }
    playerTrooper.y = arena.terrainSim.sampleHeight(playerTrooper.x, playerTrooper.z);

    const prevPlayerYaw = playerTrooper.yaw;
    if (isFps) {
      playerTrooper.yaw = computeFpsLookAndBasis(fpsYaw, fpsPitch).charYaw;
    } else if (!isPlayerDizzy) {
      const aimDx = mouseAimWorld.x - playerTrooper.x;
      const aimDz = mouseAimWorld.z - playerTrooper.z;
      if (aimDx * aimDx + aimDz * aimDz > 0.04) {
        const targetYaw = Math.atan2(aimDx, aimDz);
        playerTrooper.yaw += shortestAngleDiff(playerTrooper.yaw, targetYaw) * (1 - Math.exp(-15 * dt));
      }
    }
    const rawPlayerTurn = shortestAngleDiff(prevPlayerYaw, playerTrooper.yaw) / Math.max(dt, 0.004);
    playerTrooper.turnRate += (rawPlayerTurn - playerTrooper.turnRate) * (1 - Math.exp(-12 * dt));

    const playerSpeed = isPlayerDizzy ? 0 : Math.hypot(playerTrooper.vx, playerTrooper.vz);
    playerTrooper.walkPhase += playerSpeed * dt * 2.85;
    playerTrooper.rig.root.position.set(playerTrooper.x, playerTrooper.y, playerTrooper.z);
    playerTrooper.rig.root.rotation.y = playerTrooper.yaw;

    const isOnMeadow = arena.terrainSim.sampleBiome(playerTrooper.x, playerTrooper.z) < 0.5;
    arenaSound.updateFootsteps(dt, playerSpeed, BASE_PLAYER_SPEED, sprintState.isSprinting, isOnMeadow);

    const cosY = Math.cos(playerTrooper.yaw);
    const sinY = Math.sin(playerTrooper.yaw);
    const localVelX = (playerTrooper.vx * cosY - playerTrooper.vz * sinY) / BASE_PLAYER_SPEED;
    const localVelZ = (playerTrooper.vx * sinY + playerTrooper.vz * cosY) / BASE_PLAYER_SPEED;
    const triggerHeld = pointerFiring && !isPlayerDizzy;
    const playerFiringStream = triggerHeld && playerTrooper.ammo > 0;
    const playerThrowProg =
      playerTrooper.throwAnimTimer > 0 ? 1 - playerTrooper.throwAnimTimer / 0.42 : 0;

    arenaSound.setElementalSpray(playerFiringStream ? playerTeam : null);

    const baseFov =
      (cameraMode === 'firstPerson' ? 62 : cameraMode === 'thirdPerson' ? 52 : 45) +
      currentSettings.fovBoost;
    const desiredFov = Math.max(38, Math.min(88, baseFov + (isPlayerBoostSprinting ? 4.8 : 0)));
    if (Math.abs(camera.fov - desiredFov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, desiredFov, 9, dt);
      camera.updateProjectionMatrix();
    }

    if (isFps) {
      const headBobY =
        ((1 - Math.cos(playerTrooper.walkPhase * 2)) * 0.5) *
        0.032 *
        (playerSpeed / BASE_PLAYER_SPEED);
      const strafeRoll = -localVelX * 0.015;
      snapFirstPersonCameraToPlayer(headBobY, strafeRoll);
      animateFirstPersonWeapon(
        playerTeam === 'hero' ? fpHeroRig : fpVillainRig,
        elapsed,
        playerTrooper.walkPhase,
        playerSpeed / BASE_PLAYER_SPEED,
        playerFiringStream,
        playerTrooper.ammo / MAX_AMMO,
        playerThrowProg,
        isPlayerDizzy,
      );
      camera.updateMatrixWorld(true);
    } else {
      animateTrooperRig(
        playerTrooper.rig,
        elapsed,
        playerTrooper.walkPhase,
        playerSpeed / BASE_PLAYER_SPEED,
        localVelX,
        localVelZ,
        playerFiringStream,
        playerTrooper.ammo / MAX_AMMO,
        playerTrooper.turnRate,
        playerThrowProg,
        isPlayerDizzy,
      );
    }

    let heroFiringAny = playerFiringStream && playerTeam === 'hero';
    let villainFiringAny = playerFiringStream && playerTeam === 'villain';
    let heroLightClaimed = heroFiringAny;
    let villainLightClaimed = villainFiringAny;

    // Player firing stream & ammo drain
    if (triggerHeld) {
      if (isFps) {
        const activeFp = playerTeam === 'hero' ? fpHeroRig : fpVillainRig;
        activeFp.root.updateMatrixWorld(true);
        activeFp.muzzleAnchor.getWorldPosition(_muzzlePos);
      } else {
        playerTrooper.rig.root.updateMatrixWorld(true);
        playerTrooper.rig.muzzleAnchor.getWorldPosition(_muzzlePos);
      }

      if (playerTrooper.ammo > 0) {
        const drained = drainAmmo(playerTrooper.ammo, dt);
        playerTrooper.ammo = drained.nextAmmo;
        streamSystem.emitStream(
          playerTeam,
          _muzzlePos,
          mouseAimWorld,
          dt,
          elapsed,
          playerEmitRate,
          true,
        );
        if (activeOnlineSession && multiplayerClient) {
          onlineSprayBrushAccum += dt;
          if (onlineSprayBrushAccum >= 0.065) {
            onlineSprayBrushAccum = 0;
            multiplayerClient.sendBrush(
              playerTeam,
              mouseAimWorld.x,
              mouseAimWorld.z,
              1.56,
              0.44,
            );
          }
        }
        if (drained.justEmptied) {
          arenaSound.playEmptyClickHiss(playerTeam);
          streamSystem.spawnEmptySputter(playerTeam, _muzzlePos, mouseAimWorld);
          playerTrooper.emptyCooldown = 0.28;
          emitHud(true);
        }
      } else if (playerTrooper.emptyCooldown <= 0) {
        playerTrooper.emptyCooldown = 0.28;
        arenaSound.playEmptyClickHiss(playerTeam);
        streamSystem.spawnEmptySputter(playerTeam, _muzzlePos, mouseAimWorld);
      }
    }

    // Send local player's authoritative pose over WebSocket in online multiplayer
    if (activeOnlineSession && multiplayerClient) {
      multiplayerClient.sendPoseThrottled({
        x: playerTrooper.x,
        y: playerTrooper.y,
        z: playerTrooper.z,
        yaw: playerTrooper.yaw,
        pitch: isFps ? fpsPitch : tpPitch,
        walkPhase: playerTrooper.walkPhase,
        spraying: playerFiringStream,
        ammo: playerTrooper.ammo,
        hasGrenade: playerTrooper.hasGrenade,
        hasDizzyBomb: playerTrooper.hasDizzyBomb,
      });
    }

    // Player grenade throw (Space / Right Click)
    if (grenadeThrowQueued) {
      grenadeThrowQueued = false;
      if (!isPlayerDizzy && playerTrooper.hasGrenade) {
        const launchX = playerTrooper.x + Math.sin(playerTrooper.yaw) * 0.45;
        const launchY = playerTrooper.y + 1.38;
        const launchZ = playerTrooper.z + Math.cos(playerTrooper.yaw) * 0.45;
        const targetY = arena.terrainSim.sampleHeight(mouseAimWorld.x, mouseAimWorld.z);
        const launched = pickups.launchGrenade(
          playerTeam,
          launchX,
          launchY,
          launchZ,
          mouseAimWorld.x,
          targetY,
          mouseAimWorld.z,
        );
        if (launched) {
          playerTrooper.hasGrenade = false;
          playerTrooper.throwAnimTimer = 0.42;
          arenaSound.playGrenadeThrow();
          if (activeOnlineSession && multiplayerClient) {
            multiplayerClient.sendGrenade(
              playerTeam,
              launchX,
              launchY,
              launchZ,
              mouseAimWorld.x,
              mouseAimWorld.z,
              0.72,
            );
          }
          emitHud(true);
        }
      }
    }

    // Player Dizzy Bomb throw (KeyF)
    if (dizzyThrowQueued) {
      dizzyThrowQueued = false;
      if (!isPlayerDizzy && playerTrooper.hasDizzyBomb) {
        const launchX = playerTrooper.x + Math.sin(playerTrooper.yaw) * 0.45;
        const launchY = playerTrooper.y + 1.38;
        const launchZ = playerTrooper.z + Math.cos(playerTrooper.yaw) * 0.45;
        const targetY = arena.terrainSim.sampleHeight(mouseAimWorld.x, mouseAimWorld.z);
        const launched = pickups.launchDizzyBomb(
          playerTeam,
          launchX,
          launchY,
          launchZ,
          mouseAimWorld.x,
          targetY,
          mouseAimWorld.z,
        );
        if (launched) {
          playerTrooper.hasDizzyBomb = false;
          playerTrooper.throwAnimTimer = 0.42;
          arenaSound.playGrenadeThrow();
          emitHud(true);
        }
      }
    }

    const trooperPositions = troopers.map((t) => ({ id: t.id, role: t.role, x: t.x, z: t.z }));

    const isLocalBotAuthority =
      !activeOnlineSession ||
      !latestRoomSnapshot ||
      latestRoomSnapshot.hostUid === activeOnlineSession.playerUid ||
      latestRoomSnapshot.players[0]?.uid === activeOnlineSession.playerUid;

    // 4. Step Remote Human Players & AI Bots
    const botSpeed = 5.55;
    const syncedBotsPayload: OnlineBotSync[] = [];
    if (activeOnlineSession) {
      onlineBotBrushAccum += dt;
    }
    const shouldBroadcastBotBrush = activeOnlineSession && onlineBotBrushAccum >= 0.085;
    if (shouldBroadcastBotBrush) {
      onlineBotBrushAccum = 0;
    }

    for (let i = 0; i < troopers.length; i++) {
      const bot = troopers[i];
      if (bot === playerTrooper) continue;

      if (bot.remoteUid) {
        const prevX = bot.x;
        const prevZ = bot.z;
        const targetX = bot.remoteTargetX ?? bot.x;
        const targetZ = bot.remoteTargetZ ?? bot.z;
        const blend = 1 - Math.exp(-16 * dt);
        bot.x += (targetX - bot.x) * blend;
        bot.z += (targetZ - bot.z) * blend;
        bot.y = arena.terrainSim.sampleHeight(bot.x, bot.z);
        const targetYaw = bot.remoteYaw ?? bot.yaw;
        bot.yaw += shortestAngleDiff(bot.yaw, targetYaw) * (1 - Math.exp(-16 * dt));
        const rSpd = Math.hypot(bot.x - prevX, bot.z - prevZ) / Math.max(dt, 0.004);
        bot.walkPhase += rSpd * dt * 2.85;
        bot.rig.root.position.set(bot.x, bot.y, bot.z);
        bot.rig.root.rotation.y = bot.yaw;

        const rDizzy = bot.dizzyTimer > 0.001;
        const rSpray = !rDizzy && Boolean(bot.remoteSpraying);
        animateTrooperRig(
          bot.rig,
          elapsed,
          bot.walkPhase,
          Math.min(1, rSpd / BASE_PLAYER_SPEED),
          0,
          Math.min(1, rSpd / BASE_PLAYER_SPEED),
          rSpray,
          bot.ammo / MAX_AMMO,
          0,
          0,
          rDizzy,
        );
        if (rSpray) {
          bot.rig.root.updateMatrixWorld(true);
          bot.rig.muzzleAnchor.getWorldPosition(_muzzlePos);
          const aimX = Math.max(-half + 0.5, Math.min(half - 0.5, bot.x + Math.sin(bot.yaw) * 7.5));
          const aimZ = Math.max(-half + 0.5, Math.min(half - 0.5, bot.z + Math.cos(bot.yaw) * 7.5));
          _botTargetPos.set(aimX, arena.terrainSim.sampleHeight(aimX, aimZ), aimZ);
          streamSystem.emitStream(bot.role, _muzzlePos, _botTargetPos, dt, elapsed, botEmitRate, false);
        }
        continue;
      }

      if (!bot.isBot) continue;

      if (activeOnlineSession && !isLocalBotAuthority && latestRoomSnapshot) {
        const slotKey = `${bot.role}:${bot.slotIndex}`;
        const remoteBot = latestRoomSnapshot.bots.find((b) => b.slotKey === slotKey);
        if (remoteBot) {
          const blend = 1 - Math.exp(-14 * dt);
          const prevX = bot.x;
          const prevZ = bot.z;
          bot.x += (remoteBot.x - bot.x) * blend;
          bot.z += (remoteBot.z - bot.z) * blend;
          bot.y = arena.terrainSim.sampleHeight(bot.x, bot.z);
          bot.yaw += shortestAngleDiff(bot.yaw, remoteBot.yaw) * blend;
          bot.dizzyTimer = remoteBot.dizzyTimer;
          const bSpd = Math.hypot(bot.x - prevX, bot.z - prevZ) / Math.max(dt, 0.004);
          bot.walkPhase += bSpd * dt * 2.85;
          bot.rig.root.position.set(bot.x, bot.y, bot.z);
          bot.rig.root.rotation.y = bot.yaw;
          const bDizzy = bot.dizzyTimer > 0.001;
          const bSpray = !bDizzy && remoteBot.spraying;
          animateTrooperRig(
            bot.rig,
            elapsed,
            bot.walkPhase,
            Math.min(1, bSpd / botSpeed),
            0,
            Math.min(1, bSpd / botSpeed),
            bSpray,
            bot.ammo / MAX_AMMO,
            0,
            0,
            bDizzy,
          );
          if (bSpray) {
            bot.rig.root.updateMatrixWorld(true);
            bot.rig.muzzleAnchor.getWorldPosition(_muzzlePos);
            const aimX = Math.max(-half + 0.5, Math.min(half - 0.5, bot.x + Math.sin(bot.yaw) * 6.5));
            const aimZ = Math.max(-half + 0.5, Math.min(half - 0.5, bot.z + Math.cos(bot.yaw) * 6.5));
            _botTargetPos.set(aimX, arena.terrainSim.sampleHeight(aimX, aimZ), aimZ);
            streamSystem.emitStream(bot.role, _muzzlePos, _botTargetPos, dt, elapsed, botEmitRate, false);
          }
          continue;
        }
      }

      const isBotDizzy = bot.dizzyTimer > 0.001;
      const botSign = pickups.getSignForOwner(bot.id);
      const botGp = pickups.getGrenadePickupForOwner(bot.id);
      const botDp = pickups.getDizzyPickupForOwner(bot.id);
      const decision = stepBotAi(
        {
          id: bot.id,
          role: bot.role,
          x: bot.x,
          z: bot.z,
          ammo: bot.ammo,
          hasGrenade: bot.hasGrenade,
          hasDizzyBomb: bot.hasDizzyBomb,
          isDizzy: isBotDizzy,
          targetX: bot.aiTargetX,
          targetZ: bot.aiTargetZ,
          retargetTimer: bot.aiRetargetTimer,
          aiState: bot.aiState,
          sweepPhase: bot.aiSweepPhase,
        },
        {
          terrain: arena.terrainSim,
          obstacles: arena.treeObstacles,
          allTroopers: trooperPositions,
          teamOrb: {
            active: botSign?.active ?? false,
            x: botSign?.x ?? 0,
            z: botSign?.z ?? 0,
          },
          teamGrenadePickup: {
            active: botGp?.active ?? false,
            x: botGp?.x ?? 0,
            z: botGp?.z ?? 0,
          },
          grenadePickupClaimedByCloserTeammate: false,
          teamDizzyPickup: {
            active: botDp?.active ?? false,
            x: botDp?.x ?? 0,
            z: botDp?.z ?? 0,
          },
          dizzyPickupClaimedByCloserTeammate: false,
          elapsed,
          dt,
        },
        aiRng,
      );

      bot.aiState = decision.nextState;
      bot.aiTargetX = decision.targetX;
      bot.aiTargetZ = decision.targetZ;
      bot.aiRetargetTimer = decision.retargetTimer;

      if (isBotDizzy) {
        bot.vx = 0;
        bot.vz = 0;
      } else {
        const botAccel = 1 - Math.exp(-11 * dt);
        bot.vx += (decision.moveDirX * botSpeed - bot.vx) * botAccel;
        bot.vz += (decision.moveDirZ * botSpeed - bot.vz) * botAccel;
        bot.x += bot.vx * dt;
        bot.z += bot.vz * dt;
        resolveTrooperCollisions(bot);
      }
      bot.y = arena.terrainSim.sampleHeight(bot.x, bot.z);

      const prevBotYaw = bot.yaw;
      if (!isBotDizzy) {
        const adx = decision.aimX - bot.x;
        const adz = decision.aimZ - bot.z;
        if (adx * adx + adz * adz > 0.04) {
          const targetYaw = Math.atan2(adx, adz);
          bot.yaw += shortestAngleDiff(bot.yaw, targetYaw) * (1 - Math.exp(-11 * dt));
        }
      }
      const rawBotTurn = shortestAngleDiff(prevBotYaw, bot.yaw) / Math.max(dt, 0.005);
      bot.turnRate += (rawBotTurn - bot.turnRate) * (1 - Math.exp(-10 * dt));

      const spd = isBotDizzy ? 0 : Math.hypot(bot.vx, bot.vz);
      bot.walkPhase += spd * dt * 2.85;
      bot.rig.root.position.set(bot.x, bot.y, bot.z);
      bot.rig.root.rotation.y = bot.yaw;

      const bCos = Math.cos(bot.yaw);
      const bSin = Math.sin(bot.yaw);
      const bLocalX = (bot.vx * bCos - bot.vz * bSin) / botSpeed;
      const bLocalZ = (bot.vx * bSin + bot.vz * bCos) / botSpeed;
      const botThrowProg = bot.throwAnimTimer > 0 ? 1 - bot.throwAnimTimer / 0.42 : 0;

      const botFiring = !isBotDizzy && decision.shouldFire && bot.ammo > 0;
      animateTrooperRig(
        bot.rig,
        elapsed,
        bot.walkPhase,
        spd / botSpeed,
        bLocalX,
        bLocalZ,
        botFiring,
        bot.ammo / MAX_AMMO,
        bot.turnRate,
        botThrowProg,
        isBotDizzy,
      );

      if (botFiring) {
        const drained = drainAmmo(bot.ammo, dt);
        bot.ammo = drained.nextAmmo;
        bot.rig.root.updateMatrixWorld(true);
        bot.rig.muzzleAnchor.getWorldPosition(_muzzlePos);
        _botTargetPos.set(
          decision.aimX,
          arena.terrainSim.sampleHeight(decision.aimX, decision.aimZ),
          decision.aimZ,
        );

        let updateLight = false;
        if (bot.role === 'hero') {
          heroFiringAny = true;
          if (!heroLightClaimed) {
            heroLightClaimed = true;
            updateLight = true;
          }
        } else {
          villainFiringAny = true;
          if (!villainLightClaimed) {
            villainLightClaimed = true;
            updateLight = true;
          }
        }

        streamSystem.emitStream(
          bot.role,
          _muzzlePos,
          _botTargetPos,
          dt,
          elapsed,
          botEmitRate,
          updateLight,
        );
        if (shouldBroadcastBotBrush && multiplayerClient && isLocalBotAuthority) {
          multiplayerClient.sendBrush(bot.role, decision.aimX, decision.aimZ, 1.54, 0.42);
        }
      }

      if (!isBotDizzy && decision.shouldThrowGrenade && bot.hasGrenade) {
        const launchX = bot.x + Math.sin(bot.yaw) * 0.45;
        const launchY = bot.y + 1.38;
        const launchZ = bot.z + Math.cos(bot.yaw) * 0.45;
        const targetY = arena.terrainSim.sampleHeight(decision.aimX, decision.aimZ);
        if (
          pickups.launchGrenade(
            bot.role,
            launchX,
            launchY,
            launchZ,
            decision.aimX,
            targetY,
            decision.aimZ,
          )
        ) {
          bot.hasGrenade = false;
          bot.throwAnimTimer = 0.42;
          if (activeOnlineSession && multiplayerClient && isLocalBotAuthority) {
            multiplayerClient.sendGrenade(
              bot.role,
              launchX,
              launchY,
              launchZ,
              decision.aimX,
              decision.aimZ,
              0.72,
            );
          }
        }
      }

      if (!isBotDizzy && decision.shouldThrowDizzy && bot.hasDizzyBomb) {
        const launchX = bot.x + Math.sin(bot.yaw) * 0.45;
        const launchY = bot.y + 1.38;
        const launchZ = bot.z + Math.cos(bot.yaw) * 0.45;
        const targetY = arena.terrainSim.sampleHeight(decision.aimX, decision.aimZ);
        if (
          pickups.launchDizzyBomb(
            bot.role,
            launchX,
            launchY,
            launchZ,
            decision.aimX,
            targetY,
            decision.aimZ,
          )
        ) {
          bot.hasDizzyBomb = false;
          bot.throwAnimTimer = 0.42;
        }
      }

      if (activeOnlineSession && isLocalBotAuthority) {
        syncedBotsPayload.push({
          slotKey: `${bot.role}:${bot.slotIndex}`,
          role: bot.role,
          x: bot.x,
          y: bot.y,
          z: bot.z,
          yaw: bot.yaw,
          walkPhase: bot.walkPhase,
          spraying: botFiring,
          dizzyTimer: bot.dizzyTimer,
        });
      }
    }

    if (activeOnlineSession && isLocalBotAuthority && multiplayerClient && syncedBotsPayload.length > 0) {
      multiplayerClient.sendBotsThrottled(syncedBotsPayload);
    }

    // 5. Personal Blue/Red Recharge Signs (Each player gets their own private sign when empty; only owner can see & collect it)
    for (let i = 0; i < troopers.length; i++) {
      const t = troopers[i];
      const sign = pickups.getSignForOwner(t.id);
      if (!sign) continue;

      if (sign.active) {
        if (t.ammo < MAX_AMMO && isWithinPickupRadius(t.x, t.z, sign.x, sign.z)) {
          t.ammo = MAX_AMMO;
          const signY = arena.terrainSim.sampleHeight(sign.x, sign.z);
          pickups.clearPersonalSign(t.id);
          if (!t.isBot) {
            streamSystem.spawnBurst(t.role, sign.x, signY + 0.6, sign.z, 24, 0.78);
            arenaSound.playOrbPickup(t.role);
            emitHud(true);
          }
        }
      } else if (t.ammo <= 0) {
        const pt = pickValidArenaPoint(
          {
            minX: -half * 0.8,
            maxX: half * 0.8,
            minZ: -half * 0.76,
            maxZ: half * 0.76,
            arenaHalfSize: half,
            obstacles: arena.treeObstacles,
            avoidPoints: [
              { x: t.x, z: t.z, minDist: 5.5 },
              ...troopers
                .filter((other) => other.id !== t.id)
                .map((other) => ({ x: other.x, z: other.z, minDist: 2.4 })),
            ],
          },
          spawnRng,
        );
        pickups.spawnPersonalSign(t.id, pt.x, pt.z, arena.terrainSim);
        if (!t.isBot) {
          emitHud(true);
        }
      }
    }

    // 6. Personal Collectible 15s Elemental Grenades (Each trooper has their own private bomb pickup)
    for (let i = 0; i < troopers.length; i++) {
      const t = troopers[i];
      const gPickup = pickups.getGrenadePickupForOwner(t.id);
      if (!gPickup) continue;

      if (gPickup.active) {
        if (!t.hasGrenade && isWithinPickupRadius(t.x, t.z, gPickup.x, gPickup.z)) {
          t.hasGrenade = true;
          const py = arena.terrainSim.sampleHeight(gPickup.x, gPickup.z);
          pickups.clearPersonalGrenade(t.id);
          if (!t.isBot) {
            streamSystem.spawnBurst(t.role, gPickup.x, py + 0.5, gPickup.z, 12, 0.52);
            arenaSound.playGrenadePickup(t.role);
            emitHud(true);
          }
        }
      } else if (!t.hasGrenade) {
        t.grenadeSpawnTimer += dt;
        if (t.grenadeSpawnTimer >= GRENADE_SPAWN_INTERVAL) {
          t.grenadeSpawnTimer = 0;
          const pt = pickValidArenaPoint(
            {
              minX: -half * 0.42,
              maxX: half * 0.42,
              minZ: -half * 0.5,
              maxZ: half * 0.5,
              arenaHalfSize: half,
              obstacles: arena.treeObstacles,
              avoidPoints: troopers.map((other) => ({ x: other.x, z: other.z, minDist: 2.8 })),
            },
            spawnRng,
          );
          pickups.spawnPersonalGrenade(t.id, pt.x, pt.z, arena.terrainSim);
        }
      }
    }

    // 6b. Personal Collectible 14s Dizzy Bombs (Each trooper has their own private dizzy pickup)
    for (let i = 0; i < troopers.length; i++) {
      const t = troopers[i];
      const dPickup = pickups.getDizzyPickupForOwner(t.id);
      if (!dPickup) continue;

      if (dPickup.active) {
        if (!t.hasDizzyBomb && isWithinPickupRadius(t.x, t.z, dPickup.x, dPickup.z)) {
          t.hasDizzyBomb = true;
          const py = arena.terrainSim.sampleHeight(dPickup.x, dPickup.z);
          pickups.clearPersonalDizzy(t.id);
          if (!t.isBot) {
            streamSystem.spawnBurst(t.role, dPickup.x, py + 0.5, dPickup.z, 10, 0.48);
            arenaSound.playDizzyPickup();
            emitHud(true);
          }
        }
      } else if (!t.hasDizzyBomb) {
        t.dizzySpawnTimer += dt;
        if (t.dizzySpawnTimer >= DIZZY_SPAWN_INTERVAL) {
          t.dizzySpawnTimer = 0;
          const pt = pickValidArenaPoint(
            {
              minX: -half * 0.48,
              maxX: half * 0.48,
              minZ: -half * 0.48,
              maxZ: half * 0.48,
              arenaHalfSize: half,
              obstacles: arena.treeObstacles,
              avoidPoints: troopers.map((other) => ({ x: other.x, z: other.z, minDist: 2.6 })),
            },
            spawnRng,
          );
          pickups.spawnPersonalDizzy(t.id, pt.x, pt.z, arena.terrainSim);
        }
      }
    }

    // 7. In-flight Grenade & Dizzy Bomb Trails & Impact Effects
    for (let i = 0; i < pickups.thrownPool.length; i++) {
      const slot = pickups.thrownPool[i];
      if (!slot.active) continue;
      streamSystem.spawnBurst(slot.role, slot.x, slot.y, slot.z, 1, 0.22);
    }

    const impactEvents = pickups.step(dt, elapsed, arena.terrainSim);
    for (let i = 0; i < impactEvents.length; i++) {
      const impact = impactEvents[i];
      if (impact.kind === 'dizzy') {
        const victimIds = findDizzyVictims(impact.x, impact.z, impact.role, troopers, impact.radius);
        for (let v = 0; v < victimIds.length; v++) {
          const victim = troopers.find((tr) => tr.id === victimIds[v]);
          if (victim) {
            victim.dizzyTimer = DIZZY_DURATION_SECONDS;
            victim.vx = 0;
            victim.vz = 0;
          }
        }
        if (activeOnlineSession && multiplayerClient && impact.role === playerTeam) {
          multiplayerClient.sendDizzy(impact.role, impact.x, impact.z, impact.radius);
        }
        streamSystem.spawnBurst(impact.role, impact.x, impact.y + 0.35, impact.z, 28, 0.95);
        arenaSound.playDizzyImpact();
        cameraTrauma = Math.min(1, cameraTrauma + 0.28);
        emitHud(true);
      } else {
        if (impact.role === 'hero') {
          arena.terrainSim.applyWaterExplosion(impact.x, impact.z, impact.radius);
          arena.vegetation.growAt(impact.x, impact.z, impact.radius, arena.terrainSim);
        } else {
          arena.terrainSim.applyFireExplosion(impact.x, impact.z, impact.radius);
          arena.vegetation.burnAt(impact.x, impact.z, impact.radius);
        }
        if (activeOnlineSession && multiplayerClient && impact.role === playerTeam) {
          multiplayerClient.sendBrush(impact.role, impact.x, impact.z, impact.radius, 1.85);
        }
        streamSystem.spawnBurst(impact.role, impact.x, impact.y + 0.25, impact.z, 42, 1.44);
        arenaSound.playGrenadeExplosion(impact.role);
        cameraTrauma = Math.min(1, cameraTrauma + 0.45);
        emitHud(true);
      }
    }

    streamSystem.update(
      dt,
      heroFiringAny,
      villainFiringAny,
      arena.terrainSim,
      {
        onWaterImpact: (wx, wz) => {
          arena.terrainSim.applyWaterBrush(wx, wz, 1.52, 0.42);
          arena.vegetation.growAt(wx, wz, 1.52, arena.terrainSim);
        },
        onFireImpact: (wx, wz) => {
          arena.terrainSim.applyFireBrush(wx, wz, 1.58, 0.44);
          arena.vegetation.burnAt(wx, wz, 1.58);
        },
      },
    );

    const terrainStep = arena.terrainSim.step(dt);
    arena.syncTerrain(terrainStep);
    arena.vegetation.step(dt, arena.terrainSim);
    arena.trees.step(dt, arena.terrainSim, terrainStep.hasDirty);
    cameraTrauma = Math.max(0, cameraTrauma - dt * 1.45);

    hudTimer += dt;
    if (hudTimer >= 0.12) {
      hudTimer = 0;
      emitHud(false);
    }

    // 8. Camera Third-Person Behind Player vs Overhead Follow vs First-Person vs Free Orbit
    if (cameraMode === 'firstPerson') {
      // Positioned in section 2
    } else if (cameraMode === 'thirdPerson') {
      snapThirdPersonCameraToPlayer();
    } else if (cameraMode === 'follow') {
      const followCamX = playerTrooper.x + FOLLOW_OFFSET.x;
      const followCamY = playerTrooper.y + FOLLOW_OFFSET.y;
      const followCamZ = playerTrooper.z + FOLLOW_OFFSET.z;
      const camLambda = 6.2;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, followCamX, camLambda, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, followCamY, camLambda, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, followCamZ, camLambda, dt);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, playerTrooper.x, camLambda, dt);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, playerTrooper.y + 0.9, camLambda, dt);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, playerTrooper.z, camLambda, dt);
    } else if (orbitTransitionActive) {
      const lambda = 6.5;
      camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, lambda, dt);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, lambda, dt);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, lambda, dt);
      controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTarget.x, lambda, dt);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredTarget.y, lambda, dt);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredTarget.z, lambda, dt);

      if (
        camera.position.distanceTo(desiredCamPos) < 0.04 &&
        controls.target.distanceTo(desiredTarget) < 0.04
      ) {
        camera.position.copy(desiredCamPos);
        controls.target.copy(desiredTarget);
        orbitTransitionActive = false;
      }
    }

    renderMinimapNow(elapsed);
    driftDustMotes(dt, elapsed);
  }

  function stepRoundEnd(dt: number, elapsed: number) {
    stepRoundTransitionOrbit(dt, elapsed);
    if (activeOnlineSession && latestRoomSnapshot) {
      roundTransitionRemaining = latestRoomSnapshot.roundTransitionRemaining;
      emitHud(false);
      return;
    }
    roundTransitionRemaining = Math.max(0, roundTransitionRemaining - dt);
    if (roundTransitionRemaining <= 0) {
      advanceToNextRound();
    } else {
      emitHud(false);
    }
  }

  function stepSimulation(dt: number, elapsed: number) {
    if (matchPhase === 'menu') {
      stepShowcaseMenu(dt, elapsed);
    } else if (matchPhase === 'loading') {
      driftDustMotes(dt, elapsed);
    } else if (matchPhase === 'countdown') {
      stepCountdown(dt, elapsed);
    } else if (matchPhase === 'playing') {
      if (!isPaused) {
        stepPlayingMatch(dt, elapsed);
      }
    } else if (matchPhase === 'roundEnd') {
      stepRoundEnd(dt, elapsed);
    }
  }

  function renderOneFrame() {
    const now = performance.now();
    if (matchPhase === 'ended') {
      lastTimeMs = now;
      return;
    }
    const rawDt = Math.max(0.001, (now - lastTimeMs) / 1000);
    const totalDt = isSoftwareGl ? Math.min(rawDt, 1.2) : Math.min(rawDt, 0.05);
    const baseElapsed = (lastTimeMs - startTimeMs) / 1000;
    lastTimeMs = now;

    if (!(matchPhase === 'playing' && isPaused)) {
      if (isSoftwareGl && totalDt > 0.055) {
        const steps = Math.ceil(totalDt / 0.045);
        const subDt = totalDt / steps;
        for (let s = 1; s <= steps; s++) {
          stepSimulation(subDt, baseElapsed + subDt * s);
        }
      } else {
        stepSimulation(totalDt, (now - startTimeMs) / 1000);
      }
    }

    const allowShake = currentSettings.screenShake && !isPaused;
    if (matchPhase === 'playing' && cameraMode === 'orbit') {
      if (!isPaused) controls.update();
    } else if ((matchPhase === 'playing' || matchPhase === 'countdown') && cameraMode === 'firstPerson') {
      if (matchPhase === 'playing' && allowShake && cameraTrauma > 0.005) {
        const shake = cameraTrauma * cameraTrauma;
        const t = performance.now() * 0.032;
        camera.rotation.z += Math.sin(t * 1.7) * 0.022 * shake;
        camera.rotation.x += Math.cos(t * 2.1) * 0.014 * shake;
      }
    } else {
      camera.lookAt(controls.target);
      if (matchPhase === 'playing' && allowShake && cameraTrauma > 0.005) {
        const shake = cameraTrauma * cameraTrauma;
        const t = performance.now() * 0.032;
        camera.rotation.z += Math.sin(t * 1.7) * 0.018 * shake;
        camera.rotation.x += Math.cos(t * 2.1) * 0.012 * shake;
      }
    }

    arena.treeFadeUniforms.uTreePlayerPos.value.set(
      playerTrooper.x,
      playerTrooper.y,
      playerTrooper.z,
    );
    arena.treeFadeUniforms.uTreeCamPos.value.copy(camera.position);
    arena.treeFadeUniforms.uTreeFadeEnabled.value =
      matchPhase === 'playing' || matchPhase === 'countdown' ? 1 : 0;
    if (!isPaused) {
      const animElapsed = (now - startTimeMs) / 1000;
      arena.windUniforms.uWindTime.value = animElapsed;
      arena.surroundings.update(animElapsed);
    }

    if (composer && !isSoftwareGl) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }
  }

  function tick() {
    if (disposed) return;
    renderOneFrame();
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  window.__saveItDebug = {
    setTimeRemaining: (seconds: number) => {
      if (matchPhase === 'playing') {
        timeRemainingSeconds = Math.max(0, seconds);
        if (timeRemainingSeconds <= 0) {
          finishRound();
        } else {
          emitHud(true);
        }
      }
    },
    advanceRoundNow: () => {
      advanceToNextRound();
    },
    finishMatchNow: (winnerRole?: TrooperRole) => {
      const role = winnerRole ?? playerTeam;
      if (matchPhase === 'playing' || matchPhase === 'countdown') {
        const half = arena.arenaHalfSize;
        const r = half * 0.65;
        if (role === 'hero') {
          arena.terrainSim.applyWaterBrush(half * 0.35, -half * 0.3, r, 2.5);
          arena.terrainSim.applyWaterBrush(half * 0.35, half * 0.3, r, 2.5);
        } else {
          arena.terrainSim.applyFireBrush(-half * 0.35, -half * 0.3, r, 2.5);
          arena.terrainSim.applyFireBrush(-half * 0.35, half * 0.3, r, 2.5);
        }
        for (let k = 0; k < 6; k++) {
          const terrainStep = arena.terrainSim.step(1.0);
          if (terrainStep.hasDirty) arena.syncTerrain(terrainStep);
        }
        const ratio = arena.terrainSim.getMeadowRatio();
        const { heroPercent, villainPercent } = computeTeamTerritoryPercents(ratio);
        const hist: RoundOutcome[] = [1, 2, 3].map((rn) => ({
          roundNumber: rn,
          winner: role,
          heroPercent,
          villainPercent,
        }));
        heroRoundsWon = role === 'hero' ? 3 : 0;
        villainRoundsWon = role === 'villain' ? 3 : 0;
        roundHistory = hist;
        lastRoundOutcome = hist[2];
        finishMatch({
          heroRoundsWon,
          villainRoundsWon,
          roundHistory: hist,
          lastRound: hist[2],
          seriesOver: true,
          clinchedEarly: true,
          tiebreakerTriggered: false,
          seriesWinner: role,
          nextRoundNumber: null,
        });
      }
    },
    boostTeamTerritory: (role: TrooperRole) => {
      if (matchPhase === 'playing') {
        const half = arena.arenaHalfSize;
        const r = half * 0.58;
        if (role === 'hero') {
          arena.terrainSim.applyWaterBrush(half * 0.3, -half * 0.35, r, 2.5);
          arena.terrainSim.applyWaterBrush(half * 0.3, 0, r, 2.5);
          arena.terrainSim.applyWaterBrush(half * 0.3, half * 0.35, r, 2.5);
        } else {
          arena.terrainSim.applyFireBrush(-half * 0.3, -half * 0.35, r, 2.5);
          arena.terrainSim.applyFireBrush(-half * 0.3, 0, r, 2.5);
          arena.terrainSim.applyFireBrush(-half * 0.3, half * 0.35, r, 2.5);
        }
        for (let k = 0; k < 9; k++) {
          const terrainStep = arena.terrainSim.step(1.0);
          if (terrainStep.hasDirty) {
            arena.syncTerrain(terrainStep);
          }
        }
        emitHud(true);
      }
    },
    drainPlayerAmmo: () => {
      if (matchPhase === 'playing') {
        playerTrooper.ammo = 0;
        arenaSound.setElementalSpray(null);
        emitHud(true);
      }
    },
    givePlayerDizzyBomb: () => {
      if (matchPhase === 'playing') {
        playerTrooper.hasDizzyBomb = true;
        emitHud(true);
      }
    },
    spawnPersonalBombsForAll: () => {
      if (matchPhase === 'playing') {
        const half = arena.arenaHalfSize;
        for (let i = 0; i < troopers.length; i++) {
          const t = troopers[i];
          const gx = Math.max(-half + 2, Math.min(half - 2, t.x + (t.role === 'hero' ? 2.2 : -2.2)));
          const gz = Math.max(-half + 2, Math.min(half - 2, t.z + 1.8));
          pickups.spawnPersonalGrenade(t.id, gx, gz, arena.terrainSim);
          const dx = Math.max(-half + 2, Math.min(half - 2, t.x + (t.role === 'hero' ? 2.2 : -2.2)));
          const dz = Math.max(-half + 2, Math.min(half - 2, t.z - 1.8));
          pickups.spawnPersonalDizzy(t.id, dx, dz, arena.terrainSim);
        }
        renderMinimapNow((performance.now() - startTimeMs) / 1000);
        if (isSoftwareGl) renderOneFrame();
      }
    },
    setOrbitCamera: (pos: [number, number, number], target: [number, number, number]) => {
      if (matchPhase === 'playing') {
        setCameraModeInternal('orbit');
        orbitTransitionActive = false;
        camera.position.set(pos[0], pos[1], pos[2]);
        controls.target.set(target[0], target[1], target[2]);
        controls.update();
        renderOneFrame();
      }
    },
    getState: () => {
      let visibleSignCount = 0;
      pickups.personalSigns.forEach((s) => {
        if (s.root.visible) visibleSignCount++;
      });
      let visibleGrenadeCount = 0;
      pickups.personalGrenades.forEach((g) => {
        if (g.root.visible) visibleGrenadeCount++;
      });
      let visibleDizzyCount = 0;
      pickups.personalDizzyBombs.forEach((d) => {
        if (d.root.visible) visibleDizzyCount++;
      });
      return {
        matchPhase,
        isPaused,
        matchMode: currentMode,
        cameraMode,
        arenaSpan: arena.arenaSpan,
        trooperCount: troopers.length,
        timeRemainingSeconds,
        currentRound,
        totalRounds:
          tiebreakerTriggered ||
          currentRound > TOTAL_ROUNDS ||
          roundHistory.length > TOTAL_ROUNDS
            ? MAX_ROUNDS_WITH_TIEBREAKER
            : TOTAL_ROUNDS,
        heroRoundsWon,
        villainRoundsWon,
        tiebreakerTriggered,
        roundHistory: [...roundHistory],
        matchOutcome,
        playerPos: [playerTrooper.x, playerTrooper.y, playerTrooper.z],
        playerYaw: playerTrooper.yaw,
        playerAmmo: playerTrooper.ammo,
        playerHasDizzyBomb: playerTrooper.hasDizzyBomb,
        playerDizzyRemaining: playerTrooper.dizzyTimer,
        playerSignActive: Boolean(pickups.getSignForOwner(playerTrooper.id)?.active),
        visibleSignCount,
        visibleGrenadeCount,
        visibleDizzyCount,
        isBoostSprinting: isPlayerBoostSprinting,
        isMuted: arenaSound.isMuted(),
        cameraPos: [camera.position.x, camera.position.y, camera.position.z],
        troopers: troopers.map((t) => ({
          id: t.id,
          role: t.role,
          isBot: t.isBot,
          x: t.x,
          z: t.z,
          dizzyTimer: t.dizzyTimer,
          hasDizzyBomb: t.hasDizzyBomb,
        })),
      };
    },
  };

  function closeOnlineClient() {
    multiplayerClient?.close();
    multiplayerClient = null;
    activeOnlineSession = null;
    latestRoomSnapshot = null;
    localOnlineSlotIndex = 0;
  }

  function applySnapshotToScene(snapshot: OnlineRoomSnapshot) {
    latestRoomSnapshot = snapshot;
    if (!activeOnlineSession) return;

    const myUid = activeOnlineSession.playerUid;
    for (let i = 0; i < troopers.length; i++) {
      troopers[i].remoteUid = undefined;
      troopers[i].remoteDisplayName = undefined;
      if (troopers[i] !== playerTrooper) {
        troopers[i].isBot = true;
      }
    }

    for (const rp of snapshot.players) {
      if (rp.uid === myUid) {
        if (rp.dizzyTimer > playerTrooper.dizzyTimer) {
          playerTrooper.dizzyTimer = rp.dizzyTimer;
        }
        continue;
      }
      const matchSlot = troopers.find(
        (t) => t !== playerTrooper && t.role === rp.team && t.slotIndex === rp.slotIndex,
      ) ?? troopers.find((t) => t !== playerTrooper && !t.remoteUid && t.role === rp.team);
      if (matchSlot) {
        matchSlot.isBot = false;
        matchSlot.remoteUid = rp.uid;
        matchSlot.remoteDisplayName = rp.displayName;
        matchSlot.remoteTargetX = rp.x;
        matchSlot.remoteTargetZ = rp.z;
        matchSlot.remoteYaw = rp.yaw;
        matchSlot.remoteSpraying = rp.spraying;
        matchSlot.ammo = rp.ammo;
        if (rp.dizzyTimer > matchSlot.dizzyTimer) {
          matchSlot.dizzyTimer = rp.dizzyTimer;
        }
      }
    }

    if (snapshot.phase === 'ended' && matchPhase !== 'ended' && matchPhase !== 'loading') {
      const winner: TrooperRole | 'draw' =
        snapshot.heroRoundsWon > snapshot.villainRoundsWon
          ? 'hero'
          : snapshot.villainRoundsWon > snapshot.heroRoundsWon
            ? 'villain'
            : 'draw';
      const last =
        snapshot.roundHistory[snapshot.roundHistory.length - 1] ?? {
          roundNumber: snapshot.currentRound,
          winner,
          heroPercent: snapshot.heroPercent,
          villainPercent: snapshot.villainPercent,
        };
      finishRound(snapshot.heroPercent / 100, {
        heroRoundsWon: snapshot.heroRoundsWon,
        villainRoundsWon: snapshot.villainRoundsWon,
        roundHistory: snapshot.roundHistory,
        lastRound: last,
        seriesOver: true,
        clinchedEarly:
          snapshot.roundHistory.length < TOTAL_ROUNDS &&
          Math.abs(snapshot.heroRoundsWon - snapshot.villainRoundsWon) >
            TOTAL_ROUNDS - snapshot.roundHistory.length,
        tiebreakerTriggered: snapshot.tiebreakerTriggered,
        seriesWinner: winner,
        nextRoundNumber: null,
      });
      return;
    }

    if (matchPhase === 'countdown') {
      countdownRemainingSeconds = snapshot.countdownRemainingSeconds;
      if (snapshot.phase === 'playing') {
        countdownRemainingSeconds = 0;
        matchPhase = 'playing';
        goBannerRemainingSeconds = GO_BANNER_DURATION_SECONDS;
        streamSystem.reticleGroup.visible = cameraMode !== 'orbit';
        arenaSound.playCountdownTick(0);
        arenaSound.setGameplayMusicState(true, 0);
        syncVisibilityAndFpsPose();
        emitHud(true);
      }
    } else if (matchPhase === 'playing') {
      timeRemainingSeconds = snapshot.timeRemainingSeconds;
      if (snapshot.phase === 'roundEnd') {
        finishRound(snapshot.heroPercent / 100);
      }
    } else if (matchPhase === 'ended') {
      emitHud(false);
    }
  }

  function connectOnlineClient(session: OnlineMatchSessionConfig) {
    multiplayerClient?.close();
    activeOnlineSession = session;
    latestRoomSnapshot = null;
    multiplayerClient = new MultiplayerClient(
      {
        roomCode: session.roomCode,
        uid: session.playerUid,
        displayName: session.displayName,
        team: session.team,
        modeId: session.modeId,
        hostUid: session.hostUid,
      },
      {
        onWelcome: (yourSlotIndex, snapshot) => {
          localOnlineSlotIndex = yourSlotIndex;
          const desiredSlot = troopers.find(
            (t) => t.role === session.team && t.slotIndex === yourSlotIndex,
          );
          if (desiredSlot && desiredSlot !== playerTrooper) {
            playerTrooper.isBot = true;
            desiredSlot.isBot = false;
            playerTrooper = desiredSlot;
            syncVisibilityAndFpsPose();
          }
          applySnapshotToScene(snapshot);
        },
        onState: (snapshot) => {
          applySnapshotToScene(snapshot);
        },
        onBrush: (evt) => {
          if (evt.fromUid === session.playerUid || !arena) return;
          if (evt.role === 'hero') {
            arena.terrainSim.applyWaterBrush(evt.x, evt.z, evt.radius, evt.strength);
            arena.vegetation.growAt(evt.x, evt.z, evt.radius, arena.terrainSim);
          } else {
            arena.terrainSim.applyFireBrush(evt.x, evt.z, evt.radius, evt.strength);
            arena.vegetation.burnAt(evt.x, evt.z, evt.radius);
          }
          const sy = arena.terrainSim.sampleHeight(evt.x, evt.z);
          streamSystem?.spawnBurst(evt.role, evt.x, sy + 0.25, evt.z, 3, 0.28);
        },
        onGrenade: (evt) => {
          if (evt.fromUid === session.playerUid || !arena || !pickups) return;
          const targetY = arena.terrainSim.sampleHeight(evt.targetX, evt.targetZ);
          pickups.launchGrenade(
            evt.role,
            evt.originX,
            evt.originY,
            evt.originZ,
            evt.targetX,
            targetY,
            evt.targetZ,
          );
        },
        onDizzy: (evt) => {
          if (evt.fromUid === session.playerUid || !arena) return;
          const sy = arena.terrainSim.sampleHeight(evt.x, evt.z);
          streamSystem?.spawnBurst(evt.role, evt.x, sy + 0.35, evt.z, 26, 0.92);
          arenaSound.playDizzyImpact();
          if (evt.hitUids.includes(session.playerUid)) {
            playerTrooper.dizzyTimer = DIZZY_DURATION_SECONDS;
            playerTrooper.vx = 0;
            playerTrooper.vz = 0;
            emitHud(true);
          }
        },
        onRoundReset: (roundNumber, snapshot) => {
          latestRoomSnapshot = snapshot;
          if (roundNumber === 1 && snapshot.roundHistory.length === 0) {
            beginOnlineRematchPreservingRoom();
          } else if (matchPhase === 'roundEnd' || matchPhase === 'ended') {
            advanceToNextRound();
          }
        },
      },
    );
  }

  function beginOnlineRematchPreservingRoom() {
    if (!activeOnlineSession) return;
    const seq = ++matchStartSeq;
    clearLoadingTimers();
    exitPointerLockIfNeeded();
    clearHeldInputs();
    resetSeriesState();
    isPaused = false;
    matchPhase = 'loading';
    loadingHeading = `Rematch · Room ${activeOnlineSession.roomCode}`;
    loadingProgress = 0.25;
    loadingStage = 'Resetting Arena 50/50 & Ammo...';
    countdownRemainingSeconds = COUNTDOWN_SECONDS;
    goBannerRemainingSeconds = 0;
    arenaSound.setPaused(false);
    arenaSound.setElementalSpray(null);
    arenaSound.setLobbyMusicActive(false);
    arenaSound.setGameplayMusicState(false, 0);
    emitHud(true);

    const scheduleStage = (delayMs: number, fn: () => void) => {
      const tid = window.setTimeout(() => {
        if (disposed || seq !== matchStartSeq) return;
        fn();
      }, delayMs);
      loadingTimerIds.push(tid);
    };

    scheduleStage(80, () => {
      loadingProgress = 0.62;
      loadingStage = getLoadingStageLabel(0.62);
      emitHud(true);
    });

    scheduleStage(180, () => {
      rebuildMatchScene(playerTeam, currentMode, 'loading');
      loadingProgress = 0.92;
      loadingStage = getLoadingStageLabel(0.92);
      emitHud(true);
    });

    scheduleStage(360, () => {
      matchPhase = 'countdown';
      countdownRemainingSeconds = latestRoomSnapshot?.countdownRemainingSeconds ?? COUNTDOWN_SECONDS;
      lastCountdownBeep = 3;
      goBannerRemainingSeconds = 0;
      lastTimeMs = performance.now();
      arenaSound.playCountdownTick(3);
      syncVisibilityAndFpsPose();
      emitHud(true);
      renderMinimapNow((performance.now() - startTimeMs) / 1000);
      if (isSoftwareGl) renderOneFrame();
    });
  }

  function clearLoadingTimers() {
    while (loadingTimerIds.length > 0) {
      const id = loadingTimerIds.pop();
      if (id !== undefined) clearTimeout(id);
    }
  }

  function beginMatchWithIntro(
    team: TrooperRole,
    modeId: MatchModeId,
    onlineSession?: OnlineMatchSessionConfig,
  ) {
    const seq = ++matchStartSeq;
    clearLoadingTimers();
    exitPointerLockIfNeeded();
    clearHeldInputs();
    resetSeriesState();
    isPaused = false;
    playerTeam = team;
    currentMode = modeId;
    if (onlineSession) {
      connectOnlineClient(onlineSession);
    } else {
      closeOnlineClient();
    }
    matchPhase = 'loading';
    loadingHeading = onlineSession ? `Online Room ${onlineSession.roomCode}` : 'Match Prep';
    loadingProgress = 0.14;
    loadingStage = onlineSession
      ? `Joining Online Match ${onlineSession.roomCode}...`
      : getLoadingStageLabel(0.14);
    countdownRemainingSeconds = COUNTDOWN_SECONDS;
    goBannerRemainingSeconds = 0;
    arenaSound.setPaused(false);
    arenaSound.setElementalSpray(null);
    arenaSound.setLobbyMusicActive(false);
    arenaSound.setGameplayMusicState(false, 0);
    emitHud(true);

    const scheduleStage = (delayMs: number, fn: () => void) => {
      const tid = window.setTimeout(() => {
        if (disposed || seq !== matchStartSeq) return;
        fn();
      }, delayMs);
      loadingTimerIds.push(tid);
    };

    scheduleStage(80, () => {
      loadingProgress = 0.42;
      loadingStage = getLoadingStageLabel(0.42);
      emitHud(true);
    });

    scheduleStage(200, () => {
      rebuildMatchScene(team, modeId, 'loading');
      loadingProgress = 0.78;
      loadingStage = getLoadingStageLabel(0.78);
      emitHud(true);
    });

    scheduleStage(520, () => {
      loadingProgress = 1.0;
      loadingStage = getLoadingStageLabel(1.0);
      emitHud(true);
    });

    scheduleStage(820, () => {
      matchPhase = 'countdown';
      countdownRemainingSeconds = latestRoomSnapshot?.countdownRemainingSeconds ?? COUNTDOWN_SECONDS;
      lastCountdownBeep = 3;
      goBannerRemainingSeconds = 0;
      lastTimeMs = performance.now();
      arenaSound.playCountdownTick(3);
      syncVisibilityAndFpsPose();
      emitHud(true);
      renderMinimapNow((performance.now() - startTimeMs) / 1000);
      if (isSoftwareGl) renderOneFrame();
    });
  }

  function beginReturnToMenu() {
    const seq = ++matchStartSeq;
    clearLoadingTimers();
    closeOnlineClient();
    exitPointerLockIfNeeded();
    clearHeldInputs();
    isPaused = false;
    arenaSound.setPaused(false);
    arenaSound.setElementalSpray(null);
    arenaSound.setGameplayMusicState(false, 0);
    matchPhase = 'loading';
    loadingHeading = 'Lobby Showcase';
    loadingProgress = 0.25;
    loadingStage = 'Returning to Lobby...';
    emitHud(true);

    const scheduleStage = (delayMs: number, fn: () => void) => {
      const tid = window.setTimeout(() => {
        if (disposed || seq !== matchStartSeq) return;
        fn();
      }, delayMs);
      loadingTimerIds.push(tid);
    };

    scheduleStage(40, () => {
      loadingProgress = 0.55;
      loadingStage = 'Resetting Battle Arena...';
      emitHud(true);
    });

    scheduleStage(90, () => {
      resetSeriesState();
      goBannerRemainingSeconds = 0;
      countdownRemainingSeconds = COUNTDOWN_SECONDS;
      rebuildMatchScene(playerTeam, currentMode, 'loading', { previewMenu: true });
      loadingHeading = 'Lobby Showcase';
      loadingProgress = 0.92;
      loadingStage = 'Opening Lobby...';
      emitHud(true);
    });

    scheduleStage(240, () => {
      loadingProgress = 1.0;
      loadingStage = 'Opening Lobby...';
      emitHud(true);
    });

    scheduleStage(360, () => {
      matchPhase = 'menu';
      emitHud(true);
      if (isSoftwareGl) renderOneFrame();
    });
  }

  tick();

  return {
    startMatch: (
      team: TrooperRole,
      modeId: MatchModeId,
      options?: { skipIntro?: boolean; onlineSession?: OnlineMatchSessionConfig },
    ) => {
      if (options?.skipIntro) {
        matchStartSeq++;
        clearLoadingTimers();
        resetSeriesState();
        goBannerRemainingSeconds = 0;
        countdownRemainingSeconds = 0;
        if (options.onlineSession) {
          connectOnlineClient(options.onlineSession);
        } else {
          closeOnlineClient();
        }
        rebuildMatchScene(team, modeId, 'playing');
        if (isSoftwareGl) renderOneFrame();
      } else {
        beginMatchWithIntro(team, modeId, options?.onlineSession);
      }
    },
    advanceRound: () => {
      arenaSound.unlock();
      advanceToNextRound();
    },
    voteRematch: () => {
      arenaSound.unlock();
      if (activeOnlineSession && multiplayerClient) {
        multiplayerClient.sendRematchVote();
        return;
      }
      beginMatchWithIntro(playerTeam, currentMode);
    },
    returnToMenu: () => {
      arenaSound.unlock();
      beginReturnToMenu();
    },
    restartMatch: (options?: { skipIntro?: boolean }) => {
      if (activeOnlineSession && multiplayerClient) {
        multiplayerClient.sendRestartSeries();
        beginMatchWithIntro(playerTeam, currentMode, activeOnlineSession);
        return;
      }
      if (options?.skipIntro) {
        matchStartSeq++;
        clearLoadingTimers();
        resetSeriesState();
        goBannerRemainingSeconds = 0;
        countdownRemainingSeconds = 0;
        rebuildMatchScene(playerTeam, currentMode, 'playing');
        if (isSoftwareGl) renderOneFrame();
      } else {
        beginMatchWithIntro(playerTeam, currentMode);
      }
    },
    setPaused: (paused: boolean) => {
      arenaSound.unlock();
      setPausedInternal(paused);
    },
    togglePause: () => {
      arenaSound.unlock();
      setPausedInternal(!isPaused);
      return isPaused;
    },
    setCameraMode: setCameraModeInternal,
    setMinimapCanvas: (canvas: HTMLCanvasElement | null) => {
      minimapCanvas = canvas;
      if (canvas) {
        renderMinimapNow((performance.now() - startTimeMs) / 1000);
      }
    },
    toggleMute: () => {
      arenaSound.unlock();
      const next = arenaSound.toggleMuted();
      currentSettings = { ...currentSettings, muted: next };
      emitHud(true);
      return next;
    },
    updateSettings: (nextSettings: GameSettings) => {
      currentSettings = nextSettings;
      arenaSound.applyAudioSettings(nextSettings);
      if (matchPhase === 'playing') {
        const baseFov =
          (cameraMode === 'firstPerson' ? 62 : cameraMode === 'thirdPerson' ? 52 : 45) +
          nextSettings.fovBoost;
        camera.fov = Math.max(38, Math.min(88, baseFov + (isPlayerBoostSprinting ? 4.8 : 0)));
        camera.updateProjectionMatrix();
      }
      emitHud(true);
    },
    setKeybindListening: (listening: boolean) => {
      keybindListening = listening;
    },
    setPreset: (presetId: CameraPresetId) => {
      const preset = CAMERA_PRESETS.find((p) => p.id === presetId);
      if (!preset || matchPhase !== 'playing') return;
      if (cameraMode !== 'orbit') {
        setCameraModeInternal('orbit');
      }
      const scale = arena.arenaHalfSize / 20;
      desiredCamPos.set(
        preset.position[0] * scale,
        preset.position[1] * Math.max(1, scale * 0.92),
        preset.position[2] * scale,
      );
      desiredTarget.set(
        preset.target[0] * scale,
        preset.target[1],
        preset.target[2] * scale,
      );
      if (isSoftwareGl) {
        camera.position.copy(desiredCamPos);
        controls.target.copy(desiredTarget);
        controls.update();
        renderOneFrame();
      } else {
        orbitTransitionActive = true;
      }
    },
    dispose: () => {
      disposed = true;
      matchStartSeq++;
      clearLoadingTimers();
      closeOnlineClient();
      delete window.__saveItDebug;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeldInputs);
      document.removeEventListener('visibilitychange', clearHeldInputs);
      controls.removeEventListener('start', handleControlStart);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      controls.dispose();
      composer?.dispose();
      fpHeroRig.dispose();
      fpVillainRig.dispose();
      streamSystem.dispose();
      pickups.dispose();
      for (let i = 0; i < troopers.length; i++) {
        troopers[i].rig.dispose();
      }
      arena.dispose();
      sharedEnv.dispose();
      arenaSound.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    },
  };
}
