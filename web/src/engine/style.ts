export const PALETTE = {
  ink: "#0A0A0A",
  ink2: "#151517",
  graphite: "#5E5B57",
  bone: "#EEE9DF",
  signal: "#FF4D12",
  ember: "#FF8A3D",
  dim: "#3A3A3E",
} as const;

interface PlasticSprite {
  canvas: HTMLCanvasElement;
  padding: number;
  pixelRatio: number;
}

const plasticSprites = new Map<string, PlasticSprite>();

export function drawBackground(context: CanvasRenderingContext2D): void {
  context.fillStyle = PALETTE.ink;
  context.fillRect(0, 0, 1920, 1080);
  context.fillStyle = "rgba(238, 233, 223, 0.12)";
  for (let y = 36; y < 1080; y += 48) {
    for (let x = 36; x < 1920; x += 48) {
      context.fillRect(x, y, 2, 2);
    }
  }
}

function colorAtLuminance(color: string, amount: number): string {
  const match = /^#([\da-f]{6})$/i.exec(color);
  if (!match?.[1]) throw new Error(`Expected a six-digit hex color, got ${color}`);
  const value = Number.parseInt(match[1], 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel * amount))));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function plasticGradient(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): CanvasGradient {
  const gradient = context.createRadialGradient(
    x - size * 0.36,
    y - size * 0.4,
    size * 0.03,
    x + size * 0.08,
    y + size * 0.1,
    size * 1.12,
  );
  gradient.addColorStop(0, colorAtLuminance(color, 1.24));
  gradient.addColorStop(0.58, color);
  gradient.addColorStop(0.86, colorAtLuminance(color, 0.62));
  gradient.addColorStop(1, colorAtLuminance(color, 0.38));
  return gradient;
}

function createPlasticSprite(
  shape: "circle" | "roundRect",
  width: number,
  height: number,
  radius: number,
  color: string,
): PlasticSprite {
  const pixelRatio = window.devicePixelRatio || 1;
  const size = Math.max(width, height);
  const padding = Math.max(12, size * 0.25);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((width + padding * 2) * pixelRatio);
  canvas.height = Math.ceil((height + padding * 2) * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create a canvas for a plastic shape");
  context.scale(pixelRatio, pixelRatio);

  const centerX = padding + width / 2;
  const centerY = padding + height / 2;
  const shadowY = centerY + height * 0.48;
  const shadow = context.createRadialGradient(
    centerX,
    shadowY,
    Math.min(width, height) * 0.08,
    centerX,
    shadowY,
    size * 0.68,
  );
  shadow.addColorStop(0, "rgba(0, 0, 0, 0.38)");
  shadow.addColorStop(0.42, "rgba(0, 0, 0, 0.22)");
  shadow.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = shadow;
  context.beginPath();
  context.ellipse(centerX, shadowY, width * 0.52, Math.max(8, height * 0.28), 0, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  if (shape === "circle") {
    context.arc(centerX, centerY, width / 2, 0, Math.PI * 2);
  } else {
    context.roundRect(padding, padding, width, height, Math.max(0, Math.min(radius, width / 2, height / 2)));
  }
  context.fillStyle = plasticGradient(context, centerX, centerY, size / 2, color);
  context.fill();

  context.save();
  context.fillStyle = "rgba(255, 250, 238, 0.72)";
  context.beginPath();
  context.ellipse(
    centerX - width * 0.18,
    centerY - height * 0.22,
    width * 0.11,
    Math.max(3, height * 0.045),
    -Math.PI / 5,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();

  return { canvas, padding, pixelRatio };
}

function plasticSprite(
  shape: "circle" | "roundRect",
  width: number,
  height: number,
  radius: number,
  color: string,
): PlasticSprite {
  const pixelRatio = window.devicePixelRatio || 1;
  const key = `${shape}:${width}:${height}:${radius}:${color}:${pixelRatio}`;
  let sprite = plasticSprites.get(key);
  if (!sprite) {
    sprite = createPlasticSprite(shape, width, height, radius, color);
    plasticSprites.set(key, sprite);
  }
  return sprite;
}

export function drawPlasticCircle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  const sprite = plasticSprite("circle", radius * 2, radius * 2, radius, color);
  const padding = sprite.padding;
  context.drawImage(
    sprite.canvas,
    x - radius - padding,
    y - radius - padding,
    radius * 2 + padding * 2,
    radius * 2 + padding * 2,
  );
}

export function drawPlasticRoundRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
): void {
  const sprite = plasticSprite("roundRect", width, height, radius, color);
  context.drawImage(
    sprite.canvas,
    x - sprite.padding,
    y - sprite.padding,
    width + sprite.padding * 2,
    height + sprite.padding * 2,
  );
}

export function drawHairline(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = PALETTE.bone,
  width = 2,
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
  context.restore();
}

export function drawArrow(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = PALETTE.bone,
  width = 2,
  headSize = 14,
): void {
  drawHairline(context, x1, y1, x2, y2, color, width);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  context.save();
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(x2, y2);
  context.lineTo(x2 - headSize * Math.cos(angle - Math.PI / 6), y2 - headSize * Math.sin(angle - Math.PI / 6));
  context.lineTo(x2 - headSize * Math.cos(angle + Math.PI / 6), y2 - headSize * Math.sin(angle + Math.PI / 6));
  context.closePath();
  context.fill();
  context.restore();
}

export function drawBoldText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string = PALETTE.bone,
  align: CanvasTextAlign = "center",
): void {
  context.save();
  context.font = `800 ${size}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, x, y);
  context.restore();
}

export function drawMonoLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string = PALETTE.graphite,
  align: CanvasTextAlign = "center",
): void {
  context.save();
  context.font = `500 ${size}px ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillStyle = color;
  context.fillText(text, x, y);
  context.restore();
}

export function sparkHead2D(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  scale: number,
): void {
  const flicker = 0.94 + 0.06 * Math.sin(t * 17.3);
  const radius = Math.max(0, scale * flicker);
  if (radius === 0) return;

  context.save();
  context.globalCompositeOperation = "lighter";
  const halo = context.createRadialGradient(x, y, 0, x, y, radius * 2.1);
  halo.addColorStop(0, "rgba(255, 245, 222, 0.98)");
  halo.addColorStop(0.2, "rgba(255, 138, 61, 0.98)");
  halo.addColorStop(0.64, "rgba(255, 77, 18, 0.58)");
  halo.addColorStop(1, "rgba(255, 77, 18, 0)");
  context.fillStyle = halo;
  context.beginPath();
  context.arc(x, y, radius * 2.1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function sparkTrail(context: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]): void {
  if (points.length < 2) return;
  context.save();
  context.lineCap = "round";
  context.lineWidth = 2;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    if (!from || !to) continue;
    const alpha = index / (points.length - 1);
    context.strokeStyle = `rgba(255, 138, 61, ${alpha * 0.68})`;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
}
