// CT: `<RpgFreshnessIndicator>` — the takeover's honest state-freshness hint (the 2026-07-27 owner ruling:
// a post-commit round's lag is ACCEPTED as long as an indicator surfaces it; a mode with NO post-commit call
// must NOT show a fake lag). Mounted in isolation (a pure component — no providers/network), so every honest
// state is deterministically assertable without driving a live turn over SSE. Asserts the LABEL datum per state
// (the tracker-kit a11y model: text is the datum) + that the FOLDED path ignores `pending` (no "Updating…").
// R1 correction: `cheap` runs a dedicated round too, so it lags — its old "Live" claim was inherited from
// D108's inline-tools shape and was a lie after D109. (The third mode, a dedicated structured round, was
// deleted 2026-08-01 — its lag states are `cheap`'s, unchanged.)

import { expect, test } from "@playwright/experimental-ct-react";
import { RpgFreshnessCheapIdleStory, RpgFreshnessCheapStory, RpgFreshnessFoldedStory } from "../_ct-stories";

test("cheap + idle: surfaces the accepted one-beat lag ('As of last beat')", async ({ mount }) => {
  const component = await mount(<RpgFreshnessCheapIdleStory />);
  await expect(component.getByText("As of last beat")).toBeVisible();
  // Not the transient, and never the folded-mode label.
  await expect(component.getByText("Updating…")).toHaveCount(0);
  await expect(component.getByText("Live")).toHaveCount(0);
});

test("cheap + pending: the post-commit round's window shows the transient 'Updating…' (pulse aria-hidden), never a false 'Live'", async ({ mount }) => {
  const component = await mount(<RpgFreshnessCheapStory />);
  await expect(component.getByText("Updating…")).toBeVisible();
  await expect(component.getByText("As of last beat")).toHaveCount(0);
  await expect(component.getByText("Live")).toHaveCount(0);
  // The decorative pulse mark carries no accessible name — the label IS the datum (the pill root carries the
  // `rpg-freshness` slot; the pulse glyph is its aria-hidden descendant).
  await expect(component).toHaveAttribute("data-slot", "rpg-freshness");
  await expect(component.locator(".animate-pulse")).toHaveAttribute("aria-hidden", "true");
});

test("folded: a minimal 'Live' affordance — no fake lag label, and `pending` does NOT flip it to 'Updating…'", async ({ mount }) => {
  const component = await mount(<RpgFreshnessFoldedStory />);
  await expect(component.getByText("Live")).toBeVisible();
  await expect(component.getByText("As of last beat")).toHaveCount(0);
  await expect(component.getByText("Updating…")).toHaveCount(0);
});
