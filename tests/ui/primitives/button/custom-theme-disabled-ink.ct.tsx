// @subject packages/ui/src/content/theme-scope/tone-knobs.ts
// A user's theme holds a disabled Button of every fill style and tone to the inactive-control legibility floor (D355),
// as the seeds are held: its scope raises the disabled opacity until its own inks read as present. The cases are a
// light page under a light accent, whose tone inks sit near 4.5:1 and fade under 3:1 at the resting step, and a
// mid-grey page, where no ink at the resting step clears 3:1 at all.

import { readSurfaceDesignAudit } from "@orb/testkit/browser/spec";
import { LIGHT_TONE_THEME, MID_GREY } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { CustomThemeDisabledInkStory } from "./_button-tone-stories.tsx";

const STORIES = "tests/ui/primitives/button/_button-tone-stories";

const CUSTOM_THEMES = [
  { name: "a light page under a light accent", tokens: LIGHT_TONE_THEME },
  { name: "a mid-grey page", tokens: { background: MID_GREY } },
] as const;

for (const { name, tokens } of CUSTOM_THEMES) {
  test(`a disabled Button of every fill style and tone reads as present under ${name}`, async ({ mount, page }) => {
    const component = await mount<typeof CustomThemeDisabledInkStory>(`${STORIES}/CustomThemeDisabledInkStory`, { tokens });
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
}
