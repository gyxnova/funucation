import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle } from "../engine/style";
import {
  drawDataInputs,
  drawInputBuses,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
  drawOutput,
  PERCEPTRON,
} from "./_layout";

function smoothstep(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export const gateFire: SceneTemplate = (context, frame: Frame) => {
  drawInputBuses(context);
  drawDataInputs(context, frame);
  drawSumNode(context, 1, false);

  const { x, y, width, height } = PERCEPTRON.gate;
  const left = x - width / 2;
  const top = y - height / 2;
  const graphLeft = left - 38;
  const graphRight = x + width / 2 + 38;
  const graphTop = top + 36;
  const graphBottom = y + 70;
  const zMin = -2;
  const zMax = 3;
  const xAt = (z: number): number => graphLeft + ((z - zMin) / (zMax - zMin)) * (graphRight - graphLeft);
  const yOne = graphTop + 34;
  const yZero = graphBottom - 18;
  const zeroX = xAt(0);
  const zX = xAt(PERCEPTRON.total);
  const firing = PERCEPTRON.total >= 0;
  const flashing = firing && frame.beatPhase > 0.78;
  const graphColor = flashing ? PALETTE.ember : PALETTE.bone;

  drawSceneHairline(context, PERCEPTRON.sum.x + PERCEPTRON.sum.radius, y, graphLeft, y, PALETTE.bone, 2);
  drawSceneHairline(context, graphLeft, yZero, graphRight, yZero, PALETTE.graphite, 2);
  drawSceneHairline(context, graphLeft, graphTop, graphLeft, yZero, PALETTE.graphite, 2);
  drawSceneHairline(context, zeroX, graphTop, zeroX, yZero, PALETTE.ember, 2);
  drawSceneHairline(context, graphLeft, yZero - 12, zeroX, yZero - 12, graphColor, 3);
  drawSceneHairline(context, zeroX, yZero - 12, zeroX, yOne, graphColor, 3);
  drawSceneHairline(context, zeroX, yOne, graphRight, yOne, graphColor, 3);
  drawSceneLabel(context, "STEP", x, graphTop - 18, 28, PALETTE.graphite);
  drawSceneLabel(context, "0", zeroX, yZero + 28, 40, PALETTE.bone);
  drawSceneLabel(context, "1", graphLeft - 28, yOne, 40, PALETTE.bone);
  drawSceneLabel(context, "z = 1.5", zX, yZero + 78, 40, PALETTE.signal);

  const progress = smoothstep(frame.p);
  const ballX = PERCEPTRON.sum.x + PERCEPTRON.sum.radius
    + (PERCEPTRON.output.x - PERCEPTRON.sum.x - PERCEPTRON.sum.radius - PERCEPTRON.output.radius) * progress;
  drawPlasticCircle(context, ballX, y, 22, PALETTE.signal);
  drawSceneHairline(
    context,
    graphRight,
    y,
    PERCEPTRON.output.x - PERCEPTRON.output.radius,
    y,
    PALETTE.bone,
    2,
  );
  drawOutput(context);
  drawSceneLabel(context, "output = 1 if z >= 0 else 0", 960, 840, 40, PALETTE.bone);
};
