# Rosette Color Halftone — Product Spec

Converts an uploaded photo into a CMYK color halftone print effect, replicating Adobe Photoshop's "Color Halftone" filter the way https://www.photoshopessentials.com/photo-effects/get-better-color-halftone-effects-in-photoshop/ describes getting it to look correct: the photo is approximated in CMY(K) ink space, then four independent dot screens (Cyan, Magenta, Yellow, Black), each rotated to its own screen angle, are rendered with dot size driven by that channel's local ink coverage and composited with a multiply blend — the rosette pattern real halftone-printed color separations form.

Confirmed real Photoshop Color Halftone defaults: Max Radius 8px, Channel 1 (Cyan) 108°, Channel 2 (Magenta) 162°, Channel 3 (Yellow) 90°, Channel 4 (Black) 45°.

## Controls

Source (`fileDrop` "Photo"); Halftone (Max Radius `slider`, Dot Shape `segmented`); Channels (Cyan/Magenta/Yellow/Black enable `switch`, Black Generation `segmented` GCR/Additive); Screen Angles (4 `slider`, each `visibleWhen` its channel's enable switch); Tone (Contrast/Brightness `slider`, Invert `switch`); the mandatory Background and Image Export sections; sticky `panelActions` Export PNG.

## Renderer Technique Decision Matrix

- sourceRepresentation: image-media
- productRepresentation: pixel
- previewRenderer: webgl
- exportRenderer: webgl
- rendererWorkload: pixel-output
- rendererStrategy: webgl
- whyNotAlternativeStrategies:
  - Canvas 2D per-pixel/per-dot drawing was rejected. `renderer-technique.md` requires evaluating WebGL/WebGPU before Canvas 2D for halftone/per-pixel image-processing workloads. The rotated-grid amplitude-modulated dot screen maps directly onto one GPU fragment-shader pass with cost independent of dot density, which a CPU per-pixel or per-dot Canvas 2D loop cannot match at 4K+ canvas sizes without frame drops. text-output and vector-output strategies do not apply because this product's rendererWorkload is pixel-output, not text or vector.
  - WebGPU was rejected because the workload is a single draw call with no compute-shader or multi-pass requirement, so WebGL1's universally supported feature set is sufficient; WebGPU would add capability-detection complexity with no measured benefit for one fullscreen triangle. exportRenderer stays webgl (not a second code path) so export/copy PNG bytes keep the same product-quality pixel fidelity as the live preview.
- fidelityRisks: WebGL1 has no CPU (Canvas 2D) fallback renderer; dot-edge antialiasing uses a fixed-width smoothstep band rather than supersampling.
- performanceRisks: large uploaded source photos, 8K PNG export, and very small Max Radius values each increase measured render/export cost; each is bounded by a dedicated performance scenario in `src/app/app-performance.ts`.

## Renderer Layer Inventory

One visible product layer: `product-foreground` (`rendererTechnique.layers[0]`, uiSelector `[data-toolcraft-product-output]`, content `bitmap-media` + `shader`, renderer `webgl`, exportMode `included`). There is no separate `backgroundLayer` — the paper/background fill is painted in the same shader pass as the ink dots (`u_includeBackground`/`u_backgroundColor` uniforms) rather than a second layer. There is no `editingHandlesLayer` (no on-canvas handles) and no separate `exportComposite` layer built from multiple layers — export re-renders the single `productForegroundLayer` pass once at the selected export resolution instead of compositing.

## Render Pipeline Inventory

Render passes (see `src/app/app-performance.ts` `rendererPipeline.passes`):

1. `decode-source` (kind `decode`, runsOn `main`) — decodes the uploaded photo. `cacheKey: mediaAsset.dataUrl`.
2. `cover-fit` (kind `preprocess`, runsOn `main`) — cover-fit composites the decoded photo (respecting rotate/flip transform) into an offscreen 2D canvas sized to the current backing pixel resolution. `cacheKey: mediaAsset.dataUrl, mediaAsset.transform, canvas.size.width, canvas.size.height, canvas.renderScale`.
3. `halftone-shader` (kind `pixel-transform`, runsOn `gpu`) — the WebGL fragment shader; every halftone/tone/background control is an input and invalidates this pass and only this pass.
4. `halftone-export` (kind `export`, runsOn `gpu`) — re-runs decode + the shader at the selected `export.image.resolution` pixel size.

`interactionInvalidation` entries cover `control-drag`, `control-change`, `media-import`, `export`, `viewport-drag`, and `viewport-zoom` (the latter two are exercised by the `viewport-zoom-stress` performance scenario). `control-drag` and `control-change` interactions `mustNotInvalidate` the `decode-source`/`cover-fit` passes — only `media-import` invalidates those — so dragging any slider only touches the cheap `pixel-transform` pass. `viewport-drag`/`viewport-zoom` invalidate nothing (canvas pan/zoom is a CSS transform on the runtime canvas world, not a renderer input).
