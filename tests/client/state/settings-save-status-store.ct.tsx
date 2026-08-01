// CT: the settings save-status store (SET-SEAMS §3 / pin P4, the aggregation half) — the precedence fold
// (error > saving > saved), the "nothing reported ⇒ null" arm the host renders as NOTHING, and the
// unmount-clears contract. A CT, not a unit test: the store's only read surface is its reactive hooks
// (useSyncExternalStore needs a browser render — the composer-draft-store.ct posture).
//
// The seam's END-TO-END behavior (one footer, inline error + retry at the failing section, the nav marker,
// the degrade arm) rides tests/client/features/settings/components/settings-save-footer.ct.tsx.

import { expect, test } from "@playwright/experimental-ct-react";
import { SettingsSaveStatusProbe } from "./_ct-stories";

test("folds the reported states by precedence, and clears back to nothing on unmount", async ({ mount }) => {
  const probe = await mount(<SettingsSaveStatusProbe />);
  const out = probe.locator("output");

  // Nothing reported ⇒ no aggregate at all (the host renders nothing, so an unreporting pane is unchanged).
  await expect(out).toContainText("aggregate=none errored=none");

  await probe.getByRole("button", { name: "a saved" }).click();
  await expect(out).toContainText("aggregate=saved errored=none");

  // saving beats saved…
  await probe.getByRole("button", { name: "b saving" }).click();
  await expect(out).toContainText("aggregate=saving errored=none");

  // …and error beats both, naming the failing section so the footer can locate it.
  await probe.getByRole("button", { name: "a error" }).click();
  await expect(out).toContainText("aggregate=error errored=probe-a");

  // A section's own recovery re-folds the aggregate.
  await probe.getByRole("button", { name: "a saved" }).click();
  await expect(out).toContainText("aggregate=saving errored=none");
  await probe.getByRole("button", { name: "b saved" }).click();
  await expect(out).toContainText("aggregate=saved errored=none");

  // Unmount clears — a pane swap can never leave a ghost "saving" in the footer.
  await probe.getByRole("button", { name: "clear both" }).click();
  await expect(out).toContainText("aggregate=none errored=none");
});
