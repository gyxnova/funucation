import type { Frame, SceneTemplate } from "../engine/engine";
import { drawArrow, drawHairline, drawMonoLabel, sparkHead2D, sparkTrail } from "../engine/style";
import {
  drawDataInputs,
  drawGateStructure,
  drawInputBuses,
  drawOutput,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

export const inputsBounce: SceneTemplate = (context, frame: Frame) => {
  drawInputBuses(context);
  PERCEPTRON.inputs.forEach((input, index) => {
    const phase = (frame.beatPhase + index / PERCEPTRON.inputs.length) % 1;
    const from = { x: input.x + input.radius, y: input.y };
    const to = { x: PERCEPTRON.sum.x - PERCEPTRON.sum.radius, y: PERCEPTRON.sum.y };
    const progress = phase;
    const points = Array.from({ length: 5 }, (_, pointIndex) => {
      const trailProgress = Math.max(0, progress - (4 - pointIndex) * 0.035);
      return {
        x: from.x + (to.x - from.x) * trailProgress,
        y: from.y + (to.y - from.y) * trailProgress,
      };
    });
    sparkTrail(context, points);
    sparkHead2D(
      context,
      from.x + (to.x - from.x) * progress,
      from.y + (to.y - from.y) * progress,
      frame.t + index,
      12,
    );
  });
  drawDataInputs(context, frame, true);
  drawSumNode(context);
  drawGateStructure(context);
  drawArrow(
    context,
    PERCEPTRON.sum.x + PERCEPTRON.sum.radius,
    PERCEPTRON.sum.y,
    PERCEPTRON.gate.x - PERCEPTRON.gate.width / 2,
    PERCEPTRON.sum.y,
  );
  drawHairline(
    context,
    PERCEPTRON.gate.x + PERCEPTRON.gate.width / 2,
    PERCEPTRON.sum.y,
    PERCEPTRON.output.x - PERCEPTRON.output.radius,
    PERCEPTRON.output.y,
  );
  drawOutput(context);
  drawMonoLabel(context, "INPUTS", 250, 220, 20);
};
