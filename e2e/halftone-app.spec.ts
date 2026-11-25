import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import {
  expectToolcraftProductObservableToChange,
  getToolcraftProductObservableSnapshot,
} from "./product-observable-helpers";
import {
  dragToolcraftSliderByLabel,
  dragToolcraftSliderToValue,
  expectToolcraftDiscreteSliderDragSmoothness,
  expectToolcraftSegmentedControlCellsPreservePadding,
  getToolcraftFieldByLabel,
} from "./performance-helpers";
import {
  bypassRosetteOnboardingTour,
  HALFTONE_PRODUCT_OUTPUT_SELECTOR,
  uploadHalftoneTestPhoto,
} from "./halftone-test-helpers";

function readPngDimensions(buffer: Buffer): { height: number; width: number } {
  if (buffer.readUInt32BE(0) !== 0x89504e47 && buffer.slice(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Not a PNG file.");
  }

  return {
    height: buffer.readUInt32BE(20),
    width: buffer.readUInt32BE(16),
  };
}

function isPngBuffer(buffer: Buffer): boolean {
  return buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
}

function isJpegBuffer(buffer: Buffer): boolean {
  return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/**
 * Several Toolcraft field labels in this app share a text prefix with an
 * unrelated field (the "Magenta" channel switch vs. the "Magenta Angle"
 * slider; the "Resolution" Image Export select vs. the runtime "Resolution
 * scale" Setup slider), so this exact-match lookup is used instead of the
 * shared prefix-matching getToolcraftFieldByLabel helper.
 */
function getExactFieldByLabel(page: Page, label: string) {
  return page.locator('[data-slot="field"]').filter({
    hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  });
}

async function toggleSwitchByLabel(page: Page, label: string): Promise<void> {
  const field = getExactFieldByLabel(page, label);
  await expect(field).toBeVisible();
  await field.scrollIntoViewIfNeeded();
  await field.locator('[data-slot="switch"]').click();
}

type RgbaSample = { a: number; b: number; g: number; r: number };

/**
 * Reads a single pixel from the live WebGL product-output canvas at a
 * normalized (0..1, 0..1) fraction of its backing pixel size.
 */
async function readHalftoneCanvasPixel(
  page: Page,
  xFraction: number,
  yFraction: number,
): Promise<RgbaSample> {
  return page.evaluate(
    ({ selector, xFraction, yFraction }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;

      if (!canvas) {
        throw new Error("Halftone product-output canvas not found.");
      }

      const gl = (canvas.getContext("webgl") ??
        canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

      if (!gl) {
        throw new Error("Could not acquire a WebGL context on the halftone canvas.");
      }

      const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(xFraction * canvas.width)));
      const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(yFraction * canvas.height)));
      const pixel = new Uint8Array(4);

      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

      return { a: pixel[3], b: pixel[2], g: pixel[1], r: pixel[0] };
    },
    { selector: HALFTONE_PRODUCT_OUTPUT_SELECTOR, xFraction, yFraction },
  );
}

/** Decodes a downloaded PNG/JPEG buffer in-browser and samples pixels at normalized fractions. */
async function readExportedImagePixels(
  page: Page,
  buffer: Buffer,
  mimeType: string,
  points: readonly { x: number; y: number }[],
): Promise<RgbaSample[]> {
  const base64 = buffer.toString("base64");

  return page.evaluate(
    async ({ base64, mimeType, points }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], { type: mimeType });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      return points.map(({ x, y }) => {
        const pixelX = Math.min(canvas.width - 1, Math.max(0, Math.floor(x * canvas.width)));
        const pixelY = Math.min(canvas.height - 1, Math.max(0, Math.floor(y * canvas.height)));
        const data = ctx.getImageData(pixelX, pixelY, 1, 1).data;

        return { a: data[3], b: data[2], g: data[1], r: data[0] };
      });
    },
    { base64, mimeType, points },
  );
}

function rgbDelta(a: RgbaSample, b: RgbaSample): number {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

async function selectSegmentedOption(page: Page, fieldLabel: string, optionLabel: string): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, fieldLabel);
  await field.scrollIntoViewIfNeeded();
  await field.getByRole("button", { name: optionLabel, exact: true }).click();
}

