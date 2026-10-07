import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, sparkHead2D, sparkTrail } from "../engine/style";
import {
  drawDataInputs,
  drawCenteredTextRuns,
  drawGateStructure,
  drawInputBuses,
  drawMainBus,
  drawOutput,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

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

  drawCenteredTextRuns(context, [
    { text: "z = w1x1 + w2x2 + w3x3 + b = ", size: 28, color: PALETTE.bone },
    { text: "2.5 + (-1) = 1.5", size: 40, color: PALETTE.signal },
  ], 960, 880);
  drawMainBus(context);
  drawGateStructure(context);
  drawOutput(context);
};
