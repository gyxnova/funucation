import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, sparkHead2D } from "../engine/style";
import {
  drawDataInputs,
  drawInputBuses,
  drawMainBus,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
  drawGateStructure,
  drawOutput,
  PERCEPTRON,
} from "./_layout";

export const biasNode: SceneTemplate = (context, frame: Frame) => {
  drawInputBuses(context);
  drawDataInputs(context, frame);
  drawMainBus(context);
  drawSumNode(context);
  drawGateStructure(context);
  drawOutput(context);

  const bias = PERCEPTRON.bias;
  const startY = bias.y - bias.radius;
  const endY = PERCEPTRON.sum.y + PERCEPTRON.sum.radius;
  drawSceneHairline(context, bias.x, startY, bias.x, endY, PALETTE.dim, 2);
  const sparkY = startY + (endY - startY) * Math.min(1, Math.max(0, frame.p));
  sparkHead2D(context, bias.x, sparkY, frame.t, 10);

  context.save();
  context.strokeStyle = PALETTE.graphite;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(bias.x, bias.y, bias.radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();
  drawSceneLabel(context, "bias", bias.x, bias.y - 27, 28, PALETTE.bone);
  drawSceneLabel(context, "-1", bias.x, bias.y + 27, 40, PALETTE.bone);
};
