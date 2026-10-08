import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const webRoot = fileURLToPath(new URL("../", import.meta.url));

export async function createStillRenderer(topic) {
  const server = await createServer({
    configFile: path.join(webRoot, "vite.config.ts"),
    root: webRoot,
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    await server.close();
    throw error;
  }

  return {
    async capture(seconds) {
      const address = server.httpServer?.address();
      if (!address || typeof address === "string") {
        throw new Error("Could not determine the temporary Vite port");
      }

      const page = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
      });
      try {
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error));
        const query = new URLSearchParams({
          topic,
          t: String(seconds),
          paused: "1",
          clean: "1",
          mute: "1",
        });
        await page.goto(`http://127.0.0.1:${address.port}/?${query}`, {
          waitUntil: "domcontentloaded",
        });
        await page.waitForFunction(() => window.__ready === true, { timeout: 20_000 });
        await page.waitForTimeout(100);
        if (pageErrors.length > 0) {
          throw new Error(`Page failed: ${pageErrors.map((error) => error.message).join("; ")}`);
        }

        const canvas = page.locator("#lesson-canvas");
        const bounds = await canvas.boundingBox();
        if (bounds?.width !== 1920 || bounds.height !== 1080) {
          throw new Error(`Canvas should render at 1920x1080; got ${bounds?.width}x${bounds?.height}`);
        }
        return await canvas.screenshot();
      } finally {
        await page.close();
      }
    },

    async saveContactSheet(cells, outputPath) {
      const columns = 4;
      const cellWidth = 480;
      const imageHeight = 270;
      const labelHeight = 36;
      const rows = Math.ceil(cells.length / columns);
      const page = await browser.newPage({
        viewport: { width: columns * cellWidth, height: rows * (imageHeight + labelHeight) },
        deviceScaleFactor: 1,
      });
      try {
        await page.setContent(
          `<canvas id="sheet" width="${columns * cellWidth}" height="${rows * (imageHeight + labelHeight)}"></canvas>`,
        );
        await page.evaluate(async ({ cells, columns, cellWidth, imageHeight, labelHeight }) => {
          const canvas = document.querySelector("#sheet");
          if (!(canvas instanceof HTMLCanvasElement)) throw new Error("Contact sheet canvas is missing");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not create the contact sheet canvas context");

          context.fillStyle = "#0A0A0A";
          context.fillRect(0, 0, canvas.width, canvas.height);
          for (const [index, cell] of cells.entries()) {
            const image = new Image();
            image.src = `data:image/png;base64,${cell.image}`;
            await new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = () => reject(new Error(`Could not load still for ${cell.label}`));
            });
            const x = (index % columns) * cellWidth;
            const y = Math.floor(index / columns) * (imageHeight + labelHeight);
            context.fillStyle = "#151517";
            context.fillRect(x, y, cellWidth, labelHeight);
            context.fillStyle = "#EEE9DF";
            context.font = 'bold 20px ui-monospace, "Cascadia Mono", monospace';
            context.textBaseline = "middle";
            context.fillText(cell.label, x + 12, y + labelHeight / 2);
            context.drawImage(image, x, y + labelHeight, cellWidth, imageHeight);
          }
        }, {
          cells: cells.map(({ image, label }) => ({
            image: image.toString("base64"),
            label,
          })),
          columns,
          cellWidth,
          imageHeight,
          labelHeight,
        });
        await page.locator("#sheet").screenshot({ path: outputPath });
      } finally {
        await page.close();
      }
    },

    async close() {
      await browser.close();
      await server.close();
    },
  };
}
