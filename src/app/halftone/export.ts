import type { ToolcraftMediaAsset } from "@/toolcraft/runtime";

import { createHalftoneGLEngine } from "./gl-engine";
import { createToolcraftMediaCoverFitCanvas } from "./cover-fit";
import type { HalftoneParams } from "./params";
import { decodeToolcraftHalftoneSourceImage } from "./render-source";

/**
 * Renders the halftone effect into a brand-new offscreen canvas at an exact
 * pixel size. Used for PNG export so the selected `Image Export` resolution
 * (2K/4K/8K) always re-renders the full pipeline at that resolution instead
 * of upscaling the live preview.
 */
export async function renderToolcraftHalftoneToCanvas({
  cssHeight,
  cssWidth,
  mediaAsset,
  params,
  pixelHeight,
  pixelWidth,
}: {
  cssHeight: number;
  cssWidth: number;
  mediaAsset: ToolcraftMediaAsset | undefined;
  params: HalftoneParams;
  pixelHeight: number;
  pixelWidth: number;
}): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const engine = createHalftoneGLEngine(canvas);

  if (!engine) {
    throw new Error("This browser does not support the WebGL renderer the halftone effect requires.");
  }

  engine.setSize(cssWidth, cssHeight, pixelWidth, pixelHeight);

  if (mediaAsset) {
    const image = await decodeToolcraftHalftoneSourceImage(mediaAsset.dataUrl);
    const coverFitCanvas = createToolcraftMediaCoverFitCanvas({
      containerCssHeight: cssHeight,
      containerCssWidth: cssWidth,
      image,
      imageHeight: image.naturalHeight || image.height,
      imageWidth: image.naturalWidth || image.width,
      pixelHeight,
      pixelWidth,
      transform: mediaAsset.transform,
    });

    engine.setSource(coverFitCanvas);
  }

  const scale = pixelWidth / Math.max(1, cssWidth);

  engine.render(params, scale);
  engine.dispose();

  return canvas;
}
