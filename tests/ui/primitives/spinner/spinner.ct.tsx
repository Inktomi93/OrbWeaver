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

// Assert the glyph's computed CSS width (transform-independent) rather than boundingBox(): the
// glyph spins (animate-spin), and boundingBox returns the AXIS-ALIGNED box of a rotating square,
// which grows to ~size·√2 mid-rotation — an exact === size assertion is flaky by construction.
test("size scales the glyph on the ICON_* table (lg > sm)", async ({ mount, page }) => {
  await mount(<Spinner label="Loading" size="sm" />);
  await expect(page.locator("svg")).toHaveCSS("width", `${ICON_SM_PX}px`);
});

test("large size renders the 24px glyph", async ({ mount, page }) => {
  await mount(<Spinner label="Loading" size="lg" />);
  await expect(page.locator("svg")).toHaveCSS("width", `${ICON_LG_PX}px`);
});
