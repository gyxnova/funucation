import type { LyricLine } from "./engine/lyrics";

export interface PausePoint {
  at: number;
  question: string;
  options: string[];
  correct: number;
  explain: string;
}

export interface Topic {
  id: string;
  field: string;
  title: string;
  bpm: number;
  audio: string;
  lyrics: LyricLine[];
  scenes: {
    template: string;
    start: number;
    end: number;
    params: Record<string, unknown>;
  }[];
  pauses: PausePoint[];
}

export interface CatalogEntry {
  id: string;
  title: string;
  ready: boolean;
  file?: string;
}

export interface Catalog {
  topics: CatalogEntry[];
}
