// YouSheet CT — the mobile "You" sheet is a BLIND PROJECTION over the resolved chrome list
// (shell-chrome-unification.md §E-5 / §C). Proves the two projection arms off ONE registry: a `rail.end`
// WIDGET renders its own `body("sheet")` lens (called with presentation "sheet", not "bar"), and a
// `mobile:"sheet"` overflow section renders as a "More" row. A chrome entry added once at the door thus
// reaches the sheet with no second hand-maintained derivation.

import { expect, test } from "@playwright/experimental-ct-react";
import { YouSheetProjectionStory, YouSheetSwapStory } from "../_ct-stories.tsx";

test("a rail.end widget renders its body('sheet') lens; an overflow section becomes a More row", async ({ mount }) => {
  const sheet = await mount(<YouSheetProjectionStory />);

  // The widget's sheet lens is rendered with the "sheet" presentation (not the desktop "bar" lens).
  await expect(sheet.getByTestId("sheet-lens")).toHaveText("lens:sheet");
  // The `mobile:"sheet"` overflow section projects as a titled row under "More".
  await expect(sheet.getByText("More")).toBeVisible();
  await expect(sheet.getByText("Fake overflow section")).toBeVisible();
});

// ── THE PHONE'S OVERFLOW INCLUDES THE TOPBAR'S OWN WIDGETS (side-eye leg-4 P2) ───────────────────────
// The notifications inbox is a 48px control in a 320px row whose job is to say where you are, so it
// declares `mobile: "sheet"` — the SAME curation the overflow sections have always declared — and renders
// its own sheet lens here. The seam, not the bell, is what this pins: a `topbar.trail` widget curated for
// the sheet reaches the sheet, and reaches it in its SHEET presentation.
test('a topbar.trail widget curated `mobile:"sheet"` projects into the sheet, in its sheet lens', async ({ mount }) => {
  const sheet = await mount(<YouSheetProjectionStory />);
  await expect(sheet.getByTestId("trail-sheet-lens")).toHaveText("trail:sheet");
});

// ── THE OTHER HALF OF THE BAR'S SWAP (#484) ──────────────────────────────────────────────────────────
// The current section takes a bar slot while you stand in it, so it leaves this list — and the tab it
// displaced arrives here. One derivation feeds both surfaces (`mobileBarCuration`) precisely so that
// trade can never drop a section out of BOTH: a displaced tab that projected nowhere would be a section
// with no door at all on a phone.
test("standing in an overflow section: it leaves More, and the tab it displaced arrives", async ({ mount }) => {
  const sheet = await mount(<YouSheetSwapStory />);
  const more = sheet.getByRole("group", { name: "More" });

  // Characters is a `mobile:"tab"` section — it is here ONLY because corpus borrowed its slot.
  await expect(more.getByText("Characters", { exact: true })).toBeVisible();
  // …and corpus, which is on the bar right now, does not also sit in the overflow list.
  await expect(more.getByText("Corpus", { exact: true })).toHaveCount(0);
});
