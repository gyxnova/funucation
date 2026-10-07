import { templates } from "../scenes/templates";
import { drawBackground } from "./style";

export interface TimelineEntry {
  id: string;
  start: number;
  end: number;
  template: string;
  params: Record<string, unknown>;
}

export interface Frame {
  t: number;
  lt: number;
  p: number;
  beat: number;
  bar: number;
  beatPhase: number;
  barPhase: number;
}

export interface TopicScene {
  template: string;
  start: number;
  end: number;
  params: Record<string, unknown>;
}

export interface TopicForEngine {
  bpm: number;
  scenes: TopicScene[];
}

export type SceneTemplate = (
  context: CanvasRenderingContext2D,
  frame: Frame,
  params: Record<string, unknown>,
) => void;

export const templateRegistry: Readonly<Record<string, SceneTemplate>> = templates;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function timelineFromTopic(topic: TopicForEngine): TimelineEntry[] {
  return topic.scenes.map((scene, index) => ({
    id: `${scene.template}-${index}`,
    start: scene.start,
    end: scene.end,
    template: scene.template,
    params: scene.params,
  }));
}

function crossfadeAlpha(entry: TimelineEntry, timeline: readonly TimelineEntry[], t: number): number {
  const previousEnd = Math.max(
    entry.start,
    ...timeline.filter((candidate) => candidate.start < entry.start && candidate.end > entry.start).map((c) => c.end),
  );
  const nextStart = Math.min(
    entry.end,
    ...timeline.filter((candidate) => candidate.start > entry.start && candidate.start < entry.end).map((c) => c.start),
  );
  const fadeIn = previousEnd > entry.start
    ? clamp01((t - entry.start) / (previousEnd - entry.start))
    : 1;
  const fadeOut = nextStart < entry.end
    ? clamp01((entry.end - t) / (entry.end - nextStart))
    : 1;
  return Math.min(fadeIn, fadeOut);
}

export class Engine {
  private readonly timeline: TimelineEntry[];
  private readonly context: CanvasRenderingContext2D;
  private readonly bpm: number;
  private readonly canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    topic: TopicForEngine,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available in this browser");
    this.canvas = canvas;
    this.context = context;
    this.timeline = timelineFromTopic(topic);
    this.bpm = topic.bpm;
    this.syncCanvasSize();
  }

  get entries(): readonly TimelineEntry[] {
    return this.timeline;
  }

  render(t: number): void {
    this.syncCanvasSize();
    const context = this.context;
    context.setTransform(this.canvas.width / 1920, 0, 0, this.canvas.height / 1080, 0, 0);
    context.clearRect(0, 0, 1920, 1080);
    drawBackground(context);

    const beat = (t * this.bpm) / 60;
    const bar = beat / 4;
    for (const entry of this.timeline) {
      if (t < entry.start || t >= entry.end) continue;
      const template = templateRegistry[entry.template];
      if (!template) throw new Error(`Unknown scene template: ${entry.template}`);
      const frame: Frame = {
        t,
        lt: t - entry.start,
        p: clamp01((t - entry.start) / (entry.end - entry.start)),
        beat,
        bar: Math.floor(bar),
        beatPhase: beat - Math.floor(beat),
        barPhase: bar - Math.floor(bar),
      };
      context.save();
      context.globalAlpha = crossfadeAlpha(entry, this.timeline, t);
      template(context, frame, entry.params);
      context.restore();
    }
  }

  private syncCanvasSize(): void {
    const bounds = this.canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(bounds.width * pixelRatio));
    const height = Math.max(1, Math.round(bounds.height * pixelRatio));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }
}
