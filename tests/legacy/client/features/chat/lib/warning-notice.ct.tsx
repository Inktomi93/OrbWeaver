// warning-notice (rendered) — the #1440 provider-degradation notice as a user actually meets it.
//
// WHY A CT AND NOT ANOTHER UNIT ARM: the mapper's return value is already pinned in `warning-notice.test.ts`.
// What that file structurally cannot answer is whether the notice REACHES a screen: between the wire and the
// pixels sit the bus reducer's forwarding (which, before this row, handed the mapper a bare code that could
// not have produced this copy at all) and the toast outlet. The story drives the REAL reducer into the REAL
// production toaster, so a regression anywhere on that path — a reducer that drops the detail, a mapper that
// throws on the new arm, a notice that renders empty — reds here.
//
// The claim is the RENDERED TEXT: a user reading this toast learns WHICH of their settings the provider
// refused, and what it used instead. "Your settings were adjusted" would pass a mapper test and fail the
// product, which is the whole reason this row exists.

import { expect, test } from "@playwright/experimental-ct-react";
import { ProviderAdjustmentWarningStory } from "../_ct-stories.tsx";

const TOAST = '[data-slot="toast-root"]';

test("a dropped sampling knob names THAT knob in the rendered toast", async ({ mount, page }) => {
  const probe = await mount(<ProviderAdjustmentWarningStory />);
  await probe.getByTestId("raise-knob-drop").click();

  const toast = page.locator(TOAST);
  await expect(toast).toHaveCount(1);
  // The word the preset deck prints for `topP` — not the wire spelling, and not a generic "a setting".
  await expect(toast).toContainText("Top-P");
  await expect(toast).toContainText("wasn't used for this reply");
});

test("a clamp names the value the provider actually used", async ({ mount, page }) => {
  const probe = await mount(<ProviderAdjustmentWarningStory />);
  await probe.getByTestId("raise-budget-clamp").click();

  const toast = page.locator(TOAST);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Your thinking budget was reduced");
  // The SUBSTITUTE is the actionable half: a user who is told only "reduced" cannot tell whether it mattered.
  await expect(toast).toContainText("1536");
});
