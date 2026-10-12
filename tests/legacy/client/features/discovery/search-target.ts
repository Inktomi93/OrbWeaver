// The corpus omnibox's target is one select: open it, pick the option. Shared by the discovery CTs that
// drive the search from a mounted surface.

import { expect } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

const SEARCH_TARGET = "Search target";

/** Pick `label` in the "Search target" select of the surface under `component`. */
export async function pickSearchTarget(component: Locator, label: string): Promise<void> {
  await component.getByRole("combobox", { name: SEARCH_TARGET }).click();
  await component.page().getByRole("option", { name: label, exact: true }).click();
}

/** The select's own face: which target is in force. */
export async function expectSearchTarget(component: Locator, label: string): Promise<void> {
  await expect(component.getByRole("combobox", { name: SEARCH_TARGET })).toHaveText(label);
}
