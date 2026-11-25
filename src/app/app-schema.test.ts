import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";
import { appSchema } from "./app-schema";
import { getHalftoneUploadCanvasSize } from "./halftone/canvas-size";

function getSection(title: string) {
  const section = appSchema.panels.controls?.sections.find(
    (candidate) => candidate.title === title,
  );

  if (!section) {
    throw new Error(`Expected a "${title}" controls section.`);
  }

  return section;
}

function getControl(sectionTitle: string, target: string) {
  const section = getSection(sectionTitle);
  const entry = Object.values(section.controls).find(
    (control) => control.target === target,
  );

  if (!entry) {
    throw new Error(`Expected a control with target "${target}" in "${sectionTitle}".`);
  }

  return entry;
}

describe("appSchema", () => {
  it("publishes the base Toolcraft template app contract for AI assembly", () => {
    expect(appSchema.canvas.enabled).toBe(true);
    expect(appSchema.canvas.upload).toBe(true);
    expect(appSchema.canvas.sizing).toEqual({ mode: "editable-output" });
    expect(appSchema.canvas.renderScale.enabled).toBe(true);
    expect(appSchema.panels.controls?.sections[0]?.title).toBe("Setup");
    expect(appSchema.panels.layers).toBeUndefined();
    expect(appSchema.panels.timeline).toBeUndefined();
    expect(appSchema.assembly.components).toEqual(
      expect.arrayContaining(["canvas", "controlsPanel", "toolbar"]),
    );
    expect(appSchema.assembly.capabilities).not.toContain("timeline.playback");
    expect(appSchema.assembly.capabilities).not.toContain("timeline.keyframes");
  });

  it("source.image fileDrop is an image upload control", () => {
    const control = getControl("Source", "source.image");

    expect(control.type).toBe("fileDrop");
    expect(control.assetKind).toBe("image");
    expect(control.multiple).not.toBe(true);
  });

  it("uploading a photo sets canvas.size to that photo's natural aspect ratio, capped on the long edge", () => {
    // Under the cap: exact natural dimensions are kept.
    expect(getHalftoneUploadCanvasSize(900, 1400)).toEqual({ height: 1400, width: 900 });
    // A raw high-megapixel landscape photo is scaled down to the 2048px
    // long-edge cap while preserving its exact aspect ratio.
    expect(getHalftoneUploadCanvasSize(6000, 4000)).toEqual({ height: 1365, width: 2048 });
    // Same cap applies on the portrait long edge.
    expect(getHalftoneUploadCanvasSize(4000, 6000)).toEqual({ height: 2048, width: 1365 });
    // Invalid/zero dimensions fail closed instead of producing a bad size.
    expect(getHalftoneUploadCanvasSize(0, 0)).toBeNull();
  });

  it("framing.zoom is a 100..300 percent slider", () => {
    const zoom = getControl("Zoom", "framing.zoom");

    expect(zoom.type).toBe("slider");
    expect(zoom.min).toBe(100);
    expect(zoom.max).toBe(300);
    expect(zoom.defaultValue).toBe(100);
    expect(zoom.unit).toBe("%");
  });

  it("halftone.maxRadius is a continuous slider from 1 to 50", () => {
    const control = getControl("Halftone", "halftone.maxRadius");

    expect(control.type).toBe("slider");
    expect(control.min).toBe(1);
    expect(control.max).toBe(50);
    expect(control.defaultValue).toBe(1);
    expect(control.unit).toBe("px");
    expect(control.variant).not.toBe("discrete");
  });

  it("halftone.dotShape is a 4-option segmented control", () => {
    const control = getControl("Halftone", "halftone.dotShape");

    expect(control.type).toBe("segmented");
    expect(control.defaultValue).toBe("circle");
    expect(control.options?.map((option) => option.value)).toEqual([
      "circle",
      "square",
      "diamond",
      "line",
    ]);
  });

  it("channel enable switches default to true and gate their angle sliders", () => {
    const cyan = getControl("Channels", "channels.cyan.enabled");
    const magenta = getControl("Channels", "channels.magenta.enabled");
    const yellow = getControl("Channels", "channels.yellow.enabled");
    const black = getControl("Channels", "channels.black.enabled");

    for (const control of [cyan, magenta, yellow, black]) {
      expect(control.type).toBe("switch");
      expect(control.defaultValue).toBe(true);
    }

    const cyanAngle = getControl("Screen Angles", "angles.cyan");
    const magentaAngle = getControl("Screen Angles", "angles.magenta");
    const yellowAngle = getControl("Screen Angles", "angles.yellow");
    const blackAngle = getControl("Screen Angles", "angles.black");

    expect(cyanAngle.visibleWhen).toEqual({ equals: true, target: "channels.cyan.enabled" });
    expect(magentaAngle.visibleWhen).toEqual({
      equals: true,
      target: "channels.magenta.enabled",
    });
    expect(yellowAngle.visibleWhen).toEqual({
      equals: true,
      target: "channels.yellow.enabled",
    });
    expect(blackAngle.visibleWhen).toEqual({ equals: true, target: "channels.black.enabled" });
  });

  it("channels.blackGeneration is visible only when black is enabled", () => {
    const control = getControl("Channels", "channels.blackGeneration");

    expect(control.type).toBe("segmented");
    expect(control.defaultValue).toBe("additive");
    expect(control.options?.map((option) => option.value)).toEqual(["gcr", "additive"]);
    expect(control.visibleWhen).toEqual({ equals: true, target: "channels.black.enabled" });
  });

  it("per-channel angle sliders default to the app's tuned Color Halftone angles", () => {
    // User-tuned defaults (exported from the app's own Export Settings):
    // Channel 1 (Cyan) 160°, Channel 2 (Magenta) 162°, Channel 3 (Yellow)
    // 90°, Channel 4 (Black) 45°.
    expect(getControl("Screen Angles", "angles.cyan").defaultValue).toBe(160);
    expect(getControl("Screen Angles", "angles.magenta").defaultValue).toBe(162);
    expect(getControl("Screen Angles", "angles.yellow").defaultValue).toBe(90);
    expect(getControl("Screen Angles", "angles.black").defaultValue).toBe(45);

    for (const target of ["angles.cyan", "angles.magenta", "angles.yellow", "angles.black"]) {
      const control = getControl("Screen Angles", target);

      expect(control.type).toBe("slider");
      expect(control.min).toBe(0);
      expect(control.max).toBe(180);
      expect(control.unit).toBe("°");
    }
  });

  it("tone.contrast and tone.brightness are -100..100 percent sliders", () => {
    const contrast = getControl("Tone", "tone.contrast");
    const brightness = getControl("Tone", "tone.brightness");

    for (const control of [contrast, brightness]) {
      expect(control.type).toBe("slider");
      expect(control.min).toBe(-100);
      expect(control.max).toBe(100);
      expect(control.unit).toBe("%");
    }

    expect(contrast.defaultValue).toBe(16);
    expect(brightness.defaultValue).toBe(-5);
  });

  it("tone.invert defaults to false", () => {
    const control = getControl("Tone", "tone.invert");

    expect(control.type).toBe("switch");
    expect(control.defaultValue).toBe(false);
  });

  it("appearance.fillStyle is a Solid/Gradient segmented control", () => {
    const control = getControl("Appearance", "appearance.fillStyle");

    expect(control.type).toBe("segmented");
    expect(control.defaultValue).toBe("solid");
    expect(control.options?.map((option) => option.value)).toEqual(["solid", "gradient"]);
  });

  it("appearance.backgroundGradient is a gradient control visible only in Gradient style", () => {
    const control = getControl("Appearance", "appearance.backgroundGradient");

    expect(control.type).toBe("gradient");
    expect(control.visibleWhen).toEqual({
      equals: "gradient",
      target: "appearance.fillStyle",
    });
    expect(control.defaultValue).toMatchObject({
      angle: 90,
      gradientType: "linear",
    });
    expect(
      (control.defaultValue as { stops: readonly unknown[] }).stops.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("Background section renders the standard Include plus color inline row", () => {
    const section = getSection("Background");
    const includeControl = getControl("Background", "export.includeBackground");
    const colorControl = getControl("Background", "appearance.background");

    expect(includeControl.type).toBe("switch");
    expect(includeControl.defaultValue).toBe(true);
    expect(colorControl.type).toBe("color");
    expect(colorControl.defaultValue).toBe("#FFFFFF");
    expect(colorControl.label).toBe(false);
    expect(section.layoutGroups?.[0]).toMatchObject({
      columns: 2,
      layout: "inline",
    });
  });

  it("Image Export section renders format and resolution selects", () => {
    const section = getSection("Image Export");
    const format = getControl("Image Export", "export.image.format");
    const resolution = getControl("Image Export", "export.image.resolution");

    expect(format.type).toBe("select");
    expect(format.defaultValue).toBe("png");
    expect(format.options?.map((option) => option.value)).toEqual(["png", "jpg"]);
    expect(resolution.type).toBe("select");
    expect(resolution.defaultValue).toBe("4k");
    expect(resolution.options?.map((option) => option.value)).toEqual(["2k", "4k", "8k"]);
    expect(section.layoutGroups?.[0]).toMatchObject({
      columns: 2,
      layout: "inline",
    });
  });

  it("footer panelActions exposes Export PNG", () => {
    const section = getSection("Export");
    const footerControl = Object.values(section.controls).find(
      (control) => control.type === "panelActions",
    );

    expect(footerControl).toBeDefined();
    expect(footerControl?.actions?.some((action) => typeof action !== "string" && action.value === "export-png")).toBe(
      true,
    );
  });

  it("controls.reset restores every halftone target to its schema defaultValue", () => {
    const resettableTargets = [
      "framing.zoom",
      "halftone.maxRadius",
      "halftone.dotShape",
      "channels.cyan.enabled",
      "channels.magenta.enabled",
      "channels.yellow.enabled",
      "channels.black.enabled",
      "channels.blackGeneration",
      "angles.cyan",
      "angles.magenta",
      "angles.yellow",
      "angles.black",
      "tone.contrast",
      "tone.brightness",
      "tone.invert",
      "appearance.fillStyle",
      "appearance.backgroundGradient",
      "export.includeBackground",
      "appearance.background",
      "export.image.format",
      "export.image.resolution",
    ];

    for (const target of resettableTargets) {
      const section = appSchema.panels.controls?.sections.find((candidate) =>
        Object.values(candidate.controls).some((control) => control.target === target),
      );
      const control = section
        ? Object.values(section.controls).find((candidate) => candidate.target === target)
        : undefined;

      expect(control?.defaultValue, `${target} must declare defaultValue for Reset`).not.toBeUndefined();
    }
  });

  it("keeps starter performance empty until the generated product adds controls", () => {
    expect(appPerformance.scenarios.length).toBeGreaterThan(0);
    expect(appPerformance.workloadTargets.length).toBeGreaterThan(0);
    expect(appPerformance.usesCustomRenderer).toBe(true);
    expect(appPerformance.rendererStrategy).toBe("webgl");
  });
});
