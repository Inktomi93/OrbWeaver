// CT: the spinner seal — a role=status live region, a visually-hidden label, a spinning SVG that
// scales on the ICON_* size table (ui-package-design §6.1).

import { Spinner } from "@orb/ui/spinner";
import { expect, test } from "@playwright/experimental-ct-react";

// ICON_SM (16px) and ICON_LG (24px) — the spinner's small/large glyph sizes.
const ICON_SM_PX = 16;
const ICON_LG_PX = 24;
const SPIN_CLASS = /animate-spin/u;

test("is a role=status live region carrying the accessible label", async ({ mount, page }) => {
  await mount(<Spinner label="Saving changes" />);
  const status = page.getByRole("status");
  await expect(status).toHaveText("Saving changes");
});

test("the glyph spins", async ({ mount, page }) => {
  await mount(<Spinner label="Loading" />);
  await expect(page.locator("svg")).toHaveClass(SPIN_CLASS);
});

test("size scales the glyph on the ICON_* table (lg > sm)", async ({ mount, page }) => {
  await mount(<Spinner label="Loading" size="sm" />);
  const smallBox = await page.locator("svg").boundingBox();
  expect(Math.round(smallBox?.width ?? 0)).toBe(ICON_SM_PX);
});

test("large size renders the 24px glyph", async ({ mount, page }) => {
  await mount(<Spinner label="Loading" size="lg" />);
  const largeBox = await page.locator("svg").boundingBox();
  expect(Math.round(largeBox?.width ?? 0)).toBe(ICON_LG_PX);
});
