import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE, drawMonoLabel, minimumTextSize, sparkHead2D, sparkTrail } from "../engine/style";
import {
  drawDataInputs,
  drawGateStructure,
  drawMainBus,
  drawOutput,
  drawSceneHairline,
  drawSumNode,
  PERCEPTRON,
} from "./_layout";

function drawWeightLabel(
  context: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  y: number,
  color: string,
): void {
  const labelSize = minimumTextSize(label, 28);
  const valueSize = minimumTextSize(value, 40);
  context.save();
  context.font = `500 ${labelSize}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  const labelWidth = context.measureText(label).width;
  context.font = `500 ${valueSize}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  const valueWidth = context.measureText(value).width;
  const width = labelWidth + valueWidth;
  const left = x - width / 2;
  context.fillStyle = PALETTE.ink;
  context.fillRect(left - 6, y - Math.max(labelSize, valueSize) / 2 - 4, width + 12, Math.max(labelSize, valueSize) + 8);
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.font = `500 ${labelSize}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  context.fillText(label, left, y);
  context.fillStyle = color;
  context.font = `500 ${valueSize}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  context.fillText(value, left + labelWidth, y);
  context.restore();
}

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
    drawWeightLabel(
      context,
      `w${index + 1} = `,
      String(input.weight),
      labelX,
      labelY,
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
  drawMonoLabel(context, "WEIGHTS", 250, 220, 28);
};
