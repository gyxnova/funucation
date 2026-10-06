import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawMonoLabel, sparkHead2D, sparkTrail } from "../engine/style";
import {
  drawDataInputs,
  drawGateStructure,
  drawMainBus,
  drawOutput,
  drawSceneHairline,
  drawSceneLabel,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

export const weightsLight: SceneTemplate = (context, frame: Frame) => {
  const activeIndex = Math.floor(frame.beat) % PERCEPTRON.inputs.length;
  PERCEPTRON.inputs.forEach((input, index) => {
    const negative = input.weight < 0;
    const lineX = input.x + input.radius;
    const lineY = input.y;
    const targetX = PERCEPTRON.sum.x - PERCEPTRON.sum.radius;
    const targetY = PERCEPTRON.sum.y;
    const active = index === activeIndex;
    drawSceneHairline(
      context,
      lineX,
      lineY,
      targetX,
      targetY,
      negative ? PALETTE.dim : active ? PALETTE.signal : PALETTE.bone,
      1.5 + Math.abs(input.weight) * 2.2,
    );

    const labelX = lineX + (targetX - lineX) * 0.52;
    const labelY = lineY + (targetY - lineY) * 0.52 - 28;
    drawSceneLabel(
      context,
      `w${index + 1} = ${input.weight}`,
      labelX,
      labelY,
      21,
      negative ? PALETTE.graphite : PALETTE.bone,
    );

    const progress = frame.beatPhase;
    const sparkX = lineX + (targetX - lineX) * progress;
    const sparkY = lineY + (targetY - lineY) * progress;
    if (active) {
      sparkTrail(context, [
        { x: lineX + (targetX - lineX) * Math.max(0, progress - 0.12), y: lineY + (targetY - lineY) * Math.max(0, progress - 0.12) },
        { x: lineX + (targetX - lineX) * Math.max(0, progress - 0.06), y: lineY + (targetY - lineY) * Math.max(0, progress - 0.06) },
        { x: sparkX, y: sparkY },
      ]);
      sparkHead2D(context, sparkX, sparkY, frame.t, 12);
    }
  });
  drawDataInputs(context, frame);
  drawSumNode(context);
  drawMainBus(context);
  drawGateStructure(context);
  drawOutput(context);
  drawMonoLabel(context, "WEIGHTS", 250, 220, 20);
};
