import { LAYOUT_SUBPIXEL_PX } from "@orb/testkit/browser/spec";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { MessageListHeldUnderPlateStory, MessageListPinnedFailureStory } from "./_pinned-failure-stories.tsx";

const STORY = "tests/ui/primitives/message-list/_pinned-failure-stories/MessageListPinnedFailureStory";
const HELD_STORY = "tests/ui/primitives/message-list/_pinned-failure-stories/MessageListHeldUnderPlateStory";
const ROW = '[data-slot="message-list-row"]';
const PLATE = '[data-slot="message-list-leading-action"]';

const HELD_ROW = 20;
// Near enough to mount the row; the park places it exactly off its own box.
const ROW_ESTIMATE_PX = 120;
// Past a hold's settling frames.
const HOLD_FRAMES = 30;
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

/** How far below the port's top edge a row's head sits. */
async function headBelowPort(log: Locator, index: number): Promise<number> {
  return await log.evaluate(
    (node, [row, at]) => {
      const head = node.querySelector(`${row}[data-index="${at}"]`)?.getBoundingClientRect().top;
      if (head === undefined) {
        throw new Error(`row ${at} is not mounted`);
      }
      return head - node.getBoundingClientRect().top;
    },
    [ROW, String(index)] as const,
  );
}

/** Scrolls until row `index` starts `offsetPx` below the port's top, and waits for the list to read it there. */
async function parkRowAt(log: Locator, index: number, offsetPx: number): Promise<void> {
  await expect(log.locator(ROW).first()).toBeVisible();
  // Rows are virtual: walk toward the row until it mounts, then place it exactly.
  await log.evaluate(
    async (node, { row, at, offset, rowEstimate }) => {
      const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
      node.scrollTop = at * rowEstimate;
      await frame();
      await frame();
      const target = node.querySelector(`${row}[data-index="${String(at)}"]`);
      if (target === null) {
        throw new Error(`row ${String(at)} never mounted`);
      }
      node.scrollTop += target.getBoundingClientRect().top - node.getBoundingClientRect().top - offset;
      await frame();
      await frame();
    },
    { row: ROW, at: index, offset: offsetPx, rowEstimate: ROW_ESTIMATE_PX },
  );
  await expect(log.locator(`${ROW}[data-index="${String(index)}"]`)).toHaveAttribute("tabindex", "0");
}

/** The row's distance below the plate after the hold has had its settling frames. */
async function settledHead(page: Page, index: number): Promise<number> {
  await page.evaluate(async (count) => {
    for (let frame = 0; frame < count; frame += 1) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, HOLD_FRAMES);
  return await headBelowPlate(page, index);
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
          .toBeGreaterThanOrEqual(-LAYOUT_SUBPIXEL_PX);
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
          .toBeGreaterThanOrEqual(-LAYOUT_SUBPIXEL_PX);
      }
    });

    test("revealIndex lands the row's head below the plate", async ({ mount, page }) => {
      await mount<typeof MessageListPinnedFailureStory>(STORY);
      const log = page.getByRole("log", { name: "Pinned failure", exact: true });
      await expect(log.locator(ROW).first()).toBeVisible();
      await page.getByRole("button", { name: "Reveal row 12", exact: true }).click();
      await expect(log.locator(`${ROW}[data-index="12"]`)).toBeVisible();
      await expect.poll(async () => await headBelowPlate(page, 12), { message: "row 12 clears the plate" }).toBeGreaterThanOrEqual(-LAYOUT_SUBPIXEL_PX);
    });

    // The edge a hold keeps is the one the row was read at: `reading-row.ts` holds the ruling.
    test("a plate that pins from out of view lays over the reader's row and moves nothing, though its arrival starts a hold", async ({ mount, page }) => {
      await mount<typeof MessageListHeldUnderPlateStory>(HELD_STORY);
      const log = page.getByRole("log", { name: "Held under plate", exact: true });
      await parkRowAt(log, HELD_ROW, 0);
      const parked = await headBelowPort(log, HELD_ROW);
      await page.getByRole("button", { name: "Fail the press", exact: true }).click();
      await expect(page.locator(`${PLATE} [data-keep-in-view]`)).toBeVisible();
      await settledHead(page, HELD_ROW);
      expect(Math.abs((await headBelowPort(log, HELD_ROW)) - parked)).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      // The plate is over the row: the arrival had a cover to land the row below, and did not.
      expect(await headBelowPlate(page, HELD_ROW)).toBeLessThan(-LAYOUT_SUBPIXEL_PX);
    });

    test("a failure that arrives in a standing plate keeps the reader's row at the plate's growing edge", async ({ mount, page }) => {
      await mount<typeof MessageListHeldUnderPlateStory>(HELD_STORY, { standing: true });
      const log = page.getByRole("log", { name: "Held under plate", exact: true });
      await parkRowAt(log, HELD_ROW, await log.evaluate((node, plate) => node.querySelector(plate)?.getBoundingClientRect().height ?? Number.NaN, PLATE));
      const standing = page.locator(PLATE);
      const standingPx = (await standing.boundingBox())?.height ?? Number.NaN;
      await page.getByRole("button", { name: "Add a failure to the plate", exact: true }).click();
      await expect.poll(async () => (await standing.boundingBox())?.height ?? Number.NaN).toBeGreaterThan(standingPx);
      await expect
        .poll(async () => await settledHead(page, HELD_ROW), { message: "the held row settles at the plate's edge" })
        .toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      expect(await settledHead(page, HELD_ROW)).toBeGreaterThanOrEqual(-LAYOUT_SUBPIXEL_PX);
    });

    test("a hold under a standing plate keeps the row at the plate's edge, not the row beneath the plate", async ({ mount, page }) => {
      await mount<typeof MessageListHeldUnderPlateStory>(HELD_STORY, { standing: true });
      const log = page.getByRole("log", { name: "Held under plate", exact: true });
      await parkRowAt(log, HELD_ROW, await log.evaluate((node, plate) => node.querySelector(plate)?.getBoundingClientRect().height ?? Number.NaN, PLATE));
      await page.getByRole("button", { name: "Enlarge the text", exact: true }).click();
      await expect
        .poll(async () => await settledHead(page, HELD_ROW), { message: "the held row settles at the plate's edge" })
        .toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
      expect(await settledHead(page, HELD_ROW)).toBeGreaterThanOrEqual(-LAYOUT_SUBPIXEL_PX);
    });
  });
}
