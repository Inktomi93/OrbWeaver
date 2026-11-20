// @subject packages/ui/src/primitives/icons/variants.ts
// A glyph over art takes the theme-derived over-art halo, never a framework default (ui-surface-and-interaction-rules §2.8),
// read against a probe that draws the served token in the same scope, so the halo follows every seed's polarity.
import { computedStyle } from "@orb/testkit/browser/spec";
import { SEED_CASES } from "@orb/testkit/iso";
import { expect, test } from "@playwright/test";
import type { IconShadowStory } from "./_icon-shadow-stories.tsx";

const STORY = "tests/ui/primitives/icons/_icon-shadow-stories/IconShadowStory";

for (const { name, ...props } of SEED_CASES) {
  test(`${name}: the Icon shadow is the over-art halo token drawn as a drop shadow`, async ({ mount }) => {
    const component = await mount<typeof IconShadowStory>(STORY, props);
    const halo = await computedStyle(component.locator('[data-probe="over-art"]'), "filter");
    expect(halo).toMatch(/^drop-shadow\(/u);
    expect(await computedStyle(component.locator('[data-case="glyph"] svg'), "filter")).toBe(halo);
  });
}
