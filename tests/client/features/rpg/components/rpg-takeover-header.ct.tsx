// CT: `<RpgTakeoverHeader>`'s when-line, at the header's own measured width on a 1440px docked panel
// (`RpgTakeoverHeaderWhenLongStory`, 400px). Mounted in isolation (a pure component — no providers/network),
// so the geometry is deterministically assertable without a live turn.

import { expect, test } from "@playwright/experimental-ct-react";
import { RpgTakeoverHeaderWhenLongStory } from "../_ct-stories.tsx";

test("a long narrated date beside a long clock+weather reading: the context half is not crushed to a stub", async ({ mount }) => {
  const component = await mount(<RpgTakeoverHeaderWhenLongStory />);
  const context = component.locator('[data-slot="rpg-band-when-context"]');
  const state = component.locator('[data-slot="rpg-band-when-state"]');
  await expect(context).toHaveText("14th of Emberfall, 3rd Age");
  await expect(state).toHaveText("night · 21:40 · steady rain on the shutters");
  // The datum is the text — an ellipsis-truncated node reports a narrower clientWidth than its own
  // scrollWidth. Neither half of the when-line may be silently eaten by the other's width.
  await expect.poll(() => context.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
});

for (const width of [320, 400]) {
  test(`readability: a long narrated date wraps above its state at ${width}px`, async ({ mount }) => {
    const date = "14th of Emberfall, in the Third Age of the Northern Crown";
    const component = await mount(<RpgTakeoverHeaderWhenLongStory width={width} calendarDate={date} />);
    const context = component.locator('[data-slot="rpg-band-when-context"]');
    const state = component.locator('[data-slot="rpg-band-when-state"]');
    await expect(context).toHaveText(date);
    await expect(context).toHaveCSS("-webkit-line-clamp", "2");
    await expect.poll(() => context.evaluate((el) => el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight))).toBeCloseTo(2, 1);
    await expect(state).toHaveText("night · 21:40 · steady rain on the shutters");
    await expect
      .poll(async () => {
        const dateBox = await context.boundingBox();
        const stateBox = await state.boundingBox();
        return dateBox !== null && stateBox !== null && stateBox.y >= dateBox.y + dateBox.height;
      })
      .toBe(true);
  });
}
