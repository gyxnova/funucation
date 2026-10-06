import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle } from "../engine/style";
import {
  drawDataInputs,
  drawInputBuses,
  drawMainBus,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
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
  drawMainBus(context);

  const gate = PERCEPTRON.gate;
  const left = gate.x - gate.width / 2;
  const top = gate.y - gate.height / 2;
  const right = gate.x + gate.width / 2;
  const bottom = gate.y + gate.height / 2;
  const progress = smoothstep(frame.p);
  const fires = PERCEPTRON.sum.value >= gate.threshold;
  const flash = fires && frame.beatPhase > 0.78;

  context.save();
  context.strokeStyle = flash ? PALETTE.ember : PALETTE.bone;
  context.lineWidth = 2;
  context.strokeRect(left, top, gate.width, gate.height);
  context.restore();

  const graphLeft = left + 24;
  const graphRight = right - 24;
  const graphTop = top + 38;
  const graphBottom = bottom - 38;
  const thresholdX = graphLeft + (gate.threshold / 3) * (graphRight - graphLeft);
  drawSceneHairline(context, graphLeft, graphBottom, graphRight, graphBottom, PALETTE.graphite, 1.5);
  drawSceneHairline(context, graphLeft, graphTop, graphLeft, graphBottom, PALETTE.graphite, 1.5);
  drawSceneHairline(context, thresholdX, graphTop, thresholdX, graphBottom, PALETTE.ember, 1.5);
  drawSceneHairline(context, graphLeft, graphBottom - 20, thresholdX, graphBottom - 20, PALETTE.bone, 2);
  drawSceneHairline(context, thresholdX, graphBottom - 20, thresholdX, graphTop, PALETTE.signal, 3);
  drawSceneHairline(context, thresholdX, graphTop, graphRight, graphTop, PALETTE.signal, 3);
  drawSceneLabel(context, `θ = ${gate.threshold}`, thresholdX, graphBottom + 20, 17, PALETTE.ember);
  drawSceneLabel(context, "STEP", gate.x, top - 20, 18, PALETTE.graphite);

  const startX = PERCEPTRON.sum.x + PERCEPTRON.sum.radius;
  const gateX = left;
  const outputX = PERCEPTRON.output.x;
  const crossing = Math.min(1, progress / 0.58);
  const afterGate = Math.max(0, (progress - 0.58) / 0.42);
  const ballX = progress < 0.58
    ? startX + (gateX - startX) * crossing
    : gate.x + (outputX - gate.x) * smoothstep(afterGate);
  if (progress < 0.58) {
    drawPlasticCircle(context, ballX, PERCEPTRON.sum.y, 24, PALETTE.signal);
  }
  drawSceneLabel(context, String(PERCEPTRON.sum.value), PERCEPTRON.sum.x, PERCEPTRON.sum.y + 112, 22, PALETTE.bone);

  if (progress > 0.58 && fires) {
    const outputProgress = smoothstep((progress - 0.58) / 0.42);
    const movingOutputX = gate.x + (outputX - gate.x) * outputProgress;
    drawPlasticCircle(context, movingOutputX, PERCEPTRON.output.y, 54, PALETTE.signal);
    drawSceneLabel(context, "1", movingOutputX, PERCEPTRON.output.y, 28, PALETTE.bone);
  }
};