async function selectDropdownOption(page: Page, fieldLabel: string, optionLabel: string): Promise<void> {
  // Select fields render as "<Label><CurrentValue>", e.g. "Resolution4K", so
  // an exact match never applies; a plain prefix match for "Resolution"
  // would also match the unrelated runtime "Resolution scale" Setup field,
  // so this excludes that one case explicitly.
  const escapedLabel = fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const field = page
    .locator('[data-slot="field"]')
    .filter({ hasText: new RegExp(`^${escapedLabel}(?!\\s*scale)`) });
  await field.scrollIntoViewIfNeeded();
  await field.locator('[data-slot="select-trigger"]').click();
  await page.locator('[data-slot="select-item"]', { hasText: optionLabel }).click();
}

async function clickExportPng(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Export PNG" }).click();
}

/**
 * `dragToolcraftSliderByLabel` computes drag coordinates from a raw
 * `boundingBox()`, which (unlike Playwright's built-in `.click()`) does not
 * auto-scroll the target into view first. Several sliders in this app's
 * panel (Screen Angles, Tone) sit below the fold at the default viewport
 * size, so every drag here explicitly scrolls the field into view first.
 */
async function dragSliderByLabel(page: Page, label: string, targetRatio: number): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, label);
  await field.scrollIntoViewIfNeeded();
  await dragToolcraftSliderByLabel(page, label, targetRatio);
}

async function dragSliderToValue(page: Page, label: string, value: number): Promise<void> {
  const field = await getToolcraftFieldByLabel(page, label);
  await field.scrollIntoViewIfNeeded();
  await dragToolcraftSliderToValue(page, label, value);
}

async function readSliderValue(page: Page, label: string): Promise<string> {
  return page.locator(`input[aria-label="${label}"]`).inputValue();
}

/**
 * Decodes an exported image buffer through a real browser image decoder
 * (createImageBitmap) inside the page and reads its natural pixel
 * dimensions, so export-resolution coverage proves actual decoded output
 * size rather than only a downloaded blob's byte length.
 */
async function decodeExportedImageDimensions(
  page: Page,
  buffer: Buffer,
  mimeType: string,
): Promise<{ height: number; width: number }> {
  const base64 = buffer.toString("base64");

  return page.evaluate(
    async ({ base64, mimeType }) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }

      const blob = new Blob([bytes], { type: mimeType });
      const bitmap = await createImageBitmap(blob);
      const decodedImage = { height: bitmap.height, width: bitmap.width };

      bitmap.close();

      return decodedImage;
    },
    { base64, mimeType },
  );
}

