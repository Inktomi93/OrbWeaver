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

// ── THE SHEET PROJECTS BY BEHAVIOR KIND, NEVER BY ID (#1789) ─────────────────────────────────────────
// The ⌘K palette's sheet row used to come from the sheet's OWN `useModalRegistry()` lookup for the one
// `topbar.trail`-placed modal — a hardcoded row beside a blind projection, which is how the same modal
// could be listed twice or not at all. It is now the same `topbar.trail` entry the desktop trail renders,
// curated `mobile: "sheet"`, and the sheet's rule is stated in terms of KIND: a ROW-shaped overflow entry
// (modal/section) joins the row group; a WIDGET renders its own `body("sheet")` lens in the block below.
// RED on 43ae0481a: the lookup and the projection both fired, so "Jump to…" resolved to TWO rows.
test("a topbar.trail MODAL curated for the sheet is ONE row, and it joins the row group", async ({ mount }) => {
  const sheet = await mount(<YouSheetProjectionStory />);
  const group = sheet.getByRole("group", { name: "Account and settings" });

  await expect(sheet.getByText("Jump to…", { exact: true })).toHaveCount(1);
  await expect(group.getByText("Jump to…", { exact: true })).toBeVisible();
  // …and the WIDGET half of the same rule: its lens is a panel, so it keeps its own block outside the row
  // group. One filter, two presentations — the kinds are what decides, never the entry's id.
  await expect(sheet.getByTestId("trail-sheet-lens")).toBeVisible();
  await expect(group.getByTestId("trail-sheet-lens")).toHaveCount(0);
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
