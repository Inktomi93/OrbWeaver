// @subject packages/ui/src/primitives/button/variants.ts
// A disabled Button of every fill style, in every tone, keeps text the design audit's inactive-control-legibility rule accepts: a
// disabled control stays legible as a control instead of fading below the UI-component boundary.

import { readSurfaceDesignAudit } from "@orb/testkit/browser/spec";
import { expect, test } from "@playwright/test";
import type { DisabledInkStory } from "./_button-tone-stories.tsx";

const STORIES = "tests/ui/primitives/button/_button-tone-stories";

test("a disabled Button of every fill style and tone reads as present to the design audit", async ({ mount, page }) => {
  const component = await mount<typeof DisabledInkStory>(`${STORIES}/DisabledInkStory`, {});
  const buttons = component.getByRole("button");
  // Positive control: the story's buttons are on the page and every one is disabled, so the audit has something to judge.
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const button of await buttons.all()) {
    await expect(button).toBeDisabled();
  }
  const { audit } = await readSurfaceDesignAudit(page);
  const faint = audit.findings.filter(({ rule }) => rule === "inactive-control-legibility");
  expect(faint.map(({ selector, value }) => `${selector} ${value}`)).toEqual([]);
});
