class AudioService {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;

  private initCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private routeNode(osc: OscillatorNode, gain: GainNode, ctx: AudioContext): void {
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {}
    };
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled && this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public close(): void {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }

  public playMove(): void {
    const ctx = this.initCtx();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    this.routeNode(osc, gain, ctx);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playCapture(): void {
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // High attack tap
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(800, now);
    osc1.frequency.exponentialRampToValueAtTime(150, now + 0.12);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    this.routeNode(osc1, gain1, ctx);
    osc1.start(now);
    osc1.stop(now + 0.12);

    // Low wooden body thud
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(160, now);
    osc2.frequency.exponentialRampToValueAtTime(60, now + 0.14);
    gain2.gain.setValueAtTime(0.3, now);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    this.routeNode(osc2, gain2, ctx);
    osc2.start(now);
    osc2.stop(now + 0.14);
  }

  public playExplosion(): void {
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Noise buffer for blast
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(80, now + 0.45);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.onended = () => {
      try {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {}
    };

    noise.start(now);
    noise.stop(now + 0.5);

    // Deep sub-bass boom
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(120, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.4);
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    this.routeNode(sub, subGain, ctx);
    sub.start(now);
    sub.stop(now + 0.4);
  }

  public playCheck(): void {
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    [520, 780].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const time = now + i * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.25, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

      this.routeNode(osc, gain, ctx);

      osc.start(time);
      osc.stop(time + 0.12);
    });
  }

  public playCheckmate(): void {
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const chord = [261.63, 329.63, 392.0, 523.25]; // C major fanfare
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const time = now + idx * 0.06;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);

      this.routeNode(osc, gain, ctx);

      osc.start(time);
      osc.stop(time + 0.6);
    });
  }

  public playTick(): void {
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, now);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    this.routeNode(osc, gain, ctx);

    osc.start(now);
    osc.stop(now + 0.03);
  }
}

export const audioService = new AudioService();
