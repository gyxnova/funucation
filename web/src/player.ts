import { Engine } from "./engine/engine";
import { lineAt, wipeAt } from "./engine/lyrics";
import { AudioController } from "./audio";
import { LyricVoice } from "./voice";
import type { PausePoint, Topic } from "./types";

interface PlayerElements {
  canvas: HTMLCanvasElement;
  playButton: HTMLButtonElement;
  scrubber: HTMLInputElement;
  currentTime: HTMLElement;
  duration: HTMLElement;
  lyricBase: HTMLElement;
  lyricWipe: HTMLElement;
  pauseCard: HTMLElement;
  pauseQuestion: HTMLElement;
  pauseOptions: HTMLElement;
  pauseFeedback: HTMLElement;
  previousScene: HTMLButtonElement;
  nextScene: HTMLButtonElement;
  loopToggle: HTMLButtonElement;
  volume: HTMLInputElement;
  muteToggle: HTMLButtonElement;
  voiceToggle: HTMLButtonElement;
  audioStatus: HTMLElement;
  voiceMessage: HTMLElement;
}

const FEEDBACK_MS = 1800;
const DEBUG_OVERLAY_ENABLED = new URLSearchParams(window.location.search).get("debug") === "1";

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export class Player {
  private readonly engine: Engine;
  private readonly audio: AudioController;
  private readonly voice: LyricVoice;
  private readonly listeners = new AbortController();
  private readonly endTime: number;
  private readonly passedPauses = new Set<number>();
  private playing = false;
  private startRequested = false;
  private endNotified = false;
  private startGeneration = 0;
  private loopScene = false;
  private activePause: PausePoint | null = null;
  private currentTime = 0;
  private lastFrameAt = performance.now();
  private lastObservedTime = 0;
  private seeking = false;
  private animationId = 0;
  private feedbackTimeout = 0;
  private readonly debugOverlay: HTMLPreElement | null;
  private readonly frameSamples: number[] = [];
  private readonly backwardsJumps: { at: number; amount: number }[] = [];
  private lastDebugUpdateAt = 0;

  replay(): void {
    this.endNotified = false;
    this.seekTo(0);
    void this.togglePlayback();
  }

  constructor(
    private readonly elements: PlayerElements,
    private readonly topic: Topic,
    initialTime = 0,
    private readonly onEnded?: () => void,
  ) {
    this.engine = new Engine(elements.canvas, topic);
    const forceMute = new URLSearchParams(window.location.search).get("mute") === "1";
    this.audio = new AudioController(topic.bpm, topic.audio, forceMute);
    this.voice = new LyricVoice(topic.lyrics, (voice) => {
      elements.audioStatus.textContent = this.audioStatusText(voice !== null);
      elements.voiceMessage.hidden = voice !== null || forceMute;
      elements.voiceMessage.textContent = forceMute
        ? "Audio disabled by ?mute=1."
        : "No speech voice is available in this browser.";
      elements.voiceToggle.disabled = forceMute || voice === null;
      this.updateVoiceButton();
    }, forceMute);
    if (this.audio.usesAudioFile) this.voice.setEnabled(false);
    this.endTime = Math.max(
      1,
      topic.duration ?? 0,
      ...topic.scenes.map((scene) => scene.end),
      ...topic.lyrics.map((line) => line.end),
      ...topic.pauses.map((pause) => pause.at),
    );
    this.currentTime = Math.min(this.endTime, Math.max(0, initialTime));
    this.lastObservedTime = this.currentTime;
    this.voice.seek(this.currentTime);
    elements.audioStatus.textContent = this.audioStatusText(false);
    elements.voiceMessage.hidden = forceMute;
    elements.voiceMessage.textContent = forceMute
      ? "Audio disabled by ?mute=1."
      : "Checking for a speech voice…";
    elements.volume.value = "0.7";
    elements.muteToggle.disabled = forceMute;
    elements.muteToggle.setAttribute("aria-pressed", String(forceMute));
    elements.muteToggle.textContent = forceMute ? "Muted" : "Mute";
    elements.volume.disabled = forceMute;
    elements.voiceToggle.disabled = forceMute;
    this.updateVoiceButton();
    this.debugOverlay = this.createDebugOverlay();
    elements.scrubber.max = String(this.endTime);
    elements.scrubber.value = String(this.currentTime);
    elements.duration.textContent = formatTime(this.endTime);
    this.bindEvents();
    this.renderLoop();
    void this.audio.prepare().catch((error: unknown) => {
      this.elements.pauseFeedback.textContent = `Audio could not be loaded: ${String(error)}`;
    });
    void this.voice.prepare();
  }

  private bindEvents(): void {
    const { playButton, scrubber, previousScene, nextScene, loopToggle, volume, muteToggle, voiceToggle } = this.elements;
    const options = { signal: this.listeners.signal };
    playButton.addEventListener("click", () => void this.togglePlayback(), options);
    scrubber.addEventListener("input", () => this.onSeek(Number(scrubber.value)), options);
    scrubber.addEventListener("change", () => {
      this.lastObservedTime = this.currentTime;
    }, options);
    previousScene.addEventListener("click", () => this.jumpScene(-1), options);
    nextScene.addEventListener("click", () => this.jumpScene(1), options);
    loopToggle.addEventListener("click", () => {
      this.loopScene = !this.loopScene;
      loopToggle.setAttribute("aria-pressed", String(this.loopScene));
      loopToggle.textContent = this.loopScene ? "Looping scene (L)" : "Loop scene (L)";
    }, options);
    volume.addEventListener("input", () => {
      this.audio.setVolume(Number(volume.value));
      this.voice.setVolume(Number(volume.value));
    }, options);
    muteToggle.addEventListener("click", () => {
      this.audio.setMuted(!this.audio.isMuted);
      this.voice.setMuted(this.audio.isMuted);
      this.updateMuteButton();
    }, options);
    voiceToggle.addEventListener("click", () => {
      this.voice.setEnabled(!this.voice.isEnabled);
      this.updateVoiceButton();
    }, options);
    window.addEventListener("keydown", (event) => {
      if (this.isTypingTarget(event.target)) return;
      if (event.code === "Space") {
        event.preventDefault();
        void this.togglePlayback();
      } else if (event.key === "ArrowLeft") {
        this.seekTo(this.currentTime - 5);
      } else if (event.key === "ArrowRight") {
        this.seekTo(this.currentTime + 5);
      } else if (event.key === "[") {
        this.jumpScene(-1);
      } else if (event.key === "]") {
        this.jumpScene(1);
      } else if (event.key.toLowerCase() === "l") {
        loopToggle.click();
      }
    }, options);
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName));
  }

  private async togglePlayback(): Promise<void> {
    if (this.activePause) return;
    if (this.playing || this.startRequested) {
      this.pausePlayback();
      return;
    }
    if (this.currentTime >= this.endTime) this.seekTo(0);
    const generation = ++this.startGeneration;
    this.startRequested = true;
    this.elements.playButton.textContent = "Starting…";
    try {
      const started = await this.audio.start(this.currentTime);
      if (!started || !this.startRequested || generation !== this.startGeneration) return;
      this.startRequested = false;
      this.playing = true;
      this.lastFrameAt = performance.now();
      this.elements.playButton.textContent = "Pause";
    } catch (error) {
      this.elements.pauseFeedback.textContent = `Audio could not be played: ${String(error)}`;
    } finally {
      if (generation === this.startGeneration && !this.playing) {
        this.startRequested = false;
        this.elements.playButton.textContent = "Play";
      }
    }
  }

  private pausePlayback(at?: number): void {
    this.playing = false;
    this.startRequested = false;
    this.startGeneration += 1;
    this.audio.pause(at);
    this.voice.pause();
    this.elements.playButton.textContent = "Play";
  }

  private audioStatusText(hasVoice: boolean): string {
    const source = this.audio.usesAudioFile ? "audio file" : "synthesized beat";
    const voice = hasVoice ? "voice available" : "voice unavailable";
    return `Beat + voice · ${this.topic.bpm} BPM · ${source} · ${voice}`;
  }

  private updateMuteButton(): void {
    this.elements.muteToggle.setAttribute("aria-pressed", String(this.audio.isMuted));
    this.elements.muteToggle.textContent = this.audio.isMuted ? "Unmute" : "Mute";
  }

  private updateVoiceButton(): void {
    this.elements.voiceToggle.setAttribute("aria-pressed", String(this.voice.isEnabled));
    this.elements.voiceToggle.textContent = this.voice.isEnabled ? "Voice on" : "Voice off";
  }

  private createDebugOverlay(): HTMLPreElement | null {
    if (!DEBUG_OVERLAY_ENABLED) return null;
    const overlay = document.createElement("pre");
    overlay.setAttribute("aria-label", "Playback timing diagnostics");
    Object.assign(overlay.style, {
      position: "absolute",
      zIndex: "5",
      top: "12px",
      left: "12px",
      margin: "0",
      padding: "10px 12px",
      border: "1px solid rgba(238, 233, 223, 0.35)",
      borderRadius: "4px",
      color: "#EEE9DF",
      background: "rgba(10, 10, 10, 0.82)",
      font: "12px/1.55 ui-monospace, monospace",
      pointerEvents: "none",
      whiteSpace: "pre",
    });
    this.elements.canvas.parentElement?.append(overlay);
    return overlay;
  }

  private onSeek(time: number): void {
    this.seeking = true;
    this.seekTo(time);
    this.seeking = false;
  }

  private seekTo(time: number): void {
    const nextTime = Math.min(this.endTime, Math.max(0, time));
    const jump = nextTime - this.currentTime;
    if (jump < 0) this.backwardsJumps.push({ at: performance.now(), amount: -jump });
    if (nextTime > this.currentTime) {
      this.topic.pauses.forEach((pause, index) => {
        if (pause.at <= nextTime) this.passedPauses.add(index);
      });
    }
    this.currentTime = nextTime;
    this.lastObservedTime = nextTime;
    this.lastFrameAt = performance.now();
    this.audio.seek(nextTime);
    this.voice.seek(nextTime);
    this.elements.scrubber.value = String(nextTime);
    this.updateReadouts();
  }

  private jumpScene(direction: -1 | 1): void {
    const entries = this.engine.entries;
    if (entries.length === 0) return;
    const target = direction > 0
      ? entries.find((entry) => entry.start > this.currentTime + 0.05)
      : [...entries].reverse().find((entry) => entry.start < this.currentTime - 0.05);
    if (target) this.seekTo(target.start);
  }

  private checkPausePoint(time: number): void {
    if (!this.playing || this.activePause || this.seeking) return;
    const pauseIndex = this.topic.pauses.findIndex(
      (pause, index) =>
        !this.passedPauses.has(index)
        && pause.at > this.lastObservedTime
        && pause.at <= time,
    );
    if (pauseIndex === -1) return;

    const pause = this.topic.pauses[pauseIndex];
    if (!pause) return;
    this.passedPauses.add(pauseIndex);
    this.activePause = pause;
    this.currentTime = pause.at;
    this.lastObservedTime = pause.at;
    this.pausePlayback(pause.at);
    this.showPause(pause);
  }

  private showPause(pause: PausePoint): void {
    const { pauseCard, pauseQuestion, pauseOptions, pauseFeedback } = this.elements;
    pauseQuestion.textContent = pause.question;
    pauseOptions.replaceChildren();
    pauseFeedback.textContent = "";
    pause.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.addEventListener("click", () => this.answerPause(index));
      pauseOptions.append(button);
    });
    pauseCard.hidden = false;
  }

  private answerPause(answer: number): void {
    const pause = this.activePause;
    if (!pause) return;
    const correct = answer === pause.correct;
    this.elements.pauseFeedback.textContent = `${correct ? "That's right!" : "Not quite."} ${pause.explain}`;
    this.elements.pauseOptions.querySelectorAll("button").forEach((button) => {
      (button as HTMLButtonElement).disabled = true;
    });
    window.clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = window.setTimeout(() => {
      this.elements.pauseCard.hidden = true;
      this.activePause = null;
      void this.togglePlayback();
    }, FEEDBACK_MS);
  }

  private updateReadouts(): void {
    this.elements.currentTime.textContent = formatTime(this.currentTime);
    this.elements.scrubber.value = String(this.currentTime);
    const currentLine = lineAt(this.topic.lyrics, this.currentTime);
    const isCaption = currentLine?.show_text === false;
    const displayText = currentLine
      ? isCaption ? currentLine.caption ?? "" : currentLine.text
      : "";
    this.elements.lyricBase.textContent = displayText;
    this.elements.lyricBase.hidden = displayText.length === 0;
    this.elements.lyricBase.dataset.caption = String(isCaption);
    this.elements.lyricWipe.textContent = isCaption ? "" : displayText;
    this.elements.lyricWipe.hidden = !currentLine || isCaption;
    this.elements.lyricWipe.style.clipPath = `inset(0 ${(1 - wipeAt(isCaption ? null : currentLine, this.currentTime)) * 100}% 0 0)`;
  }

  private updateDebugOverlay(now: number, frameTime: number): void {
    if (!this.debugOverlay) return;
    this.frameSamples.push(now);
    while (this.frameSamples.length > 0 && (this.frameSamples[0] ?? now) < now - 1000) {
      this.frameSamples.shift();
    }
    while (this.backwardsJumps.length > 0 && (this.backwardsJumps[0]?.at ?? now) < now - 5000) {
      this.backwardsJumps.shift();
    }
    if (now - this.lastDebugUpdateAt < 100) return;
    this.lastDebugUpdateAt = now;
    const firstFrame = this.frameSamples[0] ?? now;
    const elapsed = now - firstFrame;
    const fps = elapsed > 0 ? ((this.frameSamples.length - 1) * 1000) / elapsed : 0;
    const largestBackwardsJump = this.backwardsJumps.reduce(
      (largest, jump) => Math.max(largest, jump.amount),
      0,
    );
    this.debugOverlay.textContent = [
      `FPS        ${fps.toFixed(1)}`,
      `Frame time ${frameTime.toFixed(2)} ms`,
      `t          ${this.currentTime.toFixed(3)} s`,
      `Backwards  ${largestBackwardsJump.toFixed(3)} s / 5 s`,
    ].join("\n");
  }

  private renderLoop = (): void => {
    const now = performance.now();
    const frameTime = Math.max(0, now - this.lastFrameAt);
    const previousTime = this.currentTime;
    if (this.playing) {
      const time = Math.min(this.endTime, Math.max(this.currentTime, this.audio.currentTime));
      this.audio.update();
      this.checkPausePoint(time);
      if (!this.activePause) {
        if (this.loopScene) {
          const entry = [...this.engine.entries].reverse().find((candidate) => candidate.start <= time);
          if (entry && time >= entry.end) this.seekTo(entry.start);
        } else if (time >= this.endTime) {
          this.pausePlayback();
          this.seekTo(this.endTime);
          if (!this.endNotified) {
            this.endNotified = true;
            this.onEnded?.();
          }
        } else {
          this.currentTime = time;
          this.lastObservedTime = time;
          this.voice.crossed(previousTime, time);
        }
      }
    }
    if (this.currentTime < previousTime) {
      this.backwardsJumps.push({ at: now, amount: previousTime - this.currentTime });
    }
    this.lastFrameAt = now;
    this.engine.render(this.currentTime);
    this.updateReadouts();
    this.updateDebugOverlay(now, frameTime);
    this.animationId = window.requestAnimationFrame(this.renderLoop);
  };

  destroy(): void {
    window.cancelAnimationFrame(this.animationId);
    window.clearTimeout(this.feedbackTimeout);
    this.listeners.abort();
    this.voice.close();
    this.audio.close();
    this.debugOverlay?.remove();
  }
}
