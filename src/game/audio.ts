export class RaceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc1: OscillatorNode | null = null;
  private engineOsc2: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private skidSource: AudioBufferSourceNode | null = null;
  private skidFilter: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;
  private boostGain: GainNode | null = null;
  private boostFilter: BiquadFilterNode | null = null;
  private initialized = false;
  private muted = false;

  public init(): void {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.38;
      this.masterGain.connect(this.ctx.destination);

      // Engine synthesizer (dual detuned sawtooth + triangle through lowpass)
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;

      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 240;
      this.engineFilter.Q.value = 3.2;

      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.value = 65;

      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'triangle';
      this.engineOsc2.frequency.value = 130.5;

      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.masterGain);

      this.engineOsc1.start();
      this.engineOsc2.start();

      // White noise buffer for tire drift screech + nitro whoosh
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      // Skid channel
      this.skidSource = this.ctx.createBufferSource();
      this.skidSource.buffer = noiseBuffer;
      this.skidSource.loop = true;

      this.skidFilter = this.ctx.createBiquadFilter();
      this.skidFilter.type = 'bandpass';
      this.skidFilter.frequency.value = 1250;
      this.skidFilter.Q.value = 4.5;

      this.skidGain = this.ctx.createGain();
      this.skidGain.gain.value = 0;

      this.skidSource.connect(this.skidFilter);
      this.skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.masterGain);
      this.skidSource.start();

      // Boost channel
      const boostSource = this.ctx.createBufferSource();
      boostSource.buffer = noiseBuffer;
      boostSource.loop = true;

      this.boostFilter = this.ctx.createBiquadFilter();
      this.boostFilter.type = 'bandpass';
      this.boostFilter.frequency.value = 520;
      this.boostFilter.Q.value = 1.4;

      this.boostGain = this.ctx.createGain();
      this.boostGain.gain.value = 0;

      boostSource.connect(this.boostFilter);
      this.boostFilter.connect(this.boostGain);
      this.boostGain.connect(this.masterGain);
      boostSource.start();

      this.initialized = true;
    } catch {
      // Ignore audio errors if blocked
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.38, this.ctx.currentTime, 0.05);
    }
  }

  public update(
    active: boolean,
    rpmRatio: number,
    throttle: boolean,
    isDrifting: boolean,
    isBoosting: boolean,
    speedRatio: number,
  ): void {
    if (!this.initialized || !this.ctx || !this.engineOsc1 || !this.engineOsc2 || !this.engineFilter || !this.engineGain) {
      return;
    }

    const now = this.ctx.currentTime;
    if (!active) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      this.skidGain?.gain.setTargetAtTime(0, now, 0.08);
      this.boostGain?.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    const baseFreq = 52 + rpmRatio * 145 + (isBoosting ? 24 : 0);
    this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.04);
    this.engineOsc2.frequency.setTargetAtTime(baseFreq * 1.99, now, 0.04);
    this.engineFilter.frequency.setTargetAtTime(
      240 + rpmRatio * 900 + (throttle ? 260 : 0),
      now,
      0.05,
    );
    this.engineGain.gain.setTargetAtTime(throttle ? 0.24 : 0.13, now, 0.06);

    if (this.skidGain && this.skidFilter) {
      const targetSkid = isDrifting && speedRatio > 0.2 ? Math.min(0.18, speedRatio * 0.2) : 0;
      this.skidGain.gain.setTargetAtTime(targetSkid, now, 0.05);
      this.skidFilter.frequency.setTargetAtTime(1050 + speedRatio * 550, now, 0.06);
    }

    if (this.boostGain && this.boostFilter) {
      this.boostGain.gain.setTargetAtTime(isBoosting ? 0.22 : 0, now, 0.04);
      this.boostFilter.frequency.setTargetAtTime(420 + speedRatio * 500, now, 0.06);
    }
  }

  public playBeep(high: boolean): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(high ? 880 : 440, now);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (high ? 0.38 : 0.18));
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  public playCollision(intensity: number): void {
    if (!this.initialized || !this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
    const vol = Math.min(0.35, Math.max(0.08, intensity * 0.35));
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public dispose(): void {
    try {
      this.engineOsc1?.stop();
      this.engineOsc2?.stop();
      this.skidSource?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore close errors
    }
    this.initialized = false;
  }
}
