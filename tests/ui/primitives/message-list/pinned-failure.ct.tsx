import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MessageListPinnedFailureStory } from "./_pinned-failure-stories.tsx";

const STORY = "tests/ui/primitives/message-list/_pinned-failure-stories/MessageListPinnedFailureStory";
const ROW = '[data-slot="message-list-row"]';
const PLATE = '[data-slot="message-list-leading-action"]';
const EPSILON_PX = 1;
const VIEWPORTS = [
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
  { name: "desktop", viewport: { width: 1280, height: 900 }, touch: false },
] as const;

/** How far below the pinned plate's bottom edge a row's head sits; negative while the plate covers it. */
async function headBelowPlate(page: Page, index: number): Promise<number> {
  return await page.evaluate(
    ([row, plate, at]) => {
      const head = document.querySelector(`${row}[data-index="${at}"]`)?.getBoundingClientRect().top;
      const pinned = document.querySelector(plate)?.getBoundingClientRect().bottom;
      if (head === undefined || pinned === undefined) {
        throw new Error(`row ${at} or the pinned plate is not on the page`);
      }
      return head - pinned;
    },
    [ROW, PLATE, String(index)] as const,
  );
}

for (const { name, viewport, touch } of VIEWPORTS) {
  test.describe(`a pinned failure over the transcript on ${name}`, () => {
    test.use({ viewport, hasTouch: touch, isMobile: touch });

    test("a keyboard walk lands each row's head below the plate, tall rows included", async ({ mount, page }) => {
      await mount<typeof MessageListPinnedFailureStory>(STORY);
      const log = page.getByRole("log", { name: "Pinned failure", exact: true });
      await expect(log.locator(ROW).first()).toBeVisible();
      await page.getByRole("button", { name: "Reveal row 12", exact: true }).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("End");
      // Up the transcript from the tail through the tall row, so rows land at the top edge and a tall one at its start.
      for (let step = 0; step < 36; step += 1) {
        await page.keyboard.press("ArrowUp");
        const focused = log.locator(`${ROW}:focus`);
        await expect(focused).toBeFocused();
        const index = Number(await focused.getAttribute("data-index"));
        await expect
          .poll(async () => await headBelowPlate(page, index), { message: `row ${String(index)} clears the plate` })
          .toBeGreaterThanOrEqual(-EPSILON_PX);
      }
    });

    test("a keyboard walk down lands each row's head below the plate, a row that fits the port but not the room under the plate included", async ({
      mount,
      page,
    }) => {
      await mount<typeof MessageListPinnedFailureStory>(STORY);
      const log = page.getByRole("log", { name: "Pinned failure", exact: true });
      await expect(log.locator(ROW).first()).toBeVisible();
      await page.getByRole("button", { name: "Reveal row 12", exact: true }).focus();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Home");
      for (let step = 0; step < 14; step += 1) {
        await page.keyboard.press("ArrowDown");
        const focused = log.locator(`${ROW}:focus`);
        await expect(focused).toBeFocused();
        const index = Number(await focused.getAttribute("data-index"));
        await expect
          .poll(async () => await headBelowPlate(page, index), { message: `row ${String(index)} clears the plate` })
          .toBeGreaterThanOrEqual(-EPSILON_PX);
      }
    });

    test("revealIndex lands the row's head below the plate", async ({ mount, page }) => {
      await mount<typeof MessageListPinnedFailureStory>(STORY);
      const log = page.getByRole("log", { name: "Pinned failure", exact: true });
      await expect(log.locator(ROW).first()).toBeVisible();
      await page.getByRole("button", { name: "Reveal row 12", exact: true }).click();
      await expect(log.locator(`${ROW}[data-index="12"]`)).toBeVisible();
      await expect.poll(async () => await headBelowPlate(page, 12), { message: "row 12 clears the plate" }).toBeGreaterThanOrEqual(-EPSILON_PX);
    });
  });
}
