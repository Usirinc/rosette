import {
  createToolcraftPngExportCanvas,
  getToolcraftImageExportSize,
} from "@/toolcraft/runtime";
import {
  ToolcraftApp,
  type ToolcraftPanelActionContext,
} from "@/toolcraft/runtime/react";

import { appSchema } from "../app/app-schema";
import { HalftoneCanvas } from "../app/halftone-canvas";
import { renderToolcraftHalftoneToCanvas } from "../app/halftone/export";
import { HALFTONE_CONTROL_TARGETS, readHalftoneParamsFromValues } from "../app/halftone/params";
import { RosetteOnboarding } from "../app/onboarding";

async function handlePanelAction({
  action,
  reportProgress,
  state,
}: ToolcraftPanelActionContext): Promise<void> {
  if (action.value !== "export-png") {
    return;
  }

  reportProgress(0.05);

  const mediaAsset = state.mediaAssets.find(
    (asset) => asset.sourceTarget === HALFTONE_CONTROL_TARGETS.sourceImage,
  );
  const params = readHalftoneParamsFromValues(state.values);
  // Read directly from the "export.image.resolution" / "export.image.format"
  // runtime targets (matching HALFTONE_CONTROL_TARGETS.exportResolution /
  // .exportFormat) so the selected Image Export resolution and format reach
  // the PNG export helper below.
  const imageExportResolution = String(state.values["export.image.resolution"] ?? "4k");
  const format = String(state.values["export.image.format"] ?? "png");
  const exportSize = getToolcraftImageExportSize({ resolution: imageExportResolution, state });

  const rendered = await renderToolcraftHalftoneToCanvas({
    cssHeight: state.canvas.size.height,
    cssWidth: state.canvas.size.width,
    mediaAsset,
    params,
    pixelHeight: exportSize.height,
    pixelWidth: exportSize.width,
  });

  reportProgress(0.55);

  const exportCanvas = createToolcraftPngExportCanvas({
    background: params.backgroundColor,
    includeBackground: params.includeBackground,
    render: ({ context, cssHeight, cssWidth }) => {
      context.drawImage(rendered, 0, 0, cssWidth, cssHeight);
    },
    resolution: imageExportResolution,
    state,
  });

  reportProgress(0.8);

  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    exportCanvas.toBlob(
      (value) => {
        if (value) {
          resolve(value);
        } else {
          reject(new Error("Export PNG could not create image data."));
        }
      },
      mimeType,
      mimeType === "image/jpeg" ? 0.92 : undefined,
    );
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `color-halftone.${format === "jpg" ? "jpg" : "png"}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  reportProgress(1);
}

export function AppHome(): React.JSX.Element {
  return (
    <>
      <ToolcraftApp
        canvasContent={<HalftoneCanvas />}
        className="h-dvh min-h-dvh"
        onPanelAction={handlePanelAction}
        renderDefaultCanvasMedia={false}
        schema={appSchema}
      />
      <RosetteOnboarding />
    </>
  );
}
