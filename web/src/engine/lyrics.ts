export interface LyricLine {
  text: string;
  start: number;
  end: number;
  scene?: string;
}

export function lineByText(lines: readonly LyricLine[], text: string): LyricLine | null {
  return lines.find((line) => line.text === text) ?? null;
}

export function lineAt(lines: readonly LyricLine[], t: number): LyricLine | null {
  return lines.find((line) => t >= line.start && t < line.end) ?? null;
}

export function wipeAt(line: LyricLine | null, t: number): number {
  if (!line || line.end <= line.start) return 0;
  return Math.min(1, Math.max(0, (t - line.start) / (line.end - line.start)));
}
