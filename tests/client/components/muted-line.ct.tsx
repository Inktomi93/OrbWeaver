// @subject packages/client/src/components/muted-line.tsx
// The muted line of a list keeps its sentence and its action inside the width at every text size: the action wraps under the
// sentence rather than pushing past the edge, and it fires its own callback. A filter miss is announced; a plain empty line is not.
import { PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { MUTED_LINE_STORY } from "./_muted-line-labels.ts";
import type { MutedLineStory } from "./_muted-line-stories.tsx";

const STORY = "tests/client/components/_muted-line-stories/MutedLineStory";
// A sub-pixel tolerance for edges that meet: layout rounds each box on its own.
const EDGE_PX = 1;

const WIDTHS = [
  { name: "phone", viewport: { width: 360, height: 800 } },
  { name: "desktop", viewport: { width: 1280, height: 900 } },
] as const;

async function box(locator: Locator): Promise<{ readonly x: number; readonly y: number; readonly right: number; readonly bottom: number }> {
  const rect = await locator.boundingBox();
  if (rect === null) {
    throw new Error("The part is not rendered");
  }
  return { x: rect.x, y: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height };
}

for (const width of WIDTHS) {
  test.describe(`at ${width.name} width`, () => {
    test.use({ viewport: width.viewport });

    for (const scale of PLATFORM_TEXT_SCALES) {
      test(`at ${String(scale * 100)}% text the sentence and its action stay inside the line, and the action fires`, async ({ mount, page }) => {
        await using _textSize = await setPlatformTextSize(page, scale);
        await mount<typeof MutedLineStory>(STORY, { announce: false });
        const line = page.getByTestId(MUTED_LINE_STORY.testId);
        const action = line.getByRole("button", { name: MUTED_LINE_STORY.action, exact: true });
        const [frame, sentence, actionBox] = await Promise.all([box(line), box(line.getByText(MUTED_LINE_STORY.line, { exact: true })), box(action)]);
        for (const part of [sentence, actionBox]) {
          expect(part.x).toBeGreaterThanOrEqual(frame.x - EDGE_PX);
          expect(part.right).toBeLessThanOrEqual(frame.right + EDGE_PX);
        }
        expect(frame.right).toBeLessThanOrEqual(width.viewport.width + EDGE_PX);
        expect(await line.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
        await expect(page.getByRole("status")).toHaveCount(0);
        await action.click();
        await expect(line).toHaveAttribute("data-presses", "1");
      });
    }
  });
}

test("a filter miss is announced with its sentence, and its action stays operable inside the announced line", async ({ mount, page }) => {
  await mount<typeof MutedLineStory>(STORY, { announce: true });
  const status = page.getByRole("status");
  await expect(status).toHaveCount(1);
  await expect(status).toContainText(MUTED_LINE_STORY.line);
  await expect(status.getByRole("button", { name: MUTED_LINE_STORY.action, exact: true })).toBeVisible();
});
