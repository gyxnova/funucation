import "./style.css";
import { Player } from "./player";
import type { LyricLine } from "./engine/lyrics";
import type { Catalog, CatalogEntry, GeneratedSong, QuizResponse, Topic } from "./types";
import { generateQuestions } from "./quiz/gen";
import { generateActivationQuestions } from "./quiz/gen_activation";

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
  const topicIsReady = (topic: CatalogEntry): boolean =>
    topic.status === "ready" || (topic.status === undefined && topic.ready);
  const readyTopics = catalog.topics.filter(topicIsReady);

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
  const quizReview = required(document.querySelector<HTMLElement>("#quiz-review"), "#quiz-review");
  const quizNext = required(document.querySelector<HTMLButtonElement>("#quiz-next"), "#quiz-next");
  const quizNextLesson = required(document.querySelector<HTMLButtonElement>("#quiz-next-lesson"), "#quiz-next-lesson");
  const quizReplay = required(document.querySelector<HTMLButtonElement>("#quiz-replay"), "#quiz-replay");
  let quiz: QuizResponse | null = null;
  let quizIndex = 0;
  let quizScore = 0;
  let questionAnswered = false;
  let missedQuestions: QuizResponse["questions"] = [];
  let prefetchedQuiz: { topicId: string; response: QuizResponse | null; failure: string | null } | null = null;
  let nextLesson: CatalogEntry | null = null;

  const isQuizResponse = (value: unknown): value is QuizResponse => {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<QuizResponse>;
    return typeof candidate.topic_id === "string"
      && typeof candidate.model_used === "string"
      && typeof candidate.repairs_used === "number"
      && Array.isArray(candidate.questions)
      && candidate.questions.length > 0
      && candidate.questions.every((question) =>
        typeof question === "object"
        && question !== null
        && typeof question.question === "string"
        && Array.isArray(question.options)
        && question.options.length >= 2
        && question.options.every((option) => typeof option === "string")
        && Number.isInteger(question.correct_index)
        && question.correct_index >= 0
        && question.correct_index < question.options.length
        && typeof question.explanation === "string"
        && (question.seek === undefined || (typeof question.seek === "number" && Number.isFinite(question.seek) && question.seek >= 0)));
  };

  const questionId = (question: QuizResponse["questions"][number]): string => {
    if (question.id) return question.id;
    let hash = 2166136261;
    for (const character of question.question) {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    }
    return `api:${(hash >>> 0).toString(16)}`;
  };

  const sceneForQuestion = (question: string): NonNullable<QuizResponse["questions"][number]["scene"]> => {
    if (/update|updated|learning rate/i.test(question)) return "weight_update";
    if (/sigmoid/i.test(question)) return "sigmoid_curve";
    if (/fire|threshold|step rule|output/i.test(question)) return "gate_fire";
    return "sum_node";
  };

  const previousQuestionIds = (topicId: string): string[] => {
    try {
      const stored = localStorage.getItem(`quiz-question-ids:${topicId}`);
      if (!stored) return [];
      const value: unknown = JSON.parse(stored);
      if (!Array.isArray(value) || !value.every((id) => typeof id === "string")) {
        throw new Error(`Stored previous quiz ids for "${topicId}" are invalid`);
      }
      return value;
    } catch (error) {
      console.warn(`Could not read previous quiz ids: ${String(error)}`);
      return [];
    }
  };

  const fetchQuiz = async (topicId: string): Promise<QuizResponse> => {
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
    return generated;
  };

  const startQuizPrefetch = (topicId: string): void => {
    const request = { topicId, response: null as QuizResponse | null, failure: null as string | null };
    prefetchedQuiz = request;
    void fetchQuiz(topicId).then((response) => {
      request.response = response;
    }).catch((error: unknown) => {
      request.failure = error instanceof Error ? error.message : String(error);
      console.warn(`Quiz prefetch failed for "${topicId}": ${request.failure}`);
    });
  };

  const shuffleQuestionOptions = (
    question: QuizResponse["questions"][number],
  ): QuizResponse["questions"][number] => {
    const correct = question.options[question.correct_index];
    if (correct === undefined) throw new Error("Quiz question has no correct option");
    const options = [...question.options];
    for (let index = options.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [options[index], options[swap]] = [options[swap]!, options[index]!];
    }
    return { ...question, options, correct_index: options.indexOf(correct) };
  };

  const shuffleQuizQuestions = (
    questions: QuizResponse["questions"],
  ): QuizResponse["questions"] => {
    const shuffled = [...questions];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
    }
    return shuffled;
  };

  const findNextLesson = async (currentTopicId: string): Promise<CatalogEntry | null> => {
    const currentIndex = catalog.topics.findIndex((topic) => topic.id === currentTopicId);
    for (const entry of catalog.topics.slice(currentIndex + 1)) {
      if (!topicIsReady(entry)) continue;
      try {
        const topic = await loadTopic(entry);
        const audioUrl = new URL(topic.audio, window.location.href);
        if (audioUrl.pathname.toLowerCase().endsWith("/silence.wav")) continue;
        const response = await fetch(audioUrl, { method: "HEAD" });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) continue;
        const contentLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(contentLength) && contentLength <= 44) continue;
        return entry;
      } catch (error) {
        console.warn(`Could not verify audio for "${entry.id}": ${String(error)}`);
      }
    }
    return null;
  };

  const renderQuizQuestion = (): void => {
    if (!quiz) return;
    const activeQuiz = quiz;
    questionAnswered = false;
    quizOptions.replaceChildren();
    quizFeedback.textContent = "";
    quizNext.hidden = true;
    quizReplay.hidden = true;
    quizNextLesson.hidden = true;
    if (quizIndex >= activeQuiz.questions.length) {
      quizProgress.textContent = "";
      quizQuestion.textContent = "Lesson complete";
      quizResult.textContent = `Score: ${quizScore} / ${activeQuiz.questions.length}`;
      quizReview.replaceChildren();
      missedQuestions.forEach((missed) => {
        const row = document.createElement("div");
        row.className = "quiz-review-item";
        const label = document.createElement("p");
        label.textContent = missed.question;
        const rewatch = document.createElement("button");
        rewatch.type = "button";
        rewatch.className = "quiz-action quiz-secondary";
        rewatch.textContent = "Rewatch this part";
        rewatch.addEventListener("click", () => {
          quizScreen.hidden = true;
          playerSection.hidden = false;
          const started = missed.seek === undefined
            ? activeQuiz.topic_id === "activation_functions"
              ? player?.playAt(0)
              : player?.playScene(missed.scene ?? "sum_node")
            : player?.playAt(missed.seek);
          if (!started) {
            quizScreen.hidden = false;
            playerSection.hidden = true;
            quizResult.textContent = "This scene is unavailable for rewatch.";
          }
        });
        row.append(label, rewatch);
        quizReview.append(row);
      });
      quizNextLesson.hidden = false;
      quizNextLesson.disabled = true;
      quizNextLesson.textContent = "Next lesson";
      void findNextLesson(activeQuiz.topic_id).then((entry) => {
        nextLesson = entry;
        quizNextLesson.textContent = entry ? "Next lesson" : "More lessons coming soon";
        quizNextLesson.disabled = !entry;
      });
      quizReplay.hidden = false;
      return;
    }
    const current = activeQuiz.questions[quizIndex];
    if (!current) return;
    quizSource.textContent = current.source ?? "curated";
    quizReview.replaceChildren();
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
        else missedQuestions.push(current);
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
  quizNextLesson.addEventListener("click", () => {
    if (!nextLesson) return;
    topicPicker.value = nextLesson.id;
    void chooseTopic(nextLesson.id);
  });
  quizReplay.addEventListener("click", () => {
    quizScreen.hidden = true;
    playerSection.hidden = false;
    player?.replay();
  });

  const showQuiz = async (topicId: string): Promise<void> => {
    playerSection.hidden = true;
    quizScreen.hidden = false;
    quizSource.textContent = "Preparing quiz…";
    quizProgress.textContent = "";
    quizQuestion.textContent = "";
    quizOptions.replaceChildren();
    quizFeedback.textContent = "";
    quizResult.textContent = "";
    quizReview.replaceChildren();
    quizNext.hidden = true;
    quizNextLesson.hidden = true;
    quizReplay.hidden = true;
    nextLesson = null;

    const excluded = previousQuestionIds(topicId);
    const prefetched = prefetchedQuiz?.topicId === topicId ? prefetchedQuiz.response : null;
    const apiSource = prefetched && prefetched.model_used !== "fallback" && prefetched.model_used !== "curated"
      ? "AI-generated" as const
      : "curated" as const;
    const generatedQuestions = topicId === "perceptron"
      ? generateQuestions(Math.random, 3, excluded)
      : topicId === "activation_functions"
        ? generateActivationQuestions(Math.random, 3, excluded)
        : [];
    const selected: QuizResponse["questions"] = generatedQuestions.map((question) => ({
      ...question,
      source: "generated by code",
    }));
    const selectedIds = new Set([...excluded, ...selected.map((question) => question.id ?? "")]);
    const addFreshQuestions = (
      questions: QuizResponse["questions"],
      source: "AI-generated" | "curated",
      limit: number,
    ): void => {
      for (const question of questions) {
        const id = questionId(question);
        if (selected.length >= 5 || selected.filter((item) => item.source === source).length >= limit) break;
        if (selectedIds.has(id)) continue;
        selectedIds.add(id);
        selected.push({
          ...question,
          id,
          source,
          scene: question.scene ?? sceneForQuestion(question.question),
        });
      }
    };
    if (prefetched) {
      const apiQuestions = topicId === "activation_functions"
        ? prefetched.questions.filter((question) =>
          question.options.length >= 3
          && !/[a-z]z\s?=/i.test(question.question)
          && !/[a-z]{3,}(output|input)\b/i.test(question.question))
        : prefetched.questions;
      addFreshQuestions(apiQuestions, apiSource, topicId === "perceptron" || topicId === "activation_functions" ? 2 : 5);
    }

    if (selected.length < 5) {
      try {
        const response = await fetch(`/quizzes/${encodeURIComponent(topicId)}.json`);
        if (!response.ok) throw new Error(`Curated quiz unavailable (${response.status})`);
        const curated: unknown = await response.json();
        if (!isQuizResponse(curated) || curated.topic_id !== topicId) {
          throw new Error("Curated quiz has an invalid format");
        }
        const questions = topicId === "activation_functions"
          ? shuffleQuizQuestions(curated.questions)
          : curated.questions;
        addFreshQuestions(questions, "curated", 5);
      } catch (error) {
        console.warn(`Could not load curated quiz for "${topicId}": ${String(error)}`);
      }
    }
    if (selected.length < 5 && topicId === "perceptron") {
      const fillers = generateQuestions(Math.random, 5 - selected.length, [...selectedIds]);
      selected.push(...fillers.map((question) => ({
        ...question,
        source: "generated by code" as const,
      })));
    }
    if (selected.length < 5) {
      quiz = null;
      quizSource.textContent = "Quiz unavailable";
      quizResult.textContent = "Could not assemble five unused questions for this lesson.";
      quizReplay.hidden = false;
      return;
    }
    const questions = selected.slice(0, 5).map(shuffleQuestionOptions);
    try {
      localStorage.setItem(
        `quiz-question-ids:${topicId}`,
        JSON.stringify(questions.map((question) => question.id).filter((id): id is string => Boolean(id))),
      );
    } catch (error) {
      console.warn(`Could not save previous quiz ids: ${String(error)}`);
    }
    quiz = {
      topic_id: topicId,
      questions,
      model_used: "mixed",
      repairs_used: 0,
    };
    quizIndex = 0;
    quizScore = 0;
    missedQuestions = [];
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
      player = new Player(
        resolvePlayerElements(),
        topic,
        initialTime,
        () => void showQuiz(entry.id),
        () => startQuizPrefetch(entry.id),
      );
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
      player = new Player(
        resolvePlayerElements(),
        topic,
        0,
        () => void showQuiz(entry.id),
        () => startQuizPrefetch(entry.id),
      );
      topicStatus.textContent = `${topic.field} · ${topic.title}`;
      songMeta.textContent = `Generated by ${generated.model_used} after ${generated.repairs_used} repairs`;
      songMeta.hidden = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      topicStatus.textContent = `Song generation failed: ${message}. Loading the local topic fallback.`;
      try {
        const fallbackTopic = await loadTopic(entry);
        player?.destroy();
        player = new Player(
          resolvePlayerElements(),
          fallbackTopic,
          0,
          () => void showQuiz(entry.id),
          () => startQuizPrefetch(entry.id),
        );
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
