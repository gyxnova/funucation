import type { LyricLine } from "./engine/lyrics";

const VOICE_DISCOVERY_TIMEOUT_MS = 5000;
const ESTIMATED_CHARACTERS_PER_SECOND = 14;

export class LyricVoice {
  private voice: SpeechSynthesisVoice | null = null;
  private readonly spokenLines = new Set<number>();
  private enabled = true;
  private muted: boolean;
  private volume = 0.7;
  private closed = false;
  private readonly ready: Promise<void>;

  constructor(
    private readonly lines: readonly LyricLine[],
    private readonly onStatus: (voice: SpeechSynthesisVoice | null) => void,
    private readonly forceMute = false,
  ) {
    this.muted = forceMute;
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window) || forceMute) {
      this.enabled = false;
      queueMicrotask(() => {
        if (!this.closed) this.onStatus(null);
      });
      this.ready = Promise.resolve();
    } else {
      this.ready = this.loadVoice();
    }
  }

  get hasVoice(): boolean {
    return this.voice !== null;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = !this.forceMute && enabled;
    if (!this.enabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  setMuted(muted: boolean): void {
    this.muted = this.forceMute || muted;
    if (this.muted) this.pause();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  async prepare(): Promise<void> {
    await this.ready;
  }

  crossed(previousTime: number, currentTime: number): void {
    if (!this.enabled || this.muted || !this.voice || currentTime <= previousTime) return;
    const crossed: number[] = [];
    this.lines.forEach((line, index) => {
      if (!this.spokenLines.has(index) && line.start >= previousTime && line.start <= currentTime) {
        crossed.push(index);
      }
    });
    if (crossed.length === 0) return;
    const latestIndex = crossed[crossed.length - 1];
    if (latestIndex === undefined) return;
    crossed.forEach((index) => this.spokenLines.add(index));
    this.speak(latestIndex, currentTime);
  }

  pause(): void {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  seek(time: number): void {
    this.pause();
    this.spokenLines.clear();
    this.lines.forEach((line, index) => {
      if (line.start < time) this.spokenLines.add(index);
    });
  }

  close(): void {
    this.closed = true;
    this.pause();
  }

  private async loadVoice(): Promise<void> {
    const synthesis = window.speechSynthesis;
    let voices = synthesis.getVoices();
    if (voices.length === 0) {
      voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
        let timeout = 0;
        const finish = (): void => {
          window.clearTimeout(timeout);
          synthesis.removeEventListener("voiceschanged", onVoicesChanged);
          resolve(synthesis.getVoices());
        };
        const onVoicesChanged = (): void => {
          if (synthesis.getVoices().length > 0) finish();
        };
        synthesis.addEventListener("voiceschanged", onVoicesChanged);
        timeout = window.setTimeout(finish, VOICE_DISCOVERY_TIMEOUT_MS);
        if (synthesis.getVoices().length > 0) finish();
      });
    }
    this.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ?? voices[0] ?? null;
    if (!this.voice) this.enabled = false;
    queueMicrotask(() => {
      if (!this.closed) this.onStatus(this.voice);
    });
  }

  private speak(index: number, currentTime: number): void {
    const line = this.lines[index];
    if (!line || !this.voice) return;
    const remaining = Math.max(0.05, line.end - currentTime);
    const estimatedDuration = line.text.length / ESTIMATED_CHARACTERS_PER_SECOND;
    const rate = Math.min(1.4, Math.max(0.8, estimatedDuration / remaining));
    const utterance = new SpeechSynthesisUtterance(line.text);
    utterance.voice = this.voice;
    utterance.rate = rate;
    utterance.volume = this.volume;
    window.speechSynthesis.speak(utterance);
  }
}
