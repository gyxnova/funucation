import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createStillRenderer } from "./still-renderer.mjs";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const topic = process.argv[2] ?? "perceptron";
const topicData = JSON.parse(
  await readFile(new URL(`../public/topics/${topic}.json`, import.meta.url), "utf8"),
);
const samples = [0.01, 0.25, 0.5, 0.75, 0.99];

function findTextBoxOverlaps(boxes) {
  const overlaps = [];
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first];
      const b = boxes[second];
      if (
        a.left < b.right &&
        a.right > b.left &&
        a.top < b.bottom &&
        a.bottom > b.top
      ) {
        overlaps.push([a, b]);
      }
    }
  }
  return overlaps;
}

const renderer = await createStillRenderer(topic);
const failures = [];

try {
  for (const [sceneIndex, scene] of topicData.scenes.entries()) {
    for (const fraction of samples) {
      const seconds = scene.start + (scene.end - scene.start) * fraction;
      const boxes = await renderer.captureTextBoxes(seconds);
      for (const [first, second] of findTextBoxOverlaps(boxes)) {
        failures.push({ sceneIndex, template: scene.template, seconds, first, second });
      }
    }
  }
} finally {
  await renderer.close();
}

if (failures.length > 0) {
  for (const { sceneIndex, template, seconds, first, second } of failures) {
    console.error(
      `Text overlap in scene ${sceneIndex} (${template}) at t=${seconds.toFixed(2)}: `
      + `"${first.text}" overlaps "${second.text}"`,
    );
  }
  throw new Error(`Found ${failures.length} overlapping text-box pair(s)`);
}

console.log(`No text overlaps in ${topicData.scenes.length} scenes at ${samples.length} samples each.`);
