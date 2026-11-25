import { expect, test } from "@playwright/test";

import { appPerformance } from "../src/app/app-performance";
import {
  dragToolcraftCanvasViewport,
  dragToolcraftSliderByLabel,
  dragToolcraftSliderToValue,
  expectToolcraftScenarioPerformanceBudget,
  getToolcraftFieldByLabel,
  getToolcraftPerformanceStressValue,
  measureToolcraftInteraction,
  zoomToolcraftCanvasViewport,
} from "./performance-helpers";
import {
  bypassRosetteOnboardingTour,
  HALFTONE_PRODUCT_OUTPUT_SELECTOR,
  uploadHalftoneTestPhoto,
} from "./halftone-test-helpers";

test.describe("Rosette Color Halftone performance", () => {
  test.beforeEach(async ({ page }) => {
    await bypassRosetteOnboardingTour(page);
    await page.goto("/");
  });

  test("browser perf: uploading a 4K photo decodes and renders within budget", async ({ page }) => {
    const stress = getToolcraftPerformanceStressValue<{ height: number; width: number }>(
      appPerformance,
      "media-import-photo",
    );

    const result = await measureToolcraftInteraction(page, async () => {
      await uploadHalftoneTestPhoto(page, stress);
      await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "media-import-photo");
  });

  test("browser perf: replacing the source photo with progressively larger images stays responsive", async ({
    page,
  }) => {
    await uploadHalftoneTestPhoto(page, { height: 480, width: 640 });
    await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();
    await uploadHalftoneTestPhoto(page, { height: 1080, width: 1920 });

    const result = await measureToolcraftInteraction(page, async () => {
      await uploadHalftoneTestPhoto(page, { height: 2160, width: 3840 });
      await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "source-image-workload");
  });

  test("browser perf: stress preview render stays under the long-task budget at a 4K source and Resolution scale 2", async ({
    page,
  }) => {
    const result = await measureToolcraftInteraction(page, async () => {
      await uploadHalftoneTestPhoto(page, { height: 2160, width: 3840 });
      await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "preview-render-stress");
  });

  test("browser perf: dragging Zoom stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const stress = getToolcraftPerformanceStressValue<number>(appPerformance, "control-drag-zoom");

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderToValue(page, "Zoom", stress);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-zoom");
  });

  test("browser perf: dragging Max Radius stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const stress = getToolcraftPerformanceStressValue<number>(appPerformance, "control-drag-max-radius");

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderToValue(page, "Max Radius", stress);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-max-radius");
  });

  test("browser perf: dragging the Cyan screen angle stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderByLabel(page, "Cyan Angle", 0.95);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-angle-cyan");
  });

  test("browser perf: dragging the Magenta screen angle stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderByLabel(page, "Magenta Angle", 0.95);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-angle-magenta");
  });

  test("browser perf: dragging the Yellow screen angle stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderByLabel(page, "Yellow Angle", 0.95);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-angle-yellow");
  });

  test("browser perf: dragging the Black screen angle stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderByLabel(page, "Black Angle", 0.95);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-angle-black");
  });

  test("browser perf: dragging Contrast stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderByLabel(page, "Contrast", 0.95);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-contrast");
  });

  test("browser perf: dragging Brightness stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftSliderByLabel(page, "Brightness", 0.95);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-drag-brightness");
  });

  test("browser perf: changing Dot Shape stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Dot Shape");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.getByRole("button", { name: "Square", exact: true }).click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-dot-shape");
  });

  test("browser perf: toggling the Cyan channel switch stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Cyan");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="switch"]').click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-cyan-enabled");
  });

  test("browser perf: toggling the Magenta channel switch stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Magenta");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="switch"]').click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-magenta-enabled");
  });

  test("browser perf: toggling the Yellow channel switch stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Yellow");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="switch"]').click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-yellow-enabled");
  });

  test("browser perf: toggling the Black channel switch stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Black");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="switch"]').click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-black-enabled");
  });

  test("browser perf: changing Black Generation stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Black Generation");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.getByRole("button", { name: "Additive", exact: true }).click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-black-generation");
  });

  test("browser perf: toggling Invert stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Invert");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="switch"]').click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-invert");
  });

  test("browser perf: changing Fill Style stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Fill Style");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.getByRole("button", { name: "Gradient", exact: true }).click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-fill-style");
  });

  test("browser perf: changing the Background Gradient stops stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const styleField = await getToolcraftFieldByLabel(page, "Fill Style");
    await styleField.getByRole("button", { name: "Gradient", exact: true }).click();

    const hexInput = page.locator('input[aria-label="Stop 1 hex"]');

    const result = await measureToolcraftInteraction(page, async () => {
      await hexInput.fill("22AAFF");
      await hexInput.press("Enter");
    });

    expectToolcraftScenarioPerformanceBudget(
      result,
      appPerformance,
      "control-change-background-gradient",
    );
  });

  test("browser perf: toggling Background Include stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Include");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="switch"]').click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-include-background");
  });

  test("browser perf: changing the Background color stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const hexInput = page.locator('input[aria-label*="hex" i]').first();

    const result = await measureToolcraftInteraction(page, async () => {
      await hexInput.fill("11AA33");
      await hexInput.press("Enter");
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-background-color");
  });

  test("browser perf: changing Image Export Format stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Format");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="select-trigger"], button, [role="combobox"]').first().click();
      await page.getByRole("option", { name: "JPG", exact: true }).click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "control-change-export-format");
  });

  test("browser perf: changing Image Export Resolution stays responsive", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Resolution");

    const result = await measureToolcraftInteraction(page, async () => {
      await field.locator('[data-slot="select-trigger"], button, [role="combobox"]').first().click();
      await page.getByRole("option", { name: "2K", exact: true }).click();
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "export-resolution-workload");
  });

  test("browser perf: exporting an 8K PNG completes within budget", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);
    const field = await getToolcraftFieldByLabel(page, "Resolution");
    await field.locator('[data-slot="select-trigger"], button, [role="combobox"]').first().click();
    await page.getByRole("option", { name: "8K", exact: true }).click();

    const downloadPromise = page.waitForEvent("download");
    const startedAt = Date.now();
    await page.getByRole("button", { name: "Export PNG" }).click();
    await downloadPromise;
    const exportMs = Date.now() - startedAt;

    expectToolcraftScenarioPerformanceBudget({ exportMs }, appPerformance, "export-copy-png");
  });

  test("browser perf: zooming the canvas under a 4K source and Resolution scale 2 stays smooth", async ({
    page,
  }) => {
    await uploadHalftoneTestPhoto(page, { height: 2160, width: 3840 });
    await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();

    const result = await measureToolcraftInteraction(page, async () => {
      await zoomToolcraftCanvasViewport(page, 3);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "viewport-zoom-stress");
  });

  test("browser perf: panning and zooming the canvas keeps the viewport stable", async ({ page }) => {
    await uploadHalftoneTestPhoto(page);

    const result = await measureToolcraftInteraction(page, async () => {
      await dragToolcraftCanvasViewport(page);
    });

    expectToolcraftScenarioPerformanceBudget(result, appPerformance, "viewport-stability");
  });
});
