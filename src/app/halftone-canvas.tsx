"use client";

import * as React from "react";

import { shouldIncludeToolcraftPreviewBackground } from "@/toolcraft/runtime";
import { useToolcraft } from "@/toolcraft/runtime/react";

import { getHalftoneUploadCanvasSize } from "./halftone/canvas-size";
import { createToolcraftMediaCoverFitCanvas } from "./halftone/cover-fit";
import { createHalftoneGLEngine, type HalftoneGLEngine } from "./halftone/gl-engine";
import { HALFTONE_CONTROL_TARGETS, readHalftoneParamsFromValues } from "./halftone/params";
import { decodeToolcraftHalftoneSourceImage } from "./halftone/render-source";

/**
 * Product renderer for the color halftone canvas. Two independent effects
 * keep the render pipeline cheap:
 *
 * - the "source" effect only re-runs on media import, image transform, or
 *   canvas/backing size change. It decodes the uploaded photo (cached by
 *   data URL), cover-fits it into a 2D canvas at the exact backing pixel
 *   size, and uploads that bitmap as the WebGL texture.
 * - the "draw" effect runs on every halftone control change (radius,
 *   angles, channel toggles, black generation, dot shape, tone, invert,
 *   background). It only updates shader uniforms and issues one draw call,
 *   coalesced to a single `requestAnimationFrame`, so dragging any slider
 *   never re-decodes or re-uploads the source image.
 */
