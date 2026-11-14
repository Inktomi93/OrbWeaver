// @subject packages/ui/src/primitives/select/variants.ts
// A Select shows its whole value: a value wider than the pane wraps between its words and the trigger grows from its control step, at the default
// text size and enlarged; a value that fits one line keeps the step's height.
import { resolvedLength, LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { WrappedSelectStory } from "./_wrapped-value-stories.tsx";

const STORY = "tests/ui/primitives/select/_wrapped-value-stories/WrappedSelectStory";
const PANE_WIDTH = 260;
const LONG_VALUE = "Same as my Image generation role, whichever connection that names";
const SHORT_VALUE = "Ash";
const LAYOUTS = ["field", "hug"] as const;
const TEXT_SCALES = [1, 2] as const;

test.use({ viewport: { width: 390, height: 844 } });

interface Reading {
  readonly height: number;
  readonly right: number;
  readonly valueWhole: boolean;
  readonly valueOverflow: string;
  readonly valueLines: number;
}

function reading(trigger: Locator): Promise<Reading> {
  return trigger.evaluate((node) => {
    const value = node.querySelector<HTMLElement>('[data-slot="select-value"]');
    if (value === null) {
      throw new Error("select trigger has no value");
    }
    const box = node.getBoundingClientRect();
    const own = getComputedStyle(value);
    return {
      height: box.height,
      right: box.right,
      valueWhole: value.scrollWidth <= value.clientWidth,
      valueOverflow: own.textOverflow,
      valueLines: Math.round(value.getBoundingClientRect().height / Number.parseFloat(own.lineHeight)),
    };
  });
}

for (const layout of LAYOUTS) {
  for (const scale of TEXT_SCALES) {
    test(`${layout}: a value wider than its pane wraps whole inside the trigger, which grows from its step, at ${scale * 100}% text`, async ({
      mount,
      page,
    }) => {
      const component = await mount<typeof WrappedSelectStory>(STORY, { width: PANE_WIDTH, layout, long: LONG_VALUE, short: SHORT_VALUE });
      await setRootFontScale(page, channelName("fontScale"), scale);
      const long = component.getByRole("combobox", { name: LONG_VALUE, exact: true });
      const short = component.getByRole("combobox", { name: SHORT_VALUE, exact: true });
      await expect(long).toBeVisible();
      const step = await resolvedLength(page, `var(${TOKENS["size.control-sm"].cssVar})`, long);
      const pane = await component.locator("[data-pane]").evaluate((node) => node.getBoundingClientRect().right);
      const wide = await reading(long);
      const narrow = await reading(short);
      expect(wide.valueWhole).toBe(true);
      expect(wide.valueOverflow).not.toBe("ellipsis");
      expect(wide.valueLines).toBeGreaterThan(1);
      expect(wide.height).toBeGreaterThan(step + SUBPIXEL);
      expect(wide.right).toBeLessThanOrEqual(pane + SUBPIXEL);
      expect(narrow.valueLines).toBe(1);
      expect(narrow.height).toBeCloseTo(step, 0);
    });
  }
}