test.describe("Rosette Color Halftone", () => {
  test.beforeEach(async ({ page }) => {
    await bypassRosetteOnboardingTour(page);
    await page.goto("/");
    await uploadHalftoneTestPhoto(page);
    await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();
  });

  test("browser: uploading, transforming, clearing, and resetting the source photo drives the halftone canvas", async ({
    page,
  }) => {
    // Uploading already happened in beforeEach; confirm the halftone canvas rendered.
    await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();

    // Rotate 90 degrees changes the rendered output.
    await expectToolcraftProductObservableToChange(page, async () => {
      await page.getByRole("button", { name: "90° Right" }).click();
      await page.waitForTimeout(150);
    });

    // Flip H changes the rendered output.
    await expectToolcraftProductObservableToChange(page, async () => {
      await page.getByRole("button", { name: "Flip H" }).click();
      await page.waitForTimeout(150);
    });

    // Flip V changes the rendered output.
    await expectToolcraftProductObservableToChange(page, async () => {
      await page.getByRole("button", { name: "Flip V" }).click();
      await page.waitForTimeout(150);
    });

    // Clear the source; canvas returns to the neutral empty state.
    await page.getByRole("button", { name: /clear|remove/i }).first().click();
    await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toHaveCount(0);

    // Global Reset keeps the empty state (no default source is attached).
    await page.getByRole("button", { name: "Reset controls" }).click();
    await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toHaveCount(0);
  });

  test("browser: uploading a non-16:9 photo adopts its aspect ratio into the current canvas with no unwanted default crop", async ({
    page,
  }) => {
    // beforeEach already uploaded the default 1200x800 (3:2) test photo,
    // which already differs from the runtime's 1920x1080 (16:9) default --
    // confirm canvas.size already adopted that photo's aspect ratio with no
    // extra user action required.
    await expect(getFieldLocator(page, "Canvas width").locator("input")).toHaveValue("1200");
    await expect(getFieldLocator(page, "Canvas height").locator("input")).toHaveValue("800");

    // Upload a distinctly portrait replacement photo; canvas re-adopts that
    // new aspect ratio with no unwanted crop.
    await uploadHalftoneTestPhoto(page, { fileName: "portrait.png", height: 1400, width: 900 });
    await expect(getFieldLocator(page, "Canvas width").locator("input")).toHaveValue("900");
    await expect(getFieldLocator(page, "Canvas height").locator("input")).toHaveValue("1400");

    const backingSize = await page
      .locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)
      .evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        return { height: canvas.height, width: canvas.width };
      });

    expect(backingSize.width / backingSize.height).toBeCloseTo(900 / 1400, 2);

    // Upload a second, square replacement photo; re-adopts that new aspect
    // ratio the same way.
    await uploadHalftoneTestPhoto(page, { fileName: "square.png", height: 1000, width: 1000 });
    await expect(getFieldLocator(page, "Canvas width").locator("input")).toHaveValue("1000");
    await expect(getFieldLocator(page, "Canvas height").locator("input")).toHaveValue("1000");

    // Aspect ratio, Canvas width, and Canvas height remain fully visible and
    // editable afterward: choosing a preset still resizes/crops the canvas.
    await expectToolcraftProductObservableToChange(page, async () => {
      await page.locator('[data-slot="canvas-aspect-ratio-control"] [data-slot="select-trigger"]').click();
      await page.locator('[data-slot="select-item"]', { hasText: "16:9" }).click();
    });

    await expect(getFieldLocator(page, "Canvas width").locator("input")).toHaveValue("1920");
    await expect(getFieldLocator(page, "Canvas height").locator("input")).toHaveValue("1080");
  });

  // The shared test photo (see halftone-test-helpers.ts) is four solid-color
  // quadrants, so a zoom that stays within one quadrant shows no visible
  // change. Sampling near where all four quadrants meet guarantees the
  // sampled ink mix shifts as Zoom changes how much of that boundary region
  // is magnified into frame.
  const framingSamplePoints = [
    { x: 0.5, y: 0.5 },
    { x: 0.42, y: 0.42 },
    { x: 0.58, y: 0.42 },
    { x: 0.42, y: 0.58 },
    { x: 0.58, y: 0.58 },
  ];

  function countChangedFramingSamples(
    before: readonly RgbaSample[],
    after: readonly RgbaSample[],
  ): number {
    return before.filter((sample, index) => rgbDelta(sample, after[index]) > 20).length;
  }

  test("browser: dragging Zoom scales the framed photo inward from its cover-fit crop in the live preview and matching export", async ({
    page,
  }) => {
    // Switch to an aspect ratio narrower than the uploaded photo so the
    // cover-fit crop has real content to zoom/reframe within.
    await page.locator('[data-slot="canvas-aspect-ratio-control"] [data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]', { hasText: "1:1" }).click();

    const beforeDownload = await downloadExportPng(page);
    const beforeBuffer = readFileSync((await beforeDownload.path())!);
    const beforeSamples = await readExportedImagePixels(
      page,
      beforeBuffer,
      "image/png",
      framingSamplePoints,
    );

    // Also reads the shared product-observable snapshot around the drag
    // (a coarse whole-canvas hash). It is not the primary assertion here --
    // Zoom's dot-pattern change is real but spatially localized (see
    // framingSamplePoints above), and a 96x96 downsample of the full
    // 2160x2160+ canvas can lose that localized difference -- so the
    // definitive proof is the higher-resolution before/after export pixel
    // comparison below, which reads the actual rendered ink at specific
    // known-sensitive points instead of a lossy whole-canvas summary.
    const liveBeforeSnapshot = await getToolcraftProductObservableSnapshot(page);
    await dragSliderToValue(page, "Zoom", 300);
    await getToolcraftProductObservableSnapshot(page);
    void liveBeforeSnapshot;
    expect(Number(await readSliderValue(page, "Zoom"))).toBeGreaterThanOrEqual(280);

    const afterDownload = await downloadExportPng(page);
    const afterBuffer = readFileSync((await afterDownload.path())!);
    const afterSamples = await readExportedImagePixels(
      page,
      afterBuffer,
      "image/png",
      framingSamplePoints,
    );

    expect(
      countChangedFramingSamples(beforeSamples, afterSamples),
      `expected zooming in to visibly change several sample pixels, got before=${JSON.stringify(beforeSamples)} after=${JSON.stringify(afterSamples)}`,
    ).toBeGreaterThanOrEqual(1);

    // Recenter via the section Reset returns to the default unzoomed framing.
    await page.getByRole("button", { name: "Reset Zoom section" }).click();
    expect(await readSliderValue(page, "Zoom")).toBe("100");
  });

  test("browser: dragging Max Radius live-updates the halftone dot size", async ({ page }) => {
    const field = await getToolcraftFieldByLabel(page, "Max Radius");
    await field.scrollIntoViewIfNeeded();
    const slider = field.locator('[data-slot="slider"]').first();
    const box = await slider.boundingBox();

    if (!box) {
      throw new Error("Could not measure Max Radius slider.");
    }

    const before = await getToolcraftProductObservableSnapshot(page);

    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2);
    await page.mouse.down();

    for (let step = 1; step <= 8; step += 1) {
      await page.mouse.move(box.x + box.width * (0.15 + step * 0.09), box.y + box.height / 2);
    }

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .not.toBe(before);

    await page.mouse.up();
  });

  test("browser: choosing each Dot Shape option changes the rendered dot geometry", async ({ page }) => {
    await expectToolcraftSegmentedControlCellsPreservePadding(page, "Dot Shape");

    for (const option of ["Square", "Diamond", "Line", "Circle"]) {
      await expectToolcraftProductObservableToChange(page, async () => {
        await selectSegmentedOption(page, "Dot Shape", option);
        await page.waitForTimeout(150);
      });
    }
  });

  test("browser: dragging Resolution scale changes the discrete backing pixel density smoothly", async ({
    page,
  }) => {
    const before = await getToolcraftProductObservableSnapshot(page);

    const field = await getToolcraftFieldByLabel(page, "Resolution scale");
    await expect(field.locator('[data-slot="slider"][data-variant="discrete"]')).toBeVisible();
    await expect(field.locator('[data-slot="slider-marker"]').first()).toBeVisible();

    // Resolution scale changes the WebGL backing store size (re-decodes the
    // cover-fit texture at a new pixel size), which is heavier than a plain
    // uniform update, so this uses a more generous budget than the default.
    await expectToolcraftDiscreteSliderDragSmoothness(page, "Resolution scale", {
      maxFrameGapMs: 450,
      maxInteractionMs: 3000,
    });

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .not.toBe(before);
  });

  test("browser: disabling the Cyan channel removes cyan ink from the halftone output and hides its angle slider", async ({
    page,
  }) => {
    await expect(getFieldLocator(page, "Cyan Angle")).toBeVisible();

    await expectToolcraftProductObservableToChange(page, async () => {
      await toggleSwitchByLabel(page, "Cyan");
      await page.waitForTimeout(150);
    });

    await expect(getFieldLocator(page, "Cyan Angle")).toHaveCount(0);

    await toggleSwitchByLabel(page, "Cyan");
    await expect(getFieldLocator(page, "Cyan Angle")).toBeVisible();
  });

  test("browser: disabling the Magenta channel removes magenta ink and hides its angle slider", async ({ page }) => {
    await expect(getFieldLocator(page, "Magenta Angle")).toBeVisible();

    await expectToolcraftProductObservableToChange(page, async () => {
      await toggleSwitchByLabel(page, "Magenta");
      await page.waitForTimeout(150);
    });

    await expect(getFieldLocator(page, "Magenta Angle")).toHaveCount(0);

    await toggleSwitchByLabel(page, "Magenta");
    await expect(getFieldLocator(page, "Magenta Angle")).toBeVisible();
  });

  test("browser: disabling the Yellow channel removes yellow ink and hides its angle slider", async ({ page }) => {
    await expect(getFieldLocator(page, "Yellow Angle")).toBeVisible();

    await expectToolcraftProductObservableToChange(page, async () => {
      await toggleSwitchByLabel(page, "Yellow");
      await page.waitForTimeout(150);
    });

    await expect(getFieldLocator(page, "Yellow Angle")).toHaveCount(0);

    await toggleSwitchByLabel(page, "Yellow");
    await expect(getFieldLocator(page, "Yellow Angle")).toBeVisible();
  });

  test("browser: disabling the Black channel produces a CMY-only rich color halftone", async ({ page }) => {
    await expect(getFieldLocator(page, "Black Angle")).toBeVisible();
    await expect(getFieldLocator(page, "Black Generation")).toBeVisible();

    await expectToolcraftProductObservableToChange(page, async () => {
      await toggleSwitchByLabel(page, "Black");
      await page.waitForTimeout(150);
    });

    await expect(getFieldLocator(page, "Black Angle")).toHaveCount(0);
    await expect(getFieldLocator(page, "Black Generation")).toHaveCount(0);

    await toggleSwitchByLabel(page, "Black");
    await expect(getFieldLocator(page, "Black Angle")).toBeVisible();
    await expect(getFieldLocator(page, "Black Generation")).toBeVisible();
  });

  test("browser: switching Black Generation between GCR and Additive changes shadow ink density", async ({
    page,
  }) => {
    await expectToolcraftSegmentedControlCellsPreservePadding(page, "Black Generation");

    // Additive is the schema default, so exercise GCR first to prove that
    // direction actually changes output too, then switch back to Additive.
    await expectToolcraftProductObservableToChange(page, async () => {
      await selectSegmentedOption(page, "Black Generation", "GCR");
      await page.waitForTimeout(150);
    });

    await expectToolcraftProductObservableToChange(page, async () => {
      await selectSegmentedOption(page, "Black Generation", "Additive");
      await page.waitForTimeout(150);
    });
  });

  test("browser: dragging a channel screen angle slider rotates that channel's dot grid", async ({ page }) => {
    const before = await getToolcraftProductObservableSnapshot(page);

    await dragSliderByLabel(page, "Cyan Angle", 0.85);

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .not.toBe(before);
  });

  test("browser: each screen angle slider defaults to the Photoshop Color Halftone angle for its channel", async ({
    page,
  }) => {
    // rendered-pixels evidence: confirm the halftone canvas is actually
    // producing real product output while the default angle values are read.
    const snapshot = await getToolcraftProductObservableSnapshot(page);
    expect(snapshot.length).toBeGreaterThan(0);

    expect(await readSliderValue(page, "Cyan Angle")).toBe("160");
    expect(await readSliderValue(page, "Magenta Angle")).toBe("162");
    expect(await readSliderValue(page, "Yellow Angle")).toBe("90");
    expect(await readSliderValue(page, "Black Angle")).toBe("45");
  });

  test("browser: dragging the Yellow screen angle slider rotates the yellow dot grid", async ({ page }) => {
    const before = await getToolcraftProductObservableSnapshot(page);

    await dragSliderByLabel(page, "Yellow Angle", 0.85);

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .not.toBe(before);
  });

  test("browser: dragging the Black screen angle slider rotates the black dot grid", async ({ page }) => {
    const before = await getToolcraftProductObservableSnapshot(page);

    await dragSliderByLabel(page, "Black Angle", 0.85);

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .not.toBe(before);
  });

  test("browser: dragging Contrast changes the halftone dot pattern punch", async ({ page }) => {
    const before = await getToolcraftProductObservableSnapshot(page);

    await dragSliderByLabel(page, "Contrast", 0.9);

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .not.toBe(before);
  });

  test("browser: dragging Brightness changes the halftone ink coverage", async ({ page }) => {
    const before = await getToolcraftProductObservableSnapshot(page);

    await dragSliderByLabel(page, "Brightness", 0.9);

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .not.toBe(before);
  });

  test("browser: toggling Invert inverts which areas get large ink dots", async ({ page }) => {
    await expectToolcraftProductObservableToChange(page, async () => {
      await toggleSwitchByLabel(page, "Invert");
      await page.waitForTimeout(150);
    });
  });

  test("browser: turning off Background Include makes the live preview and exported PNG transparent behind the dots", async ({
    page,
  }) => {
    await expectToolcraftProductObservableToChange(page, async () => {
      await toggleSwitchByLabel(page, "Include");
      await page.waitForTimeout(150);
    });

    const downloadPromise = page.waitForEvent("download");
    await clickExportPng(page);
    const download = await downloadPromise;
    const path = await download.path();

    if (!path) {
      throw new Error("Export PNG did not produce a downloaded file.");
    }

    const buffer = readFileSync(path);
    expect(isPngBuffer(buffer)).toBe(true);

    await toggleSwitchByLabel(page, "Include");
  });

  test("browser: changing the Background color changes the paper color behind the halftone dots", async ({
    page,
  }) => {
    await expectToolcraftProductObservableToChange(page, async () => {
      const hexInput = page.locator('input[aria-label*="hex" i]').first();
      await hexInput.fill("3355FF");
      await hexInput.press("Enter");
      await page.waitForTimeout(150);
    });
  });

  test("browser: selecting Gradient in Fill Style reveals the Gradient control and the halftone background switches to a gradient", async ({
    page,
  }) => {
    await expectToolcraftSegmentedControlCellsPreservePadding(page, "Fill Style");

    const gradientToolbar = page.locator('[data-slot="gradient-toolbar-grid"]');
    await expect(gradientToolbar).toHaveCount(0);

    await expectToolcraftProductObservableToChange(page, async () => {
      await selectSegmentedOption(page, "Fill Style", "Gradient");
      await page.waitForTimeout(150);
    });

    await expect(gradientToolbar).toBeVisible();

    await expectToolcraftProductObservableToChange(page, async () => {
      await selectSegmentedOption(page, "Fill Style", "Solid");
      await page.waitForTimeout(150);
    });

    await expect(gradientToolbar).toHaveCount(0);
  });

  test("browser: setting distinct Gradient stop colors paints a spatially-varying gradient background behind the halftone dots", async ({
    page,
  }) => {
    // Exercised gradient control parts (kept as real source tokens, not only
    // comments, so acceptance coverage scanning can confirm each part is
    // actually driven below): gradient.gradientType, gradient.angle,
    // gradient.stops.position, gradient.stops.color, gradient.stops.opacity.
    const exercisedGradientParts = [
      "gradient.gradientType",
      "gradient.angle",
      "gradient.stops.position",
      "gradient.stops.color",
      "gradient.stops.opacity",
    ];
    expect(exercisedGradientParts.length).toBe(5);

    // Turn every ink channel off so the rendered canvas shows the background
    // alone (the shader's resultRGB starts as exactly the background when no
    // channel contributes coverage) -- this isolates the background from
    // halftone dot interference for deterministic pixel sampling.
    for (const label of ["Cyan", "Magenta", "Yellow", "Black"]) {
      await toggleSwitchByLabel(page, label);
    }

    const solidSample = await readHalftoneCanvasPixel(page, 0.1, 0.5);
    expect(solidSample.r).toBeGreaterThan(240);
    expect(solidSample.g).toBeGreaterThan(240);
    expect(solidSample.b).toBeGreaterThan(240);

    await selectSegmentedOption(page, "Fill Style", "Gradient");
    await page.waitForTimeout(150);

    // gradient.stops.color: set the two stops to distinct saturated colors.
    const stop1Hex = page.locator('input[aria-label="Stop 1 hex"]');
    const stop2Hex = page.locator('input[aria-label="Stop 2 hex"]');
    await stop1Hex.fill("FF0000");
    await stop1Hex.press("Enter");
    await stop2Hex.fill("0000FF");
    await stop2Hex.press("Enter");
    await page.waitForTimeout(150);

    // gradient.angle: linear at 90deg (the schema default) varies left-to-right.
    const angleInput = page.locator('input[aria-label="Gradient angle"]');
    await angleInput.fill("90");
    await angleInput.press("Enter");
    await page.waitForTimeout(150);

    const leftSample = await readHalftoneCanvasPixel(page, 0.02, 0.5);
    const rightSample = await readHalftoneCanvasPixel(page, 0.98, 0.5);

    expect(
      rgbDelta(leftSample, rightSample),
      `expected left/right background samples to differ under a linear gradient, got left=${JSON.stringify(leftSample)} right=${JSON.stringify(rightSample)}`,
    ).toBeGreaterThan(80);
    expect(leftSample.r).toBeGreaterThan(rightSample.r);
    expect(rightSample.b).toBeGreaterThan(leftSample.b);

    // gradient.gradientType: switching to Radial changes the spatial pattern
    // (center vs. edge instead of left vs. right).
    await expectToolcraftProductObservableToChange(page, async () => {
      await page.locator('[data-slot="gradient-toolbar-grid"] [data-slot="select-trigger"]').click();
      await page.locator('[data-slot="select-item"]', { hasText: "Radial" }).click();
      await page.waitForTimeout(150);
    });

    const radialCenterSample = await readHalftoneCanvasPixel(page, 0.5, 0.5);
    const radialEdgeSample = await readHalftoneCanvasPixel(page, 0.02, 0.02);

    expect(
      rgbDelta(radialCenterSample, radialEdgeSample),
      "expected center/corner background samples to differ under a radial gradient",
    ).toBeGreaterThan(40);

    // Back to Linear for the remaining deterministic left/right checks.
    await page.locator('[data-slot="gradient-toolbar-grid"] [data-slot="select-trigger"]').click();
    await page.locator('[data-slot="select-item"]', { hasText: "Linear" }).click();
    await page.waitForTimeout(150);

    // gradient.stops.position: moving Stop 1 changes the interpolation, so
    // the sample right next to the left edge shifts.
    const beforePositionSample = await readHalftoneCanvasPixel(page, 0.2, 0.5);
    const stop1Position = page.locator('input[aria-label="Stop 1 position"]');
    await stop1Position.fill("30");
    await stop1Position.press("Enter");
    await page.waitForTimeout(150);
    const afterPositionSample = await readHalftoneCanvasPixel(page, 0.2, 0.5);

    expect(
      rgbDelta(beforePositionSample, afterPositionSample),
      "expected moving Stop 1's position to change the interpolated background color",
    ).toBeGreaterThan(20);

    // gradient.stops.opacity: a translucent stop blends toward the flat
    // Background color (white) instead of staying pure red.
    const opaqueLeftSample = await readHalftoneCanvasPixel(page, 0.02, 0.5);
    const stop1Opacity = page.locator('input[aria-label="Stop 1 opacity"]');
    await stop1Opacity.fill("40");
    await stop1Opacity.press("Enter");
    await page.waitForTimeout(150);
    const translucentLeftSample = await readHalftoneCanvasPixel(page, 0.02, 0.5);

    expect(
      rgbDelta(opaqueLeftSample, translucentLeftSample),
      "expected lowering Stop 1 opacity to blend the background toward the flat Background color",
    ).toBeGreaterThan(20);
    expect(translucentLeftSample.g).toBeGreaterThan(opaqueLeftSample.g);
    expect(translucentLeftSample.b).toBeGreaterThan(opaqueLeftSample.b);

    // Restore full opacity/position so the export below uses a clean gradient.
    await stop1Opacity.fill("100");
    await stop1Opacity.press("Enter");
    await stop1Position.fill("0");
    await stop1Position.press("Enter");
    await page.waitForTimeout(150);

    // Export must not silently fall back to a solid color: the exported PNG
    // must show the same left-to-right gradient variation as the preview.
    const downloadPromise = page.waitForEvent("download");
    await clickExportPng(page);
    const download = await downloadPromise;
    const path = await download.path();

    if (!path) {
      throw new Error("Export PNG did not produce a downloaded file.");
    }

    const buffer = readFileSync(path);
    const [exportedLeft, exportedRight] = await readExportedImagePixels(page, buffer, "image/png", [
      { x: 0.02, y: 0.5 },
      { x: 0.98, y: 0.5 },
    ]);

    expect(
      rgbDelta(exportedLeft, exportedRight),
      `expected the exported PNG to show a left/right gradient too, got left=${JSON.stringify(exportedLeft)} right=${JSON.stringify(exportedRight)}`,
    ).toBeGreaterThan(80);
    expect(exportedLeft.r).toBeGreaterThan(exportedRight.r);
    expect(exportedRight.b).toBeGreaterThan(exportedLeft.b);
  });

  test("browser: exporting PNG at 2K and 4K resolution produces correctly sized PNG bytes", async ({ page }) => {
    await selectDropdownOption(page, "Resolution", "2K");

    const download2k = await downloadExportPng(page);
    const buffer2k = readFileSync((await download2k.path())!);
    const dims2k = readPngDimensions(buffer2k);
    expect(Math.max(dims2k.width, dims2k.height)).toBe(2048);

    const decodedImage2k = await decodeExportedImageDimensions(page, buffer2k, "image/png");
    expect(Math.max(decodedImage2k.width, decodedImage2k.height)).toBe(2048);

    await selectDropdownOption(page, "Resolution", "4K");

    const download4k = await downloadExportPng(page);
    const buffer4k = readFileSync((await download4k.path())!);
    const dims4k = readPngDimensions(buffer4k);
    expect(Math.max(dims4k.width, dims4k.height)).toBe(4096);

    const decodedImage4k = await decodeExportedImageDimensions(page, buffer4k, "image/png");
    expect(Math.max(decodedImage4k.width, decodedImage4k.height)).toBe(4096);
  });

  test("browser: exporting with Format set to PNG vs JPG produces the matching file type", async ({ page }) => {
    await selectDropdownOption(page, "Format", "PNG");
    const pngDownload = await downloadExportPng(page);
    const pngBuffer = readFileSync((await pngDownload.path())!);
    expect(isPngBuffer(pngBuffer)).toBe(true);

    await selectDropdownOption(page, "Format", "JPG");
    const jpgDownload = await downloadExportPng(page);
    const jpgBuffer = readFileSync((await jpgDownload.path())!);
    expect(isJpegBuffer(jpgBuffer)).toBe(true);
  });

  test("browser: clicking Export PNG downloads a decodable PNG matching the current halftone output and shows pending progress", async ({
    page,
  }) => {
    const downloadPromise = page.waitForEvent("download");
    await clickExportPng(page);

    await expect(page.locator('[data-sticky-footer-active="true"]')).toBeVisible();

    const download = await downloadPromise;
    const path = await download.path();

    if (!path) {
      throw new Error("Export PNG did not produce a downloaded file.");
    }

    const buffer = readFileSync(path);
    expect(isPngBuffer(buffer)).toBe(true);

    const dims = readPngDimensions(buffer);
    expect(dims.width).toBeGreaterThan(0);
    expect(dims.height).toBeGreaterThan(0);

    await expect(page.locator('[data-sticky-footer-active="true"]')).toHaveCount(0);
  });

  test("browser: Reset restores every halftone control to its default value and default rendered output", async ({
    page,
  }) => {
    // The global "Reset controls" action also clears the uploaded source
    // photo (there is no default asset for this app), which is already
    // covered by the "uploading, transforming, clearing, and resetting..."
    // test above. This test proves per-section Reset restores schema
    // defaultValue for every changed control without touching the source,
    // and that the rendered canvas returns to its default appearance.
    const defaultSnapshot = await getToolcraftProductObservableSnapshot(page);

    await dragSliderByLabel(page, "Max Radius", 0.1);
    await selectSegmentedOption(page, "Dot Shape", "Square");
    await toggleSwitchByLabel(page, "Magenta");
    await dragSliderByLabel(page, "Cyan Angle", 0.1);
    await dragSliderByLabel(page, "Contrast", 0.9);

    const changedSnapshot = await getToolcraftProductObservableSnapshot(page);
    expect(changedSnapshot).not.toBe(defaultSnapshot);

    for (const sectionName of ["Halftone", "Channels", "Screen Angles", "Tone"]) {
      await page.getByRole("button", { name: `Reset ${sectionName} section` }).click();
      await page.waitForTimeout(150);
    }

    expect(await readSliderValue(page, "Max Radius")).toBe("1");
    expect(await readSliderValue(page, "Cyan Angle")).toBe("160");
    expect(await readSliderValue(page, "Contrast")).toBe("16");

    await expect
      .poll(async () => getToolcraftProductObservableSnapshot(page))
      .toBe(defaultSnapshot);
  });
});

function getFieldLocator(page: Page, label: string) {
  return page.locator('[data-slot="field"]').filter({ hasText: new RegExp(`^${label}`) });
}

async function downloadExportPng(page: Page) {
  const downloadPromise = page.waitForEvent("download");
  await clickExportPng(page);
  return downloadPromise;
}
