import { Engine } from "./engine/engine";
import { lineAt, wipeAt } from "./engine/lyrics";
import type { PausePoint, Topic } from "./types";

interface PlayerElements {
  canvas: HTMLCanvasElement;
  audio: HTMLAudioElement;
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
}

const FEEDBACK_MS = 1800;

function formatTime(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export class Player {
  private readonly engine: Engine;
  private readonly endTime: number;
  private readonly passedPauses = new Set<number>();
  private playing = false;
  private loopScene = false;
  private activePause: PausePoint | null = null;
  private currentTime = 0;
  private clockTime = 0;
  private clockPerformanceTime = performance.now();
  private lastObservedTime = 0;
  private seeking = false;
  private animationId = 0;
  private feedbackTimeout = 0;

  constructor(
    private readonly elements: PlayerElements,
    private readonly topic: Topic,
  ) {
    this.engine = new Engine(elements.canvas, topic);
    this.endTime = Math.max(
      1,
      ...topic.scenes.map((scene) => scene.end),
      ...topic.lyrics.map((line) => line.end),
      ...topic.pauses.map((pause) => pause.at),
    );
    elements.audio.src = topic.audio;
    elements.scrubber.max = String(this.endTime);
    elements.duration.textContent = formatTime(this.endTime);
    this.bindEvents();
    this.renderLoop();
    elements.audio.load();
  }

  private bindEvents(): void {
    const { audio, playButton, scrubber, previousScene, nextScene, loopToggle } = this.elements;
    playButton.addEventListener("click", () => void this.togglePlayback());
    scrubber.addEventListener("input", () => this.onSeek(Number(scrubber.value)));
    scrubber.addEventListener("change", () => {
      this.lastObservedTime = this.currentTime;
    });
    previousScene.addEventListener("click", () => this.jumpScene(-1));
    nextScene.addEventListener("click", () => this.jumpScene(1));
    loopToggle.addEventListener("click", () => {
      this.loopScene = !this.loopScene;
      loopToggle.setAttribute("aria-pressed", String(this.loopScene));
      loopToggle.textContent = this.loopScene ? "Looping scene (L)" : "Loop scene (L)";
    });
    audio.addEventListener("play", () => {
      this.playing = true;
      this.anchorClock(audio.currentTime);
      this.elements.playButton.textContent = "Pause";
    });
    audio.addEventListener("pause", () => {
      this.playing = false;
      this.anchorClock(audio.currentTime);
      this.elements.playButton.textContent = "Play";
    });
    audio.addEventListener("ended", () => {
      this.playing = false;
      this.elements.playButton.textContent = "Play";
    });
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
    });
  }

  private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement
      && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName));
  }

  private async togglePlayback(): Promise<void> {
    if (this.activePause) return;
    if (this.playing) {
      this.elements.audio.pause();
      return;
    }
    if (this.currentTime >= this.endTime) this.seekTo(0);
    try {
      await this.elements.audio.play();
    } catch (error) {
      this.elements.pauseFeedback.textContent = `Audio could not be played: ${String(error)}`;
    }
  }

  private anchorClock(time: number): void {
    this.clockTime = time;
    this.clockPerformanceTime = performance.now();
  }

  private readAudioClock(): number {
    const now = performance.now();
    const elapsed = (now - this.clockPerformanceTime) / 1000;
    const predicted = this.clockTime + (this.playing ? elapsed : 0);
    const actual = this.elements.audio.currentTime;
    const drift = actual - predicted;
    const corrected = predicted + drift * 0.12;
    if (Math.abs(drift) > 0.25) {
      this.anchorClock(actual);
      return actual;
    }
    this.clockTime = corrected;
    this.clockPerformanceTime = now;
    return corrected;
  }

  private onSeek(time: number): void {
    this.seeking = true;
    this.seekTo(time);
    this.seeking = false;
  }

  private seekTo(time: number): void {
    const nextTime = Math.min(this.endTime, Math.max(0, time));
    if (nextTime > this.currentTime) {
      this.topic.pauses.forEach((pause, index) => {
        if (pause.at <= nextTime) this.passedPauses.add(index);
      });
    }
    this.currentTime = nextTime;
    this.lastObservedTime = nextTime;
    this.elements.audio.currentTime = nextTime;
    this.anchorClock(nextTime);
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
    this.elements.audio.pause();
    this.elements.audio.currentTime = pause.at;
    this.anchorClock(pause.at);
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
    this.elements.lyricBase.textContent = currentLine?.text ?? "";
    this.elements.lyricWipe.textContent = currentLine?.text ?? "";
    this.elements.lyricWipe.style.clipPath = `inset(0 ${(1 - wipeAt(currentLine, this.currentTime)) * 100}% 0 0)`;
  }

  private renderLoop = (): void => {
    if (this.playing) {
      const time = Math.min(this.endTime, this.readAudioClock());
      this.checkPausePoint(time);
      if (!this.activePause) {
        if (this.loopScene) {
          const entry = [...this.engine.entries].reverse().find((candidate) => candidate.start <= time);
          if (entry && time >= entry.end) this.seekTo(entry.start);
        } else if (time >= this.endTime) {
          this.elements.audio.pause();
          this.seekTo(this.endTime);
        } else {
          this.currentTime = time;
          this.lastObservedTime = time;
        }
      }
    }
    this.engine.render(this.currentTime);
    this.updateReadouts();
    this.animationId = window.requestAnimationFrame(this.renderLoop);
  };

  destroy(): void {
    window.cancelAnimationFrame(this.animationId);
    window.clearTimeout(this.feedbackTimeout);
    this.elements.audio.pause();
    this.elements.audio.removeAttribute("src");
    this.elements.audio.load();
  }
}
