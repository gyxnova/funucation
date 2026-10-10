import type { Frame, SceneTemplate } from "../engine/engine";
import { PALETTE } from "../engine/style";
import { drawSceneHairline, drawSceneLabel } from "./_layout";

export const titleCard: SceneTemplate = (context: CanvasRenderingContext2D, _frame: Frame, params) => {
  const title = params.title ?? "Zee Above Zero";
  const subtitle = params.subtitle ?? "learn-by-song";
  if (typeof title !== "string" || typeof subtitle !== "string") {
    throw new Error("title_card received invalid params");
  }
  drawSceneHairline(context, 480, 510, 1440, 510, PALETTE.dim, 2);
  drawSceneLabel(context, title, 960, 420, 112, PALETTE.bone);
  drawSceneLabel(context, subtitle, 960, 600, 40, PALETTE.signal);
};
