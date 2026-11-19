export type ElementalRole = 'hero' | 'villain';

export interface AudioMixSettings {
  masterVolume: number; // 0..100
  musicVolume: number; // 0..100
  sfxVolume: number; // 0..100
  muted: boolean;
}

// Exciting 130 BPM 8-bar Esports Arena Synthwave Anthem (Am -> F -> C -> G -> F -> G -> Em -> Am)
const LOBBY_ROOTS = [110.0, 87.31, 130.81, 98.0, 87.31, 98.0, 82.41, 110.0];
const LOBBY_CHORDS: number[][] = [
  [220.0, 261.63, 329.63, 440.0], // Am
  [174.61, 220.0, 261.63, 349.23], // F
  [261.63, 329.63, 392.0, 523.25], // C
  [196.0, 246.94, 293.66, 392.0], // G
  [174.61, 220.0, 261.63, 349.23], // F
  [196.0, 246.94, 293.66, 392.0], // G
  [164.81, 196.0, 246.94, 329.63], // Em
  [220.0, 261.63, 329.63, 440.0], // Am
];

const LOBBY_LEAD_RIFFS: number[][] = [
  [523.25, 0, 659.25, 0, 783.99, 0, 659.25, 587.33, 523.25, 0, 659.25, 0, 880.0, 0, 783.99, 0],
  [523.25, 0, 659.25, 0, 587.33, 523.25, 440.0, 0, 440.0, 523.25, 587.33, 0, 659.25, 0, 523.25, 0],
  [659.25, 0, 783.99, 0, 880.0, 0, 783.99, 659.25, 587.33, 0, 659.25, 0, 783.99, 0, 1046.5, 0],
  [783.99, 0, 659.25, 0, 587.33, 523.25, 493.88, 0, 587.33, 0, 659.25, 783.99, 880.0, 0, 783.99, 0],
  [698.46, 0, 659.25, 0, 587.33, 0, 523.25, 0, 587.33, 659.25, 698.46, 0, 880.0, 0, 783.99, 0],
  [783.99, 0, 880.0, 0, 987.77, 0, 880.0, 783.99, 659.25, 0, 783.99, 0, 880.0, 0, 987.77, 0],
  [659.25, 0, 587.33, 0, 493.88, 0, 659.25, 0, 783.99, 0, 659.25, 587.33, 493.88, 0, 587.33, 0],
  [880.0, 0, 783.99, 0, 659.25, 0, 523.25, 587.33, 659.25, 0, 783.99, 0, 880.0, 987.77, 1046.5, 0],
];

// High-energy 138 BPM In-Game Combat Groove (Dm -> Bb -> C -> Am -> Dm -> F -> G -> A7sus4)
const BATTLE_ROOTS = [73.42, 58.27, 65.41, 55.0, 73.42, 87.31, 98.0, 110.0];
const BATTLE_CHORDS: number[][] = [
  [146.83, 220.0, 293.66, 349.23], // Dm
  [116.54, 174.61, 233.08, 293.66], // Bb
  [130.81, 196.0, 261.63, 329.63], // C
  [110.0, 164.81, 220.0, 261.63], // Am
  [146.83, 220.0, 293.66, 349.23], // Dm
  [174.61, 220.0, 261.63, 349.23], // F
  [196.0, 246.94, 293.66, 392.0], // G
  [164.81, 220.0, 277.18, 329.63], // A
];

const BATTLE_LEAD_RIFFS: number[][] = [
  [587.33, 0, 659.25, 698.46, 0, 587.33, 523.25, 0, 587.33, 0, 698.46, 0, 880.0, 0, 783.99, 0],
  [587.33, 0, 698.46, 0, 659.25, 587.33, 523.25, 0, 466.16, 0, 523.25, 587.33, 698.46, 0, 659.25, 0],
  [523.25, 0, 659.25, 0, 783.99, 0, 659.25, 587.33, 523.25, 0, 587.33, 659.25, 783.99, 0, 880.0, 0],
  [880.0, 0, 783.99, 659.25, 0, 587.33, 523.25, 0, 440.0, 0, 523.25, 0, 659.25, 0, 587.33, 0],
  [587.33, 587.33, 0, 698.46, 880.0, 0, 783.99, 698.46, 587.33, 0, 659.25, 698.46, 880.0, 0, 1046.5, 0],
  [1046.5, 0, 880.0, 0, 783.99, 698.46, 659.25, 0, 698.46, 0, 783.99, 0, 880.0, 0, 1046.5, 0],
  [783.99, 0, 880.0, 0, 987.77, 0, 880.0, 783.99, 698.46, 0, 783.99, 880.0, 987.77, 0, 1174.66, 0],
  [1174.66, 0, 1046.5, 880.0, 0, 783.99, 698.46, 659.25, 587.33, 0, 659.25, 783.99, 880.0, 1046.5, 1174.66, 0],
];

class ArenaSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private musicComp: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private longNoiseBuffer: AudioBuffer | null = null;
  private lastEmptyMs = 0;

  private masterLevel = 0.85;
  private musicLevel = 0.65;
  private sfxLevel = 0.9;
  private muted = false;
  private paused = false;

  // Continuous spray loop nodes
  private sprayNodesReady = false;
  private waterSprayGain: GainNode | null = null;
  private fireSprayGain: GainNode | null = null;
  private loopSources: AudioScheduledSourceNode[] = [];
  private activeSprayRole: ElementalRole | null = null;

  // Running footsteps state
  private strideAccum = 0;
  private stepParity = 0;

  // Lobby background music state
  private lobbyActive = false;
  private lobbyGain: GainNode | null = null;
  private lobbyTimerId: number | null = null;
  private lobbyStepIndex = 0;
  private lobbyNextNoteTime = 0;

  // In-game exciting battle soundtrack state
  private gameplayMusicActive = false;
  private gameplayTension = 0; // 0 (round start) -> 1 (final 15s climax)
  private gameplayGain: GainNode | null = null;
  private gameplayTimerId: number | null = null;
  private gameplayStepIndex = 0;
  private gameplayNextNoteTime = 0;

  private unlocked = false;

  private ensureContext(fromUserGesture = false): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (fromUserGesture) {
      this.unlocked = true;
    } else if (!this.unlocked) {
      return null;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.musicComp = this.ctx.createDynamicsCompressor();
        this.musicComp.threshold.value = -14;
        this.musicComp.knee.value = 10;
        this.musicComp.ratio.value = 3.5;
        this.musicComp.attack.value = 0.005;
        this.musicComp.release.value = 0.14;
        this.sfxBus = this.ctx.createGain();

        this.musicBus.connect(this.musicComp);
        this.musicComp.connect(this.masterGain);
        this.sfxBus.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
        this.syncBusGains(0.01);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      if (!this.noiseBuffer && this.ctx) {
        const len = Math.floor(this.ctx.sampleRate * 0.8);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buf;
      }
      if (!this.longNoiseBuffer && this.ctx) {
        const len = Math.floor(this.ctx.sampleRate * 2.8);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        let b0 = 0;
        let b1 = 0;
        let b2 = 0;
        for (let i = 0; i < len; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.95 * b2 + white * 0.048;
          data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.22) * 1.45));
        }
        this.longNoiseBuffer = buf;
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private getSfxOut(ctx: AudioContext): AudioNode {
    return this.sfxBus ?? this.masterGain ?? ctx.destination;
  }

  private getMusicOut(ctx: AudioContext): AudioNode {
    return this.musicBus ?? this.masterGain ?? ctx.destination;
  }

  private syncBusGains(tau = 0.04): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const effectiveMaster = this.muted ? 0 : this.masterLevel;
    const pauseMusicScale = this.paused ? 0.35 : 1.0;
    const pauseSfxScale = this.paused ? 0.0 : 1.0;

    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(effectiveMaster, t, tau);
    }
    if (this.musicBus) {
      this.musicBus.gain.setTargetAtTime(this.musicLevel * pauseMusicScale, t, 0.08);
    }
    if (this.sfxBus) {
      this.sfxBus.gain.setTargetAtTime(this.sfxLevel * pauseSfxScale, t, tau);
    }
  }

  applyAudioSettings(settings: AudioMixSettings): void {
    this.masterLevel = Math.max(0, Math.min(1, settings.masterVolume / 100));
    this.musicLevel = Math.max(0, Math.min(1, settings.musicVolume / 100));
    this.sfxLevel = Math.max(0, Math.min(1, settings.sfxVolume / 100));
    this.muted = settings.muted;
    this.syncBusGains(0.03);
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.setElementalSpray(null);
    }
    this.syncBusGains(0.05);
  }

  private ensureSprayNodes(ctx: AudioContext): void {
    if (this.sprayNodesReady || !this.longNoiseBuffer) return;

    try {
      const out = this.getSfxOut(ctx);

      // 1. Multi-layered Pressurized Water Jet Graph
      this.waterSprayGain = ctx.createGain();
      this.waterSprayGain.gain.value = 0;
      this.waterSprayGain.connect(out);

      const waterNoise = ctx.createBufferSource();
      waterNoise.buffer = this.longNoiseBuffer;
      waterNoise.loop = true;

      // High-velocity mist spray
      const waterMistFilter = ctx.createBiquadFilter();
      waterMistFilter.type = 'highpass';
      waterMistFilter.frequency.value = 3400;

      // Pressurized nozzle core
      const waterNozzleFilter = ctx.createBiquadFilter();
      waterNozzleFilter.type = 'bandpass';
      waterNozzleFilter.frequency.value = 1750;
      waterNozzleFilter.Q.value = 1.15;

      // Fluid cavitation body with bubbling LFO
      const waterBodyFilter = ctx.createBiquadFilter();
      waterBodyFilter.type = 'bandpass';
      waterBodyFilter.frequency.value = 540;
      waterBodyFilter.Q.value = 1.25;

      const waterLfo = ctx.createOscillator();
      waterLfo.type = 'sine';
      waterLfo.frequency.value = 14.2;
      const waterLfoGain = ctx.createGain();
      waterLfoGain.gain.value = 240;
      waterLfo.connect(waterLfoGain).connect(waterBodyFilter.frequency);

      const waterPumpOsc = ctx.createOscillator();
      waterPumpOsc.type = 'triangle';
      waterPumpOsc.frequency.value = 142;
      const waterPumpFilter = ctx.createBiquadFilter();
      waterPumpFilter.type = 'lowpass';
      waterPumpFilter.frequency.value = 260;
      const waterPumpGain = ctx.createGain();
      waterPumpGain.gain.value = 0.08;

      const mistMix = ctx.createGain();
      mistMix.gain.value = 0.34;
      const nozzleMix = ctx.createGain();
      nozzleMix.gain.value = 0.62;
      const bodyMix = ctx.createGain();
      bodyMix.gain.value = 0.78;

      waterNoise.connect(waterMistFilter).connect(mistMix).connect(this.waterSprayGain);
      waterNoise.connect(waterNozzleFilter).connect(nozzleMix).connect(this.waterSprayGain);
      waterNoise.connect(waterBodyFilter).connect(bodyMix).connect(this.waterSprayGain);
      waterPumpOsc
        .connect(waterPumpFilter)
        .connect(waterPumpGain)
        .connect(this.waterSprayGain);

      waterNoise.start();
      waterLfo.start();
      waterPumpOsc.start();
      this.loopSources.push(waterNoise, waterLfo, waterPumpOsc);

      // 2. Multi-layered Torch/Flamethrower Combustion Graph
      this.fireSprayGain = ctx.createGain();
      this.fireSprayGain.gain.value = 0;
      this.fireSprayGain.connect(out);

      const fireNoise = ctx.createBufferSource();
      fireNoise.buffer = this.longNoiseBuffer;
      fireNoise.loop = true;

      const fireRoarFilter = ctx.createBiquadFilter();
      fireRoarFilter.type = 'lowpass';
      fireRoarFilter.frequency.value = 460;
      fireRoarFilter.Q.value = 1.4;

      const fireFlutterFilter = ctx.createBiquadFilter();
      fireFlutterFilter.type = 'bandpass';
      fireFlutterFilter.frequency.value = 780;
      fireFlutterFilter.Q.value = 0.9;

      const fireLfo = ctx.createOscillator();
      fireLfo.type = 'triangle';
      fireLfo.frequency.value = 18.5;
      const fireLfoGain = ctx.createGain();
      fireLfoGain.gain.value = 190;
      fireLfo.connect(fireLfoGain).connect(fireRoarFilter.frequency);

      const fireCrackleFilter = ctx.createBiquadFilter();
      fireCrackleFilter.type = 'bandpass';
      fireCrackleFilter.frequency.value = 3900;
      fireCrackleFilter.Q.value = 1.4;
      const crackleMix = ctx.createGain();
      crackleMix.gain.value = 0.22;

      const fireBurnerOsc = ctx.createOscillator();
      fireBurnerOsc.type = 'sawtooth';
      fireBurnerOsc.frequency.value = 64;
      const fireBurnerFilter = ctx.createBiquadFilter();
      fireBurnerFilter.type = 'lowpass';
      fireBurnerFilter.frequency.value = 165;
      const fireBurnerGain = ctx.createGain();
      fireBurnerGain.gain.value = 0.16;

      const roarMix = ctx.createGain();
      roarMix.gain.value = 0.92;
      const flutterMix = ctx.createGain();
      flutterMix.gain.value = 0.52;

      fireNoise.connect(fireRoarFilter).connect(roarMix).connect(this.fireSprayGain);
      fireNoise.connect(fireFlutterFilter).connect(flutterMix).connect(this.fireSprayGain);
      fireNoise.connect(fireCrackleFilter).connect(crackleMix).connect(this.fireSprayGain);
      fireBurnerOsc
        .connect(fireBurnerFilter)
        .connect(fireBurnerGain)
        .connect(this.fireSprayGain);

      fireNoise.start();
      fireLfo.start();
      fireBurnerOsc.start();
      this.loopSources.push(fireNoise, fireLfo, fireBurnerOsc);

      this.sprayNodesReady = true;
    } catch {
      // Ignore Web Audio graph errors in restricted environments
    }
  }

  unlock(): void {
    const ctx = this.ensureContext(true);
    if (!ctx) return;
    if (this.lobbyActive && this.lobbyTimerId === null) {
      this.startLobbyScheduler();
    }
    if (this.gameplayMusicActive && this.gameplayTimerId === null) {
      this.startGameplayScheduler();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(nextMuted: boolean): void {
    this.muted = nextMuted;
    this.syncBusGains(0.03);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setLobbyMusicActive(active: boolean): void {
    if (this.lobbyActive === active) return;
    this.lobbyActive = active;

    if (active) {
      this.setGameplayMusicState(false, 0);
      const ctx = this.ensureContext();
      if (ctx) {
        this.ensureLobbyGain(ctx);
        if (this.lobbyGain) {
          this.lobbyGain.gain.setTargetAtTime(0.36, ctx.currentTime, 0.22);
        }
        this.startLobbyScheduler();
      }
    } else {
      this.stopLobbyScheduler();
      if (this.ctx && this.lobbyGain) {
        this.lobbyGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.18);
      }
    }
  }

  /**
   * Drives the exciting 138-146 BPM in-game combat soundtrack, building extra
   * rhythmic fills & octave synth energy into the final stretch of each round.
   */
  setGameplayMusicState(active: boolean, tension: number): void {
    this.gameplayTension = Math.max(0, Math.min(1, tension));
    const targetGain = 0.105 + this.gameplayTension * 0.035;
    if (this.gameplayMusicActive === active) {
      if (active && this.ctx && this.gameplayGain) {
        this.gameplayGain.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.18);
      }
      return;
    }
    this.gameplayMusicActive = active;

    if (active) {
      const ctx = this.ensureContext();
      if (ctx) {
        this.ensureGameplayGain(ctx);
        if (this.gameplayGain) {
          this.gameplayGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.22);
        }
        this.startGameplayScheduler();
      }
    } else {
      this.stopGameplayScheduler();
      if (this.ctx && this.gameplayGain) {
        this.gameplayGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
      }
    }
  }

  private ensureLobbyGain(ctx: AudioContext): void {
    if (this.lobbyGain) return;
    this.lobbyGain = ctx.createGain();
    this.lobbyGain.gain.value = 0.0001;
    this.lobbyGain.connect(this.getMusicOut(ctx));
  }

  private ensureGameplayGain(ctx: AudioContext): void {
    if (this.gameplayGain) return;
    this.gameplayGain = ctx.createGain();
    this.gameplayGain.gain.value = 0.0001;
    this.gameplayGain.connect(this.getMusicOut(ctx));
  }

  private startLobbyScheduler(): void {
    if (this.lobbyTimerId !== null) return;
    const ctx = this.ctx;
    if (!ctx) return;
    this.ensureLobbyGain(ctx);
    if (this.lobbyGain) {
      this.lobbyGain.gain.setTargetAtTime(0.36, ctx.currentTime, 0.18);
    }
    this.lobbyNextNoteTime = ctx.currentTime + 0.04;

    const scheduleStep = () => {
      if (!this.lobbyActive || !this.ctx || !this.lobbyGain) return;
      if (this.ctx.state !== 'running') return;

      // 130 BPM 16th-note grid (0.11538s per 16th)
      const stepDur = 0.11538;
      while (this.lobbyNextNoteTime < this.ctx.currentTime + 0.18) {
        this.scheduleLobbyNotes(this.ctx, this.lobbyGain, this.lobbyNextNoteTime, this.lobbyStepIndex);
        this.lobbyNextNoteTime += stepDur;
        this.lobbyStepIndex = (this.lobbyStepIndex + 1) % 128;
      }
    };

    scheduleStep();
    this.lobbyTimerId = window.setInterval(scheduleStep, 50);
  }

  private stopLobbyScheduler(): void {
    if (this.lobbyTimerId !== null) {
      clearInterval(this.lobbyTimerId);
      this.lobbyTimerId = null;
    }
  }

  private startGameplayScheduler(): void {
    if (this.gameplayTimerId !== null) return;
    const ctx = this.ctx;
    if (!ctx) return;
    this.ensureGameplayGain(ctx);
    if (this.gameplayGain) {
      const targetGain = 0.105 + this.gameplayTension * 0.035;
      this.gameplayGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.22);
    }
    this.gameplayNextNoteTime = ctx.currentTime + 0.04;

    const scheduleStep = () => {
      if (!this.gameplayMusicActive || !this.ctx || !this.gameplayGain) return;
      if (this.ctx.state !== 'running') return;

      // Driving 138 BPM -> 146 BPM 16th-note combat grid
      const tension = this.gameplayTension;
      const stepDur = 0.1087 - tension * 0.006;
      while (this.gameplayNextNoteTime < this.ctx.currentTime + 0.18) {
        if (!this.paused) {
          this.scheduleBattleNotes(
            this.ctx,
            this.gameplayGain,
            this.gameplayNextNoteTime,
            this.gameplayStepIndex,
            tension,
          );
        }
        this.gameplayNextNoteTime += stepDur;
        this.gameplayStepIndex = (this.gameplayStepIndex + 1) % 128;
      }
    };

    scheduleStep();
    this.gameplayTimerId = window.setInterval(scheduleStep, 50);
  }

  private stopGameplayScheduler(): void {
    if (this.gameplayTimerId !== null) {
      clearInterval(this.gameplayTimerId);
      this.gameplayTimerId = null;
    }
  }

  private playSynthKick(ctx: AudioContext, dest: AudioNode, time: number, level = 0.34): void {
    const kick = ctx.createOscillator();
    const kGain = ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(158, time);
    kick.frequency.exponentialRampToValueAtTime(42, time + 0.09);
    kGain.gain.setValueAtTime(level, time);
    kGain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);
    kick.connect(kGain).connect(dest);
    kick.start(time);
    kick.stop(time + 0.17);
  }

  private playSynthSnare(ctx: AudioContext, dest: AudioNode, time: number, level = 0.18): void {
    if (this.noiseBuffer) {
      const sn = ctx.createBufferSource();
      sn.buffer = this.noiseBuffer;
      const snFilt = ctx.createBiquadFilter();
      snFilt.type = 'bandpass';
      snFilt.frequency.setValueAtTime(2200, time);
      snFilt.Q.value = 0.85;
      const snGain = ctx.createGain();
      snGain.gain.setValueAtTime(level, time);
      snGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
      sn.connect(snFilt).connect(snGain).connect(dest);
      sn.start(time);
      sn.stop(time + 0.13);
    }
    const snBody = ctx.createOscillator();
    const sbG = ctx.createGain();
    snBody.type = 'triangle';
    snBody.frequency.setValueAtTime(215, time);
    snBody.frequency.exponentialRampToValueAtTime(108, time + 0.07);
    sbG.gain.setValueAtTime(level * 0.72, time);
    sbG.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    snBody.connect(sbG).connect(dest);
    snBody.start(time);
    snBody.stop(time + 0.09);
  }

  private playHiHat(ctx: AudioContext, dest: AudioNode, time: number, open: boolean, level = 0.036): void {
    if (!this.noiseBuffer) return;
    const hat = ctx.createBufferSource();
    hat.buffer = this.noiseBuffer;
    const hFilt = ctx.createBiquadFilter();
    hFilt.type = 'highpass';
    hFilt.frequency.setValueAtTime(7600, time);
    const hGain = ctx.createGain();
    hGain.gain.setValueAtTime(open ? level * 1.65 : level, time);
    hGain.gain.exponentialRampToValueAtTime(0.0008, time + (open ? 0.085 : 0.032));
    hat.connect(hFilt).connect(hGain).connect(dest);
    hat.start(time);
    hat.stop(time + (open ? 0.095 : 0.038));
  }

  private scheduleLobbyNotes(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    stepIdx: number,
  ): void {
    try {
      const barIdx = Math.floor(stepIdx / 16) % LOBBY_CHORDS.length;
      const rootFreq = LOBBY_ROOTS[barIdx];
      const chord = LOBBY_CHORDS[barIdx];
      const leadRiff = LOBBY_LEAD_RIFFS[barIdx];
      const inBar = stepIdx % 16;

      // 1. Driving stadium kick + turnaround fill on bar 4 / 8
      if (inBar % 4 === 0 || (barIdx % 4 === 3 && inBar === 14)) {
        this.playSynthKick(ctx, dest, time, inBar % 4 === 0 ? 0.34 : 0.24);
      }

      // 2. Layered clap/snare on 2 & 4 + rhythmic fill on bar end
      if (inBar === 4 || inBar === 12 || (barIdx % 4 === 3 && (inBar === 13 || inBar === 15))) {
        this.playSynthSnare(ctx, dest, time, inBar === 4 || inBar === 12 ? 0.17 : 0.11);
      }

      // 3. Tight 16th-note shaker & open-hat offbeat groove
      if (inBar % 2 === 0 || inBar === 15) {
        this.playHiHat(ctx, dest, time, inBar % 4 === 2, 0.032);
      }

      // 4. Fat sidechain-bounce octave synth bass (sub + saw)
      const bassStep = inBar % 4;
      if (bassStep === 0 || bassStep === 2 || bassStep === 3) {
        const octMult = bassStep === 2 ? 2.0 : 1.0;
        const bassOsc = ctx.createOscillator();
        const subOsc = ctx.createOscillator();
        const bassFilt = ctx.createBiquadFilter();
        const bassGain = ctx.createGain();
        bassOsc.type = 'sawtooth';
        subOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(rootFreq * octMult, time);
        subOsc.frequency.setValueAtTime(rootFreq, time);
        bassFilt.type = 'lowpass';
        bassFilt.frequency.setValueAtTime(bassStep === 0 ? 640 : 1020, time);
        bassFilt.frequency.exponentialRampToValueAtTime(210, time + 0.095);
        bassGain.gain.setValueAtTime(0.001, time);
        bassGain.gain.linearRampToValueAtTime(bassStep === 2 ? 0.15 : 0.125, time + 0.01);
        bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.108);
        bassOsc.connect(bassFilt);
        subOsc.connect(bassFilt);
        bassFilt.connect(bassGain).connect(dest);
        bassOsc.start(time);
        subOsc.start(time);
        bassOsc.stop(time + 0.115);
        subOsc.stop(time + 0.115);
      }

      // 5. Shimmering 16th arpeggio sparkling over chord voicings
      const arpFreq = chord[inBar % chord.length] * (inBar % 8 >= 4 ? 2 : 1);
      const arpOsc = ctx.createOscillator();
      const arpFilt = ctx.createBiquadFilter();
      const arpGain = ctx.createGain();
      arpOsc.type = 'triangle';
      arpOsc.frequency.setValueAtTime(arpFreq, time);
      arpFilt.type = 'bandpass';
      arpFilt.frequency.setValueAtTime(2200, time);
      arpFilt.Q.value = 1.0;
      arpGain.gain.setValueAtTime(0.001, time);
      arpGain.gain.linearRampToValueAtTime(inBar % 2 === 0 ? 0.042 : 0.028, time + 0.008);
      arpGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.095);
      arpOsc.connect(arpFilt).connect(arpGain).connect(dest);
      arpOsc.start(time);
      arpOsc.stop(time + 0.102);

      // 6. Anthemic brassy synth chord stabs
      if (inBar === 0 || inBar === 3 || inBar === 6 || inBar === 10 || inBar === 14) {
        for (let c = 0; c < 3; c++) {
          const stab = ctx.createOscillator();
          const stabFilt = ctx.createBiquadFilter();
          const stabGain = ctx.createGain();
          stab.type = 'sawtooth';
          stab.frequency.setValueAtTime(chord[c] * (c === 2 ? 1.003 : 1), time);
          stabFilt.type = 'lowpass';
          stabFilt.frequency.setValueAtTime(2500, time);
          stabFilt.frequency.exponentialRampToValueAtTime(680, time + 0.15);
          stabGain.gain.setValueAtTime(0.001, time);
          stabGain.gain.linearRampToValueAtTime(inBar === 0 ? 0.044 : 0.032, time + 0.012);
          stabGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.17);
          stab.connect(stabFilt).connect(stabGain).connect(dest);
          stab.start(time);
          stab.stop(time + 0.18);
        }
      }

      // 7. Heroic detuned dual-oscillator stadium synth lead
      const leadFreq = leadRiff[inBar];
      if (leadFreq > 0) {
        const leadA = ctx.createOscillator();
        const leadB = ctx.createOscillator();
        const leadFilt = ctx.createBiquadFilter();
        const leadGain = ctx.createGain();
        leadA.type = 'sawtooth';
        leadB.type = 'triangle';
        leadA.frequency.setValueAtTime(leadFreq, time);
        leadB.frequency.setValueAtTime(leadFreq * 1.005, time);
        leadFilt.type = 'lowpass';
        leadFilt.frequency.setValueAtTime(3600, time);
        leadFilt.frequency.exponentialRampToValueAtTime(1450, time + 0.18);
        leadGain.gain.setValueAtTime(0.001, time);
        leadGain.gain.linearRampToValueAtTime(0.072, time + 0.012);
        leadGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.21);
        leadA.connect(leadFilt);
        leadB.connect(leadFilt);
        leadFilt.connect(leadGain).connect(dest);
        leadA.start(time);
        leadB.start(time);
        leadA.stop(time + 0.22);
        leadB.stop(time + 0.22);
      }
    } catch {
      // Ignore scheduling errors
    }
  }

  private scheduleBattleNotes(
    ctx: AudioContext,
    dest: AudioNode,
    time: number,
    stepIdx: number,
    tension: number,
  ): void {
    try {
      const barIdx = Math.floor(stepIdx / 16) % BATTLE_CHORDS.length;
      const rootFreq = BATTLE_ROOTS[barIdx];
      const chord = BATTLE_CHORDS[barIdx];
      const leadRiff = BATTLE_LEAD_RIFFS[barIdx];
      const inBar = stepIdx % 16;

      // 1. High-energy driving kick groove (4-on-floor + syncopated combat double kicks)
      const isKick =
        inBar === 0 ||
        inBar === 4 ||
        inBar === 8 ||
        inBar === 10 ||
        inBar === 12 ||
        (barIdx % 2 === 1 && inBar === 6);
      if (isKick) {
        this.playSynthKick(ctx, dest, time, inBar % 4 === 0 ? 0.36 : 0.25);
      }

      // 2. Crisp snappy snare on 2 & 4 + turnaround fills
      const isSnareFill = barIdx % 4 === 3 && inBar >= 13;
      if (inBar === 4 || inBar === 12 || isSnareFill) {
        this.playSynthSnare(ctx, dest, time, isSnareFill ? 0.13 : 0.2);
      }

      // 3. Relentless 16th-note combat hi-hats
      this.playHiHat(ctx, dest, time, inBar % 4 === 2, inBar % 2 === 0 ? 0.036 : 0.02);

      // 4. Driving 16th-note octave synth bassline
      const bassStep = inBar % 4;
      const playBass = bassStep === 0 || bassStep === 1 || bassStep === 2 || bassStep === 3;
      if (playBass) {
        const octMult = bassStep === 2 ? 2.0 : bassStep === 3 ? 1.5 : 1.0;
        const bassOsc = ctx.createOscillator();
        const subOsc = ctx.createOscillator();
        const bassFilt = ctx.createBiquadFilter();
        const bassGain = ctx.createGain();
        bassOsc.type = 'sawtooth';
        subOsc.type = 'sine';
        bassOsc.frequency.setValueAtTime(rootFreq * octMult, time);
        subOsc.frequency.setValueAtTime(rootFreq, time);
        bassFilt.type = 'lowpass';
        bassFilt.frequency.setValueAtTime(680 + tension * 520, time);
        bassFilt.frequency.exponentialRampToValueAtTime(185, time + 0.088);
        const bassAmp = bassStep === 0 ? 0.145 : bassStep === 2 ? 0.125 : 0.09;
        bassGain.gain.setValueAtTime(0.001, time);
        bassGain.gain.linearRampToValueAtTime(bassAmp, time + 0.008);
        bassGain.gain.exponentialRampToValueAtTime(0.001, time + 0.095);
        bassOsc.connect(bassFilt);
        subOsc.connect(bassFilt);
        bassFilt.connect(bassGain).connect(dest);
        bassOsc.start(time);
        subOsc.start(time);
        bassOsc.stop(time + 0.1);
        subOsc.stop(time + 0.1);
      }

      // 5. Punchy power-chord synth stabs on energetic syncopations
      if (inBar === 0 || inBar === 3 || inBar === 6 || inBar === 11 || inBar === 14) {
        for (let c = 0; c < 3; c++) {
          const stab = ctx.createOscillator();
          const stabFilt = ctx.createBiquadFilter();
          const stabGain = ctx.createGain();
          stab.type = 'sawtooth';
          stab.frequency.setValueAtTime(chord[c] * (c === 1 ? 1.002 : 1), time);
          stabFilt.type = 'lowpass';
          stabFilt.frequency.setValueAtTime(2200 + tension * 900, time);
          stabFilt.frequency.exponentialRampToValueAtTime(520, time + 0.13);
          stabGain.gain.setValueAtTime(0.001, time);
          stabGain.gain.linearRampToValueAtTime(0.042, time + 0.01);
          stabGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.15);
          stab.connect(stabFilt).connect(stabGain).connect(dest);
          stab.start(time);
          stab.stop(time + 0.16);
        }
      }

      // 6. Rapid heroic combat arpeggio + lead riff (adds octave boost in final stretch)
      const leadFreq = leadRiff[inBar];
      if (leadFreq > 0) {
        const leadA = ctx.createOscillator();
        const leadB = ctx.createOscillator();
        const leadFilt = ctx.createBiquadFilter();
        const leadGain = ctx.createGain();
        leadA.type = 'sawtooth';
        leadB.type = 'square';
        leadA.frequency.setValueAtTime(leadFreq, time);
        leadB.frequency.setValueAtTime(
          tension > 0.65 ? leadFreq * 2.002 : leadFreq * 1.004,
          time,
        );
        leadFilt.type = 'lowpass';
        leadFilt.frequency.setValueAtTime(3400 + tension * 900, time);
        leadFilt.frequency.exponentialRampToValueAtTime(1250, time + 0.16);
        leadGain.gain.setValueAtTime(0.001, time);
        leadGain.gain.linearRampToValueAtTime(0.068 + tension * 0.018, time + 0.01);
        leadGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.18);
        leadA.connect(leadFilt);
        leadB.connect(leadFilt);
        leadFilt.connect(leadGain).connect(dest);
        leadA.start(time);
        leadB.start(time);
        leadA.stop(time + 0.19);
        leadB.stop(time + 0.19);
      } else if (inBar % 2 === 1) {
        const arpNote = chord[(inBar + barIdx) % chord.length] * 2;
        const arp = ctx.createOscillator();
        const arpFilt = ctx.createBiquadFilter();
        const arpGain = ctx.createGain();
        arp.type = 'triangle';
        arp.frequency.setValueAtTime(arpNote, time);
        arpFilt.type = 'bandpass';
        arpFilt.frequency.setValueAtTime(2100, time);
        arpGain.gain.setValueAtTime(0.001, time);
        arpGain.gain.linearRampToValueAtTime(0.032, time + 0.008);
        arpGain.gain.exponentialRampToValueAtTime(0.0008, time + 0.085);
        arp.connect(arpFilt).connect(arpGain).connect(dest);
        arp.start(time);
        arp.stop(time + 0.095);
      }
    } catch {
      // Ignore scheduling errors
    }
  }

  setElementalSpray(role: ElementalRole | null): void {
    const prev = this.activeSprayRole;
    if (prev === role) return;
    this.activeSprayRole = role;

    const ctx = role ? this.ensureContext() : this.ctx;
    if (!ctx) return;
    if (role) {
      this.ensureSprayNodes(ctx);
      if (prev === null) {
        this.playSprayTriggerBurst(ctx, role);
      }
    } else if (prev !== null) {
      this.playSprayReleaseTail(ctx, prev);
    }

    const t = ctx.currentTime;
    if (this.waterSprayGain) {
      this.waterSprayGain.gain.setTargetAtTime(role === 'hero' ? 0.25 : 0, t, 0.03);
    }
    if (this.fireSprayGain) {
      this.fireSprayGain.gain.setTargetAtTime(role === 'villain' ? 0.27 : 0, t, 0.03);
    }
  }

  private playSprayTriggerBurst(ctx: AudioContext, role: ElementalRole): void {
    try {
      const t = ctx.currentTime;
      const out = this.getSfxOut(ctx);
      if (role === 'hero') {
        // Pressurized hydro valve snap + water surge sweep
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(310, t);
        osc.frequency.exponentialRampToValueAtTime(640, t + 0.07);
        g.gain.setValueAtTime(0.09, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(g).connect(out);
        osc.start(t);
        osc.stop(t + 0.09);
      } else if (this.noiseBuffer) {
        // Igniter spark click + whoosh burst
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(950, t);
        filt.frequency.exponentialRampToValueAtTime(340, t + 0.14);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        src.connect(filt).connect(g).connect(out);
        src.start(t);
        src.stop(t + 0.16);
      }
    } catch {
      // Ignore
    }
  }

  private playSprayReleaseTail(ctx: AudioContext, role: ElementalRole): void {
    try {
      const t = ctx.currentTime;
      const out = this.getSfxOut(ctx);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(role === 'hero' ? 480 : 210, t);
      osc.frequency.exponentialRampToValueAtTime(role === 'hero' ? 190 : 80, t + 0.06);
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.075);
    } catch {
      // Ignore
    }
  }

  updateFootsteps(
    dt: number,
    speed: number,
    baseSpeed: number,
    isSprinting: boolean,
    isMeadow: boolean,
  ): void {
    if (this.paused || speed < 0.75) {
      this.strideAccum = 0.65;
      return;
    }
    const strideLen = isSprinting ? 2.15 : 2.35;
    this.strideAccum += (speed / Math.max(1, baseSpeed)) * dt * (baseSpeed / strideLen);
    if (this.strideAccum >= 1) {
      this.strideAccum -= 1;
      this.playFootstep(isSprinting, isMeadow);
    }
  }

  private playFootstep(isSprinting: boolean, isMeadow: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.stepParity = (this.stepParity + 1) % 2;
    const pitchJitter = (this.stepParity === 0 ? 1.05 : 0.94) * (0.95 + Math.random() * 0.1);

    try {
      const out = this.getSfxOut(ctx);

      // 1. Heel-strike low impact thump
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime((isSprinting ? 146 : 114) * pitchJitter, t);
      thud.frequency.exponentialRampToValueAtTime(38, t + 0.068);
      thudGain.gain.setValueAtTime(isSprinting ? 0.16 : 0.105, t);
      thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.078);
      thud.connect(thudGain).connect(out);
      thud.start(t);
      thud.stop(t + 0.085);

      // 2. Surface texture (lush meadow grass brush vs gritty dry desert sand crunch)
      if (this.noiseBuffer) {
        const scuff = ctx.createBufferSource();
        scuff.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = isMeadow ? 'bandpass' : 'highpass';
        filter.frequency.setValueAtTime((isMeadow ? 960 : 1950) * pitchJitter, t);
        filter.Q.setValueAtTime(isMeadow ? 1.25 : 0.75, t);
        const sGain = ctx.createGain();
        sGain.gain.setValueAtTime(isSprinting ? 0.09 : 0.058, t);
        sGain.gain.exponentialRampToValueAtTime(0.001, t + (isMeadow ? 0.085 : 0.095));
        scuff.connect(filter).connect(sGain).connect(out);
        scuff.start(t, Math.random() * 0.3);
        scuff.stop(t + 0.11);

        // 3. Subtle toe-off gear rustle 35ms later
        const rustle = ctx.createBufferSource();
        rustle.buffer = this.noiseBuffer;
        const rFilter = ctx.createBiquadFilter();
        rFilter.type = 'bandpass';
        rFilter.frequency.setValueAtTime(2400 * pitchJitter, t + 0.032);
        rFilter.Q.value = 2.0;
        const rGain = ctx.createGain();
        rGain.gain.setValueAtTime(isSprinting ? 0.032 : 0.018, t + 0.032);
        rGain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
        rustle.connect(rFilter).connect(rGain).connect(out);
        rustle.start(t + 0.032, Math.random() * 0.25);
        rustle.stop(t + 0.095);
      }
    } catch {
      // Ignore
    }
  }

  playEmptyClickHiss(role: ElementalRole): void {
    const nowMs = performance.now();
    if (nowMs - this.lastEmptyMs < 250) return;
    this.lastEmptyMs = nowMs;

    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    try {
      const out = this.getSfxOut(ctx);

      // 1. Metallic trigger latch click
      const click = ctx.createOscillator();
      const cGain = ctx.createGain();
      click.type = 'square';
      click.frequency.setValueAtTime(role === 'hero' ? 1280 : 980, t);
      click.frequency.exponentialRampToValueAtTime(220, t + 0.025);
      cGain.gain.setValueAtTime(0.055, t);
      cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
      click.connect(cGain).connect(out);
      click.start(t);
      click.stop(t + 0.035);

      // 2. Hollow tank thud
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(role === 'hero' ? 390 : 290, t);
      osc.frequency.exponentialRampToValueAtTime(105, t + 0.055);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.065);

      // 3. Dry pressurized valve hiss
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(role === 'hero' ? 3200 : 2100, t);
        filter.Q.setValueAtTime(1.8, t);
        const nGain = ctx.createGain();
        nGain.gain.setValueAtTime(0.065, t);
        nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        src.connect(filter).connect(nGain).connect(out);
        src.start(t);
        src.stop(t + 0.17);
      }
    } catch {
      // Ignore
    }
  }

  playOrbPickup(role: ElementalRole): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    try {
      const out = this.getSfxOut(ctx);
      // Warm sub confirmation thump
      const sub = ctx.createOscillator();
      const subG = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(140, t);
      sub.frequency.exponentialRampToValueAtTime(72, t + 0.16);
      subG.gain.setValueAtTime(0.14, t);
      subG.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      sub.connect(subG).connect(out);
      sub.start(t);
      sub.stop(t + 0.19);

      // Harmonic recharge arpeggio + fifth shimmer
      const notes =
        role === 'hero'
          ? [523.25, 659.25, 783.99, 1046.5]
          : [293.66, 392.0, 440.0, 587.33];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = role === 'hero' ? 'sine' : 'triangle';
        const st = t + idx * 0.048;
        osc.frequency.setValueAtTime(freq, st);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.06, st + 0.18);
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(role === 'hero' ? 3200 : 1900, st);
        gain.gain.setValueAtTime(0.001, st);
        gain.gain.linearRampToValueAtTime(role === 'hero' ? 0.1 : 0.085, st + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.24);
        osc.connect(filt).connect(gain).connect(out);
        osc.start(st);
        osc.stop(st + 0.25);
      });
    } catch {
      // Ignore
    }
  }

  playGrenadePickup(role: ElementalRole): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    try {
      const out = this.getSfxOut(ctx);
      // Crisp tactical pin-latch + rising elemental harmonic chime
      const notes = role === 'hero' ? [440, 659.25, 880] : [329.63, 493.88, 659.25];
      notes.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        const st = t + idx * 0.04;
        osc.frequency.setValueAtTime(f, st);
        gain.gain.setValueAtTime(0.09, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.14);
        osc.connect(gain).connect(out);
        osc.start(st);
        osc.stop(st + 0.15);
      });
    } catch {
      // Ignore
    }
  }

  playGrenadeThrow(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    try {
      const out = this.getSfxOut(ctx);
      // Airy arm swing whoosh + release snap
      if (this.noiseBuffer) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filt = ctx.createBiquadFilter();
        filt.type = 'bandpass';
        filt.frequency.setValueAtTime(420, t);
        filt.frequency.exponentialRampToValueAtTime(1650, t + 0.11);
        filt.Q.value = 1.4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        g.gain.linearRampToValueAtTime(0.11, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        src.connect(filt).connect(g).connect(out);
        src.start(t);
        src.stop(t + 0.16);
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(140, t + 0.13);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.15);
    } catch {
      // Ignore
    }
  }

  playGrenadeExplosion(role: ElementalRole): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;

    try {
      const out = this.getSfxOut(ctx);
      // 1. Heavy shockwave sub-drop
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(role === 'hero' ? 155 : 125, t);
      sub.frequency.exponentialRampToValueAtTime(28, t + 0.48);
      subGain.gain.setValueAtTime(0.32, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
      sub.connect(subGain).connect(out);
      sub.start(t);
      sub.stop(t + 0.54);

      // 2. Sharp initial crack + hydro splash / fireball tail
      if (this.noiseBuffer) {
        const crack = ctx.createBufferSource();
        crack.buffer = this.noiseBuffer;
        const cFilt = ctx.createBiquadFilter();
        cFilt.type = 'bandpass';
        cFilt.frequency.setValueAtTime(role === 'hero' ? 2400 : 1400, t);
        cFilt.Q.value = 0.8;
        const cGain = ctx.createGain();
        cGain.gain.setValueAtTime(0.24, t);
        cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        crack.connect(cFilt).connect(cGain).connect(out);
        crack.start(t);
        crack.stop(t + 0.16);

        const tail = ctx.createBufferSource();
        tail.buffer = this.noiseBuffer;
        const tFilt = ctx.createBiquadFilter();
        tFilt.type = 'lowpass';
        tFilt.frequency.setValueAtTime(role === 'hero' ? 3800 : 2100, t);
        tFilt.frequency.exponentialRampToValueAtTime(220, t + 0.62);
        const tGain = ctx.createGain();
        tGain.gain.setValueAtTime(0.22, t);
        tGain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
        tail.connect(tFilt).connect(tGain).connect(out);
        tail.start(t, 0.04);
        tail.stop(t + 0.68);
      }

      // 3. Hydro bubbly cascade or fire resonant boom
      const tailTone = ctx.createOscillator();
      const tailGain = ctx.createGain();
      tailTone.type = role === 'hero' ? 'sine' : 'sawtooth';
      tailTone.frequency.setValueAtTime(role === 'hero' ? 420 : 180, t + 0.03);
      tailTone.frequency.exponentialRampToValueAtTime(role === 'hero' ? 160 : 52, t + 0.36);
      const tFilt = ctx.createBiquadFilter();
      tFilt.type = 'lowpass';
      tFilt.frequency.value = role === 'hero' ? 1200 : 420;
      tailGain.gain.setValueAtTime(0.09, t + 0.03);
      tailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      tailTone.connect(tFilt).connect(tailGain).connect(out);
      tailTone.start(t + 0.03);
      tailTone.stop(t + 0.4);
    } catch {
      // Ignore
    }
  }

  playDizzyPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      const out = this.getSfxOut(ctx);
      [587.33, 739.99, 880, 1174.66].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const st = t + idx * 0.04;
        osc.frequency.setValueAtTime(freq, st);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.08, st + 0.14);
        gain.gain.setValueAtTime(0.085, st);
        gain.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
        osc.connect(gain).connect(out);
        osc.start(st);
        osc.stop(st + 0.19);
      });
    } catch {
      // Ignore
    }
  }

  playDizzyImpact(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      const out = this.getSfxOut(ctx);

      // 1. Pop shock transient
      const pop = ctx.createOscillator();
      const popG = ctx.createGain();
      pop.type = 'sine';
      pop.frequency.setValueAtTime(240, t);
      pop.frequency.exponentialRampToValueAtTime(55, t + 0.16);
      popG.gain.setValueAtTime(0.2, t);
      popG.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      pop.connect(popG).connect(out);
      pop.start(t);
      pop.stop(t + 0.19);

      // 2. Twin detuned warbling dizzy star chimes
      for (const baseFreq of [698.46, 880]) {
        const carrier = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const gain = ctx.createGain();
        carrier.type = 'triangle';
        carrier.frequency.setValueAtTime(baseFreq, t);
        carrier.frequency.exponentialRampToValueAtTime(baseFreq * 0.52, t + 0.52);
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(19, t);
        lfoGain.gain.setValueAtTime(68, t);
        lfo.connect(lfoGain).connect(carrier.frequency);
        gain.gain.setValueAtTime(0.11, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.56);
        carrier.connect(gain).connect(out);
        carrier.start(t);
        lfo.start(t);
        carrier.stop(t + 0.58);
        lfo.stop(t + 0.58);
      }
    } catch {
      // Ignore
    }
  }

  playUiClick(): void {
    const ctx = this.ensureContext(true);
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      const out = this.getSfxOut(ctx);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(680, t);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.04);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(t + 0.05);
    } catch {
      // Ignore
    }
  }

  playCountdownTick(step: 3 | 2 | 1 | 0): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      const out = this.getSfxOut(ctx);

      if (step > 0) {
        // AAA Cinematic Arena Countdown (3 -> 2 -> 1):
        // 1. Sub-bass impact slam
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(step === 1 ? 112 : 96, t);
        sub.frequency.exponentialRampToValueAtTime(32, t + 0.32);
        subGain.gain.setValueAtTime(0.001, t);
        subGain.gain.linearRampToValueAtTime(0.32, t + 0.008);
        subGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.36);
        sub.connect(subGain).connect(out);
        sub.start(t);
        sub.stop(t + 0.38);

        // 2. Crisp tactical telemetry lock double-click + highpass air snap
        if (this.noiseBuffer) {
          const snap = ctx.createBufferSource();
          snap.buffer = this.noiseBuffer;
          const snapFilt = ctx.createBiquadFilter();
          snapFilt.type = 'highpass';
          snapFilt.frequency.setValueAtTime(4200, t);
          const snapGain = ctx.createGain();
          snapGain.gain.setValueAtTime(0.11, t);
          snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          snap.connect(snapFilt).connect(snapGain).connect(out);
          snap.start(t);
          snap.stop(t + 0.07);
        }

        [0, 0.038].forEach((offset, idx) => {
          const ping = ctx.createOscillator();
          const pGain = ctx.createGain();
          ping.type = 'sine';
          ping.frequency.setValueAtTime(idx === 0 ? 1760 : 2637.02, t + offset);
          pGain.gain.setValueAtTime(idx === 0 ? 0.08 : 0.045, t + offset);
          pGain.gain.exponentialRampToValueAtTime(0.0008, t + offset + 0.085);
          ping.connect(pGain).connect(out);
          ping.start(t + offset);
          ping.stop(t + offset + 0.095);
        });

        // 3. Harmonic stadium power-fifth synth stack + stereo echo tail
        const root = step === 3 ? 293.66 : step === 2 ? 329.63 : 440.0; // D4 -> E4 -> A4
        const chordFreqs = [root, root * 1.498, root * 2.0];
        [
          { delay: 0, gainScale: 1.0, filterTop: 4800, dur: 0.44 },
          { delay: 0.145, gainScale: 0.34, filterTop: 2600, dur: 0.36 },
          { delay: 0.28, gainScale: 0.14, filterTop: 1800, dur: 0.32 },
        ].forEach((tap) => {
          const start = t + tap.delay;
          chordFreqs.forEach((freq, idx) => {
            const oscA = ctx.createOscillator();
            const oscB = ctx.createOscillator();
            const filt = ctx.createBiquadFilter();
            const g = ctx.createGain();
            oscA.type = idx === 0 ? 'sawtooth' : 'triangle';
            oscB.type = 'sawtooth';
            oscA.frequency.setValueAtTime(freq, start);
            oscB.frequency.setValueAtTime(freq * 1.0045, start);
            filt.type = 'lowpass';
            filt.Q.value = 1.6;
            filt.frequency.setValueAtTime(tap.filterTop, start);
            filt.frequency.exponentialRampToValueAtTime(740, start + tap.dur);
            const amp = (idx === 0 ? 0.078 : 0.052) * tap.gainScale;
            g.gain.setValueAtTime(0.0008, start);
            g.gain.linearRampToValueAtTime(amp, start + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0006, start + tap.dur);
            oscA.connect(filt);
            oscB.connect(filt);
            filt.connect(g).connect(out);
            oscA.start(start);
            oscB.start(start);
            oscA.stop(start + tap.dur + 0.02);
            oscB.stop(start + tap.dur + 0.02);
          });
        });

        // 4. Pre-GO tension sweep riser on count "1"
        if (step === 1 && this.longNoiseBuffer) {
          const riser = ctx.createBufferSource();
          riser.buffer = this.longNoiseBuffer;
          const rFilt = ctx.createBiquadFilter();
          rFilt.type = 'bandpass';
          rFilt.Q.value = 2.4;
          rFilt.frequency.setValueAtTime(380, t + 0.16);
          rFilt.frequency.exponentialRampToValueAtTime(3400, t + 0.94);
          const rGain = ctx.createGain();
          rGain.gain.setValueAtTime(0.001, t + 0.16);
          rGain.gain.linearRampToValueAtTime(0.11, t + 0.88);
          rGain.gain.exponentialRampToValueAtTime(0.001, t + 0.98);
          riser.connect(rFilt).connect(rGain).connect(out);
          riser.start(t + 0.16);
          riser.stop(t + 1.0);
        }
      } else {
        // AAA "GO!" Arena Drop Fanfare:
        // 1. Massive sub-bass boom
        const dropSub = ctx.createOscillator();
        const dropGain = ctx.createGain();
        dropSub.type = 'sine';
        dropSub.frequency.setValueAtTime(142, t);
        dropSub.frequency.exponentialRampToValueAtTime(33, t + 0.42);
        dropGain.gain.setValueAtTime(0.001, t);
        dropGain.gain.linearRampToValueAtTime(0.38, t + 0.008);
        dropGain.gain.exponentialRampToValueAtTime(0.0008, t + 0.48);
        dropSub.connect(dropGain).connect(out);
        dropSub.start(t);
        dropSub.stop(t + 0.5);

        // 2. Explosive cinematic air-whoosh impact burst
        if (this.noiseBuffer) {
          const burst = ctx.createBufferSource();
          burst.buffer = this.noiseBuffer;
          const bFilt = ctx.createBiquadFilter();
          bFilt.type = 'bandpass';
          bFilt.Q.value = 0.85;
          bFilt.frequency.setValueAtTime(2200, t);
          bFilt.frequency.exponentialRampToValueAtTime(420, t + 0.36);
          const bGain = ctx.createGain();
          bGain.gain.setValueAtTime(0.18, t);
          bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
          burst.connect(bFilt).connect(bGain).connect(out);
          burst.start(t);
          burst.stop(t + 0.4);
        }

        // 3. Full D-Major stadium brass/synth fanfare chord + arena echo tail
        const fanfareChord = [293.66, 440.0, 587.33, 739.99, 880.0];
        [
          { delay: 0, gainScale: 1.0, cutoff: 5600, dur: 0.72 },
          { delay: 0.18, gainScale: 0.3, cutoff: 2600, dur: 0.52 },
        ].forEach((tap) => {
          const start = t + tap.delay;
          fanfareChord.forEach((freq, idx) => {
            const oscA = ctx.createOscillator();
            const oscB = ctx.createOscillator();
            const filt = ctx.createBiquadFilter();
            const g = ctx.createGain();
            oscA.type = idx % 2 === 0 ? 'sawtooth' : 'square';
            oscB.type = 'sawtooth';
            oscA.frequency.setValueAtTime(freq, start);
            oscB.frequency.setValueAtTime(freq * 1.0055, start);
            filt.type = 'lowpass';
            filt.Q.value = 1.4;
            filt.frequency.setValueAtTime(tap.cutoff, start);
            filt.frequency.exponentialRampToValueAtTime(1450, start + tap.dur);
            const amp = (idx < 2 ? 0.056 : 0.044) * tap.gainScale;
            g.gain.setValueAtTime(0.001, start);
            g.gain.linearRampToValueAtTime(amp, start + 0.014);
            g.gain.exponentialRampToValueAtTime(0.0006, start + tap.dur);
            oscA.connect(filt);
            oscB.connect(filt);
            filt.connect(g).connect(out);
            oscA.start(start);
            oscB.start(start);
            oscA.stop(start + tap.dur + 0.02);
            oscB.stop(start + tap.dur + 0.02);
          });
        });

        // 4. Sparkling ascending victory-charge arpeggio shimmer (D5 -> F#5 -> A5 -> D6)
        [587.33, 739.99, 880.0, 1174.66].forEach((freq, idx) => {
          const st = t + idx * 0.045;
          const arp = ctx.createOscillator();
          const aG = ctx.createGain();
          arp.type = 'triangle';
          arp.frequency.setValueAtTime(freq, st);
          aG.gain.setValueAtTime(0.001, st);
          aG.gain.linearRampToValueAtTime(0.075, st + 0.01);
          aG.gain.exponentialRampToValueAtTime(0.0008, st + 0.28);
          arp.connect(aG).connect(out);
          arp.start(st);
          arp.stop(st + 0.3);
        });
      }
    } catch {
      // Ignore
    }
  }

  playRoundEndStinger(wonRound: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      const out = this.getSfxOut(ctx);
      const notes = wonRound ? [523.25, 659.25, 783.99] : [440.0, 392.0, 329.63];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = wonRound ? 'triangle' : 'sawtooth';
        const st = t + idx * 0.08;
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.001, st);
        g.gain.linearRampToValueAtTime(0.11, st + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.34);
        osc.connect(g).connect(out);
        osc.start(st);
        osc.stop(st + 0.36);
      });
    } catch {
      // Ignore
    }
  }

  playMatchEndFanfare(playerWon: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    try {
      const out = this.getSfxOut(ctx);
      const notes = playerWon
        ? [392.0, 493.88, 587.33, 783.99]
        : [392.0, 349.23, 311.13, 261.63];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const g = ctx.createGain();
        osc.type = playerWon ? 'triangle' : 'sawtooth';
        const st = t + idx * 0.11;
        osc.frequency.setValueAtTime(freq, st);
        filt.type = 'lowpass';
        filt.frequency.setValueAtTime(playerWon ? 2600 : 1100, st);
        g.gain.setValueAtTime(0.001, st);
        g.gain.linearRampToValueAtTime(0.11, st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.48);
        osc.connect(filt).connect(g).connect(out);
        osc.start(st);
        osc.stop(st + 0.5);
      });
    } catch {
      // Ignore
    }
  }

  dispose(): void {
    this.lobbyActive = false;
    this.gameplayMusicActive = false;
    this.activeSprayRole = null;
    this.stopLobbyScheduler();
    this.stopGameplayScheduler();
    for (let i = 0; i < this.loopSources.length; i++) {
      try {
        this.loopSources[i].stop();
      } catch {
        // Ignore already-stopped nodes
      }
    }
    this.loopSources = [];
    this.sprayNodesReady = false;
    this.waterSprayGain = null;
    this.fireSprayGain = null;
    this.lobbyGain = null;
    this.gameplayGain = null;
    this.musicComp = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.masterGain = null;
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.noiseBuffer = null;
    this.longNoiseBuffer = null;
  }
}

export const arenaSound = new ArenaSoundEngine();
