import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStillRenderer } from "./still-renderer.mjs";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const topic = process.argv[2];
const stepSeconds = process.argv[3] === undefined ? 2 : Number(process.argv[3]);

if (!topic || !/^[a-zA-Z0-9_-]+$/.test(topic)) {
  throw new Error("Usage: npm run sheet -- <topic> [stepSeconds=2]");
}
if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
  throw new Error("stepSeconds must be a positive number");
}

const topicPath = path.join(webRoot, "public", "topics", `${topic}.json`);
const topicData = JSON.parse(await readFile(topicPath, "utf8"));
const scenes = topicData.scenes ?? topicData.lyrics.reduce((entries, line) => {
  if (!line.scene) throw new Error(`Topic "${topic}" has a lyric without a scene reference`);
  const previous = entries.at(-1);
  if (previous?.template === line.scene && previous.end === line.start) {
    previous.end = line.end;
  } else {
    entries.push({ template: line.scene, start: line.start, end: line.end });
  }
  return entries;
}, []);
const duration = Math.max(
  ...scenes.map((scene) => scene.end),
  ...topicData.lyrics.map((line) => line.end),
);
const times = [];
for (let seconds = 0; seconds < duration; seconds += stepSeconds) {
  times.push(seconds);
}
if (times.length === 0 || duration - (times[times.length - 1] ?? 0) > 0.001) {
  times.push(Math.max(0, duration - 0.001));
}

const sceneAt = (seconds) =>
  scenes.find((scene) => scene.start <= seconds && seconds < scene.end)?.template ?? "no_scene";
const outputPath = path.join(webRoot, "stills", `${topic}-sheet.png`);
const renderer = await createStillRenderer(topic);

try {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const cells = [];
  for (const seconds of times) {
    const image = await renderer.capture(seconds);
    cells.push({
      image,
      label: `t=${seconds.toFixed(1)}s ${sceneAt(seconds)}`,
    });
  }
  await renderer.saveContactSheet(cells, outputPath);
  console.log(`Saved contact sheet: ${outputPath}`);
} finally {
  await renderer.close();
}
