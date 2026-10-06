import type { Frame, SceneTemplate } from "../engine/engine";

const DEFAULT_COLORS = ["#ff7f73", "#ffd56b", "#7cd9ba"];

export const inputsBounce: SceneTemplate = (context, frame: Frame, params) => {
  const colors = Array.isArray(params.colors)
    ? params.colors.filter((color): color is string => typeof color === "string")
    : DEFAULT_COLORS;
  const radius = typeof params.radius === "number" ? params.radius : 90;
  const centers = [480, 960, 1440];

  centers.forEach((x, index) => {
    const phase = (frame.beatPhase + index / centers.length) % 1;
    const bounce = Math.abs(Math.sin(phase * Math.PI));
    const y = 570 - bounce * 230;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = colors[index % colors.length] ?? DEFAULT_COLORS[index];
    context.fill();
  });
};
