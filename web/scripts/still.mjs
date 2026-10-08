import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStillRenderer } from "./still-renderer.mjs";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const topic = process.argv[2];
const seconds = Number(process.argv[3]);

if (!topic || !/^[a-zA-Z0-9_-]+$/.test(topic)) {
  throw new Error("Usage: npm run still -- <topic> <seconds>");
}
if (!Number.isFinite(seconds) || seconds < 0) {
  throw new Error("The still time must be a non-negative number of seconds");
}

const stillsDirectory = path.join(webRoot, "stills");
const outputPath = path.join(stillsDirectory, `${topic}-${process.argv[3]}.png`);
const renderer = await createStillRenderer(topic);

try {
  await mkdir(stillsDirectory, { recursive: true });
  const image = await renderer.capture(seconds);
  await writeFile(outputPath, image);
  console.log(`Saved still: ${outputPath}`);
} finally {
  await renderer.close();
}
