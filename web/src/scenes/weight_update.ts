import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle } from "../engine/style";
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

export const weightUpdate: SceneTemplate = (context, frame: Frame) => {
  PERCEPTRON.inputs.forEach((input, index) => {
    const lineX = input.x + input.radius;
    const lineY = input.y;
    const targetX = PERCEPTRON.sum.x - PERCEPTRON.sum.radius;
    const targetY = PERCEPTRON.sum.y;
    const weight = index === 1 ? -1 + 0.5 * frame.p : input.weight;
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
    const label = index === 1 ? "w2: -1 -> -0.5" : `w${index + 1} = ${input.weight}`;
    const labelY = lineY + (targetY - lineY) * 0.52 - 30;
    drawSceneLabel(context, label, lineX + (targetX - lineX) * 0.52, labelY, index === 1 ? 23 : 19, PALETTE.bone);
  });
  drawDataInputs(context, frame);
  drawSumNode(context);
  drawMainBus(context);
  drawGateStructure(context);
  drawOutput(context);
  drawSceneLabel(context, "prediction error: +1", 960, 860, 24, PALETTE.ember);
  const correction = Math.sin(frame.beatPhase * Math.PI) * 8;
  drawPlasticCircle(context, 1170, 860 - correction, 13, PALETTE.ember);
};
