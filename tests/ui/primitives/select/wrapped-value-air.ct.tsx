// @subject packages/ui/src/primitives/select/variants.ts
// A Select value that wraps keeps the same air against the trigger's top and bottom edges as a value on one line, and a value on one line lands exactly
// on its control step.
import { resolvedLength, LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { WrappedSelectStory } from "./_wrapped-value-stories.tsx";

const STORY = "tests/ui/primitives/select/_wrapped-value-stories/WrappedSelectStory";
const PHONE_WIDTH = 390;
const TEXT_200 = 2;
const LONG_VALUE = "Same as my Image generation role, whichever connection that names";
const SHORT_VALUE = "Ash";

test.use({ viewport: { width: PHONE_WIDTH, height: 844 } });

interface Air {
  readonly height: number;
  /** The gap from the value's first line to the trigger's inner top edge, and from its last line to the inner bottom edge. */
  readonly above: number;
  readonly below: number;
  readonly lines: number;
}

function air(trigger: Locator): Promise<Air> {
  return trigger.evaluate((node) => {
    const value = node.querySelector<HTMLElement>('[data-slot="select-value"]');
    if (value === null) {
      throw new Error("select trigger has no value");
    }
    const own = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    const text = value.getBoundingClientRect();
    return {
      height: box.height,
      above: text.top - box.top - Number.parseFloat(own.borderTopWidth),
      below: box.bottom - Number.parseFloat(own.borderBottomWidth) - text.bottom,
      lines: Math.round(text.height / Number.parseFloat(getComputedStyle(value).lineHeight)),
    };
  });
}

test("a wrapped value keeps the air of a one-line value, and the one-line value lands exactly on its step, at 200% text on a phone", async ({
  mount,
  page,
}) => {
  const component = await mount<typeof WrappedSelectStory>(STORY, { width: PHONE_WIDTH, layout: "hug", long: LONG_VALUE, short: SHORT_VALUE });
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  const long = component.getByRole("combobox", { name: LONG_VALUE, exact: true });
  const short = component.getByRole("combobox", { name: SHORT_VALUE, exact: true });
  await expect(long).toBeVisible();
  const step = await resolvedLength(page, `var(${TOKENS["size.control-sm"].cssVar})`, long);
  const wrapped = await air(long);
  const single = await air(short);
  expect(wrapped.lines).toBeGreaterThan(1);
  expect(single.lines).toBe(1);
  expect(single.height).toBeCloseTo(step, 0);
  // The premise: a one-line value has air at all, so the comparison is not two zeros.
  expect(single.above).toBeGreaterThan(SUBPIXEL);
  expect(Math.abs(wrapped.above - single.above)).toBeLessThanOrEqual(SUBPIXEL);
  expect(Math.abs(wrapped.below - single.below)).toBeLessThanOrEqual(SUBPIXEL);
});
