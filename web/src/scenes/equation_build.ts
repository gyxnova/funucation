import type { SceneTemplate } from "../engine/engine";
import { PALETTE, minimumTextSize } from "../engine/style";
import { drawSceneLabel } from "./_layout";

interface EquationLine {
  text: string;
  reveal_at: number;
}

interface EquationBuildParams {
  lines: EquationLine[];
  highlight_last: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEquationBuildParams(
  params: Record<string, unknown>,
): params is Record<string, unknown> & EquationBuildParams {
  return Array.isArray(params.lines)
    && params.lines.every((line) =>
      isRecord(line)
      && typeof line.text === "string"
      && typeof line.reveal_at === "number"
      && line.reveal_at >= 0
      && line.reveal_at <= 1)
    && typeof params.highlight_last === "boolean";
}

export const equationBuild: SceneTemplate = (context, frame, params) => {
  if (!isEquationBuildParams(params)) {
    throw new Error("equation_build received invalid params");
  }

  const lineHeight = 112;
  const firstY = 540 - ((params.lines.length - 1) * lineHeight) / 2;
  params.lines.forEach((line, index) => {
    if (frame.p < line.reveal_at) return;
    const isLast = index === params.lines.length - 1;
    const color = params.highlight_last && isLast ? PALETTE.signal : PALETTE.bone;
    const size = minimumTextSize(line.text, 44);
    context.save();
    context.font = `500 ${size}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = color;
    context.fillText(line.text, 960, firstY + index * lineHeight);
    context.restore();
  });

  drawSceneLabel(context, "equation", 960, 180, 28, PALETTE.graphite);
};
