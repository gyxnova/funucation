import type { SceneTemplate } from "../engine/engine";
import { PALETTE, drawPlasticCircle } from "../engine/style";
import { drawSceneHairline, drawSceneLabel } from "./_layout";

type FunctionName = "step" | "sigmoid" | "relu" | "quadratic";

interface CurveMarker {
  x: number;
  label: string;
}

interface CurveDotParams {
  fn: FunctionName;
  morph_from: FunctionName | null;
  x_min: number;
  x_max: number;
  markers: CurveMarker[];
  caption: string;
}

const GRAPH = { left: 260, right: 1660, top: 250, bottom: 730 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFunctionName(value: unknown): value is FunctionName {
  return value === "step" || value === "sigmoid" || value === "relu" || value === "quadratic";
}

function isCurveDotParams(params: Record<string, unknown>): params is Record<string, unknown> & CurveDotParams {
  return isFunctionName(params.fn)
    && (params.morph_from === null || isFunctionName(params.morph_from))
    && typeof params.x_min === "number"
    && typeof params.x_max === "number"
    && params.x_min < params.x_max
    && Array.isArray(params.markers)
    && params.markers.every((marker) =>
      isRecord(marker) && typeof marker.x === "number" && typeof marker.label === "string")
    && typeof params.caption === "string";
}

function evaluate(name: FunctionName, x: number): number {
  switch (name) {
    case "step":
      return x >= 0 ? 1 : 0;
    case "sigmoid":
      return 1 / (1 + Math.exp(-x));
    case "relu":
      return Math.max(0, x);
    case "quadratic":
      return x * x;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const curveDot: SceneTemplate = (context, frame, params) => {
  if (!isCurveDotParams(params)) {
    throw new Error("curve_dot received invalid params");
  }

  const morphProgress = params.morph_from === null ? 1 : clamp01(frame.p * 2);
  const curveAt = (x: number): number => {
    const target = evaluate(params.fn, x);
    if (params.morph_from === null) return target;
    const origin = evaluate(params.morph_from, x);
    return origin + (target - origin) * morphProgress;
  };
  const samples = 100;
  const rangeFunctions = params.morph_from === null ? [params.fn] : [params.morph_from, params.fn];
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  rangeFunctions.forEach((name) => {
    for (let index = 0; index <= samples; index += 1) {
      const x = params.x_min + ((params.x_max - params.x_min) * index) / samples;
      const y = evaluate(name, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  });
  const yRange = Math.max(0.1, maxY - minY);
  minY -= yRange * 0.08;
  maxY += yRange * 0.08;
  const xAt = (x: number): number =>
    GRAPH.left + ((x - params.x_min) / (params.x_max - params.x_min)) * (GRAPH.right - GRAPH.left);
  const yAt = (y: number): number =>
    GRAPH.bottom - ((y - minY) / (maxY - minY)) * (GRAPH.bottom - GRAPH.top);

  drawSceneHairline(context, GRAPH.left, GRAPH.bottom, GRAPH.right, GRAPH.bottom, PALETTE.dim, 2);
  if (params.x_min <= 0 && params.x_max >= 0) {
    drawSceneHairline(context, xAt(0), GRAPH.top, xAt(0), GRAPH.bottom, PALETTE.dim, 1);
  }

  context.save();
  context.globalAlpha = 0.48;
  context.strokeStyle = PALETTE.bone;
  context.lineWidth = 2;
  context.lineCap = "round";
  context.beginPath();
  for (let index = 0; index <= samples; index += 1) {
    const x = params.x_min + ((params.x_max - params.x_min) * index) / samples;
    const px = xAt(x);
    const py = yAt(curveAt(x));
    if (index === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.stroke();
  context.restore();

  params.markers.forEach((marker) => {
    const markerX = xAt(marker.x);
    const markerY = yAt(curveAt(marker.x));
    drawSceneHairline(context, markerX, markerY - 14, markerX, markerY + 14, PALETTE.graphite, 2);
    drawSceneLabel(context, marker.label, markerX, GRAPH.bottom + 50, 28, PALETTE.bone);
  });
  drawSceneLabel(context, String(params.x_min), GRAPH.left, GRAPH.bottom + 108, 40, PALETTE.bone);
  drawSceneLabel(context, String(params.x_max), GRAPH.right, GRAPH.bottom + 108, 40, PALETTE.bone);

  const x = params.x_min + (params.x_max - params.x_min) * clamp01(frame.p);
  const y = curveAt(x);
  drawPlasticCircle(context, xAt(x), yAt(y), 14, PALETTE.signal);
  drawSceneLabel(context, params.caption, 960, 930, 28, PALETTE.bone);
};
