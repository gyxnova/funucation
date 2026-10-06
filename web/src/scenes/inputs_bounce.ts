import type { Frame, SceneTemplate } from "../engine/engine";
import {
  PALETTE,
  drawArrow,
  drawBoldText,
  drawHairline,
  drawMonoLabel,
  drawPlasticCircle,
  sparkHead2D,
  sparkTrail,
} from "../engine/style";

const INPUTS = [
  { x: 400, y: 420, color: "#D83D12", label: "x1" },
  { x: 400, y: 600, color: PALETTE.signal, label: "x2" },
  { x: 400, y: 780, color: PALETTE.ember, label: "x3" },
] as const;
const NODE = { x: 1370, y: 600 };
const TAU = Math.PI * 2;

export const inputsBounce: SceneTemplate = (context, frame: Frame) => {
  const lines = INPUTS.map((input, index) => {
    const phase = (frame.beatPhase + index / INPUTS.length) % 1;
    const progress = phase;
    const pulse = Math.sin(phase * Math.PI * 2);
    const bounce = Math.max(0, Math.sin(phase * Math.PI));
    const xRadius = 82 * (1 + pulse * 0.055);
    const yRadius = 82 * (1 - pulse * 0.055);
    const y = input.y - bounce * 42;
    return { input, index, phase, progress, xRadius, yRadius, y };
  });

  lines.forEach(({ input, y }) => {
    drawHairline(context, input.x + 88, y, NODE.x - 46, NODE.y, PALETTE.bone, 2);
  });

  lines.forEach(({ input, phase, progress, xRadius, yRadius, y }) => {
    const startX = input.x + 88;
    const endX = NODE.x - 48;
    const sparkX = startX + (endX - startX) * progress;
    const sparkY = y + (NODE.y - y) * progress;
    const points = Array.from({ length: 5 }, (_, index) => {
      const trailProgress = Math.max(0, progress - (4 - index) * 0.025);
      return {
        x: startX + (endX - startX) * trailProgress,
        y: y + (NODE.y - y) * trailProgress,
      };
    });
    sparkTrail(context, points);
    sparkHead2D(context, sparkX, sparkY, frame.t + phase * TAU, 13);

    context.save();
    context.translate(input.x, y);
    context.scale(xRadius / 82, yRadius / 82);
    drawPlasticCircle(context, 0, 0, 82, input.color);
    context.restore();
    drawBoldText(context, input.label, input.x, y + 1, 43, PALETTE.bone);
  });

  context.save();
  context.strokeStyle = PALETTE.bone;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(NODE.x, NODE.y, 42, 0, TAU);
  context.stroke();
  context.restore();
  drawMonoLabel(context, "Σ", NODE.x, NODE.y, 38, PALETTE.bone);

  drawArrow(context, NODE.x + 44, NODE.y, 1575, NODE.y, PALETTE.bone, 2, 12);
  drawMonoLabel(context, "INPUTS", 400, 282, 20, PALETTE.graphite);
};
