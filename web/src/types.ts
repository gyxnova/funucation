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

export interface GeneratedSong extends Omit<Topic, "audio" | "field" | "id"> {
  topic_id: string;
  model_used: string;
  repairs_used: number;
}

export interface CatalogEntry {
  id: string;
  title: string;
  ready: boolean;
  file?: string;
  subtopics?: string[];
}

export interface Catalog {
  topics: CatalogEntry[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}

export interface QuizResponse {
  topic_id: string;
  questions: QuizQuestion[];
  model_used: string;
  repairs_used: number;
}
