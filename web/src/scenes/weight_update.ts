import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle, minimumTextSize } from "../engine/style";
import {
  drawDataInputs,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

const UPDATED_WEIGHTS = [-0.5, -1, 1] as const;
const UPDATED_BIAS = -2;

function drawUpdateLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: "center" | "left" = "center",
): void {
  const effectiveSize = minimumTextSize(text, size);
  context.save();
  context.font = `500 ${effectiveSize}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  const width = context.measureText(text).width;
  context.fillStyle = PALETTE.ink;
  const left = align === "center" ? x - width / 2 : x;
  context.fillRect(left - 6, y - effectiveSize / 2 - 4, width + 12, effectiveSize + 8);
  context.restore();
  drawSceneLabel(context, text, align === "center" ? x : x + width / 2, y, effectiveSize, color);
}

export const weightUpdate: SceneTemplate = (context, frame: Frame, params) => {
  const finalState = params.final_state === true;
  const progress = finalState || frame.sceneLineIndex >= 2
    ? 1
    : frame.sceneLineIndex === 1 ? Math.min(1, Math.max(0, frame.lineProgress)) : 0;
  const currentBias = PERCEPTRON.bias.value + (UPDATED_BIAS - PERCEPTRON.bias.value) * progress;
  const weights = PERCEPTRON.inputs.map((input, index) =>
    input.weight + ((UPDATED_WEIGHTS[index] ?? input.weight) - input.weight) * progress);

  if (frame.sceneLineIndex >= 0 || finalState) {
    drawSceneLabel(context, "target 0, got 1, error -1, lr 1", 960, 120, 40, PALETTE.ember);
  }
  PERCEPTRON.inputs.forEach((input, index) => {
    const startX = input.x + input.radius;
    const startY = input.y;
    const endX = PERCEPTRON.sum.x - PERCEPTRON.sum.radius;
    const endY = PERCEPTRON.sum.y;
    const weight = weights[index] ?? input.weight;

    drawSceneHairline(
      context,
      startX,
      startY,
      endX,
      endY,
      weight < 0 ? PALETTE.dim : PALETTE.bone,
      1.5 + Math.abs(weight) * 2.2,
    );
    if ((frame.sceneLineIndex >= 1 || finalState) && (index === 0 || index === 2)) {
      const labelY = index === 0 ? 270 : 720;
      drawUpdateLabel(context, `w${index + 1}: ${input.weight} -> ${UPDATED_WEIGHTS[index]}`, 670, labelY, 40, PALETTE.bone);
      drawUpdateLabel(context, "w = w + lr*error*x", 670, labelY + 42, 28, PALETTE.graphite);
    }
    if ((frame.sceneLineIndex >= 3 || finalState) && index === 1) {
      drawUpdateLabel(context, "w2 unchanged (x2 = 0)", 650, 390, 40, PALETTE.graphite);
    }
  });
  if (frame.sceneLineIndex >= 2 || finalState) {
    PERCEPTRON.inputs.forEach((input, index) => {
      if (index !== 0 && index !== 2) return;
      context.save();
      context.strokeStyle = PALETTE.signal;
      context.lineWidth = 5;
      context.beginPath();
      context.arc(input.x, input.y, input.radius + 12, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    });
    drawSceneLabel(context, "active inputs: x1, x3", 960, 170, 40, PALETTE.signal);
  }
  drawDataInputs(context, frame);
  drawSumNode(context, 1, false);

  const bias = PERCEPTRON.bias;
  const biasTop = bias.y - bias.radius;
  drawSceneHairline(context, bias.x, PERCEPTRON.sum.y + PERCEPTRON.sum.radius, bias.x, biasTop, PALETTE.dim, 2);
  context.save();
  context.strokeStyle = PALETTE.graphite;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(bias.x, bias.y, bias.radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
  drawSceneLabel(context, "bias", bias.x, bias.y - 14, 28, PALETTE.bone);
  drawSceneLabel(context, String(Number(currentBias.toFixed(1))), bias.x, bias.y + 20, 40, PALETTE.signal);
  if (frame.sceneLineIndex >= 1) {
    drawUpdateLabel(context, "b update", 1000, bias.y - 56, 28, PALETTE.graphite, "left");
    drawUpdateLabel(context, "-1 -> -2", 1000, bias.y - 18, 40, PALETTE.bone, "left");
    drawUpdateLabel(context, "b = b + lr*error", 1000, bias.y + 24, 28, PALETTE.graphite, "left");
  }

  const gate = PERCEPTRON.gate;
  const left = gate.x - gate.width / 2;
  const top = gate.y - gate.height / 2;
  const right = gate.x + gate.width / 2;
  const bottom = gate.y + gate.height / 2;
  drawSceneHairline(context, PERCEPTRON.sum.x + PERCEPTRON.sum.radius, PERCEPTRON.sum.y, left, PERCEPTRON.sum.y, PALETTE.bone, 2);
  drawSceneHairline(context, left, top, right, top, PALETTE.dim, 2);
  drawSceneHairline(context, right, top, right, bottom, PALETTE.dim, 2);
  drawSceneHairline(context, right, bottom, left, bottom, PALETTE.dim, 2);
  drawSceneHairline(context, left, bottom, left, top, PALETTE.dim, 2);
  drawSceneLabel(context, "z >= 0", gate.x, top + 36, 28, PALETTE.graphite);
  drawSceneLabel(context, "NO FIRE", gate.x, gate.y, 28, PALETTE.graphite);
  drawSceneHairline(context, right, gate.y, PERCEPTRON.output.x - PERCEPTRON.output.radius, gate.y, PALETTE.dim, 2);
  drawPlasticCircle(context, PERCEPTRON.output.x, PERCEPTRON.output.y, PERCEPTRON.output.radius, PALETTE.dim);
  drawSceneLabel(context, "0", PERCEPTRON.output.x, PERCEPTRON.output.y, 40, PALETTE.bone);
  drawSceneLabel(context, "output", PERCEPTRON.output.x, PERCEPTRON.output.y + 100, 28, PALETTE.graphite);

  const updatedWeightedSum = UPDATED_WEIGHTS[0] * PERCEPTRON.inputs[0].value
    + UPDATED_WEIGHTS[1] * PERCEPTRON.inputs[1].value
    + UPDATED_WEIGHTS[2] * PERCEPTRON.inputs[2].value;
  const updatedTotal = updatedWeightedSum + UPDATED_BIAS;
  if (frame.sceneLineIndex >= 3 || finalState) {
    drawSceneLabel(context, "weighted sum = -0.5 + 0 + 1 = 0.5", 960, 930, 40, PALETTE.bone);
    drawSceneLabel(context, "z = 0.5 + (-2) = -1.5 -> no fire", 960, 988, 40, PALETTE.signal);
    drawSceneLabel(context, `sigmoid reads ${(1 / (1 + Math.exp(-updatedTotal))).toFixed(2)}`, 960, 1042, 40, PALETTE.graphite);
  }
};
