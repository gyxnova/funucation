import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

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
const server = await createServer({
  configFile: path.join(webRoot, "vite.config.ts"),
  root: webRoot,
  server: { host: "127.0.0.1", port: 0 },
});
const browser = await chromium.launch({ headless: true });

try {
  await mkdir(stillsDirectory, { recursive: true });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Could not determine the temporary Vite port");

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.goto(
    `http://127.0.0.1:${address.port}/?topic=${encodeURIComponent(topic)}&t=${seconds}&paused=1&clean=1`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForFunction(() => window.__ready === true, { timeout: 20_000 });
  await page.waitForTimeout(100);
  if (pageErrors.length > 0) throw new Error(`Page failed: ${pageErrors.map((error) => error.message).join("; ")}`);

  const canvas = page.locator("#lesson-canvas");
  const bounds = await canvas.boundingBox();
  if (bounds?.width !== 1920 || bounds.height !== 1080) {
    throw new Error(`Canvas should render at 1920x1080; got ${bounds?.width}x${bounds?.height}`);
  }
  await canvas.screenshot({ path: outputPath });
  console.log(`Saved still: ${outputPath}`);
} finally {
  await browser.close();
  await server.close();
}
