// CT: `<RpgFreshnessIndicator>` — the takeover's honest state-freshness hint (the 2026-07-27 owner ruling:
// the reliable-mode one-beat lag is ACCEPTED as long as an indicator surfaces it; cheap mode must NOT show a
// fake lag). Mounted in isolation (a pure component — no providers/network), so the three honest states are
// deterministically assertable without driving a live turn over SSE. Asserts the LABEL datum per state (the
// tracker-kit a11y model: text is the datum) + that cheap mode ignores `pending` (no "Updating…").

import { expect, test } from "@playwright/experimental-ct-react";
import { RpgFreshnessCheapStory, RpgFreshnessReliableIdleStory, RpgFreshnessReliablePendingStory } from "../_ct-stories";

test("reliable + idle: surfaces the accepted one-beat lag ('As of last beat')", async ({ mount }) => {
  const component = await mount(<RpgFreshnessReliableIdleStory />);
  await expect(component.getByText("As of last beat")).toBeVisible();
  // Not the transient, not the cheap-mode label.
  await expect(component.getByText("Updating…")).toHaveCount(0);
  await expect(component.getByText("Live")).toHaveCount(0);
});

test("reliable + pending: the extraction window shows the transient 'Updating…' (pulse aria-hidden)", async ({ mount }) => {
  const component = await mount(<RpgFreshnessReliablePendingStory />);
  await expect(component.getByText("Updating…")).toBeVisible();
  await expect(component.getByText("As of last beat")).toHaveCount(0);
  // The decorative pulse mark carries no accessible name — the label IS the datum (the pill root carries the
  // `rpg-freshness` slot; the pulse glyph is its aria-hidden descendant).
  await expect(component).toHaveAttribute("data-slot", "rpg-freshness");
  await expect(component.locator(".animate-pulse")).toHaveAttribute("aria-hidden", "true");
});

test("cheap: a minimal 'Live' affordance — no fake lag label, and `pending` does NOT flip it to 'Updating…'", async ({ mount }) => {
  const component = await mount(<RpgFreshnessCheapStory />);
  await expect(component.getByText("Live")).toBeVisible();
  await expect(component.getByText("As of last beat")).toHaveCount(0);
  await expect(component.getByText("Updating…")).toHaveCount(0);
});