export function HalftoneCanvas(): React.JSX.Element | null {
  const { dispatch, state } = useToolcraft();
  const engineRef = React.useRef<HalftoneGLEngine | null>(null);
  const decodedImageCacheRef = React.useRef<Map<string, HTMLImageElement>>(new Map());
  const sourceRequestIdRef = React.useRef(0);
  const drawRafRef = React.useRef<number | null>(null);
  // Tracks which uploaded photo's natural aspect ratio has already been
  // adopted into canvas.size, so the adoption below fires exactly once per
  // new/replacement upload (see "Canvas size follows upload" in
  // docs/toolcraft/agent-worklog.md) and never fights a user's later manual
  // Aspect ratio / Canvas width / Canvas height edit. Keyed on `dataUrl`
  // rather than `id`: replacing a single-source-target image reuses the same
  // media id (see reducer.ts's `media.import` -- `shouldReplaceSingleLayerMedia`
  // keeps `existingSourceMediaAsset.id`), so `id` alone cannot detect a
  // replacement upload.
  const adoptedAspectDataUrlRef = React.useRef<string | null>(null);
  const aspectAdoptCounterRef = React.useRef(0);
  // The <canvas> element only mounts once a source photo exists (this
  // component returns null before that), so engine creation cannot live in
  // a mount-only `useEffect(() => {}, [])` -- that effect would run once
  // while the ref is still null and never fire again. A callback ref fires
  // synchronously during commit whenever the node itself appears/disappears,
  // and bumping `engineReadyVersion` lets the effects below (which run in
  // the same pass) know a fresh engine is ready to receive a source/draw.
  const [engineReadyVersion, setEngineReadyVersion] = React.useState(0);
  const canvasRefCallback = React.useCallback((node: HTMLCanvasElement | null) => {
    if (engineRef.current) {
      engineRef.current.dispose();
      engineRef.current = null;
    }

    if (node) {
      engineRef.current = createHalftoneGLEngine(node);
    }

    setEngineReadyVersion((version) => version + 1);
  }, []);

  const mediaAsset = state.mediaAssets.find(
    (asset) => asset.sourceTarget === HALFTONE_CONTROL_TARGETS.sourceImage,
  );
  const cssWidth = state.canvas.size.width;
  const cssHeight = state.canvas.size.height;
  const renderScaleValue = Number(
    state.values["canvas.renderScale"] ?? state.schema.canvas.renderScale.defaultValue ?? 2,
  );
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const scale = Math.max(1, Number.isFinite(renderScaleValue) ? renderScaleValue : 2) * devicePixelRatio;
  const params: ReturnType<typeof readHalftoneParamsFromValues> = {
    ...readHalftoneParamsFromValues(state.values),
    // Live preview specifically hides the product background when Include is
    // off, through the shared runtime helper (export keeps its own explicit
    // includeBackground value so PNG export always reflects the control).
    includeBackground: shouldIncludeToolcraftPreviewBackground({ state }),
  };
  const paramsKey = JSON.stringify(params);

  const transformKey = mediaAsset?.transform
    ? `${mediaAsset.transform.rotationDeg ?? 0}:${mediaAsset.transform.flipHorizontal ?? false}:${mediaAsset.transform.flipVertical ?? false}`
    : "none";

  const mediaAssetDataUrl = mediaAsset?.dataUrl;
  const naturalWidth = mediaAsset?.size?.width;
  const naturalHeight = mediaAsset?.size?.height;

  // On every new photo upload (including replacing an existing photo), set
  // the canvas's *initial* size/aspect ratio to match that photo so there is
  // no unwanted default crop -- canvas.size stays a fully user-editable
  // editable-output value afterward via the runtime Setup Aspect
  // ratio/Canvas width/Canvas height controls (this dispatches through the
  // exact same "controls.setValue" command those fields use). See "Canvas
  // size follows upload" in docs/toolcraft/agent-worklog.md.
  React.useEffect(() => {
    if (!mediaAssetDataUrl || !naturalWidth || !naturalHeight) {
      return;
    }

    if (adoptedAspectDataUrlRef.current === mediaAssetDataUrl) {
      return;
    }

    adoptedAspectDataUrlRef.current = mediaAssetDataUrl;

    const targetSize = getHalftoneUploadCanvasSize(naturalWidth, naturalHeight);

    if (
      !targetSize ||
      (targetSize.width === cssWidth && targetSize.height === cssHeight)
    ) {
      return;
    }

    const historyGroup = `photo-aspect-adopt:${(aspectAdoptCounterRef.current += 1)}`;

    dispatch({
      history: "merge",
      historyGroup,
      label: "Adopt photo aspect ratio",
      target: "canvas.size.width",
      type: "controls.setValue",
      value: targetSize.width,
    });
    dispatch({
      history: "merge",
      historyGroup,
      label: "Adopt photo aspect ratio",
      target: "canvas.size.height",
      type: "controls.setValue",
      value: targetSize.height,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaAssetDataUrl, naturalWidth, naturalHeight, dispatch]);

  const scheduleDraw = React.useCallback(() => {
    if (drawRafRef.current !== null) {
      cancelAnimationFrame(drawRafRef.current);
    }

    drawRafRef.current = requestAnimationFrame(() => {
      drawRafRef.current = null;

      const engine = engineRef.current;

      if (!engine) {
        return;
      }

      const backingWidth = Math.round(cssWidth * scale);
      const backingHeight = Math.round(cssHeight * scale);

      engine.setSize(cssWidth, cssHeight, backingWidth, backingHeight);
      engine.render(params, scale);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cssWidth, cssHeight, scale, paramsKey]);

  // Expensive pass: decode + cover-fit + texture upload. Only depends on the
  // source image identity/transform and the backing pixel size, never on
  // halftone tuning controls.
  React.useEffect(() => {
    const engine = engineRef.current;

    if (!engine) {
      return undefined;
    }

    const backingWidth = Math.round(cssWidth * scale);
    const backingHeight = Math.round(cssHeight * scale);

    engine.setSize(cssWidth, cssHeight, backingWidth, backingHeight);

    if (!mediaAsset) {
      scheduleDraw();
      return undefined;
    }

    const requestId = sourceRequestIdRef.current + 1;
    sourceRequestIdRef.current = requestId;
    let cancelled = false;

    async function run(): Promise<void> {
      const cache = decodedImageCacheRef.current;
      let image = cache.get(mediaAsset!.dataUrl);

      if (!image) {
        image = await decodeToolcraftHalftoneSourceImage(mediaAsset!.dataUrl);

        if (cancelled || sourceRequestIdRef.current !== requestId) {
          return;
        }

        cache.set(mediaAsset!.dataUrl, image);
      }

      if (cancelled || sourceRequestIdRef.current !== requestId) {
        return;
      }

      const coverFitCanvas = createToolcraftMediaCoverFitCanvas({
        containerCssHeight: cssHeight,
        containerCssWidth: cssWidth,
        image,
        imageHeight: image.naturalHeight || image.height,
        imageWidth: image.naturalWidth || image.width,
        pixelHeight: backingHeight,
        pixelWidth: backingWidth,
        transform: mediaAsset!.transform,
      });

      if (cancelled || sourceRequestIdRef.current !== requestId) {
        return;
      }

      engineRef.current?.setSource(coverFitCanvas);
      scheduleDraw();
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mediaAsset?.id,
    mediaAsset?.dataUrl,
    transformKey,
    cssWidth,
    cssHeight,
    scale,
    engineReadyVersion,
  ]);

  // Cheap pass: redraw on every halftone control change without touching
  // the decode/preprocess/texture-upload pipeline above.
  React.useEffect(() => {
    scheduleDraw();
  }, [scheduleDraw, engineReadyVersion]);

  React.useEffect(
    () => () => {
      if (drawRafRef.current !== null) {
        cancelAnimationFrame(drawRafRef.current);
      }
    },
    [],
  );

  if (!mediaAsset) {
    return null;
  }

  return (
    <canvas
      data-toolcraft-product-output=""
      ref={canvasRefCallback}
      style={{
        display: "block",
        height: cssHeight,
        width: cssWidth,
      }}
    />
  );
}
