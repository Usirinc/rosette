import { describe, expect, it } from "vitest";

import { appPerformance } from "./app-performance";

function getScenario(id: string) {
  const scenario = appPerformance.scenarios.find((candidate) => candidate.id === id);

  if (!scenario) {
    throw new Error(`Expected a performance scenario with id "${id}".`);
  }

  return scenario;
}

describe("appPerformance scenarios", () => {
  it("media-import-photo performance scenario is configured with a 4K media fixture and render budget", () => {
    const scenario = getScenario("media-import-photo");

    expect(scenario.interaction).toBe("media-import");
    expect(scenario.workload).toBe(true);
    expect(scenario.stressFixture?.kind).toBe("media");
    expect(scenario.budget.maxRenderMs).toBeGreaterThan(0);
  });

  it("source-image-workload performance scenario declares min/default/max media coverage", () => {
    const scenario = getScenario("source-image-workload");

    expect(scenario.target).toBe("source.image");
    expect(scenario.values?.min).toBeDefined();
    expect(scenario.values?.default).toBeDefined();
    expect(scenario.values?.max).toBeDefined();
  });

  it("preview-render-stress performance scenario declares a combined 4K plus Resolution-scale-2 workload fixture", () => {
    const scenario = getScenario("preview-render-stress");

    expect(scenario.interaction).toBe("preview-render");
    expect(scenario.workloadFixture?.kind).toBe("custom");
    expect(scenario.budget.maxLongTaskMs).toBeGreaterThan(0);
  });

  it("control-drag-zoom performance scenario is configured", () => {
    const scenario = getScenario("control-drag-zoom");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("framing.zoom");
    expect(scenario.controlLabel).toBeTruthy();
  });

  it("control-drag-max-radius performance scenario declares min/default/max coverage", () => {
    const scenario = getScenario("control-drag-max-radius");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("halftone.maxRadius");
    expect(scenario.values).toEqual({ default: 1, max: 50, min: 1 });
  });

  it("control-drag-angle-cyan performance scenario is configured", () => {
    const scenario = getScenario("control-drag-angle-cyan");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("angles.cyan");
    expect(scenario.controlLabel).toBeTruthy();
  });

  it("control-drag-angle-magenta performance scenario is configured", () => {
    const scenario = getScenario("control-drag-angle-magenta");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("angles.magenta");
    expect(scenario.controlLabel).toBeTruthy();
  });

  it("control-drag-angle-yellow performance scenario is configured", () => {
    const scenario = getScenario("control-drag-angle-yellow");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("angles.yellow");
    expect(scenario.controlLabel).toBeTruthy();
  });

  it("control-drag-angle-black performance scenario is configured", () => {
    const scenario = getScenario("control-drag-angle-black");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("angles.black");
    expect(scenario.controlLabel).toBeTruthy();
  });

  it("control-drag-contrast performance scenario is configured", () => {
    const scenario = getScenario("control-drag-contrast");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("tone.contrast");
  });

  it("control-drag-brightness performance scenario is configured", () => {
    const scenario = getScenario("control-drag-brightness");

    expect(scenario.interaction).toBe("control-drag");
    expect(scenario.target).toBe("tone.brightness");
  });

  it("control-change-dot-shape performance scenario is configured", () => {
    expect(getScenario("control-change-dot-shape").target).toBe("halftone.dotShape");
  });

  it("control-change-cyan-enabled performance scenario is configured", () => {
    expect(getScenario("control-change-cyan-enabled").target).toBe("channels.cyan.enabled");
  });

  it("control-change-magenta-enabled performance scenario is configured", () => {
    expect(getScenario("control-change-magenta-enabled").target).toBe(
      "channels.magenta.enabled",
    );
  });

  it("control-change-yellow-enabled performance scenario is configured", () => {
    expect(getScenario("control-change-yellow-enabled").target).toBe("channels.yellow.enabled");
  });

  it("control-change-black-enabled performance scenario is configured", () => {
    expect(getScenario("control-change-black-enabled").target).toBe("channels.black.enabled");
  });

  it("control-change-black-generation performance scenario is configured", () => {
    expect(getScenario("control-change-black-generation").target).toBe("channels.blackGeneration");
  });

  it("control-change-invert performance scenario is configured", () => {
    expect(getScenario("control-change-invert").target).toBe("tone.invert");
  });

  it("control-change-include-background performance scenario is configured", () => {
    expect(getScenario("control-change-include-background").target).toBe(
      "export.includeBackground",
    );
  });

  it("control-change-background-color performance scenario is configured", () => {
    const scenario = getScenario("control-change-background-color");

    expect(scenario.target).toBe("appearance.background");
    expect(scenario.uiSelector).toBeTruthy();
  });

  it("control-change-fill-style performance scenario is configured", () => {
    const scenario = getScenario("control-change-fill-style");

    expect(scenario.target).toBe("appearance.fillStyle");
    expect(scenario.controlLabel).toBeTruthy();
  });

  it("control-change-background-gradient performance scenario is configured", () => {
    const scenario = getScenario("control-change-background-gradient");

    expect(scenario.target).toBe("appearance.backgroundGradient");
    expect(scenario.controlLabel).toBeTruthy();
  });

  it("control-change-export-format performance scenario is configured", () => {
    expect(getScenario("control-change-export-format").target).toBe("export.image.format");
  });

  it("export-resolution-workload performance scenario declares min/default/max coverage", () => {
    const scenario = getScenario("export-resolution-workload");

    expect(scenario.target).toBe("export.image.resolution");
    expect(scenario.values).toEqual({ default: "4k", max: "8k", min: "2k" });
  });

  it("export-copy-png performance scenario declares an 8K stress fixture with a numeric load profile", () => {
    const scenario = getScenario("export-copy-png");

    expect(scenario.interaction).toBe("export-copy");
    expect(scenario.stressFixture?.loadProfile?.metric).toBe("numeric-max");
    expect(scenario.budget.maxExportMs).toBeGreaterThan(0);
  });

  it("viewport-zoom-stress performance scenario declares a combined 4K plus Resolution-scale-2 stress fixture", () => {
    const scenario = getScenario("viewport-zoom-stress");

    expect(scenario.interaction).toBe("viewport-zoom-stress");
    expect(scenario.stressFixture?.kind).toBe("custom");
  });

  it("viewport-stability performance scenario is configured", () => {
    const scenario = getScenario("viewport-stability");

    expect(scenario.interaction).toBe("viewport-stability");
  });

  it("every declared scenario is marked automated with a real automatedTestName", () => {
    for (const scenario of appPerformance.scenarios) {
      expect(scenario.automated, scenario.id).toBe(true);
      expect(scenario.automatedTestName.trim().length, scenario.id).toBeGreaterThan(0);
    }
  });
});
