const LOOKAHEAD_SECONDS = 0.15;
const SCHEDULE_EPSILON = 0.0001;
const PLACEHOLDER_AUDIO = /(?:^|\/)silence\.wav(?:[?#].*)?$/i;

export class AudioController {
  readonly usesAudioFile: boolean;
  readonly forcedMuted: boolean;
  private readonly context = new AudioContext();
  private readonly master = this.context.createGain();
  private readonly noiseBuffer: AudioBuffer;
  private readonly audioUrl: string | null;
  private buffer: AudioBuffer | null = null;
  private bufferSource: AudioBufferSourceNode | null = null;
  private readonly scheduledSources = new Set<AudioScheduledSourceNode>();
  private readonly beatDuration: number;
  private readonly stepDuration: number;
  private offset = 0;
  private anchorContextTime = 0;
  private nextStep = 0;
  private volume = 0.7;
  private muted: boolean;
  private initialized = false;
  private seekPendingStart = false;
  private startGeneration = 0;
  private closed = false;
  private readonly ready: Promise<void>;

  constructor(bpm: number, audioPath: string, forceMute = false) {
    if (!Number.isFinite(bpm) || bpm <= 0) throw new Error(`Invalid topic BPM: ${bpm}`);
    this.beatDuration = 60 / bpm;
    this.stepDuration = this.beatDuration / 2;
    this.forcedMuted = forceMute;
    this.muted = forceMute;
    this.usesAudioFile = Boolean(audioPath && !PLACEHOLDER_AUDIO.test(audioPath));
    this.audioUrl = this.usesAudioFile ? audioPath : null;
    this.noiseBuffer = this.createNoiseBuffer();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.context.destination);
    this.ready = this.loadAudioFile();
  }

  get currentTime(): number {
    if (!this.initialized) return this.offset;
    return this.offset + Math.max(0, this.context.currentTime - this.anchorContextTime);
  }

  get contextState(): AudioContextState {
    return this.context.state;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  async prepare(): Promise<void> {
    await this.ready;
  }

  setVolume(value: number): void {
    this.volume = Math.min(1, Math.max(0, value));
    this.updateMasterGain();
  }

  setMuted(value: boolean): void {
    this.muted = this.forcedMuted || value;
    this.updateMasterGain();
  }

  async start(initialTime: number): Promise<boolean> {
    if (this.closed) throw new Error("Audio controller has been closed");
    const generation = ++this.startGeneration;
    const resume = this.context.state === "suspended" ? this.context.resume() : Promise.resolve();
    await Promise.all([resume, this.ready]);
    if (this.closed || generation !== this.startGeneration) return false;
    if (!this.initialized) {
      if (!this.seekPendingStart) this.offset = Math.max(0, initialTime);
      this.anchorContextTime = this.context.currentTime;
      this.nextStep = Math.ceil((this.offset - SCHEDULE_EPSILON) / this.stepDuration);
      this.initialized = true;
      this.seekPendingStart = false;
    }
    if (this.buffer) this.startBufferSource();
    return true;
  }

  pause(at?: number): void {
    if (this.context.state === "closed") return;
    this.startGeneration += 1;
    this.offset = at === undefined ? this.currentTime : Math.max(0, at);
    this.anchorContextTime = this.context.currentTime;
    this.bufferSource?.stop();
    this.bufferSource = null;
    void this.context.suspend();
  }

  seek(time: number): void {
    const nextTime = Math.max(0, time);
    this.offset = nextTime;
    if (!this.initialized) this.seekPendingStart = true;
    this.anchorContextTime = this.context.currentTime;
    this.nextStep = Math.ceil((nextTime - SCHEDULE_EPSILON) / this.stepDuration);
    this.stopScheduledSources();
    if (this.buffer) this.startBufferSource();
  }

  update(): void {
    if (
      !this.initialized
      || this.context.state !== "running"
      || this.buffer
      || this.muted
    ) return;

    const now = this.currentTime;
    const horizon = now + LOOKAHEAD_SECONDS;
    while (this.nextStep * this.stepDuration <= horizon + SCHEDULE_EPSILON) {
      const songTime = this.nextStep * this.stepDuration;
      const contextTime = this.anchorContextTime + songTime - this.offset;
      if (contextTime >= this.context.currentTime - 0.03) this.scheduleStep(this.nextStep, Math.max(contextTime, this.context.currentTime + 0.001));
      this.nextStep += 1;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.startGeneration += 1;
    this.stopScheduledSources();
    this.bufferSource?.stop();
    this.bufferSource = null;
    this.master.disconnect();
    void this.context.close();
  }

  private async loadAudioFile(): Promise<void> {
    if (!this.audioUrl || this.forcedMuted) return;
    const response = await fetch(new URL(this.audioUrl, document.baseURI));
    if (!response.ok) throw new Error(`Could not load audio file "${this.audioUrl}" (${response.status})`);
    this.buffer = await this.context.decodeAudioData(await response.arrayBuffer());
  }

  private updateMasterGain(): void {
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, now, 0.015);
  }

  private createNoiseBuffer(): AudioBuffer {
    const length = Math.ceil(this.context.sampleRate * 0.2);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const samples = buffer.getChannelData(0);
    let seed = 0x4c534f4e;
    for (let index = 0; index < samples.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      samples[index] = (seed / 0x80000000 - 1) * (1 - index / samples.length);
    }
    return buffer;
  }

  private track(source: AudioScheduledSourceNode): void {
    this.scheduledSources.add(source);
    source.addEventListener("ended", () => this.scheduledSources.delete(source), { once: true });
  }

  private stopScheduledSources(): void {
    for (const source of this.scheduledSources) {
      source.stop();
      this.scheduledSources.delete(source);
    }
  }

  private scheduleStep(step: number, at: number): void {
    const stepInBar = step % 8;
    this.scheduleHat(at);
    if (stepInBar === 0 || stepInBar === 4) this.scheduleKick(at);
    if (stepInBar === 2 || stepInBar === 6) this.scheduleSnare(at);
    if (stepInBar === 0) this.scheduleBass(at);
  }

  private scheduleKick(at: number): void {
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(150, at);
    oscillator.frequency.exponentialRampToValueAtTime(42, at + 0.12);
    envelope.gain.setValueAtTime(0.9, at);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.24);
    oscillator.connect(envelope).connect(this.master);
    this.track(oscillator);
    oscillator.start(at);
    oscillator.stop(at + 0.25);
  }

  private scheduleSnare(at: number): void {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = 1300;
    envelope.gain.setValueAtTime(0.48, at);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    source.connect(filter).connect(envelope).connect(this.master);
    this.track(source);
    source.start(at);
    source.stop(at + 0.17);
  }

  private scheduleHat(at: number): void {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = 7000;
    envelope.gain.setValueAtTime(0.14, at);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + 0.035);
    source.connect(filter).connect(envelope).connect(this.master);
    this.track(source);
    source.start(at);
    source.stop(at + 0.04);
  }

  private scheduleBass(at: number): void {
    const oscillator = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const envelope = this.context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 65.41;
    filter.type = "lowpass";
    filter.frequency.value = 240;
    envelope.gain.setValueAtTime(0.28, at);
    envelope.gain.exponentialRampToValueAtTime(0.001, at + this.beatDuration * 2.4);
    oscillator.connect(filter).connect(envelope).connect(this.master);
    this.track(oscillator);
    oscillator.start(at);
    oscillator.stop(at + this.beatDuration * 2.5);
  }

  private startBufferSource(): void {
    this.bufferSource?.stop();
    this.bufferSource = null;
    if (!this.buffer || this.muted) return;
    if (this.offset >= this.buffer.duration) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.master);
    source.addEventListener("ended", () => {
      if (this.bufferSource === source) this.bufferSource = null;
    }, { once: true });
    source.start(0, this.offset);
    this.bufferSource = source;
  }
}
