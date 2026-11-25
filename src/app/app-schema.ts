import { defineToolcraft } from "@/toolcraft/runtime";

export const appSchema = defineToolcraft({
  canvas: {
    enabled: true,
    renderScale: true,
    sizing: { mode: "editable-output" },
    upload: true,
  },
  panels: {
    controls: {
      sections: [
        {
          controls: {
            sourceImage: {
              assetKind: "image",
              description:
                "The photo the Color Halftone effect converts into rotated Cyan, Magenta, Yellow, and Black dot screens.",
              label: "Photo",
              orderRole: "input",
              performanceReason:
                "A larger uploaded photo increases the cost of the decode and cover-fit passes that build the halftone shader's source texture.",
              performanceRole: "workload",
              target: "source.image",
              type: "fileDrop",
            },
          },
          title: "Source",
        },
        {
          controls: {
            zoom: {
              defaultValue: 100,
              description:
                "Scales the photo further inward from its cover-fit crop so you can reframe before the halftone effect is applied.",
              label: "Zoom",
              max: 300,
              min: 100,
              orderRole: "strength",
              performanceReason:
                "Zoom only transforms the UV coordinate sampled from the already cover-fit source texture inside the shader; it does not re-run the CPU decode/cover-fit pass or change per-pixel cost class.",
              performanceRole: "responsiveness",
              step: 1,
              target: "framing.zoom",
              type: "slider",
              unit: "%",
            },
          },
          title: "Zoom",
        },
        {
          controls: {
            maxRadius: {
              defaultValue: 1,
              description:
                "Largest possible halftone dot radius, matching Photoshop's Color Halftone Max Radius control.",
              label: "Max Radius",
              max: 50,
              min: 1,
              orderRole: "primary",
              performanceReason:
                "Smaller Max Radius values increase dot-edge antialiasing sample density per grid cell across the whole canvas, so it is workload-classified with measured min/default/max drag coverage.",
              performanceRole: "workload",
              step: 1,
              target: "halftone.maxRadius",
              type: "slider",
              unit: "px",
            },
            dotShape: {
              defaultValue: "circle",
              label: "Dot Shape",
              options: [
                { label: "Circle", value: "circle" },
                { label: "Square", value: "square" },
                { label: "Diamond", value: "diamond" },
                { label: "Line", value: "line" },
              ],
              orderRole: "primary",
              performanceReason:
                "Dot shape swaps the shader's per-cell distance function without changing grid density or per-pixel work.",
              performanceRole: "responsiveness",
              target: "halftone.dotShape",
              type: "segmented",
            },
          },
          title: "Halftone",
        },
        {
          controls: {
            cyanEnabled: {
              defaultValue: true,
              label: "Cyan",
              orderRole: "mode",
              performanceReason:
                "Disabling a channel removes one shader branch; it does not change the per-pixel cost class.",
              performanceRole: "responsiveness",
              target: "channels.cyan.enabled",
              type: "switch",
            },
            magentaEnabled: {
              defaultValue: true,
              label: "Magenta",
              orderRole: "mode",
              performanceReason:
                "Disabling a channel removes one shader branch; it does not change the per-pixel cost class.",
              performanceRole: "responsiveness",
              target: "channels.magenta.enabled",
              type: "switch",
            },
            yellowEnabled: {
              defaultValue: true,
              label: "Yellow",
              orderRole: "mode",
              performanceReason:
                "Disabling a channel removes one shader branch; it does not change the per-pixel cost class.",
              performanceRole: "responsiveness",
              target: "channels.yellow.enabled",
              type: "switch",
            },
            blackEnabled: {
              defaultValue: true,
              label: "Black",
              orderRole: "mode",
              performanceReason:
                "Disabling a channel removes one shader branch; it does not change the per-pixel cost class.",
              performanceRole: "responsiveness",
              target: "channels.black.enabled",
              type: "switch",
            },
            blackGeneration: {
              defaultValue: "additive",
              description:
                "GCR removes the black component from cyan, magenta, and yellow ink so shadows are not over-inked. Additive keeps full-strength CMY beneath the black dots for a richer, more saturated shadow color.",
              label: "Black Generation",
              options: [
                { label: "GCR", value: "gcr" },
                { label: "Additive", value: "additive" },
              ],
              orderRole: "mode",
              performanceReason:
                "Black generation only changes which pre-sampled ink value the shader mixes; it does not add per-pixel cost.",
              performanceRole: "responsiveness",
              target: "channels.blackGeneration",
              type: "segmented",
              visibleWhen: { equals: true, target: "channels.black.enabled" },
            },
          },
          title: "Channels",
        },
        {
          controls: {
            cyanAngle: {
              defaultValue: 160,
              label: "Cyan Angle",
              max: 180,
              min: 0,
              performanceReason:
                "Screen angle only rotates the shader's per-pixel coordinate math; it does not change the number of pixels evaluated.",
              performanceRole: "responsiveness",
              step: 1,
              orderRole: "strength",
              target: "angles.cyan",
              type: "slider",
              unit: "°",
              visibleWhen: { equals: true, target: "channels.cyan.enabled" },
            },
            magentaAngle: {
              defaultValue: 162,
              label: "Magenta Angle",
              max: 180,
              min: 0,
              performanceReason:
                "Screen angle only rotates the shader's per-pixel coordinate math; it does not change the number of pixels evaluated.",
              performanceRole: "responsiveness",
              step: 1,
              orderRole: "strength",
              target: "angles.magenta",
              type: "slider",
              unit: "°",
              visibleWhen: { equals: true, target: "channels.magenta.enabled" },
            },
            yellowAngle: {
              defaultValue: 90,
              label: "Yellow Angle",
              max: 180,
              min: 0,
              performanceReason:
                "Screen angle only rotates the shader's per-pixel coordinate math; it does not change the number of pixels evaluated.",
              performanceRole: "responsiveness",
              step: 1,
              orderRole: "strength",
              target: "angles.yellow",
              type: "slider",
              unit: "°",
              visibleWhen: { equals: true, target: "channels.yellow.enabled" },
            },
            blackAngle: {
              defaultValue: 45,
              label: "Black Angle",
              max: 180,
              min: 0,
              performanceReason:
                "Screen angle only rotates the shader's per-pixel coordinate math; it does not change the number of pixels evaluated.",
              performanceRole: "responsiveness",
              step: 1,
              orderRole: "strength",
              target: "angles.black",
              type: "slider",
              unit: "°",
              visibleWhen: { equals: true, target: "channels.black.enabled" },
            },
          },
          title: "Screen Angles",
        },
        {
          controls: {
            contrast: {
              defaultValue: 16,
              description:
                "Punches up the dot pattern by increasing tonal separation before the image is converted to ink coverage.",
              label: "Contrast",
              max: 100,
              min: -100,
              orderRole: "strength",
              performanceReason:
                "Contrast only rescales sampled ink density inside the shader; cost stays O(1) per pixel.",
              performanceRole: "responsiveness",
              step: 1,
              target: "tone.contrast",
              type: "slider",
              unit: "%",
            },
            brightness: {
              defaultValue: -5,
              label: "Brightness",
              max: 100,
              min: -100,
              orderRole: "strength",
              performanceReason:
                "Brightness only offsets sampled ink density inside the shader; cost stays O(1) per pixel.",
              performanceRole: "responsiveness",
              step: 1,
              target: "tone.brightness",
              type: "slider",
              unit: "%",
            },
            invert: {
              defaultValue: false,
              label: "Invert",
              orderRole: "advanced",
              performanceReason:
                "Invert flips a single shader branch before tone mapping and does not add per-pixel cost.",
              performanceRole: "responsiveness",
              target: "tone.invert",
              type: "switch",
            },
          },
          title: "Tone",
        },
        {
          controls: {
            fillStyle: {
              defaultValue: "solid",
              description:
                "Choose whether the composite's background behind the ink dots is the flat Background color below or an adjustable gradient.",
              label: "Fill Style",
              options: [
                { label: "Solid", value: "solid" },
                { label: "Gradient", value: "gradient" },
              ],
              orderRole: "mode",
              performanceReason:
                "Fill Style only switches which background uniform/texture the shader samples; it does not change per-pixel cost class.",
              performanceRole: "responsiveness",
              target: "appearance.fillStyle",
              type: "segmented",
            },
            backgroundGradient: {
              defaultValue: {
                angle: 90,
                gradientType: "linear",
                stops: [
                  { color: "#FFFFFF", position: "0%" },
                  { color: "#D9D9D9", position: "100%" },
                ],
              },
              label: "Gradient",
              orderRole: "color",
              performanceReason:
                "Gradient stops rasterize into a small cached background texture that only re-renders when the gradient type, angle, or stops change, independent of canvas/export pixel count.",
              performanceRole: "responsiveness",
              target: "appearance.backgroundGradient",
              type: "gradient",
              visibleWhen: { equals: "gradient", target: "appearance.fillStyle" },
            },
          },
          title: "Appearance",
        },
        {
          controls: {
            includeBackground: {
              defaultValue: true,
              label: "Include",
              orderRole: "mode",
              performanceReason:
                "Toggling background inclusion only changes a shader uniform and the output alpha blend, not pixel count.",
              performanceRole: "responsiveness",
              target: "export.includeBackground",
              type: "switch",
            },
            backgroundColor: {
              defaultValue: "#FFFFFF",
              label: false,
              orderRole: "color",
              performanceReason: "Background color only changes a shader uniform.",
              performanceRole: "responsiveness",
              target: "appearance.background",
              type: "color",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["includeBackground", "backgroundColor"],
              layout: "inline",
            },
          ],
          title: "Background",
        },
        {
          controls: {
            format: {
              defaultValue: "png",
              label: "Format",
              options: [
                { label: "PNG", value: "png" },
                { label: "JPG", value: "jpg" },
              ],
              orderRole: "mode",
              performanceReason:
                "Selecting an export format does not change renderer cost until the export action runs.",
              performanceRole: "responsiveness",
              target: "export.image.format",
              type: "select",
            },
            resolution: {
              defaultValue: "4k",
              label: "Resolution",
              options: [
                { label: "2K", value: "2k" },
                { label: "4K", value: "4k" },
                { label: "8K", value: "8k" },
              ],
              orderRole: "mode",
              performanceReason:
                "Higher export resolution increases the pixel count the shader and cover-fit pass must render during Export PNG.",
              performanceRole: "workload",
              target: "export.image.resolution",
              type: "select",
            },
          },
          layoutGroups: [
            {
              columns: 2,
              controls: ["format", "resolution"],
              layout: "inline",
            },
          ],
          title: "Image Export",
        },
        {
          controls: {
            footerActions: {
              actions: [
                { icon: "upload-simple", label: "Export PNG", value: "export-png" },
              ],
              target: "panel.actions",
              type: "panelActions",
            },
          },
          title: "Export",
        },
      ],
      title: "Controls",
    },
  },
  toolbar: {
    history: true,
    radar: true,
    theme: true,
    zoom: true,
  },
});
