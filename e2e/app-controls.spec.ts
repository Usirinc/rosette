import { expect, test } from "@playwright/test";

import {
  bypassRosetteOnboardingTour,
  HALFTONE_PRODUCT_OUTPUT_SELECTOR,
  uploadHalftoneTestPhoto,
} from "./halftone-test-helpers";

// This folder is a real product (Rosette Color Halftone), not the neutral
// starter template anymore. These checks prove the Toolcraft runtime shell
// still renders correctly and the canvas stays empty/neutral until a photo
// is uploaded, matching the starter's original upload-flow contract.
// Control-level and export coverage live in halftone-app.spec.ts.

test("browser: runtime shell renders with an empty canvas before any photo is uploaded", async ({
  page,
}) => {
  await bypassRosetteOnboardingTour(page);
  await page.goto("/");

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();

  // No placeholder/sample halftone output before a real photo exists.
  await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toHaveCount(0);

  // No timeline/playback transport exists for this still-image product.
  await expect(page.getByRole("button", { name: /Play playback|Pause playback/ })).toHaveCount(0);
});

test("browser: dropping a photo on the canvas routes to the Source upload and renders the halftone canvas", async ({
  page,
}) => {
  await bypassRosetteOnboardingTour(page);
  await page.goto("/");

  await uploadHalftoneTestPhoto(page);

  await expect(page.locator(HALFTONE_PRODUCT_OUTPUT_SELECTOR)).toBeVisible();
});
