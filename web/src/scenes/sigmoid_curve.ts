import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle } from "../engine/style";
import { drawSceneHairline, drawSceneLabel } from "./_layout";

const GRAPH = { left: 520, right: 1400, top: 360, bottom: 740 };
const Z_MIN = -4;
const Z_MAX = 4;

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function xAt(z: number): number {
  return GRAPH.left + ((z - Z_MIN) / (Z_MAX - Z_MIN)) * (GRAPH.right - GRAPH.left);
}

function yAt(output: number): number {
  return GRAPH.bottom - output * (GRAPH.bottom - GRAPH.top);
}

function drawSigmoidLabel(context: CanvasRenderingContext2D): void {
  const prefix = "sigmoid: σ(z) = 1 / (1 + e";
  const suffix = ")";
  const mainFont = `500 30px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  const exponentFont = `500 20px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  context.save();
  context.font = mainFont;
  const prefixWidth = context.measureText(prefix).width;
  const suffixWidth = context.measureText(suffix).width;
  context.font = exponentFont;
  const exponentWidth = context.measureText("-z").width;
  const startX = 960 - (prefixWidth + exponentWidth + suffixWidth) / 2;
  context.fillStyle = PALETTE.bone;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.font = mainFont;
  context.fillText(prefix, startX, 180);
  context.font = exponentFont;
  context.fillText("-z", startX + prefixWidth, 165);
  context.font = mainFont;
  context.fillText(suffix, startX + prefixWidth + exponentWidth, 180);
  context.restore();
}

export const sigmoidCurve: SceneTemplate = (context, frame: Frame) => {
  const progress = Math.min(1, Math.max(0, frame.p));
  drawSigmoidLabel(context);

  drawSceneHairline(context, GRAPH.left, GRAPH.bottom, GRAPH.right, GRAPH.bottom, PALETTE.bone, 2);
  drawSceneHairline(context, GRAPH.left, GRAPH.top, GRAPH.left, GRAPH.bottom, PALETTE.bone, 2);
  drawSceneHairline(context, GRAPH.left, yAt(0.5), GRAPH.right, yAt(0.5), PALETTE.dim, 1);

  context.save();
  context.strokeStyle = PALETTE.signal;
  context.lineWidth = 4;
  context.lineCap = "round";
  context.beginPath();
  const samples = 80;
  for (let index = 0; index <= samples; index += 1) {
    const z = Z_MIN + ((Z_MAX - Z_MIN) * index) / samples;
    const x = xAt(z);
    const y = yAt(0.5 + (sigmoid(z) - 0.5) * progress);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
  context.restore();

  const z = 1.5;
  const output = sigmoid(z);
  const dotX = xAt(z);
  const dotY = yAt(0.5 + (output - 0.5) * progress);
  drawPlasticCircle(context, dotX, dotY, 14, PALETTE.signal);
  drawSceneLabel(context, "-4", xAt(-4), GRAPH.bottom + 42, 40, PALETTE.bone);
  drawSceneLabel(context, "0", xAt(0), GRAPH.bottom + 42, 40, PALETTE.bone);
  drawSceneLabel(context, "4", xAt(4), GRAPH.bottom + 42, 40, PALETTE.bone);
  drawSceneLabel(context, "z", GRAPH.right + 46, GRAPH.bottom + 42, 28, PALETTE.bone);
  drawSceneLabel(context, "1", GRAPH.left - 42, GRAPH.top, 40, PALETTE.bone);
  drawSceneLabel(context, "0", GRAPH.left - 42, GRAPH.bottom, 40, PALETTE.bone);
  drawSceneLabel(context, "1.5", dotX, GRAPH.bottom + 92, 40, PALETTE.ember);
  drawSceneLabel(context, "0.82", dotX + 94, dotY - 28, 40, PALETTE.bone);
  drawSceneLabel(context, "smooth version of the step, output between 0 and 1", 960, 940, 28, PALETTE.bone);
};
