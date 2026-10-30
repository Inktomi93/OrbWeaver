import { AA_NON_TEXT_RATIO, wcagContrastRatio } from "@orb/kit/theme-derivation";
import { pixelSurface } from "@orb/testkit/browser/spec";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { CheckboxHostsStory } from "./_checkbox-contrast-stories.tsx";
import { CHECKBOX_HOSTS, CUSTOM_MID_GREY } from "./checkbox-hosts.ts";

const STORY = "tests/ui/primitives/checkbox/_checkbox-contrast-stories/CheckboxHostsStory";
const CASES = [
  { name: "hearth seed" },
  ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[]).map((theme) => ({ name: `${theme} seed`, theme })),
  { name: "custom mid-grey ThemeScope", background: CUSTOM_MID_GREY },
] as const;

// One device pixel per CSS pixel, so the one-pixel edge strip sampled below lands on whole device rows.
test.use({ deviceScaleFactor: 1 });

for (const { name, ...props } of CASES) {
  test(`${name}: the unchecked checkbox edge clears 3:1 against each host in the painted pixels`, async ({ mount, page }) => {
    const component = await mount<typeof CheckboxHostsStory>(STORY, props);
    for (const host of CHECKBOX_HOSTS) {
      const wrapper = component.locator(`[data-host="${host}"]`);
      const box = component.getByRole("checkbox", { name: `Unchecked on ${host}`, exact: true });
      await expect(box).toBeVisible();
      await expect(box).not.toBeChecked();
      const bounds = await box.boundingBox();
      if (bounds === null) {
        throw new Error(`checkbox on ${host} has no box`);
      }
      const ground = await pixelSurface(page, wrapper, { region: { x0: 0, x1: 0.05, y0: 0, y1: 0.05 } });
      // The top edge is one pixel row, clear of the rounded corners. Layout snapping can seat it a row either side of
      // the box's fractional top, so the edge is the row of the three around it that stands furthest from the host.
      const rows = await Promise.all(
        [-1, 0, 1].map((offset) => pixelSurface(page, box, { region: { x0: 0.4, x1: 0.6, y0: offset / bounds.height, y1: (offset + 1) / bounds.height } })),
      );
      const edge = rows.reduce((best, row) => (wcagContrastRatio(row.rgb, ground.rgb) > wcagContrastRatio(best.rgb, ground.rgb) ? row : best));
      expect(wcagContrastRatio(edge.rgb, ground.rgb), `${host}: edge ${edge.describe} on ${ground.describe}`).toBeGreaterThanOrEqual(AA_NON_TEXT_RATIO);
    }
  });
}
