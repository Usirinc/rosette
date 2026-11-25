import type { HalftoneBackgroundGradient, HalftoneGradientStop } from "./params";

/**
 * Rasterizes the halftone composite's gradient background into a small
 * offscreen 2D canvas so it can be uploaded as a WebGL texture and re-used
 * across frames (see `gl-engine.ts`'s `ensureBackgroundGradientTexture`).
 * This mirrors the existing "decode/cover-fit once, re-upload only on
 * change" pattern already used for the source photo texture: the gradient
 * is only ever re-painted when its type/angle/stops or the canvas aspect
 * ratio change, never on every render/draw call.
 *
 * The texture is intentionally rasterized at a small, aspect-matched size
 * (capped by `MAX_BACKGROUND_GRADIENT_TEXTURE_SIZE`) instead of at full
 * canvas/export pixel size: gradients are smooth low-frequency content, so a
 * small bilinear-filtered texture stretched to any preview or export
 * resolution looks identical to a full-resolution rasterization while
 * keeping the (re)generation cost negligible even at 8K export.
 */
const MAX_BACKGROUND_GRADIENT_TEXTURE_SIZE = 512;
const MIN_BACKGROUND_GRADIENT_TEXTURE_SIZE = 2;

export function getHalftoneGradientTextureSize(
  backingWidth: number,
  backingHeight: number,
): { height: number; width: number } {
  const safeWidth = Math.max(1, backingWidth);
  const safeHeight = Math.max(1, backingHeight);
  const longEdge = Math.max(safeWidth, safeHeight);
  const scale = longEdge > 0 ? Math.min(1, MAX_BACKGROUND_GRADIENT_TEXTURE_SIZE / longEdge) : 1;

  return {
    height: Math.max(
      MIN_BACKGROUND_GRADIENT_TEXTURE_SIZE,
      Math.round(safeHeight * scale),
    ),
    width: Math.max(MIN_BACKGROUND_GRADIENT_TEXTURE_SIZE, Math.round(safeWidth * scale)),
  };
}

export function serializeHalftoneBackgroundGradient(
  gradient: HalftoneBackgroundGradient,
): string {
  return JSON.stringify({
    angleDeg: gradient.angleDeg,
    gradientType: gradient.gradientType,
    stops: gradient.stops.map((stop) => [
      stop.colorHex,
      stop.opacityPercent,
      stop.positionPercent,
    ]),
  });
}

function toRgba(colorHex: string, opacityPercent: number): string {
  const normalized = colorHex.replace("#", "");
  const parsed =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(parsed, 16);
  const safeValue = Number.isFinite(value) ? value : 0xffffff;
  const r = (safeValue >> 16) & 255;
  const g = (safeValue >> 8) & 255;
  const b = safeValue & 255;
  const alpha = Math.min(1, Math.max(0, opacityPercent / 100));

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function normalizeStopsForPaint(
  stops: readonly HalftoneGradientStop[],
): { color: string; position: number }[] {
  return [...stops]
    .map((stop) => ({
      color: toRgba(stop.colorHex, stop.opacityPercent),
      position: Math.min(1, Math.max(0, stop.positionPercent / 100)),
    }))
    .sort((a, b) => a.position - b.position);
}

function computeLinearGradientEndpoints(
  width: number,
  height: number,
  angleDeg: number,
): { x1: number; x2: number; y1: number; y2: number } {
  const angleRad = (((angleDeg % 360) + 360) % 360) * (Math.PI / 180);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const length = Math.abs(width * Math.sin(angleRad)) + Math.abs(height * Math.cos(angleRad));
  const half = length / 2;
  // CSS linear-gradient semantics: 0deg points "to top" (negative-y), and
  // the angle rotates clockwise from there.
  const dirX = Math.sin(angleRad);
  const dirY = -Math.cos(angleRad);

  return {
    x1: halfWidth - dirX * half,
    x2: halfWidth + dirX * half,
    y1: halfHeight - dirY * half,
    y2: halfHeight + dirY * half,
  };
}

type Canvas2DContext = Pick<
  CanvasRenderingContext2D,
  | "clearRect"
  | "createConicGradient"
  | "createLinearGradient"
  | "createRadialGradient"
  | "fillRect"
  | "fillStyle"
  | "restore"
  | "save"
  | "scale"
  | "translate"
>;

/** Paints `gradient` into `ctx` covering the full `width` x `height` rect. */
export function paintHalftoneGradientBackground(
  ctx: Canvas2DContext,
  width: number,
  height: number,
  gradient: HalftoneBackgroundGradient,
): void {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);

  ctx.clearRect(0, 0, safeWidth, safeHeight);

  const stops = normalizeStopsForPaint(gradient.stops);

  if (stops.length === 0) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, safeWidth, safeHeight);
    return;
  }

  if (stops.length === 1) {
    ctx.fillStyle = stops[0]!.color;
    ctx.fillRect(0, 0, safeWidth, safeHeight);
    return;
  }

  const cx = safeWidth / 2;
  const cy = safeHeight / 2;

  // "Diamond" mirrors the gradient control's own CSS preview
  // (`radial-gradient(closest-corner at 50% 50%, ...)`), which for a
  // centered box is an ellipse matching the box aspect ratio and sized to
  // pass through each corner -- not a literal 4-sided diamond shape, but the
  // same visual style the control's stop-track preview already uses.
  if (gradient.gradientType === "diamond") {
    const scaleY = cx > 0 ? cy / cx : 1;
    const radius = Math.max(cx * Math.SQRT2, 1);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, scaleY || 1);

    const diamondGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);

    for (const stop of stops) {
      diamondGradient.addColorStop(stop.position, stop.color);
    }

    ctx.fillStyle = diamondGradient;
    ctx.fillRect(-cx, -cx, cx * 2, cx * 2);
    ctx.restore();
    return;
  }

  let canvasGradient: CanvasGradient;

  if (gradient.gradientType === "radial") {
    const radius = Math.max(Math.sqrt(cx * cx + cy * cy), 1);

    canvasGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
  } else if (gradient.gradientType === "angular") {
    if (typeof ctx.createConicGradient === "function") {
      canvasGradient = ctx.createConicGradient(Math.PI / 2, cx, cy);
    } else {
      const radius = Math.max(Math.sqrt(cx * cx + cy * cy), 1);

      canvasGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    }
  } else {
    const { x1, x2, y1, y2 } = computeLinearGradientEndpoints(
      safeWidth,
      safeHeight,
      gradient.angleDeg,
    );

    canvasGradient = ctx.createLinearGradient(x1, y1, x2, y2);
  }

  for (const stop of stops) {
    canvasGradient.addColorStop(stop.position, stop.color);
  }

  ctx.fillStyle = canvasGradient;
  ctx.fillRect(0, 0, safeWidth, safeHeight);
}
