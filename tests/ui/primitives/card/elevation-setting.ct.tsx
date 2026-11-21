// @subject packages/ui/src/primitives/card/variants.ts
// The raised-in-flow row of ui-surface-and-interaction-rules §2: an elevated Card casts the float shadow at every elevation
// value, and an interactive or static Card never casts.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { computedStyle } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ElevationSettingStory } from "./_elevation-setting-stories.tsx";

const STORY = "tests/ui/primitives/card/_elevation-setting-stories/ElevationSettingStory";
const ELEVATIONS = appearanceSettingsSchema.unwrap().shape.elevation.unwrap().unwrap().options;

for (const elevation of ELEVATIONS) {
  test(`${elevation}: the elevated Card casts the float shadow, an interactive or static Card never`, async ({ mount }) => {
    const component = await mount<typeof ElevationSettingStory>(STORY, { elevation });
    const recipe = await computedStyle(component.locator('[data-probe="float-shadow"]'), "box-shadow");
    expect(recipe).not.toBe("none");
    const casts = async (name: string): Promise<boolean> => (await computedStyle(component.locator(`[data-case="${name}"]`), "box-shadow")).endsWith(recipe);
    expect({ elevated: await casts("elevated"), interactive: await casts("interactive"), static: await casts("static") }).toStrictEqual({
      elevated: true,
      interactive: false,
      static: false,
    });
  });
}
