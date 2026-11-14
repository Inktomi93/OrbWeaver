// @subject packages/ui/src/primitives/button/variants.ts
// A disabled Button of every fill style, in every tone and under every seed palette, keeps text the design audit's
// inactive-control-legibility rule accepts: a disabled control stays legible as a control instead of fading below the
// UI-component boundary. A disabled solid Button wears the muted pair at full opacity, so the half-opacity step never dims it twice.

import { readSurfaceDesignAudit } from "@orb/testkit/browser/spec";
import { SEED_SCOPES } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { DisabledInkStory } from "./_button-tone-stories.tsx";

const STORIES = "tests/ui/primitives/button/_button-tone-stories";

for (const scope of SEED_SCOPES) {
  test(`a disabled Button of every fill style and tone reads as present under the ${scope.name}`, async ({ mount, page }) => {
    const component = await mount<typeof DisabledInkStory>(`${STORIES}/DisabledInkStory`, "theme" in scope ? { theme: scope.theme } : {});
    const buttons = component.getByRole("button");
    // Positive control: the story's buttons are on the page and every one is disabled, so the audit has something to judge.
    expect(await buttons.count()).toBeGreaterThan(0);
    for (const button of await buttons.all()) {
      await expect(button).toBeDisabled();
    }
    // The solid style drops its fill for the muted pair and takes no further dimming.
    const solids = component.locator('[data-case="solid"]');
    expect(await solids.count()).toBeGreaterThan(0);
    for (const solid of await solids.all()) {
      await expect(solid).toHaveCSS("opacity", "1");
    }
    const { audit } = await readSurfaceDesignAudit(page);
    const faint = audit.findings.filter(({ rule }) => rule === "inactive-control-legibility");
    expect(faint.map(({ selector, value }) => `${selector} ${value}`)).toEqual([]);
  });
}
