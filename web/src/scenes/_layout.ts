import type { Frame } from "../engine/engine";
import {
  PALETTE,
  drawBoldText,
  drawHairline,
  drawMonoLabel,
  drawPlasticCircle,
  minimumTextSize,
} from "../engine/style";

export const PERCEPTRON = {
  inputs: [
    { x: 250, y: 360, radius: 64, label: "x1", value: 1, weight: 0.5 },
    { x: 250, y: 540, radius: 64, label: "x2", value: 0, weight: -1 },
    { x: 250, y: 720, radius: 64, label: "x3", value: 1, weight: 2 },
  ],
  sum: { x: 900, y: 500, radius: 74, value: 2.5 },
  bias: { x: 900, y: 820, radius: 60, value: -1 },
  gate: { x: 1390, y: 500, width: 190, height: 300, boundary: 0 },
  output: { x: 1770, y: 500, radius: 64, value: 1 },
  weightedSum: "0.5 + 0 + 2 = 2.5",
  total: 1.5,
} as const;

export function drawSceneHairline(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

export function drawSceneLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  context.save();
  const effectiveSize = minimumTextSize(text, size);
  context.font = `500 ${effectiveSize}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, x, y);
  context.restore();
}

export function drawCenteredTextRuns(
  context: CanvasRenderingContext2D,
  runs: readonly { text: string; size: number; color: string }[],
  x: number,
  y: number,
): void {
  const widths = runs.map(({ text, size }) => {
    context.font = `500 ${minimumTextSize(text, size)}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
    return context.measureText(text).width;
  });
  let cursor = x - widths.reduce((total, width) => total + width, 0) / 2;
  runs.forEach(({ text, size, color }, index) => {
    const effectiveSize = minimumTextSize(text, size);
    context.save();
    context.font = `500 ${effectiveSize}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.fillText(text, cursor, y);
    context.restore();
    cursor += widths[index] ?? 0;
  });
}

export function drawInputBuses(context: CanvasRenderingContext2D, nodes = PERCEPTRON.inputs): void {
  nodes.forEach((input) => {
    drawHairline(
      context,
      input.x + input.radius,
      input.y,
      PERCEPTRON.sum.x - PERCEPTRON.sum.radius,
      PERCEPTRON.sum.y,
      PALETTE.bone,
      2,
    );
  });
}

export function drawDataInputs(
  context: CanvasRenderingContext2D,
  frame: Frame,
  bounce = false,
): void {
  PERCEPTRON.inputs.forEach((input, index) => {
    const phase = (frame.beatPhase + index / PERCEPTRON.inputs.length) % 1;
    const pulse = bounce ? Math.sin(phase * Math.PI * 2) * 0.05 : 0;
    const lift = bounce ? Math.max(0, Math.sin(phase * Math.PI)) * 20 : 0;
    context.save();
    context.translate(input.x, input.y - lift);
    context.scale(1 + pulse, 1 - pulse);
    drawPlasticCircle(context, 0, 0, input.radius, index === 0 ? PALETTE.signal : PALETTE.ember);
    context.restore();
    drawBoldText(context, input.label, input.x, input.y - input.radius - lift - 24, 28, PALETTE.bone);
    drawMonoLabel(context, String(input.value), input.x, input.y - lift + 22, 40, PALETTE.bone);
  });
}

export function drawSumNode(
  context: CanvasRenderingContext2D,
  scale = 1,
  label = true,
): void {
  context.save();
  context.translate(PERCEPTRON.sum.x, PERCEPTRON.sum.y);
  context.scale(scale, scale);
  context.strokeStyle = PALETTE.bone;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, PERCEPTRON.sum.radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
  drawMonoLabel(
    context,
    "Σ",
    PERCEPTRON.sum.x,
    PERCEPTRON.sum.y,
    48 * scale,
    PALETTE.bone,
  );
  if (label) {
    drawMonoLabel(context, "sum", PERCEPTRON.sum.x, PERCEPTRON.sum.y + 108, 28, PALETTE.graphite);
  }
}

export function drawMainBus(context: CanvasRenderingContext2D): void {
  drawHairline(
    context,
    PERCEPTRON.sum.x + PERCEPTRON.sum.radius,
    PERCEPTRON.sum.y,
    PERCEPTRON.gate.x - PERCEPTRON.gate.width / 2,
    PERCEPTRON.sum.y,
    PALETTE.bone,
    2,
  );
  drawHairline(
    context,
    PERCEPTRON.gate.x + PERCEPTRON.gate.width / 2,
    PERCEPTRON.sum.y,
    PERCEPTRON.output.x - PERCEPTRON.output.radius,
    PERCEPTRON.output.y,
    PALETTE.bone,
    2,
  );
}

export function drawGateStructure(context: CanvasRenderingContext2D): void {
  const { x, y, width, height } = PERCEPTRON.gate;
  context.save();
  context.strokeStyle = PALETTE.bone;
  context.lineWidth = 2;
  context.strokeRect(x - width / 2, y - height / 2, width, height);
  context.restore();
  drawMonoLabel(context, "z >= 0", x, y - height / 2 + 32, 28, PALETTE.bone);
}

export function drawOutput(context: CanvasRenderingContext2D, label = true): void {
  drawPlasticCircle(context, PERCEPTRON.output.x, PERCEPTRON.output.y, PERCEPTRON.output.radius, PALETTE.signal);
  drawMonoLabel(
    context,
    String(PERCEPTRON.output.value),
    PERCEPTRON.output.x,
    PERCEPTRON.output.y,
    40,
    PALETTE.bone,
  );
  if (label) {
    drawMonoLabel(context, "output", PERCEPTRON.output.x, PERCEPTRON.output.y + 100, 28, PALETTE.graphite);
  }
}
