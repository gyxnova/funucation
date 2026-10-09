import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE } from "../engine/style";
import { drawSceneHairline, drawSceneLabel } from "./_layout";

export const titleCard: SceneTemplate = (context: CanvasRenderingContext2D, _frame: Frame) => {
  drawSceneHairline(context, 480, 510, 1440, 510, PALETTE.dim, 2);
  drawSceneLabel(context, "Zee Above Zero", 960, 420, 112, PALETTE.bone);
  drawSceneLabel(context, "learn-by-song", 960, 600, 40, PALETTE.signal);
};
