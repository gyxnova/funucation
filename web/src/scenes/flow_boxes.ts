import type { SceneTemplate } from "../engine/engine";
import { PALETTE, drawArrow, drawPlasticCircle } from "../engine/style";
import { drawSceneLabel } from "./_layout";

interface FlowNode {
  id: string;
  label: string;
  value: string;
  x: number;
  y: number;
}

interface FlowEdge {
  from: string;
  to: string;
}

interface FlowBoxesParams {
  nodes: FlowNode[];
  edges: FlowEdge[];
  order: string[];
  caption: string;
}

const BOX_WIDTH = 280;
const BOX_HEIGHT = 156;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFlowBoxesParams(params: Record<string, unknown>): params is Record<string, unknown> & FlowBoxesParams {
  return Array.isArray(params.nodes)
    && params.nodes.every((node) =>
      isRecord(node)
      && typeof node.id === "string"
      && typeof node.label === "string"
      && typeof node.value === "string"
      && typeof node.x === "number"
      && typeof node.y === "number")
    && Array.isArray(params.edges)
    && params.edges.every((edge) =>
      isRecord(edge) && typeof edge.from === "string" && typeof edge.to === "string")
    && Array.isArray(params.order)
    && params.order.every((id) => typeof id === "string")
    && typeof params.caption === "string";
}

function canvasPoint(node: FlowNode): { x: number; y: number } {
  return { x: 200 + node.x * 1520, y: 120 + node.y * 760 };
}

function edgePoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.min((BOX_WIDTH / 2) / Math.max(Math.abs(dx), 0.001), (BOX_HEIGHT / 2) / Math.max(Math.abs(dy), 0.001));
  return { x: from.x + dx * scale, y: from.y + dy * scale };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const flowBoxes: SceneTemplate = (context, frame, params) => {
  if (!isFlowBoxesParams(params)) {
    throw new Error("flow_boxes received invalid params");
  }

  const nodes = new Map(params.nodes.map((node) => [node.id, { ...node, point: canvasPoint(node) }]));
  params.edges.forEach((edge) => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) throw new Error(`flow_boxes edge refers to an unknown node: ${edge.from} -> ${edge.to}`);
    const start = edgePoint(from.point, to.point);
    const end = edgePoint(to.point, from.point);
    drawArrow(context, start.x, start.y, end.x, end.y, PALETTE.bone, 2, 16);
  });

  const pathSteps = params.order.length - 1;
  const routeProgress = clamp01(frame.p) * pathSteps;
  const arrivedThrough = Math.floor(routeProgress);
  params.nodes.forEach((node) => {
    const orderedIndex = params.order.indexOf(node.id);
    const reached = orderedIndex <= arrivedThrough || frame.p >= 1;
    const { x, y } = canvasPoint(node);
    context.save();
    context.strokeStyle = reached ? PALETTE.signal : PALETTE.bone;
    context.lineWidth = 2;
    context.strokeRect(x - BOX_WIDTH / 2, y - BOX_HEIGHT / 2, BOX_WIDTH, BOX_HEIGHT);
    context.restore();
    drawSceneLabel(context, node.label, x, y - 30, 28, PALETTE.bone);
    if (reached) drawSceneLabel(context, node.value, x, y + 28, 40, PALETTE.signal);
  });

  if (frame.p < 1) {
    const segmentIndex = Math.min(pathSteps - 1, Math.floor(routeProgress));
    const segmentProgress = routeProgress - segmentIndex;
    const fromNode = params.order[segmentIndex];
    const toNode = params.order[segmentIndex + 1];
    if (fromNode && toNode) {
      const from = nodes.get(fromNode);
      const to = nodes.get(toNode);
      if (from && to) {
        const start = edgePoint(from.point, to.point);
        const end = edgePoint(to.point, from.point);
        const sparkX = start.x + (end.x - start.x) * segmentProgress;
        const sparkY = start.y + (end.y - start.y) * segmentProgress;
        drawPlasticCircle(context, sparkX, sparkY, 12, PALETTE.signal);
        context.save();
        context.fillStyle = PALETTE.bone;
        context.beginPath();
        context.arc(sparkX, sparkY, 4, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
  }

  drawSceneLabel(context, params.caption, 960, 960, 28, PALETTE.bone);
};
