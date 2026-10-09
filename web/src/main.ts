import "./style.css";
import { Player } from "./player";
import type { LyricLine } from "./engine/lyrics";
import type { Catalog, CatalogEntry, GeneratedSong, QuizResponse, Topic } from "./types";

declare global {
  interface Window {
    __ready?: boolean;
  }
}

window.__ready = false;

const picker = document.querySelector<HTMLSelectElement>("#topic-picker");
const status = document.querySelector<HTMLElement>("#topic-status");
const generateButton = document.querySelector<HTMLButtonElement>("#generate-song");
const generatedMeta = document.querySelector<HTMLElement>("#generated-meta");
const playerElements = {
  canvas: document.querySelector<HTMLCanvasElement>("#lesson-canvas"),
  playButton: document.querySelector<HTMLButtonElement>("#play-toggle"),
  scrubber: document.querySelector<HTMLInputElement>("#scrubber"),
  currentTime: document.querySelector<HTMLElement>("#current-time"),
  duration: document.querySelector<HTMLElement>("#duration"),
  lyricBase: document.querySelector<HTMLElement>("#lyric-base"),
  lyricWipe: document.querySelector<HTMLElement>("#lyric-wipe"),
  pauseCard: document.querySelector<HTMLElement>("#pause-card"),
  pauseQuestion: document.querySelector<HTMLElement>("#pause-question"),
  pauseOptions: document.querySelector<HTMLElement>("#pause-options"),
  pauseFeedback: document.querySelector<HTMLElement>("#pause-feedback"),
  previousScene: document.querySelector<HTMLButtonElement>("#previous-scene"),
  nextScene: document.querySelector<HTMLButtonElement>("#next-scene"),
  loopToggle: document.querySelector<HTMLButtonElement>("#loop-toggle"),
  volume: document.querySelector<HTMLInputElement>("#volume"),
  muteToggle: document.querySelector<HTMLButtonElement>("#mute-toggle"),
  voiceToggle: document.querySelector<HTMLButtonElement>("#voice-toggle"),
  audioStatus: document.querySelector<HTMLElement>("#audio-status"),
  voiceMessage: document.querySelector<HTMLElement>("#voice-message"),
};

function required<T>(element: T | null, selector: string): T {
  if (!element) throw new Error(`Missing required page element: ${selector}`);
  return element;
}

function resolvePlayerElements(): ConstructorParameters<typeof Player>[0] {
  return {
    canvas: required(playerElements.canvas, "#lesson-canvas"),
    playButton: required(playerElements.playButton, "#play-toggle"),
    scrubber: required(playerElements.scrubber, "#scrubber"),
    currentTime: required(playerElements.currentTime, "#current-time"),
    duration: required(playerElements.duration, "#duration"),
    lyricBase: required(playerElements.lyricBase, "#lyric-base"),
    lyricWipe: required(playerElements.lyricWipe, "#lyric-wipe"),
    pauseCard: required(playerElements.pauseCard, "#pause-card"),
    pauseQuestion: required(playerElements.pauseQuestion, "#pause-question"),
    pauseOptions: required(playerElements.pauseOptions, "#pause-options"),
    pauseFeedback: required(playerElements.pauseFeedback, "#pause-feedback"),
    previousScene: required(playerElements.previousScene, "#previous-scene"),
    nextScene: required(playerElements.nextScene, "#next-scene"),
    loopToggle: required(playerElements.loopToggle, "#loop-toggle"),
    volume: required(playerElements.volume, "#volume"),
    muteToggle: required(playerElements.muteToggle, "#mute-toggle"),
    voiceToggle: required(playerElements.voiceToggle, "#voice-toggle"),
    audioStatus: required(playerElements.audioStatus, "#audio-status"),
    voiceMessage: required(playerElements.voiceMessage, "#voice-message"),
  };
}

function topicFile(entry: CatalogEntry): string {
  return entry.file ?? `/topics/${entry.id}.json`;
}

