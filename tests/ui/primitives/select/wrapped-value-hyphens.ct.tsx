// @subject packages/ui/src/primitives/select/variants.ts
// A Select value that must break inside a word hyphenates it: the value's hyphens are auto, and at 200% text in a pane narrower than the word every
// line it breaks ends on one of the word's own hyphenation points.
import { lineStarts, SOFT_HYPHEN, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { WrappedSelectStory } from "./_wrapped-value-stories.tsx";

const STORY = "tests/ui/primitives/select/_wrapped-value-stories/WrappedSelectStory";
const PANE_WIDTH = 260;
const TEXT_200 = 2;
// One word wider than the pane at 200% text, with a break point between its syllables.
const LONG_WORD = ["Anti", "dis", "establish", "ment", "arian", "ism"].join(SOFT_HYPHEN);

test.use({ viewport: { width: 390, height: 844 } });

test("a word wider than the pane breaks at its hyphenation points, and the value's hyphens are auto", async ({ mount, page }) => {
  const component = await mount<typeof WrappedSelectStory>(STORY, { width: PANE_WIDTH, layout: "hug", long: LONG_WORD, short: "Ash" });
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  const value = component.locator('[data-slot="select-value"]').first();
  await expect(value).toBeVisible();
  await expect(value).toHaveCSS("hyphens", "auto");
  const starts = await value.evaluate(lineStarts);
  expect(starts.length).toBeGreaterThan(0);
  expect(starts.filter((start) => start.previous !== SOFT_HYPHEN)).toEqual([]);
});
