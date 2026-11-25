import { expect, test, type Page } from "@playwright/test";

import {
  bypassRosetteOnboardingTour,
  HALFTONE_PRODUCT_OUTPUT_SELECTOR,
  uploadHalftoneTestPhoto,
} from "./halftone-test-helpers";

/**
 * Rendered-pixels regression coverage (per acceptance-testing.md's
 * "rendered-pixels" evidence type) for the core claim of a *color* halftone:
 * different source hues must composite into visibly different ink-color
 * mixes, not a single achromatic (R === G === B) dot pattern. The rest of
 * this app's browser suite (e2e/halftone-app.spec.ts) proves controls move
 * runtime state and change *some* pixels via
 * getToolcraftProductObservableSnapshot, but never asserts the actual
 * chroma of what got rendered -- a shader bug that always composited to
 * grayscale (e.g. every channel silently reading the same ink value) would
 * still pass every one of those tests, because the K-only dot pattern still
 * changes when radius/angle/contrast/etc. change. This spec reads real
 * framebuffer pixels back with gl.readPixels and asserts genuine chroma.
 */

type ChromaSample = { a: number; b: number; g: number; r: number; x: number; y: number };

async function readCanvasChromaSamples(page: Page, sampleCount = 600): Promise<ChromaSample[]> {
  return page.evaluate(
    ({ selector, sampleCount }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;

      if (!canvas) {
        throw new Error("Halftone product-output canvas not found.");
      }

      const gl = (canvas.getContext("webgl") ??
        canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

      if (!gl) {
        throw new Error("Could not acquire a WebGL context on the halftone canvas.");
      }

      const width = canvas.width;
      const height = canvas.height;
      const pixel = new Uint8Array(4);
      const samples: ChromaSample[] = [];

      // Deterministic grid sample (not random) so this test is stable across
      // runs/environments.
      const cols = Math.ceil(Math.sqrt(sampleCount));
      const rows = Math.ceil(sampleCount / cols);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = Math.min(width - 1, Math.floor(((col + 0.5) / cols) * width));
          const y = Math.min(height - 1, Math.floor(((row + 0.5) / rows) * height));

          gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          samples.push({ a: pixel[3], b: pixel[2], g: pixel[1], r: pixel[0], x, y });
        }
      }

      return samples;
    },
    { selector: HALFTONE_PRODUCT_OUTPUT_SELECTOR, sampleCount },
  );
}

function isChromatic(sample: ChromaSample): boolean {
  const max = Math.max(sample.r, sample.g, sample.b);
  const min = Math.min(sample.r, sample.g, sample.b);

  // Threshold well above antialiasing/compression noise: a genuinely tinted
  // ink pixel (pure or mixed C/M/Y) differs by far more than this between
  // channels; a grayscale-only render (white/black/gray dots) never does.
  return max - min > 24;
}

/** Coarse hue bucket so the test can prove *distinct* ink colors appeared, not just "some" chroma. */
function hueBucket(sample: ChromaSample): string | null {
  if (!isChromatic(sample)) {
    return null;
  }

  const { r, g, b } = sample;
  const isHigh = (v: number) => v > 140;
  const isLow = (v: number) => v < 140;

  if (isLow(r) && isHigh(g) && isHigh(b)) return "cyan";
  if (isHigh(r) && isLow(g) && isHigh(b)) return "magenta";
  if (isHigh(r) && isHigh(g) && isLow(b)) return "yellow";
  if (isHigh(r) && isLow(g) && isLow(b)) return "red";
  if (isLow(r) && isHigh(g) && isLow(b)) return "green";
  if (isLow(r) && isLow(g) && isHigh(b)) return "blue";

  return "other-chromatic";
}

test.describe("Rosette Color Halftone rendered-pixel chroma", () => {
  test.beforeEach(async ({ page }) => {
    await bypassRosetteOnboardingTour(page);
    await page.goto("/");
    // The shared fixture photo already has four distinct-hue quadrants (red,
    // green, blue, dark) specifically so channel-specific ink behavior is
    // testable; see halftone-test-helpers.ts.
    await uploadHalftoneTestPhoto(page);
    await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();
    await page.waitForTimeout(200);
  });

  test("browser: default CMYK halftone renders genuinely chromatic ink dots, not a grayscale-only pattern", async ({
    page,
  }) => {
    const samples = await readCanvasChromaSamples(page);
    const chromaticSamples = samples.filter(isChromatic);
    const buckets = new Set(samples.map(hueBucket).filter((bucket): bucket is string => bucket !== null));

    // A real four-hue photo through a working C/M/Y/K compositor produces a
    // large fraction of chromatic pixels. A regression where every channel
    // reads the same ink value (the bug class this test targets) collapses
    // the whole canvas to white/black/gray dots: chromaticSamples would be
    // ~0 and buckets would be empty.
    expect(
      chromaticSamples.length,
      `expected a meaningful fraction of chromatic pixels, got ${chromaticSamples.length}/${samples.length}. Sample: ${JSON.stringify(samples.slice(0, 12))}`,
    ).toBeGreaterThan(samples.length * 0.15);

    expect(
      buckets.size,
      `expected multiple distinct ink hues (proving C/M/Y channels differ per source color), got buckets: ${[...buckets].join(", ")}`,
    ).toBeGreaterThanOrEqual(3);
  });

  test("browser: disabling every CMY channel leaves only achromatic Black ink (negative control)", async ({
    page,
  }) => {
    // Negative control proving the chroma assertion above is meaningful: with
    // Cyan/Magenta/Yellow explicitly turned off, the only remaining channel
    // (Black) is intentionally achromatic (tint (0,0,0)), so the canvas
    // should now legitimately be all-grayscale. This distinguishes "the test
    // can detect chroma at all" from "chroma happens to be present."
    for (const label of ["Cyan", "Magenta", "Yellow"]) {
      const field = page.locator('[data-slot="field"]').filter({ hasText: new RegExp(`^${label}$`) });
      await field.scrollIntoViewIfNeeded();
      await field.locator('[data-slot="switch"]').click();
      await page.waitForTimeout(100);
    }

    const samples = await readCanvasChromaSamples(page);
    const chromaticSamples = samples.filter(isChromatic);

    expect(
      chromaticSamples.length,
      `expected Black-only halftone to be achromatic, found ${chromaticSamples.length} chromatic samples`,
    ).toBe(0);
  });
});