async function loadTopic(entry: CatalogEntry): Promise<Topic> {
  const response = await fetch(topicFile(entry));
  if (!response.ok) throw new Error(`Could not load topic "${entry.id}" (${response.status})`);
  const data = await response.json() as Omit<Topic, "scenes"> & {
    scenes?: Topic["scenes"];
  };
  const timeOffset = data.time_offset ?? 0;
  const timeScale = data.time_scale ?? 1;
  if (!Number.isFinite(timeOffset) || !Number.isFinite(timeScale) || timeScale <= 0) {
    throw new Error(`Topic "${entry.id}" has invalid time_offset or time_scale metadata`);
  }
  const adjustTime = (time: number): number => timeOffset + time * timeScale;
  const lyrics: LyricLine[] = data.lyrics.map((line) => ({
    ...line,
    start: adjustTime(line.start),
    end: adjustTime(line.end),
  }));
  const pauses = data.pauses.map((pause) => ({ ...pause, at: adjustTime(pause.at) }));
  const duration = data.duration === undefined ? undefined : adjustTime(data.duration);
  if (data.scenes) {
    return {
      ...data,
      duration,
      lyrics,
      pauses,
      scenes: data.scenes.map((scene) => ({
        ...scene,
        start: adjustTime(scene.start),
        end: adjustTime(scene.end),
      })),
    };
  }

  const scenes: Topic["scenes"] = [];
  for (const line of lyrics) {
    if (!line.scene) throw new Error(`Topic "${entry.id}" has a lyric without a scene reference`);
    const previous = scenes.at(-1);
    if (previous?.template === line.scene && previous.end === line.start) {
      previous.end = line.end;
    } else {
      scenes.push({ template: line.scene, start: line.start, end: line.end, params: {} });
    }
  }
  return { ...data, duration, lyrics, pauses, scenes };
}

