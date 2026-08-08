// AutosaveStatus CT — the shared "Saved / Saving… / Save failed — Retry" affordance (north-star §7 /
// D66 A4) every autosave editor renders where its Save button used to be. Pins: the three lifecycle
// states each read out, and the ERROR-state retry is a REAL affordance (a button that fires `onRetry`),
// never styled text. CT (not headless) because the retry is a render + click contract (§7).

import { expect, test } from "@playwright/experimental-ct-react";
import { AutosaveStatusStory } from "./_ct-stories.tsx";

test("reads out each lifecycle state and the error-state Retry fires onRetry", async ({ mount }) => {
  const component = await mount(<AutosaveStatusStory />);

  // Default lifecycle — the muted micro "Saved" readout.
  await expect(component.getByText("Saved")).toBeVisible();

  await component.getByRole("button", { name: "set saving" }).click();
  await expect(component.getByText("Saving…")).toBeVisible();

  // The HELD-write arm (side-eye PROSE-LIMIT P2): the driver gates on `form.state.isValid`, so an invalid
  // form is a write nobody is making — and this line used to keep reading "Saved" over it. It is POLITE
  // (role=status), unlike `error`: nothing failed, and the interrupting announcement belongs to the field's
  // own error. No Retry — retrying an invalid form does nothing.
  await component.getByRole("button", { name: "set blocked" }).click();
  const blocked = component.locator('[data-slot="autosave-status"]');
  await expect(blocked).toContainText("Not saved");
  await expect(blocked).toHaveAttribute("role", "status");
  await expect(blocked.getByRole("button", { name: "Retry" })).toHaveCount(0);

  await component.getByRole("button", { name: "set error" }).click();
  await expect(component.getByText("Save failed —")).toBeVisible();

  // Retry is a BUTTON (an affordance, not text) — clicking it fires the injected onRetry.
  await component.getByRole("button", { name: "Retry" }).click();
  await expect(component.getByTestId("autosave-status-retries")).toHaveText("1");
});
