// The dropzone's hint wraps evenly: a hint that runs onto a second line never leaves a short tail of a word or two beneath
// a full line, at a desktop pane, a phone pane and a phone at enlarged text.
import { LAYOUT_SUBPIXEL_PX as SUBPIXEL, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { Locator } from "@playwright/test";
import type { WrappingHintStory } from "./_hint-balance-stories.tsx";

/** A hint that names two kinds of file, long enough to wrap in a zone a phone wide. */
const WRAPPING_HINT = "A .zip carries a whole library or SillyTavern profile; a .png / .json is a single card";
const STORY = "tests/ui/primitives/file-dropzone/_hint-balance-stories/WrappingHintStory";
/** The last line of an evenly wrapped hint is at least this share of its longest line. */
const SHORTEST_TAIL = 0.5;
const CASES = [
  { name: "a desktop pane", width: 480, scale: 1 },
  { name: "a phone pane", width: 320, scale: 1 },
  { name: "a phone pane at 200% text", width: 320, scale: 2 },
] as const;

async function lineWidths(caption: Locator): Promise<readonly number[]> {
  return await caption.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const lines = new Map<number, { left: number; right: number }>();
    for (const rect of range.getClientRects()) {
      const key = Math.round(rect.top);
      const held = lines.get(key);
      lines.set(key, {
        left: Math.min(held?.left ?? Number.POSITIVE_INFINITY, rect.left),
        right: Math.max(held?.right ?? Number.NEGATIVE_INFINITY, rect.right),
      });
    }
    return [...lines.values()].map((line) => line.right - line.left);
  });
}

for (const pane of CASES) {
  test(`the hint wraps evenly in ${pane.name}`, async ({ mount, page }) => {
    await page.setViewportSize({ width: Math.max(pane.width, 390), height: 844 });
    const component = await mount<typeof WrappingHintStory>(STORY, { width: pane.width, hint: WRAPPING_HINT });
    await setRootFontScale(page, channelName("fontScale"), pane.scale);
    const widths = await lineWidths(component.getByText(WRAPPING_HINT, { exact: true }));
    // The positive control: the hint did wrap, so there is a tail to judge.
    expect(widths.length).toBeGreaterThan(1);
    const tail = widths.at(-1) ?? 0;
    expect(tail).toBeGreaterThanOrEqual(Math.max(...widths) * SHORTEST_TAIL - SUBPIXEL);
  });
}
