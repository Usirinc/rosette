/**
 * When a photo is uploaded, the product canvas adopts that photo's own
 * aspect ratio as the *initial* `canvas.size` (still `editable-output`, so
 * Aspect ratio / Canvas width / Canvas height stay fully user-editable
 * afterward) instead of silently cover-cropping it into whatever aspect
 * ratio the canvas happened to be at. See the "Canvas size follows upload"
 * decision in docs/toolcraft/agent-worklog.md for the full rationale.
 *
 * The adopted CSS canvas size is capped on its long edge so the live-preview
 * WebGL backing buffer (canvas.size * canvas.renderScale * devicePixelRatio)
 * cannot balloon for a raw high-megapixel photo. 2048px matches this app's
 * own "2K" Image Export tier -- a real photo edge length this app already
 * treats as a normal working size -- and stays well under the 8192px this
 * app's own 8K export path already exercises, so the cap is conservative
 * relative to precedent already covered by this app's performance budgets.
 * Full-resolution export quality is unaffected: Image Export always
 * re-renders the whole pipeline at the selected 2K/4K/8K export resolution
 * (see export.ts), independent of this smaller live-preview working size.
 */
export const HALFTONE_UPLOAD_CANVAS_LONG_EDGE_CAP_PX = 2048;

export type HalftoneCanvasSize = { height: number; width: number };

export function getHalftoneUploadCanvasSize(
  naturalWidth: number,
  naturalHeight: number,
  longEdgeCapPx: number = HALFTONE_UPLOAD_CANVAS_LONG_EDGE_CAP_PX,
): HalftoneCanvasSize | null {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }

  const longEdge = Math.max(naturalWidth, naturalHeight);
  const scale = longEdge > longEdgeCapPx ? longEdgeCapPx / longEdge : 1;

  return {
    height: Math.max(1, Math.round(naturalHeight * scale)),
    width: Math.max(1, Math.round(naturalWidth * scale)),
  };
}
