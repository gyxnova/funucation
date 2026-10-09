import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle } from "../engine/style";
import {
  drawDataInputs,
  drawGateStructure,
  drawInputBuses,
  drawMainBus,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

function passFrom(params: Record<string, unknown>): number {
  return typeof params.pass === "number" && Number.isInteger(params.pass) ? params.pass : 1;
}

export const recap: SceneTemplate = (context: CanvasRenderingContext2D, frame: Frame, params) => {
  const phase = frame.sceneLineIndex < 0 ? 3 : frame.sceneLineIndex % 4;
  const pass = passFrom(params) + (frame.sceneLineIndex < 0 ? 0 : Math.floor(frame.sceneLineIndex / 4));
  const active = PALETTE.signal;
  const quiet = PALETTE.graphite;

  drawInputBuses(context);
  drawDataInputs(context, frame);
  drawSumNode(context, 1, true);
  drawMainBus(context);
  drawGateStructure(context);
  if (phase === 0) {
    PERCEPTRON.inputs.forEach((input) => {
      drawSceneHairline(
        context,
        input.x + input.radius,
        input.y,
        PERCEPTRON.sum.x - PERCEPTRON.sum.radius,
        PERCEPTRON.sum.y,
        active,
        5,
      );
    });
  } else if (phase === 1) {
    drawSceneHairline(
      context,
      PERCEPTRON.sum.x + PERCEPTRON.sum.radius,
      PERCEPTRON.sum.y,
      PERCEPTRON.gate.x - PERCEPTRON.gate.width / 2,
      PERCEPTRON.sum.y,
      active,
      5,
    );
  } else if (phase === 2) {
    const biasTop = PERCEPTRON.bias.y - PERCEPTRON.bias.radius;
    drawSceneHairline(
      context,
      PERCEPTRON.bias.x,
      PERCEPTRON.sum.y + PERCEPTRON.sum.radius,
      PERCEPTRON.bias.x,
      biasTop,
      active,
      5,
    );
    context.save();
    context.strokeStyle = active;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(PERCEPTRON.bias.x, PERCEPTRON.bias.y, PERCEPTRON.bias.radius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
    drawSceneLabel(context, "bias", PERCEPTRON.bias.x, PERCEPTRON.bias.y - 27, 28, PALETTE.bone);
    drawSceneLabel(context, "-1", PERCEPTRON.bias.x, PERCEPTRON.bias.y + 27, 40, active);
  } else {
    const { x, y, width, height } = PERCEPTRON.gate;
    context.save();
    context.strokeStyle = active;
    context.lineWidth = 5;
    context.strokeRect(x - width / 2, y - height / 2, width, height);
    context.restore();
    drawSceneHairline(
      context,
      x + width / 2,
      y,
      PERCEPTRON.output.x - PERCEPTRON.output.radius,
      y,
      active,
      5,
    );
    drawPlasticCircle(context, PERCEPTRON.output.x, PERCEPTRON.output.y, PERCEPTRON.output.radius, active);
    drawSceneLabel(context, "1", PERCEPTRON.output.x, PERCEPTRON.output.y, 40, PALETTE.bone);
    drawSceneLabel(context, "output", PERCEPTRON.output.x, PERCEPTRON.output.y + 100, 28, PALETTE.graphite);
  }

  const labels = [
    "WEIGHTS",
    "SUM",
    "BIAS / z",
    "THRESHOLD",
  ];
  if (phase !== 2) {
    drawSceneLabel(context, labels[phase] ?? labels[3] ?? "", 960, 860, 40, active);
  }

  if (phase === 2) {
    drawSceneLabel(context, pass >= 5 ? "z = -1.5" : "z = 1.5", 960, 920, 40, PALETTE.bone, "left");
  }
  if (pass === 3 || pass === 4) {
    drawSceneLabel(context, "sigma = 0.82", 960, 970, 40, PALETTE.bone, "left");
  } else if (pass >= 5) {
    drawSceneLabel(context, "w1 = -0.5     w2 = -1     w3 = 1     b = -2", 960, 970, 40, PALETTE.ember);
  }

  drawSceneLabel(context, "PASS", 960, 160, 28, quiet);
  drawSceneLabel(context, String(pass), 960, 205, 40, PALETTE.bone);
};
