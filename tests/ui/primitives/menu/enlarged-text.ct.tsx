// A menu on a phone at the largest browser text: a long label wraps inside its row, a submenu trigger keeps its chevron inside the row,
// and the popup holds them without scrolling sideways.
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, setPlatformTextSize } from "@orb/testkit/browser/spec";
import type { Locator } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { LongLabelMenuStory } from "./_enlarged-stories.tsx";

const STORY = "tests/ui/primitives/menu/_enlarged-stories/LongLabelMenuStory";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

/** The lines the row's own text paints on: one rect per line box of its text node. */
function textLines(row: Locator): Promise<number> {
  return row.evaluate((node) => {
    const text = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
    if (text === undefined) {
      throw new Error("The row must hold its label as text");
    }
    const range = document.createRange();
    range.selectNodeContents(text);
    return range.getClientRects().length;
  });
}

test("a long menu label wraps in its row and a submenu trigger keeps its chevron inside the row, without the popup scrolling sideways", async ({
  mount,
  page,
}) => {
  await using _textSize = await setPlatformTextSize(page, PLATFORM_TEXT_SCALES[2]);
  await mount<typeof LongLabelMenuStory>(STORY);
  await page.getByRole("button", { name: "Long label commands", exact: true }).click();
  const popup = page.getByRole("menu");
  await expect(popup).toBeVisible();
  const command = popup.getByRole("menuitem", { name: "Regenerate the last reply with a different model", exact: true });
  const submenu = popup.getByRole("menuitem", { name: "Draft your line on behalf of another persona", exact: true });
  const chevron = submenu.locator('[data-slot="menu-submenu-chevron"]');
  await expect(chevron).toBeVisible();

  // The control: each label is longer than one line of the popup, so a row that does not wrap has something to overflow by.
  expect(await textLines(command)).toBeGreaterThan(1);
  expect(await textLines(submenu)).toBeGreaterThan(1);

  const extent = await popup.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth }));
  expect(extent.scroll).toBe(extent.client);

  const [row, mark, box] = await Promise.all([submenu.boundingBox(), chevron.boundingBox(), popup.boundingBox()]);
  expect((mark?.x ?? 0) + (mark?.width ?? 0)).toBeLessThanOrEqual((row?.x ?? 0) + (row?.width ?? 0) + LAYOUT_SUBPIXEL_PX);
  expect((row?.x ?? 0) + (row?.width ?? 0)).toBeLessThanOrEqual((box?.x ?? 0) + (box?.width ?? 0) + LAYOUT_SUBPIXEL_PX);
});
