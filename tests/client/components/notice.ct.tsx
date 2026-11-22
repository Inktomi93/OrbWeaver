// @subject packages/client/src/components/notice.tsx
// The one notice keeps its parts in their places at every width and text size: the title and its detail wrap inside the box,
// the actions sit under the text and start where it starts, and the dismiss stays in the box's top corner. A notice that reports
// a failure is announced; one that does not is no alert.
import { PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { Locator } from "@playwright/test";
import { NOTICE_STORY } from "./_notice-labels.ts";
import type { NoticeStory } from "./_notice-stories.tsx";

const STORY = "tests/client/components/_notice-stories/NoticeStory";
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
      test(`at ${String(scale * 100)}% text the parts stay inside the box, the actions under the text and the dismiss in its corner`, async ({
        mount,
        page,
      }) => {
        await using _textSize = await setPlatformTextSize(page, scale);
        await mount<typeof NoticeStory>(STORY, { alert: false });
        const notice = page.getByTestId(NOTICE_STORY.testId);
        const title = notice.locator('[data-slot="notice-title"]');
        const actions = notice.locator('[data-slot="notice-actions"]');
        const dismiss = notice.getByRole("button", { name: NOTICE_STORY.dismissName, exact: true });
        await expect(notice.getByRole("button", { name: NOTICE_STORY.action, exact: true })).toBeVisible();
        await expect(dismiss).toBeVisible();

        const [frame, titleBox, actionsBox, dismissBox, lastDetail] = await Promise.all([
          box(notice),
          box(title),
          box(actions),
          box(dismiss),
          box(notice.getByText(NOTICE_STORY.detail[1], { exact: true })),
        ]);
        expect(frame.right).toBeLessThanOrEqual(width.viewport.width + EDGE_PX);
        expect(await notice.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
        expect(titleBox.right).toBeLessThanOrEqual(dismissBox.x + EDGE_PX);
        expect(actionsBox.y).toBeGreaterThanOrEqual(lastDetail.bottom - EDGE_PX);
        expect(Math.abs(actionsBox.x - titleBox.x)).toBeLessThanOrEqual(EDGE_PX);
        expect(dismissBox.right).toBeGreaterThan(actionsBox.right);
        expect(dismissBox.y).toBeLessThan(lastDetail.y);
        await expect(notice.getByRole("alert")).toHaveCount(0);
      });
    }
  });
}

test("a notice that reports a failure is announced with its title and detail", async ({ mount, page }) => {
  await mount<typeof NoticeStory>(STORY, { alert: true });
  const alert = page.getByTestId(NOTICE_STORY.testId).getByRole("alert");
  await expect(alert).toHaveCount(1);
  await expect(alert).toContainText(NOTICE_STORY.title);
  await expect(alert).toContainText(NOTICE_STORY.detail[0]);
});
