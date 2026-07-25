// CT: the #9 memory-marker peek (compact-summary-peek.tsx) — the context-boundary divider's "View"
// popover revealing the LINEAR-tier compaction summary standing in for the messages above the boundary.
// The load-bearing behavior is that the summary text is NOT in the document until the user opens the
// popover (it's a click-to-reveal, not always-rendered), and that opening reveals the whitespace-preserved
// readout. The popup renders through a Base UI Portal, so it's read via the PAGE locator.

import { expect, test } from "@playwright/experimental-ct-react";
import { CompactSummaryPeekStory } from "../_ct-stories";

const SUMMARY = "Aria and the traveller struck a bargain at the crossroads.\nThe map changed hands.";

test("the trigger renders but the summary text is hidden until opened", async ({ mount, page }) => {
  await mount(<CompactSummaryPeekStory summary={SUMMARY} />);
  await expect(page.getByRole("button", { name: "View memory summary" })).toBeVisible();
  // Nothing is revealed on mount — the summary text is behind the closed popover.
  await expect(page.locator('[data-slot="compact-summary-text"]')).toHaveCount(0);
});

test("clicking View reveals the compaction summary readout", async ({ mount, page }) => {
  await mount(<CompactSummaryPeekStory summary={SUMMARY} />);
  await page.getByRole("button", { name: "View memory summary" }).click();

  const text = page.locator('[data-slot="compact-summary-text"]');
  await expect(text).toBeVisible();
  await expect(text).toContainText("struck a bargain at the crossroads");
  await expect(text).toContainText("The map changed hands");
});
