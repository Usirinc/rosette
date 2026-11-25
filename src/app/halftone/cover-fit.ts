import type { ToolcraftMediaTransform } from "@/toolcraft/runtime";

function normalizeRotation(rotationDeg: number | undefined): 0 | 90 | 180 | 270 {
  const normalized = (((Math.round((rotationDeg ?? 0) / 90) * 90) % 360) + 360) % 360;

  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

/**
 * Draws `image` into the current 2D context using the same cover/crop plus
 * rotate/flip placement CanvasShell uses for default media preview, so an
 * uploaded photo with a different aspect ratio fills the current canvas
 * bounds without letterboxing and image transform actions (rotate/flip)
 * visibly affect the halftone output.
 */
export function drawToolcraftMediaCoverFit(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  transform: ToolcraftMediaTransform | undefined,
  containerWidth: number,
  containerHeight: number,
): void {
  if (imageWidth <= 0 || imageHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return;
  }

  const baseScale = Math.max(containerWidth / imageWidth, containerHeight / imageHeight);
  const drawWidth = imageWidth * baseScale;
  const drawHeight = imageHeight * baseScale;

  const rotationDeg = normalizeRotation(transform?.rotationDeg);
  const flipHorizontal = transform?.flipHorizontal ?? false;
  const flipVertical = transform?.flipVertical ?? false;
  const coverScale =
    rotationDeg === 90 || rotationDeg === 270
      ? Math.max(containerWidth / containerHeight, containerHeight / containerWidth)
      : 1;
  const scaleX = (flipHorizontal ? -1 : 1) * coverScale;
  const scaleY = (flipVertical ? -1 : 1) * coverScale;

  ctx.save();
  ctx.translate(containerWidth / 2, containerHeight / 2);
  ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.scale(scaleX, scaleY);
  ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  ctx.restore();
}

/**
 * Renders a cover-fit composite of `image` at an exact pixel size. Used both
 * for the live preview backing texture (pixel size = CSS size * device pixel
 * ratio * Resolution scale) and for PNG export (pixel size = the selected
 * export resolution), so export never upscales a blurry small preview.
 */
export function createToolcraftMediaCoverFitCanvas({
  containerCssHeight,
  containerCssWidth,
  image,
  imageHeight,
  imageWidth,
  pixelHeight,
  pixelWidth,
  transform,
}: {
  containerCssHeight: number;
  containerCssWidth: number;
  image: CanvasImageSource;
  imageHeight: number;
  imageWidth: number;
  pixelHeight: number;
  pixelWidth: number;
  transform: ToolcraftMediaTransform | undefined;
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  canvas.width = Math.max(1, Math.round(pixelWidth));
  canvas.height = Math.max(1, Math.round(pixelHeight));

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return canvas;
  }

  const scaleX = canvas.width / containerCssWidth;
  const scaleY = canvas.height / containerCssHeight;

  ctx.save();
  ctx.scale(scaleX, scaleY);
  drawToolcraftMediaCoverFit(
    ctx,
    image,
    imageWidth,
    imageHeight,
    transform,
    containerCssWidth,
    containerCssHeight,
  );
  ctx.restore();

  return canvas;
}
