import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, sparkHead2D, sparkTrail } from "../engine/style";
import {
  drawDataInputs,
  drawGateStructure,
  drawInputBuses,
  drawMainBus,
  drawOutput,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

const TERMS = ["0.5", " + 0", " + 2", " = 2.5"] as const;

export const sumNode: SceneTemplate = (context, frame: Frame) => {
  drawInputBuses(context);
  PERCEPTRON.inputs.forEach((input, index) => {
    const progress = frame.beatPhase;
    const fromX = input.x + input.radius;
    const fromY = input.y;
    const toX = PERCEPTRON.sum.x - PERCEPTRON.sum.radius;
    const toY = PERCEPTRON.sum.y;
    const x = fromX + (toX - fromX) * progress;
    const y = fromY + (toY - fromY) * progress;
    sparkTrail(context, [
      { x: fromX + (toX - fromX) * Math.max(0, progress - 0.08), y: fromY + (toY - fromY) * Math.max(0, progress - 0.08) },
      { x: x, y },
    ]);
    sparkHead2D(context, x, y, frame.t + index, 11);
  });
  drawDataInputs(context, frame);
  const swell = 1 + Math.sin(frame.beatPhase * Math.PI) * 0.12;
  drawSumNode(context, swell, false);

  const termsShown = Math.min(TERMS.length, Math.floor(frame.p * TERMS.length) + 1);
  const expression = TERMS.slice(0, termsShown).join("");
  drawSceneLabel(context, expression, PERCEPTRON.sum.x, PERCEPTRON.sum.y + 132, 32, PALETTE.bone);
  drawSceneHairline(context, PERCEPTRON.sum.x, PERCEPTRON.sum.y + 174, PERCEPTRON.sum.x, PERCEPTRON.sum.y + 194, PALETTE.dim, 1);
  drawMainBus(context);
  drawGateStructure(context);
  drawOutput(context);
};
