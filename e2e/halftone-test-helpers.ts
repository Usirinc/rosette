import type { Page } from "@playwright/test";

const ROSETTE_ONBOARDING_STORAGE_KEY = "rosette.onboarding.seen.v1";

/**
 * The first-visit "Welcome to Rosette" onboarding tour (src/app/onboarding.tsx)
 * auto-opens on every fresh browser context and traps the accessibility tree,
 * so `getByRole("application", { name: "Canvas viewport" })` never resolves
 * until it's dismissed. Suites that don't exercise the tour itself (see
 * e2e/onboarding.spec.ts, which relies on the real first-visit state) should
 * call this before `page.goto` so it never opens in the first place.
 */
export async function bypassRosetteOnboardingTour(page: Page): Promise<void> {
  await page.addInitScript(
    (storageKey) => window.localStorage.setItem(storageKey, "1"),
    ROSETTE_ONBOARDING_STORAGE_KEY,
  );
}

/**
 * Generates a synthetic in-browser test photo with four quadrants of
 * distinct hue (pure red, green, blue) plus a dark shadow corner, so tests
 * can assert channel-specific ink behavior: red is magenta/yellow-heavy and
 * cyan-light, green is cyan/yellow-heavy, blue is cyan/magenta-heavy, and
 * the dark corner is black-ink-heavy.
 */
export async function createHalftoneTestPhotoDataUrl(
  page: Page,
  { height = 800, width = 1200 }: { height?: number; width?: number } = {},
): Promise<string> {
  return page.evaluate(
    ({ height, width }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      const halfW = width / 2;
      const halfH = height / 2;

      ctx.fillStyle = "#ff2020";
      ctx.fillRect(0, 0, halfW, halfH);
      ctx.fillStyle = "#20c020";
      ctx.fillRect(halfW, 0, halfW, halfH);
      ctx.fillStyle = "#2040ff";
      ctx.fillRect(0, halfH, halfW, halfH);
      ctx.fillStyle = "#141414";
      ctx.fillRect(halfW, halfH, halfW, halfH);

      return canvas.toDataURL("image/png");
    },
    { height, width },
  );
}

/** Uploads a generated test photo by dropping it on the canvas viewport. */
export async function uploadHalftoneTestPhoto(
  page: Page,
  options: { fileName?: string; height?: number; width?: number } = {},
): Promise<void> {
  const dataUrl = await createHalftoneTestPhotoDataUrl(page, options);
  const fileName = options.fileName ?? "halftone-test-photo.png";

  const dataTransfer = await page.evaluateHandle(
    async ({ dataUrl, fileName }) => {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: "image/png" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      return transfer;
    },
    { dataUrl, fileName },
  );

  await page
    .getByRole("application", { name: "Canvas viewport" })
    .dispatchEvent("drop", { dataTransfer });

  await page.waitForTimeout(200);
}

export const HALFTONE_PRODUCT_OUTPUT_SELECTOR = '[data-toolcraft-product-output]';
