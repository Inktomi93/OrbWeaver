// @subject packages/ui/src/primitives/text/variants.ts
// A heading set with the word-wrap axis hyphenates a word it must break: its hyphens are auto, and at 200% text in a pane narrower than the word
// every line it breaks ends on one of the word's own hyphenation points.
import { lineStarts, SOFT_HYPHEN, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@playwright/test";
import type { WrappedWordStory } from "./_wrapped-word-stories.tsx";

const STORY = "tests/ui/primitives/text/_wrapped-word-stories/WrappedWordStory";
const PANE_WIDTH = 340;
const TEXT_200 = 2;
// One word wider than the pane at 200% text, with a break point between its syllables.
const LONG_WORD = ["Anti", "dis", "establish", "ment", "arian", "ism"].join(SOFT_HYPHEN);

test.use({ viewport: { width: 390, height: 844 } });

test("a word wider than the pane breaks at its hyphenation points, and the heading's hyphens are auto", async ({ mount, page }) => {
  const component = await mount<typeof WrappedWordStory>(STORY, { width: PANE_WIDTH, word: LONG_WORD });
  await setRootFontScale(page, channelName("fontScale"), TEXT_200);
  const heading = component.getByRole("heading", { level: 2 });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveCSS("hyphens", "auto");
  const starts = await heading.evaluate(lineStarts);
  expect(starts.length).toBeGreaterThan(0);
  expect(starts.filter((start) => start.previous !== SOFT_HYPHEN)).toEqual([]);
});
