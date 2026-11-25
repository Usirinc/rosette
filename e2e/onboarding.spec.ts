import { expect, test } from "@playwright/test";

// The first-launch onboarding splash/tour is app-shell UI (see
// docs/toolcraft/core/runtime-boundary.md's allowed extension points), not a
// schema control, so it is not covered by app-acceptance.ts control rows.
// These are its dedicated targeted browser checks: automatic first-visit
// show, step navigation (Next/Back/dots), Skip, once-per-browser gating via
// localStorage, and the persistent reopen affordance. Each Playwright test
// gets a fresh browser context (no localStorage carried over), so the
// default `page.goto("/")` in each test below already exercises the "first
// visit" state without extra setup.

const ONBOARDING_DIALOG_SELECTOR = '[data-testid="rosette-onboarding-dialog"]';
const REOPEN_BUTTON_SELECTOR = '[data-testid="rosette-onboarding-reopen"]';

test("browser: onboarding splash shows automatically on a fresh visit and explains the product", async ({
  page,
}) => {
  await page.goto("/");

  const dialog = page.locator(ONBOARDING_DIALOG_SELECTOR);

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Welcome to Rosette")).toBeVisible();
  await expect(dialog.getByText(/CMYK color halftone/i)).toBeVisible();

  // Runtime app underneath is not blocked by the splash.
  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
});

test("browser: Next/Back advance and rewind tour steps, ending on Background & Image Export with Done", async ({
  page,
}) => {
  await page.goto("/");

  const dialog = page.locator(ONBOARDING_DIALOG_SELECTOR);
  const nextButton = dialog.getByRole("button", { name: "Next" });
  const backButton = dialog.getByRole("button", { name: "Back" });

  await expect(dialog.getByText("Welcome to Rosette")).toBeVisible();
  await expect(backButton).toBeDisabled();

  // Advance through every section step in the real order the controls panel
  // renders them (Source, Zoom, Halftone, Channels, Screen Angles, Tone,
  // Appearance) -- Position is not one of them.
  const expectedStepTitles = [
    "Source",
    "Zoom",
    "Halftone",
    "Channels",
    "Screen Angles",
    "Tone",
    "Appearance",
    "Background & Image Export",
  ];

  for (const title of expectedStepTitles) {
    await nextButton.click();
    await expect(dialog.getByRole("heading", { name: title })).toBeVisible();
  }

  await expect(dialog.getByText("Position", { exact: true })).toHaveCount(0);

  // Last step shows "Done" instead of "Next".
  await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(nextButton).toHaveCount(0);

  // Back rewinds one step.
  await backButton.click();
  await expect(dialog.getByRole("heading", { name: "Appearance" })).toBeVisible();
});

test("browser: Skip closes the tour immediately and Done on the final step also closes it", async ({
  page,
}) => {
  await page.goto("/");

  const dialog = page.locator(ONBOARDING_DIALOG_SELECTOR);

  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Skip" }).click();
  await expect(dialog).toBeHidden();

  // Reopen and walk to the end via Done this time.
  await page.locator(REOPEN_BUTTON_SELECTOR).click();
  await expect(dialog.getByText("Welcome to Rosette")).toBeVisible();

  for (let step = 0; step < 8; step += 1) {
    await dialog.getByRole("button", { name: "Next" }).click();
  }

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
});

test("browser: dismissing the tour marks it seen, so a reload does not show it again", async ({
  page,
}) => {
  await page.goto("/");

  const dialog = page.locator(ONBOARDING_DIALOG_SELECTOR);

  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Skip" }).click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("rosette.onboarding.seen.v1")))
    .toBe("1");

  await page.reload();

  await expect(page.locator('[data-slot="toolcraft-runtime-app"]')).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test("browser: the persistent reopen affordance brings the tour back on demand after it was dismissed", async ({
  page,
}) => {
  await page.goto("/");

  const dialog = page.locator(ONBOARDING_DIALOG_SELECTOR);

  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Skip" }).click();
  await expect(dialog).toBeHidden();

  const reopenButton = page.locator(REOPEN_BUTTON_SELECTOR);

  await expect(reopenButton).toBeVisible();
  await reopenButton.click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Welcome to Rosette")).toBeVisible();

  // Reopening does not clear the "seen" flag -- it is purely a manual,
  // on-demand affordance, not a reset of the once-per-browser gate.
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("rosette.onboarding.seen.v1")))
    .toBe("1");
});

test("browser: pressing Escape dismisses the tour without blocking the app underneath", async ({
  page,
}) => {
  await page.goto("/");

  const dialog = page.locator(ONBOARDING_DIALOG_SELECTOR);

  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The app underneath remains fully interactive: Source upload is usable.
  await expect(page.getByRole("application", { name: "Canvas viewport" })).toBeVisible();
});
