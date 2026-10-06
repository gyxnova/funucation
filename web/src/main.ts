import "./style.css";
import { Player } from "./player";
import type { Catalog, CatalogEntry, GeneratedSong, Topic } from "./types";

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
  audio: new Audio(),
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
};

function required<T>(element: T | null, selector: string): T {
  if (!element) throw new Error(`Missing required page element: ${selector}`);
  return element;
}

function resolvePlayerElements(): ConstructorParameters<typeof Player>[0] {
  return {
    canvas: required(playerElements.canvas, "#lesson-canvas"),
    audio: playerElements.audio,
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
  };
}

function topicFile(entry: CatalogEntry): string {
  return entry.file ?? `/topics/${entry.id}.json`;
}

async function loadTopic(entry: CatalogEntry): Promise<Topic> {
  const response = await fetch(topicFile(entry));
  if (!response.ok) throw new Error(`Could not load topic "${entry.id}" (${response.status})`);
  return response.json() as Promise<Topic>;
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
  const chooseTopic = async (topicId: string, initialTime = 0, autoPlay = false): Promise<void> => {
    const entry = readyTopics.find((topic) => topic.id === topicId);
    if (!entry) return;
    selectedEntry = entry;
    songMeta.hidden = true;
    topicStatus.textContent = `Loading ${entry.title}…`;
    try {
      const topic = await loadTopic(entry);
      player?.destroy();
      player = new Player(resolvePlayerElements(), topic, initialTime, autoPlay);
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
      player = new Player(resolvePlayerElements(), topic);
      topicStatus.textContent = `${topic.field} · ${topic.title}`;
      songMeta.textContent = `Generated by ${generated.model_used} after ${generated.repairs_used} repairs`;
      songMeta.hidden = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      topicStatus.textContent = `Song generation failed: ${message}. Loading the local topic fallback.`;
      try {
        const fallbackTopic = await loadTopic(entry);
        player?.destroy();
        player = new Player(resolvePlayerElements(), fallbackTopic);
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
  const autoPlay = query.has("paused") && query.get("paused") !== "1";
  await chooseTopic(selectedTopic.id, requestedTime, autoPlay);
  window.__ready = true;
}

void start().catch((error: unknown) => {
  const topicStatus = required(status, "#topic-status");
  topicStatus.textContent = `Unable to start the lesson player: ${String(error)}`;
});
