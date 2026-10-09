import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE } from "../engine/style";
import { drawSceneHairline, drawSceneLabel } from "./_layout";

export const endCard: SceneTemplate = (context: CanvasRenderingContext2D, _frame: Frame) => {
  drawSceneHairline(context, 480, 370, 1440, 370, PALETTE.dim, 2);
  drawSceneLabel(context, "Zee Above Zero", 960, 280, 88, PALETTE.bone);
  drawSceneLabel(context, "funucation", 960, 600, 40, PALETTE.bone);
  context.save();
  context.font = '500 22px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = PALETTE.dim;
  context.fillText(
    "Song: AI-generated (Google Lyria) · lyrics drafted with AI, edited by us",
    960,
    930,
  );
  context.restore();
};
