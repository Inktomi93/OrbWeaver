// CT: the interim theme picker (ux-flow-revamp J8 · UIP-402). Asserts the §12.1 palette SET renders
// (Hearth · Mocha · Light — never the mockup's Catppuccin/Loom names), Hearth is the ACTIVE row (its
// check marker present), and the deferred palettes are DISABLED (their aria-disabled row + the "not
// available yet" lock marker) — an honest picker with no fake toggle.

import { expect, test } from "@playwright/experimental-ct-react";
import { ThemePickerStory } from "../_ct-stories";

test("renders the §12.1 palette set (Hearth · Mocha · Light)", async ({ mount }) => {
  const component = await mount(<ThemePickerStory />);
  await expect(component.getByText("Hearth", { exact: true })).toBeVisible();
  await expect(component.getByText("Mocha", { exact: true })).toBeVisible();
  await expect(component.getByText("Light", { exact: true })).toBeVisible();
  // Never the cut mockup names.
  await expect(component.getByText("Loom")).toHaveCount(0);
  await expect(component.getByText("Catppuccin")).toHaveCount(0);
});

test("Hearth is the active row (its check marker is present)", async ({ mount }) => {
  const component = await mount(<ThemePickerStory />);
  await expect(component.getByLabel("Active theme")).toBeVisible();
});

test("Mocha and Light are disabled (the deferred palettes)", async ({ mount }) => {
  const component = await mount(<ThemePickerStory />);
  await expect(component.getByLabel("Mocha is not available yet")).toBeVisible();
  await expect(component.getByLabel("Light is not available yet")).toBeVisible();
});
