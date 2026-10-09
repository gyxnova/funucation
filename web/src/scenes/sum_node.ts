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

  const index = frame.sceneLineIndex;
  const terms = ["0.5 x 1 = 0.5", "-1 x 0 = 0", "2 x 1 = 2"];
  terms.forEach((term, termIndex) => {
    if (index >= termIndex) {
      drawCenteredTextRuns(context, [{ text: term, size: 40, color: termIndex === index ? PALETTE.signal : PALETTE.bone }], 960, 790 + termIndex * 48);
    }
  });
  if (index >= 3) {
    drawCenteredTextRuns(context, [{ text: "weighted sum = 2.5", size: 40, color: PALETTE.signal }], 960, 940);
    if (frame.lineProgress >= 0.56) {
      drawCenteredTextRuns(context, [{ text: "bias = -1", size: 40, color: PALETTE.ember }], 960, 1000);
    }
  }
  drawMainBus(context);
  drawGateStructure(context);
  drawOutput(context);
};
