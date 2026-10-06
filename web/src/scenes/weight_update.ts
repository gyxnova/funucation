import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle } from "../engine/style";
import {
  drawDataInputs,
  drawInputBuses,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

function formatWeight(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function drawUpdateLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  context.save();
  context.font = `500 ${size}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  const width = context.measureText(text).width;
  context.fillStyle = PALETTE.ink;
  context.fillRect(x - width / 2 - 6, y - size / 2 - 4, width + 12, size + 8);
  context.restore();
  drawSceneLabel(context, text, x, y, size, color);
}

export const weightUpdate: SceneTemplate = (context, frame: Frame) => {
  const progress = Math.min(1, Math.max(0, frame.p));
  const updatedWeights = [-0.5, PERCEPTRON.inputs[1].weight, 1];
  const currentWeights = PERCEPTRON.inputs.map((input, index) => {
    if (index === 0 || index === 2) {
      return input.weight + (updatedWeights[index]! - input.weight) * progress;
    }
    return input.weight;
  });

  drawInputBuses(context);
  PERCEPTRON.inputs.forEach((input, index) => {
    const lineX = input.x + input.radius;
    const lineY = input.y;
    const targetX = PERCEPTRON.sum.x - PERCEPTRON.sum.radius;
    const targetY = PERCEPTRON.sum.y;
    const weight = currentWeights[index]!;
    const negative = weight < 0;
    drawSceneHairline(
      context,
      lineX,
      lineY,
      targetX,
      targetY,
      negative ? PALETTE.dim : PALETTE.bone,
      1.5 + Math.abs(weight) * 2.2,
    );
    const labelX = lineX + (targetX - lineX) * 0.52;
    const labelY = lineY + (targetY - lineY) * 0.52;
    if (index === 1) {
      drawUpdateLabel(context, "x2 = 0, so no change", labelX, labelY - 34, 18, PALETTE.graphite);
    } else {
      const offset = index === 0 ? -48 : 48;
      drawUpdateLabel(
        context,
        `w${index + 1}: ${input.weight} -> ${updatedWeights[index]}`,
        labelX,
        labelY + offset,
        19,
        PALETTE.bone,
      );
      drawUpdateLabel(context, "w = w + lr*error*x", labelX, labelY + offset + (index === 0 ? 25 : 28), 15, PALETTE.graphite);
    }
  });

  drawDataInputs(context, frame);
  drawSumNode(context, 1, false);
  drawSceneLabel(context, "target 0, got 1, error = -1", 960, 150, 25, PALETTE.ember);

  const gate = PERCEPTRON.gate;
  const gateLeft = gate.x - gate.width / 2;
  const gateTop = gate.y - gate.height / 2;
  drawSceneHairline(
    context,
    PERCEPTRON.sum.x + PERCEPTRON.sum.radius,
    PERCEPTRON.sum.y,
    gateLeft,
    PERCEPTRON.sum.y,
    PALETTE.bone,
    2,
  );
  drawSceneHairline(
    context,
    gate.x - gate.width / 2,
    gate.y - gate.height / 2,
    gate.x + gate.width / 2,
    gate.y - gate.height / 2,
    PALETTE.dim,
    2,
  );
  drawSceneHairline(context, gateLeft, gateTop, gateLeft, gateTop + gate.height, PALETTE.dim, 2);
  drawSceneHairline(
    context,
    gate.x + gate.width / 2,
    gateTop,
    gate.x + gate.width / 2,
    gateTop + gate.height,
    PALETTE.dim,
    2,
  );
  drawSceneHairline(
    context,
    gateLeft,
    gateTop + gate.height,
    gate.x + gate.width / 2,
    gateTop + gate.height,
    PALETTE.dim,
    2,
  );
  drawSceneLabel(context, "θ = 1", gate.x, gateTop + 36, 18, PALETTE.graphite);
  drawSceneLabel(context, "NO FIRE", gate.x, gate.y, 20, PALETTE.graphite);
  drawSceneHairline(
    context,
    gate.x + gate.width / 2,
    gate.y,
    PERCEPTRON.output.x - PERCEPTRON.output.radius,
    PERCEPTRON.output.y,
    PALETTE.dim,
    2,
  );
  drawPlasticCircle(context, PERCEPTRON.output.x, PERCEPTRON.output.y, PERCEPTRON.output.radius, PALETTE.dim);
  drawSceneLabel(context, "0", PERCEPTRON.output.x, PERCEPTRON.output.y, 34, PALETTE.bone);
  drawSceneLabel(context, "output", PERCEPTRON.output.x, PERCEPTRON.output.y + 100, 20, PALETTE.graphite);

  const updatedSum = updatedWeights[0]! * PERCEPTRON.inputs[0].value
    + updatedWeights[1]! * PERCEPTRON.inputs[1].value
    + updatedWeights[2]! * PERCEPTRON.inputs[2].value;
  drawSceneLabel(context, "updated sum", PERCEPTRON.sum.x, PERCEPTRON.sum.y + 86, 18, PALETTE.graphite);
  drawSceneLabel(context, formatWeight(updatedSum), PERCEPTRON.sum.x, PERCEPTRON.sum.y + 112, 22, PALETTE.bone);
  drawSceneLabel(context, "-0.5 + 0 + 1 = 0.5 < 1: no fire", 960, 900, 25, PALETTE.bone);
};