async function start(): Promise<void> {
  const query = new URLSearchParams(window.location.search);
  const requestedTopicId = query.get("topic");
  const requestedTime = Number(query.get("t") ?? 0);
  const clean = query.get("clean") === "1";
  if (!Number.isFinite(requestedTime) || requestedTime < 0) {
    throw new Error("The t query parameter must be a non-negative number");
  }
  if (clean) document.documentElement.dataset.clean = "true";

  const topicPicker = required(picker, "#topic-picker");
  const topicStatus = required(status, "#topic-status");
  const songButton = required(generateButton, "#generate-song");
  const songMeta = required(generatedMeta, "#generated-meta");
  const catalogResponse = await fetch("/catalog.json");
  if (!catalogResponse.ok) throw new Error(`Could not load topic catalog (${catalogResponse.status})`);
  const catalog = await catalogResponse.json() as Catalog;
  const readyTopics = catalog.topics.filter((topic) => topic.ready);

  catalog.topics.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = topic.ready ? topic.title : `${topic.title} — coming soon`;
    option.disabled = !topic.ready;
    topicPicker.append(option);
  });

  let player: Player | null = null;
  let selectedEntry: CatalogEntry | null = null;
  const playerSection = required(document.querySelector<HTMLElement>(".player"), ".player");
  const quizScreen = required(document.querySelector<HTMLElement>("#quiz-screen"), "#quiz-screen");
  const quizSource = required(document.querySelector<HTMLElement>("#quiz-source"), "#quiz-source");
  const quizProgress = required(document.querySelector<HTMLElement>("#quiz-progress"), "#quiz-progress");
  const quizQuestion = required(document.querySelector<HTMLElement>("#quiz-question"), "#quiz-question");
  const quizOptions = required(document.querySelector<HTMLElement>("#quiz-options"), "#quiz-options");
  const quizFeedback = required(document.querySelector<HTMLElement>("#quiz-feedback"), "#quiz-feedback");
  const quizResult = required(document.querySelector<HTMLElement>("#quiz-result"), "#quiz-result");
  const quizNext = required(document.querySelector<HTMLButtonElement>("#quiz-next"), "#quiz-next");
  const quizReplay = required(document.querySelector<HTMLButtonElement>("#quiz-replay"), "#quiz-replay");
  let quiz: QuizResponse | null = null;
  let quizIndex = 0;
  let quizScore = 0;
  let questionAnswered = false;

  const isQuizResponse = (value: unknown): value is QuizResponse => {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<QuizResponse>;
    return typeof candidate.topic_id === "string"
      && typeof candidate.model_used === "string"
      && typeof candidate.repairs_used === "number"
      && Array.isArray(candidate.questions)
      && candidate.questions.length > 0
      && candidate.questions.every((question) =>
        typeof question.question === "string"
        && Array.isArray(question.options)
        && question.options.length >= 2
        && question.options.every((option) => typeof option === "string")
        && Number.isInteger(question.correct_index)
        && question.correct_index >= 0
        && question.correct_index < question.options.length
        && typeof question.explanation === "string");
  };

  const renderQuizQuestion = (): void => {
    if (!quiz) return;
    const activeQuiz = quiz;
    questionAnswered = false;
    quizOptions.replaceChildren();
    quizFeedback.textContent = "";
    quizNext.hidden = true;
    quizReplay.hidden = true;
    if (quizIndex >= activeQuiz.questions.length) {
      quizProgress.textContent = "";
      quizQuestion.textContent = "Lesson complete";
      quizResult.textContent = `Score: ${quizScore} / ${activeQuiz.questions.length}`;
      quizReplay.hidden = false;
      return;
    }
    const current = activeQuiz.questions[quizIndex];
    if (!current) return;
    quizProgress.textContent = `Question ${quizIndex + 1} of ${quiz.questions.length}`;
    quizQuestion.textContent = current.question;
    quizResult.textContent = "";
    current.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option;
      button.addEventListener("click", () => {
        if (questionAnswered) return;
        questionAnswered = true;
        const correct = index === current.correct_index;
        if (correct) quizScore += 1;
        quizFeedback.textContent = `${correct ? "Correct." : "Not quite."} ${current.explanation}`;
        quizOptions.querySelectorAll("button").forEach((choice) => {
          choice.disabled = true;
        });
        quizNext.textContent = quizIndex + 1 === activeQuiz.questions.length ? "See score" : "Next question";
        quizNext.hidden = false;
      });
      quizOptions.append(button);
    });
  };

  quizNext.addEventListener("click", () => {
    quizIndex += 1;
    renderQuizQuestion();
  });
  quizReplay.addEventListener("click", () => {
    quizScreen.hidden = true;
    playerSection.hidden = false;
    player?.replay();
  });

  const showQuiz = async (topicId: string): Promise<void> => {
    playerSection.hidden = true;
    quizScreen.hidden = false;
    quizSource.textContent = "Loading quiz…";
    quizProgress.textContent = "";
    quizQuestion.textContent = "";
    quizOptions.replaceChildren();
    quizFeedback.textContent = "";
    quizResult.textContent = "";
    quizNext.hidden = true;
    quizReplay.hidden = true;

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: topicId }),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Quiz request failed (${response.status})`);
      const generated: unknown = await response.json();
      if (!isQuizResponse(generated) || generated.topic_id !== topicId) {
        throw new Error("Quiz response did not match the expected format");
      }
      quiz = generated;
      quizSource.textContent = generated.model_used === "fallback" || generated.model_used === "curated"
        ? "Curated quiz"
        : "AI-generated quiz";
    } catch {
      try {
        const response = await fetch(`/quizzes/${encodeURIComponent(topicId)}.json`);
        if (!response.ok) throw new Error(`Curated quiz unavailable (${response.status})`);
        const curated: unknown = await response.json();
        if (!isQuizResponse(curated) || curated.topic_id !== topicId) {
          throw new Error("Curated quiz has an invalid format");
        }
        quiz = curated;
        quizSource.textContent = "Curated quiz";
      } catch (error) {
        quiz = null;
        quizSource.textContent = "Quiz unavailable";
        quizResult.textContent = error instanceof Error ? error.message : String(error);
        quizReplay.hidden = false;
        return;
      }
    }
    quizIndex = 0;
    quizScore = 0;
    renderQuizQuestion();
  };

  const chooseTopic = async (topicId: string, initialTime = 0): Promise<void> => {
    const entry = readyTopics.find((topic) => topic.id === topicId);
    if (!entry) return;
    selectedEntry = entry;
    quizScreen.hidden = true;
    playerSection.hidden = false;
    songMeta.hidden = true;
    topicStatus.textContent = `Loading ${entry.title}…`;
    try {
      const topic = await loadTopic(entry);
      player?.destroy();
      player = new Player(resolvePlayerElements(), topic, initialTime, () => void showQuiz(entry.id));
      topicStatus.textContent = `${topic.field} · ${topic.title}`;
    } catch (error) {
      topicStatus.textContent = `Could not open topic: ${String(error)}`;
      throw error;
    }
  };

  topicPicker.addEventListener("change", () => void chooseTopic(topicPicker.value));
  songButton.addEventListener("click", async () => {
    const entry = selectedEntry;
    if (!entry) return;
    quizScreen.hidden = true;
    playerSection.hidden = false;
    songButton.disabled = true;
    songButton.textContent = "Generating…";
    songMeta.hidden = true;
    topicStatus.textContent = `Generating a song for ${entry.title}…`;

    try {
      const response = await fetch("/api/song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_id: entry.id }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) {
        const error = await response.json() as { detail?: string };
        throw new Error(error.detail ?? `Song generation failed (${response.status})`);
      }
      const generated = await response.json() as GeneratedSong;
      const baseTopic = await loadTopic(entry);
      const topic: Topic = {
        id: generated.topic_id,
        field: baseTopic.field,
        title: generated.title,
        bpm: generated.bpm,
        audio: baseTopic.audio,
        lyrics: generated.lyrics,
        scenes: generated.scenes,
        pauses: generated.pauses,
      };
      player?.destroy();
      player = new Player(resolvePlayerElements(), topic, 0, () => void showQuiz(entry.id));
      topicStatus.textContent = `${topic.field} · ${topic.title}`;
      songMeta.textContent = `Generated by ${generated.model_used} after ${generated.repairs_used} repairs`;
      songMeta.hidden = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      topicStatus.textContent = `Song generation failed: ${message}. Loading the local topic fallback.`;
      try {
        const fallbackTopic = await loadTopic(entry);
        player?.destroy();
        player = new Player(resolvePlayerElements(), fallbackTopic, 0, () => void showQuiz(entry.id));
        songMeta.textContent = "Using the local topic fallback";
        songMeta.hidden = false;
      } catch (fallbackError) {
        topicStatus.textContent += ` Local fallback failed: ${String(fallbackError)}`;
      }
    } finally {
      songButton.disabled = false;
      songButton.textContent = "Generate song";
    }
  });
  const firstTopic = readyTopics[0];
  if (!firstTopic) throw new Error("The topic catalog has no ready topics");
  const selectedTopic = requestedTopicId
    ? readyTopics.find((topic) => topic.id === requestedTopicId)
    : firstTopic;
  if (!selectedTopic) throw new Error(`Unknown or unavailable topic: ${requestedTopicId}`);
  topicPicker.value = selectedTopic.id;
  await chooseTopic(selectedTopic.id, requestedTime);
  window.__ready = true;
}

void start().catch((error: unknown) => {
  const topicStatus = required(status, "#topic-status");
  topicStatus.textContent = `Unable to start the lesson player: ${String(error)}`;
});
