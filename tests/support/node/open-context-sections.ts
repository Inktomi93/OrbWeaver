// THE "THIS CHAT" TAB'S DISCLOSURE WALK (#830) — the one spelling every CT that mounts
// `CommittedSettingsTab` uses to reach a section's BODY.
//
// The pane opens as an INDEX: only the two write surfaces (Field overrides, Injections) expand themselves,
// and every other section is a closed disclosure whose kicker IS its trigger. A closed Base UI panel is
// REMOVED from the DOM, so a test whose subject is another section's body presses that section's kicker
// first — and a host-band section needs `HOST_BAND` opened before its own trigger exists at all.
//
// Matched by PREFIX, not exactly: three kickers carry a count chip that lands with its own non-suspending
// read ("Documents" → "Documents 1"), so an exact name would race the chip. `aria-expanded` (Base UI owns
// it on the trigger) is the settle barrier — never a bare click followed by a body read.

import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** The host-ops band. Its own children are open by default, so ONE press reaches all of them. */
export const HOST_BAND = "Host controls";

/**
 * Press each named section's kicker in order, barriering on its settled expanded state.
 *
 * IDEMPOTENT ON PURPOSE: the posture is REMEMBERED per device, so a test that remounts the tab in the same
 * page finds the sections it opened already open — an unconditional click there would CLOSE them, which is
 * a defect the test would then blame on the subject. The visibility barrier before the state read is the
 * mount race (a trigger inside a band that was itself just opened).
 */
export async function openContextSections(component: Locator, ...kickers: readonly string[]): Promise<void> {
  for (const kicker of kickers) {
    const trigger = component.getByRole("button", { name: new RegExp(`^${kicker}`, "u") });
    await expect(trigger).toBeVisible();
    if ((await trigger.getAttribute("aria-expanded")) !== "true") {
      await trigger.click();
    }
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  }
}
