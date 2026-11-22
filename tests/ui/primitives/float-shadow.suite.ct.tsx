// @subject packages/ui/src/lib/popup-surface.ts
// Every anchored float casts the one float shadow (ui-surface-and-interaction-rules §2.1), read against a probe that paints
// the served `--shadow-overlay` recipe, in Hearth and every shipped seed, so a list popup that casts nothing fails here.

import { expect, test } from "@orb/testkit/ct-corpus";
import { SEED_SCOPES } from "@orb/testkit/iso";
import type { Page } from "@playwright/test";
import type { FloatShadowStory } from "./_float-shadow-stories.tsx";
import type { AnchoredFloat } from "./float-shadow-cases.ts";
import { ANCHORED_FLOATS, FLOAT_OPTIONS, FLOAT_POPUP_SLOTS } from "./float-shadow-cases.ts";

const STORY = "tests/ui/primitives/_float-shadow-stories/FloatShadowStory";

// The combobox seal exposes no open prop; typing the start of an option opens its suggestion list.
async function open(page: Page, float: AnchoredFloat): Promise<void> {
  if (float === "combobox") {
    await page.getByRole("combobox", { name: "Pick keywords", exact: true }).fill(FLOAT_OPTIONS[0].slice(0, 1));
  }
}

for (const scope of SEED_SCOPES) {
  for (const float of ANCHORED_FLOATS) {
    test(`${scope.name}: the ${float} popup casts the served float shadow`, async ({ mount, page }) => {
      const component = await mount<typeof FloatShadowStory>(STORY, { float });
      await page.evaluate(
        (theme) => {
          if (theme !== undefined) {
            document.documentElement.dataset["theme"] = theme;
          }
        },
        "theme" in scope ? scope.theme : undefined,
      );
      await open(page, float);
      const popup = page.locator(`[data-slot="${FLOAT_POPUP_SLOTS[float]}"]`);
      await expect(popup).toBeVisible();
      const probe = component.locator('[data-probe="float-shadow"]');
      const recipe = await probe.evaluate((element) => getComputedStyle(element).boxShadow);
      expect(recipe).not.toBe("none");
      // The utility composes Tailwind's ring and inset placeholders ahead of the recipe, so the recipe is the suffix.
      const cast = (): Promise<string> => popup.evaluate((element) => getComputedStyle(element).boxShadow);
      await expect.poll(async () => (await cast()).endsWith(recipe), `${float} box-shadow ends with ${recipe}`).toBe(true);
    });
  }
}
