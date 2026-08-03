// YouSheet CT — the mobile "You" sheet is a BLIND PROJECTION over the resolved chrome list
// (shell-chrome-unification.md §E-5 / §C). Proves the two projection arms off ONE registry: a `rail.end`
// WIDGET renders its own `body("sheet")` lens (called with presentation "sheet", not "bar"), and a
// `mobile:"sheet"` overflow section renders as a "More" row. A chrome entry added once at the door thus
// reaches the sheet with no second hand-maintained derivation.

import { expect, test } from "@playwright/experimental-ct-react";
import { YouSheetProjectionStory } from "../_ct-stories.tsx";

test("a rail.end widget renders its body('sheet') lens; an overflow section becomes a More row", async ({ mount }) => {
  const sheet = await mount(<YouSheetProjectionStory />);

  // The widget's sheet lens is rendered with the "sheet" presentation (not the desktop "bar" lens).
  await expect(sheet.getByTestId("sheet-lens")).toHaveText("lens:sheet");
  // The `mobile:"sheet"` overflow section projects as a titled row under "More".
  await expect(sheet.getByText("More")).toBeVisible();
  await expect(sheet.getByText("Fake overflow section")).toBeVisible();
});
